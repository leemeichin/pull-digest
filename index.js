const botBuilder = require('claudia-bot-builder')
const slackTemplate = botBuilder.slackTemplate

const githubClient = require('github-graphql-client')
const flatMap = require('lodash.flatmap')
const map = require('lodash.map')
const filter = require('lodash.filter')
const each = require('lodash.foreach')

const makeGithubRequest = req =>
  new Promise((resolve, reject) =>
    githubClient(req, (err, res) => (err ? reject(err) : resolve(res)))
  )

const title =
  ':mag_right: :mag_right: :mag_right: *PR DIGEST* :mag: :mag: :mag:\n\n'

const {
  GITHUB_TOKEN: token,
  GITHUB_ORG: owner,
  GITHUB_REPOS: repos,
  PR_SORT_BY: sort = 'updated',
  PR_SORT_DIRECTION: direction = 'desc',
  PR_STATE: state = 'open'
} = process.env

const getDataFromNodes = results =>
  flatMap(results, 'data.repository.pullRequests.nodes')

const filterPrsWithLabel = filterLabel => prs =>
  filterLabel
    ? filter(prs, pr =>
        map(pr.labels.nodes, label => label.name.toLowerCase()).includes(
          filterLabel
        )
      )
    : prs

const transformData = prs =>
  map(prs, pr => ({
    title: pr.title,
    url: pr.url,
    author: pr.author.login,
    labels: map(
      pr.labels.nodes,
      label => `:${label.name.toLowerCase().replace(/ /g, '_')}:`
    ),
    assignees: map(pr.assignees.nodes, 'name'),
    status: pr.commits.nodes.commit.status.state,
    mergeable: pr.mergeable
  }))

const renderAttachment = message => pr => {
  message.addAttachment().addTitle(pr.title).addAuthor(pr.author)

  if (pr.labels) {
    message.addColor(pr.labels[0].color)
  }

  return message
}

const renderMessage = owner => prs => {
  let message = new slackTemplate(`Recently in ${owner}...`)

  message.channelMessage(true)

  each(prs, pr => (message = renderAttachment(message)(pr)))

  console.log(prs, message)
  return message.get()
}

const query = (owner, name) => `{
  repository(owner: "${owner}", name: "${name}") {
    pullRequests(first: 10, states: [OPEN]) {
      nodes {
        title
        url
        mergeable

        author {
          login
        }

        labels(first: 3) {
          nodes {
            name
            color
          }
        }

        assignees(first: 5) {
          nodes {
            name
          }
        }

      	commits(last: 1) {
          nodes {
          	commit {
              status {
                state
              }
            }
          }
        }
      }
    }
  }
}`

module.exports = botBuilder((req, _ctx) =>
  Promise.all(
    map(repos.split(' '), repo =>
      makeGithubRequest({ token, query: query(owner, repo) })
    )
  )
    .then(getDataFromNodes)
    .then(filterPrsWithLabel(req.text.toLowerCase()))
    .then(transformData)
    .then(renderMessage(owner))
)

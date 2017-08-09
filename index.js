const botBuilder = require('claudia-bot-builder')
const slackTemplate = botBuilder.slackTemplate

const githubClient = require('github-graphql-client')
const groupBy = require('lodash.groupby')
const flatMap = require('lodash.flatmap')
const map = require('lodash.map')
const filter = require('lodash.filter')

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

const transformLabels = ({ status, labels }) => ({
  status,
  labels: map(
    labels,
    label => `:${label.name.toLowerCase().replace(/ /g, '_')}:`
  )
})

const renderLine = (pr, filter) => ({ status, labels }) =>
  filter &&
  (labels.length == 0 || labels.every(label => `:${filter}:` !== label))
    ? null
    : `<${pr.html_url}|${pr.title}> ${labels.join(' ')} (build: ${status})`

const buildDigest = filter => prGroups =>
  Promise.all(
    flatMap(prGroups, (prs, repo) => {
      const groupTitle = `:bell:\t*${repo} (<https://github.com/${owner}/${repo}|${owner}/${repo}>)*\n--------`

      const details = map(prs, pr =>
        Promise.all([
          gh.issues.getIssueLabels({ owner, repo, number: pr.number }),
          gh.repos.getCombinedStatus({ owner, repo, ref: pr.head.sha })
        ])
          .then(getLabelsAndStatuses)
          .then(transformLabels)
          .then(renderLine(pr, filter))
      )

      return [Promise.resolve(groupTitle), ...details, Promise.resolve('\n')]
    })
  )

const renderTemplate = title => digest =>
  new slackTemplate([title, ...digest].filter(line => line).join('\n'))
    .channelMessage(true)
    .get()

const getDataFromNodes = results => results.data.repository.pullRequests.nodes

const filterPrsWithLabel = filterLabel => prs =>
  filter
    ? filter(prs, pr =>
        map(pr.labels.nodes, label => label.name.toLowerCase()).includes(
          filterLabel
        )
      )
    : prs

const transformData = prs => map(prs, pr => (
  title: pr.title,
  url: pr.url,
  labels: map(pr.labels.nodes, label => `:${label.toLowerCase().replace(/ /g, '_')}:`),
  assignees: map(pr.assignees.nodes, 'name'),
  status: pr.commits.nodes.commit.status.state
})

const query = `{
  repository(owner: "${owner}", name: "${name}") {
    pullRequests(first: 30, states: [OPEN]) {
      nodes {
        title
        url

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

module.exports = botBuilder((req, _ctx) => {
  const filterLabel = req.text.toLowerCase()

  makeGithubRequest({ token, query })
    .then(getDataFromNodes)
    .then(filterPrsWithLabel(filterLabel))
    .then(transformData)
    .then(groupPrsByRepo)
    .then(renderTemplate)
})

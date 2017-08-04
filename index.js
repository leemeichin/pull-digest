const botBuilder = require('claudia-bot-builder')
const slackTemplate = botBuilder.slackTemplate

const GithubApi = require('github')
const groupBy = require('lodash.groupby')
const flatMap = require('lodash.flatmap')
const map = require('lodash.map')

const title =
  ':party_parrot: :party_parrot: :party_parrot: *PR DIGEST* :party_parrot: :party_parrot: :party_parrot:\n\n'

const {
  GITHUB_TOKEN: token,
  GITHUB_ORG: owner,
  GITHUB_REPOS: repos,
  PR_SORT_BY: sort = 'updated',
  PR_SORT_DIRECTION: direction = 'desc',
  PR_STATE: state = 'open'
} = process.env

const gh = new GithubApi({
  headers: {
    'User-Agent': 'leemachin/pull-digest'
  }
})

const getIssuesAndStatuses = ([{ data: issues }, { data: statuses }]) => ({
  issues,
  statuses
})

const getCombinedStatusAndFilterIssues = filter => ({ issues, statuses }) => ({
  status: statuses.state,
  labels: filter
    ? issues.filter(label => label.name && label.name.toLowerCase() === filter)
    : issues
})

const transformLabels = ({ status, labels }) => ({
  status,
  labels: map(labels, label => `[${label.name}]`)
})

const renderLine = pr => ({ status, labels }) =>
  `<${pr.html_url}|${pr.title}> ${labels.join(', ')} (build: ${status})`

const buildDigest = filter => prGroups =>
  Promise.all(
    flatMap(prGroups, (prs, repo) => {
      const groupTitle = `:bell:\t*${repo} (<https://github.com/${owner}/${repo}|${owner}/${repo}>)*\n--------`

      const details = map(prs, pr =>
        Promise.all([
          gh.issues.getIssueLabels({ owner, repo, number: pr.number }),
          gh.repos.getCombinedStatus({ owner, repo, ref: pr.head.sha })
        ])
          .then(getIssuesAndStatuses)
          .then(getCombinedStatusAndFilterIssues(filter))
          .then(transformLabels)
          .then(renderLine(pr))
      )

      return [Promise.resolve(groupTitle), ...details, Promise.resolve('\n')]
    })
  )

const renderTemplate = digest =>
  new slackTemplate([title, ...digest].join('\n')).channelMessage(true).get()

module.exports = botBuilder((req, _ctx) => {
  gh.authenticate({ type: 'token', token })

  const filter = req.text.toLowerCase()

  return Promise.all(
    map(repos.split(' '), repo =>
      gh.pullRequests.getAll({ owner, repo, state, sort, direction })
    )
  )
    .then(results => flatMap(results, 'data'))
    .then(prs => groupBy(prs, pr => pr.head.repo.name))
    .then(buildDigest(filter))
    .then(renderTemplate)
})

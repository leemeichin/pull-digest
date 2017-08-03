const botBuilder = require('claudia-bot-builder')
const slackTemplate = botBuilder.slackTemplate

const GithubApi = require('github')
const groupBy = require('lodash.groupby')
const flatMap = require('lodash.flatmap')
const map = require('lodash.map')

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

const buildDigest = prGroups =>
  Promise.all(
    flatMap(prGroups, (prs, repo) => {
      const groupTitle = `:bell:\t*${repo} (<https://github.com/${owner}/${repo}|${owner}/${repo}>)*\n--------`

      const details = map(prs, pr =>
        gh.issues
          .getIssueLabels({ owner, repo, number: pr.number })
          .then(res => res.data)
          .then(labels => map(labels, label => `[${label.name}]`))
          .then(labels => `<${pr.html_url}|${pr.title}> ${labels.join(', ')}`)
      )

      return [Promise.resolve(groupTitle), ...details, Promise.resolve('\n')]
    })
  )

const renderTemplate = (title, digest) =>
  new slackTemplate([title, ...digest].join('\n')).channelMessage(true).get()

module.exports = botBuilder((req, ctx) => {
  gh.authenticate({ type: 'token', token })

  const title =
    ':party_parrot: :party_parrot: :party_parrot: *PR DIGEST* :party_parrot: :party_parrot: :party_parrot:\n\n'

  return Promise.all(
    map(repos.split(' '), repo =>
      gh.pullRequests.getAll({ owner, repo, state, sort, direction })
    )
  )
    .then(results => flatMap(results, 'data'))
    .then(prs => groupBy(prs, pr => pr.head.repo.name))
    .then(prs => buildDigest(prs))
    .then(digest => renderTemplate(title, digest))
})

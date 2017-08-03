const botBuilder = require('claudia-bot-builder')
const slackTemplate = botBuilder.slackTemplate

const GithubApi = require('github')
const groupby = require('lodash.groupby')
const flatMap = require('lodash.flatMap')

const {
  GITHUB_TOKEN: token,
  GITHUB_ORG: owner,
  GITHUB_REPOS: repos
} = process.env

const gh = new GithubApi({
  headers: {
    'User-Agent': 'leemachin/pull-digest'
  }
})

const buildDigest = prs =>
  flatMap(groupedPrs, (prs, repo) => {
    const groupTitle = `---*--- *<https://github.com/${org}/${repo}|${repo}>}* ---*---`

    const details = prs.map(pr =>
      gh.issues
        .get({ owner, issue, number: pr.id })
        .then(issue => issue.labels.map(label => label.name))
        .then(labels => `<${pr.html_url}|${pr.title}> (${labels.join(', ')})`)
    )

    return Promise.all([Promise.resolve(groupTitle), ...details])
  })

const renderTemplate = (title, digest) =>
  new slackTemplate([title, ...digest].join('\n')).channelMessage(true).get()

module.exports = botBuilder((req, ctx) => {
  gh.authenticate({ type: 'token', token })

  const title =
    ':party_parrot: :party_parrot: :party_parrot: *PR DIGEST* :party_parrot: :party_parrot: :party_parrot'

  const allPrs = Promise.all(
    repos.split(' ').map(repo =>
      gh.pullRequests.getAll({
        owner,
        repo,
        state: 'open',
        sort: 'updated'
      })
    )
  )
    .then(prs => groupBy(prs, pr => pr.repo.name))
    .then(prs => buildDigest(prs))
    .then(digest => renderTemplate(title, digest))
})

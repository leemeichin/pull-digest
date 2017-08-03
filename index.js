import 'babel-polyfill'
import botBuilder, { slackTemplate } from 'claudia-bot-builder'
import GitHubApi from 'github'
import groupby from 'lodash.groupby'
import flatMap from 'lodash.flatMap'

const {
  GITHUB_TOKEN: token,
  GITHUB_ORG: owner,
  GITHUB_REPOS: repos
} = process.env

const gh = new GitHubApi({
  headers: {
    'User-Agent': 'leemachin/pull-digest'
  }
})

module.exports = botBuilder(async (req, ctx) => {
  gh.authenticate({ type: 'token', token })

  const allPrs = await Promise.all(
    repos.split(' ').map(
      async repo =>
        await gh.pullRequests.getAll({
          owner,
          repo,
          state: 'open',
          sort: 'updated'
        })
    )
  )

  const groupedPrs = groupBy(allPrs, pr => pr.repo.name)

  const title =
    ':party_parrot: :party_parrot: :party_parrot: *PR DIGEST* :party_parrot: :party_parrot: :party_parrot'

  const digest = flatMap(groupedPrs, (prs, repo) => {
    const groupTitle = `---*--- *<https://github.com/${org}/${repo}|${repo}>}* ---*---`

    const details = prs.map(async pr => {
      const issue = await gh.issues.get({ owner, issue, number: pr.id })
      const labels = issue.labels.map(label => label.name)

      return `<${pr.html_url}|${pr.title}> (${labels.join(', ')})`
    })

    return [groupTitle, ...details]
  })

  return new slackTemplate([title, ...digest].join('\n'))
    .channelMessage(true)
    .get()
})

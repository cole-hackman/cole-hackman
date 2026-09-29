// Generates activity.svg: my last year of GitHub contributions as a dot grid,
// colored with the sunset from my profile photo.
//
// Run with `GITHUB_TOKEN=$(gh auth token) node build-activity.mjs` (Node 18+,
// no dependencies). The daily GitHub Action runs it with the workflow token.

import { writeFileSync } from 'node:fs'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const USER = 'cole-hackman'

const CELL = 11 // grid pitch
const RADIUS = 4.2
const GRID_TOP = 30
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"

// Empty day, then four intensity levels: pale gold to deep orange in light
// mode, embers to bright gold in dark mode.
const LIGHT = ['#eaeef2', '#fde3b5', '#f8b55f', '#ee7f2d', '#c4471b']
const DARK = ['#1f242c', '#5a3a1e', '#a4591f', '#e5822c', '#ffc36b']

const level = (n) => (n === 0 ? 0 : n < 3 ? 1 : n < 8 ? 2 : n < 20 ? 3 : 4)

// ---------------------------------------------------------------------------
// Data (GitHub GraphQL)
// ---------------------------------------------------------------------------

// Languages come from public repos only, so local runs match the Action.
const QUERY = `{
  user(login: "${USER}") {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { contributionCount date weekday } }
      }
    }
    repositories(ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false, first: 100) {
      nodes { languages(first: 10) { edges { size node { name } } } }
    }
  }
}`

async function getActivity() {
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('GITHUB_TOKEN is not set')
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY }),
  })
  if (!res.ok) throw new Error(`GitHub GraphQL returned ${res.status}`)
  const json = await res.json()
  if (json.errors) throw new Error(json.errors.map((e) => e.message).join('; '))

  const { contributionsCollection, repositories } = json.data.user
  const { totalContributions, weeks } = contributionsCollection.contributionCalendar
  const days = weeks.flatMap((w) => w.contributionDays)

  let bestStreak = 0
  let streak = 0
  for (const d of days) {
    streak = d.contributionCount ? streak + 1 : 0
    bestStreak = Math.max(bestStreak, streak)
  }

  const bytes = {}
  for (const repo of repositories.nodes)
    for (const { size, node } of repo.languages.edges) bytes[node.name] = (bytes[node.name] ?? 0) + size
  const topLanguage = Object.entries(bytes).sort((a, b) => b[1] - a[1])[0]?.[0]

  return {
    weeks,
    total: totalContributions,
    activeDays: days.filter((d) => d.contributionCount).length,
    bestStreak,
    topLanguage,
  }
}

// ---------------------------------------------------------------------------
// SVG rendering
// ---------------------------------------------------------------------------

const escapeXml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function monthLabels(weeks) {
  const seen = new Set()
  return weeks
    .map((w, i) => {
      const date = new Date(`${w.contributionDays[0].date}T00:00:00Z`)
      const month = date.getUTCMonth()
      // Label the first week that starts in a month, but not at the very end
      // where the label would run off the grid.
      if (date.getUTCDate() > 7 || seen.has(month) || i >= weeks.length - 2) return ''
      seen.add(month)
      const name = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
      return `<text x="${i * CELL}" y="20" class="month">${name}</text>`
    })
    .join('')
}

function render({ weeks, total, activeDays, bestStreak, topLanguage }) {
  const width = weeks.length * CELL
  const captionY = GRID_TOP + 7 * CELL + 30
  const height = captionY + 10

  const dots = weeks
    .flatMap((w, i) =>
      w.contributionDays.map(
        (d) =>
          `<circle cx="${i * CELL + 5}" cy="${GRID_TOP + d.weekday * CELL + 5}" r="${RADIUS}" class="l${level(d.contributionCount)}"/>`
      )
    )
    .join('\n  ')

  const value = (v) => `<tspan class="value">${escapeXml(String(v))}</tspan>`
  const caption = [
    `${value(total.toLocaleString('en-US'))} contributions`,
    `${value(activeDays)} active days`,
    `${value(bestStreak)}-day best streak`,
    ...(topLanguage ? [`mostly ${value(topLanguage)}`] : []),
  ].join('  ·  ')
  const summary = `${total.toLocaleString('en-US')} contributions in the last year, ${activeDays} active days, ${bestStreak}-day best streak${topLanguage ? `, mostly ${topLanguage}` : ''}`

  const levelCss = (colors) => colors.map((c, i) => `.l${i} { fill: ${c}; }`).join(' ')

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(summary)}">
  <title>${escapeXml(summary)}</title>
  <style>
    text { font-family: ${FONT}; fill: #59636e; }
    .month { font-size: 11px; }
    .caption { font-size: 13px; }
    .value { fill: #1f2328; font-weight: 600; }
    ${levelCss(LIGHT)}

    @media (prefers-color-scheme: dark) {
      text { fill: #9198a1; }
      .value { fill: #f0f6fc; }
      ${levelCss(DARK)}
    }
  </style>
  ${monthLabels(weeks)}
  ${dots}
  <text x="0" y="${captionY}" class="caption">${caption}</text>
</svg>
`
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const activity = await getActivity()
console.log('Activity:', { ...activity, weeks: activity.weeks.length })
writeFileSync('activity.svg', render(activity))
console.log('Wrote activity.svg')

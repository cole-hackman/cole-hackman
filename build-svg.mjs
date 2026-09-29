// Generates chat.svg: an animated, iMessage-style intro for my GitHub profile.
// Inspired by https://github.com/jasonlong/jasonlong
//
// Run with `node build-svg.mjs` (Node 18+, no dependencies).
// A GitHub Action re-runs this daily so the weather and weekday stay fresh.

import { writeFileSync } from 'node:fs'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PLACES = {
  slo: { name: 'San Luis Obispo', lat: 35.2828, lon: -120.6596, tz: 'America/Los_Angeles' },
  seattle: { name: 'Seattle', lat: 47.6062, lon: -122.3321, tz: 'America/Los_Angeles' },
}

// Each message is one paragraph; `{placeholders}` are filled in below and long
// lines are wrapped automatically. Messages with `weather: true` are skipped if
// the weather API can't be reached.
const MESSAGES = [
  { text: 'Hi, I’m Cole 👋' },
  { text: 'I’m a computer science student at Cal Poly SLO, concentrating in AI and machine learning.' },
  { text: 'I’m based in San Luis Obispo, where it’s supposed to be {slo.degF}°F ({slo.degC}°C) and {slo.emoji} today.', weather: true },
  { text: '{seattleLine}', weather: true },
  { text: 'I like building software that pairs technical depth with real-world impact. My projects are below 👇' },
  { text: 'Have a great {weekday}! ✌️' },
]

// ---------------------------------------------------------------------------
// Weather (Open-Meteo, free, no API key)
// ---------------------------------------------------------------------------

// WMO weather codes -> emoji
const WEATHER_EMOJI = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️', 45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️', 56: '🌧️', 57: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️', 66: '🌧️', 67: '🌧️',
  71: '🌨️', 73: '🌨️', 75: '❄️', 77: '🌨️',
  80: '🌦️', 81: '🌧️', 82: '🌧️', 85: '🌨️', 86: '❄️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
}

const RAINY_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99])

async function getWeather({ lat, lon }) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&daily=temperature_2m_max,weather_code&temperature_unit=fahrenheit&timezone=auto&forecast_days=1'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`)
  const json = await res.json()
  const degF = Math.round(json.daily.temperature_2m_max[0])
  return {
    degF,
    degC: Math.round(((degF - 32) * 5) / 9),
    emoji: WEATHER_EMOJI[json.daily.weather_code[0]] ?? '🌡️',
    rainy: RAINY_CODES.has(json.daily.weather_code[0]),
  }
}

// The Seattle message changes depending on how it compares to SLO today.
function seattleLine(slo, seattle) {
  const temp = `${seattle.degF}°F (${seattle.degC}°C)`
  const diff = slo.degF - seattle.degF
  if (diff <= -5)
    return `Meanwhile Seattle is somehow warmer at ${temp} and ${seattle.emoji}. Maybe I should’ve stayed 🤔`
  if (diff < 5)
    return `Back home in Seattle it’s ${temp} and ${seattle.emoji}, so it’s basically a tie today 🤝`
  if (seattle.rainy)
    return `Back home in Seattle it’s ${temp} and ${seattle.emoji}. Shocking, I know ☔`
  if (diff >= 15)
    return `Back home in Seattle it’s only ${temp} and ${seattle.emoji}. Not missing it too much 😎`
  return `Back home in Seattle it’s ${temp} and ${seattle.emoji}, so SLO wins this round ☀️`
}

// ---------------------------------------------------------------------------
// Text measurement + wrapping
// ---------------------------------------------------------------------------

const FONT_SIZE = 16
const LINE_HEIGHT = 22
const PAD_X = 14
const PAD_Y = 10
const MAX_TEXT_WIDTH = 440
const GAP = 8
const WIDTH = 520

// Approximate Helvetica/Arial advance widths (1/1000 em). Close enough to the
// system UI fonts GitHub will render with; bubbles get a little extra slack.
const CHAR_WIDTHS = {
  ' ': 278, '!': 278, "'": 191, '’': 222, '(': 333, ')': 333, ',': 278, '-': 333,
  '.': 278, '/': 278, ':': 278, '?': 556, '°': 400, '&': 667, '@': 1015,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
}

const isEmoji = (ch) => /\p{Extended_Pictographic}/u.test(ch)

function measure(text) {
  let units = 0
  for (const ch of text) {
    if (ch === '️' || ch === '‍') continue
    units += isEmoji(ch) ? 1250 : CHAR_WIDTHS[ch] ?? 556
  }
  return (units / 1000) * FONT_SIZE * 1.05
}

function wrap(paragraph) {
  const lines = []
  let line = ''
  for (const word of paragraph.split(' ')) {
    const candidate = line ? `${line} ${word}` : word
    if (line && measure(candidate) > MAX_TEXT_WIDTH) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines
}

// ---------------------------------------------------------------------------
// SVG rendering
// ---------------------------------------------------------------------------

const escapeXml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Wrap emoji in a tspan so they pick up an emoji font.
const renderLine = (line) =>
  escapeXml(line).replace(
    /(\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*)/gu,
    '<tspan class="emoji">$1</tspan>'
  )

const TYPING_WIDTH = 62
const TYPING_HEIGHT = PAD_Y * 2 + LINE_HEIGHT
const TYPING_DURATION = 1.4 // seconds the "..." indicator shows
const STEP = 1.9 // seconds between messages

function typingIndicator(y, i) {
  const cy = TYPING_HEIGHT / 2
  const dots = [0, 1, 2]
    .map(
      (d) =>
        `<circle cx="${19 + d * 12}" cy="${cy}" r="4" class="dot" style="animation-delay:${d * 0.2}s"/>`
    )
    .join('')
  return `
  <g transform="translate(0 ${y})">
    <g class="typing" style="animation-delay:${(i * STEP).toFixed(2)}s">
      <rect width="${TYPING_WIDTH}" height="${TYPING_HEIGHT}" rx="${TYPING_HEIGHT / 2}" class="bubble"/>
      <circle cx="4" cy="${TYPING_HEIGHT - 4}" r="4" class="bubble"/>
      ${dots}
    </g>
  </g>`
}

function message(lines, y, i) {
  const width = Math.ceil(Math.max(...lines.map(measure)) + PAD_X * 2)
  const height = lines.length * LINE_HEIGHT + PAD_Y * 2
  const text = lines
    .map((l, n) => `<text x="${PAD_X}" y="${PAD_Y + 16 + n * LINE_HEIGHT}">${renderLine(l)}</text>`)
    .join('\n      ')
  const svg = `
  <g transform="translate(0 ${y})">
    <g class="msg" style="animation-delay:${(i * STEP + TYPING_DURATION).toFixed(2)}s">
      <rect width="${width}" height="${height}" rx="18" class="bubble"/>
      ${text}
    </g>
  </g>`
  return { svg, height }
}

function render(messages) {
  let y = 0
  const parts = messages.map((text, i) => {
    const lines = wrap(text)
    const typing = typingIndicator(y, i)
    const msg = message(lines, y, i)
    y += msg.height + GAP
    return typing + msg.svg
  })
  const height = y - GAP + 4

  return `<svg width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    .bubble { fill: #e9e9eb; }
    .dot { fill: #8e8e93; animation: blink 1s infinite; }
    text {
      fill: #1c1c1e;
      font-size: ${FONT_SIZE}px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    }
    .emoji {
      font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
    }
    .typing { opacity: 0; animation: typing ${TYPING_DURATION}s ease-in-out both; }
    .msg { opacity: 0; animation: pop 0.25s ease-out both; }

    @keyframes typing {
      0%, 100% { opacity: 0; }
      20%, 85% { opacity: 1; }
    }
    @keyframes pop {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes blink {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 1; }
    }

    @media (prefers-color-scheme: dark) {
      .bubble { fill: #3a3a3c; }
      .dot { fill: #aeaeb2; }
      text { fill: #f2f2f7; }
    }
  </style>
${parts.join('\n')}
</svg>
`
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let slo, seattle
try {
  ;[slo, seattle] = await Promise.all([getWeather(PLACES.slo), getWeather(PLACES.seattle)])
  console.log('SLO:', slo, 'Seattle:', seattle)
} catch (err) {
  console.warn(`::warning::Couldn't fetch weather, skipping weather messages (${err.message})`)
}

const values = {
  ...(slo && {
    'slo.degF': slo.degF,
    'slo.degC': slo.degC,
    'slo.emoji': slo.emoji,
    seattleLine: seattleLine(slo, seattle),
  }),
  weekday: new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: PLACES.slo.tz }).format(new Date()),
}

const fill = (s) =>
  s.replace(/\{([\w.]+)\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`Unknown placeholder {${key}}`)
    return values[key]
  })

const messages = MESSAGES.filter((m) => slo || !m.weather).map((m) => fill(m.text))
writeFileSync('chat.svg', render(messages))
console.log('Wrote chat.svg')

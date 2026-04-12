import fs from 'node:fs'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const RETENTION_EVENT_NAMES = new Set([
  'return_objective_assigned',
  'return_objective_completed',
  'return_objective_claimed',
  'streak_advanced',
])

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function formatRate(rate) {
  if (rate === null) {
    return 'n/a'
  }

  return `${(rate * 100).toFixed(2)}%`
}

function roundRate(value) {
  return Number(value.toFixed(4))
}

function safeRate(numerator, denominator) {
  if (!Number.isFinite(denominator) || denominator <= 0) {
    return null
  }

  return roundRate(numerator / denominator)
}

function normalizeCapturedEvent(rawEvent) {
  if (!isObject(rawEvent)) {
    return null
  }

  const nameCandidate = typeof rawEvent.name === 'string' ? rawEvent.name : rawEvent.event
  if (typeof nameCandidate !== 'string') {
    return null
  }

  const normalizedName = nameCandidate.trim()
  if (normalizedName.length === 0) {
    return null
  }

  let payload = {}
  if (isObject(rawEvent.payload)) {
    payload = rawEvent.payload
  } else if (isObject(rawEvent.properties)) {
    payload = rawEvent.properties
  }

  return {
    name: normalizedName,
    payload,
    rawEvent,
  }
}

function parseNdjson(rawText, sourceLabel) {
  const events = []
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  for (let index = 0; index < lines.length; index += 1) {
    try {
      events.push(JSON.parse(lines[index]))
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Could not parse NDJSON line ${index + 1} from ${sourceLabel}: ${reason}`,
      )
    }
  }

  return events
}

function parseEventCollection(parsedPayload, sourceLabel) {
  if (Array.isArray(parsedPayload)) {
    return parsedPayload
  }

  if (isObject(parsedPayload) && Array.isArray(parsedPayload.events)) {
    return parsedPayload.events
  }

  throw new Error(
    `Expected a JSON array or { events: [...] } object in ${sourceLabel}.`,
  )
}

export function parseCapturedEvents(rawText, sourceLabel = 'input') {
  const trimmed = rawText.trim()
  if (trimmed.length === 0) {
    return []
  }

  let parsedEvents
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsedPayload = JSON.parse(trimmed)
      parsedEvents = parseEventCollection(parsedPayload, sourceLabel)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`Could not parse JSON from ${sourceLabel}: ${reason}`)
    }
  } else {
    parsedEvents = parseNdjson(trimmed, sourceLabel)
  }

  return parsedEvents
    .map((rawEvent) => normalizeCapturedEvent(rawEvent))
    .filter((event) => event !== null)
}

function resolveCohort(event) {
  const payload = isObject(event.payload) ? event.payload : {}
  const payloadProperties = isObject(payload.properties) ? payload.properties : {}
  const rawProperties = isObject(event.rawEvent.properties) ? event.rawEvent.properties : {}
  const candidates = [
    event.rawEvent.cohort,
    payload.cohort,
    payloadProperties.cohort,
    rawProperties.cohort,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }

  return 'all'
}

function createCohortSummary(cohort) {
  return {
    cohort,
    objectiveAssignedCount: 0,
    objectiveCompletedCount: 0,
    objectiveClaimedCount: 0,
    streakAdvancedCount: 0,
    objectiveCompletionRate: null,
    claimRate: null,
    streakAdvancementRate: null,
  }
}

function summarizeBucket(bucket) {
  return {
    ...bucket,
    objectiveCompletionRate: safeRate(
      bucket.objectiveCompletedCount,
      bucket.objectiveAssignedCount,
    ),
    claimRate: safeRate(bucket.objectiveClaimedCount, bucket.objectiveCompletedCount),
    streakAdvancementRate: safeRate(
      bucket.streakAdvancedCount,
      bucket.objectiveClaimedCount,
    ),
  }
}

export function summarizeRetentionCohorts(events) {
  const buckets = new Map()
  let retentionEventsProcessed = 0

  for (const event of events) {
    if (!RETENTION_EVENT_NAMES.has(event.name)) {
      continue
    }

    retentionEventsProcessed += 1
    const cohort = resolveCohort(event)
    const bucket = buckets.get(cohort) ?? createCohortSummary(cohort)

    if (event.name === 'return_objective_assigned') {
      bucket.objectiveAssignedCount += 1
    } else if (event.name === 'return_objective_completed') {
      bucket.objectiveCompletedCount += 1
    } else if (event.name === 'return_objective_claimed') {
      bucket.objectiveClaimedCount += 1
    } else if (event.name === 'streak_advanced') {
      bucket.streakAdvancedCount += 1
    }

    buckets.set(cohort, bucket)
  }

  const cohorts = [...buckets.values()]
    .sort((left, right) => left.cohort.localeCompare(right.cohort))
    .map((bucket) => summarizeBucket(bucket))

  return {
    totals: {
      eventsProcessed: events.length,
      retentionEventsProcessed,
      cohortCount: cohorts.length,
    },
    cohorts,
  }
}

function renderTable(summary) {
  if (summary.cohorts.length === 0) {
    return [
      'No retention lifecycle events found in input.',
      `Processed events: ${summary.totals.eventsProcessed}`,
    ].join('\n')
  }

  const headers = [
    'cohort',
    'assigned',
    'completed',
    'claimed',
    'streak_adv',
    'completion_rate',
    'claim_rate',
    'streak_adv_rate',
  ]

  const rows = summary.cohorts.map((cohortSummary) => [
    cohortSummary.cohort,
    String(cohortSummary.objectiveAssignedCount),
    String(cohortSummary.objectiveCompletedCount),
    String(cohortSummary.objectiveClaimedCount),
    String(cohortSummary.streakAdvancedCount),
    formatRate(cohortSummary.objectiveCompletionRate),
    formatRate(cohortSummary.claimRate),
    formatRate(cohortSummary.streakAdvancementRate),
  ])

  const widths = headers.map((header, columnIndex) =>
    Math.max(header.length, ...rows.map((row) => row[columnIndex].length)),
  )

  const line = (cells) =>
    cells.map((cell, index) => cell.padEnd(widths[index], ' ')).join('  ')

  const separator = widths.map((width) => '-'.repeat(width)).join('  ')
  const tableLines = [line(headers), separator, ...rows.map((row) => line(row))]
  tableLines.push(
    '',
    `Processed ${summary.totals.eventsProcessed} total events (${summary.totals.retentionEventsProcessed} retention lifecycle events).`,
  )

  return tableLines.join('\n')
}

function parseArgs(argv) {
  const options = {
    inputPath: null,
    format: 'table',
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]

    if (token === '--help' || token === '-h') {
      options.help = true
      continue
    }

    if (token === '--input' || token === '-i') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('Expected a file path after --input.')
      }

      options.inputPath = value
      index += 1
      continue
    }

    if (token === '--format') {
      const value = argv[index + 1]
      if (value !== 'table' && value !== 'json') {
        throw new Error('Expected --format value to be "table" or "json".')
      }

      options.format = value
      index += 1
      continue
    }

    throw new Error(`Unknown argument "${token}".`)
  }

  return options
}

function usage() {
  return [
    'Usage: node scripts/export-retention-cohorts.mjs --input <events.json|events.ndjson> [--format table|json]',
    '',
    'Input formats:',
    '- JSON array of events',
    '- JSON object with { "events": [...] }',
    '- NDJSON lines',
  ].join('\n')
}

function readInputText(inputPath) {
  if (inputPath) {
    return fs.readFileSync(inputPath, 'utf8')
  }

  if (process.stdin.isTTY) {
    throw new Error('No input provided. Use --input <path> or pipe data via stdin.')
  }

  return fs.readFileSync(0, 'utf8')
}

function runCli() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const sourceLabel = options.inputPath ?? 'stdin'
  const rawText = readInputText(options.inputPath)
  const parsedEvents = parseCapturedEvents(rawText, sourceLabel)
  const summary = summarizeRetentionCohorts(parsedEvents)

  if (options.format === 'json') {
    console.log(JSON.stringify(summary, null, 2))
    return
  }

  console.log(renderTable(summary))
}

function isDirectExecution() {
  if (!process.argv[1]) {
    return false
  }

  return pathToFileURL(process.argv[1]).href === import.meta.url
}

if (isDirectExecution()) {
  try {
    runCli()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[retention-cohort-export] failed: ${message}`)
    console.error(usage())
    process.exit(1)
  }
}

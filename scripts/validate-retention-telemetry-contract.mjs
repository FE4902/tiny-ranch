import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const telemetrySourcePath = path.join(repoRoot, 'src/game/systems/telemetry.ts')
const runtimeSourcePath = path.join(repoRoot, 'src/game/systems/runtime.ts')
const defaultFixturePath = path.join(
  repoRoot,
  'tests/fixtures/analytics/retention-contract.fixture.json',
)

function fail(message) {
  throw new Error(message)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function toSortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function toSet(values) {
  return new Set(values)
}

function diff(required, actualSet) {
  return required.filter((key) => !actualSet.has(key))
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')

  try {
    return JSON.parse(raw)
  } catch (error) {
    fail(`Could not parse JSON file "${filePath}": ${error instanceof Error ? error.message : String(error)}`)
  }
}

function readSource(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function extractSchemaKeys(source, eventName) {
  const eventPattern = new RegExp(
    `\\b${escapeRegExp(eventName)}\\s*:\\s*\\[([\\s\\S]*?)\\],`,
    'm',
  )
  const eventMatch = source.match(eventPattern)
  if (!eventMatch) {
    return null
  }

  const keyMatches = eventMatch[1].matchAll(/'([^']+)'/g)
  const keys = []
  for (const match of keyMatches) {
    keys.push(match[1])
  }

  return toSortedUnique(keys)
}

function extractRuntimePayloadKeys(source, eventName) {
  const trackPattern = new RegExp(
    `telemetry\\.track\\(\\s*'${escapeRegExp(eventName)}'\\s*,\\s*\\{([\\s\\S]*?)\\}\\s*\\)`,
    'g',
  )

  const keys = new Set()
  let foundTrackCall = false

  for (const match of source.matchAll(trackPattern)) {
    foundTrackCall = true
    const payloadLiteral = match[1]
    const explicitKeyMatches = payloadLiteral.matchAll(
      /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm,
    )
    for (const keyMatch of explicitKeyMatches) {
      keys.add(keyMatch[1])
    }

    const shorthandKeyMatches = payloadLiteral.matchAll(
      /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*$/gm,
    )
    for (const keyMatch of shorthandKeyMatches) {
      keys.add(keyMatch[1])
    }
  }

  if (!foundTrackCall) {
    return null
  }

  return [...keys].sort((left, right) => left.localeCompare(right))
}

function validateFixtureShape(fixturePath, fixture) {
  if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture)) {
    fail(`Fixture "${fixturePath}" must be an object with an "events" array.`)
  }

  if (!Array.isArray(fixture.events) || fixture.events.length === 0) {
    fail(`Fixture "${fixturePath}" must include a non-empty "events" array.`)
  }
}

function validateEventEntry(entry, index) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    fail(`Fixture event at index ${index} must be an object.`)
  }

  if (typeof entry.name !== 'string' || entry.name.trim().length === 0) {
    fail(`Fixture event at index ${index} must include a non-empty "name".`)
  }

  if (!Array.isArray(entry.requiredFields) || entry.requiredFields.length === 0) {
    fail(`Fixture event "${entry.name}" must include a non-empty "requiredFields" array.`)
  }

  for (const requiredField of entry.requiredFields) {
    if (typeof requiredField !== 'string' || requiredField.trim().length === 0) {
      fail(`Fixture event "${entry.name}" includes an invalid required field entry.`)
    }
  }

  if (!entry.samplePayload || typeof entry.samplePayload !== 'object' || Array.isArray(entry.samplePayload)) {
    fail(`Fixture event "${entry.name}" must include an object "samplePayload".`)
  }
}

function validateContract({
  fixturePath,
  fixture,
  telemetrySource,
  runtimeSource,
}) {
  validateFixtureShape(fixturePath, fixture)

  const seenEventNames = new Set()
  const eventSummaries = []

  for (const [index, eventEntry] of fixture.events.entries()) {
    validateEventEntry(eventEntry, index)

    const eventName = eventEntry.name.trim()
    if (seenEventNames.has(eventName)) {
      fail(`Fixture event "${eventName}" is defined more than once.`)
    }
    seenEventNames.add(eventName)

    const requiredFields = toSortedUnique(eventEntry.requiredFields.map((field) => field.trim()))
    const samplePayloadKeys = toSortedUnique(Object.keys(eventEntry.samplePayload))

    const schemaKeys = extractSchemaKeys(telemetrySource, eventName)
    if (!schemaKeys) {
      fail(`Event "${eventName}" is not registered in TELEMETRY_EVENT_SCHEMA.`)
    }

    const runtimeKeys = extractRuntimePayloadKeys(runtimeSource, eventName)
    if (!runtimeKeys) {
      fail(`Event "${eventName}" has no literal telemetry.track payload in runtime.ts.`)
    }

    const schemaKeySet = toSet(schemaKeys)
    const runtimeKeySet = toSet(runtimeKeys)
    const sampleKeySet = toSet(samplePayloadKeys)

    const missingRequiredInSchema = diff(requiredFields, schemaKeySet)
    if (missingRequiredInSchema.length > 0) {
      fail(
        `Event "${eventName}" missing required schema keys: ${missingRequiredInSchema.join(', ')}.`,
      )
    }

    const missingRequiredInRuntimePayload = diff(requiredFields, runtimeKeySet)
    if (missingRequiredInRuntimePayload.length > 0) {
      fail(
        `Event "${eventName}" missing required runtime payload keys: ${missingRequiredInRuntimePayload.join(', ')}.`,
      )
    }

    const missingRequiredInSample = diff(requiredFields, sampleKeySet)
    if (missingRequiredInSample.length > 0) {
      fail(
        `Event "${eventName}" sample payload missing required keys: ${missingRequiredInSample.join(', ')}.`,
      )
    }

    const unknownSampleKeys = samplePayloadKeys.filter((key) => !schemaKeySet.has(key))
    if (unknownSampleKeys.length > 0) {
      fail(
        `Event "${eventName}" sample payload includes keys not allowed by schema: ${unknownSampleKeys.join(', ')}.`,
      )
    }

    const unknownRuntimeKeys = runtimeKeys.filter((key) => !schemaKeySet.has(key))
    if (unknownRuntimeKeys.length > 0) {
      fail(
        `Event "${eventName}" runtime payload includes keys not allowed by schema: ${unknownRuntimeKeys.join(', ')}.`,
      )
    }

    eventSummaries.push({
      eventName,
      requiredFieldCount: requiredFields.length,
      schemaKeyCount: schemaKeys.length,
      runtimeKeyCount: runtimeKeys.length,
    })
  }

  return eventSummaries
}

function resolveFixturePath() {
  const cliPath = process.argv[2]
  if (!cliPath) {
    return defaultFixturePath
  }

  return path.resolve(process.cwd(), cliPath)
}

function run() {
  const fixturePath = resolveFixturePath()
  const fixture = readJson(fixturePath)
  const telemetrySource = readSource(telemetrySourcePath)
  const runtimeSource = readSource(runtimeSourcePath)

  const summaries = validateContract({
    fixturePath,
    fixture,
    telemetrySource,
    runtimeSource,
  })

  const relativeFixturePath = path.relative(repoRoot, fixturePath)
  console.log(
    `[retention-contract] validated ${summaries.length} retention telemetry events using ${relativeFixturePath}.`,
  )
  for (const summary of summaries) {
    console.log(
      `[retention-contract] ${summary.eventName}: required=${summary.requiredFieldCount}, schema=${summary.schemaKeyCount}, runtime=${summary.runtimeKeyCount}`,
    )
  }
}

try {
  run()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[retention-contract] failed: ${message}`)
  process.exit(1)
}

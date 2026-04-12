import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import {
  parseCapturedEvents,
  summarizeRetentionCohorts,
} from './export-retention-cohorts.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const sampleInputPath = path.join(
  repoRoot,
  'tests/fixtures/analytics/retention-cohort-events.sample.json',
)
const expectedOutputPath = path.join(
  repoRoot,
  'tests/fixtures/analytics/retention-cohort-expected.sample.json',
)

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(raw)
}

function run() {
  const sampleRaw = fs.readFileSync(sampleInputPath, 'utf8')
  const events = parseCapturedEvents(sampleRaw, sampleInputPath)
  const summary = summarizeRetentionCohorts(events)
  const expected = readJson(expectedOutputPath)

  const actualSerialized = JSON.stringify(summary)
  const expectedSerialized = JSON.stringify(expected)
  if (actualSerialized !== expectedSerialized) {
    console.error('[retention-cohort-export] deterministic summary mismatch.')
    console.error('[retention-cohort-export] expected:')
    console.error(JSON.stringify(expected, null, 2))
    console.error('[retention-cohort-export] actual:')
    console.error(JSON.stringify(summary, null, 2))
    process.exit(1)
  }

  console.log(
    `[retention-cohort-export] verified deterministic summary for ${events.length} sample events.`,
  )
}

try {
  run()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[retention-cohort-export] failed: ${message}`)
  process.exit(1)
}

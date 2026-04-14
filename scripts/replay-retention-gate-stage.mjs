#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const DEFAULT_PACK_PATH = path.join(
  repoRoot,
  'artifacts/retention-release-gate/replay-pack/retention-release-gate-replay-pack.json',
)
const MAX_BUFFER_BYTES = 32 * 1024 * 1024

function printUsage() {
  process.stdout.write(
    [
      'Usage: node scripts/replay-retention-gate-stage.mjs [options]',
      '',
      'Options:',
      '  --pack=<path>         Replay pack JSON path (default: latest gate location).',
      '  --stage=<stage-id>    Replay a specific stage id (defaults to first failed stage).',
      '  --list                Print available stages and exit.',
      '  --allow-passed        Allow replaying a stage that did not fail.',
      '  --dry-run             Print resolved command/context without executing.',
      '  --help                Show this message.',
      '',
    ].join('\n'),
  )
}

function parseArgs(argv) {
  const options = {
    packPath: DEFAULT_PACK_PATH,
    stageId: null,
    listOnly: false,
    allowPassed: false,
    dryRun: false,
  }

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    }

    if (arg === '--list') {
      options.listOnly = true
      continue
    }

    if (arg === '--allow-passed') {
      options.allowPassed = true
      continue
    }

    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (arg.startsWith('--pack=')) {
      const rawPath = arg.slice('--pack='.length).trim()
      if (rawPath.length === 0) {
        throw new Error('--pack requires a non-empty path.')
      }

      options.packPath = path.resolve(process.cwd(), rawPath)
      continue
    }

    if (arg.startsWith('--stage=')) {
      const rawStageId = arg.slice('--stage='.length).trim()
      if (rawStageId.length === 0) {
        throw new Error('--stage requires a non-empty stage id.')
      }

      options.stageId = rawStageId
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function readJson(filePath, description) {
  const raw = fs.readFileSync(filePath, 'utf8')
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `Could not parse ${description} at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function assertReplayPackSchema(pack, packPath) {
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
    throw new Error(`Replay pack at ${packPath} must be an object.`)
  }

  if (!Array.isArray(pack.stages) || pack.stages.length === 0) {
    throw new Error(`Replay pack at ${packPath} must include a non-empty "stages" array.`)
  }
}

function toDisplayCommand(stage) {
  const binary = stage.command?.binary
  const args = Array.isArray(stage.command?.args) ? stage.command.args : []
  if (typeof binary !== 'string' || binary.length === 0) {
    return 'n/a'
  }

  return [binary, ...args].join(' ')
}

function selectStage(pack, options) {
  if (options.stageId) {
    return pack.stages.find((stage) => stage.stageId === options.stageId) ?? null
  }

  if (Array.isArray(pack.failedStages) && pack.failedStages.length > 0) {
    const firstFailed = pack.failedStages[0]
    return pack.stages.find((stage) => stage.stageId === firstFailed.stageId) ?? null
  }

  return pack.stages.find((stage) => stage.status === 'fail') ?? null
}

function renderStageList(pack) {
  const lines = ['Retention gate replay stages:', '']
  for (const stage of pack.stages) {
    lines.push(`- ${stage.stageId} [${String(stage.status ?? 'unknown').toUpperCase()}] :: ${toDisplayCommand(stage)}`)
  }
  return `${lines.join('\n')}\n`
}

function resolveCwd(stage) {
  const stageCwd = typeof stage.command?.cwd === 'string' && stage.command.cwd.length > 0 ? stage.command.cwd : '.'
  return path.resolve(repoRoot, stageCwd)
}

function toRelativeDisplayPath(targetPath) {
  const relative = path.relative(process.cwd(), targetPath)
  return relative.length > 0 ? relative : '.'
}

function run() {
  const options = parseArgs(process.argv.slice(2))

  if (!fs.existsSync(options.packPath)) {
    throw new Error(
      `Replay pack not found at ${options.packPath}. Run npm run gate:retention:release first or provide --pack=<path>.`,
    )
  }

  const replayPack = readJson(options.packPath, 'replay pack')
  assertReplayPackSchema(replayPack, options.packPath)

  if (options.listOnly) {
    process.stdout.write(renderStageList(replayPack))
    return
  }

  const stage = selectStage(replayPack, options)
  if (!stage) {
    throw new Error(
      'No replayable stage found. Pass --stage=<stage-id> or ensure the replay pack contains a failed stage.',
    )
  }

  if (stage.status !== 'fail' && !options.allowPassed) {
    throw new Error(
      `Stage "${stage.stageId}" is ${stage.status}. Use --allow-passed if you intentionally want to replay a passing/skipped stage.`,
    )
  }

  const binary = stage.command?.binary
  const args = Array.isArray(stage.command?.args) ? stage.command.args : []
  if (typeof binary !== 'string' || binary.length === 0) {
    throw new Error(`Replay metadata for stage "${stage.stageId}" is missing command.binary.`)
  }

  const cwd = resolveCwd(stage)
  const envOverrides =
    stage.envOverrides && typeof stage.envOverrides === 'object' && !Array.isArray(stage.envOverrides)
      ? stage.envOverrides
      : {}
  const runEnvContext =
    replayPack.gateRun?.envContext &&
    typeof replayPack.gateRun.envContext === 'object' &&
    !Array.isArray(replayPack.gateRun.envContext)
      ? replayPack.gateRun.envContext
      : {}

  process.stdout.write(
    [
      '[retention-release-gate:replay] stage context',
      `- Stage: ${stage.stageId}`,
      `- Status in source run: ${stage.status}`,
      `- Pack: ${path.relative(process.cwd(), options.packPath)}`,
      `- Command: ${toDisplayCommand(stage)}`,
      `- CWD: ${toRelativeDisplayPath(cwd)}`,
      `- Captured env keys: ${Object.keys(runEnvContext).length + Object.keys(envOverrides).length}`,
      `- Fixture refs: ${Array.isArray(stage.fixtureRefs) && stage.fixtureRefs.length > 0 ? stage.fixtureRefs.join(', ') : 'n/a'}`,
      '',
    ].join('\n'),
  )

  if (options.dryRun) {
    process.stdout.write('[retention-release-gate:replay] dry run complete; command not executed.\n')
    return
  }

  const result = spawnSync(binary, args, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...runEnvContext,
      ...envOverrides,
    },
    maxBuffer: MAX_BUFFER_BYTES,
  })

  if (result.error) {
    throw new Error(
      `Could not start replay command for stage "${stage.stageId}": ${result.error instanceof Error ? result.error.message : String(result.error)}`,
    )
  }

  process.exit(result.status ?? 1)
}

try {
  run()
} catch (error) {
  process.stderr.write(
    `[retention-release-gate:replay] failed: ${error instanceof Error ? error.message : String(error)}\n`,
  )
  process.exit(1)
}

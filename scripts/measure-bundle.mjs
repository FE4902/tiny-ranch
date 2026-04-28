#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const distAssetsDir = resolve(process.cwd(), 'dist/assets')

const budget = {
  targetTotalJsGzipKb: 250,
  ceilingTotalJsGzipKb: 300,
  targetTotalJsMinifiedKb: 900,
  ceilingTotalJsMinifiedKb: 1024,
  targetBootstrapJsGzipKb: 10,
  ceilingBootstrapJsGzipKb: 20
}

const toKb = (bytes) => Number((bytes / 1024).toFixed(2))

const statusIcon = (value, target, ceiling) => {
  if (value <= target) {
    return 'PASS'
  }

  if (value <= ceiling) {
    return 'WARN'
  }

  return 'FAIL'
}

const collectChunkRows = async () => {
  const entries = await readdir(distAssetsDir, { withFileTypes: true })
  const jsFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => entry.name)
    .sort()

  if (jsFiles.length === 0) {
    throw new Error(`No JS chunks found in ${distAssetsDir}`)
  }

  const rows = []
  for (const file of jsFiles) {
    const filePath = join(distAssetsDir, file)
    const source = await readFile(filePath)
    const gzipBytes = gzipSync(source, { level: 9 }).byteLength
    rows.push({
      chunk: file,
      rawBytes: source.byteLength,
      minBytes: source.byteLength,
      gzipBytes
    })
  }

  return rows
}

const getGitRevision = () => {
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
  } catch {
    return 'unknown'
  }
}

const renderMarkdown = (rows) => {
  const measuredAt = new Date().toISOString()
  const revision = getGitRevision()

  const totalRawKb = toKb(rows.reduce((sum, row) => sum + row.rawBytes, 0))
  const totalMinKb = toKb(rows.reduce((sum, row) => sum + row.minBytes, 0))
  const totalGzipKb = toKb(rows.reduce((sum, row) => sum + row.gzipBytes, 0))

  const bootstrapRow =
    rows.find((row) => row.chunk.startsWith('index-') && row.chunk.endsWith('.js')) || rows[0]
  const totalGzipStatus = statusIcon(
    totalGzipKb,
    budget.targetTotalJsGzipKb,
    budget.ceilingTotalJsGzipKb,
  )
  const totalMinifiedStatus = statusIcon(
    totalMinKb,
    budget.targetTotalJsMinifiedKb,
    budget.ceilingTotalJsMinifiedKb,
  )
  const bootstrapGzipKb = toKb(bootstrapRow.gzipBytes)
  const bootstrapStatus = statusIcon(
    bootstrapGzipKb,
    budget.targetBootstrapJsGzipKb,
    budget.ceilingBootstrapJsGzipKb,
  )

  const lines = [
    '# Tiny Ranch Bundle Baseline',
    '',
    `- Measured at (UTC): ${measuredAt}`,
    `- Git revision: ${revision}`,
    '- Command: `pnpm run bundle:measure`',
    '',
    '| Chunk | Raw KB | Minified KB | Gzip KB |',
    '| --- | ---: | ---: | ---: |'
  ]

  for (const row of rows) {
    lines.push(`| ${row.chunk} | ${toKb(row.rawBytes)} | ${toKb(row.minBytes)} | ${toKb(row.gzipBytes)} |`)
  }

  lines.push(`| **TOTAL_JS** | **${totalRawKb}** | **${totalMinKb}** | **${totalGzipKb}** |`)
  lines.push('')
  lines.push('## Mobile-Web Budget Gates (First Interactive Load)')
  lines.push('')
  lines.push('| Metric | Value KB | Target KB | Ceiling KB | Status |')
  lines.push('| --- | ---: | ---: | ---: | --- |')
  lines.push(
    `| Total JS gzip | ${totalGzipKb} | ${budget.targetTotalJsGzipKb} | ${budget.ceilingTotalJsGzipKb} | ${totalGzipStatus} |`
  )
  lines.push(
    `| Total JS minified | ${totalMinKb} | ${budget.targetTotalJsMinifiedKb} | ${budget.ceilingTotalJsMinifiedKb} | ${totalMinifiedStatus} |`
  )
  lines.push(
    `| Bootstrap JS gzip (${bootstrapRow.chunk}) | ${bootstrapGzipKb} | ${budget.targetBootstrapJsGzipKb} | ${budget.ceilingBootstrapJsGzipKb} | ${bootstrapStatus} |`
  )

  const hasCeilingFailure =
    totalGzipStatus === 'FAIL' || totalMinifiedStatus === 'FAIL' || bootstrapStatus === 'FAIL'

  return {
    report: lines.join('\n'),
    hasCeilingFailure,
  }
}

const main = async () => {
  const rows = await collectChunkRows()
  const { report, hasCeilingFailure } = renderMarkdown(rows)
  process.stdout.write(`${report}\n`)

  if (hasCeilingFailure) {
    process.stderr.write('Bundle budget ceiling exceeded.\n')
    process.exitCode = 1
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})

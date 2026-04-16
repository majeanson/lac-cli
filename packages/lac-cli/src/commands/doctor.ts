import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import path from 'node:path'
import process from 'node:process'

import { validateFeature } from '@life-as-code/feature-schema'
import { Command } from 'commander'

import { computeCompleteness, loadConfig } from '../lib/config.js'
import { scanFeatures } from '../lib/scanner.js'
import { findLacConfig } from '../lib/walker.js'

// ─── helpers ────────────────────────────────────────────────────────────────

/** Mirrors the findLacDir logic from keygen.ts */
export function findLacDir(fromDir: string): string | null {
  let current = path.resolve(fromDir)
  while (true) {
    const candidate = path.join(current, '.lac')
    try {
      if (statSync(candidate).isDirectory()) return candidate
    } catch { /* not found at this level */ }
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

/** Walk a directory tree collecting all feature.json paths with validation info. */
export async function walkFeatureFiles(
  currentDir: string,
): Promise<{ valid: number; invalid: Array<{ filePath: string; errors: string[] }> }> {
  let validCount = 0
  const invalidFiles: Array<{ filePath: string; errors: string[] }> = []

  async function walk(dir: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rawEntries: any[]
    try {
      rawEntries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    // Normalise to plain objects to avoid @types/node Dirent variance (mirrors scanner.ts)
    const entries = rawEntries.map((e) => ({
      name: String(e.name),
      isDirectory: () => e.isDirectory() as boolean,
      isFile: () => e.isFile() as boolean,
    }))

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)

      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
        await walk(fullPath)
      } else if (entry.isFile() && entry.name === 'feature.json') {
        let raw: string
        try {
          raw = await readFile(fullPath, 'utf-8')
        } catch {
          invalidFiles.push({ filePath: fullPath, errors: ['could not read file'] })
          continue
        }

        let parsed: unknown
        try {
          parsed = JSON.parse(raw)
        } catch {
          invalidFiles.push({ filePath: fullPath, errors: ['invalid JSON'] })
          continue
        }

        const result = validateFeature(parsed)
        if (!result.success) {
          invalidFiles.push({ filePath: fullPath, errors: result.errors })
        } else {
          validCount++
        }
      }
    }
  }

  await walk(currentDir)
  return { valid: validCount, invalid: invalidFiles }
}

// ─── command ────────────────────────────────────────────────────────────────

export const doctorCommand = new Command('doctor')
  .description('Check workspace health and report any issues')
  .argument('[dir]', 'Directory to check (default: cwd)')
  .action(async (dir: string | undefined) => {
    const checkDir = dir ? path.resolve(dir) : process.cwd()

    let passed = 0
    let warned = 0
    let failed = 0

    const output: string[] = []

    output.push('lac doctor — workspace diagnostics')
    output.push('===================================')
    output.push('')

    // ── Check 1: .lac/ workspace directory ──────────────────────────────────
    let lacDir: string | null = null
    try {
      lacDir = findLacDir(checkDir)
    } catch { /* treated as not found */ }

    if (lacDir) {
      output.push(`✓ Workspace found at ${lacDir}`)
      passed++
    } else {
      output.push('✗ No .lac/ workspace — run: lac workspace init')
      failed++
    }

    // ── Check 2: .lac/counter file ───────────────────────────────────────────
    if (lacDir) {
      const counterPath = join(lacDir, 'counter')
      let counterOk = false
      let counterYear: number | null = null
      let nextKey = ''

      try {
        const raw = readFileSync(counterPath, 'utf-8').trim()
        const parts = raw.split('\n').map((l) => l.trim())
        const yr = parseInt(parts[0] ?? '', 10)
        const cnt = parseInt(parts[1] ?? '', 10)

        if (!isNaN(yr) && !isNaN(cnt)) {
          counterOk = true
          counterYear = yr
          nextKey = `feat-${yr}-${String(cnt + 1).padStart(3, '0')}`
        }
      } catch { /* missing or unreadable */ }

      if (counterOk && counterYear !== null) {
        output.push(`✓ Counter valid — next key preview: ${nextKey}`)
        passed++

        const currentYear = new Date().getFullYear()
        if (counterYear !== currentYear) {
          output.push(`⚠ Counter year is stale (${counterYear}) — will reset on next lac init`)
          warned++
        }
      } else {
        output.push('✗ Counter file missing or corrupt — run: lac workspace init --force')
        failed++
      }
    }

    // ── Check 3: feature.json files ──────────────────────────────────────────
    try {
      const { valid, invalid } = await walkFeatureFiles(checkDir)
      const total = valid + invalid.length
      output.push(`✓ Found ${total} feature.json file${total === 1 ? '' : 's'}`)
      passed++

      for (const inv of invalid) {
        output.push(`  ✗ Invalid: ${inv.filePath} — ${inv.errors.join('; ')}`)
        failed++
      }
    } catch {
      output.push('✗ Could not scan feature.json files')
      failed++
    }

    // ── Check 4: lac.config.json (optional) ──────────────────────────────────
    try {
      const configPath = findLacConfig(checkDir)

      if (!configPath) {
        output.push('  (no lac.config.json — using defaults)')
      } else {
        try {
          const raw = readFileSync(configPath, 'utf-8')
          const parsed = JSON.parse(raw) as Record<string, unknown>
          const domain = typeof parsed.domain === 'string' ? parsed.domain : 'feat'
          const threshold = typeof parsed.ciThreshold === 'number' ? parsed.ciThreshold : 0
          output.push(`✓ lac.config.json valid (domain: ${domain}, threshold: ${threshold})`)
          passed++
        } catch {
          output.push('✗ lac.config.json is invalid JSON — fix or delete it')
          failed++
        }
      }
    } catch {
      output.push('  (no lac.config.json — using defaults)')
    }

    // ── Check 5: lac-lsp availability ────────────────────────────────────────
    try {
      const result = spawnSync('lac-lsp', ['--help'], { timeout: 2000, stdio: 'ignore' })
      if (result.error || result.status === null) {
        output.push('✗ lac-lsp not found — install: npm i -g @life-as-code/lac-lsp')
        failed++
      } else {
        output.push('✓ lac-lsp found in PATH')
        passed++
      }
    } catch {
      output.push('✗ lac-lsp not found — install: npm i -g @life-as-code/lac-lsp')
      failed++
    }

    // ── Check 6: lint status ─────────────────────────────────────────────────
    try {
      const config = loadConfig(checkDir)
      const scanned = await scanFeatures(checkDir)
      const toCheck = scanned.filter(({ feature }) =>
        (config.lintStatuses as string[]).includes(feature.status),
      )

      let lintWarnCount = 0
      for (const { feature } of toCheck) {
        const raw = feature as unknown as Record<string, unknown>
        const completeness = computeCompleteness(raw)
        const missingRequired = config.requiredFields.filter((field) => {
          const val = raw[field]
          if (val === undefined || val === null || val === '') return true
          if (Array.isArray(val)) return val.length === 0
          return typeof val === 'string' && val.trim().length === 0
        })
        const belowThreshold = config.ciThreshold > 0 && completeness < config.ciThreshold
        if (missingRequired.length > 0 || belowThreshold) lintWarnCount++
      }

      if (lintWarnCount === 0) {
        output.push('✓ All features pass lint')
        passed++
      } else {
        output.push(`⚠ ${lintWarnCount} feature${lintWarnCount === 1 ? '' : 's'} have lint warnings`)
        warned++
      }
    } catch {
      output.push('⚠ Could not run lint check')
      warned++
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    output.push('')
    output.push(
      `Overall: ${passed} check${passed === 1 ? '' : 's'} passed, ${warned} warning${warned === 1 ? '' : 's'}, ${failed} failure${failed === 1 ? '' : 's'}`,
    )

    // Next steps when all checks pass
    if (failed === 0) {
      output.push('')
      output.push('Next steps:')
      output.push('  lac serve          → open dashboard at http://127.0.0.1:7474')
      output.push('  lac hooks install  → lint on every commit')
      output.push('  lac init           → create your first feature')
    }

    process.stdout.write(output.join('\n') + '\n')
    process.exit(failed > 0 ? 1 : 0)
  })

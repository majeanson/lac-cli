import fs from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

import type { Feature } from '@life-as-code/feature-schema'
import { validateFeature } from '@life-as-code/feature-schema'
import { Command } from 'commander'

import { computeCompleteness, loadConfig } from '../lib/config.js'
import { scanFeatures, type ScanOptions } from '../lib/scanner.js'

/** Intent-critical fields that should have a revision entry when non-empty */
const INTENT_CRITICAL_FIELDS = ['problem', 'analysis', 'implementation', 'decisions', 'successCriteria'] as const

interface LintResult {
  featureKey: string
  filePath: string
  status: string
  completeness: number
  missingRequired: string[]
  belowThreshold: boolean
  pass: boolean
  warnings: string[]
}

function checkFeature(
  feature: Feature,
  filePath: string,
  requiredFields: string[],
  threshold: number,
  revisionWarnings = true,
  requireAlternatives = false,
): LintResult {
  const raw = feature as unknown as Record<string, unknown>
  const completeness = computeCompleteness(raw)

  const missingRequired = requiredFields.filter((field) => {
    const val = raw[field]
    if (val === undefined || val === null || val === '') return true
    if (Array.isArray(val)) return val.length === 0
    return typeof val === 'string' && val.trim().length === 0
  })

  const belowThreshold = threshold > 0 && completeness < threshold

  // Warn if any intent-critical fields are filled but no revisions exist
  const warnings: string[] = []
  const hasRevisions = Array.isArray(raw.revisions) && (raw.revisions as unknown[]).length > 0
  if (revisionWarnings && !hasRevisions) {
    const filledCritical = INTENT_CRITICAL_FIELDS.filter((field) => {
      const val = raw[field]
      if (val === undefined || val === null) return false
      if (typeof val === 'string') return val.trim().length > 0
      if (Array.isArray(val)) return val.length > 0
      return false
    })
    if (filledCritical.length > 0) {
      warnings.push(`no revisions recorded — consider adding a revision entry for: ${filledCritical.join(', ')}`)
    }
  }

  // Warn if any decisions lack alternativesConsidered (when requireAlternatives is enabled)
  if (requireAlternatives && Array.isArray(raw.decisions)) {
    const missingAlts = (raw.decisions as Array<{ decision: string; alternativesConsidered?: string[] }>)
      .filter((d) => !d.alternativesConsidered || d.alternativesConsidered.length === 0)
    if (missingAlts.length > 0) {
      const names = missingAlts.map((d) => `"${d.decision.slice(0, 40)}"`)
      warnings.push(`${missingAlts.length} decision(s) missing alternativesConsidered: ${names.join(', ')}`)
    }
  }

  // Warn if featureLocked but no decisions exist
  if (raw.featureLocked && (!feature.decisions || feature.decisions.length === 0)) {
    warnings.push('feature is AI-locked (featureLocked: true) but has no decisions recorded — consider adding decisions before locking')
  }

  // Warn if superseded_by or merged_into is set but status is still active/draft
  if (raw.superseded_by && feature.status !== 'deprecated') {
    warnings.push(`superseded_by is set but status is "${feature.status}" — consider deprecating`)
  }
  if (raw.merged_into && feature.status !== 'deprecated') {
    warnings.push(`merged_into is set but status is "${feature.status}" — consider deprecating`)
  }

  return {
    featureKey: feature.featureKey,
    filePath,
    status: feature.status,
    completeness,
    missingRequired,
    belowThreshold,
    pass: missingRequired.length === 0 && !belowThreshold,
    warnings,
  }
}

/** Default placeholder values for auto-fix of missing required fields */
const FIELD_DEFAULTS: Record<string, unknown> = {
  problem: 'TODO: describe the problem this feature solves.',
  analysis: '',
  decisions: [],
  implementation: '',
  knownLimitations: [],
  tags: [],
}

/**
 * Auto-repair a feature file by inserting default values for missing required fields.
 * Returns the number of fields fixed, or 0 if nothing was changed.
 */
async function fixFeature(filePath: string, missingFields: string[]): Promise<number> {
  if (missingFields.length === 0) return 0

  let raw: string
  try {
    raw = await readFile(filePath, 'utf-8')
  } catch {
    return 0
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return 0
  }

  let fixed = 0
  for (const field of missingFields) {
    if (field in FIELD_DEFAULTS) {
      parsed[field] = FIELD_DEFAULTS[field]
      fixed++
    }
  }

  if (fixed === 0) return 0

  const validation = validateFeature(parsed)
  if (!validation.success) return 0

  await writeFile(filePath, JSON.stringify(validation.data, null, 2) + '\n', 'utf-8')
  return fixed
}

export const lintCommand = new Command('lint')
  .description('Check feature.json files for completeness and required fields')
  .argument('[dir]', 'Directory to scan (default: current directory)')
  .option('--require <fields>', 'Comma-separated required fields (overrides lac.config.json)')
  .option('--threshold <n>', 'Minimum completeness % required (overrides lac.config.json)', parseInt)
  .option('--quiet', 'Only print failures, suppress passing results')
  .option('--json', 'Output results as JSON')
  .option('--watch', 'Re-run lint on every feature.json change')
  .option('--fix', 'Auto-insert default values for missing required fields')
  .option('--include-archived', 'Include features inside _archive/ directories')
  .option('--no-revision-warnings', 'Suppress "no revisions recorded" warnings (useful during migration)')
  .option('--tags <tags>', 'Comma-separated tags to filter by — only lint features with at least one matching tag (OR logic)')
  .action(async (dir: string | undefined, options: {
    require?: string
    threshold?: number
    quiet?: boolean
    json?: boolean
    watch?: boolean
    fix?: boolean
    includeArchived?: boolean
    revisionWarnings?: boolean
    tags?: string
  }) => {
    const scanDir = resolve(dir ?? process.cwd())
    const config = loadConfig(scanDir)

    const requiredFields = options.require
      ? options.require.split(',').map((f) => f.trim()).filter(Boolean)
      : config.requiredFields

    const threshold = options.threshold !== undefined ? options.threshold : config.ciThreshold

    const scanOpts: ScanOptions = { includeArchived: options.includeArchived ?? false }
    const revisionWarnings = options.revisionWarnings ?? true

    async function runLint(): Promise<number> {
      // Scan
      let scanned: Awaited<ReturnType<typeof scanFeatures>>
      try {
        scanned = await scanFeatures(scanDir, scanOpts)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        process.stderr.write(`Error scanning "${scanDir}": ${message}\n`)
        return 1
      }

      if (scanned.length === 0) {
        process.stdout.write(`No feature.json files found in "${scanDir}".\n`)
        return 0
      }

      // Filter to lintable statuses
      let toCheck = scanned.filter(({ feature }) =>
        (config.lintStatuses as string[]).includes(feature.status),
      )

      if (options.tags) {
        const tagsToMatch = options.tags.split(',').map((t) => t.trim()).filter(Boolean)
        toCheck = toCheck.filter(({ feature }) =>
          tagsToMatch.some((tag) => feature.tags?.includes(tag)),
        )
      }

      const requireAlternatives = config.guardlock.requireAlternatives ?? false
      const results = toCheck.map(({ feature, filePath }) =>
        checkFeature(feature, filePath, requiredFields, threshold, revisionWarnings, requireAlternatives),
      )

      // Bidirectional pointer consistency checks (uses full scanned set, not just lintable statuses)
      const featureByKey = new Map(scanned.map(({ feature }) => [feature.featureKey, feature as unknown as Record<string, unknown>]))
      for (const result of results) {
        const raw = featureByKey.get(result.featureKey)
        if (!raw) continue
        // merged_into: A.merged_into=B → B.merged_from should include A
        if (raw.merged_into) {
          const target = featureByKey.get(String(raw.merged_into))
          if (target) {
            const mergedFrom = (target.merged_from as string[] | undefined) ?? []
            if (!mergedFrom.includes(result.featureKey)) {
              result.warnings.push(`merged_into "${raw.merged_into}" but that feature does not list this key in merged_from`)
            }
          }
        }
        // merged_from: for each source B in A.merged_from → B.merged_into should be A
        for (const sourceKey of (raw.merged_from as string[] | undefined) ?? []) {
          const source = featureByKey.get(sourceKey)
          if (source && source.merged_into !== result.featureKey) {
            result.warnings.push(`merged_from includes "${sourceKey}" but that feature does not point merged_into this key`)
          }
        }
        // superseded_by: A.superseded_by=B → B.superseded_from should include A
        if (raw.superseded_by) {
          const successor = featureByKey.get(String(raw.superseded_by))
          if (successor) {
            const supersededFrom = (successor.superseded_from as string[] | undefined) ?? []
            if (!supersededFrom.includes(result.featureKey)) {
              result.warnings.push(`superseded_by "${raw.superseded_by}" but that feature does not list this key in superseded_from`)
            }
          }
        }
      }

      // --fix: auto-repair missing required fields, then re-validate to confirm
      if (options.fix) {
        const toFix = results.filter((r) => !r.pass && r.missingRequired.length > 0)
        let totalFixed = 0
        for (const r of toFix) {
          const count = await fixFeature(r.filePath, r.missingRequired)
          if (count > 0) {
            totalFixed += count
            process.stdout.write(`  🔧  ${r.featureKey}  fixed ${count} field${count === 1 ? '' : 's'} (${r.missingRequired.join(', ')})\n`)
          }
        }

        if (totalFixed === 0 && toFix.length > 0) {
          process.stdout.write(`  No fields could be auto-fixed (fields may not have default values).\n`)
          return 1
        }
        if (toFix.length === 0) {
          process.stdout.write(`  Nothing to fix — all required fields present.\n`)
          return 0
        }

        // Re-scan and re-lint to confirm the fixes actually pass validation
        let rescanned: Awaited<ReturnType<typeof scanFeatures>>
        try {
          rescanned = await scanFeatures(scanDir, scanOpts)
        } catch {
          process.stdout.write(`\n✓ Fixed ${totalFixed} field${totalFixed === 1 ? '' : 's'}. Could not re-validate — run "lac lint" to confirm.\n`)
          return 0
        }
        const reFiltered = rescanned.filter(({ feature }) =>
          (config.lintStatuses as string[]).includes(feature.status),
        )
        const reResults = reFiltered.map(({ feature, filePath }) =>
          checkFeature(feature, filePath, requiredFields, threshold, revisionWarnings, requireAlternatives),
        )
        const stillFailing = reResults.filter((r) => !r.pass)
        if (stillFailing.length === 0) {
          process.stdout.write(`\n✓ Fixed ${totalFixed} field${totalFixed === 1 ? '' : 's'} — all features now pass lint.\n`)
          return 0
        }
        process.stdout.write(`\n⚠ Fixed ${totalFixed} field${totalFixed === 1 ? '' : 's'} but ${stillFailing.length} feature${stillFailing.length === 1 ? '' : 's'} still fail lint:\n`)
        for (const r of stillFailing) {
          process.stdout.write(`  ✗  ${r.featureKey}  missing: ${r.missingRequired.join(', ')}\n`)
        }
        return 1
      }

      const failures = results.filter((r) => !r.pass)
      const passes = results.filter((r) => r.pass)

      const warnings = results.filter((r) => r.warnings.length > 0)

      if (options.json) {
        process.stdout.write(JSON.stringify({ results, failures: failures.length, passes: passes.length, warningCount: warnings.length }, null, 2) + '\n')
        return failures.length > 0 ? 1 : 0
      }

      // Human-readable output
      const col = (s: string, width: number) => s.slice(0, width).padEnd(width)

      if (!options.quiet || passes.length > 0) {
        if (!options.quiet) {
          for (const r of passes) {
            process.stdout.write(`  ✓  ${col(r.featureKey, 18)} ${r.completeness.toString().padStart(3)}%  ${r.status}\n`)
          }
        }
      }

      for (const r of failures) {
        process.stdout.write(`  ✗  ${col(r.featureKey, 18)} ${r.completeness.toString().padStart(3)}%  ${r.status}\n`)
        for (const field of r.missingRequired) {
          process.stdout.write(`       missing required field: ${field}\n`)
        }
        if (r.belowThreshold) {
          process.stdout.write(`       completeness ${r.completeness}% is below threshold ${threshold}%\n`)
        }
      }

      if (!options.quiet && warnings.length > 0) {
        process.stdout.write('\nWarnings:\n')
        for (const r of warnings) {
          for (const w of r.warnings) {
            process.stdout.write(`  ⚠  ${col(r.featureKey, 18)}  ${w}\n`)
          }
        }
      }

      process.stdout.write(`\n${passes.length} passed, ${failures.length} failed, ${warnings.length} warned — ${results.length} features checked\n`)

      if (failures.length > 0) {
        if (!options.quiet) {
          process.stdout.write(`\nFailing features:\n`)
          for (const r of failures) {
            process.stdout.write(`  ${r.featureKey}  →  ${r.filePath}\n`)
          }
        }
        return 1
      }

      return 0
    }

    if (options.watch) {
      process.stdout.write(`Watching "${scanDir}"...\n\n`)

      // Run immediately
      await runLint()

      let debounce: ReturnType<typeof setTimeout> | null = null
      fs.watch(scanDir, { recursive: true }, (_event, filename) => {
        if (!filename || !filename.toString().endsWith('feature.json')) return
        if (debounce) clearTimeout(debounce)
        debounce = setTimeout(async () => {
          process.stdout.write('\x1Bc') // clear screen
          await runLint()
          process.stdout.write('\nWatching for changes...\n')
        }, 300)
      })

      // Keep process alive
      process.stdin.resume()

      process.on('SIGINT', () => {
        process.stdout.write('\nStopping watch.\n')
        process.exit(0)
      })
    } else {
      const exitCode = await runLint()
      process.exit(exitCode)
    }
  })

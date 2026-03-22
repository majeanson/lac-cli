import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline'

import { generateFeatureKey } from '@life-as-code/feature-schema'
import { extractFeature } from '@life-as-code/lac-claude'
import { Command } from 'commander'

import { findCandidates, titleFromDirName, type PartitionStrategy } from '../lib/partitioner.js'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExtractAllOptions {
  strategy: PartitionStrategy
  depth: number
  fill: boolean
  model: string
  dryRun: boolean
  prefix: string
  ignore: string
  initWorkspace: boolean
  skipConfirm: boolean
  concurrency: number
  resetStatus: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ensureLacDir(targetRoot: string): string {
  const lacDir = path.join(targetRoot, '.lac')
  if (!fs.existsSync(lacDir)) {
    fs.mkdirSync(lacDir, { recursive: true })
    const year = new Date().getFullYear()
    fs.writeFileSync(path.join(lacDir, 'counter'), `${year}\n0\n`, 'utf-8')
    process.stdout.write(`  ✓ Initialised .lac/ workspace at "${lacDir}"\n`)
  }
  return lacDir
}

function findLacDir(fromDir: string): string | null {
  let current = path.resolve(fromDir)
  while (true) {
    const candidate = path.join(current, '.lac')
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

function writeDraftFeatureJson(
  featureDir: string,
  featureKey: string,
  title: string,
  problem: string,
): void {
  fs.mkdirSync(featureDir, { recursive: true })
  const feature = {
    featureKey,
    title,
    status: 'draft',
    problem,
    schemaVersion: 1,
  }
  fs.writeFileSync(
    path.join(featureDir, 'feature.json'),
    JSON.stringify(feature, null, 2) + '\n',
    'utf-8',
  )
}

function mergeExtractedFields(
  featureDir: string,
  fields: Awaited<ReturnType<typeof extractFeature>>,
): void {
  const featurePath = path.join(featureDir, 'feature.json')
  const existing = JSON.parse(fs.readFileSync(featurePath, 'utf-8')) as Record<string, unknown>
  const updated = {
    ...existing,
    title: fields.title,
    problem: fields.problem,
    domain: fields.domain,
    tags: fields.tags,
    analysis: fields.analysis,
    decisions: fields.decisions,
    implementation: fields.implementation,
    knownLimitations: fields.knownLimitations,
    successCriteria: fields.successCriteria,
  }
  fs.writeFileSync(featurePath, JSON.stringify(updated, null, 2) + '\n', 'utf-8')
}

interface StatusSnapshot {
  dir: string
  status: string
}

function scanNonFreshStatuses(dirs: string[]): StatusSnapshot[] {
  const nonFresh: StatusSnapshot[] = []
  for (const dir of dirs) {
    const featurePath = path.join(dir, 'feature.json')
    if (!fs.existsSync(featurePath)) continue
    try {
      const parsed = JSON.parse(fs.readFileSync(featurePath, 'utf-8')) as Record<string, unknown>
      const status = String(parsed['status'] ?? 'draft')
      if (status !== 'draft' && status !== 'active') {
        nonFresh.push({ dir, status })
      }
    } catch { /* skip unreadable */ }
  }
  return nonFresh
}

function applyStatusReset(snapshots: StatusSnapshot[], toStatus: 'active' | 'draft'): number {
  let count = 0
  for (const { dir } of snapshots) {
    const featurePath = path.join(dir, 'feature.json')
    try {
      const parsed = JSON.parse(fs.readFileSync(featurePath, 'utf-8')) as Record<string, unknown>
      parsed['status'] = toStatus
      // Strip statusHistory so the old transitions don't carry over
      delete parsed['statusHistory']
      fs.writeFileSync(featurePath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8')
      count++
    } catch { /* skip unreadable */ }
  }
  return count
}

function wireLineage(
  featureDir: string,
  featureKey: string,
  parentDir: string | null,
  dirToKey: Map<string, string>,
): void {
  if (!parentDir) return

  const parentKey = dirToKey.get(parentDir)
  if (!parentKey) return

  // Patch child: set lineage.parent
  const childPath = path.join(featureDir, 'feature.json')
  const child = JSON.parse(fs.readFileSync(childPath, 'utf-8')) as Record<string, unknown>
  const childLineage = (child['lineage'] as Record<string, unknown> | undefined) ?? {}
  child['lineage'] = { ...childLineage, parent: parentKey }
  fs.writeFileSync(childPath, JSON.stringify(child, null, 2) + '\n', 'utf-8')

  // Patch parent: add to lineage.children
  const parentPath = path.join(parentDir, 'feature.json')
  if (!fs.existsSync(parentPath)) return
  const parent = JSON.parse(fs.readFileSync(parentPath, 'utf-8')) as Record<string, unknown>
  const parentLineage = (parent['lineage'] as Record<string, unknown> | undefined) ?? {}
  const children = (parentLineage['children'] as string[] | undefined) ?? []
  if (!children.includes(featureKey)) {
    parentLineage['children'] = [...children, featureKey]
    parent['lineage'] = parentLineage
    fs.writeFileSync(parentPath, JSON.stringify(parent, null, 2) + '\n', 'utf-8')
  }
}

// ─── Command ──────────────────────────────────────────────────────────────────

export const extractAllCommand = new Command('extract-all')
  .description('Walk a repository and generate feature.json files for every module/directory')
  .argument('[path]', 'Root directory to scan (default: current directory)')
  .option(
    '--strategy <strategy>',
    'Partitioning strategy: "module" (package boundaries) or "directory" (all dirs with source)',
    'module',
  )
  .option(
    '--depth <n>',
    'Max directory depth to descend (default: 4 for module, 2 for directory)',
  )
  .option('--fill', 'Fill all fields with Claude API after creating draft feature.jsons')
  .option('--model <model>', 'Claude model to use with --fill (default: claude-sonnet-4-6)', 'claude-sonnet-4-6')
  .option('--dry-run', 'Show what would be created without writing any files')
  .option('--prefix <prefix>', 'featureKey prefix (default: feat)', 'feat')
  .option(
    '--ignore <patterns>',
    'Comma-separated directory names to skip (added to built-in skip list)',
    '',
  )
  .option(
    '--init-workspace',
    'Create .lac/ directory in the target root if one is not found',
  )
  .option(
    '--skip-confirm',
    'Skip interactive prompts (useful for CI or scripted use)',
  )
  .option(
    '--concurrency <n>',
    'Number of parallel Claude API calls during --fill (default: 1)',
    '1',
  )
  .option(
    '--reset-status',
    'Reset frozen/deprecated feature.json statuses to active (fresh-start for a new project). Prompts if not set.',
  )
  .action(async (targetArg: string | undefined, opts: Partial<ExtractAllOptions>) => {
    const targetRoot = path.resolve(targetArg ?? process.cwd())
    const strategy = (opts.strategy ?? 'module') as PartitionStrategy
    const defaultDepth = strategy === 'directory' ? 2 : 4
    const maxDepth = opts.depth !== undefined ? Number(opts.depth) : defaultDepth
    const fill = opts.fill ?? false
    const model = opts.model ?? 'claude-sonnet-4-6'
    const dryRun = opts.dryRun ?? false
    const prefix = opts.prefix ?? 'feat'
    const ignore = (opts.ignore ?? '').split(',').map(s => s.trim()).filter(Boolean)
    const initWorkspace = opts.initWorkspace ?? false
    // Auto-skip confirm when --fill is set: the user already committed to the AI pass
    const skipConfirm = opts.skipConfirm ?? fill
    const concurrency = Math.max(1, Number(opts.concurrency ?? 1))
    const resetStatus = opts.resetStatus ?? false

    // ── Validate target ──────────────────────────────────────────────────────
    if (!fs.existsSync(targetRoot)) {
      process.stderr.write(`Error: path "${targetRoot}" does not exist.\n`)
      process.exit(1)
    }

    // ── Ensure .lac/ exists ───────────────────────────────────────────────────
    if (initWorkspace) {
      ensureLacDir(targetRoot)
    }

    const lacDir = findLacDir(targetRoot)
    if (!lacDir) {
      process.stderr.write(
        `Error: no .lac/ workspace found in "${targetRoot}" or any of its parents.\n` +
          `Run "lac workspace init" inside the target directory first, or pass --init-workspace.\n`,
      )
      process.exit(1)
    }

    // ── Discover candidates ───────────────────────────────────────────────────
    process.stdout.write(`\nScanning "${targetRoot}"...\n`)
    process.stdout.write(`  Strategy : ${strategy}   Depth: ${maxDepth}\n`)

    const { candidates, alreadyDocumented, skipped } = findCandidates(targetRoot, {
      strategy,
      maxDepth,
      ignore,
    })

    // Detect resumable dirs: have feature.json but key fields are all empty (interrupted fill)
    const resumable: string[] = []
    if (fill) {
      for (const docDir of alreadyDocumented) {
        const absDir = path.resolve(targetRoot, docDir)
        try {
          const raw = fs.readFileSync(path.join(absDir, 'feature.json'), 'utf-8')
          const parsed = JSON.parse(raw) as Record<string, unknown>
          const isEmpty = (v: unknown) =>
            v === undefined || v === null ||
            (typeof v === 'string' && v.startsWith('TODO:')) ||
            (Array.isArray(v) && v.length === 0)
          // Resume if analysis, decisions, and implementation are all empty/TODO
          if (isEmpty(parsed['analysis']) && isEmpty(parsed['decisions']) && isEmpty(parsed['implementation'])) {
            resumable.push(absDir)
          }
        } catch { /* ignore unreadable */ }
      }
    }

    if (alreadyDocumented.length > 0) {
      const skippedCount = alreadyDocumented.length - resumable.length
      if (skippedCount > 0) {
        process.stdout.write(`  Skipping ${skippedCount} already-documented director${skippedCount === 1 ? 'y' : 'ies'}.\n`)
      }
      if (resumable.length > 0) {
        process.stdout.write(`  Resuming ${resumable.length} incomplete fill${resumable.length === 1 ? '' : 's'} (draft with empty fields).\n`)
      }
    }
    if (skipped.length > 0) {
      process.stdout.write(`  Skipping ${skipped.length} unreadable director${skipped.length === 1 ? 'y' : 'ies'}.\n`)
    }

    // ── Status reset: handle frozen/deprecated existing features ─────────────
    const nonFreshSnapshots = scanNonFreshStatuses(
      alreadyDocumented.map(d => path.resolve(targetRoot, d)),
    )
    if (nonFreshSnapshots.length > 0) {
      const byStatus = nonFreshSnapshots.reduce<Record<string, number>>((acc, { status }) => {
        acc[status] = (acc[status] ?? 0) + 1
        return acc
      }, {})
      const summary = Object.entries(byStatus).map(([s, n]) => `${n} ${s}`).join(', ')

      if (resetStatus) {
        const n = applyStatusReset(nonFreshSnapshots, 'active')
        process.stdout.write(`  ✓ Reset ${n} feature${n === 1 ? '' : 's'} (${summary}) → active.\n`)
      } else if (!skipConfirm) {
        process.stdout.write(
          `\n  Found ${nonFreshSnapshots.length} existing feature${nonFreshSnapshots.length === 1 ? '' : 's'} with non-fresh statuses (${summary}).\n` +
          `  Reset to active for a fresh start? [y/N/skip]: `,
        )
        const answer = (await readLine()).toLowerCase()
        if (answer === 'y') {
          const n = applyStatusReset(nonFreshSnapshots, 'active')
          process.stdout.write(`  ✓ Reset ${n} feature${n === 1 ? '' : 's'} → active.\n`)
        } else if (answer !== 'skip') {
          process.stdout.write('  Statuses left unchanged.\n')
        }
      }
    }

    if (candidates.length === 0 && resumable.length === 0) {
      process.stdout.write('\nNo undocumented modules found.\n')
      if (strategy === 'module') {
        process.stdout.write(
          'Tip: try --strategy directory to include all directories with source files.\n',
        )
      }
      return
    }

    // ── Print plan ────────────────────────────────────────────────────────────
    process.stdout.write(`\nFound ${candidates.length} module${candidates.length === 1 ? '' : 's'} to document:\n\n`)

    for (const c of candidates) {
      const rel = c.relativePath || '.'
      const indent = c.parentDir ? '  └─ ' : '  '
      const hint = c.signals.length > 0 ? ` [${c.signals.slice(0, 2).join(', ')}]` : ''
      process.stdout.write(
        `${indent}${rel.padEnd(40)} ${String(c.sourceFileCount).padStart(3)} src files${hint}\n`,
      )
    }

    if (dryRun) {
      process.stdout.write('\n[dry-run] No files written.\n\n')
      return
    }

    // ── Interactive confirm (unless --skip-confirm) ───────────────────────────
    if (!skipConfirm) {
      const suffix = fill ? ' and fill all fields with Claude API' : ''
      process.stdout.write(`\nCreate ${candidates.length} draft feature.json file${candidates.length === 1 ? '' : 's'}${suffix}? [Y/n]: `)
      const answer = await readLine()
      if (answer.toLowerCase() === 'n') {
        process.stdout.write('Aborted.\n')
        return
      }
    }

    process.stdout.write('\n')

    // ── Phase 1: create all draft feature.jsons (always sequential — key counter) ──
    const dirToKey = new Map<string, string>()
    const created: string[] = []
    const failed: string[] = []

    for (const candidate of candidates) {
      const rel = candidate.relativePath || '.'
      try {
        const featureKey = generateFeatureKey(candidate.dir, prefix)
        dirToKey.set(candidate.dir, featureKey)
        const heuristicTitle = titleFromDirName(path.basename(candidate.dir))
        writeDraftFeatureJson(
          candidate.dir,
          featureKey,
          heuristicTitle,
          `TODO: describe what problem the ${heuristicTitle} module solves.`,
        )
        created.push(featureKey)
        process.stdout.write(`  ${rel} → ${featureKey} (draft)\n`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        process.stdout.write(`  ${rel} ✗ ${msg}\n`)
        failed.push(rel)
      }
    }

    // ── Phase 2: fill with AI (concurrent) ────────────────────────────────────
    if (fill && (created.length > 0 || resumable.length > 0)) {
      // Mix newly created + resumable (interrupted previous run)
      const resumableCandidates = resumable.map(dir => ({
        dir,
        relativePath: path.relative(targetRoot, dir),
        signals: [] as string[],
        sourceFileCount: 0,
        parentDir: null as string | null,
      }))
      const toFill = [
        ...candidates.filter(c => dirToKey.has(c.dir)),
        ...resumableCandidates,
      ]
      process.stdout.write(`\nFilling ${toFill.length} feature${toFill.length === 1 ? '' : 's'} with AI`)
      if (concurrency > 1) process.stdout.write(` (concurrency: ${concurrency})`)
      process.stdout.write('...\n')

      let doneCount = 0
      let fillFailed = 0

      // Simple promise pool
      async function fillOne(candidate: typeof toFill[number]): Promise<void> {
        const rel = candidate.relativePath || '.'
        try {
          const fields = await extractFeature({ dir: candidate.dir, model })
          mergeExtractedFields(candidate.dir, fields)
          doneCount++
          process.stdout.write(`  [${doneCount}/${toFill.length}] ${rel} ✓\n`)
        } catch (err) {
          fillFailed++
          const msg = err instanceof Error ? err.message.slice(0, 80) : String(err)
          process.stdout.write(`  [${doneCount + fillFailed}/${toFill.length}] ${rel} ⚠ ${msg}\n`)
        }
      }

      // Run in batches of `concurrency`
      for (let i = 0; i < toFill.length; i += concurrency) {
        const batch = toFill.slice(i, i + concurrency)
        await Promise.all(batch.map(fillOne))
      }

      if (fillFailed > 0) {
        process.stdout.write(`  ${fillFailed} fill${fillFailed === 1 ? '' : 's'} failed — drafts remain, run "lac fill <dir>" to retry.\n`)
      }
    }

    // ── Wire lineage ───────────────────────────────────────────────────────────
    let lineageCount = 0
    for (const candidate of candidates) {
      if (candidate.parentDir && dirToKey.has(candidate.dir)) {
        try {
          wireLineage(
            candidate.dir,
            dirToKey.get(candidate.dir)!,
            candidate.parentDir,
            dirToKey,
          )
          lineageCount++
        } catch {
          // Non-fatal: lineage wiring failure shouldn't abort
        }
      }
    }

    // ── Summary ────────────────────────────────────────────────────────────────
    process.stdout.write('\n')
    process.stdout.write(`✓ Created ${created.length} feature.json file${created.length === 1 ? '' : 's'}`)
    if (lineageCount > 0) process.stdout.write(`, wired ${lineageCount} parent/child link${lineageCount === 1 ? '' : 's'}`)
    if (failed.length > 0) process.stdout.write(`, ${failed.length} failed`)
    process.stdout.write('\n')

    process.stdout.write(
      `\nNext steps:\n` +
        (fill ? '' : `  lac fill --all        Fill all features with AI\n`) +
        `  lac lint              Check for incomplete features\n` +
        `  lac export --prompt . Bundle all features into a reconstruction prompt\n` +
        `  lac export --site .   Generate a static HTML site\n\n`,
    )
  })

function readLine(): Promise<string> {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.once('line', answer => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

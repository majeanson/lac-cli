import fs from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path, { basename } from 'node:path'
import process from 'node:process'
import readline from 'node:readline'

import { Command } from 'commander'

import { buildReconstructionPrompt } from './export.js'
import { scanFeatures } from '../lib/scanner.js'

// Files/dirs to always keep, regardless of what the user passes.
const DEFAULT_KEEP = new Set([
  'feature.json',
  'package.json',
  'package-lock.json',
  'bun.lock',
  'yarn.lock',
  'pnpm-lock.yaml',
  'tsconfig.json',
  'tsconfig.base.json',
  'vite.config.ts',
  'vite.config.js',
  'vitest.config.ts',
  'vitest.config.js',
  'next.config.ts',
  'next.config.js',
  'tailwind.config.ts',
  'tailwind.config.js',
  'postcss.config.js',
  'postcss.config.ts',
  '.gitignore',
  '.gitattributes',
  'README.md',
  'LICENSE',
  'Makefile',
  '.env.example',
  'turbo.json',
])

// Directories to always skip (don't enter or delete).
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.turbo',
  '.next',
  '.nuxt',
  '__pycache__',
  '.venv',
  'venv',
  'target',
  'vendor',
  'coverage',
])

interface CollectedFile {
  absolutePath: string
  relativePath: string
}

function collectDeletable(dir: string, keepNames: Set<string>): CollectedFile[] {
  const deletable: CollectedFile[] = []

  function walk(current: string): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
        walk(fullPath)
      } else if (entry.isFile()) {
        if (!keepNames.has(entry.name)) {
          deletable.push({
            absolutePath: fullPath,
            relativePath: path.relative(dir, fullPath).replace(/\\/g, '/'),
          })
        }
      }
    }
  }

  walk(dir)
  return deletable
}

function readLine(prompt: string): Promise<string> {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(prompt, answer => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

export const stripCommand = new Command('strip')
  .description(
    'Export a reconstruction prompt then delete all non-feature source files.\n' +
    'Useful for reducing a documented repo to its spec only.\n' +
    'Runs export --prompt first, shows a dry-run, then asks for confirmation.',
  )
  .argument('[path]', 'Root directory to strip (default: current directory)')
  .option('--out <file>', 'Write the reconstruction prompt to <file> before deleting')
  .option('--keep <names>', 'Comma-separated extra file names to preserve (added to built-in keep-list)', '')
  .option('--dry-run', 'Show what would be deleted without removing anything')
  .option('--yes', 'Skip the confirmation prompt')
  .action(async (targetArg: string | undefined, opts: { out?: string; keep?: string; dryRun?: boolean; yes?: boolean }) => {
    const targetDir = path.resolve(targetArg ?? process.cwd())

    if (!fs.existsSync(targetDir)) {
      process.stderr.write(`Error: path "${targetDir}" does not exist.\n`)
      process.exit(1)
    }

    // ── Step 1: export --prompt ─────────────────────────────────────────────
    process.stdout.write(`\nScanning "${targetDir}" for feature.json files...\n`)

    let features: Awaited<ReturnType<typeof scanFeatures>>
    try {
      features = await scanFeatures(targetDir)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      process.stderr.write(`Error scanning features: ${message}\n`)
      process.exit(1)
    }

    if (features.length === 0) {
      process.stderr.write(`Error: no valid feature.json files found in "${targetDir}". Run "lac extract-all" first.\n`)
      process.exit(1)
    }

    process.stdout.write(`  Found ${features.length} feature${features.length === 1 ? '' : 's'}.\n`)

    if (opts.out) {
      const outPath = path.resolve(opts.out)
      const prompt = buildReconstructionPrompt(features, basename(targetDir), targetDir)
      try {
        await writeFile(outPath, prompt, 'utf-8')
        process.stdout.write(`  ✓ Reconstruction prompt (${features.length} features) → ${opts.out}\n`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        process.stderr.write(`Warning: could not write reconstruction prompt to "${opts.out}": ${message}\n`)
      }
    } else {
      process.stdout.write(`\nTip: run "lac export --prompt ${targetArg ?? '.'} --out spec.md" to save the reconstruction prompt before stripping.\n`)
    }

    // ── Step 2: collect deletable files ────────────────────────────────────
    const extraKeep = (opts.keep ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    const keepNames = new Set([...DEFAULT_KEEP, ...extraKeep])

    const deletable = collectDeletable(targetDir, keepNames)

    if (deletable.length === 0) {
      process.stdout.write('\nNothing to delete — all source files are already in the keep-list.\n')
      return
    }

    // ── Step 3: dry-run output ─────────────────────────────────────────────
    process.stdout.write(`\nThe following ${deletable.length} file${deletable.length === 1 ? '' : 's'} would be deleted:\n\n`)
    for (const f of deletable) {
      process.stdout.write(`  - ${f.relativePath}\n`)
    }

    if (opts.dryRun) {
      process.stdout.write('\n[dry-run] No files deleted.\n')
      return
    }

    // ── Step 4: confirm ─────────────────────────────────────────────────────
    if (!opts.yes) {
      const answer = await readLine(`\nDelete ${deletable.length} file${deletable.length === 1 ? '' : 's'}? [y/N]: `)
      if (answer.toLowerCase() !== 'y') {
        process.stdout.write('Aborted.\n')
        return
      }
    }

    // ── Step 5: delete ──────────────────────────────────────────────────────
    let deleted = 0
    let failed = 0
    for (const f of deletable) {
      try {
        fs.unlinkSync(f.absolutePath)
        deleted++
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        process.stderr.write(`  Warning: could not delete "${f.relativePath}": ${message}\n`)
        failed++
      }
    }

    process.stdout.write(`\n✓ Deleted ${deleted} file${deleted === 1 ? '' : 's'}`)
    if (failed > 0) process.stdout.write(` (${failed} failed)`)
    process.stdout.write('\n')

    if (!opts.out) {
      process.stdout.write(
        '\nNext: run "lac export --prompt . --out spec.md" to generate the reconstruction prompt from the remaining feature.json files.\n',
      )
    }
  })

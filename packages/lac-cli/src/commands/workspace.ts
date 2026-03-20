import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'

import { Command } from 'commander'

import { computeCompleteness } from '../lib/config.js'
import { scanFeatures } from '../lib/scanner.js'

const LAC_DIR = '.lac'
const COUNTER_FILE = 'counter'

/**
 * Walk up from startDir looking for a .lac/ directory.
 * Returns the absolute path to .lac/ or null if not found.
 */
function findLacDir(startDir: string): string | null {
  let current = resolve(startDir)
  while (true) {
    const candidate = join(current, LAC_DIR)
    if (existsSync(candidate)) return candidate
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

export const workspaceCommand = new Command('workspace')
  .description('Manage the lac workspace (.lac/ directory)')

workspaceCommand
  .command('init')
  .description('Initialise a lac workspace in the current directory')
  .argument('[dir]', 'Directory to initialise (default: current directory)')
  .option('--force', 'Re-initialise even if a .lac/ directory already exists')
  .action((dir: string | undefined, options: { force?: boolean }) => {
    const targetDir = resolve(dir ?? process.cwd())
    const lacDir = join(targetDir, LAC_DIR)
    const counterPath = join(lacDir, COUNTER_FILE)

    if (existsSync(lacDir) && !options.force) {
      process.stdout.write(
        `lac workspace already initialised at "${lacDir}".\n` +
          `Run "lac workspace init --force" to reinitialise.\n`,
      )
      return
    }

    mkdirSync(lacDir, { recursive: true })

    if (!existsSync(counterPath) || options.force) {
      const year = new Date().getFullYear()
      writeFileSync(counterPath, `${year}\n0\n`, 'utf-8')
    }

    process.stdout.write(`✓ Initialised lac workspace at "${lacDir}"\n`)
    process.stdout.write(`  Run "lac init" inside a feature folder to create a feature.json.\n`)
  })

workspaceCommand
  .command('status')
  .description('Show workspace info (location, counter, next key, feature stats)')
  .action(async () => {
    const lacDir = findLacDir(process.cwd())

    if (!lacDir) {
      process.stdout.write(
        `No .lac/ workspace found in current directory or any parent.\n` +
          `Run "lac workspace init" to create one.\n`,
      )
      return
    }

    const counterPath = join(lacDir, COUNTER_FILE)
    if (!existsSync(counterPath)) {
      process.stdout.write(`Workspace : ${lacDir}\nCounter   : not initialised\n`)
      return
    }

    const raw = readFileSync(counterPath, 'utf-8').trim()
    const lines = raw.split('\n').map((l) => l.trim())
    const year = lines[0] ?? '?'
    const counterStr = lines[1] ?? '0'
    const counter = parseInt(counterStr, 10)
    const next = isNaN(counter) ? '001' : String(counter + 1).padStart(3, '0')

    process.stdout.write(`Workspace : ${lacDir}\n`)
    process.stdout.write(`Counter   : ${year}/${counterStr}\n`)
    process.stdout.write(`Next key  : feat-${year}-${next}\n`)

    // Scan for features and show stats
    const workspaceRoot = resolve(lacDir, '..')
    try {
      const features = await scanFeatures(workspaceRoot)
      process.stdout.write(`Features  : ${features.length}\n`)

      if (features.length === 0) {
        process.stdout.write(`\nNo features found. Run "lac init" in a subdirectory to create your first feature.\n`)
      } else {
        const completenessValues = features.map(({ feature }) =>
          computeCompleteness(feature as unknown as Record<string, unknown>),
        )
        const avg = Math.round(
          completenessValues.reduce((a, b) => a + b, 0) / completenessValues.length,
        )
        process.stdout.write(`Avg compl.: ${avg}%\n`)
      }
    } catch {
      // Non-fatal: just skip feature stats
    }
  })

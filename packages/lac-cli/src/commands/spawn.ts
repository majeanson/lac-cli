import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'

import { validateFeature } from '@life-as-code/feature-schema'
import { Command } from 'commander'
import prompts from 'prompts'

import { nextFeatureKey } from '../lib/featureKey.js'
import { scanFeatures } from '../lib/scanner.js'

const LAC_DIR = '.lac'

/**
 * Walk up from startDir looking for a .lac/ directory.
 * Returns the absolute path to the workspace root (the dir containing .lac/) or null.
 */
function findWorkspaceRoot(startDir: string): string | null {
  let current = resolve(startDir)
  while (true) {
    const candidate = join(current, LAC_DIR)
    if (existsSync(candidate)) return current
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

/**
 * Derives a short title from a problem statement by taking the first 6 words
 * and appending "..." when truncated.
 */
function titleFromProblem(problem: string): string {
  const words = problem.trim().split(/\s+/)
  if (words.length <= 6) return problem.trim()
  return words.slice(0, 6).join(' ') + '...'
}

/**
 * Slugifies the first 3 words of a string into kebab-case for use as a
 * default subdirectory name.
 */
function slugifyProblem(problem: string): string {
  return problem
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
}

export const spawnCommand = new Command('spawn')
  .description('Spawn a child feature from an existing parent feature')
  .argument('<parent-key>', 'featureKey of the parent feature (e.g. feat-2026-001)')
  .option('--reason <text>', 'Reason for spawning (default: empty)')
  .option('--dir <name>', 'Subdirectory name under parent dir (default: slug of problem)')
  .action(async (parentKey: string, options: { reason?: string; dir?: string }) => {
    const cwd = process.cwd()

    // 1. Find workspace root
    const workspaceRoot = findWorkspaceRoot(cwd)
    if (!workspaceRoot) {
      process.stderr.write(
        `Error: No .lac/ workspace found in current directory or any parent.\n` +
          `Run "lac workspace init" to create one.\n`,
      )
      process.exit(1)
    }

    // 2. Scan workspace for the parent feature
    let scanned: Awaited<ReturnType<typeof scanFeatures>>
    try {
      scanned = await scanFeatures(workspaceRoot)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      process.stderr.write(`Error scanning workspace "${workspaceRoot}": ${message}\n`)
      process.exit(1)
    }

    const parentEntry = scanned.find((s) => s.feature.featureKey === parentKey)
    if (!parentEntry) {
      process.stderr.write(
        `Error: parent feature "${parentKey}" not found in workspace.\n` +
          `Run "lac blame" or check your .lac/keys file to see available feature keys.\n`,
      )
      process.exit(1)
    }

    const parentDir = dirname(parentEntry.filePath)

    // 3. Prompt only for problem and status (the two required interactive prompts)
    const promptList: prompts.PromptObject[] = [
      {
        type: 'text',
        name: 'problem',
        message: 'What problem does this new feature solve?',
        validate: (value: string) =>
          value.trim().length > 0 ? true : 'Problem statement is required',
      },
      {
        type: 'select',
        name: 'status',
        message: 'Status?',
        choices: [
          { title: 'draft', value: 'draft' },
          { title: 'active', value: 'active' },
        ],
        initial: 0,
      },
    ]

    const answers = await prompts(promptList, {
      onCancel: () => {
        process.stderr.write('Aborted.\n')
        process.exit(1)
      },
    })

    const reason = options.reason ?? ''
    const problem = (answers.problem as string).trim()
    const status = answers.status as 'draft' | 'active'

    // 4. Determine subdirectory for the new feature.
    //    If the caller supplied --dir, use it exactly.
    //    Otherwise derive from the problem slug, but detect collisions and
    //    append an incrementing suffix so two features with the same first
    //    3 words never land in the same directory.
    let subdirName: string
    if (options.dir) {
      subdirName = options.dir
    } else {
      const baseSlug = slugifyProblem(problem)
      subdirName = baseSlug
      let suffix = 1
      while (existsSync(join(parentDir, subdirName))) {
        suffix++
        subdirName = `${baseSlug}-${suffix}`
      }
    }

    const newFeatureDir = join(parentDir, subdirName)

    // 5. Create the directory if it doesn't exist
    await mkdir(newFeatureDir, { recursive: true })

    // 6. Generate featureKey from the workspace root
    let featureKey: string
    try {
      featureKey = nextFeatureKey(newFeatureDir)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      process.stderr.write(`Error: ${message}\n\nTip: run "lac workspace init" first to create the .lac/ workspace.\n`)
      process.exit(1)
    }

    const title = titleFromProblem(problem)

    // 7. Build the feature object with lineage
    const feature = {
      featureKey,
      title,
      status,
      problem,
      lineage: {
        parent: parentKey,
        ...(reason ? { spawnReason: reason } : {}),
      },
    }

    // 8. Validate before writing
    const validation = validateFeature(feature)
    if (!validation.success) {
      process.stderr.write(
        `Internal error: generated feature did not pass validation:\n  ${validation.errors.join('\n  ')}\n`,
      )
      process.exit(1)
    }

    const featureJsonPath = join(newFeatureDir, 'feature.json')
    await writeFile(featureJsonPath, JSON.stringify(validation.data, null, 2) + '\n', 'utf-8')

    // 9. Print success
    process.stdout.write(`✓ Spawned ${featureKey} from ${parentKey} in ${newFeatureDir}\n`)
  })

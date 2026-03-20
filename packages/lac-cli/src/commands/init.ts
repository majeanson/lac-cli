import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'

import { validateFeature } from '@life-as-code/feature-schema'
import { Command } from 'commander'
import prompts from 'prompts'

import { nextFeatureKey } from '../lib/featureKey.js'

/**
 * Derives a short title from a problem statement by taking the first 6 words
 * and appending "..." when truncated.
 */
function titleFromProblem(problem: string): string {
  const words = problem.trim().split(/\s+/)
  if (words.length <= 6) return problem.trim()
  return words.slice(0, 6).join(' ') + '...'
}

export const initCommand = new Command('init')
  .description('Scaffold a feature.json in the current directory')
  .option('-f, --force', 'Overwrite existing feature.json', false)
  .action(async (options: { force: boolean }) => {
    const cwd = process.cwd()
    const featureJsonPath = join(cwd, 'feature.json')

    if (existsSync(featureJsonPath) && !options.force) {
      process.stderr.write(
        `Error: feature.json already exists in this directory.\nUse --force to overwrite.\n`,
      )
      process.exit(1)
    }

    // Interactive prompts
    const answers = await prompts(
      [
        {
          type: 'text',
          name: 'problem',
          message: 'What problem does this feature solve?',
          initial: 'e.g. Users cannot reset their password without contacting support',
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
      ],
      {
        onCancel: () => {
          process.stderr.write('Aborted.\n')
          process.exit(1)
        },
      },
    )

    const problem = (answers.problem as string).trim()
    const status = answers.status as 'draft' | 'active'

    // Generate featureKey — may throw if no .lac/ dir is found
    let featureKey: string
    try {
      featureKey = nextFeatureKey(cwd)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      process.stderr.write(`Error: ${message}\n\nTip: run "lac workspace init" first to create the .lac/ workspace.\n`)
      process.exit(1)
    }

    const title = titleFromProblem(problem)
    const wasTruncated = problem.trim().split(/\s+/).length > 6

    let finalTitle = title
    if (wasTruncated) {
      process.stdout.write(`\nTitle will be: "${title}"\n`)
      const titleAnswer = await prompts({
        type: 'text',
        name: 'customTitle',
        message: 'Custom title? (leave blank to use the above)',
        initial: '',
      })
      if (titleAnswer.customTitle && (titleAnswer.customTitle as string).trim().length > 0) {
        finalTitle = (titleAnswer.customTitle as string).trim()
      }
    }

    const feature = {
      featureKey,
      title: finalTitle,
      status,
      problem,
    }

    // Validate before writing (belt-and-suspenders)
    const validation = validateFeature(feature)
    if (!validation.success) {
      process.stderr.write(
        `Internal error: generated feature did not pass validation:\n  ${validation.errors.join('\n  ')}\n`,
      )
      process.exit(1)
    }

    await writeFile(featureJsonPath, JSON.stringify(validation.data, null, 2) + '\n', 'utf-8')

    process.stdout.write(`✓ Created feature.json — ${featureKey}\n`)
  })

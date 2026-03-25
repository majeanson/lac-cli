/**
 * lac config — show the resolved lac.config.json for the current workspace.
 *
 * Useful for verifying which settings are active, including defaults,
 * and checking guardlock configuration before running fill or lint.
 */

import path from 'node:path'
import process from 'node:process'

import { Command } from 'commander'

import { loadConfig } from '../lib/config.js'
import { findLacConfig } from '../lib/walker.js'

export const configCommand = new Command('config')
  .description('Show the resolved lac.config.json for the current workspace (including defaults)')
  .argument('[dir]', 'Directory to resolve config from (default: cwd)')
  .option('--json', 'Output as JSON')
  .action((dir: string | undefined, options: { json?: boolean }) => {
    const startDir = dir ? path.resolve(dir) : process.cwd()
    const configPath = findLacConfig(startDir)
    const config = loadConfig(startDir)

    if (options.json) {
      process.stdout.write(JSON.stringify(config, null, 2) + '\n')
      return
    }

    const source = configPath ? path.relative(startDir, configPath) : '(none — all defaults)'
    process.stdout.write(`\n  lac config  ·  ${source}\n\n`)

    process.stdout.write(`  version              ${config.version}\n`)
    process.stdout.write(`  domain               ${config.domain}\n`)
    process.stdout.write(`  defaultAuthor        ${config.defaultAuthor || '(not set)'}\n`)
    process.stdout.write(`  requiredFields       ${config.requiredFields.join(', ') || '(none)'}\n`)
    process.stdout.write(`  ciThreshold          ${config.ciThreshold}%\n`)
    process.stdout.write(`  lintStatuses         ${config.lintStatuses.join(', ')}\n`)

    process.stdout.write('\n  guardlock:\n')
    process.stdout.write(`    mode               ${config.guardlock.mode ?? 'warn'}\n`)
    const restricted = config.guardlock.restrictedFields ?? []
    process.stdout.write(`    restrictedFields   ${restricted.length > 0 ? restricted.join(', ') : '(none)'}\n`)
    process.stdout.write(`    requireAlternatives        ${config.guardlock.requireAlternatives ? 'true  ← advance_feature(frozen) will block if decisions lack alternativesConsidered' : 'false'}\n`)
    process.stdout.write(`    freezeRequiresHumanRevision ${config.guardlock.freezeRequiresHumanRevision ? 'true  ← advance_feature(frozen) will block if no revision entry exists' : 'false'}\n`)

    if (!configPath) {
      process.stdout.write('\n  No lac.config.json found — showing built-in defaults.\n')
      process.stdout.write('  Create one at the root of your workspace to customize:\n\n')
      process.stdout.write('  {\n')
      process.stdout.write('    "domain": "feat",\n')
      process.stdout.write('    "defaultAuthor": "your-name",\n')
      process.stdout.write('    "guardlock": {\n')
      process.stdout.write('      "mode": "block",\n')
      process.stdout.write('      "restrictedFields": ["problem"],\n')
      process.stdout.write('      "requireAlternatives": true\n')
      process.stdout.write('    }\n')
      process.stdout.write('  }\n\n')
    } else {
      process.stdout.write(`\n  Config loaded from: ${configPath}\n\n`)
    }
  })

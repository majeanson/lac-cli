import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

import { Command } from 'commander'

import { findGitDir } from '../lib/walker.js'

const LAC_MARKER = '# managed-by-lac'

const HOOK_SCRIPT = `#!/bin/sh
${LAC_MARKER}
# Provenance lint — runs lac lint before every commit.
# To remove: run "lac hooks uninstall"

# Find lac in PATH, or try npx as fallback
if command -v lac >/dev/null 2>&1; then
  LAC_CMD="lac"
else
  LAC_CMD="npx --yes lac"
fi

if ! $LAC_CMD lint --quiet 2>/tmp/lac-lint-output; then
  echo ""
  echo "lac pre-commit: lint failed — commit blocked"
  # Show failing feature keys from lint output
  if [ -s /tmp/lac-lint-output ]; then
    grep -o 'feat-[a-z0-9]*-[0-9]*\\|[a-z][a-z0-9]*-[0-9]\\{4\\}-[0-9]*' /tmp/lac-lint-output | sort -u | while read key; do
      echo "  ✗ $key"
    done
  fi
  echo ""
  echo "  Run \\"lac lint\\" for details."
  echo ""
  rm -f /tmp/lac-lint-output
  exit 1
fi
rm -f /tmp/lac-lint-output
`

const hooksCommand = new Command('hooks')
  .description('Manage git hooks for provenance linting')

hooksCommand
  .command('install')
  .description('Install a pre-commit hook that runs "lac lint" before each commit')
  .option('--force', 'Overwrite existing pre-commit hook even if not managed by lac')
  .action((options: { force?: boolean }) => {
    const gitDir = findGitDir(process.cwd())
    if (!gitDir) {
      process.stderr.write(`Error: no .git directory found. Are you inside a git repository?\n`)
      process.exit(1)
    }

    const hooksDir = join(gitDir, 'hooks')
    const hookPath = join(hooksDir, 'pre-commit')

    // Create hooks dir if it doesn't exist (bare repos)
    if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true })

    // Check existing hook
    if (existsSync(hookPath) && !options.force) {
      const existing = readFileSync(hookPath, 'utf-8')
      if (!existing.includes(LAC_MARKER)) {
        process.stderr.write(
          `Error: a pre-commit hook already exists at "${hookPath}" and was not installed by lac.\n` +
          `Use --force to overwrite it.\n`,
        )
        process.exit(1)
      }
    }

    writeFileSync(hookPath, HOOK_SCRIPT, 'utf-8')
    chmodSync(hookPath, 0o755)

    process.stdout.write(`✓ Installed pre-commit hook at ${hookPath}\n`)
    process.stdout.write(`  "lac lint" will run before every commit.\n`)
    process.stdout.write(`  To remove: run "lac hooks uninstall"\n`)
  })

hooksCommand
  .command('uninstall')
  .description('Remove the lac-managed pre-commit hook')
  .action(() => {
    const gitDir = findGitDir(process.cwd())
    if (!gitDir) {
      process.stderr.write(`Error: no .git directory found.\n`)
      process.exit(1)
    }

    const hookPath = join(gitDir, 'hooks', 'pre-commit')

    if (!existsSync(hookPath)) {
      process.stdout.write(`No pre-commit hook found at "${hookPath}".\n`)
      return
    }

    const content = readFileSync(hookPath, 'utf-8')
    if (!content.includes(LAC_MARKER)) {
      process.stderr.write(
        `Error: the pre-commit hook at "${hookPath}" was not installed by lac.\n` +
        `Remove it manually if you want to uninstall it.\n`,
      )
      process.exit(1)
    }

    rmSync(hookPath)
    process.stdout.write(`✓ Removed lac pre-commit hook from ${hookPath}\n`)
  })

hooksCommand
  .command('status')
  .description('Show whether the lac pre-commit hook is installed')
  .action(() => {
    const gitDir = findGitDir(process.cwd())
    if (!gitDir) {
      process.stdout.write(`Not inside a git repository.\n`)
      return
    }

    const hookPath = join(gitDir, 'hooks', 'pre-commit')
    if (!existsSync(hookPath)) {
      process.stdout.write(`pre-commit hook: not installed\n`)
      return
    }

    const content = readFileSync(hookPath, 'utf-8')
    if (content.includes(LAC_MARKER)) {
      process.stdout.write(`pre-commit hook: ✓ installed (managed by lac)\n`)
    } else {
      process.stdout.write(`pre-commit hook: installed (NOT managed by lac — foreign hook)\n`)
    }
  })

export { hooksCommand }

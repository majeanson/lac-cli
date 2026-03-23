import { Command } from 'commander'
import { archiveCommand } from './commands/archive.js'
import { extractAllCommand } from './commands/extract-all.js'
import { fillCommand } from './commands/fill.js'
import { genCommand } from './commands/gen.js'
import { logCommand } from './commands/log.js'
import { mergeCommand } from './commands/merge.js'
import { revisionsCommand } from './commands/revisions.js'
import { supersedeCommand } from './commands/supersede.js'
import { blameCommand } from './commands/blame.js'
import { diffCommand } from './commands/diff.js'
import { doctorCommand } from './commands/doctor.js'
import { exportCommand } from './commands/export.js'
import { hooksCommand } from './commands/hooks.js'
import { initCommand } from './commands/init.js'
import { lineageCommand } from './commands/lineage.js'
import { lintCommand } from './commands/lint.js'
import { importCommand } from './commands/import.js'
import { renameCommand } from './commands/rename.js'
import { searchCommand } from './commands/search.js'
import { serveCommand } from './commands/serve.js'
import { spawnCommand } from './commands/spawn.js'
import { statCommand } from './commands/stat.js'
import { stripCommand } from './commands/strip.js'
import { tagCommand } from './commands/tag.js'
import { workspaceCommand } from './commands/workspace.js'

const program = new Command()
program
  .name('lac')
  .description('life-as-code CLI — provenance for your features')
  .version('1.0.0')

// ── Core workflow ──────────────────────────────────────────────────────────
program.addCommand(initCommand)
program.addCommand(spawnCommand)
program.addCommand(workspaceCommand)
program.addCommand(lintCommand)
program.addCommand(searchCommand)
program.addCommand(statCommand)
program.addCommand(exportCommand)

// ── Authoring & enrichment ─────────────────────────────────────────────────
program.addCommand(fillCommand)
program.addCommand(genCommand)
program.addCommand(tagCommand)
program.addCommand(renameCommand)
program.addCommand(importCommand)
program.addCommand(extractAllCommand)

// ── History & analysis ─────────────────────────────────────────────────────
program.addCommand(logCommand)
program.addCommand(lineageCommand)
program.addCommand(diffCommand)
program.addCommand(blameCommand)
program.addCommand(revisionsCommand)

// ── Lifecycle management ───────────────────────────────────────────────────
program.addCommand(archiveCommand)
program.addCommand(supersedeCommand)
program.addCommand(mergeCommand)
program.addCommand(stripCommand)

// ── Tooling & infra ────────────────────────────────────────────────────────
program.addCommand(serveCommand)
program.addCommand(hooksCommand)
program.addCommand(doctorCommand)

// Custom help formatter — groups commands with section dividers
const GROUPS: Array<{ label: string; names: string[] }> = [
  { label: 'Core workflow', names: ['init', 'spawn', 'workspace', 'lint', 'search', 'stat', 'export'] },
  { label: 'Authoring & enrichment', names: ['fill', 'gen', 'tag', 'rename', 'import', 'extract-all'] },
  { label: 'History & analysis', names: ['log', 'lineage', 'diff', 'blame', 'revisions'] },
  { label: 'Lifecycle management', names: ['archive', 'supersede', 'merge', 'strip'] },
  { label: 'Tooling & infra', names: ['serve', 'hooks', 'doctor'] },
]

program.configureHelp({
  formatHelp(cmd, helper) {
    const termWidth = helper.helpWidth ?? 80
    const indent = '  '

    const lines: string[] = []

    // Usage
    lines.push(`Usage: ${helper.commandUsage(cmd)}`, '')

    // Description
    const desc = helper.commandDescription(cmd)
    if (desc) lines.push(desc, '')

    // Options
    const opts = helper.visibleOptions(cmd)
    if (opts.length) {
      lines.push('Options:')
      for (const opt of opts) {
        const term = helper.optionTerm(opt).padEnd(28)
        lines.push(`${indent}${term}${helper.optionDescription(opt)}`)
      }
      lines.push('')
    }

    // Grouped commands
    const allCmds = helper.visibleCommands(cmd)
    const cmdMap = new Map(allCmds.map(c => [c.name(), c]))

    lines.push('Commands:')
    for (const group of GROUPS) {
      lines.push(`${indent}── ${group.label} ${'─'.repeat(Math.max(0, termWidth - indent.length - group.label.length - 5))}`)
      for (const name of group.names) {
        const c = cmdMap.get(name)
        if (!c) continue
        const term = helper.subcommandTerm(c).padEnd(28)
        lines.push(`${indent}${term}${helper.subcommandDescription(c)}`)
      }
    }
    lines.push('')

    return lines.join('\n')
  },
})

program.parse()

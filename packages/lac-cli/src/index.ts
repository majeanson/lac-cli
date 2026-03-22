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

program.addCommand(workspaceCommand)
program.addCommand(spawnCommand)
program.addCommand(initCommand)
program.addCommand(exportCommand)
program.addCommand(lintCommand)
program.addCommand(blameCommand)
program.addCommand(hooksCommand)
program.addCommand(serveCommand)
program.addCommand(tagCommand)
program.addCommand(archiveCommand)
program.addCommand(doctorCommand)
program.addCommand(searchCommand)
program.addCommand(statCommand)
program.addCommand(lineageCommand)
program.addCommand(diffCommand)
program.addCommand(renameCommand)
program.addCommand(importCommand)
program.addCommand(fillCommand)
program.addCommand(extractAllCommand)
program.addCommand(genCommand)
program.addCommand(logCommand)
program.addCommand(mergeCommand)
program.addCommand(revisionsCommand)
program.addCommand(supersedeCommand)
program.addCommand(stripCommand)

program.parse()

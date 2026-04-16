import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

import { Command } from 'commander'

import { genFromFeature, genWithCustomPrompt } from '@life-as-code/lac-claude'

import { findNearestFeatureJson, findLacConfig } from '../lib/walker.js'
import { scanFeatures } from '../lib/scanner.js'
import { loadConfig, type GeneratorConfig } from '../lib/config.js'

// Feature-scoped: generates from a single feature.json
const FEATURE_GEN_TYPES = ['component', 'test', 'migration', 'docs', 'types', 'adr', 'snippets', 'mock'] as const
// Workspace-scoped: scans all features in the workspace
const WORKSPACE_GEN_TYPES = ['index'] as const
const ALL_GEN_TYPES = [...FEATURE_GEN_TYPES, ...WORKSPACE_GEN_TYPES] as const
type FeatureGenType = (typeof FEATURE_GEN_TYPES)[number]

export const genCommand = new Command('gen')
  .description('Generate code artifacts from feature.json(s)')
  .argument('[dir]', 'Feature folder or workspace root (default: nearest feature.json / cwd)')
  .option(`--type <type>`, `Built-in generator: ${ALL_GEN_TYPES.join(', ')}`)
  .option('--generator <name>', 'Run a named generator from lac.config.json generators block')
  .option('--list', 'List all available generators (built-in + config-defined)')
  .option('--dry-run', 'Print generated content without writing to disk')
  .option('--out <file>', 'Output file path (default: auto-named)')
  .option('--model <model>', 'Claude model to use (default: claude-sonnet-4-6)')
  .action(
    async (
      dir: string | undefined,
      options: {
        type?: string
        generator?: string
        list?: boolean
        dryRun?: boolean
        out?: string
        model?: string
      },
    ) => {
      const cwd = process.cwd()
      const startDir = dir ? resolve(dir) : cwd
      const config = loadConfig(startDir)
      // Resolve script/template paths relative to the lac.config.json file, not the scan dir
      const configFilePath = findLacConfig(startDir)
      const configDir = configFilePath ? dirname(configFilePath) : startDir

      // ── --list ─────────────────────────────────────────────────────────────────
      if (options.list) {
        process.stdout.write('\nBuilt-in generator types:\n')
        for (const t of ALL_GEN_TYPES) {
          const scope = (WORKSPACE_GEN_TYPES as readonly string[]).includes(t) ? 'workspace' : 'feature'
          process.stdout.write(`  ${t.padEnd(12)} [${scope}]\n`)
        }
        const customEntries = Object.entries(config.generators)
        if (customEntries.length === 0) {
          process.stdout.write('\nCustom generators (lac.config.json): none\n')
          process.stdout.write('  Add a "generators" block to your lac.config.json to define custom generators.\n')
        } else {
          process.stdout.write('\nCustom generators (lac.config.json):\n')
          for (const [name, gen] of customEntries) {
            const scope = gen.scope ?? 'feature'
            const desc = gen.description ? ` — ${gen.description}` : ''
            process.stdout.write(`  ${name.padEnd(16)} [${gen.type}/${scope}]${desc}\n`)
          }
        }
        process.stdout.write('\n')
        return
      }

      // ── --generator <name> (config plugin) ────────────────────────────────────
      if (options.generator) {
        const genDef = config.generators[options.generator]
        if (!genDef) {
          const available = Object.keys(config.generators)
          process.stderr.write(
            `Unknown generator "${options.generator}". Available: ${
              available.length > 0 ? available.join(', ') : '(none — add generators to lac.config.json)'
            }\n`,
          )
          process.exit(1)
        }
        try {
          await runPluginGenerator(options.generator, genDef, startDir, configDir, {
            dryRun: options.dryRun ?? false,
            out: options.out,
            model: options.model,
          })
        } catch (err) {
          process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
          process.exit(1)
        }
        return
      }

      // ── Built-in --type ────────────────────────────────────────────────────────
      const type = options.type ?? 'component'
      if (!(ALL_GEN_TYPES as readonly string[]).includes(type)) {
        process.stderr.write(
          `Unknown type "${type}". Available: ${ALL_GEN_TYPES.join(', ')}\n`,
        )
        process.exit(1)
      }

      // Workspace-scoped: index
      if (type === 'index') {
        try {
          await runIndexGenerator(startDir, { dryRun: options.dryRun ?? false, out: options.out })
        } catch (err) {
          process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
          process.exit(1)
        }
        return
      }

      // Feature-scoped: resolve nearest feature.json
      let featureDir: string
      if (dir) {
        featureDir = resolve(dir)
      } else {
        const found = findNearestFeatureJson(cwd)
        if (!found) {
          process.stderr.write(
            'No feature.json found from current directory.\n' +
            'Run "lac init" to create one, or pass a path: lac gen src/auth/ --type test\n',
          )
          process.exit(1)
        }
        featureDir = dirname(found)
      }

      try {
        await genFromFeature({
          featureDir,
          type: type as FeatureGenType,
          dryRun: options.dryRun ?? false,
          outFile: options.out,
          model: options.model,
        })
      } catch (err) {
        process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
        process.exit(1)
      }
    },
  )

// ── index generator (workspace-level barrel) ─────────────────────────────────

async function runIndexGenerator(startDir: string, opts: { dryRun: boolean; out?: string }): Promise<void> {
  process.stdout.write(`\nScanning workspace for publicInterface entries...\n`)
  const scanned = await scanFeatures(startDir)

  const lines: string[] = [
    `// Generated by lac gen --type index`,
    `// Workspace public-interface barrel`,
    `// Do not edit manually — regenerate with: lac gen --type index`,
    `// Generated: ${new Date().toISOString().slice(0, 10)}`,
    ``,
  ]

  let totalExports = 0
  let featuresWithInterface = 0

  for (const { feature } of scanned) {
    const feat = feature as Record<string, unknown>
    const iface = feat['publicInterface'] as Array<{ name: string; type: string; description?: string }> | undefined
    if (!iface || iface.length === 0) continue

    featuresWithInterface++
    const file = typeof feat['componentFile'] === 'string' ? feat['componentFile'] : undefined
    lines.push(`// ── ${feature.featureKey} — ${feature.title}`)
    for (const e of iface) {
      const importPath = file ? file.split(',')[0]?.trim() ?? feature.featureKey : `./${feature.featureKey}`
      lines.push(`// export { ${e.name} } from '${importPath}'`)
      totalExports++
    }
    lines.push(``)
  }

  if (totalExports === 0) {
    lines.push(`// No publicInterface entries found across ${scanned.length} feature(s).`)
    lines.push(`// Add publicInterface[] to your feature.jsons to populate this barrel.`)
    lines.push(``)
  }

  const content = lines.join('\n')
  const outPath = opts.out ?? resolve(startDir, 'index.generated.ts')

  if (opts.dryRun) {
    process.stdout.write(content)
    process.stdout.write(`\n\n  [dry-run] No file written.\n`)
    return
  }

  writeFileSync(outPath, content, 'utf-8')
  process.stdout.write(
    `  ✓ index → ${outPath}\n` +
    `    ${totalExports} export(s) from ${featuresWithInterface}/${scanned.length} features\n\n`,
  )
}

// ── plugin generator runner ───────────────────────────────────────────────────

interface PluginRunOpts { dryRun: boolean; out?: string; model?: string }

async function runPluginGenerator(
  name: string,
  gen: GeneratorConfig,
  startDir: string,
  configDir: string,
  opts: PluginRunOpts,
): Promise<void> {
  const scope = gen.scope ?? 'feature'

  // Gather features matching filters
  let features: Record<string, unknown>[]
  if (scope === 'workspace') {
    const scanned = await scanFeatures(startDir)
    features = scanned
      .map(s => s.feature as Record<string, unknown>)
      .filter(f => {
        if (gen.filterStatus && !gen.filterStatus.includes((f['status'] as 'draft' | 'active' | 'frozen' | 'deprecated'))) return false
        if (gen.filterTags) {
          const ftags = (f['tags'] as string[] | undefined) ?? []
          if (!gen.filterTags.some(t => ftags.includes(t))) return false
        }
        return true
      })
  } else {
    const found = findNearestFeatureJson(startDir)
    if (!found) throw new Error(`No feature.json found from "${startDir}"`)
    const raw = readFileSync(found, 'utf-8')
    features = [JSON.parse(raw) as Record<string, unknown>]
  }

  process.stdout.write(`\nGenerator "${name}" [${gen.type}/${scope}] — ${features.length} feature(s)\n`)

  if (gen.type === 'script') {
    // Script generator: pipe JSON to stdin, read stdout
    // Paths are resolved relative to the lac.config.json directory
    if (!gen.script) throw new Error(`Generator "${name}": missing "script" path.`)
    const scriptPath = resolve(configDir, gen.script)
    const input = JSON.stringify(scope === 'workspace' ? features : features[0], null, 2)
    const result = spawnSync('node', [scriptPath], { input, encoding: 'utf-8', cwd: configDir })
    if (result.error || result.status !== 0) {
      const msg = result.stderr || (result.error?.message ?? `exit ${result.status}`)
      throw new Error(`Script failed: ${msg}`)
    }
    writeOrPrintPlugin(result.stdout ?? '', name, gen, features, configDir, opts)

  } else if (gen.type === 'template') {
    // Template generator: lightweight {{field}} substitution
    if (!gen.template) throw new Error(`Generator "${name}": missing "template" path.`)
    const templatePath = resolve(configDir, gen.template)
    let template: string
    try {
      template = readFileSync(templatePath, 'utf-8')
    } catch {
      throw new Error(`Cannot read template: ${templatePath}`)
    }
    if (scope === 'workspace') {
      const ctx: Record<string, unknown> = { features, count: features.length }
      writeOrPrintPlugin(renderTemplate(template, ctx), name, gen, features, configDir, opts)
    } else {
      for (const f of features) {
        writeOrPrintPlugin(renderTemplate(template, f), name, gen, [f], configDir, opts)
      }
    }

  } else if (gen.type === 'ai') {
    // AI generator: custom system prompt via Claude
    if (!gen.systemPrompt) throw new Error(`Generator "${name}": missing "systemPrompt".`)
    let systemPrompt: string
    if (gen.systemPrompt.endsWith('.md') || gen.systemPrompt.endsWith('.txt')) {
      try {
        systemPrompt = readFileSync(resolve(configDir, gen.systemPrompt), 'utf-8')
      } catch {
        throw new Error(`Cannot read systemPrompt file: ${gen.systemPrompt}`)
      }
    } else {
      systemPrompt = gen.systemPrompt
    }
    for (const f of features) {
      const featureDir = startDir // best approximation without per-feature path
      const outFile = resolveOutputPath(opts.out ?? gen.outputFile, f, configDir)
      await genWithCustomPrompt({ featureDir, systemPrompt, dryRun: opts.dryRun, outFile, model: opts.model })
    }
  }
}

/** Lightweight template engine: replaces {{field}} with feature values */
function renderTemplate(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = ctx[key]
    if (val === undefined || val === null) return ''
    if (typeof val === 'string') return val
    return JSON.stringify(val)
  })
}

function resolveOutputPath(
  pattern: string | undefined,
  f: Record<string, unknown>,
  startDir: string,
): string | undefined {
  if (!pattern) return undefined
  const slug = String(f['title'] ?? 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return resolve(
    startDir,
    pattern
      .replace(/\{featureKey\}/g, String(f['featureKey'] ?? 'unknown'))
      .replace(/\{domain\}/g, String(f['domain'] ?? 'misc'))
      .replace(/\{status\}/g, String(f['status'] ?? 'draft'))
      .replace(/\{title\}/g, slug),
  )
}

function writeOrPrintPlugin(
  output: string,
  name: string,
  gen: GeneratorConfig,
  features: Record<string, unknown>[],
  baseDir: string,
  opts: PluginRunOpts,
): void {
  if (opts.dryRun) {
    process.stdout.write(output)
    process.stdout.write(`\n\n  [dry-run] No file written.\n`)
    return
  }
  const outPath = resolveOutputPath(opts.out ?? gen.outputFile, features[0] ?? {}, baseDir)
  if (!outPath) {
    process.stdout.write(output)
    return
  }
  writeFileSync(outPath, output, 'utf-8')
  process.stdout.write(`  ✓ "${name}" → ${outPath}\n`)
}

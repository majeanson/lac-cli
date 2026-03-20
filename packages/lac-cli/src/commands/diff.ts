import process from 'node:process'

import { Command } from 'commander'

import { scanFeatures } from '../lib/scanner.js'

/**
 * Stable JSON serialisation that sorts object keys recursively so that two
 * objects with the same content but different insertion order compare equal.
 */
function stableStringify(val: unknown): string {
  if (val === null || typeof val !== 'object') return JSON.stringify(val)
  if (Array.isArray(val)) return `[${val.map(stableStringify).join(',')}]`
  const sorted = Object.keys(val as Record<string, unknown>)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify((val as Record<string, unknown>)[k])}`)
  return `{${sorted.join(',')}}`
}

function formatValue(val: unknown): string {
  if (val === undefined || val === null) return '(empty)'
  if (typeof val === 'string') return val.length > 80 ? val.slice(0, 77) + '...' : val
  return JSON.stringify(val)
}

export const diffCommand = new Command('diff')
  .description('Compare two features field-by-field')
  .argument('<key1>', 'First featureKey')
  .argument('<key2>', 'Second featureKey')
  .option('-d, --dir <path>', 'Directory to scan (default: cwd)')
  .action(async (key1: string, key2: string, options: { dir?: string }) => {
    const scanDir = options.dir ?? process.cwd()

    let features: Awaited<ReturnType<typeof scanFeatures>>
    try {
      features = await scanFeatures(scanDir)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      process.stderr.write(`Error scanning "${scanDir}": ${message}\n`)
      process.exit(1)
    }

    const f1 = features.find((f) => f.feature.featureKey === key1)
    const f2 = features.find((f) => f.feature.featureKey === key2)

    if (!f1) {
      process.stderr.write(`Error: feature "${key1}" not found in "${scanDir}"\n`)
      process.exit(1)
    }
    if (!f2) {
      process.stderr.write(`Error: feature "${key2}" not found in "${scanDir}"\n`)
      process.exit(1)
    }

    const obj1 = f1.feature as unknown as Record<string, unknown>
    const obj2 = f2.feature as unknown as Record<string, unknown>

    const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)])

    const lines: string[] = []
    lines.push(`diff ${key1} → ${key2}`)
    lines.push('─'.repeat(60))

    let hasDiffs = false
    for (const field of allKeys) {
      const v1 = obj1[field]
      const v2 = obj2[field]

      const s1 = stableStringify(v1)
      const s2 = stableStringify(v2)

      if (s1 === s2) continue
      hasDiffs = true

      if (v1 === undefined) {
        lines.push(`+ ${field}: ${formatValue(v2)}`)
      } else if (v2 === undefined) {
        lines.push(`- ${field}: ${formatValue(v1)}`)
      } else {
        lines.push(`~ ${field}:`)
        lines.push(`    OLD: ${formatValue(v1)}`)
        lines.push(`    NEW: ${formatValue(v2)}`)
      }
    }

    if (!hasDiffs) {
      lines.push('(no differences)')
    }

    process.stdout.write(lines.join('\n') + '\n')
  })

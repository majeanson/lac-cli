import process from 'node:process'

import type { Feature } from '@life-as-code/feature-schema'
import { Command } from 'commander'

import { scanFeatures } from '../lib/scanner.js'

interface FeatureNode {
  key: string
  status: string
  title: string
  priority?: number
  children: FeatureNode[]
}

/**
 * Build a lineage tree rooted at the given featureKey.
 * Children are features that list this key as their lineage.parent.
 */
function buildTree(
  key: string,
  byKey: Map<string, Feature>,
  childrenOf: Map<string, string[]>,
  visited = new Set<string>(),
): FeatureNode {
  visited.add(key)
  const feature = byKey.get(key)
  const childKeys = childrenOf.get(key) ?? []

  const children: FeatureNode[] = []
  for (const ck of childKeys) {
    if (!visited.has(ck)) {
      children.push(buildTree(ck, byKey, childrenOf, visited))
    }
  }

  children.sort((a, b) => (a.priority ?? 9999) - (b.priority ?? 9999))

  return {
    key,
    status: feature?.status ?? 'unknown',
    title: feature?.title ?? '(unknown)',
    priority: feature?.priority,
    children,
  }
}

/**
 * Render a FeatureNode tree as ASCII art.
 */
function renderTree(node: FeatureNode, prefix = '', isLast = true): string[] {
  const connector = isLast ? '└── ' : '├── '
  const lines = [
    `${prefix}${prefix === '' ? '' : connector}${node.key} (${node.status}) — ${node.title}`,
  ]

  const childPrefix = prefix + (isLast ? '    ' : '│   ')
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]
    if (child) {
      const childLines = renderTree(child, childPrefix, i === node.children.length - 1)
      lines.push(...childLines)
    }
  }
  return lines
}

export const lineageCommand = new Command('lineage')
  .description('Show the lineage tree (parent → key → children) for a feature')
  .argument('<key>', 'featureKey to inspect (e.g. feat-2026-001)')
  .option('-d, --dir <path>', 'Directory to scan (default: cwd)')
  .action(async (key: string, options: { dir?: string }) => {
    const scanDir = options.dir ?? process.cwd()

    let features: Awaited<ReturnType<typeof scanFeatures>>
    try {
      features = await scanFeatures(scanDir)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      process.stderr.write(`Error scanning "${scanDir}": ${message}\n`)
      process.exit(1)
    }

    const byKey = new Map<string, Feature>()
    const childrenOf = new Map<string, string[]>()

    for (const { feature } of features) {
      byKey.set(feature.featureKey, feature)
      const parent = feature.lineage?.parent
      if (parent) {
        const existing = childrenOf.get(parent) ?? []
        existing.push(feature.featureKey)
        childrenOf.set(parent, existing)
      }
    }

    if (!byKey.has(key)) {
      process.stderr.write(`Error: feature "${key}" not found in "${scanDir}"\n`)
      process.exit(1)
    }

    // Find the root of the lineage chain
    let rootKey = key
    const seen = new Set<string>()
    while (true) {
      seen.add(rootKey)
      const feat = byKey.get(rootKey)
      const parent = feat?.lineage?.parent
      if (!parent || !byKey.has(parent) || seen.has(parent)) break
      rootKey = parent
    }

    const tree = buildTree(rootKey, byKey, childrenOf)
    const lines = renderTree(tree)

    process.stdout.write(lines.join('\n') + '\n')
  })

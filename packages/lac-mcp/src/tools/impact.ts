import fs from 'node:fs'
import path from 'node:path'

import type { Feature } from '@life-as-code/feature-schema'
import { validateFeature } from '@life-as-code/feature-schema'

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: true
}

interface ScannedFeature { feature: Feature; filePath: string }

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.vue', '.svelte'])

function scanFeatures(dir: string): ScannedFeature[] {
  const results: ScannedFeature[] = []
  walkFeatures(dir, results)
  return results
}

function walkFeatures(dir: string, results: ScannedFeature[]): void {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
      if (['node_modules', '.git', 'dist'].includes(e.name)) continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walkFeatures(full, results)
      else if (e.name === 'feature.json') {
        try {
          const parsed = JSON.parse(fs.readFileSync(full, 'utf-8')) as unknown
          const r = validateFeature(parsed)
          if (r.success) results.push({ feature: r.data, filePath: full })
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}

function getSourceFiles(dir: string): string[] {
  const files: string[] = []
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
      if (['node_modules', '.git', 'dist'].includes(e.name)) continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) files.push(...getSourceFiles(full))
      else if (SOURCE_EXTENSIONS.has(path.extname(e.name))) files.push(full)
    }
  } catch { /* ignore */ }
  return files
}

function findOwningFeatureKey(filePath: string): string | null {
  let current = path.dirname(filePath)
  while (true) {
    const candidate = path.join(current, 'feature.json')
    if (fs.existsSync(candidate)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(candidate, 'utf-8')) as unknown
        const r = validateFeature(parsed)
        if (r.success) return r.data.featureKey
      } catch { /* ignore */ }
    }
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

export function handleCrossFeatureImpact(
  a: Record<string, unknown>,
  workspaceRoot: string,
): ToolResult {
  if (!a.file) return { content: [{ type: 'text', text: 'file parameter is required' }], isError: true }

  const targetFile = path.isAbsolute(String(a.file))
    ? String(a.file)
    : path.resolve(workspaceRoot, String(a.file))

  if (!fs.existsSync(targetFile)) {
    return { content: [{ type: 'text', text: `File not found: "${targetFile}"` }], isError: true }
  }

  const targetBasename = path.basename(targetFile)
  const targetNoExt = path.basename(targetFile, path.extname(targetFile))
  const targetRelFromRoot = path.relative(workspaceRoot, targetFile).replace(/\\/g, '/')

  // Search patterns: match any of these in source file content
  const patterns = [...new Set([targetBasename, targetNoExt, targetRelFromRoot])]

  const owningKey = findOwningFeatureKey(targetFile)
  const features = scanFeatures(workspaceRoot)

  type Impact = { feature: Feature; matchedFiles: string[]; patterns: string[] }
  const impacts: Impact[] = []

  for (const { feature, filePath: featureJsonPath } of features) {
    if (feature.featureKey === owningKey) continue
    const featureDir = path.dirname(featureJsonPath)
    const sourceFiles = getSourceFiles(featureDir)

    const matchedFiles: string[] = []
    const matchedPatterns: string[] = []

    for (const srcFile of sourceFiles) {
      if (srcFile === targetFile) continue
      try {
        const content = fs.readFileSync(srcFile, 'utf-8')
        const matched = patterns.filter(p => content.includes(p))
        if (matched.length > 0) {
          matchedFiles.push(path.relative(featureDir, srcFile))
          matchedPatterns.push(...matched)
        }
      } catch { /* ignore */ }
    }

    if (matchedFiles.length > 0) {
      impacts.push({ feature, matchedFiles, patterns: [...new Set(matchedPatterns)] })
    }
  }

  const lines: string[] = [
    `Impact analysis: ${path.relative(workspaceRoot, targetFile)}`,
    '─'.repeat(50),
    owningKey ? `Owned by  : ${owningKey}` : 'No owning feature found (untracked file)',
  ]

  if (impacts.length === 0) {
    lines.push('\nNo other features reference this file.')
  } else {
    lines.push(`\n${impacts.length} feature(s) reference this file — changes may affect them:\n`)
    for (const imp of impacts) {
      lines.push(`  ${imp.feature.featureKey.padEnd(20)} ${imp.feature.status.padEnd(10)} "${imp.feature.title}"`)
      const fileList = imp.matchedFiles.slice(0, 3).join(', ')
      const more = imp.matchedFiles.length > 3 ? ` +${imp.matchedFiles.length - 3} more` : ''
      lines.push(`    referenced in: ${fileList}${more}`)
    }
    lines.push('\n⚠ Changes to this file may affect all features listed above.')
  }

  return { content: [{ type: 'text', text: lines.join('\n') }] }
}

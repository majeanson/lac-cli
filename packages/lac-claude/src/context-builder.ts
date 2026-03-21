import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import type { Feature } from '@life-as-code/feature-schema'

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs',
  '.java', '.cs', '.rb', '.php', '.vue', '.svelte', '.sql',
])

const MAX_FILE_CHARS = 8000   // ~2000 tokens per file
const MAX_TOTAL_CHARS = 320000 // ~80k tokens total

export interface SourceFile {
  relativePath: string
  content: string
}

export interface FeatureContext {
  feature: Feature
  featurePath: string
  sourceFiles: SourceFile[]
  gitLog: string
}

export function buildContext(featureDir: string, feature: Feature): FeatureContext {
  const featurePath = path.join(featureDir, 'feature.json')
  const sourceFiles = gatherSourceFiles(featureDir)
  const gitLog = getGitLog(featureDir)
  return { feature, featurePath, sourceFiles, gitLog }
}

function gatherSourceFiles(dir: string): SourceFile[] {
  const files: SourceFile[] = []
  let totalChars = 0

  // Priority 1: high-signal config files
  const priorityNames = ['package.json', 'README.md', 'tsconfig.json', '.env.example']
  for (const name of priorityNames) {
    const p = path.join(dir, name)
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8')
        const content = truncate(raw, 4000)
        files.push({ relativePath: name, content })
        totalChars += content.length
      } catch {
        // ignore unreadable files
      }
    }
  }

  // Priority 2: source files (tests last)
  const allSource = walkDir(dir).filter(
    (f) =>
      SOURCE_EXTENSIONS.has(path.extname(f)) &&
      !f.includes('node_modules') &&
      !f.includes('.turbo') &&
      !f.includes('dist/'),
  )

  allSource.sort((a, b) => {
    const aTest = /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(a)
    const bTest = /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(b)
    return aTest === bTest ? 0 : aTest ? 1 : -1
  })

  for (const filePath of allSource) {
    if (totalChars >= MAX_TOTAL_CHARS) break
    // Skip files already added as priority
    if (priorityNames.includes(path.basename(filePath))) continue
    try {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const content = truncate(raw, MAX_FILE_CHARS)
      const relativePath = path.relative(dir, filePath)
      files.push({ relativePath, content })
      totalChars += content.length
    } catch {
      // ignore unreadable files
    }
  }

  return files
}

function walkDir(dir: string): string[] {
  const results: string[] = []
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (
        entry.name.startsWith('.') ||
        entry.name === 'node_modules' ||
        entry.name === 'dist'
      )
        continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...walkDir(full))
      } else {
        results.push(full)
      }
    }
  } catch {
    // ignore unreadable dirs
  }
  return results
}

function truncate(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content
  return content.slice(0, maxChars) + '\n... [truncated]'
}

function getGitLog(dir: string): string {
  try {
    return execSync('git log --oneline --follow -20 -- .', {
      cwd: dir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
  } catch {
    return ''
  }
}

export function contextToString(ctx: FeatureContext): string {
  const parts: string[] = []

  parts.push('=== feature.json ===')
  parts.push(JSON.stringify(ctx.feature, null, 2))

  if (ctx.gitLog) {
    parts.push('\n=== git log (last 20 commits) ===')
    parts.push(ctx.gitLog)
  }

  for (const file of ctx.sourceFiles) {
    parts.push(`\n=== ${file.relativePath} ===`)
    parts.push(file.content)
  }

  return parts.join('\n')
}

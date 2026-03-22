import fs from 'node:fs'
import path from 'node:path'

export type PartitionStrategy = 'module' | 'directory'

export interface PartitionCandidate {
  /** Absolute path to the candidate directory */
  dir: string
  /** Path relative to the root passed to findCandidates */
  relativePath: string
  /** Files that caused this directory to be selected (e.g. ['package.json', 'index.ts']) */
  signals: string[]
  /** Number of source files found directly and recursively in this dir */
  sourceFileCount: number
  /** Absolute path of the nearest ancestor that is also a candidate, or null for root-level */
  parentDir: string | null
}

export interface PartitionOptions {
  strategy: PartitionStrategy
  /**
   * Maximum directory depth to descend.
   * Depth 1 = immediate children of root, depth 2 = grandchildren, etc.
   * Default: 4 for 'module', 2 for 'directory'.
   */
  maxDepth: number
  /** Directory names (exact match) to skip in addition to the built-in skip list */
  ignore: string[]
}

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Files whose presence signals a module/package boundary.
 * Used by the 'module' strategy.
 */
const MODULE_SIGNAL_FILES = new Set([
  // Node / JS / TS
  'package.json',
  'index.ts',
  'index.js',
  'index.tsx',
  'index.mts',
  'mod.ts',
  // Go
  'go.mod',
  'main.go',
  // Rust
  'Cargo.toml',
  'lib.rs',
  'main.rs',
  // Python
  'pyproject.toml',
  'setup.py',
  'setup.cfg',
  '__init__.py',
  'main.py',
  // Java / Kotlin / Maven / Gradle
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  // C# / .NET
  '*.csproj', // handled specially below
  // Ruby
  'Gemfile',
  // PHP
  'composer.json',
])

/** Source file extensions used to count files and determine if a dir has any code */
const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.mts', '.cts',
  '.js', '.jsx', '.mjs', '.cjs',
  '.py',
  '.go',
  '.rs',
  '.java', '.kt', '.scala',
  '.cs',
  '.rb',
  '.php',
  '.vue', '.svelte',
  '.sql',
  '.c', '.cpp', '.h', '.hpp',
  '.swift',
])

/**
 * Directory names that are always skipped.
 * These are either build artifacts, dependency trees, or known non-feature dirs.
 */
const BUILTIN_SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'out',
  'output',
  '__pycache__',
  '.turbo',
  'coverage',
  '.nyc_output',
  'vendor',
  'target',        // Rust / Maven
  '.next',
  '.nuxt',
  '.cache',
  '.venv',
  'venv',
  'env',
  '.env',
  'tmp',
  'temp',
  '_archive',
  'migrations',
  'fixtures',
  'mocks',
  '__mocks__',
  'stubs',
  '.idea',
  '.vscode',
])

// ─── Core logic ──────────────────────────────────────────────────────────────

/**
 * Walk a directory tree and return candidate directories for feature extraction.
 *
 * - Already-documented directories (those containing feature.json) are skipped
 *   and reported separately via the `alreadyDocumented` return value.
 * - Parent/child relationships are computed: each candidate's `parentDir` points
 *   to the nearest ancestor that is also a candidate.
 */
export function findCandidates(
  rootDir: string,
  options: PartitionOptions,
): {
  candidates: PartitionCandidate[]
  alreadyDocumented: string[]
  skipped: string[]
} {
  const root = path.resolve(rootDir)
  const skipSet = new Set([...BUILTIN_SKIP_DIRS, ...options.ignore])

  const candidates: PartitionCandidate[] = []
  const alreadyDocumented: string[] = []
  const skipped: string[] = []

  function walk(dir: string, depth: number): void {
    if (depth > options.maxDepth) return

    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      skipped.push(dir)
      return
    }

    const names = new Set(entries.filter(e => e.isFile()).map(e => e.name))

    // Skip if already documented
    if (names.has('feature.json')) {
      alreadyDocumented.push(dir)
      // Still descend — children may not be documented yet
    } else if (depth > 0) {
      // depth 0 is the root itself — don't add root as a candidate unless it passes
      const signals = getSignals(names, options.strategy)
      const sourceFileCount = countSourceFiles(dir)

      const shouldInclude =
        options.strategy === 'module'
          ? signals.length > 0
          : sourceFileCount > 0

      if (shouldInclude) {
        candidates.push({
          dir,
          relativePath: path.relative(root, dir),
          signals,
          sourceFileCount,
          parentDir: null, // filled in second pass
        })
      }
    }

    // Recurse into subdirectories
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') || skipSet.has(entry.name)) continue
      walk(path.join(dir, entry.name), depth + 1)
    }
  }

  walk(root, 0)

  // ── Assign parent/child relationships ────────────────────────────────────
  // Sort by path depth (shallowest first) so parents are processed first
  candidates.sort(
    (a, b) => a.dir.split(path.sep).length - b.dir.split(path.sep).length,
  )

  const candidateDirs = new Set(candidates.map(c => c.dir))

  for (const candidate of candidates) {
    candidate.parentDir = findNearestCandidateAncestor(
      candidate.dir,
      root,
      candidateDirs,
    )
  }

  return { candidates, alreadyDocumented, skipped }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSignals(names: Set<string>, strategy: PartitionStrategy): string[] {
  if (strategy === 'directory') {
    // For directory strategy, signals are the source files present
    return [...names].filter(n => SOURCE_EXTENSIONS.has(path.extname(n)))
  }

  // Module strategy: check for module boundary files
  const signals: string[] = []
  for (const name of names) {
    if (MODULE_SIGNAL_FILES.has(name)) {
      signals.push(name)
    }
    // Handle glob-like patterns: *.csproj
    if (name.endsWith('.csproj') || name.endsWith('.fsproj') || name.endsWith('.vbproj')) {
      signals.push(name)
    }
  }
  return signals
}

function countSourceFiles(dir: string): number {
  let count = 0
  function walk(d: string): void {
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.isFile() && SOURCE_EXTENSIONS.has(path.extname(e.name))) {
        count++
      } else if (e.isDirectory() && !e.name.startsWith('.') && !BUILTIN_SKIP_DIRS.has(e.name)) {
        walk(path.join(d, e.name))
      }
    }
  }
  walk(dir)
  return count
}

function findNearestCandidateAncestor(
  dir: string,
  root: string,
  candidateDirs: Set<string>,
): string | null {
  let current = path.dirname(dir)
  while (current !== root && current !== path.dirname(current)) {
    if (candidateDirs.has(current)) return current
    current = path.dirname(current)
  }
  return null
}

/**
 * Given a raw directory name, produce a human-readable title.
 * e.g. "lac-mcp" → "Lac Mcp", "authService" → "Auth Service"
 */
export function titleFromDirName(dirName: string): string {
  return dirName
    .replace(/[-_]/g, ' ')                        // kebab/snake → spaces
    .replace(/([a-z])([A-Z])/g, '$1 $2')          // camelCase → words
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')   // ABCFoo → ABC Foo
    .replace(/\b\w/g, c => c.toUpperCase())        // title case
    .trim()
    || 'Unnamed Module'
}

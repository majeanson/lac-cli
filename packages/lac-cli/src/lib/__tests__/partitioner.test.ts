import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { findCandidates, titleFromDirName } from '../partitioner.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

let tmpDir: string

beforeEach(() => {
  tmpDir = join(tmpdir(), `lac-partitioner-test-${Date.now()}`)
  mkdirSync(tmpDir, { recursive: true })
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function mkdir(...parts: string[]): string {
  const p = join(tmpDir, ...parts)
  mkdirSync(p, { recursive: true })
  return p
}

function touch(filePath: string): void {
  writeFileSync(filePath, '')
}

// ─── titleFromDirName ─────────────────────────────────────────────────────────

describe('titleFromDirName', () => {
  it('converts kebab-case to Title Case', () => {
    expect(titleFromDirName('lac-mcp')).toBe('Lac Mcp')
  })

  it('converts snake_case to Title Case', () => {
    expect(titleFromDirName('auth_service')).toBe('Auth Service')
  })

  it('splits camelCase into words', () => {
    expect(titleFromDirName('authService')).toBe('Auth Service')
  })

  it('handles all-uppercase acronyms', () => {
    expect(titleFromDirName('SQLParser')).toBe('SQL Parser')
  })

  it('handles a plain name', () => {
    expect(titleFromDirName('auth')).toBe('Auth')
  })

  it('returns fallback for empty string', () => {
    expect(titleFromDirName('')).toBe('Unnamed Module')
  })
})

// ─── findCandidates — module strategy ────────────────────────────────────────

describe('findCandidates — module strategy', () => {
  it('detects a directory with package.json', () => {
    const pkg = mkdir('packages', 'my-lib')
    touch(join(pkg, 'package.json'))
    touch(join(pkg, 'index.ts'))

    const { candidates } = findCandidates(tmpDir, {
      strategy: 'module',
      maxDepth: 4,
      ignore: [],
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.relativePath).toBe(relative(tmpDir, pkg))
    expect(candidates[0]!.signals).toContain('package.json')
  })

  it('detects directories with index.ts as a module signal', () => {
    const mod = mkdir('src', 'auth')
    touch(join(mod, 'index.ts'))
    touch(join(mod, 'auth.ts'))

    const { candidates } = findCandidates(tmpDir, {
      strategy: 'module',
      maxDepth: 4,
      ignore: [],
    })

    expect(candidates.some(c => c.signals.includes('index.ts'))).toBe(true)
  })

  it('skips directories with no module signals', () => {
    const plain = mkdir('src', 'utils')
    touch(join(plain, 'helper.ts'))  // source file but no module signal

    const { candidates } = findCandidates(tmpDir, {
      strategy: 'module',
      maxDepth: 4,
      ignore: [],
    })

    expect(candidates).toHaveLength(0)
  })

  it('skips node_modules', () => {
    const nm = mkdir('node_modules', 'some-pkg')
    touch(join(nm, 'package.json'))

    const { candidates } = findCandidates(tmpDir, {
      strategy: 'module',
      maxDepth: 4,
      ignore: [],
    })

    expect(candidates).toHaveLength(0)
  })

  it('skips directories in the ignore list', () => {
    const ignored = mkdir('scripts')
    touch(join(ignored, 'index.ts'))

    const { candidates } = findCandidates(tmpDir, {
      strategy: 'module',
      maxDepth: 4,
      ignore: ['scripts'],
    })

    expect(candidates).toHaveLength(0)
  })

  it('respects maxDepth', () => {
    const deep = mkdir('a', 'b', 'c', 'd', 'e')
    touch(join(deep, 'index.ts'))

    const { candidates } = findCandidates(tmpDir, {
      strategy: 'module',
      maxDepth: 3,
      ignore: [],
    })

    // depth of a/b/c/d/e is 5 — should be excluded at maxDepth=3
    expect(candidates).toHaveLength(0)
  })

  it('puts directories with feature.json in alreadyDocumented, not candidates', () => {
    const documented = mkdir('packages', 'existing')
    touch(join(documented, 'package.json'))
    touch(join(documented, 'feature.json'))

    const { candidates, alreadyDocumented } = findCandidates(tmpDir, {
      strategy: 'module',
      maxDepth: 4,
      ignore: [],
    })

    expect(candidates).toHaveLength(0)
    expect(alreadyDocumented.length).toBeGreaterThan(0)
  })
})

// ─── findCandidates — directory strategy ─────────────────────────────────────

describe('findCandidates — directory strategy', () => {
  it('includes any directory with source files', () => {
    const dir = mkdir('src', 'components')
    touch(join(dir, 'Button.tsx'))

    const { candidates } = findCandidates(tmpDir, {
      strategy: 'directory',
      maxDepth: 2,
      ignore: [],
    })

    expect(candidates.length).toBeGreaterThan(0)
  })

  it('excludes directories with no source files', () => {
    const dir = mkdir('docs')
    touch(join(dir, 'README.md'))

    const { candidates } = findCandidates(tmpDir, {
      strategy: 'directory',
      maxDepth: 2,
      ignore: [],
    })

    expect(candidates).toHaveLength(0)
  })
})

// ─── Parent/child assignment ──────────────────────────────────────────────────

describe('findCandidates — parent/child assignment', () => {
  it('assigns parentDir for nested modules', () => {
    const parent = mkdir('packages', 'core')
    touch(join(parent, 'package.json'))

    const child = mkdir('packages', 'core', 'auth')
    touch(join(child, 'index.ts'))

    const { candidates } = findCandidates(tmpDir, {
      strategy: 'module',
      maxDepth: 4,
      ignore: [],
    })

    const childCandidate = candidates.find(c => c.dir === child)
    const parentCandidate = candidates.find(c => c.dir === parent)

    expect(parentCandidate).toBeDefined()
    expect(childCandidate).toBeDefined()
    expect(childCandidate!.parentDir).toBe(parent)
  })

  it('sets parentDir to null for top-level modules', () => {
    const mod = mkdir('packages', 'standalone')
    touch(join(mod, 'package.json'))

    const { candidates } = findCandidates(tmpDir, {
      strategy: 'module',
      maxDepth: 4,
      ignore: [],
    })

    expect(candidates[0]!.parentDir).toBeNull()
  })
})

// ─── sourceFileCount ──────────────────────────────────────────────────────────

describe('findCandidates — sourceFileCount', () => {
  it('counts source files recursively', () => {
    const mod = mkdir('src', 'api')
    touch(join(mod, 'index.ts'))                // 1
    const sub = mkdir('src', 'api', 'handlers')
    touch(join(sub, 'users.ts'))                // 2
    touch(join(sub, 'auth.ts'))                 // 3
    touch(join(mod, 'README.md'))               // not a source file

    const { candidates } = findCandidates(tmpDir, {
      strategy: 'module',
      maxDepth: 4,
      ignore: [],
    })

    const api = candidates.find(c => c.dir === mod)
    expect(api).toBeDefined()
    expect(api!.sourceFileCount).toBeGreaterThanOrEqual(3)
  })
})

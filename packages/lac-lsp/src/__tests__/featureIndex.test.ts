import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FeatureIndex } from '../indexer/FeatureIndex.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_FEATURE = {
  featureKey: 'feat-2026-001',
  title: 'Test Feature',
  status: 'active',
  problem: 'A test problem',
}

function writeFeature(dir: string, feature: Record<string, unknown> = BASE_FEATURE): string {
  mkdirSync(dir, { recursive: true })
  const p = join(dir, 'feature.json')
  writeFileSync(p, JSON.stringify(feature), 'utf-8')
  return p
}

// ---------------------------------------------------------------------------
// initialize()
// ---------------------------------------------------------------------------

describe('FeatureIndex — initialize()', () => {
  let tmpDir: string
  let index: FeatureIndex

  beforeEach(() => {
    tmpDir = join(tmpdir(), `lac-fi-init-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
    index = new FeatureIndex(() => {}) // suppress log output
  })

  afterEach(async () => {
    await index.stop()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('starts not ready before initialize()', () => {
    expect(index.isReady).toBe(false)
    expect(index.size).toBe(0)
  })

  it('is ready after initialize() completes', async () => {
    await index.initialize(tmpDir)
    expect(index.isReady).toBe(true)
  })

  it('indexes a single feature.json', async () => {
    const featDir = join(tmpDir, 'feat-auth')
    writeFeature(featDir)
    await index.initialize(tmpDir)
    expect(index.size).toBe(1)
  })

  it('indexes multiple feature.json files', async () => {
    for (let i = 1; i <= 3; i++) {
      writeFeature(join(tmpDir, `feat-00${i}`), { ...BASE_FEATURE, featureKey: `feat-2026-00${i}` })
    }
    await index.initialize(tmpDir)
    expect(index.size).toBe(3)
  })

  it('populates byKey map — getByKey returns indexed feature', async () => {
    const featDir = join(tmpDir, 'feat-auth')
    writeFeature(featDir)
    await index.initialize(tmpDir)
    const entry = index.getByKey('feat-2026-001')
    expect(entry).toBeDefined()
    expect(entry?.feature.featureKey).toBe('feat-2026-001')
  })

  it('populates byDir map — getByDir returns indexed feature', async () => {
    const featDir = join(tmpDir, 'feat-auth')
    writeFeature(featDir)
    await index.initialize(tmpDir)
    const entry = index.getByDir(featDir)
    expect(entry).toBeDefined()
    expect(entry?.feature.featureKey).toBe('feat-2026-001')
  })

  it('getAll() returns all indexed features', async () => {
    writeFeature(join(tmpDir, 'feat-a'), { ...BASE_FEATURE, featureKey: 'feat-2026-001' })
    writeFeature(join(tmpDir, 'feat-b'), { ...BASE_FEATURE, featureKey: 'feat-2026-002' })
    await index.initialize(tmpDir)
    const all = index.getAll()
    expect(all).toHaveLength(2)
    const keys = all.map((f) => f.feature.featureKey).sort()
    expect(keys).toEqual(['feat-2026-001', 'feat-2026-002'])
  })

  it('emits "ready" event once initial scan is complete', async () => {
    const onReady = vi.fn()
    index.once('ready', onReady)
    await index.initialize(tmpDir)
    expect(onReady).toHaveBeenCalledOnce()
  })

  it('skips invalid feature.json files', async () => {
    const badDir = join(tmpDir, 'bad-feat')
    mkdirSync(badDir, { recursive: true })
    writeFileSync(join(badDir, 'feature.json'), '{ "title": "missing required fields" }', 'utf-8')
    await index.initialize(tmpDir)
    expect(index.size).toBe(0)
  })

  it('computes completeness for indexed features', async () => {
    const featDir = join(tmpDir, 'feat-full')
    writeFeature(featDir, {
      ...BASE_FEATURE,
      analysis: 'Some analysis',
      implementation: 'Some impl',
      tags: ['api'],
    })
    await index.initialize(tmpDir)
    const entry = index.getByKey('feat-2026-001')
    expect(typeof entry?.completeness).toBe('number')
    expect(entry!.completeness).toBeGreaterThan(0)
  })

  it('getByKey returns undefined for unknown key', async () => {
    await index.initialize(tmpDir)
    expect(index.getByKey('feat-9999-999')).toBeUndefined()
  })

  it('getByDir returns undefined for unknown directory', async () => {
    await index.initialize(tmpDir)
    expect(index.getByDir('/nonexistent/path')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// handleFileChange() — tested via private method cast
// ---------------------------------------------------------------------------

describe('FeatureIndex — handleFileChange()', () => {
  let tmpDir: string
  let index: FeatureIndex

  beforeEach(() => {
    tmpDir = join(tmpdir(), `lac-fi-change-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
    index = new FeatureIndex(() => {})
  })

  afterEach(async () => {
    await index.stop()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('adds a new feature when a new feature.json is processed', async () => {
    await index.initialize(tmpDir)
    const featDir = join(tmpDir, 'feat-new')
    writeFeature(featDir)

    const raw = index as unknown as { handleFileChange(p: string): void }
    raw.handleFileChange(join(featDir, 'feature.json'))

    expect(index.size).toBe(1)
    expect(index.getByKey('feat-2026-001')).toBeDefined()
  })

  it('emits "change" event with type "add" for new feature', async () => {
    await index.initialize(tmpDir)
    const featDir = join(tmpDir, 'feat-new')
    writeFeature(featDir)

    const onChange = vi.fn()
    index.on('change', onChange)

    const raw = index as unknown as { handleFileChange(p: string): void }
    raw.handleFileChange(join(featDir, 'feature.json'))

    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange.mock.calls[0]![0].type).toBe('add')
    expect(onChange.mock.calls[0]![0].featureKey).toBe('feat-2026-001')
  })

  it('emits "change" event with type "change" when feature already indexed', async () => {
    const featDir = join(tmpDir, 'feat-existing')
    writeFeature(featDir)
    await index.initialize(tmpDir)

    // Update the file
    writeFeature(featDir, { ...BASE_FEATURE, analysis: 'Updated analysis' })

    const onChange = vi.fn()
    index.on('change', onChange)

    const raw = index as unknown as { handleFileChange(p: string): void }
    raw.handleFileChange(join(featDir, 'feature.json'))

    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange.mock.calls[0]![0].type).toBe('change')
  })

  it('removes old key when featureKey changes on edit', async () => {
    const featDir = join(tmpDir, 'feat-rename')
    writeFeature(featDir)
    await index.initialize(tmpDir)

    expect(index.getByKey('feat-2026-001')).toBeDefined()

    // Simulate rename: write new featureKey into file
    writeFeature(featDir, { ...BASE_FEATURE, featureKey: 'feat-2026-099' })

    const raw = index as unknown as { handleFileChange(p: string): void }
    raw.handleFileChange(join(featDir, 'feature.json'))

    // Old key should be gone
    expect(index.getByKey('feat-2026-001')).toBeUndefined()
    // New key should be present
    expect(index.getByKey('feat-2026-099')).toBeDefined()
  })

  it('emits synthetic delete for invalid JSON file change', async () => {
    const featDir = join(tmpDir, 'feat-bad')
    writeFeature(featDir)
    await index.initialize(tmpDir)

    // Write invalid JSON
    writeFileSync(join(featDir, 'feature.json'), 'INVALID JSON!!!', 'utf-8')

    const onChange = vi.fn()
    index.on('change', onChange)

    const raw = index as unknown as { handleFileChange(p: string): void }
    raw.handleFileChange(join(featDir, 'feature.json'))

    // handleFileChange calls handleDelete on invalid JSON → emits delete
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange.mock.calls[0]![0].type).toBe('delete')
  })

  it('does nothing when file does not exist (calls handleDelete instead)', async () => {
    const featDir = join(tmpDir, 'feat-gone')
    writeFeature(featDir)
    await index.initialize(tmpDir)

    const onChange = vi.fn()
    index.on('change', onChange)

    // Call handleFileChange for nonexistent file
    const raw = index as unknown as { handleFileChange(p: string): void }
    raw.handleFileChange(join(featDir, 'nonexistent', 'feature.json'))

    // No feature was indexed at that path, so handleDelete finds no key → no event
    expect(onChange).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// handleDelete()
// ---------------------------------------------------------------------------

describe('FeatureIndex — handleDelete()', () => {
  let tmpDir: string
  let index: FeatureIndex

  beforeEach(() => {
    tmpDir = join(tmpdir(), `lac-fi-del-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
    index = new FeatureIndex(() => {})
  })

  afterEach(async () => {
    await index.stop()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('removes feature from index on delete', async () => {
    const featDir = join(tmpDir, 'feat-del')
    writeFeature(featDir)
    await index.initialize(tmpDir)
    expect(index.size).toBe(1)

    const raw = index as unknown as { handleDelete(p: string): void }
    raw.handleDelete(join(featDir, 'feature.json'))

    expect(index.size).toBe(0)
    expect(index.getByKey('feat-2026-001')).toBeUndefined()
    expect(index.getByDir(featDir)).toBeUndefined()
  })

  it('emits "change" event with type "delete"', async () => {
    const featDir = join(tmpDir, 'feat-del')
    writeFeature(featDir)
    await index.initialize(tmpDir)

    const onChange = vi.fn()
    index.on('change', onChange)

    const raw = index as unknown as { handleDelete(p: string): void }
    raw.handleDelete(join(featDir, 'feature.json'))

    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange.mock.calls[0]![0].type).toBe('delete')
    expect(onChange.mock.calls[0]![0].featureKey).toBe('feat-2026-001')
  })

  it('is a no-op when no feature indexed at that path', async () => {
    await index.initialize(tmpDir)

    const onChange = vi.fn()
    index.on('change', onChange)

    const raw = index as unknown as { handleDelete(p: string): void }
    raw.handleDelete(join(tmpDir, 'nonexistent', 'feature.json'))

    expect(onChange).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// scheduleReload() — debounce behavior with fake timers
// ---------------------------------------------------------------------------

describe('FeatureIndex — scheduleReload() debounce', () => {
  let tmpDir: string
  let index: FeatureIndex

  beforeEach(() => {
    tmpDir = join(tmpdir(), `lac-fi-debounce-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
    index = new FeatureIndex(() => {})
  })

  afterEach(async () => {
    vi.useRealTimers()
    await index.stop()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('fires handleFileChange after 300 ms debounce', async () => {
    vi.useFakeTimers()
    await index.initialize(tmpDir)

    const featDir = join(tmpDir, 'feat-debounce')
    writeFeature(featDir)
    const filePath = join(featDir, 'feature.json')

    const raw = index as unknown as { scheduleReload(p: string): void }
    raw.scheduleReload(filePath)

    // Before 300 ms — not yet processed
    expect(index.size).toBe(0)

    vi.advanceTimersByTime(300)

    // After 300 ms — should be indexed
    expect(index.size).toBe(1)
  })

  it('resets timer on rapid successive calls (debounce)', async () => {
    vi.useFakeTimers()
    await index.initialize(tmpDir)

    const featDir = join(tmpDir, 'feat-rapid')
    writeFeature(featDir)
    const filePath = join(featDir, 'feature.json')

    const raw = index as unknown as { scheduleReload(p: string): void }

    // Fire three times rapidly
    raw.scheduleReload(filePath)
    vi.advanceTimersByTime(100)
    raw.scheduleReload(filePath)
    vi.advanceTimersByTime(100)
    raw.scheduleReload(filePath)

    // Only 200 ms elapsed since last call — not fired yet
    expect(index.size).toBe(0)

    // Now advance past the debounce
    vi.advanceTimersByTime(300)
    expect(index.size).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// dispose() / stop()
// ---------------------------------------------------------------------------

describe('FeatureIndex — dispose() and stop()', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `lac-fi-dispose-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('dispose() clears pending timers', async () => {
    vi.useFakeTimers()
    const index = new FeatureIndex(() => {})
    await index.initialize(tmpDir)

    const featDir = join(tmpDir, 'feat-dispose')
    writeFeature(featDir)

    const raw = index as unknown as {
      scheduleReload(p: string): void
      pending: Map<string, ReturnType<typeof setTimeout>>
    }
    raw.scheduleReload(join(featDir, 'feature.json'))

    expect(raw.pending.size).toBe(1)
    index.dispose()
    expect(raw.pending.size).toBe(0)

    vi.useRealTimers()
  })

  it('stop() resolves and clears watcher', async () => {
    const index = new FeatureIndex(() => {})
    await index.initialize(tmpDir)
    // Should not throw
    await expect(index.stop()).resolves.toBeUndefined()
  })

  it('stop() is safe to call multiple times', async () => {
    const index = new FeatureIndex(() => {})
    await index.initialize(tmpDir)
    await index.stop()
    // Second stop should not throw
    await expect(index.stop()).resolves.toBeUndefined()
  })
})

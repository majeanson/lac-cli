import { EventEmitter } from 'node:events'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import chokidar from 'chokidar'

import { validateFeature } from '@life-as-code/feature-schema'

import { computeCompleteness } from '../lib/completeness.js'
import { scanFeatures } from '../lib/scanner.js'
import type { ChangeEventType, FeatureChangeEvent, IndexedFeature } from './types.js'

/** Typed event declarations for FeatureIndex so callers get autocomplete. */
export declare interface FeatureIndex {
  on(event: 'change', listener: (e: FeatureChangeEvent) => void): this
  off(event: 'change', listener: (e: FeatureChangeEvent) => void): this
  emit(event: 'change', e: FeatureChangeEvent): boolean
  once(event: 'ready', listener: () => void): this
  emit(event: 'ready'): boolean
}

/**
 * In-memory index of all feature.json files under a workspace root.
 *
 * Provides:
 *  - Fast lookup by featureKey
 *  - Fast lookup by directory (for blame)
 *  - Live file watching with 300 ms debounce (via chokidar)
 *  - EventEmitter 'change' events for downstream consumers (LSP diagnostics, SSE)
 *  - 'ready' event once initial scan completes
 */
export class FeatureIndex extends EventEmitter {
  /** Primary map: featureKey → IndexedFeature */
  private byKey = new Map<string, IndexedFeature>()
  /** Reverse map: abs dir path → featureKey (for blame walk) */
  private byDir = new Map<string, string>()
  /** The root directory this index is watching. */
  private rootDir: string | undefined
  /** chokidar watcher handle — undefined until initialize() is called. */
  private _watcher: chokidar.FSWatcher | undefined
  /** Pending debounce timers per file path. */
  private pending = new Map<string, ReturnType<typeof setTimeout>>()
  /** Whether initialize() has completed. */
  private ready = false
  /** Optional log function for diagnostics — defaults to stderr. */
  private log: (msg: string) => void

  constructor(log?: (msg: string) => void) {
    super()
    this.log = log ?? ((msg) => process.stderr.write(msg + '\n'))
  }

  /** ----------------------------------------------------------------
   *  Public API
   * ---------------------------------------------------------------- */

  /**
   * Scans rootDir for all feature.json files, populates the index, then
   * starts the file watcher.  Returns once the initial scan is complete.
   * Safe to call multiple times — re-scans and replaces the index.
   */
  async initialize(rootDir: string): Promise<void> {
    this.rootDir = resolve(rootDir)

    // Stop previous watcher if re-initializing
    if (this._watcher) {
      await this._watcher.close()
      this._watcher = undefined
    }

    const found = await scanFeatures(this.rootDir, (msg) => this.log(msg))

    // Rebuild both maps atomically
    this.byKey.clear()
    this.byDir.clear()

    for (const { feature, filePath } of found) {
      const dir = dirname(filePath)
      const completeness = computeCompleteness(feature as Record<string, unknown>)
      const indexed: IndexedFeature = { feature, filePath, dir, completeness }
      this.byKey.set(feature.featureKey, indexed)
      this.byDir.set(dir, feature.featureKey)
    }

    this.ready = true
    this.emit('ready')
    this.log(`lac-lsp: indexed ${this.byKey.size} feature(s) in "${this.rootDir}"`)

    this.startWatching(this.rootDir)
  }

  getByKey(key: string): IndexedFeature | undefined {
    return this.byKey.get(key)
  }

  /** Used by the blame walk — matches exact directory path. */
  getByDir(dir: string): IndexedFeature | undefined {
    const key = this.byDir.get(dir)
    return key !== undefined ? this.byKey.get(key) : undefined
  }

  getAll(): IndexedFeature[] {
    return Array.from(this.byKey.values())
  }

  get size(): number {
    return this.byKey.size
  }

  get isReady(): boolean {
    return this.ready
  }

  /** Releases the file watcher and pending timers. */
  dispose(): void {
    for (const t of this.pending.values()) clearTimeout(t)
    this.pending.clear()
    void this._watcher?.close()
    this._watcher = undefined
  }

  /** Alias for dispose() that returns a promise (matches chokidar API). */
  async stop(): Promise<void> {
    for (const t of this.pending.values()) clearTimeout(t)
    this.pending.clear()
    if (this._watcher) {
      await this._watcher.close()
      this._watcher = undefined
    }
  }

  /** ----------------------------------------------------------------
   *  Internal
   * ---------------------------------------------------------------- */

  private startWatching(rootDir: string): void {
    try {
      const watcher = chokidar.watch(rootDir, {
        ignored: /(^|[/\\])\..|(node_modules)/,
        persistent: true,
        ignoreInitial: true,
        depth: 20,
      })

      watcher
        .on('add', (filePath) => {
          if (filePath.endsWith('feature.json')) this.scheduleReload(filePath)
        })
        .on('change', (filePath) => {
          if (filePath.endsWith('feature.json')) this.scheduleReload(filePath)
        })
        .on('unlink', (filePath) => {
          if (filePath.endsWith('feature.json')) this.handleDelete(filePath)
        })
        .on('error', (err) => {
          this.log(`lac-lsp: watcher error — ${err instanceof Error ? err.message : String(err)}`)
        })

      this._watcher = watcher
    } catch (err) {
      this.log(
        `lac-lsp: could not start file watcher — ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  private scheduleReload(filePath: string): void {
    // Debounce: reset timer on rapid successive events
    const existing = this.pending.get(filePath)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      this.pending.delete(filePath)
      this.handleFileChange(filePath)
    }, 300)
    this.pending.set(filePath, timer)
  }

  private handleFileChange(filePath: string): void {
    if (!existsSync(filePath)) {
      this.handleDelete(filePath)
      return
    }

    let raw: string
    try {
      raw = readFileSync(filePath, 'utf-8')
    } catch {
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      // Invalid JSON — emit a synthetic delete so diagnostics can flag it
      this.handleDelete(filePath)
      return
    }

    const result = validateFeature(parsed)
    if (!result.success) {
      this.log(
        `lac-lsp: "${filePath}" failed validation — not indexed\n  ${result.errors.join('\n  ')}`,
      )
      return
    }

    const dir = dirname(filePath)
    const completeness = computeCompleteness(result.data as Record<string, unknown>)
    const indexed: IndexedFeature = { feature: result.data, filePath, dir, completeness }

    // If the featureKey changed (e.g. user edited it), remove the old mapping
    const prevKey = this.byDir.get(dir)
    if (prevKey && prevKey !== result.data.featureKey) {
      this.byKey.delete(prevKey)
    }

    const type: ChangeEventType = this.byKey.has(result.data.featureKey) ? 'change' : 'add'

    this.byKey.set(result.data.featureKey, indexed)
    this.byDir.set(dir, result.data.featureKey)

    this.emit('change', {
      type,
      featureKey: result.data.featureKey,
      filePath,
      indexed,
    })
  }

  private handleDelete(filePath: string): void {
    const dir = dirname(filePath)
    const key = this.byDir.get(dir)
    if (!key) return

    this.byKey.delete(key)
    this.byDir.delete(dir)

    this.emit('change', { type: 'delete', featureKey: key, filePath })
  }
}

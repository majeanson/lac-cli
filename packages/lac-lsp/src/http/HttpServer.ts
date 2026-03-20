import { readFileSync, writeFileSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { createRequire } from 'node:module'
import { gzip } from 'node:zlib'
import { resolve } from 'node:path'

import { validateFeature } from '@life-as-code/feature-schema'

import type { FeatureIndex } from '../indexer/FeatureIndex.js'
import type { FeatureChangeEvent } from '../indexer/types.js'
import { blame } from '../lib/blame.js'
import { lintFeatures, type LintOptions } from '../lib/lint.js'

const VERSION = '0.1.0'

/** Reads version from a package.json at the given path, returning 'unknown' on failure. */
function readPackageVersion(pkgJsonPath: string): string {
  try {
    const raw = readFileSync(pkgJsonPath, 'utf-8')
    const parsed = JSON.parse(raw) as { version?: string }
    return typeof parsed.version === 'string' ? parsed.version : 'unknown'
  } catch {
    return 'unknown'
  }
}

// Read versions from package.json files at startup
const _require = createRequire(import.meta.url)
const LAC_LSP_VERSION = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic require for version reading
    const pkg = _require('../../package.json') as { version?: string }
    return typeof pkg.version === 'string' ? pkg.version : VERSION
  } catch {
    return VERSION
  }
})()

const FEATURE_SCHEMA_VERSION = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic require for version reading
    const pkg = _require('@life-as-code/feature-schema/package.json') as { version?: string }
    return typeof pkg.version === 'string' ? pkg.version : 'unknown'
  } catch {
    return 'unknown'
  }
})()

type SseResponse = ServerResponse

/** Simple in-memory rate limiter: max 60 requests/min per IP */
interface RateLimitEntry {
  count: number
  resetAt: number
}

const rateLimitMap = new Map<string, RateLimitEntry>()
const RATE_LIMIT_MAX = 60
const RATE_LIMIT_WINDOW_MS = 60_000

/** Purge entries whose window has already expired to prevent unbounded growth. */
function pruneRateLimitMap(): void {
  const now = Date.now()
  for (const [key, entry] of rateLimitMap) {
    if (now >= entry.resetAt) rateLimitMap.delete(key)
  }
}

// Run cleanup every 5 minutes — no need for sub-second precision here.
setInterval(pruneRateLimitMap, 5 * 60_000).unref()

function getClientIp(req: IncomingMessage): string {
  // Prefer X-Forwarded-For so rate limiting works behind proxies / VS Code's
  // built-in proxy layer. Take only the first (leftmost) address.
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
    return forwarded.split(',')[0]!.trim()
  }
  return req.socket.remoteAddress ?? '127.0.0.1'
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false
  }

  entry.count++
  return true
}

const MAX_BODY_BYTES = 512 * 1024 // 512 KB

/** Default allowed CORS origins (in addition to localhost). */
const DEFAULT_CORS_ORIGINS = ['vscode-webview://*']

/**
 * Returns true if the given origin matches any of the allowed patterns.
 * Patterns support a single trailing wildcard (*), e.g. "vscode-webview://*".
 */
function originMatchesPattern(origin: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern === origin) return true
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1)
      if (origin.startsWith(prefix)) return true
    }
  }
  return false
}

export interface HttpServerOptions {
  /**
   * Extra CORS origins to allow beyond the default localhost origins.
   * Supports trailing-wildcard patterns, e.g. "vscode-webview://*".
   * Defaults to ["vscode-webview://*"].
   */
  corsOrigins?: string[]
  /** The workspace root directory being indexed. Reported in /health. */
  workspace?: string
}

/**
 * Lightweight HTTP server exposing the FeatureIndex over a REST + SSE API
 * on http://127.0.0.1:<port> (default 7474).
 *
 * Endpoints:
 *   GET  /health                        health check + feature count
 *   GET  /version                       server version info
 *   GET  /features                      list all indexed features (summary)
 *   GET  /features/:key                 get full IndexedFeature by key
 *   GET  /features/:key/lineage         get parent + children features
 *   PUT  /features/:key                 merge-update a feature.json on disk
 *   DELETE /features/:key               delete a feature.json from disk
 *   GET  /blame?path=<absPath>          which feature owns a file/dir
 *   GET  /lint[?required=f1,f2&threshold=N]  run lint on all features
 *   GET  /events                        SSE stream of FeatureChangeEvents
 *
 * CORS allows localhost origins + vscode-webview://* by default,
 * plus any additional origins passed in the corsOrigins option.
 */
export class HttpServer {
  private server: Server
  private sseClients = new Set<SseResponse>()
  private readonly extraCorsOrigins: string[]
  private readonly startedAt: number = Date.now()
  private workspace: string = process.cwd()

  constructor(private readonly index: FeatureIndex, options: HttpServerOptions = {}) {
    this.extraCorsOrigins = options.corsOrigins ?? DEFAULT_CORS_ORIGINS
    if (options.workspace) this.workspace = options.workspace

    this.server = createServer((req, res) => {
      this.handle(req, res)
    })

    // Broadcast every index change to all open SSE connections
    index.on('change', (event: FeatureChangeEvent) => {
      this.broadcastSse(event)
    })
  }

  /** Starts listening on the given port. Returns once the port is bound. */
  start(port: number): Promise<void> {
    return new Promise((res, rej) => {
      this.server.listen(port, '127.0.0.1', () => res())
      this.server.once('error', rej)
    })
  }

  /** Closes all SSE connections and shuts down the HTTP server. */
  stop(): Promise<void> {
    return new Promise((res) => {
      for (const client of this.sseClients) {
        try {
          client.end()
        } catch {
          // ignore
        }
      }
      this.sseClients.clear()
      this.server.close(() => res())
    })
  }

  // ----------------------------------------------------------------
  // Internal — routing
  // ----------------------------------------------------------------

  private handle(req: IncomingMessage, res: ServerResponse): void {
    // CORS — allow localhost origins + configured extra origins (vscode-webview://* etc.)
    const origin = req.headers['origin'] ?? ''
    const isLocalhost =
      origin === '' ||
      origin.startsWith('http://localhost') ||
      origin.startsWith('http://127.0.0.1') ||
      origin.startsWith('http://::1')

    const isAllowedExtra = originMatchesPattern(origin, this.extraCorsOrigins)

    if (!isLocalhost && !isAllowedExtra) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'forbidden: non-localhost origin' }))
      return
    }

    res.setHeader('Access-Control-Allow-Origin', origin || '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204).end()
      return
    }

    // Rate limiting per IP (X-Forwarded-For aware)
    const ip = getClientIp(req)
    if (!checkRateLimit(ip)) {
      this.json(res, 429, { error: 'rate limit exceeded' })
      return
    }

    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const { pathname } = url
      const method = req.method ?? 'GET'

      if (method === 'GET' && pathname === '/health') {
        return this.routeHealth(req, res)
      }
      if (method === 'GET' && pathname === '/version') {
        return this.routeVersion(req, res)
      }
      if (method === 'GET' && pathname === '/features') {
        return this.routeListFeatures(req, url, res)
      }
      if (method === 'GET' && pathname.startsWith('/features/') && !pathname.endsWith('/lineage')) {
        return this.routeGetFeature(req, pathname, res)
      }
      if (method === 'GET' && pathname.startsWith('/features/') && pathname.endsWith('/lineage')) {
        return this.routeGetFeatureLineage(req, pathname, res)
      }
      if (method === 'PUT' && pathname.startsWith('/features/')) {
        return this.routeUpdateFeature(req, pathname, res)
      }
      if (method === 'DELETE' && pathname.startsWith('/features/')) {
        return void this.routeDeleteFeature(pathname, res)
      }
      if (method === 'GET' && pathname === '/blame') {
        return this.routeBlame(url, res)
      }
      if (method === 'GET' && pathname === '/lint') {
        return this.routeLint(req, url, res)
      }
      if (method === 'GET' && pathname === '/events') {
        return this.routeEvents(res)
      }

      this.json(res, 404, { error: 'Not found' })
    } catch (err) {
      this.json(res, 500, { error: err instanceof Error ? err.message : String(err) })
    }
  }

  // ----------------------------------------------------------------
  // Route handlers
  // ----------------------------------------------------------------

  private routeHealth(req: IncomingMessage, res: ServerResponse): void {
    this.jsonMaybeGzip(req, res, 200, {
      ok: true,
      status: 'ok',
      version: LAC_LSP_VERSION,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      uptime: Math.floor((Date.now() - this.startedAt) / 1000),
      featuresIndexed: this.index.size,
      indexedCount: this.index.size,
      features: this.index.size,
      ready: this.index.isReady,
      workspace: this.workspace,
    })
  }

  private routeVersion(req: IncomingMessage, res: ServerResponse): void {
    this.jsonMaybeGzip(req, res, 200, {
      lacLsp: LAC_LSP_VERSION,
      featureSchema: FEATURE_SCHEMA_VERSION,
      node: process.version,
    })
  }

  private routeListFeatures(req: IncomingMessage, url: URL, res: ServerResponse): void {
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()

    const all = this.index.getAll()
    const filtered = q.length > 0
      ? all.filter(({ feature }) => {
          if (feature.featureKey.toLowerCase().includes(q)) return true
          if (feature.title.toLowerCase().includes(q)) return true
          if (feature.problem.toLowerCase().includes(q)) return true
          return false
        })
      : all

    const features = filtered.map(({ feature, filePath, completeness }) => ({
      featureKey: feature.featureKey,
      title: feature.title,
      status: feature.status,
      tags: feature.tags ?? [],
      completeness,
      filePath,
    }))
    this.jsonMaybeGzip(req, res, 200, { features, count: features.length })
  }

  private routeGetFeature(req: IncomingMessage, pathname: string, res: ServerResponse): void {
    const key = decodeURIComponent(pathname.slice('/features/'.length))
    const indexed = this.index.getByKey(key)
    if (!indexed) {
      this.jsonMaybeGzip(req, res, 404, { error: `Feature "${key}" not found` })
      return
    }
    this.jsonMaybeGzip(req, res, 200, {
      featureKey: indexed.feature.featureKey,
      title: indexed.feature.title,
      status: indexed.feature.status,
      completeness: indexed.completeness,
      filePath: indexed.filePath,
      feature: indexed.feature,
    })
  }

  private routeGetFeatureLineage(req: IncomingMessage, pathname: string, res: ServerResponse): void {
    // pathname: /features/:key/lineage  →  segments: ['', 'features', key, 'lineage']
    const segments = pathname.split('/')
    const key = decodeURIComponent(segments[2] ?? '')
    const indexed = this.index.getByKey(key)
    if (!indexed) {
      this.jsonMaybeGzip(req, res, 404, { error: `Feature "${key}" not found` })
      return
    }

    const parentKey = indexed.feature.lineage?.parent ?? null
    const childKeys = indexed.feature.lineage?.children ?? []

    const parent = parentKey ? (this.index.getByKey(parentKey)?.feature ?? null) : null
    const children = childKeys
      .map((ck) => this.index.getByKey(ck)?.feature ?? null)
      .filter(Boolean)

    this.jsonMaybeGzip(req, res, 200, {
      feature: indexed.feature,
      parent,
      children,
    })
  }

  /**
   * PUT /features/:key
   * Body: Partial<Feature> — merged with existing feature and written back to disk.
   * The featureKey in the URL must match the featureKey in the body (if provided).
   * The result is validated against the schema before writing.
   */
  private routeUpdateFeature(
    req: IncomingMessage,
    pathname: string,
    res: ServerResponse,
  ): void {
    const key = decodeURIComponent(pathname.slice('/features/'.length))
    const indexed = this.index.getByKey(key)
    if (!indexed) {
      this.json(res, 404, { error: `Feature "${key}" not found` })
      return
    }

    let body = ''
    let byteCount = 0
    let tooLarge = false

    req.on('data', (chunk: Buffer | string) => {
      if (tooLarge) return
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      byteCount += buf.length
      if (byteCount > MAX_BODY_BYTES) {
        tooLarge = true
        req.destroy()
        this.json(res, 413, { error: 'payload too large' })
        return
      }
      body += buf.toString()
    })

    req.on('end', () => {
      if (tooLarge) return

      let updates: Record<string, unknown>
      try {
        updates = JSON.parse(body) as Record<string, unknown>
      } catch {
        this.json(res, 400, { error: 'Request body must be valid JSON' })
        return
      }

      // Prevent changing featureKey via the API
      if (updates['featureKey'] !== undefined && updates['featureKey'] !== key) {
        this.json(res, 422, {
          error: 'featureKey in body must match the URL key',
        })
        return
      }

      // Cross-feature lineage validation: if lineage.parent is set, ensure it exists
      if (updates['lineage'] !== null && typeof updates['lineage'] === 'object') {
        const lineage = updates['lineage'] as Record<string, unknown>
        const parentKey = lineage['parent']
        if (typeof parentKey === 'string' && parentKey.length > 0) {
          if (!this.index.getByKey(parentKey)) {
            this.json(res, 422, { error: `lineage.parent "${parentKey}" not found in index` })
            return
          }
        }
      }

      const merged = {
        ...(indexed.feature as unknown as Record<string, unknown>),
        ...updates,
        featureKey: key, // ensure key is never overwritten
      }

      // Validate before writing
      const result = validateFeature(merged)
      if (!result.success) {
        this.json(res, 422, { error: 'Validation failed', details: result.errors })
        return
      }

      try {
        writeFileSync(indexed.filePath, JSON.stringify(result.data, null, 2) + '\n', 'utf-8')
        this.json(res, 200, { ok: true })
      } catch (err) {
        this.json(res, 500, {
          error: `Write failed: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
    })
  }

  /**
   * DELETE /features/:key
   * Deletes the feature.json file from disk. The file watcher will automatically
   * remove the entry from the index and emit a 'delete' change event.
   */
  private async routeDeleteFeature(pathname: string, res: ServerResponse): Promise<void> {
    const key = decodeURIComponent(pathname.slice('/features/'.length))
    const indexed = this.index.getByKey(key)
    if (!indexed) {
      this.json(res, 404, { error: `Feature "${key}" not found` })
      return
    }

    try {
      await unlink(indexed.filePath)
      this.json(res, 200, { deleted: true, featureKey: key })
    } catch (err) {
      this.json(res, 500, {
        error: `Delete failed: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  private routeBlame(url: URL, res: ServerResponse): void {
    const rawPath = url.searchParams.get('path')
    if (!rawPath) {
      this.json(res, 400, { error: 'Missing required ?path= query parameter' })
      return
    }

    // Strip :line suffix first (IDE-style path:line), then resolve to absolute.
    const cleanPath = rawPath.replace(/:\d+$/, '')
    const absPath = resolve(cleanPath)

    // Path traversal guard: the resolved path must stay within the workspace.
    // We compare with a trailing sep so "/workspace-extra" is not confused with
    // "/workspace". Also reject any path whose normalised form contains "/.." so
    // symlink-based escape attempts are caught before resolution.
    const normalizedForCheck = rawPath.replace(/\\/g, '/')
    const workspacePrefixForCheck = this.workspace.replace(/\\/g, '/').replace(/\/?$/, '/')
    const absPathForCheck = absPath.replace(/\\/g, '/')
    const containsDotDot = normalizedForCheck.split('/').some((seg) => seg === '..')
    const outsideWorkspace = !absPathForCheck.startsWith(workspacePrefixForCheck)

    if (containsDotDot || outsideWorkspace) {
      this.json(res, 400, { error: 'invalid path' })
      return
    }

    const indexed = blame(absPath, this.index)

    if (!indexed) {
      this.json(res, 404, {
        error: `No feature found for path "${rawPath}"`,
        path: absPath,
      })
      return
    }

    this.json(res, 200, {
      featureKey: indexed.feature.featureKey,
      title: indexed.feature.title,
      status: indexed.feature.status,
      completeness: indexed.completeness,
      filePath: indexed.filePath,
      feature: indexed.feature,
    })
  }

  private routeLint(req: IncomingMessage, url: URL, res: ServerResponse): void {
    const opts: LintOptions = {}

    const required = url.searchParams.get('required')
    if (required) {
      opts.requiredFields = required
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean)
    }

    const threshold = url.searchParams.get('threshold')
    if (threshold) {
      const n = parseInt(threshold, 10)
      if (!isNaN(n)) opts.threshold = n
    }

    const statuses = url.searchParams.get('statuses')
    if (statuses) {
      opts.lintStatuses = statuses
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    }

    const report = lintFeatures(this.index.getAll(), opts)

    // Return structured JSON response
    const structured = {
      passed: report.passes,
      failed: report.failures,
      results: report.results.map((r) => ({
        featureKey: r.featureKey,
        pass: r.pass,
        completeness: r.completeness,
        missingRequired: r.missingRequired,
      })),
    }

    const statusCode = report.failures > 0 ? 422 : 200
    this.jsonMaybeGzip(req, res, statusCode, structured)
  }

  /**
   * GET /events
   * Server-Sent Events stream. Each event is a JSON-serialised FeatureChangeEvent.
   * A heartbeat comment (`: heartbeat`) is sent every 30 s to keep the connection alive.
   */
  private routeEvents(res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    // Initial connected acknowledgement
    res.write('data: {"type":"connected"}\n\n')

    this.sseClients.add(res)

    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n')
      } catch {
        clearInterval(heartbeat)
        this.sseClients.delete(res)
      }
    }, 30_000)

    res.once('close', () => {
      clearInterval(heartbeat)
      this.sseClients.delete(res)
    })
  }

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------

  private broadcastSse(event: FeatureChangeEvent): void {
    const payload = `data: ${JSON.stringify(event)}\n\n`
    for (const client of this.sseClients) {
      try {
        client.write(payload)
      } catch {
        this.sseClients.delete(client)
      }
    }
  }

  /** Send JSON response, optionally gzip-compressed if client accepts it (GET only). */
  private jsonMaybeGzip(
    req: IncomingMessage,
    res: ServerResponse,
    status: number,
    body: unknown,
  ): void {
    const acceptEncoding = req.headers['accept-encoding'] ?? ''
    const wantsGzip =
      req.method === 'GET' && typeof acceptEncoding === 'string' && acceptEncoding.includes('gzip')

    // Use the same compact serialisation for both paths so compressed and
    // uncompressed responses are byte-for-byte identical in content.
    const payload = JSON.stringify(body)

    if (wantsGzip) {
      gzip(Buffer.from(payload, 'utf-8'), (err, compressed) => {
        // If the client disconnected while we were compressing, bail out.
        if (res.writableEnded) return
        if (err) {
          // Fall back to uncompressed on compression error
          this.json(res, status, body)
          return
        }
        res.writeHead(status, {
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip',
          'Content-Length': compressed.length,
        })
        res.end(compressed)
      })
    } else {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      })
      res.end(payload)
    }
  }

  private json(res: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body)
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    })
    res.end(payload)
  }
}

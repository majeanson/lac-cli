import { createRequire } from 'node:module'

import { FeatureIndex } from './indexer/FeatureIndex.js'
import { createLspConnection } from './lsp/connection.js'
import { HttpServer } from './http/HttpServer.js'

const _require = createRequire(import.meta.url)
const LAC_LSP_VERSION = (() => {
  try {
    const pkg = _require('../../package.json') as { version?: string }
    return typeof pkg.version === 'string' ? pkg.version : '0.1.0'
  } catch {
    return '0.1.0'
  }
})()

export interface LacLspServerOptions {
  /**
   * Root directory to scan for feature.json files.
   * Only used when enableLsp is false — in LSP mode the workspace root is
   * extracted from the editor's `initialize` request.
   */
  workspaceRoot?: string
  /** HTTP API port. Default: 7474. */
  httpPort?: number
  /** Whether to start the HTTP API server. Default: true. */
  enableHttp?: boolean
  /** Whether to start the LSP stdio server. Default: true. */
  enableLsp?: boolean
  /**
   * Extra CORS origins to allow beyond the default localhost origins.
   * Corresponds to `lacLens.corsOrigins` in VS Code settings.
   * Supports trailing-wildcard patterns, e.g. "vscode-webview://*".
   */
  corsOrigins?: string[]
}

/**
 * Top-level server that wires together:
 *   - FeatureIndex  (shared in-memory index + file watcher)
 *   - LSP connection (stdio transport for editors)
 *   - HTTP server   (REST + SSE on localhost:7474 for Chrome ext, CI, webapp)
 *
 * Modes:
 *   Default       – both LSP + HTTP running (standard editor setup)
 *   --http-only   – HTTP only, index booted from --workspace arg (CI / webapp)
 *   --lsp-only    – LSP only, no HTTP (lightweight editor mode)
 */
export class LacLspServer {
  private readonly index: FeatureIndex
  private http: HttpServer | undefined

  constructor(private readonly options: LacLspServerOptions = {}) {
    // In HTTP-only mode we log to stderr (LSP stdio is not involved).
    // In LSP mode the LSP connection.console is used inside connection.ts.
    const logFn =
      options.enableLsp !== false
        ? undefined // FeatureIndex default: stderr
        : (msg: string) => process.stderr.write(msg + '\n')

    this.index = new FeatureIndex(logFn)
  }

  async start(): Promise<void> {
    const {
      workspaceRoot,
      httpPort = 7474,
      enableHttp = true,
      enableLsp = true,
    } = this.options

    // ------------------------------------------------------------------
    // HTTP-only mode: boot index now (LSP mode boots it lazily on init)
    // ------------------------------------------------------------------
    if (!enableLsp) {
      const root = workspaceRoot ?? process.cwd()
      await this.index.initialize(root)
    }

    // ------------------------------------------------------------------
    // Start HTTP server
    // ------------------------------------------------------------------
    if (enableHttp) {
      const httpWorkspace = workspaceRoot ?? process.cwd()
      this.http = new HttpServer(this.index, {
        corsOrigins: this.options.corsOrigins,
        workspace: httpWorkspace,
      })
      await this.http.start(httpPort)
      const mode = enableLsp ? 'LSP + HTTP' : 'HTTP only'
      process.stderr.write(`\n`)
      process.stderr.write(`  lac-lsp v${LAC_LSP_VERSION}  —  ${mode}\n`)
      process.stderr.write(`  Workspace : ${httpWorkspace}\n`)
      process.stderr.write(`  HTTP API  : http://127.0.0.1:${httpPort}\n`)
      process.stderr.write(`  LSP mode  : ${enableLsp ? 'stdio (active)' : 'disabled'}\n`)
      process.stderr.write(`  Indexed   : ${this.index.size} feature${this.index.size === 1 ? '' : 's'}\n`)
      process.stderr.write(`\n`)
    }

    // ------------------------------------------------------------------
    // Start LSP stdio server
    // ------------------------------------------------------------------
    if (enableLsp) {
      const connection = createLspConnection(this.index)
      connection.listen()
      // Note: once connection.listen() is called, stdin/stdout are owned
      // by the LSP protocol. All logging must go via connection.console.*
    }
  }

  async stop(): Promise<void> {
    await this.http?.stop()
    this.index.dispose()
  }
}

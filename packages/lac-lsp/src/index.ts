import process from 'node:process'

import { LacLspServer } from './LacLspServer.js'

// ----------------------------------------------------------------
// Argument parsing
// ----------------------------------------------------------------

interface ParsedArgs {
  workspace: string | undefined
  port: number
  httpOnly: boolean
  lspOnly: boolean
  help: boolean
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2)
  const result: ParsedArgs = {
    workspace: undefined,
    port: 7474,
    httpOnly: false,
    lspOnly: false,
    help: false,
  }

  let i = 0
  while (i < args.length) {
    const arg = args[i] ?? ''

    if (arg === '--help' || arg === '-h') {
      result.help = true
    } else if (arg === '--workspace' || arg === '-w') {
      const next = args[i + 1]
      if (next) {
        result.workspace = next
        i++
      }
    } else if (arg === '--port' || arg === '-p') {
      const next = args[i + 1]
      if (next) {
        const n = parseInt(next, 10)
        if (!isNaN(n)) result.port = n
        i++
      }
    } else if (arg === '--http-only') {
      result.httpOnly = true
    } else if (arg === '--lsp-only' || arg === '--no-http') {
      result.lspOnly = true
    } else if (!arg.startsWith('-') && result.workspace === undefined) {
      // Positional argument: treat as workspace path
      result.workspace = arg
    }

    i++
  }

  return result
}

function printHelp(): void {
  process.stderr.write(`
lac-lsp — life-as-code Language Server + HTTP API

USAGE
  lac-lsp [options] [workspace]

OPTIONS
  --workspace <dir>   Root directory to index (default: cwd)
  --port <n>          HTTP server port           (default: 7474)
  --http-only         Only start HTTP server, skip LSP stdio
  --lsp-only          Only start LSP stdio,    skip HTTP server
  --no-http           Alias for --lsp-only
  --help              Show this help

MODES
  Default             LSP stdio + HTTP on :port (editor + browser/CI)
  --http-only         HTTP only — useful for CI pipelines or the webapp
  --lsp-only          LSP only  — lightweight; no HTTP port opened

HTTP API  (http://127.0.0.1:7474)
  GET  /health                        Server health + feature count
  GET  /features                      List all indexed features
  GET  /features/:key                 Get a single feature by featureKey
  PUT  /features/:key                 Update a feature.json on disk (JSON body)
  GET  /blame?path=<abs>              Which feature owns a file / directory
  GET  /lint[?required=f1,f2&threshold=N&statuses=s1,s2]
                                      Run lint on all indexed features
  GET  /events                        Server-Sent Events stream of changes

EXAMPLES
  # Start for a VS Code extension (LSP + HTTP)
  lac-lsp --workspace /my/project

  # CI lint check via HTTP
  lac-lsp --http-only --workspace /my/project &
  sleep 1
  curl http://127.0.0.1:7474/lint

  # Blame a specific file
  curl "http://127.0.0.1:7474/blame?path=/my/project/src/auth/index.ts"
`.trimStart())
}

// ----------------------------------------------------------------
// Entry point
// ----------------------------------------------------------------

const { workspace, port, httpOnly, lspOnly, help } = parseArgs(process.argv)

if (help) {
  printHelp()
  process.exit(0)
}

const server = new LacLspServer({
  workspaceRoot: workspace,
  httpPort: port,
  enableHttp: !lspOnly,
  enableLsp: !httpOnly,
})

server.start().catch((err: unknown) => {
  process.stderr.write(
    `lac-lsp: fatal — ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, () => {
    server
      .stop()
      .then(() => process.exit(0))
      .catch(() => process.exit(1))
  })
}

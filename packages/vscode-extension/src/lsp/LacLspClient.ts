import * as vscode from 'vscode'
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
  type RevealOutputChannelOn,
} from 'vscode-languageclient/node'

/**
 * Creates and manages a LanguageClient that connects to a running lac-lsp server.
 *
 * The client:
 *  - Spawns `lac-lsp --workspace <root>` as a child process (stdio transport)
 *  - Delegates hover, codeLens, diagnostics, and workspace symbols to the server
 *  - Watches feature.json files so the server can keep its index current
 *
 * Usage:
 *   const client = createLacLspClient(serverPath, workspaceRoot, context)
 *   await client.start()
 *   // later:
 *   await client.stop()
 */
export function createLacLspClient(
  serverPath: string,
  workspaceRoot: string,
  context: vscode.ExtensionContext,
): LanguageClient {
  const serverOptions: ServerOptions = {
    run: {
      command: serverPath,
      args: ['--workspace', workspaceRoot, '--lsp-only'],
      transport: TransportKind.stdio,
    },
    debug: {
      command: serverPath,
      args: ['--workspace', workspaceRoot, '--lsp-only'],
      transport: TransportKind.stdio,
    },
  }

  const clientOptions: LanguageClientOptions = {
    // Activate for every file so codeLens/hover work everywhere
    documentSelector: [{ scheme: 'file', pattern: '**/*' }],

    outputChannelName: 'life-as-code',
    revealOutputChannelOn: 1 as RevealOutputChannelOn, // 1 = Error only

    synchronize: {
      // Tell the server when feature.json files change via the standard
      // workspace/didChangeWatchedFiles notification
      fileEvents: vscode.workspace.createFileSystemWatcher('**/feature.json'),
    },

    initializationOptions: {
      workspaceRoot,
    },

    initializationFailedHandler: (error) => {
      void vscode.window.showErrorMessage(
        `lac-lsp failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
      )
      return false // don't retry
    },

    connectionOptions: {
      maxRestartCount: 2,
    },
  }

  return new LanguageClient(
    'lac-lsp',
    'life-as-code LSP',
    serverOptions,
    clientOptions,
  )
}

/**
 * Fetch blame information from the HTTP API (port 7474) for the given file path.
 * Returns null if the server is not running or the path has no owning feature.
 */
export async function fetchBlameHttp(
  filePath: string,
  port = 7474,
): Promise<{ featureKey: string; title: string; status: string; filePath: string } | null> {
  const url = `http://127.0.0.1:${port}/blame?path=${encodeURIComponent(filePath)}`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(500) })
    if (!res.ok) return null
    const data = (await res.json()) as {
      featureKey: string
      title: string
      status: string
      filePath: string
    }
    return data
  } catch {
    return null
  }
}

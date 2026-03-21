import { fileURLToPath } from 'node:url'

import {
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  createConnection,
  type InitializeResult,
} from 'vscode-languageserver/node.js'
import { TextDocument } from 'vscode-languageserver-textdocument'

import type { FeatureIndex } from '../indexer/FeatureIndex.js'
import { handleCodeLens } from './handlers/codeLens.js'
import { handleDefinition } from './handlers/definition.js'
import { setupDiagnostics } from './handlers/diagnostics.js'
import { handleHover } from './handlers/hover.js'
import { handleWorkspaceSymbols } from './handlers/symbols.js'

/**
 * Creates an LSP connection that uses stdin/stdout as its transport (the
 * standard channel for editor-spawned language servers).
 *
 * The connection:
 *  - Extracts the workspace root from the `initialize` params and boots the
 *    FeatureIndex so all subsequent requests have data.
 *  - Registers hover, codeLens, workspace symbols, and diagnostic providers.
 *
 * Call `connection.listen()` after this returns to start the message loop.
 */
export function createLspConnection(index: FeatureIndex, version = '0.0.0') {
  const connection = createConnection(ProposedFeatures.all)
  const documents = new TextDocuments(TextDocument)

  // -----------------------------------------------------------------
  // initialize — extract workspace root, boot index in background
  // -----------------------------------------------------------------
  connection.onInitialize((params) => {
    // Prefer workspaceFolders > rootUri > rootPath (rootPath is deprecated)
    let workspaceRoot: string | undefined

    const firstFolder = params.workspaceFolders?.[0]
    if (firstFolder) {
      try {
        workspaceRoot = fileURLToPath(firstFolder.uri)
      } catch {
        workspaceRoot = undefined
      }
    }

    if (!workspaceRoot && params.rootUri) {
      try {
        workspaceRoot = fileURLToPath(params.rootUri)
      } catch {
        workspaceRoot = undefined
      }
    }

    if (!workspaceRoot && params.rootPath) {
      workspaceRoot = params.rootPath
    }

    const root = workspaceRoot ?? process.cwd()

    // Start indexing in the background — don't delay the initialize response.
    // Handlers return null/[] until indexing completes, which editors handle gracefully.
    index
      .initialize(root)
      .then(() => {
        connection.console.log(
          `lac-lsp: indexed ${index.size} feature(s) in "${root}"`,
        )
      })
      .catch((err: unknown) => {
        connection.console.error(
          `lac-lsp: index error — ${err instanceof Error ? err.message : String(err)}`,
        )
      })

    const result: InitializeResult = {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,

        // Hover card on any file inside a feature directory
        hoverProvider: true,

        // Code lens at line 0 of any file inside a feature directory
        codeLensProvider: { resolveProvider: false },

        // Search features by key / title / tags
        workspaceSymbolProvider: true,

        // Jump to the feature.json that owns any file
        definitionProvider: true,

        workspace: {
          workspaceFolders: {
            supported: true,
          },
        },
      },
      serverInfo: {
        name: 'lac-lsp',
        version,
      },
    }

    return result
  })

  // -----------------------------------------------------------------
  // initialized — wire up diagnostic push + workspace folder changes
  // -----------------------------------------------------------------
  connection.onInitialized(() => {
    setupDiagnostics(connection, index)
    connection.console.log(`lac-lsp v${version}: ready`)

    // Register workspace folder change listener.
    // Wrapped in try/catch because the library throws synchronously when the
    // client doesn't support the notification, even if capabilities appeared set.
    try {
      connection.workspace?.onDidChangeWorkspaceFolders((event) => {
        for (const folder of event.added) {
          let root: string | undefined
          try {
            root = fileURLToPath(folder.uri)
          } catch {
            continue
          }
          index.initialize(root).catch((err: unknown) => {
            connection.console.error(
              `lac-lsp: re-index error — ${err instanceof Error ? err.message : String(err)}`,
            )
          })
        }
      })
    } catch {
      // client doesn't support workspace folder change events — skip silently
    }
  })

  // -----------------------------------------------------------------
  // Feature handlers
  // -----------------------------------------------------------------
  connection.onHover((params) => handleHover(params, index))

  connection.onCodeLens((params) => handleCodeLens(params, index))

  connection.onWorkspaceSymbol((params) => handleWorkspaceSymbols(params, index))

  connection.onDefinition((params) => handleDefinition(params, index))

  // Track open documents (content may differ from disk during editing)
  documents.listen(connection)

  return connection
}

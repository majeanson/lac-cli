import { spawnSync } from 'node:child_process'

import * as vscode from 'vscode'
import { FeatureCache } from './services/FeatureCache.js'
import { FeatureWalker } from './services/FeatureWalker.js'
import { FeatureCodeLensProvider } from './providers/CodeLensProvider.js'
import { FeatureHoverProvider } from './providers/HoverProvider.js'
import { FeatureStatusBar } from './statusbar/FeatureStatusBar.js'
import { openFeatureJsonCommand } from './commands/openFeatureJson.js'
import { createLacLspClient, fetchBlameHttp } from './lsp/LacLspClient.js'
import type { LanguageClient } from 'vscode-languageclient/node'

/**
 * Probes whether `serverPath` exists and is executable by running `--help`.
 * Uses spawnSync so the extension `activate` stays synchronous.
 */
function isLacLspAvailable(serverPath: string): boolean {
  try {
    const result = spawnSync(serverPath, ['--help'], {
      timeout: 2000,
      stdio: 'ignore',
      windowsHide: true,
    })
    return result.error === undefined && result.status !== null
  } catch {
    return false
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const cfg = vscode.workspace.getConfiguration('lacLens')
  const lspServerPath: string = cfg.get('lspServerPath', 'lac-lsp')
  const httpPort: number = cfg.get('httpPort', 7474)

  // Auto-detect: if the user hasn't explicitly set lspMode, check if lac-lsp
  // is available in PATH and silently upgrade to LSP mode.
  const lspModeInspect = cfg.inspect<boolean>('lspMode')
  const isExplicit =
    lspModeInspect?.workspaceValue !== undefined ||
    lspModeInspect?.globalValue !== undefined
  let useLsp: boolean = cfg.get('lspMode', false)
  const lspAvailable = isLacLspAvailable(lspServerPath)

  if (!isExplicit && !useLsp && lspAvailable) {
    useLsp = true
    void vscode.window.showInformationMessage(
      'lac-lsp detected — switching to LSP mode automatically. Set "lacLens.lspMode": false to disable.',
    )
  } else if (isExplicit && useLsp && !lspAvailable) {
    // User explicitly set lspMode:true but lac-lsp is not installed/accessible
    void vscode.window
      .showErrorMessage(
        `lac-lsp not found at "${lspServerPath}". Install it: npm i -g @life-as-code/lac-lsp`,
        'Install instructions',
      )
      .then((action) => {
        if (action === 'Install instructions') {
          void vscode.env.openExternal(
            vscode.Uri.parse('https://github.com/life-as-code/life-as-code'),
          )
        }
      })
    // Fall back to direct mode so the extension still partially works
    useLsp = false
  }

  // The openFeatureJson command is shared by both modes.
  // The LSP server sends codeLens with command id 'lac.openFeatureJson'.
  // The context-menu registers 'lacLens.openFeatureJson'.
  // Both point at the same handler.
  context.subscriptions.push(
    vscode.commands.registerCommand('lacLens.openFeatureJson', openFeatureJsonCommand),
    vscode.commands.registerCommand('lac.openFeatureJson', openFeatureJsonCommand),
  )

  if (useLsp) {
    activateLspMode(context, lspServerPath, httpPort)
  } else {
    activateDirectMode(context)
  }
}

// ----------------------------------------------------------------
// LSP mode
// ----------------------------------------------------------------

function activateLspMode(
  context: vscode.ExtensionContext,
  serverPath: string,
  httpPort: number,
): void {
  const workspaceFolders = vscode.workspace.workspaceFolders
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showWarningMessage(
      'lac-lsp: no workspace folder open — LSP mode requires an open folder.',
    )
    return
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath
  let lspClient: LanguageClient

  try {
    lspClient = createLacLspClient(serverPath, workspaceRoot, context)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    vscode.window.showErrorMessage(`lac-lsp: failed to create client — ${msg}`)
    return
  }

  lspClient.start().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    vscode.window.showErrorMessage(
      `lac-lsp: server failed to start (is "lac-lsp" installed?) — ${msg}`,
    )
  })

  context.subscriptions.push({
    dispose: () => void lspClient.stop(),
  })

  // Status bar — uses HTTP API for blame since LSP doesn't push status-bar updates
  const statusBar = new FeatureStatusBar()
  context.subscriptions.push(statusBar)

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (!editor) {
        statusBar.update(null)
        return
      }

      const filePath = editor.document.uri.fsPath
      const result = await fetchBlameHttp(filePath, httpPort)

      if (!result) {
        statusBar.update(null)
        return
      }

      // Build a minimal Feature-like object for the status bar
      statusBar.update(
        {
          featureKey: result.featureKey,
          title: result.title,
          status: result.status as 'active' | 'draft' | 'frozen' | 'deprecated',
          problem: '',
        },
        result.filePath,
      )
    }),
  )
}

// ----------------------------------------------------------------
// Direct mode (original — no external process)
// ----------------------------------------------------------------

function activateDirectMode(context: vscode.ExtensionContext): void {
  const cache = new FeatureCache()
  const statusBar = new FeatureStatusBar()

  // CodeLens provider for all file-scheme documents
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', pattern: '**/*' },
      new FeatureCodeLensProvider(cache),
    ),
  )

  // Hover provider for all file-scheme documents
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { scheme: 'file', pattern: '**/*' },
      new FeatureHoverProvider(cache),
    ),
  )

  // Update status bar whenever the active editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor) {
        statusBar.update(null)
        return
      }

      const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri)
      if (!workspaceFolder) {
        statusBar.update(null)
        return
      }

      const workspaceRoot = workspaceFolder.uri.fsPath
      const filePath = editor.document.uri.fsPath

      const entry =
        cache.get(filePath) ??
        FeatureWalker.findFeatureAndCache(filePath, workspaceRoot, cache)

      statusBar.update(entry?.feature ?? null, entry?.featureJsonPath)
    }),
  )

  // Watch feature.json files and invalidate cache on change or delete
  const watcher = vscode.workspace.createFileSystemWatcher('**/feature.json')
  watcher.onDidChange((uri) => cache.invalidate(uri.fsPath))
  watcher.onDidDelete((uri) => cache.invalidate(uri.fsPath))
  context.subscriptions.push(watcher)

  context.subscriptions.push(statusBar)
}

export function deactivate(): void {}

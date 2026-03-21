import { spawnSync } from 'node:child_process'

import * as vscode from 'vscode'
import { FeatureCache } from './services/FeatureCache.js'
import { FeatureWalker } from './services/FeatureWalker.js'
import { FeatureDiagnostics } from './services/FeatureDiagnostics.js'
import { FeatureCodeLensProvider } from './providers/CodeLensProvider.js'
import { FeatureHoverProvider } from './providers/HoverProvider.js'
import { FeatureStatusBar } from './statusbar/FeatureStatusBar.js'
import { FeatureTreeProvider } from './tree/FeatureTreeProvider.js'
import { showFeaturePanelCommand } from './commands/showFeaturePanel.js'
import { createFeatureCommand } from './commands/createFeature.js'
import { createChildFeatureCommand } from './commands/createChildFeature.js'
import { changeStatusCommand } from './commands/changeStatus.js'
import { searchFeaturesCommand } from './commands/searchFeatures.js'
import { addDecisionCommand } from './commands/addDecision.js'
import { exportMarkdownCommand } from './commands/exportMarkdown.js'
import { FeaturePanel } from './webview/FeaturePanel.js'
import { createLacLspClient, fetchBlameHttp } from './lsp/LacLspClient.js'
import type { LanguageClient } from 'vscode-languageclient/node'

/**
 * Probes whether `serverPath` exists and is executable by running `--help`.
 */
function isLacLspAvailable(serverPath: string): boolean {
  try {
    const result = spawnSync(serverPath, ['--help'], {
      timeout: 2000,
      stdio: 'ignore',
      windowsHide: true,
      shell: process.platform === 'win32',
    })
    return result.error === undefined && result.status === 0
  } catch {
    return false
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const cfg = vscode.workspace.getConfiguration('lacLens')
  const lspServerPath: string = cfg.get('lspServerPath', 'lac-lsp')
  const httpPort: number = cfg.get('httpPort', 7474)

  // Auto-detect LSP mode
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
    useLsp = false
  }

  // ── Feature Panel commands (all IDs open the same panel) ──────────────────
  const openPanel = showFeaturePanelCommand(context)
  context.subscriptions.push(
    vscode.commands.registerCommand('lacLens.openFeatureJson', openPanel),
    vscode.commands.registerCommand('lac.openFeatureJson', openPanel),
    vscode.commands.registerCommand('lacLens.showFeaturePanel', openPanel),
  )

  // ── New Feature wizard ────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('lacLens.createFeature', (uri?: vscode.Uri) =>
      createFeatureCommand(context, uri),
    ),
  )

  // ── New Child Feature ─────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('lacLens.createChildFeature', (uri?: vscode.Uri) => {
      // uri is the featureJsonPath when invoked from context menu on a feature node
      const path = uri?.fsPath
      return createChildFeatureCommand(context, path)
    }),
  )

  // ── Change Status ─────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('lacLens.changeStatus', () => changeStatusCommand()),
  )

  // ── Search Features ───────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('lacLens.searchFeatures', () =>
      searchFeaturesCommand(context),
    ),
  )

  // ── Add Decision ──────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('lacLens.addDecision', () => addDecisionCommand()),
  )

  // ── Export Markdown ───────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('lacLens.exportMarkdown', (featureJsonPath?: string) =>
      exportMarkdownCommand(featureJsonPath),
    ),
  )

  // ── Feature Tree View ─────────────────────────────────────────────────────
  const treeProvider = new FeatureTreeProvider()
  const treeView = vscode.window.createTreeView('lacLensFeatures', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  })
  context.subscriptions.push(treeView)
  void treeProvider.reloadAll()

  context.subscriptions.push(
    vscode.commands.registerCommand('lacLens.refreshTree', () => {
      void treeProvider.reloadAll()
    }),
  )

  // ── Local features (code lens, status bar, file watcher) ─────────────────
  const cache = activateLocalFeatures(context, treeProvider, { withCodeLens: true })

  // ── Diagnostics ───────────────────────────────────────────────────────────
  activateDiagnostics(context)

  // ── LSP or direct mode ────────────────────────────────────────────────────
  if (useLsp) {
    activateLspMode(context, lspServerPath, httpPort)
  } else {
    activateDirectMode(context, cache)
  }
}

// ── LSP mode ──────────────────────────────────────────────────────────────────

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

  context.subscriptions.push({ dispose: () => void lspClient.stop() })

  const statusBar = new FeatureStatusBar()
  context.subscriptions.push(statusBar)

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (!editor) { statusBar.update(null); return }
      const filePath = editor.document.uri.fsPath
      const result = await fetchBlameHttp(filePath, httpPort)
      if (!result) { statusBar.update(null); return }
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

// ── Local features (always active) ───────────────────────────────────────────

function activateLocalFeatures(
  context: vscode.ExtensionContext,
  treeProvider: FeatureTreeProvider,
  { withCodeLens = true }: { withCodeLens?: boolean } = {},
): FeatureCache {
  const cache = new FeatureCache()
  const statusBar = new FeatureStatusBar()

  const codeLensProvider = new FeatureCodeLensProvider(cache)
  if (withCodeLens) {
    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(
        { scheme: 'file', pattern: '**/*' },
        codeLensProvider,
      ),
      codeLensProvider,
    )
  }

  const updateStatusBar = (editor: vscode.TextEditor | undefined) => {
    if (!editor) { statusBar.update(null); return }
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri)
    if (!workspaceFolder) { statusBar.update(null); return }
    const entry =
      cache.get(editor.document.uri.fsPath) ??
      FeatureWalker.findFeatureAndCache(editor.document.uri.fsPath, workspaceFolder.uri.fsPath, cache)
    statusBar.update(entry?.feature ?? null, entry?.featureJsonPath)
  }

  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateStatusBar))
  updateStatusBar(vscode.window.activeTextEditor)

  const watcher = vscode.workspace.createFileSystemWatcher('**/feature.json')

  watcher.onDidChange((uri) => {
    cache.invalidate(uri.fsPath)
    codeLensProvider.refresh()
    const updated = FeatureWalker.readFeatureFile(uri.fsPath)
    if (updated) FeaturePanel.notify(uri.fsPath, updated)
    void treeProvider.reloadAll()
  })

  watcher.onDidCreate((_uri) => {
    void treeProvider.reloadAll()
  })

  watcher.onDidDelete((uri) => {
    cache.invalidate(uri.fsPath)
    codeLensProvider.refresh()
    FeaturePanel.close(uri.fsPath)
    void treeProvider.reloadAll()
  })

  context.subscriptions.push(watcher, statusBar)

  return cache
}

// ── Diagnostics ───────────────────────────────────────────────────────────────

function activateDiagnostics(context: vscode.ExtensionContext): void {
  const diags = new FeatureDiagnostics()
  context.subscriptions.push(diags)

  // Analyze all existing feature.json files on startup
  void diags.analyzeWorkspace()

  // Re-analyze when a feature.json is opened or saved
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (doc.fileName.endsWith('feature.json')) {
        diags.analyzeUri(doc.uri)
      }
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.fileName.endsWith('feature.json')) {
        diags.analyzeUri(doc.uri)
      }
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      if (doc.fileName.endsWith('feature.json')) {
        diags.clearUri(doc.uri)
      }
    }),
  )
}

// ── Direct mode (no external process) ────────────────────────────────────────

function activateDirectMode(context: vscode.ExtensionContext, cache: FeatureCache): void {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { scheme: 'file', pattern: '**/*' },
      new FeatureHoverProvider(cache),
    ),
  )
}

export function deactivate(): void {}

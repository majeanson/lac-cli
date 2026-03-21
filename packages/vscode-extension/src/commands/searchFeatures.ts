import * as vscode from 'vscode'

import type { Feature } from '../types/feature.js'
import { FeatureWalker } from '../services/FeatureWalker.js'
import { FeaturePanel } from '../webview/FeaturePanel.js'

const STATUS_ICON: Record<string, string> = {
  active: '⊙',
  draft: '◌',
  frozen: '❄',
  deprecated: '⊘',
}

interface FeatureQuickItem extends vscode.QuickPickItem {
  featureJsonPath: string
  feature: Feature
}

export async function searchFeaturesCommand(context: vscode.ExtensionContext): Promise<void> {
  const folders = vscode.workspace.workspaceFolders
  if (!folders || folders.length === 0) {
    void vscode.window.showWarningMessage('lac: No workspace folder open.')
    return
  }

  const uris = await vscode.workspace.findFiles('**/feature.json', '**/node_modules/**')

  const items: FeatureQuickItem[] = []
  for (const uri of uris) {
    const feature = FeatureWalker.readFeatureFile(uri.fsPath)
    if (!feature) continue
    items.push({
      label: `${STATUS_ICON[feature.status] ?? '⊙'} ${feature.featureKey}`,
      description: feature.title,
      detail: feature.tags?.length ? `tags: ${feature.tags.join(', ')}` : feature.problem.slice(0, 80),
      featureJsonPath: uri.fsPath,
      feature,
    })
  }

  if (items.length === 0) {
    void vscode.window.showInformationMessage('lac: No feature.json files found in workspace.')
    return
  }

  // Sort: active first, then draft, frozen, deprecated
  const ORDER = ['active', 'draft', 'frozen', 'deprecated']
  items.sort((a, b) => ORDER.indexOf(a.feature.status) - ORDER.indexOf(b.feature.status))

  const picked = await vscode.window.showQuickPick(items, {
    title: `lac: Search Features — ${items.length} found`,
    placeHolder: 'Type to filter by key, title, tags, or problem...',
    matchOnDescription: true,
    matchOnDetail: true,
  })

  if (!picked) return
  FeaturePanel.show(picked.featureJsonPath, picked.feature, context)
}

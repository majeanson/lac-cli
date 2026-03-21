import * as vscode from 'vscode'
import type { Feature } from '../types/feature.js'

export class FeatureStatusBar {
  private readonly statusBarItem: vscode.StatusBarItem

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    )
    this.statusBarItem.command = 'lacLens.showFeaturePanel'
  }

  update(feature: Feature | null, featureJsonPath?: string): void {
    const config = vscode.workspace.getConfiguration('lacLens')
    if (!config.get<boolean>('enableStatusBar', true) || !feature) {
      this.statusBarItem.hide()
      return
    }

    // Keep the status bar concise: icon + key + status
    const icons: Record<string, string> = {
      active: '⊙',
      draft: '◌',
      frozen: '❄',
      deprecated: '⊘',
    }
    const icon = icons[feature.status] ?? '⊙'
    this.statusBarItem.text = `${icon} ${feature.featureKey} · ${feature.status}`
    const tooltip = new vscode.MarkdownString()
    tooltip.isTrusted = true
    tooltip.appendMarkdown(`**${feature.title}**\n\n`)
    tooltip.appendMarkdown(`${icon} ${feature.status}\n\n`)
    if (feature.problem) {
      const snippet = feature.problem.length > 120
        ? `${feature.problem.slice(0, 120)}…`
        : feature.problem
      tooltip.appendMarkdown(`${snippet}`)
    }
    this.statusBarItem.tooltip = tooltip
    // Pass the featureJsonPath as the command argument when available
    if (featureJsonPath) {
      this.statusBarItem.command = {
        command: 'lacLens.showFeaturePanel',
        title: 'Show Feature Panel',
        arguments: [featureJsonPath],
      }
    } else {
      this.statusBarItem.command = 'lacLens.showFeaturePanel'
    }
    this.statusBarItem.show()
  }

  dispose(): void {
    this.statusBarItem.dispose()
  }
}

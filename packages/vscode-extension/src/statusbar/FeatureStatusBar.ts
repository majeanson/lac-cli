import * as vscode from 'vscode'
import type { Feature } from '../types/feature.js'

export class FeatureStatusBar {
  private readonly statusBarItem: vscode.StatusBarItem

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    )
    this.statusBarItem.command = 'lacLens.openFeatureJson'
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
    this.statusBarItem.tooltip = feature.title
    // Pass the featureJsonPath as the command argument when available
    if (featureJsonPath) {
      this.statusBarItem.command = {
        command: 'lacLens.openFeatureJson',
        title: 'Open feature.json',
        arguments: [featureJsonPath],
      }
    } else {
      this.statusBarItem.command = 'lacLens.openFeatureJson'
    }
    this.statusBarItem.show()
  }

  dispose(): void {
    this.statusBarItem.dispose()
  }
}

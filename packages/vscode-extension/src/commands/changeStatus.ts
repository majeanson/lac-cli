import * as fs from 'node:fs'

import * as vscode from 'vscode'

import type { FeatureStatus } from '../types/feature.js'
import { FeatureWalker } from '../services/FeatureWalker.js'
import { FeaturePanel } from '../webview/FeaturePanel.js'

export async function changeStatusCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    void vscode.window.showWarningMessage('lac: No active editor.')
    return
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri)
  if (!workspaceFolder) {
    void vscode.window.showWarningMessage('lac: File is not in a workspace.')
    return
  }

  const featureJsonPath = FeatureWalker.findFeatureJsonPath(
    editor.document.uri.fsPath,
    workspaceFolder.uri.fsPath,
  )
  if (!featureJsonPath) {
    void vscode.window.showWarningMessage('lac: No feature.json found for this file.')
    return
  }

  const feature = FeatureWalker.readFeatureFile(featureJsonPath)
  if (!feature) {
    void vscode.window.showWarningMessage('lac: Could not read feature.json.')
    return
  }

  const STATUSES: Array<{ label: string; value: FeatureStatus }> = [
    { label: '◌  draft', value: 'draft' },
    { label: '⊙  active', value: 'active' },
    { label: '❄  frozen', value: 'frozen' },
    { label: '⊘  deprecated', value: 'deprecated' },
  ]

  const picked = await vscode.window.showQuickPick(
    STATUSES.map((s) => ({
      ...s,
      description: s.value === feature.status ? '← current' : undefined,
    })),
    { title: `Change Status — ${feature.featureKey}` },
  )

  if (!picked || picked.value === feature.status) return

  const updated = { ...feature, status: picked.value }
  fs.writeFileSync(featureJsonPath, JSON.stringify(updated, null, 2) + '\n', 'utf-8')

  FeaturePanel.notify(featureJsonPath, updated)
  void vscode.window.showInformationMessage(
    `lac: ${feature.featureKey} is now ${picked.value}`,
  )
}

import * as fs from 'node:fs'

import * as vscode from 'vscode'

import { FeatureWalker } from '../services/FeatureWalker.js'
import { FeaturePanel } from '../webview/FeaturePanel.js'

export async function addDecisionCommand(): Promise<void> {
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

  // Step 1 — decision text
  const decision = await vscode.window.showInputBox({
    title: `Add Decision to "${feature.featureKey}" — Step 1 of 2`,
    prompt: 'What was decided?',
    placeHolder: 'e.g. Use PostgreSQL over MongoDB for ACID compliance',
    validateInput: (v) => (!v.trim() ? 'Decision is required' : undefined),
  })
  if (decision === undefined) return

  // Step 2 — rationale
  const rationale = await vscode.window.showInputBox({
    title: `Add Decision to "${feature.featureKey}" — Step 2 of 2`,
    prompt: 'Why was this decided?',
    placeHolder: 'e.g. We need strong consistency guarantees for financial data',
    validateInput: (v) => (!v.trim() ? 'Rationale is required' : undefined),
  })
  if (rationale === undefined) return

  const today = new Date().toISOString().slice(0, 10)
  const updated = {
    ...feature,
    decisions: [
      ...(feature.decisions ?? []),
      { decision: decision.trim(), rationale: rationale.trim(), date: today },
    ],
  }

  fs.writeFileSync(featureJsonPath, JSON.stringify(updated, null, 2) + '\n', 'utf-8')
  FeaturePanel.notify(featureJsonPath, updated)
  void vscode.window.showInformationMessage(
    `lac: Decision added to ${feature.featureKey} (${updated.decisions!.length} total)`,
  )
}

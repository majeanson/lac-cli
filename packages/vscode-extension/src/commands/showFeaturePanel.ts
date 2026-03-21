import * as vscode from 'vscode'

import { FeatureWalker } from '../services/FeatureWalker.js'
import { FeaturePanel } from '../webview/FeaturePanel.js'

/**
 * Command handler for `lacLens.showFeaturePanel` (and the legacy `lacLens.openFeatureJson` /
 * `lac.openFeatureJson`).
 *
 * Accepts an optional featureJsonPath argument (passed by code lens / context menu).
 * Falls back to walking up from the active editor when not provided.
 */
export function showFeaturePanelCommand(
  context: vscode.ExtensionContext,
): (featureJsonPath?: string) => Promise<void> {
  return async (featureJsonPath?: string) => {
    let targetPath = featureJsonPath

    if (!targetPath) {
      const editor = vscode.window.activeTextEditor
      if (!editor) {
        void vscode.window.showWarningMessage('lac-lens: No active editor to locate feature.json')
        return
      }
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri)
      if (!workspaceFolder) {
        void vscode.window.showWarningMessage('lac-lens: File is not inside a workspace folder')
        return
      }
      targetPath = FeatureWalker.findFeatureJsonPath(
        editor.document.uri.fsPath,
        workspaceFolder.uri.fsPath,
      ) ?? undefined
    }

    if (!targetPath) {
      void vscode.window.showWarningMessage('lac-lens: No feature.json found for this file')
      return
    }

    const feature = FeatureWalker.readFeatureFile(targetPath)
    if (!feature) {
      void vscode.window.showWarningMessage(
        `lac-lens: Could not parse feature.json at ${targetPath}`,
      )
      return
    }

    FeaturePanel.show(targetPath, feature, context)
  }
}

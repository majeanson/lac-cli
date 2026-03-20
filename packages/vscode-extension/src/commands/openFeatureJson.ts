import * as vscode from 'vscode'
import { FeatureWalker } from '../services/FeatureWalker.js'

export async function openFeatureJsonCommand(featureJsonPath?: string): Promise<void> {
  let targetPath = featureJsonPath

  // If no path was provided as a command argument, find one from the active editor
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

    const found = FeatureWalker.findFeatureJsonPath(
      editor.document.uri.fsPath,
      workspaceFolder.uri.fsPath,
    )

    if (!found) {
      void vscode.window.showInformationMessage('lac-lens: No feature.json found above this file')
      return
    }

    targetPath = found
  }

  const uri = vscode.Uri.file(targetPath)
  await vscode.window.showTextDocument(uri, {
    viewColumn: vscode.ViewColumn.Beside,
    preserveFocus: false,
  })
}

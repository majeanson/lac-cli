import * as path from 'node:path'
import * as fs from 'node:fs'

import * as vscode from 'vscode'

import type { Feature, FeatureStatus } from '../types/feature.js'
import { FeaturePanel } from '../webview/FeaturePanel.js'

const STATUS_ITEMS = [
  { label: '◌  draft', description: 'Work in progress', value: 'draft' as FeatureStatus },
  { label: '⊙  active', description: 'Currently in use', value: 'active' as FeatureStatus },
  { label: '❄  frozen', description: 'Stable, not actively developed', value: 'frozen' as FeatureStatus },
  { label: '⊘  deprecated', description: 'Being phased out', value: 'deprecated' as FeatureStatus },
]

export async function createFeatureCommand(
  context: vscode.ExtensionContext,
  uri?: vscode.Uri,
): Promise<void> {
  // Determine target directory
  let targetDir: string | undefined

  if (uri) {
    const stat = fs.statSync(uri.fsPath)
    targetDir = stat.isDirectory() ? uri.fsPath : path.dirname(uri.fsPath)
  } else {
    const editor = vscode.window.activeTextEditor
    if (editor) {
      targetDir = path.dirname(editor.document.uri.fsPath)
    } else {
      const folders = vscode.workspace.workspaceFolders
      if (folders && folders.length > 0) {
        const picked = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: 'Create feature.json here',
          defaultUri: folders[0].uri,
        })
        targetDir = picked?.[0]?.fsPath
      }
    }
  }

  if (!targetDir) {
    void vscode.window.showWarningMessage('lac: No target directory for new feature.')
    return
  }

  // Check if feature.json already exists
  const featureJsonPath = path.join(targetDir, 'feature.json')
  if (fs.existsSync(featureJsonPath)) {
    const choice = await vscode.window.showWarningMessage(
      `feature.json already exists at ${featureJsonPath}`,
      'Open it',
      'Cancel',
    )
    if (choice === 'Open it') {
      const doc = await vscode.workspace.openTextDocument(featureJsonPath)
      await vscode.window.showTextDocument(doc)
    }
    return
  }

  // Step 1 — feature key
  const featureKey = await vscode.window.showInputBox({
    title: 'New Feature — Step 1 of 4: Feature Key',
    prompt: 'Unique kebab-case identifier (e.g. auth-otp, payment-v2)',
    placeHolder: 'my-feature',
    validateInput: (v) => {
      if (!v.trim()) return 'Feature key is required'
      if (!/^[a-z0-9][a-z0-9-]*$/.test(v.trim())) return 'Use lowercase letters, numbers, and hyphens only'
      return undefined
    },
  })
  if (featureKey === undefined) return

  // Step 2 — title
  const title = await vscode.window.showInputBox({
    title: 'New Feature — Step 2 of 4: Title',
    prompt: 'Human-readable name',
    placeHolder: 'My Amazing Feature',
    validateInput: (v) => (!v.trim() ? 'Title is required' : undefined),
  })
  if (title === undefined) return

  // Step 3 — status
  const statusPick = await vscode.window.showQuickPick(STATUS_ITEMS, {
    title: 'New Feature — Step 3 of 4: Initial Status',
    placeHolder: 'Select status',
  })
  if (!statusPick) return

  // Step 4 — problem statement
  const problem = await vscode.window.showInputBox({
    title: 'New Feature — Step 4 of 4: Problem Statement',
    prompt: 'What problem does this feature solve?',
    placeHolder: 'Users need to...',
    validateInput: (v) => (!v.trim() ? 'Problem statement is required' : undefined),
  })
  if (problem === undefined) return

  const feature: Feature = {
    featureKey: featureKey.trim(),
    title: title.trim(),
    status: statusPick.value,
    problem: problem.trim(),
  }

  fs.writeFileSync(featureJsonPath, JSON.stringify(feature, null, 2) + '\n', 'utf-8')
  FeaturePanel.show(featureJsonPath, feature, context)
}

import * as path from 'node:path'
import * as fs from 'node:fs'

import * as vscode from 'vscode'

import type { Feature, FeatureStatus } from '../types/feature.js'
import { FeatureWalker } from '../services/FeatureWalker.js'
import { FeaturePanel } from '../webview/FeaturePanel.js'

const STATUS_ITEMS = [
  { label: '◌  draft', description: 'Work in progress', value: 'draft' as FeatureStatus },
  { label: '⊙  active', description: 'Currently in use', value: 'active' as FeatureStatus },
  { label: '❄  frozen', description: 'Stable, not actively developed', value: 'frozen' as FeatureStatus },
  { label: '⊘  deprecated', description: 'Being phased out', value: 'deprecated' as FeatureStatus },
]

export async function createChildFeatureCommand(
  context: vscode.ExtensionContext,
  parentFeatureJsonPath?: string,
): Promise<void> {
  // Find parent feature
  let parentPath = parentFeatureJsonPath

  if (!parentPath) {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      void vscode.window.showWarningMessage('lac: No active editor to find parent feature.')
      return
    }
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri)
    if (!workspaceFolder) {
      void vscode.window.showWarningMessage('lac: File is not inside a workspace folder.')
      return
    }
    parentPath =
      FeatureWalker.findFeatureJsonPath(editor.document.uri.fsPath, workspaceFolder.uri.fsPath) ??
      undefined
  }

  if (!parentPath) {
    void vscode.window.showWarningMessage(
      'lac: No parent feature.json found. Create a root feature first.',
    )
    return
  }

  const parentFeature = FeatureWalker.readFeatureFile(parentPath)
  if (!parentFeature) {
    void vscode.window.showWarningMessage('lac: Could not read parent feature.json.')
    return
  }

  const parentDir = path.dirname(parentPath)

  // Step 1 — child feature key
  const childKey = await vscode.window.showInputBox({
    title: `Child of "${parentFeature.featureKey}" — Step 1 of 4: Child Key`,
    prompt: 'Unique kebab-case identifier',
    placeHolder: `${parentFeature.featureKey}-sub`,
    validateInput: (v) => {
      if (!v.trim()) return 'Feature key is required'
      if (!/^[a-z0-9][a-z0-9-]*$/.test(v.trim())) return 'Use lowercase letters, numbers, and hyphens only'
      const childDir = path.join(parentDir, v.trim())
      if (fs.existsSync(path.join(childDir, 'feature.json'))) return 'A feature with this key already exists here'
      return undefined
    },
  })
  if (childKey === undefined) return

  // Step 2 — title
  const title = await vscode.window.showInputBox({
    title: `Child of "${parentFeature.featureKey}" — Step 2 of 4: Title`,
    placeHolder: 'Child Feature Title',
    validateInput: (v) => (!v.trim() ? 'Title is required' : undefined),
  })
  if (title === undefined) return

  // Step 3 — status
  const statusPick = await vscode.window.showQuickPick(STATUS_ITEMS, {
    title: `Child of "${parentFeature.featureKey}" — Step 3 of 4: Status`,
    placeHolder: 'Select status',
  })
  if (!statusPick) return

  // Step 4 — problem statement
  const problem = await vscode.window.showInputBox({
    title: `Child of "${parentFeature.featureKey}" — Step 4 of 4: Problem`,
    prompt: 'What specific problem does this child feature solve?',
    placeHolder: 'Narrower scope: ...',
    validateInput: (v) => (!v.trim() ? 'Problem is required' : undefined),
  })
  if (problem === undefined) return

  // Optional spawn reason
  const spawnReason = await vscode.window.showInputBox({
    title: 'Spawn Reason (optional — press Escape to skip)',
    prompt: 'Why was this split out from the parent?',
    placeHolder: 'e.g. Scope became too large to manage in a single feature',
  })

  // Create child directory + feature.json
  const childDir = path.join(parentDir, childKey.trim())
  if (!fs.existsSync(childDir)) fs.mkdirSync(childDir, { recursive: true })

  const childFeaturePath = path.join(childDir, 'feature.json')
  const childFeature: Feature = {
    featureKey: childKey.trim(),
    title: title.trim(),
    status: statusPick.value,
    problem: problem.trim(),
    lineage: {
      parent: parentFeature.featureKey,
      ...(spawnReason?.trim() ? { spawnReason: spawnReason.trim() } : {}),
    },
  }

  fs.writeFileSync(childFeaturePath, JSON.stringify(childFeature, null, 2) + '\n', 'utf-8')

  // Update parent's lineage.children
  const updatedChildren = [...new Set([...(parentFeature.lineage?.children ?? []), childKey.trim()])]
  const updatedParent: Feature = {
    ...parentFeature,
    lineage: {
      ...parentFeature.lineage,
      children: updatedChildren,
    },
  }
  fs.writeFileSync(parentPath, JSON.stringify(updatedParent, null, 2) + '\n', 'utf-8')
  FeaturePanel.notify(parentPath, updatedParent)

  FeaturePanel.show(childFeaturePath, childFeature, context)
}

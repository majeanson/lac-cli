import * as path from 'node:path'

import * as vscode from 'vscode'

import type { Feature } from '../types/feature.js'
import { FeatureWalker } from '../services/FeatureWalker.js'

export async function exportMarkdownCommand(featureJsonPath?: string): Promise<void> {
  let targetPath = featureJsonPath

  if (!targetPath) {
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
    targetPath =
      FeatureWalker.findFeatureJsonPath(editor.document.uri.fsPath, workspaceFolder.uri.fsPath) ??
      undefined
  }

  if (!targetPath) {
    void vscode.window.showWarningMessage('lac: No feature.json found.')
    return
  }

  const feature = FeatureWalker.readFeatureFile(targetPath)
  if (!feature) {
    void vscode.window.showWarningMessage('lac: Could not read feature.json.')
    return
  }

  const md = featureToMarkdown(feature)

  const doc = await vscode.workspace.openTextDocument({
    content: md,
    language: 'markdown',
  })
  await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside)

  const outputPath = path.join(path.dirname(targetPath), `${feature.featureKey}.md`)
  const save = await vscode.window.showInformationMessage(
    `lac: Export ready. Save as ${path.basename(outputPath)}?`,
    'Save',
    'Discard',
  )

  if (save === 'Save') {
    const encoder = new TextEncoder()
    await vscode.workspace.fs.writeFile(vscode.Uri.file(outputPath), encoder.encode(md))
    void vscode.window.showInformationMessage(`lac: Saved → ${outputPath}`)
  }
}

function featureToMarkdown(f: Feature): string {
  const ICONS: Record<string, string> = {
    active: '⊙',
    draft: '◌',
    frozen: '❄',
    deprecated: '⊘',
  }
  const icon = ICONS[f.status] ?? '⊙'
  const lines: string[] = []

  lines.push(`# ${icon} ${f.title}`)
  lines.push('')
  lines.push(`**Key:** \`${f.featureKey}\` · **Status:** \`${f.status}\``)
  if (f.tags?.length) lines.push(`**Tags:** ${f.tags.map((t) => `\`${t}\``).join(' ')}`)
  lines.push('')

  lines.push('## Problem')
  lines.push('')
  lines.push(f.problem)
  lines.push('')

  if (f.lineage?.parent || f.lineage?.children?.length || f.lineage?.spawnReason) {
    lines.push('## Lineage')
    lines.push('')
    if (f.lineage.parent) lines.push(`- **Parent:** \`${f.lineage.parent}\``)
    if (f.lineage.spawnReason) lines.push(`- **Spawn reason:** ${f.lineage.spawnReason}`)
    if (f.lineage.children?.length)
      lines.push(`- **Children:** ${f.lineage.children.map((c) => `\`${c}\``).join(', ')}`)
    lines.push('')
  }

  if (f.analysis?.trim()) {
    lines.push('## Analysis')
    lines.push('')
    lines.push(f.analysis)
    lines.push('')
  }

  if (f.decisions?.length) {
    lines.push('## Decisions')
    lines.push('')
    for (const d of f.decisions) {
      lines.push(`### ${d.decision}`)
      if (d.date) lines.push(`*${d.date}*`)
      lines.push('')
      lines.push(`**Rationale:** ${d.rationale}`)
      if (d.alternativesConsidered?.length) {
        lines.push('')
        lines.push('**Alternatives considered:**')
        for (const a of d.alternativesConsidered) lines.push(`- ${a}`)
      }
      lines.push('')
    }
  }

  if (f.implementation?.trim()) {
    lines.push('## Implementation')
    lines.push('')
    lines.push(f.implementation)
    lines.push('')
  }

  if (f.knownLimitations?.length) {
    lines.push('## Known Limitations')
    lines.push('')
    for (const l of f.knownLimitations) lines.push(`- ${l}`)
    lines.push('')
  }

  if (f.annotations?.length) {
    lines.push('## Annotations')
    lines.push('')
    for (const a of f.annotations) {
      lines.push(`### [${a.type.toUpperCase()}] ${a.author} · ${a.date}`)
      lines.push('')
      lines.push(a.body)
      lines.push('')
    }
  }

  return lines.join('\n')
}

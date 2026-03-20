import * as vscode from 'vscode'
import { FeatureCache } from '../services/FeatureCache.js'
import { FeatureWalker } from '../services/FeatureWalker.js'
import type { Feature } from '../types/feature.js'

/** Escape backticks in markdown string values to prevent broken inline code spans. */
function escapeBackticks(str: string): string {
  return str.replace(/`/g, '\\`')
}

function buildHoverContent(feature: Feature): vscode.MarkdownString {
  const md = new vscode.MarkdownString()
  md.isTrusted = true

  const title = escapeBackticks(feature.title)
  const problem = escapeBackticks(feature.problem)

  md.appendMarkdown(`## ${feature.featureKey} · ${title} [${feature.status}]\n\n`)
  md.appendMarkdown(`**Problem:** ${problem}\n\n`)

  if (feature.decisions && feature.decisions.length > 0) {
    md.appendMarkdown('---\n\n**Decisions:**\n\n')
    for (const d of feature.decisions) {
      md.appendMarkdown(`- ${escapeBackticks(d.decision)} *(${escapeBackticks(d.rationale)})*\n`)
    }
    md.appendMarkdown('\n')
  }

  if (feature.knownLimitations && feature.knownLimitations.length > 0) {
    md.appendMarkdown('---\n\n**Known Limitations:**\n\n')
    for (const limitation of feature.knownLimitations) {
      md.appendMarkdown(`- ${escapeBackticks(limitation)}\n`)
    }
    md.appendMarkdown('\n')
  }

  return md
}

export class FeatureHoverProvider implements vscode.HoverProvider {
  constructor(private readonly cache: FeatureCache) {}

  provideHover(
    document: vscode.TextDocument,
    _position: vscode.Position,
  ): vscode.Hover | null {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
    if (!workspaceFolder) return null
    const workspaceRoot = workspaceFolder.uri.fsPath
    const filePath = document.uri.fsPath

    let cached = this.cache.get(filePath)
    if (!cached) {
      const found = FeatureWalker.findFeatureAndCache(filePath, workspaceRoot, this.cache)
      if (!found) return null
      cached = { feature: found.feature, featureJsonPath: found.featureJsonPath, expiresAt: 0 }
    }

    return new vscode.Hover(buildHoverContent(cached.feature))
  }
}

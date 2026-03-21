import * as vscode from 'vscode'
import { FeatureCache } from '../services/FeatureCache.js'
import { FeatureWalker } from '../services/FeatureWalker.js'
import type { Feature } from '../types/feature.js'

/** Escape backticks in markdown string values to prevent broken inline code spans. */
function escapeBackticks(str: string): string {
  return str.replace(/`/g, '\\`')
}

const STATUS_COLOR: Record<string, string> = {
  active: '🟢',
  draft: '🟡',
  frozen: '🔵',
  deprecated: '🔴',
}

function buildHoverContent(feature: Feature, featureJsonPath: string): vscode.MarkdownString {
  const md = new vscode.MarkdownString()
  md.isTrusted = true

  const title = escapeBackticks(feature.title)
  const problem = escapeBackticks(feature.problem)
  const statusBadge = STATUS_COLOR[feature.status] ?? '⚪'

  md.appendMarkdown(`## ${feature.featureKey} · ${title}\n\n`)
  md.appendMarkdown(`${statusBadge} **${feature.status}**`)

  if (feature.tags && feature.tags.length > 0) {
    const tagList = feature.tags.map(t => `\`${t}\``).join(' ')
    md.appendMarkdown(`  ·  ${tagList}`)
  }

  md.appendMarkdown(`\n\n**Problem:** ${problem}\n\n`)

  if (feature.analysis) {
    const snippet = feature.analysis.length > 150
      ? `${escapeBackticks(feature.analysis.slice(0, 150))}…`
      : escapeBackticks(feature.analysis)
    md.appendMarkdown(`**Analysis:** ${snippet}\n\n`)
  }

  if (feature.lineage?.parent) {
    md.appendMarkdown(`**Lineage:** spawned from \`${feature.lineage.parent}\``)
    if (feature.lineage.spawnReason) {
      md.appendMarkdown(` — *${escapeBackticks(feature.lineage.spawnReason)}*`)
    }
    md.appendMarkdown('\n\n')
  }

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

  if (feature.annotations && feature.annotations.length > 0) {
    const ANNOTATION_ICON: Record<string, string> = {
      decision: '🔷',
      warning: '⚠️',
      assumption: '💭',
      lesson: '📖',
    }
    const shown = feature.annotations.slice(0, 3)
    const extra = feature.annotations.length - shown.length
    md.appendMarkdown('---\n\n**Annotations:**\n\n')
    for (const a of shown) {
      const icon = ANNOTATION_ICON[a.type] ?? '📌'
      md.appendMarkdown(`${icon} **${a.type}** *(${a.author}, ${a.date})*: ${escapeBackticks(a.body)}\n\n`)
    }
    if (extra > 0) {
      md.appendMarkdown(`*… ${extra} more annotation${extra > 1 ? 's' : ''}*\n\n`)
    }
  }

  const args = encodeURIComponent(JSON.stringify([featureJsonPath]))
  md.appendMarkdown(`---\n\n[$(go-to-file) Open feature.json](command:lacLens.openFeatureJson?${args})\n`)

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

    const cached = this.cache.get(filePath) ?? FeatureWalker.findFeatureAndCache(filePath, workspaceRoot, this.cache)
    if (!cached) return null

    return new vscode.Hover(buildHoverContent(cached.feature, cached.featureJsonPath))
  }
}

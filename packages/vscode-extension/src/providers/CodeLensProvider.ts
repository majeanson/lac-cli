import * as vscode from 'vscode'
import { FeatureCache } from '../services/FeatureCache.js'
import { FeatureWalker } from '../services/FeatureWalker.js'
import type { Feature, FeatureStatus } from '../types/feature.js'

const STATUS_ICON: Record<FeatureStatus, string> = {
  active: '⊙',
  draft: '◌',
  frozen: '❄',
  deprecated: '⊘',
}

function computeCompleteness(feature: Record<string, unknown>): number {
  const fields = ['analysis', 'decisions', 'implementation', 'knownLimitations', 'tags', 'annotations']
  const filled = fields.filter(f => {
    const v = feature[f]
    if (v == null || v === '') return false
    if (Array.isArray(v)) return v.length > 0
    return typeof v === 'string' && v.trim().length > 0
  }).length
  return Math.round((filled / fields.length) * 100)
}

function buildLensTitle(feature: Feature): string {
  const icon = STATUS_ICON[feature.status] ?? '⊙'
  const completeness = computeCompleteness(feature as unknown as Record<string, unknown>)
  const pctSuffix = completeness > 0 ? ` · ${completeness}%` : ''
  return `${icon} ${feature.featureKey} · ${feature.title} · ${feature.status}${pctSuffix}`
}

export class FeatureCodeLensProvider implements vscode.CodeLensProvider {
  constructor(private readonly cache: FeatureCache) {}

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const config = vscode.workspace.getConfiguration('lacLens')
    if (!config.get<boolean>('enableCodeLens', true)) {
      return []
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
    if (!workspaceFolder) return []
    const workspaceRoot = workspaceFolder.uri.fsPath
    const filePath = document.uri.fsPath

    let cached = this.cache.get(filePath)
    if (!cached) {
      const found = FeatureWalker.findFeatureAndCache(filePath, workspaceRoot, this.cache)
      if (!found) return []
      cached = { feature: found.feature, featureJsonPath: found.featureJsonPath, expiresAt: 0 }
    }

    const { feature, featureJsonPath } = cached
    const range = new vscode.Range(0, 0, 0, 0)
    const lens = new vscode.CodeLens(range, {
      title: buildLensTitle(feature),
      command: 'lacLens.openFeatureJson',
      arguments: [featureJsonPath],
    })

    return [lens]
  }
}

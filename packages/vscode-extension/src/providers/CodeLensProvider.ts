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

function computeCompleteness(feature: Feature): number {
  const f = feature as unknown as Record<string, unknown>
  const fields = ['analysis', 'decisions', 'implementation', 'knownLimitations', 'tags', 'annotations']
  const filled = fields.filter(key => {
    const v = f[key]
    if (v == null || v === '') return false
    if (Array.isArray(v)) return v.length > 0
    return typeof v === 'string' && v.trim().length > 0
  }).length
  return Math.round((filled / fields.length) * 100)
}

function buildLensTitle(feature: Feature): string {
  const icon = STATUS_ICON[feature.status] ?? '⊙'
  const completeness = computeCompleteness(feature)
  const pctSuffix = completeness > 0 ? ` · ${completeness}%` : ''
  return `${icon} ${feature.featureKey} · ${feature.title} · ${feature.status}${pctSuffix}`
}

export class FeatureCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>()
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event

  constructor(private readonly cache: FeatureCache) {}

  /** Call this when a feature.json changes so VS Code re-requests code lenses. */
  refresh(): void {
    this._onDidChangeCodeLenses.fire()
  }

  dispose(): void {
    this._onDidChangeCodeLenses.dispose()
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const config = vscode.workspace.getConfiguration('lacLens')
    if (!config.get<boolean>('enableCodeLens', true)) {
      return []
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
    if (!workspaceFolder) return []
    const workspaceRoot = workspaceFolder.uri.fsPath
    const filePath = document.uri.fsPath

    const cached = this.cache.get(filePath) ?? FeatureWalker.findFeatureAndCache(filePath, workspaceRoot, this.cache)
    if (!cached) return []

    const { feature, featureJsonPath } = cached
    return [new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
      title: buildLensTitle(feature),
      command: 'lacLens.openFeatureJson',
      arguments: [featureJsonPath],
    })]
  }

  resolveCodeLens(lens: vscode.CodeLens): vscode.CodeLens {
    return lens
  }
}

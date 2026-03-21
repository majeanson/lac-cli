import * as vscode from 'vscode'

import type { Feature } from '../types/feature.js'
import { FeatureWalker } from './FeatureWalker.js'

export class FeatureDiagnostics implements vscode.Disposable {
  private readonly collection: vscode.DiagnosticCollection

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection('lac-lens')
  }

  analyzeUri(uri: vscode.Uri): void {
    const feature = FeatureWalker.readFeatureFile(uri.fsPath)
    if (!feature) {
      this.collection.set(uri, [])
      return
    }
    this.collection.set(uri, this._diagnose(feature))
  }

  clearUri(uri: vscode.Uri): void {
    this.collection.delete(uri)
  }

  async analyzeWorkspace(): Promise<void> {
    const uris = await vscode.workspace.findFiles('**/feature.json', '**/node_modules/**')
    for (const uri of uris) {
      this.analyzeUri(uri)
    }
  }

  dispose(): void {
    this.collection.dispose()
  }

  // ── Rules ──────────────────────────────────────────────────────────────────

  private _diagnose(feature: Feature): vscode.Diagnostic[] {
    const diags: vscode.Diagnostic[] = []
    const top = new vscode.Range(0, 0, 0, 0)

    // Problem statement is always required
    if (!feature.problem?.trim()) {
      diags.push(
        this._diag(top, 'Feature is missing a problem statement.', vscode.DiagnosticSeverity.Error),
      )
    }

    // Active features should be well-documented
    if (feature.status === 'active') {
      if (!feature.analysis?.trim()) {
        diags.push(
          this._diag(
            top,
            'Active feature is missing an "analysis" section. Document the investigation that led to this feature.',
            vscode.DiagnosticSeverity.Warning,
          ),
        )
      }
      if (!feature.implementation?.trim()) {
        diags.push(
          this._diag(
            top,
            'Active feature is missing an "implementation" section. Describe how it was built.',
            vscode.DiagnosticSeverity.Warning,
          ),
        )
      }
      if (!feature.decisions?.length) {
        diags.push(
          this._diag(
            top,
            'Active feature has no recorded decisions. Use "lac: Add Decision" to log key choices.',
            vscode.DiagnosticSeverity.Information,
          ),
        )
      }
    }

    // Lineage integrity: if a parent is declared, warn if children list is suspicious
    if (feature.lineage?.parent && feature.lineage.parent === feature.featureKey) {
      diags.push(
        this._diag(top, 'Lineage.parent points to self — this is likely a mistake.', vscode.DiagnosticSeverity.Warning),
      )
    }

    return diags
  }

  private _diag(
    range: vscode.Range,
    message: string,
    severity: vscode.DiagnosticSeverity,
  ): vscode.Diagnostic {
    const d = new vscode.Diagnostic(range, message, severity)
    d.source = 'lac-lens'
    return d
  }
}

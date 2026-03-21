import * as vscode from 'vscode'

import type { Feature } from '../types/feature.js'
import { FeatureWalker } from '../services/FeatureWalker.js'

const STATUS_ICON: Record<string, string> = {
  active: '⊙',
  draft: '◌',
  frozen: '❄',
  deprecated: '⊘',
}

const STATUS_ORDER = ['active', 'draft', 'frozen', 'deprecated']

const THEME_ICONS: Record<string, string> = {
  active: 'circle-filled',
  draft: 'circle-outline',
  frozen: 'lock',
  deprecated: 'archive',
}

export interface FeatureEntry {
  featureJsonPath: string
  feature: Feature
}

// ── Tree nodes ────────────────────────────────────────────────────────────────

class StatusGroupNode extends vscode.TreeItem {
  constructor(public readonly status: string, count: number) {
    super(
      `${STATUS_ICON[status] ?? '⊙'} ${status}  (${count})`,
      vscode.TreeItemCollapsibleState.Expanded,
    )
    this.contextValue = 'lacFeatureGroup'
    this.iconPath = new vscode.ThemeIcon(THEME_ICONS[status] ?? 'circle-filled')
  }
}

class FeatureNode extends vscode.TreeItem {
  constructor(public readonly entry: FeatureEntry) {
    super(entry.feature.featureKey, vscode.TreeItemCollapsibleState.None)
    this.description = entry.feature.title
    this.tooltip = new vscode.MarkdownString(
      `**${entry.feature.featureKey}** · ${entry.feature.status}\n\n${entry.feature.problem}`,
    )
    this.command = {
      command: 'lacLens.showFeaturePanel',
      title: 'Open Feature Panel',
      arguments: [entry.featureJsonPath],
    }
    this.contextValue = 'lacFeature'
    this.iconPath = new vscode.ThemeIcon(THEME_ICONS[entry.feature.status] ?? 'circle-filled')
  }
}

type TreeNode = StatusGroupNode | FeatureNode

// ── Provider ──────────────────────────────────────────────────────────────────

export class FeatureTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    TreeNode | undefined | null | void
  >()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private _entries: FeatureEntry[] = []

  refresh(): void {
    this._onDidChangeTreeData.fire()
  }

  async reloadAll(): Promise<void> {
    const uris = await vscode.workspace.findFiles('**/feature.json', '**/node_modules/**')
    this._entries = []
    for (const uri of uris) {
      const feature = FeatureWalker.readFeatureFile(uri.fsPath)
      if (feature) this._entries.push({ featureJsonPath: uri.fsPath, feature })
    }
    this.refresh()
  }

  // ── vscode.TreeDataProvider implementation ─────────────────────────────────

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      return this._buildStatusGroups()
    }
    if (element instanceof StatusGroupNode) {
      return this._entriesForStatus(element.status).map((e) => new FeatureNode(e))
    }
    return []
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _buildStatusGroups(): StatusGroupNode[] {
    const grouped = this._groupByStatus()
    return STATUS_ORDER
      .filter((s) => (grouped.get(s)?.length ?? 0) > 0)
      .map((s) => new StatusGroupNode(s, grouped.get(s)!.length))
  }

  private _entriesForStatus(status: string): FeatureEntry[] {
    return this._groupByStatus().get(status) ?? []
  }

  private _groupByStatus(): Map<string, FeatureEntry[]> {
    const map = new Map<string, FeatureEntry[]>()
    for (const entry of this._entries) {
      const group = map.get(entry.feature.status) ?? []
      group.push(entry)
      map.set(entry.feature.status, group)
    }
    return map
  }
}

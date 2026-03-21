import * as fs from 'node:fs'
import { randomBytes } from 'node:crypto'

import * as vscode from 'vscode'

import { FeatureWalker } from '../services/FeatureWalker.js'
import type { Feature } from '../types/feature.js'

// ── Message types ─────────────────────────────────────────────────────────────

type OutgoingMessage = { type: 'update'; feature: Feature }

type IncomingMessage =
  | { type: 'editSave'; field: string; value: unknown }
  | { type: 'openFeature'; featureKey: string }
  | { type: 'exportMarkdown' }

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_ICON: Record<string, string> = {
  active: '⊙',
  draft: '◌',
  frozen: '❄',
  deprecated: '⊘',
}

const STATUS_COLOR: Record<string, string> = {
  active: 'var(--vscode-charts-green, #4ec9b0)',
  draft: 'var(--vscode-charts-yellow, #dcdcaa)',
  frozen: 'var(--vscode-charts-blue, #569cd6)',
  deprecated: 'var(--vscode-charts-red, #f44747)',
}

// ── FeaturePanel ──────────────────────────────────────────────────────────────

export class FeaturePanel {
  private static readonly panels = new Map<string, FeaturePanel>()

  private readonly _panel: vscode.WebviewPanel
  private readonly _disposables: vscode.Disposable[] = []
  private _feature: Feature

  // ── Factory ─────────────────────────────────────────────────────────────────

  static show(
    featureJsonPath: string,
    feature: Feature,
    context: vscode.ExtensionContext,
  ): void {
    const existing = FeaturePanel.panels.get(featureJsonPath)
    if (existing) {
      existing._panel.reveal(vscode.ViewColumn.Beside)
      existing._setHtml(feature)
      return
    }

    const panel = vscode.window.createWebviewPanel(
      'lacLens.featurePanel',
      `${STATUS_ICON[feature.status] ?? '⊙'} ${feature.featureKey}`,
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    )

    const fp = new FeaturePanel(panel, featureJsonPath, context, feature)
    fp._setHtml(feature)
    FeaturePanel.panels.set(featureJsonPath, fp)
  }

  /** Sends a live-update postMessage so the active tab is preserved. */
  static notify(featureJsonPath: string, feature: Feature): void {
    const panel = FeaturePanel.panels.get(featureJsonPath)
    if (!panel) return
    panel._feature = feature
    panel._send({ type: 'update', feature })
    panel._panel.title = `${STATUS_ICON[feature.status] ?? '⊙'} ${feature.featureKey}`
  }

  /** Called from the file watcher delete event. */
  static close(featureJsonPath: string): void {
    FeaturePanel.panels.get(featureJsonPath)?._panel.dispose()
  }

  // ── Instance ────────────────────────────────────────────────────────────────

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly featureJsonPath: string,
    private readonly context: vscode.ExtensionContext,
    feature: Feature,
  ) {
    this._panel = panel
    this._feature = feature
    this._panel.onDidDispose(() => this._dispose(), null, this._disposables)
    this._panel.webview.onDidReceiveMessage(
      (msg: IncomingMessage) => void this._handleMessage(msg),
      null,
      this._disposables,
    )
  }

  private _dispose(): void {
    FeaturePanel.panels.delete(this.featureJsonPath)
    this._panel.dispose()
    for (const d of this._disposables) d.dispose()
    this._disposables.length = 0
  }

  private _send(msg: OutgoingMessage): void {
    void this._panel.webview.postMessage(msg)
  }

  private _setHtml(feature: Feature): void {
    this._feature = feature
    this._panel.title = `${STATUS_ICON[feature.status] ?? '⊙'} ${feature.featureKey}`
    this._panel.webview.html = buildHtml(feature, this.featureJsonPath)
  }

  private async _handleMessage(msg: IncomingMessage): Promise<void> {
    if (msg.type === 'editSave') {
      await this._handleEditSave(msg.field, msg.value)
    } else if (msg.type === 'openFeature') {
      await this._handleOpenFeature(msg.featureKey)
    } else if (msg.type === 'exportMarkdown') {
      await vscode.commands.executeCommand('lacLens.exportMarkdown', this.featureJsonPath)
    }
  }

  private async _handleEditSave(field: string, value: unknown): Promise<void> {
    const allowedStringFields = ['title', 'status', 'problem', 'analysis', 'implementation']
    const allowedArrayFields = ['knownLimitations', 'tags']

    let updated: Feature = { ...this._feature }

    if (allowedStringFields.includes(field) && typeof value === 'string') {
      updated = { ...updated, [field]: value }
    } else if (allowedArrayFields.includes(field) && typeof value === 'string') {
      // Treat newline-separated lines as array items
      const arr = value.split('\n').map((l) => l.trim()).filter(Boolean)
      updated = { ...updated, [field]: arr }
    } else {
      return
    }

    try {
      fs.writeFileSync(this.featureJsonPath, JSON.stringify(updated, null, 2) + '\n', 'utf-8')
      this._feature = updated
      this._panel.title = `${STATUS_ICON[updated.status] ?? '⊙'} ${updated.featureKey}`
      this._send({ type: 'update', feature: updated })
    } catch (err) {
      void vscode.window.showErrorMessage(
        `lac: Failed to save feature — ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  private async _handleOpenFeature(featureKey: string): Promise<void> {
    const uris = await vscode.workspace.findFiles('**/feature.json', '**/node_modules/**')
    for (const uri of uris) {
      const f = FeatureWalker.readFeatureFile(uri.fsPath)
      if (f?.featureKey === featureKey) {
        FeaturePanel.show(uri.fsPath, f, this.context)
        return
      }
    }
    void vscode.window.showWarningMessage(`lac: No feature found with key "${featureKey}"`)
  }
}

// ── HTML generation ───────────────────────────────────────────────────────────

function nonce(): string {
  return randomBytes(16).toString('hex')
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildHtml(feature: Feature, featureJsonPath: string): string {
  const n = nonce()

  interface Tab { id: string; label: string; body: string }
  const tabs: Tab[] = []

  tabs.push({ id: 'overview', label: 'Overview', body: overviewTab(feature, featureJsonPath) })
  if (feature.analysis?.trim()) tabs.push({ id: 'analysis', label: 'Analysis', body: markdownTab(feature.analysis, 'analysis') })
  if (feature.decisions?.length) tabs.push({ id: 'decisions', label: `Decisions (${feature.decisions.length})`, body: decisionsTab(feature.decisions) })
  if (feature.implementation?.trim()) tabs.push({ id: 'implementation', label: 'Implementation', body: markdownTab(feature.implementation, 'implementation') })
  if (feature.knownLimitations?.length) tabs.push({ id: 'limitations', label: 'Limitations', body: limitationsTab(feature.knownLimitations) })
  if (feature.annotations?.length) tabs.push({ id: 'annotations', label: `Annotations (${feature.annotations.length})`, body: annotationsTab(feature.annotations) })

  const tabBtns = tabs.map((t, i) =>
    `<button class="tab-btn${i === 0 ? ' active' : ''}" data-tab="${t.id}">${esc(t.label)}</button>`,
  ).join('\n')

  const tabPanels = tabs.map((t, i) =>
    `<section id="panel-${t.id}" class="tab-panel${i === 0 ? ' active' : ''}">${t.body}</section>`,
  ).join('\n')

  const statusOptions = ['draft', 'active', 'frozen', 'deprecated']
    .map((s) => `<option value="${s}"${s === feature.status ? ' selected' : ''}>${STATUS_ICON[s] ?? ''} ${s}</option>`)
    .join('')

  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${n}'; style-src 'nonce-${n}';">
<style nonce="${n}">
  *, *::before, *::after { box-sizing: border-box; }

  body {
    font-family: var(--vscode-font-family, system-ui, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
    margin: 0; padding: 0; min-height: 100vh;
  }

  /* ── Header ── */
  .header {
    padding: 16px 24px 12px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,.2));
  }
  .header-top {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px;
  }
  .feature-key {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px; color: var(--vscode-descriptionForeground); letter-spacing: .04em;
  }
  .feature-title {
    font-size: 18px; font-weight: 600; color: var(--vscode-editor-foreground);
    margin: 0 0 4px; display: flex; align-items: center; gap: 8px;
  }
  .status-badge {
    display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px;
    border-radius: 10px; font-size: 11px; font-weight: 600; letter-spacing: .05em;
    text-transform: uppercase; border: 1px solid currentColor; cursor: pointer;
  }
  .tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
  .tag {
    background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
    padding: 1px 7px; border-radius: 9px; font-size: 11px;
  }
  .header-actions { display: flex; gap: 6px; margin-top: 8px; }

  /* ── Tab bar ── */
  .tab-bar {
    display: flex; border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,.2));
    padding: 0 20px; overflow-x: auto;
  }
  .tab-btn {
    background: none; border: none; border-bottom: 2px solid transparent;
    color: var(--vscode-tab-inactiveForeground, var(--vscode-descriptionForeground));
    cursor: pointer; font: inherit; font-size: 12px; padding: 8px 14px;
    margin-bottom: -1px; white-space: nowrap; transition: color .1s, border-color .1s;
  }
  .tab-btn:hover { color: var(--vscode-editor-foreground); }
  .tab-btn.active {
    color: var(--vscode-editor-foreground);
    border-bottom-color: var(--vscode-focusBorder, #007acc); font-weight: 500;
  }

  /* ── Tab panels ── */
  .tab-panel { display: none; padding: 24px; max-width: 860px; }
  .tab-panel.active { display: block; }

  /* ── Typography ── */
  h1, h2, h3 { color: var(--vscode-editor-foreground); margin: 1.2em 0 .4em; }
  h2 {
    font-size: 12px; text-transform: uppercase; letter-spacing: .08em;
    color: var(--vscode-descriptionForeground); margin-top: 1.6em;
    display: flex; align-items: center; gap: 8px;
  }
  h3 { font-size: 13px; }
  p { margin: .5em 0; line-height: 1.65; }
  a { color: var(--vscode-textLink-foreground); text-decoration: none; }
  a:hover { text-decoration: underline; }
  code {
    font-family: var(--vscode-editor-font-family, monospace); font-size: .9em;
    background: var(--vscode-textBlockQuote-background, rgba(128,128,128,.1));
    padding: 1px 5px; border-radius: 3px;
  }
  pre {
    background: var(--vscode-textCodeBlock-background, var(--vscode-textBlockQuote-background));
    padding: 12px 16px; border-radius: 4px; overflow-x: auto; margin: .8em 0;
  }
  pre code { background: none; padding: 0; }
  ul, ol { padding-left: 1.5em; margin: .5em 0; }
  li { margin: .2em 0; line-height: 1.6; }

  /* ── Buttons ── */
  .btn {
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    border: none; border-radius: 3px; padding: 4px 10px; font: inherit; font-size: 12px;
    cursor: pointer; white-space: nowrap;
  }
  .btn:hover { background: var(--vscode-button-hoverBackground); }
  .btn-secondary {
    background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);
  }
  .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .btn-ghost {
    background: none; color: var(--vscode-descriptionForeground); border: none;
    cursor: pointer; font: inherit; font-size: 11px; padding: 2px 6px; border-radius: 3px;
    opacity: .7;
  }
  .btn-ghost:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }

  /* ── Inline edit ── */
  .section-header { display: flex; align-items: center; justify-content: space-between; }
  .edit-area {
    width: 100%; min-height: 100px; background: var(--vscode-input-background);
    color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, rgba(128,128,128,.4));
    border-radius: 4px; padding: 8px; font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 13px); resize: vertical;
    display: none; box-sizing: border-box; margin-top: 6px;
  }
  .edit-area.visible { display: block; }
  .edit-actions { display: none; gap: 6px; margin-top: 6px; }
  .edit-actions.visible { display: flex; }
  .content-view { }
  .content-view.hidden { display: none; }

  /* ── Status selector ── */
  .status-select {
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, rgba(128,128,128,.4)); border-radius: 4px;
    padding: 3px 6px; font: inherit; font-size: 12px; display: none;
  }
  .status-select.visible { display: inline-block; }

  /* ── Cards ── */
  .card {
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.2)); border-radius: 6px;
    padding: 14px 18px; margin: 12px 0;
    background: var(--vscode-sideBar-background, transparent);
  }
  .card-title { font-weight: 600; font-size: 13px; margin: 0 0 8px; }
  .card-meta { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 8px; }
  .label {
    font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .07em;
    color: var(--vscode-descriptionForeground); margin: 12px 0 4px;
  }
  .annotation-type {
    display: inline-block; padding: 1px 7px; border-radius: 9px; font-size: 11px;
    font-weight: 600; text-transform: uppercase; letter-spacing: .05em;
    background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
  }

  /* ── Lineage ── */
  .lineage-block {
    margin-top: 8px; padding: 10px 14px;
    border-left: 3px solid var(--vscode-focusBorder, #007acc);
    background: var(--vscode-textBlockQuote-background, rgba(128,128,128,.05));
    border-radius: 0 4px 4px 0;
  }
  .lineage-link {
    color: var(--vscode-textLink-foreground); cursor: pointer; font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px; text-decoration: none; border-bottom: 1px dashed currentColor;
  }
  .lineage-link:hover { text-decoration: none; opacity: .8; }

  /* ── Problem block ── */
  .problem-block {
    padding: 10px 14px;
    background: var(--vscode-textBlockQuote-background, rgba(128,128,128,.07));
    border-left: 3px solid var(--vscode-descriptionForeground);
    border-radius: 0 4px 4px 0; margin: 8px 0;
  }

  /* ── Path ── */
  .feature-path {
    margin-top: 24px; font-size: 11px; color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-editor-font-family, monospace); word-break: break-all;
  }
</style>
</head>
<body>

<header class="header">
  <div class="header-top">
    <span class="feature-key">${esc(feature.featureKey)}</span>

    <!-- Status badge — click to edit -->
    <span
      class="status-badge"
      id="status-badge"
      style="color:${STATUS_COLOR[feature.status] ?? 'inherit'}"
      title="Click to change status"
      onclick="toggleStatusEdit()"
    >${STATUS_ICON[feature.status] ?? '⊙'} ${esc(feature.status)}</span>

    <select id="status-select" class="status-select" onchange="saveStatus(this.value)">
      ${statusOptions}
    </select>

    ${feature.tags?.length ? `<div class="tags">${feature.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
  </div>

  <!-- Title — double-click to edit -->
  <h1
    class="feature-title"
    id="title-view"
    title="Double-click to edit"
    ondblclick="startEdit('title')"
  >${esc(feature.title)} <button class="btn-ghost" onclick="startEdit('title')" title="Edit title">✏</button></h1>
  <textarea id="title-area" class="edit-area" rows="1" style="min-height:unset;resize:none"
    onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();commitEdit('title')}"
  ></textarea>
  <div id="title-actions" class="edit-actions">
    <button class="btn" onclick="commitEdit('title')">Save</button>
    <button class="btn btn-secondary" onclick="cancelEdit('title')">Cancel</button>
  </div>

  <div class="header-actions">
    <button class="btn btn-secondary" onclick="vscode.postMessage({type:'exportMarkdown'})" title="Export as markdown">⤓ Export</button>
  </div>
</header>

<nav class="tab-bar">
${tabBtns}
</nav>

${tabPanels}

<script nonce="${n}">
(function() {
  const vscode = acquireVsCodeApi();

  // ── Markdown renderer ──────────────────────────────────────────────────────
  function renderMd(raw) {
    if (!raw) return '';
    const codeBlocks = [];
    let rest = raw.replace(/\`\`\`([\s\S]*?)\`\`\`/g, function(_, inner) {
      const idx = codeBlocks.length;
      codeBlocks.push('<pre><code>' + inner.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</code></pre>');
      return '\x00CODE' + idx + '\x00';
    });
    rest = rest.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const lines = rest.split('\n');
    let html = '', inList = false, listTag = '';
    function flushList() { if (inList) { html += '</' + listTag + '>'; inList = false; listTag = ''; } }
    function inline(s) {
      return s.replace(/\`([^\`]+)\`/g,'<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g,'<em>$1</em>')
        .replace(/_([^_]+)_/g,'<em>$1</em>');
    }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\x00CODE\d+\x00$/.test(line.trim())) { flushList(); html += line.trim(); continue; }
      const h3 = line.match(/^### (.+)/); if (h3) { flushList(); html += '<h3>' + inline(h3[1]) + '</h3>'; continue; }
      const h2 = line.match(/^## (.+)/); if (h2) { flushList(); html += '<h2>' + inline(h2[1]) + '</h2>'; continue; }
      const h1 = line.match(/^# (.+)/); if (h1) { flushList(); html += '<h1>' + inline(h1[1]) + '</h1>'; continue; }
      const ul = line.match(/^[-*] (.+)/);
      if (ul) { if (!inList || listTag!=='ul') { flushList(); html += '<ul>'; inList=true; listTag='ul'; } html += '<li>' + inline(ul[1]) + '</li>'; continue; }
      const ol = line.match(/^\d+\. (.+)/);
      if (ol) { if (!inList || listTag!=='ol') { flushList(); html += '<ol>'; inList=true; listTag='ol'; } html += '<li>' + inline(ol[1]) + '</li>'; continue; }
      flushList();
      if (line.trim() === '') { html += '<br>'; continue; }
      html += '<p>' + inline(line) + '</p>';
    }
    flushList();
    codeBlocks.forEach(function(block, idx) { html = html.replace('\x00CODE' + idx + '\x00', block); });
    return html;
  }

  // ── Tab switching ──────────────────────────────────────────────────────────
  const btns = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');
  btns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      const target = btn.getAttribute('data-tab');
      btns.forEach(function(b) { b.classList.remove('active'); });
      panels.forEach(function(p) { p.classList.remove('active'); });
      btn.classList.add('active');
      const panel = document.getElementById('panel-' + target);
      if (panel) panel.classList.add('active');
    });
  });

  // ── Status edit ───────────────────────────────────────────────────────────
  window.toggleStatusEdit = function() {
    const badge = document.getElementById('status-badge');
    const sel = document.getElementById('status-select');
    const editing = sel.classList.toggle('visible');
    badge.style.display = editing ? 'none' : '';
    if (editing) sel.focus();
  };

  window.saveStatus = function(value) {
    const sel = document.getElementById('status-select');
    sel.classList.remove('visible');
    document.getElementById('status-badge').style.display = '';
    vscode.postMessage({ type: 'editSave', field: 'status', value: value });
  };

  // ── Inline text edit ──────────────────────────────────────────────────────
  window.startEdit = function(field) {
    const view = document.getElementById(field + '-view');
    const area = document.getElementById(field + '-area');
    const actions = document.getElementById(field + '-actions');
    if (!area) return;
    if (view) view.classList.add('hidden');
    area.value = area.getAttribute('data-original') || '';
    area.classList.add('visible');
    actions.classList.add('visible');
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  };

  window.commitEdit = function(field) {
    const view = document.getElementById(field + '-view');
    const area = document.getElementById(field + '-area');
    const actions = document.getElementById(field + '-actions');
    if (!area) return;
    area.classList.remove('visible');
    actions.classList.remove('visible');
    if (view) view.classList.remove('hidden');
    vscode.postMessage({ type: 'editSave', field: field, value: area.value });
  };

  window.cancelEdit = function(field) {
    const view = document.getElementById(field + '-view');
    const area = document.getElementById(field + '-area');
    const actions = document.getElementById(field + '-actions');
    if (!area) return;
    area.classList.remove('visible');
    actions.classList.remove('visible');
    if (view) view.classList.remove('hidden');
  };

  // ── Lineage navigation ────────────────────────────────────────────────────
  window.openFeature = function(key) {
    vscode.postMessage({ type: 'openFeature', featureKey: key });
  };

  // ── Live update via postMessage ───────────────────────────────────────────
  window.addEventListener('message', function(event) {
    const msg = event.data;
    if (!msg || msg.type !== 'update' || !msg.feature) return;

    const activeBtn = document.querySelector('.tab-btn.active');
    const activeTab = activeBtn ? activeBtn.getAttribute('data-tab') : 'overview';
    const f = msg.feature;

    // Re-render markdown tabs
    const mdFields = { analysis: f.analysis || '', implementation: f.implementation || '' };
    for (const [tabId, content] of Object.entries(mdFields)) {
      const panel = document.getElementById('panel-' + tabId);
      if (panel) panel.innerHTML = '<div class="section-header"><h2>' + tabId.charAt(0).toUpperCase() + tabId.slice(1) + '<button class="btn-ghost" onclick="startEdit(\'' + tabId + '\')" title="Edit">✏</button></h2></div><div id="' + tabId + '-view" class="content-view"><div class="md-body">' + renderMd(content) + '</div></div><textarea id="' + tabId + '-area" class="edit-area" data-original="' + content.replace(/"/g, '&quot;') + '">' + content + '</textarea><div id="' + tabId + '-actions" class="edit-actions"><button class="btn" onclick="commitEdit(\'' + tabId + '\')">Save</button><button class="btn btn-secondary" onclick="cancelEdit(\'' + tabId + '\')">Cancel</button></div>';
    }

    // Update status badge
    const ICONS = {active:'⊙',draft:'◌',frozen:'❄',deprecated:'⊘'};
    const COLORS = {active:'var(--vscode-charts-green,#4ec9b0)',draft:'var(--vscode-charts-yellow,#dcdcaa)',frozen:'var(--vscode-charts-blue,#569cd6)',deprecated:'var(--vscode-charts-red,#f44747)'};
    const badge = document.getElementById('status-badge');
    if (badge) { badge.textContent = (ICONS[f.status] || '⊙') + ' ' + f.status; badge.style.color = COLORS[f.status] || 'inherit'; }

    // Update title
    const titleView = document.getElementById('title-view');
    if (titleView) titleView.childNodes[0].textContent = f.title + ' ';
    const titleArea = document.getElementById('title-area');
    if (titleArea) { titleArea.setAttribute('data-original', f.title); }

    // Restore tab
    btns.forEach(function(b) { b.classList.remove('active'); });
    panels.forEach(function(p) { p.classList.remove('active'); });
    const targetBtn = document.querySelector('[data-tab="' + activeTab + '"]');
    const targetPanel = document.getElementById('panel-' + activeTab);
    if (targetBtn && targetPanel) { targetBtn.classList.add('active'); targetPanel.classList.add('active'); }
    else {
      const ob = document.querySelector('[data-tab="overview"]');
      const op = document.getElementById('panel-overview');
      if (ob) ob.classList.add('active');
      if (op) op.classList.add('active');
    }
  });
})();
</script>
</body>
</html>`
}

// ── Tab body builders ─────────────────────────────────────────────────────────

function overviewTab(feature: Feature, featureJsonPath: string): string {
  const lineageHtml = feature.lineage ? buildLineageHtml(feature.lineage) : ''
  return `
<div class="section-header">
  <h2>Problem <button class="btn-ghost" onclick="startEdit('problem')" title="Edit">✏</button></h2>
</div>
<div id="problem-view" class="content-view">
  <div class="problem-block">${mdToHtml(feature.problem)}</div>
</div>
<textarea id="problem-area" class="edit-area" data-original="${esc(feature.problem)}"
  onkeydown="if(event.ctrlKey&&event.key==='Enter')commitEdit('problem')"
>${esc(feature.problem)}</textarea>
<div id="problem-actions" class="edit-actions">
  <button class="btn" onclick="commitEdit('problem')">Save</button>
  <button class="btn btn-secondary" onclick="cancelEdit('problem')">Cancel</button>
</div>

${lineageHtml}

<p class="feature-path">${esc(featureJsonPath)}</p>
`
}

function markdownTab(content: string, field: string): string {
  return `
<div class="section-header">
  <h2>${field.charAt(0).toUpperCase() + field.slice(1)} <button class="btn-ghost" onclick="startEdit('${field}')" title="Edit">✏</button></h2>
</div>
<div id="${field}-view" class="content-view">
  <div class="md-body">${mdToHtml(content)}</div>
</div>
<textarea id="${field}-area" class="edit-area" data-original="${esc(content)}"
  onkeydown="if(event.ctrlKey&&event.key==='Enter')commitEdit('${field}')"
>${esc(content)}</textarea>
<div id="${field}-actions" class="edit-actions">
  <button class="btn" onclick="commitEdit('${field}')">Save</button>
  <button class="btn btn-secondary" onclick="cancelEdit('${field}')">Cancel</button>
</div>`
}

function decisionsTab(decisions: NonNullable<Feature['decisions']>): string {
  return decisions.map((d, i) => `
<div class="card">
  <p class="card-title">${i + 1}. ${esc(d.decision)}</p>
  ${d.date ? `<p class="card-meta">${esc(d.date)}</p>` : ''}
  <p class="label">Rationale</p>
  <div>${mdToHtml(d.rationale)}</div>
  ${d.alternativesConsidered?.length ? `
  <p class="label">Alternatives considered</p>
  <ul>${d.alternativesConsidered.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
  ` : ''}
</div>`).join('')
}

function limitationsTab(items: string[]): string {
  return `
<div class="section-header">
  <h2>Known Limitations <button class="btn-ghost" onclick="startEdit('knownLimitations')" title="Edit (one per line)">✏</button></h2>
</div>
<div id="knownLimitations-view" class="content-view">
  <ul>${items.map((l) => `<li>${mdToHtml(l)}</li>`).join('')}</ul>
</div>
<textarea id="knownLimitations-area" class="edit-area" data-original="${esc(items.join('\n'))}"
  placeholder="One limitation per line..."
>${esc(items.join('\n'))}</textarea>
<div id="knownLimitations-actions" class="edit-actions">
  <button class="btn" onclick="commitEdit('knownLimitations')">Save</button>
  <button class="btn btn-secondary" onclick="cancelEdit('knownLimitations')">Cancel</button>
</div>`
}

function annotationsTab(annotations: NonNullable<Feature['annotations']>): string {
  return annotations.map((a) => `
<div class="card">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
    <span class="annotation-type">${esc(a.type)}</span>
    <span class="card-meta" style="margin:0">${esc(a.author)} · ${esc(a.date)}</span>
  </div>
  <div>${mdToHtml(a.body)}</div>
</div>`).join('')
}

function buildLineageHtml(lineage: NonNullable<Feature['lineage']>): string {
  if (!lineage.parent && !lineage.children?.length && !lineage.spawnReason) return ''
  const parentHtml = lineage.parent
    ? `<p><strong>Parent:</strong> <a class="lineage-link" onclick="openFeature('${esc(lineage.parent)}')" title="Open ${esc(lineage.parent)}">${esc(lineage.parent)} ↗</a></p>`
    : ''
  const spawnHtml = lineage.spawnReason
    ? `<p><strong>Spawn reason:</strong> ${esc(lineage.spawnReason)}</p>`
    : ''
  const childrenHtml = lineage.children?.length
    ? `<p><strong>Children:</strong> ${lineage.children.map((c) => `<a class="lineage-link" onclick="openFeature('${esc(c)}')" title="Open ${esc(c)}">${esc(c)} ↗</a>`).join(', ')}</p>`
    : ''
  return `
<h2>Lineage</h2>
<div class="lineage-block">
  ${parentHtml}
  ${spawnHtml}
  ${childrenHtml}
</div>`
}

// ── Server-side markdown → HTML ───────────────────────────────────────────────

function mdToHtml(raw: string): string {
  if (!raw) return ''

  const codeBlocks: string[] = []
  let s = raw.replace(/```[\s\S]*?```/g, (m) => {
    const inner = m.slice(3, -3)
    const idx = codeBlocks.length
    codeBlocks.push(`<pre><code>${esc(inner)}</code></pre>`)
    return `\x00CODE${idx}\x00`
  })

  s = esc(s)

  const lines = s.split('\n')
  let html = ''
  let inUl = false
  let inOl = false

  const flush = () => {
    if (inUl) { html += '</ul>'; inUl = false }
    if (inOl) { html += '</ol>'; inOl = false }
  }
  const inline = (t: string) =>
    t.replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/_([^_]+)_/g, '<em>$1</em>')

  for (const line of lines) {
    if (/^\x00CODE\d+\x00$/.test(line.trim())) { flush(); html += line.trim(); continue }
    const h3 = line.match(/^### (.+)/); if (h3) { flush(); html += `<h3>${inline(h3[1])}</h3>`; continue }
    const h2 = line.match(/^## (.+)/); if (h2) { flush(); html += `<h2>${inline(h2[1])}</h2>`; continue }
    const h1 = line.match(/^# (.+)/); if (h1) { flush(); html += `<h1>${inline(h1[1])}</h1>`; continue }
    const ul = line.match(/^[-*] (.+)/)
    if (ul) { if (!inUl) { flush(); html += '<ul>'; inUl = true } html += `<li>${inline(ul[1])}</li>`; continue }
    const ol = line.match(/^(\d+)\. (.+)/)
    if (ol) { if (!inOl) { flush(); html += '<ol>'; inOl = true } html += `<li>${inline(ol[2])}</li>`; continue }
    flush()
    if (!line.trim()) { html += '<br>'; continue }
    html += `<p>${inline(line)}</p>`
  }
  flush()

  for (let i = 0; i < codeBlocks.length; i++) {
    html = html.replace(`\x00CODE${i}\x00`, codeBlocks[i])
  }
  return html
}

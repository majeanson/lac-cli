/**
 * Raw HTML generator — same shell/navigation as the wiki, but renders every
 * feature.json field verbatim (pre blocks, key-value rows, tables) instead of
 * interpreting markdown or hiding structural data.
 */

import type { ScannedFeature } from './scanner.js'

type Feature = ScannedFeature['feature']

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function generateRawHtml(features: Feature[], projectName: string, viewLabel?: string, viewName?: string): string {
  const dataJson = JSON.stringify(features).replace(/<\/script>/gi, '<\\/script>')

  const domains = [...new Set(features.map(f => f.domain).filter(Boolean) as string[])].sort()

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)}${viewLabel ? ` · ${esc(viewLabel)}` : ''} — LAC Raw</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:          #12100e;
  --bg-sidebar:  #0e0c0a;
  --bg-card:     #1a1714;
  --bg-hover:    #201d1a;
  --bg-active:   #251f18;
  --border:      #2a2420;
  --border-soft: #221e1b;
  --text:        #e8ddd4;
  --text-mid:    #b0a49c;
  --text-soft:   #7a6a5a;
  --accent:      #c4a255;
  --accent-warm: #e8b865;
  --mono:        'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
  --sans:        -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;

  --status-active:     #4aad72;
  --status-draft:      #c4a255;
  --status-frozen:     #5b82cc;
  --status-deprecated: #cc5b5b;

  --status-active-bg:     rgba(74,173,114,0.12);
  --status-draft-bg:      rgba(196,162,85,0.12);
  --status-frozen-bg:     rgba(91,130,204,0.12);
  --status-deprecated-bg: rgba(204,91,91,0.12);
}

html, body { height: 100%; }
body { background: var(--bg); color: var(--text); font-family: var(--sans); font-size: 14px; line-height: 1.6; display: flex; flex-direction: column; }

/* ── Shell ──────────────────────────────────────────────── */

.shell { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

.topbar {
  flex-shrink: 0;
  height: 44px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 18px;
  background: var(--bg-sidebar);
  border-bottom: 1px solid var(--border);
}
.topbar-logo { font-family: var(--mono); font-size: 13px; color: var(--accent); letter-spacing: 0.05em; }
.topbar-sep  { color: var(--border); }
.topbar-project { font-family: var(--mono); font-size: 12px; color: var(--text-mid); }
.topbar-badge {
  font-family: var(--mono);
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--accent);
  letter-spacing: 0.04em;
}
.topbar-count { margin-left: auto; font-family: var(--mono); font-size: 11px; color: var(--text-soft); }

.body-row { display: flex; flex: 1; min-height: 0; }

/* ── Sidebar ────────────────────────────────────────────── */

.sidebar {
  width: 264px;
  flex-shrink: 0;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-search {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.sidebar-search input {
  width: 100%;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px 10px;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text);
  outline: none;
}
.sidebar-search input:focus { border-color: var(--accent); }
.sidebar-search input::placeholder { color: var(--text-soft); }

.nav-tree {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0 24px;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.nav-tree::-webkit-scrollbar { width: 4px; }
.nav-tree::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

.nav-group { margin-bottom: 2px; }

.nav-domain {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px 4px;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-soft);
  cursor: pointer;
  user-select: none;
}
.nav-domain:hover { color: var(--text-mid); }
.nav-domain-arrow { transition: transform 0.15s; font-size: 8px; }
.nav-domain.collapsed .nav-domain-arrow { transform: rotate(-90deg); }
.nav-domain-count { margin-left: auto; font-size: 10px; opacity: 0.6; }

.nav-group-items { overflow: hidden; }
.nav-group.collapsed .nav-group-items { display: none; }

.nav-item {
  display: flex;
  align-items: baseline;
  gap: 7px;
  padding: 5px 14px 5px 18px;
  cursor: pointer;
  user-select: none;
  border-left: 2px solid transparent;
  transition: background 0.1s;
  text-decoration: none;
}
.nav-item:hover { background: var(--bg-hover); }
.nav-item.active {
  background: var(--bg-active);
  border-left-color: var(--accent);
}
.nav-item[data-depth="1"] { padding-left: 30px; }
.nav-item[data-depth="2"] { padding-left: 42px; }
.nav-item[data-depth="3"] { padding-left: 54px; }

.nav-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 1px;
}
.nav-item[data-status="active"]     .nav-dot { background: var(--status-active); }
.nav-item[data-status="draft"]      .nav-dot { background: var(--status-draft); }
.nav-item[data-status="frozen"]     .nav-dot { background: var(--status-frozen); }
.nav-item[data-status="deprecated"] .nav-dot { background: var(--status-deprecated); opacity: 0.5; }

.nav-item-key {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--text-soft);
  flex-shrink: 0;
}
.nav-item-title {
  font-size: 12px;
  color: var(--text-mid);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}
.nav-item:hover .nav-item-title,
.nav-item.active .nav-item-title { color: var(--text); }
.nav-item.active .nav-item-key { color: var(--accent); }

.nav-child-arrow {
  font-size: 9px;
  color: var(--text-soft);
  flex-shrink: 0;
  opacity: 0.5;
}

/* ── Content ────────────────────────────────────────────── */

.content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.content::-webkit-scrollbar { width: 6px; }
.content::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

/* Home page */
.home-page {
  max-width: 680px;
  margin: 0 auto;
  padding: 56px 40px 80px;
}
.home-eyebrow {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 16px;
}
.home-title {
  font-size: 32px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 8px;
  line-height: 1.2;
}
.home-subtitle {
  font-size: 14px;
  color: var(--text-mid);
  margin-bottom: 40px;
}
.stat-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 40px;
}
.stat-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-family: var(--mono);
  font-size: 12px;
}
.stat-pill-dot { width: 8px; height: 8px; border-radius: 50%; }
.stat-pill-num { font-size: 18px; font-weight: 700; color: var(--text); }
.stat-pill-label { color: var(--text-soft); }

.home-section-title {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-soft);
  margin-bottom: 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}

.domain-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 40px;
}
.domain-chip {
  padding: 4px 10px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 100px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-mid);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.domain-chip:hover { border-color: var(--accent); color: var(--accent); }

/* Feature page (raw) */
.feature-page {
  max-width: 820px;
  margin: 0 auto;
  padding: 48px 40px 80px;
}

.feature-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.feature-key-label {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-soft);
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 4px;
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 500;
}
.badge-dot { width: 6px; height: 6px; border-radius: 50%; }
.badge-active     { color: var(--status-active);     background: var(--status-active-bg);     border: 1px solid rgba(74,173,114,0.25); }
.badge-draft      { color: var(--status-draft);      background: var(--status-draft-bg);      border: 1px solid rgba(196,162,85,0.25); }
.badge-frozen     { color: var(--status-frozen);     background: var(--status-frozen-bg);     border: 1px solid rgba(91,130,204,0.25); }
.badge-deprecated { color: var(--status-deprecated); background: var(--status-deprecated-bg); border: 1px solid rgba(204,91,91,0.25); }
.badge-domain { color: var(--text-mid); background: var(--bg-card); border: 1px solid var(--border); }

.feature-title {
  font-size: 26px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.25;
  margin-bottom: 32px;
}

/* Raw field sections */
.raw-section { margin-bottom: 28px; }

.raw-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
.raw-field-name {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-soft);
}
.raw-field-type {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--border);
}

/* Pre block for string values */
.raw-pre {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 12px 16px;
  font-family: var(--mono);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-mid);
  line-height: 1.7;
}

/* Key-value row */
.raw-kv-list { display: flex; flex-direction: column; gap: 1px; }
.raw-kv {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 12px;
  align-items: baseline;
  padding: 7px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 3px;
  font-size: 12px;
}
.raw-kv-key {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-soft);
  flex-shrink: 0;
}
.raw-kv-val { color: var(--text-mid); }
.raw-kv-val code {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--accent);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 1px 5px;
}

/* Decision cards (raw) */
.raw-decision {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: 4px;
  padding: 12px 14px;
  margin-bottom: 8px;
}
.raw-decision-idx {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--text-soft);
  margin-bottom: 8px;
}

/* Annotation cards */
.raw-annotation {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-left: 3px solid var(--status-draft);
  border-radius: 4px;
  padding: 12px 14px;
  margin-bottom: 8px;
}

/* Tags */
.raw-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.raw-tag {
  padding: 3px 9px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 100px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-soft);
}

/* List items */
.raw-list { display: flex; flex-direction: column; gap: 4px; }
.raw-list-item {
  display: flex;
  gap: 10px;
  padding: 7px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 3px;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text-mid);
}
.raw-list-bullet { color: var(--text-soft); flex-shrink: 0; }

/* Tables */
.raw-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--mono);
  font-size: 12px;
}
.raw-table th, .raw-table td {
  border: 1px solid var(--border);
  padding: 6px 10px;
  text-align: left;
  color: var(--text-mid);
}
.raw-table th {
  background: var(--bg-card);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-soft);
  font-weight: 600;
}
.raw-table td code {
  color: var(--accent);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 1px 4px;
  font-size: 11px;
}

/* Snippet */
.raw-snippet { margin-bottom: 12px; }
.raw-snippet-label {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-soft);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 4px 4px 0 0;
  padding: 4px 12px;
}
.raw-snippet-code {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 0 0 4px 4px;
  padding: 12px 16px;
  font-family: var(--mono);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-mid);
  margin: 0;
}

/* Lineage links */
.lineage-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.lineage-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-mid);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
  text-decoration: none;
}
.lineage-link:hover { border-color: var(--accent); color: var(--accent); }
.lineage-arrow { color: var(--text-soft); font-size: 10px; }

/* No results */
.no-results {
  padding: 24px 18px;
  font-size: 12px;
  color: var(--text-soft);
  text-align: center;
  font-family: var(--mono);
}
</style>
</head>
<body>
<div class="shell">
  <div class="topbar">
    <span class="topbar-logo">◈ lac</span>
    <span class="topbar-sep">|</span>
    <span class="topbar-project">${esc(projectName)}${viewLabel ? ` <span style="opacity:.55;font-weight:400">· ${esc(viewLabel)} view</span>` : ''}</span>
    <span class="topbar-badge">raw</span>
    <span class="topbar-count">${features.length} features · ${domains.length} domains</span>
  </div>
  <div class="body-row">
    <aside class="sidebar">
      <div class="sidebar-search">
        <input type="text" id="filter-input" placeholder="Filter features…" autocomplete="off" spellcheck="false">
      </div>
      <nav class="nav-tree" id="nav-tree"></nav>
    </aside>
    <main class="content" id="content"></main>
  </div>
</div>

<script>
const FEATURES = ${dataJson};

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusColor(s) {
  return { active: '#4aad72', draft: '#c4a255', frozen: '#5b82cc', deprecated: '#cc5b5b' }[s] || '#c4a255';
}

// ── Tree building ────────────────────────────────────────────────────────────

const VIEW = '${viewName || ''}';
const byKey = new Map(FEATURES.map(f => [f.featureKey, f]));

function getChildren(key) {
  return FEATURES.filter(f => f.lineage && f.lineage.parent === key);
}

function isRoot(f) {
  const p = f.lineage && f.lineage.parent;
  return !p || !byKey.has(p);
}

function flatten(f, depth) {
  const result = [{ feature: f, depth }];
  for (const child of getChildren(f.featureKey)) {
    result.push(...flatten(child, depth + 1));
  }
  return result;
}

function buildGroups(features) {
  const roots = features.filter(isRoot);
  const groups = new Map();
  for (const f of roots) {
    const domain = f.domain || '(no domain)';
    if (!groups.has(domain)) groups.set(domain, []);
    groups.get(domain).push(...flatten(f, 0));
  }
  return groups;
}

// ── Nav rendering ────────────────────────────────────────────────────────────

let activeKey = null;
const collapsedDomains = new Set();

function renderNav(filterText) {
  const nav = document.getElementById('nav-tree');
  const q = (filterText || '').toLowerCase().trim();

  const features = q
    ? FEATURES.filter(f =>
        f.featureKey.toLowerCase().includes(q) ||
        f.title.toLowerCase().includes(q) ||
        (f.domain && f.domain.toLowerCase().includes(q)) ||
        (f.tags && f.tags.some(t => t.toLowerCase().includes(q)))
      )
    : FEATURES;

  if (features.length === 0) {
    nav.innerHTML = '<div class="no-results">No features match</div>';
    return;
  }

  const groups = q
    ? new Map([['results', features.map(f => ({ feature: f, depth: 0 }))]])
    : buildGroups(FEATURES);

  const sortedDomains = [...groups.keys()].sort((a, b) => {
    if (a === '(no domain)') return 1;
    if (b === '(no domain)') return -1;
    return a.localeCompare(b);
  });

  let html = '';
  for (const domain of sortedDomains) {
    const items = groups.get(domain);
    const visible = q ? items.filter(({ feature: f }) =>
      f.featureKey.toLowerCase().includes(q) ||
      f.title.toLowerCase().includes(q) ||
      (f.tags && f.tags.some(t => t.toLowerCase().includes(q)))
    ) : items;
    if (visible.length === 0) continue;

    const isCollapsed = !q && collapsedDomains.has(domain);
    const label = domain === 'results' ? 'results' : domain;

    html += \`<div class="nav-group\${isCollapsed ? ' collapsed' : ''}" data-domain="\${esc(domain)}">
  <div class="nav-domain\${isCollapsed ? ' collapsed' : ''}" onclick="toggleDomain(this)">
    <span class="nav-domain-arrow">▾</span>
    <span>\${esc(label)}</span>
    <span class="nav-domain-count">\${visible.length}</span>
  </div>
  <div class="nav-group-items">\`;

    for (const { feature: f, depth } of visible) {
      const isChild = depth > 0;
      const hasChildren = getChildren(f.featureKey).length > 0;
      html += \`<div class="nav-item\${f.featureKey === activeKey ? ' active' : ''}"
        data-key="\${esc(f.featureKey)}"
        data-status="\${esc(f.status)}"
        data-depth="\${depth}"
        onclick="navigate('\${esc(f.featureKey)}')">
        \${isChild ? '<span class="nav-child-arrow">↳</span>' : '<span class="nav-dot"></span>'}
        \${VIEW !== 'user' ? '<span class="nav-item-key">' + esc(f.featureKey) + '</span>' : ''}
        <span class="nav-item-title">\${esc(f.title)}</span>
        \${hasChildren ? '<span class="nav-child-arrow" style="margin-left:auto;opacity:0.4">⊕</span>' : ''}
      </div>\`;
    }

    html += '</div></div>';
  }

  nav.innerHTML = html;
}

function toggleDomain(el) {
  const group = el.closest('.nav-group');
  const domain = group.dataset.domain;
  if (collapsedDomains.has(domain)) {
    collapsedDomains.delete(domain);
    group.classList.remove('collapsed');
    el.classList.remove('collapsed');
  } else {
    collapsedDomains.add(domain);
    group.classList.add('collapsed');
    el.classList.add('collapsed');
  }
}

// ── Raw rendering helpers ────────────────────────────────────────────────────

function rawSection(fieldName, typeHint, body) {
  return \`<div class="raw-section">
  <div class="raw-section-header">
    <span class="raw-field-name">\${esc(fieldName)}</span>
    \${typeHint ? '<span class="raw-field-type">' + esc(typeHint) + '</span>' : ''}
  </div>
  \${body}
</div>\`;
}

function rawString(value) {
  return \`<pre class="raw-pre">\${esc(value)}</pre>\`;
}

function rawKvList(pairs) {
  return '<div class="raw-kv-list">' +
    pairs.map(([k, v]) => \`<div class="raw-kv">
    <span class="raw-kv-key">\${esc(k)}</span>
    <span class="raw-kv-val">\${v}</span>
  </div>\`).join('') +
    '</div>';
}

function rawList(items) {
  return '<div class="raw-list">' +
    items.map(i => \`<div class="raw-list-item">
    <span class="raw-list-bullet">—</span>
    <span>\${esc(i)}</span>
  </div>\`).join('') +
    '</div>';
}

function rawCodeList(items) {
  return '<div class="raw-list">' +
    items.map(i => \`<div class="raw-list-item">
    <span class="raw-list-bullet">—</span>
    <code style="font-family:var(--mono);font-size:11px;color:var(--accent)">\${esc(i)}</code>
  </div>\`).join('') +
    '</div>';
}

// ── Content rendering ────────────────────────────────────────────────────────

function renderHome() {
  const content = document.getElementById('content');
  const total = FEATURES.length;
  const frozen = FEATURES.filter(f => f.status === 'frozen').length;
  const active = FEATURES.filter(f => f.status === 'active').length;
  const draft  = FEATURES.filter(f => f.status === 'draft').length;
  const depr   = FEATURES.filter(f => f.status === 'deprecated').length;
  const domains = [...new Set(FEATURES.map(f => f.domain).filter(Boolean))].sort();

  content.innerHTML = \`<div class="home-page">
  <div class="home-eyebrow">◈ life-as-code · raw view</div>
  <div class="home-title">\${esc(document.title.replace(' — LAC Raw', '').replace(/ · [^·]+ view$/, '').trim())}</div>
  <div class="home-subtitle">\${total} feature\${total === 1 ? '' : 's'} — all fields shown verbatim</div>

  <div class="stat-row">
    \${active ? \`<div class="stat-pill"><span class="stat-pill-dot" style="background:#4aad72"></span><span class="stat-pill-num">\${active}</span><span class="stat-pill-label">active</span></div>\` : ''}
    \${frozen ? \`<div class="stat-pill"><span class="stat-pill-dot" style="background:#5b82cc"></span><span class="stat-pill-num">\${frozen}</span><span class="stat-pill-label">frozen</span></div>\` : ''}
    \${draft  ? \`<div class="stat-pill"><span class="stat-pill-dot" style="background:#c4a255"></span><span class="stat-pill-num">\${draft}</span><span class="stat-pill-label">draft</span></div>\` : ''}
    \${depr   ? \`<div class="stat-pill"><span class="stat-pill-dot" style="background:#cc5b5b"></span><span class="stat-pill-num">\${depr}</span><span class="stat-pill-label">deprecated</span></div>\` : ''}
  </div>

  \${domains.length ? \`<div class="home-section-title">Domains</div>
  <div class="domain-chips">
    \${domains.map(d => \`<span class="domain-chip" onclick="filterByDomain('\${esc(d)}')">\${esc(d)}</span>\`).join('')}
  </div>\` : ''}

  <div class="home-section-title">All features</div>
  <div style="display:flex;flex-direction:column;gap:2px;">
    \${FEATURES.map(f => \`<div class="nav-item" data-key="\${esc(f.featureKey)}" data-status="\${esc(f.status)}" data-depth="0" onclick="navigate('\${esc(f.featureKey)}')" style="border-radius:4px;border:1px solid var(--border-soft);margin-bottom:2px;">
      <span class="nav-dot"></span>
      <span class="nav-item-key">\${esc(f.featureKey)}</span>
      <span class="nav-item-title">\${esc(f.title)}</span>
    </div>\`).join('')}
  </div>
</div>\`;
}

function renderFeature(key) {
  const f = byKey.get(key);
  if (!f) { renderHome(); return; }

  const children = getChildren(f.featureKey);
  const parent = f.lineage && f.lineage.parent && byKey.get(f.lineage.parent);

  let html = \`<div class="feature-page">
  <div class="feature-meta">
    <span class="feature-key-label">\${esc(f.featureKey)}</span>
    <span class="badge badge-\${esc(f.status)}"><span class="badge-dot" style="background:\${statusColor(f.status)}"></span>\${esc(f.status)}</span>
    \${f.domain ? \`<span class="badge badge-domain">\${esc(f.domain)}</span>\` : ''}
  </div>
  <div class="feature-title">\${esc(f.title)}</div>\`;

  // ── String fields ──────────────────────────────────────────────────────────
  if (f.problem)         html += rawSection('problem',         'string', rawString(f.problem));
  if (f.successCriteria) html += rawSection('successCriteria', 'string', rawString(f.successCriteria));
  if (f.analysis)        html += rawSection('analysis',        'string', rawString(f.analysis));
  if (f.implementation)  html += rawSection('implementation',  'string', rawString(f.implementation));
  if (f.userGuide)       html += rawSection('userGuide',       'string', rawString(f.userGuide));

  // ── Tags ──────────────────────────────────────────────────────────────────
  if (f.tags && f.tags.length) {
    html += rawSection('tags', \`string[\${f.tags.length}]\`,
      '<div class="raw-tags">' + f.tags.map(t => \`<span class="raw-tag">\${esc(t)}</span>\`).join('') + '</div>'
    );
  }

  // ── Decisions ─────────────────────────────────────────────────────────────
  if (f.decisions && f.decisions.length) {
    const cards = f.decisions.map((d, i) => \`<div class="raw-decision">
      <div class="raw-decision-idx">[\${i + 1} / \${f.decisions.length}]</div>
      \${rawKvList([
        ['decision',  esc(d.decision)],
        ['rationale', esc(d.rationale)],
        ...(d.date ? [['date', '<code>' + esc(d.date) + '</code>']] : []),
        ...(d.alternativesConsidered && d.alternativesConsidered.length
          ? [['alternativesConsidered', d.alternativesConsidered.map(a => '<code>' + esc(a) + '</code>').join(', ')]]
          : []),
      ])}
    </div>\`).join('');
    html += rawSection('decisions', \`object[\${f.decisions.length}]\`, cards);
  }

  // ── Known Limitations ─────────────────────────────────────────────────────
  if (f.knownLimitations && f.knownLimitations.length) {
    html += rawSection('knownLimitations', \`string[\${f.knownLimitations.length}]\`, rawList(f.knownLimitations));
  }

  // ── Lineage ───────────────────────────────────────────────────────────────
  if (parent || children.length) {
    let lineage = '<div class="lineage-row">';
    if (parent) {
      lineage += \`<span class="lineage-arrow">parent ↑</span>
        <a class="lineage-link" onclick="navigate('\${esc(parent.featureKey)}')">
          \${esc(parent.featureKey)} — \${esc(parent.title)}
        </a>\`;
    }
    if (parent && children.length) lineage += '<span class="lineage-arrow" style="margin:0 6px;">·</span>';
    if (children.length) {
      lineage += '<span class="lineage-arrow">children ↓</span>';
      for (const c of children) {
        lineage += \`<a class="lineage-link" onclick="navigate('\${esc(c.featureKey)}')">
          \${esc(c.featureKey)} — \${esc(c.title)}
        </a>\`;
      }
    }
    lineage += '</div>';

    const linData = f.lineage || {};
    const kvPairs = [];
    if (linData.parent) kvPairs.push(['parent', '<code>' + esc(linData.parent) + '</code>']);
    if (linData.children && linData.children.length) kvPairs.push(['children', linData.children.map(c => '<code>' + esc(c) + '</code>').join(', ')]);
    if (linData.spawnReason) kvPairs.push(['spawnReason', esc(linData.spawnReason)]);

    html += rawSection('lineage', 'object',
      kvPairs.length ? rawKvList(kvPairs) + '<div style="margin-top:10px;">' + lineage + '</div>' : lineage
    );
  }

  // ── Supersession ──────────────────────────────────────────────────────────
  const superPairs = [];
  if (f.superseded_by)   superPairs.push(['superseded_by',   '<code>' + esc(f.superseded_by) + '</code>']);
  if (f.superseded_from) superPairs.push(['superseded_from', f.superseded_from.map(k => '<code>' + esc(k) + '</code>').join(', ')]);
  if (f.merged_into)     superPairs.push(['merged_into',     '<code>' + esc(f.merged_into) + '</code>']);
  if (f.merged_from)     superPairs.push(['merged_from',     f.merged_from.map(k => '<code>' + esc(k) + '</code>').join(', ')]);
  if (superPairs.length) html += rawSection('supersession', 'object', rawKvList(superPairs));

  // ── Reconstruction fields ─────────────────────────────────────────────────
  if (f.componentFile) {
    html += rawSection('componentFile', 'string',
      '<div class="raw-list-item"><span class="raw-list-bullet">—</span><code style="font-family:var(--mono);font-size:11px;color:var(--accent)">' + esc(f.componentFile) + '</code></div>'
    );
  }
  if (f.npmPackages && f.npmPackages.length) {
    html += rawSection('npmPackages', \`string[\${f.npmPackages.length}]\`, rawCodeList(f.npmPackages));
  }
  if (f.externalDependencies && f.externalDependencies.length) {
    html += rawSection('externalDependencies', \`string[\${f.externalDependencies.length}]\`, rawCodeList(f.externalDependencies));
  }
  if (f.lastVerifiedDate) {
    html += rawSection('lastVerifiedDate', 'string',
      '<div class="raw-list-item"><span class="raw-list-bullet">—</span><code style="font-family:var(--mono);font-size:11px;color:var(--accent)">' + esc(f.lastVerifiedDate) + '</code></div>'
    );
  }

  // publicInterface
  if (f.publicInterface && f.publicInterface.length) {
    const rows = f.publicInterface.map(p =>
      \`<tr><td><code>\${esc(p.name)}</code></td><td><code>\${esc(p.type)}</code></td><td>\${p.description ? esc(p.description) : '—'}</td></tr>\`
    ).join('');
    html += rawSection('publicInterface', \`object[\${f.publicInterface.length}]\`,
      '<table class="raw-table"><thead><tr><th>name</th><th>type</th><th>description</th></tr></thead><tbody>' + rows + '</tbody></table>'
    );
  }

  // codeSnippets
  if (f.codeSnippets && f.codeSnippets.length) {
    const snippets = f.codeSnippets.map(s =>
      \`<div class="raw-snippet">
        <div class="raw-snippet-label">\${esc(s.label)}</div>
        <pre class="raw-snippet-code">\${esc(s.snippet)}</pre>
      </div>\`
    ).join('');
    html += rawSection('codeSnippets', \`object[\${f.codeSnippets.length}]\`, snippets);
  }

  // statusHistory
  if (f.statusHistory && f.statusHistory.length) {
    const rows = f.statusHistory.map(h =>
      \`<tr><td><code>\${esc(h.from)}</code></td><td><code>\${esc(h.to)}</code></td><td><code>\${esc(h.date)}</code></td><td>\${h.reason ? esc(h.reason) : '—'}</td></tr>\`
    ).join('');
    html += rawSection('statusHistory', \`object[\${f.statusHistory.length}]\`,
      '<table class="raw-table"><thead><tr><th>from</th><th>to</th><th>date</th><th>reason</th></tr></thead><tbody>' + rows + '</tbody></table>'
    );
  }

  // annotations
  if (f.annotations && f.annotations.length) {
    const cards = f.annotations.map((a, i) => \`<div class="raw-annotation">
      <div class="raw-decision-idx">[\${i + 1} / \${f.annotations.length}]</div>
      \${rawKvList([
        ['type',   '<code>' + esc(a.type) + '</code>'],
        ['body',   esc(a.body)],
        ['author', '<code>' + esc(a.author) + '</code>'],
        ['date',   '<code>' + esc(a.date) + '</code>'],
      ])}
    </div>\`).join('');
    html += rawSection('annotations', \`object[\${f.annotations.length}]\`, cards);
  }

  html += '</div>';
  document.getElementById('content').innerHTML = html;
  document.getElementById('content').scrollTop = 0;
}

// ── Navigation ───────────────────────────────────────────────────────────────

function navigate(key) {
  activeKey = key;
  location.hash = key ? '#' + key : '';
  renderNav(document.getElementById('filter-input').value);
  if (key) {
    renderFeature(key);
    const el = document.querySelector(\`.nav-item[data-key="\${key}"]\`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  } else {
    renderHome();
  }
}

function filterByDomain(domain) {
  const input = document.getElementById('filter-input');
  input.value = domain;
  renderNav(domain);
}

document.getElementById('filter-input').addEventListener('input', e => {
  renderNav(e.target.value);
});

// ── Boot ─────────────────────────────────────────────────────────────────────

const hashKey = location.hash.slice(1);
if (hashKey && byKey.has(hashKey)) {
  activeKey = hashKey;
  renderNav('');
  renderFeature(hashKey);
  setTimeout(() => {
    const el = document.querySelector(\`.nav-item[data-key="\${hashKey}"]\`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, 0);
} else {
  renderNav('');
  renderHome();
}

window.navigate = navigate;
window.toggleDomain = toggleDomain;
window.filterByDomain = filterByDomain;
</script>
</body>
</html>`
}

import type { ScannedFeature } from './scanner.js'

type Feature = ScannedFeature['feature']

// ── Helpers ────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Tiny inline markdown renderer: bold, inline code, bullet lists, paragraphs */
function md(text: string): string {
  const lines = esc(text).split('\n')
  const result: string[] = []
  let inList = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.match(/^[-*] /)) {
      if (!inList) { result.push('<ul>'); inList = true }
      result.push(`<li>${renderInline(trimmed.slice(2))}</li>`)
    } else {
      if (inList) { result.push('</ul>'); inList = false }
      result.push(line)
    }
  }
  if (inList) result.push('</ul>')

  // Split on blank lines → paragraphs
  const blocks = result.join('\n').split(/\n{2,}/)
  return blocks.map(block => {
    const t = block.trim()
    if (!t) return ''
    if (t.startsWith('<ul>') || t.startsWith('<li>')) return t
    return `<p>${renderInline(t.replace(/\n/g, '<br>'))}</p>`
  }).filter(Boolean).join('\n')
}

function renderInline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
}

function completeness(f: Feature): number {
  const checks = [
    !!f.analysis,
    !!f.implementation,
    !!(f.decisions && f.decisions.length > 0),
    !!f.successCriteria,
    !!(f.knownLimitations && f.knownLimitations.length > 0),
    !!(f.tags && f.tags.length > 0),
    !!f.domain,
  ]
  return Math.round(checks.filter(Boolean).length / checks.length * 100)
}

// ── Main generator ─────────────────────────────────────────────────────────────

export function generateHtmlWiki(features: Feature[], projectName: string, viewLabel?: string, viewName?: string): string {
  // Safe JSON embedding — prevent </script> injection
  const dataJson = JSON.stringify(features).replace(/<\/script>/gi, '<\\/script>')

  const statusCounts = {
    active:     features.filter(f => f.status === 'active').length,
    frozen:     features.filter(f => f.status === 'frozen').length,
    draft:      features.filter(f => f.status === 'draft').length,
    deprecated: features.filter(f => f.status === 'deprecated').length,
  }

  const domains = [...new Set(features.map(f => f.domain).filter(Boolean) as string[])].sort()

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)}${viewLabel ? ` · ${esc(viewLabel)}` : ''} — LAC Wiki</title>
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

.sidebar-sort {
  display: flex;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.sort-btn {
  flex: 1;
  padding: 4px 6px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 3px;
  font-family: var(--mono);
  font-size: 10px;
  color: var(--text-soft);
  cursor: pointer;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.sort-btn:hover { color: var(--text-mid); border-color: var(--text-soft); }
.sort-btn.active { background: var(--bg-card); color: var(--accent); border-color: var(--accent); }

.nav-tree {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0 24px;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.nav-tree::-webkit-scrollbar { width: 4px; }
.nav-tree::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

/* Domain group */
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

/* Feature item */
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

/* Home / welcome */
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

/* Feature page */
.feature-page {
  max-width: 760px;
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
.feature-key {
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

.badge-domain {
  color: var(--text-mid);
  background: var(--bg-card);
  border: 1px solid var(--border);
}

.feature-title {
  font-size: 26px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.25;
  margin-bottom: 6px;
}
.feature-completeness {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-soft);
  margin-bottom: 32px;
}
.completeness-bar {
  display: inline-block;
  width: 80px;
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  vertical-align: middle;
  margin-right: 6px;
  position: relative;
  top: -1px;
  overflow: hidden;
}
.completeness-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--accent);
}

/* Sections */
.section { margin-bottom: 36px; }

.section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.section-label {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-soft);
}
.section-count {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--border);
}

.section-body p { color: var(--text-mid); line-height: 1.75; margin-bottom: 10px; }
.section-body p:last-child { margin-bottom: 0; }
.section-body strong { color: var(--text); }
.section-body code {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--accent);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 1px 5px;
}
.section-body ul { padding-left: 20px; color: var(--text-mid); }
.section-body li { margin-bottom: 4px; line-height: 1.6; }

/* Decision cards */
.decisions-list { display: flex; flex-direction: column; gap: 12px; }

.decision-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: 4px;
  padding: 14px 16px;
}
.decision-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 6px;
  line-height: 1.4;
}
.decision-rationale {
  font-size: 13px;
  color: var(--text-mid);
  line-height: 1.65;
  margin-bottom: 8px;
}
.decision-meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.decision-date {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--text-soft);
}
.decision-alts {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--text-soft);
}

/* Limitations list */
.limitations-list { display: flex; flex-direction: column; gap: 6px; }
.limitation-item {
  display: flex;
  gap: 10px;
  padding: 8px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 13px;
  color: var(--text-mid);
  line-height: 1.55;
}
.limitation-bullet { color: var(--text-soft); flex-shrink: 0; margin-top: 1px; }

/* Tags row */
.tags-row { display: flex; flex-wrap: wrap; gap: 6px; }
.tag {
  padding: 3px 9px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 100px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-soft);
}

/* Lineage */
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

/* Empty states */
.empty { color: var(--text-soft); font-size: 13px; font-style: italic; }

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
    <span class="topbar-count">${features.length} features · ${domains.length} domains</span>
  </div>
  <div class="body-row">
    <aside class="sidebar">
      <div class="sidebar-search">
        <input type="text" id="filter-input" placeholder="Filter features…" autocomplete="off" spellcheck="false">
      </div>
      <div class="sidebar-sort">
        <button class="sort-btn active" id="sort-domain" onclick="setSortMode('domain')">Domain</button>
        <button class="sort-btn" id="sort-build" onclick="setSortMode('build-order')">Build Order</button>
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

function md(text) {
  if (!text) return '';
  const lines = esc(text).split('\\n');
  const out = [];
  let inList = false;
  for (const line of lines) {
    const t = line.trim();
    if (t.match(/^[-*] /)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push('<li>' + inline(t.slice(2)) + '</li>');
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(line);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('\\n').split(/\\n{2,}/).map(block => {
    const b = block.trim();
    if (!b) return '';
    if (b.startsWith('<ul>') || b.startsWith('<li>')) return b;
    return '<p>' + inline(b.replace(/\\n/g, '<br>')) + '</p>';
  }).filter(Boolean).join('\\n');
}

function inline(s) {
  return s
    .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
    .replace(/\`([^\`\\n]+)\`/g, '<code>$1</code>');
}

function completeness(f) {
  const checks = [
    !!f.analysis, !!f.implementation,
    !!(f.decisions && f.decisions.length),
    !!f.successCriteria,
    !!(f.knownLimitations && f.knownLimitations.length),
    !!(f.tags && f.tags.length),
    !!f.domain,
  ];
  return Math.round(checks.filter(Boolean).length / checks.length * 100);
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

/** Flatten feature + its descendants with depth info */
function flatten(f, depth) {
  const result = [{ feature: f, depth }];
  for (const child of getChildren(f.featureKey)) {
    result.push(...flatten(child, depth + 1));
  }
  return result;
}

// Group root features by domain
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
let sortMode = 'domain';
const collapsedDomains = new Set();

function setSortMode(mode) {
  sortMode = mode;
  document.getElementById('sort-domain').classList.toggle('active', mode === 'domain');
  document.getElementById('sort-build').classList.toggle('active', mode === 'build-order');
  renderNav(document.getElementById('filter-input').value);
}

function renderNavItem(f, depth) {
  const isChild = depth > 0;
  const hasChildren = getChildren(f.featureKey).length > 0;
  return \`<div class="nav-item\${f.featureKey === activeKey ? ' active' : ''}"
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

function renderNav(filterText) {
  const nav = document.getElementById('nav-tree');
  const q = (filterText || '').toLowerCase().trim();

  const matchFn = f =>
    f.featureKey.toLowerCase().includes(q) ||
    f.title.toLowerCase().includes(q) ||
    (f.domain && f.domain.toLowerCase().includes(q)) ||
    (f.tags && f.tags.some(t => t.toLowerCase().includes(q)));

  const features = q ? FEATURES.filter(matchFn) : FEATURES;

  if (features.length === 0) {
    nav.innerHTML = '<div class="no-results">No features match</div>';
    return;
  }

  // ── Build Order: flat list sorted by featureKey ───────────────────────────
  if (sortMode === 'build-order' && !q) {
    const sorted = [...FEATURES].sort((a, b) => a.featureKey.localeCompare(b.featureKey));
    nav.innerHTML = sorted.map(f => renderNavItem(f, 0)).join('');
    return;
  }

  // ── Search results: flat list ─────────────────────────────────────────────
  if (q) {
    nav.innerHTML = features.map(f => renderNavItem(f, 0)).join('');
    return;
  }

  // ── Domain grouping (default) ─────────────────────────────────────────────
  const groups = buildGroups(FEATURES);
  const sortedDomains = [...groups.keys()].sort((a, b) => {
    if (a === '(no domain)') return 1;
    if (b === '(no domain)') return -1;
    return a.localeCompare(b);
  });

  let html = '';
  for (const domain of sortedDomains) {
    const items = groups.get(domain);
    if (!items || items.length === 0) continue;

    const isCollapsed = collapsedDomains.has(domain);

    html += \`<div class="nav-group\${isCollapsed ? ' collapsed' : ''}" data-domain="\${esc(domain)}">
  <div class="nav-domain\${isCollapsed ? ' collapsed' : ''}" onclick="toggleDomain(this)">
    <span class="nav-domain-arrow">▾</span>
    <span>\${esc(domain)}</span>
    <span class="nav-domain-count">\${items.length}</span>
  </div>
  <div class="nav-group-items">\`;

    for (const { feature: f, depth } of items) {
      html += renderNavItem(f, depth);
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

// ── Content rendering ────────────────────────────────────────────────────────

function renderHome() {
  const content = document.getElementById('content');
  const total = FEATURES.length;

  if (VIEW === 'user') {
    content.innerHTML = \`<div class="home-page">
  <div class="home-eyebrow">User Guide</div>
  <div class="home-title">\${esc(document.title.replace(' — LAC Wiki','').replace(/ · [^·]+ view$/,'').trim())}</div>
  <div class="home-subtitle">\${total} feature\${total === 1 ? '' : 's'}</div>
  <div class="home-section-title">Features</div>
  <div style="display:flex;flex-direction:column;gap:2px;">
    \${FEATURES.map(f => \`<div class="nav-item" data-key="\${esc(f.featureKey)}" data-status="\${esc(f.status)}" data-depth="0" onclick="navigate('\${esc(f.featureKey)}')" style="border-radius:4px;border:1px solid var(--border-soft);margin-bottom:2px;padding:10px 14px;">
      <span class="nav-dot"></span>
      <span class="nav-item-title" style="font-size:13px;">\${esc(f.title)}</span>
    </div>\`).join('')}
  </div>
</div>\`;
    return;
  }

  const frozen = FEATURES.filter(f => f.status === 'frozen').length;
  const active = FEATURES.filter(f => f.status === 'active').length;
  const draft  = FEATURES.filter(f => f.status === 'draft').length;
  const depr   = FEATURES.filter(f => f.status === 'deprecated').length;

  const domains = [...new Set(FEATURES.map(f => f.domain).filter(Boolean))].sort();

  const avgCompleteness = FEATURES.length
    ? Math.round(FEATURES.reduce((s, f) => s + completeness(f), 0) / FEATURES.length)
    : 0;

  content.innerHTML = \`<div class="home-page">
  <div class="home-eyebrow">◈ life-as-code wiki</div>
  <div class="home-title">\${esc(document.title.replace(' — LAC Wiki', ''))}</div>
  <div class="home-subtitle">\${total} feature\${total === 1 ? '' : 's'} · avg \${avgCompleteness}% complete</div>

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
      \${VIEW !== 'user' ? '<span class="nav-item-key">' + esc(f.featureKey) + '</span>' : ''}
      <span class="nav-item-title">\${esc(f.title)}</span>
      \${VIEW !== 'user' ? '<span style="margin-left:auto;font-family:var(--mono);font-size:10px;color:var(--text-soft);">' + completeness(f) + '%</span>' : ''}
    </div>\`).join('')}
  </div>
</div>\`;
}

function renderFeature(key) {
  const f = byKey.get(key);
  if (!f) { renderHome(); return; }

  const pct = completeness(f);
  const barFill = \`<span class="completeness-bar"><span class="completeness-fill" style="width:\${pct}%"></span></span>\`;

  const children = getChildren(f.featureKey);
  const parent = f.lineage && f.lineage.parent && byKey.get(f.lineage.parent);

  let html = \`<div class="feature-page">
  \${VIEW !== 'user' ? \`<div class="feature-meta">
    <span class="feature-key">\${esc(f.featureKey)}</span>
    <span class="badge badge-\${esc(f.status)}"><span class="badge-dot" style="background:\${statusColor(f.status)}"></span>\${esc(f.status)}</span>
    \${f.domain ? \`<span class="badge badge-domain">\${esc(f.domain)}</span>\` : ''}
  </div>\` : ''}
  <div class="feature-title">\${esc(f.title)}</div>
  \${VIEW !== 'user' ? \`<div class="feature-completeness">\${barFill}\${pct}% complete</div>\` : ''}\`;

  // Problem
  html += section(VIEW === 'user' ? 'About this feature' : 'Problem', f.problem ? \`<div class="section-body">\${md(f.problem)}</div>\` : '<span class="empty">Not documented.</span>');

  // Analysis
  if (f.analysis)
    html += section('Analysis', \`<div class="section-body">\${md(f.analysis)}</div>\`);

  // Implementation
  if (f.implementation)
    html += section('Implementation', \`<div class="section-body">\${md(f.implementation)}</div>\`);

  // User Guide / Success Criteria
  if (VIEW === 'user') {
    const guideContent = f.userGuide || f.successCriteria;
    if (guideContent)
      html += section('What you can do', \`<div class="section-body">\${md(guideContent)}</div>\`);
  } else {
    if (f.userGuide)
      html += section('User Guide', \`<div class="section-body">\${md(f.userGuide)}</div>\`);
    if (f.successCriteria)
      html += section('Success Criteria', \`<div class="section-body">\${md(f.successCriteria)}</div>\`);
  }

  // Decisions
  if (f.decisions && f.decisions.length) {
    const cards = f.decisions.map(d => \`<div class="decision-card">
      <div class="decision-title">\${esc(d.decision)}</div>
      <div class="decision-rationale">\${md(d.rationale)}</div>
      \${d.date || (d.alternativesConsidered && d.alternativesConsidered.length) ? \`<div class="decision-meta">
        \${d.date ? \`<span class="decision-date">📅 \${esc(d.date)}</span>\` : ''}
        \${d.alternativesConsidered && d.alternativesConsidered.length ? \`<span class="decision-alts">Considered: \${d.alternativesConsidered.map(esc).join(', ')}</span>\` : ''}
      </div>\` : ''}
    </div>\`).join('');
    html += section('Decisions', \`<div class="decisions-list">\${cards}</div>\`, f.decisions.length);
  }

  // Known Limitations
  if (f.knownLimitations && f.knownLimitations.length) {
    const items = f.knownLimitations.map(l =>
      \`<div class="limitation-item"><span class="limitation-bullet">—</span><span>\${md(l)}</span></div>\`
    ).join('');
    html += section('Known Limitations', \`<div class="limitations-list">\${items}</div>\`, f.knownLimitations.length);
  }

  // Tags
  if (f.tags && f.tags.length) {
    const chips = f.tags.map(t => \`<span class="tag">\${esc(t)}</span>\`).join('');
    html += section(VIEW === 'user' ? 'Topics' : 'Tags', \`<div class="tags-row">\${chips}</div>\`);
  }

  // Lineage
  if (parent || children.length) {
    let lineage = '<div class="lineage-row">';
    if (VIEW === 'user') {
      if (parent) {
        lineage += \`<span class="lineage-arrow">Part of</span>
          <a class="lineage-link" onclick="navigate('\${esc(parent.featureKey)}')">\${esc(parent.title)}</a>\`;
      }
      if (parent && children.length) lineage += '<span class="lineage-arrow" style="margin:0 6px;">·</span>';
      if (children.length) {
        lineage += '<span class="lineage-arrow">Related</span>';
        for (const c of children) {
          lineage += \`<a class="lineage-link" onclick="navigate('\${esc(c.featureKey)}')">\${esc(c.title)}</a>\`;
        }
      }
    } else {
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
    }
    lineage += '</div>';
    html += section(VIEW === 'user' ? 'Related' : 'Lineage', lineage);
  }

  html += '</div>';
  document.getElementById('content').innerHTML = html;
  document.getElementById('content').scrollTop = 0;
}

function section(label, body, count) {
  const countHtml = count != null ? \`<span class="section-count">(\${count})</span>\` : '';
  return \`<div class="section">
  <div class="section-header">
    <span class="section-label">\${label}</span>\${countHtml}
  </div>
  \${body}
</div>\`;
}

// ── Navigation ───────────────────────────────────────────────────────────────

function navigate(key) {
  activeKey = key;
  location.hash = key ? '#' + key : '';
  renderNav(document.getElementById('filter-input').value);
  if (key) {
    renderFeature(key);
    // Scroll nav item into view
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

// Filter input
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
window.setSortMode = setSortMode;
</script>
</body>
</html>`
}

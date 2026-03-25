/**
 * Decision Log generator — consolidated Architecture Decision Record (ADR) document.
 * Design intent: "Every architectural choice, every rationale — one searchable page."
 * Sidebar by domain, full decision text in main content, live search with highlighting.
 *
 * All CSS + JS inline, zero external deps.
 */

import type { Feature } from '@life-as-code/feature-schema'

// ── Helpers ────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function groupByDomain(features: Feature[]): Map<string, Feature[]> {
  const map = new Map<string, Feature[]>()
  for (const f of features) {
    const key = f.domain ?? 'uncategorized'
    const bucket = map.get(key) ?? []
    bucket.push(f)
    map.set(key, bucket)
  }
  return new Map(
    [...map.entries()].sort(([a], [b]) => {
      if (a === 'uncategorized') return 1
      if (b === 'uncategorized') return -1
      return a.localeCompare(b)
    }),
  )
}

function statusColor(status: string): string {
  switch (status) {
    case 'active':     return 'var(--status-active)'
    case 'frozen':     return 'var(--status-frozen)'
    case 'draft':      return 'var(--status-draft)'
    case 'deprecated': return 'var(--status-deprecated)'
    default:           return 'var(--text-soft)'
  }
}

function statusBg(status: string): string {
  switch (status) {
    case 'active':     return 'rgba(74,173,114,0.12)'
    case 'frozen':     return 'rgba(91,130,204,0.12)'
    case 'draft':      return 'rgba(196,162,85,0.12)'
    case 'deprecated': return 'rgba(204,91,91,0.12)'
    default:           return 'rgba(122,106,90,0.12)'
  }
}

interface DecisionEntry {
  featureKey: string
  title: string
  domain: string
  status: string
  decisions: NonNullable<Feature['decisions']>
  tags: string[]
}

function collectDecisionEntries(features: Feature[]): DecisionEntry[] {
  return features
    .filter(f => f.decisions && f.decisions.length > 0)
    .map(f => ({
      featureKey: f.featureKey,
      title:      f.title,
      domain:     f.domain ?? 'uncategorized',
      status:     f.status,
      decisions:  f.decisions!,
      tags:       f.tags ?? [],
    }))
}

function mostDecidedFeature(entries: DecisionEntry[]): string {
  if (entries.length === 0) return '—'
  let best = entries[0]!
  for (const e of entries) {
    if (e.decisions.length > best.decisions.length) best = e
  }
  return `${esc(best.featureKey)}: ${best.decisions.length}`
}

function mostCommonTagAmongDecisionHeavy(entries: DecisionEntry[]): string {
  // "decision-heavy" = above median decision count
  if (entries.length === 0) return '—'
  const sorted = entries.map(e => e.decisions.length).sort((a, b) => a - b)
  const medianVal = sorted[Math.floor(sorted.length / 2)] ?? 1
  const heavy  = entries.filter(e => e.decisions.length >= medianVal)
  const freq   = new Map<string, number>()
  for (const e of heavy) {
    for (const t of e.tags) {
      freq.set(t, (freq.get(t) ?? 0) + 1)
    }
  }
  if (freq.size === 0) return '—'
  const sorted2 = [...freq.entries()].sort((a, b) => b[1] - a[1])
  const top = sorted2[0]
  return top ? esc(top[0]) : '—'
}

// ── Sidebar HTML ───────────────────────────────────────────────────────────────

function renderSidebar(features: Feature[]): string {
  const grouped = groupByDomain(features)

  const groups = [...grouped.entries()].map(([domain, fs]) => {
    const items = fs.map(f => {
      const hasDecisions = !!(f.decisions && f.decisions.length > 0)
      const dimClass = hasDecisions ? '' : ' nav-item-dim'
      const countBadge = hasDecisions
        ? `<span class="nav-dec-count">${f.decisions!.length}</span>`
        : ''
      return `
          <a class="nav-item${dimClass}" href="#${esc(f.featureKey)}" data-key="${esc(f.featureKey)}"
             data-title="${esc(f.title.toLowerCase())}" data-domain="${esc(domain.toLowerCase())}">
            <span class="nav-dot" style="background:${statusColor(f.status)};opacity:${hasDecisions ? '1' : '0.35'}"></span>
            <span class="nav-item-key">${esc(f.featureKey)}</span>
            <span class="nav-item-title">${esc(f.title)}</span>
            ${countBadge}
          </a>`
    }).join('')

    return `
      <div class="nav-group" data-domain="${esc(domain.toLowerCase())}">
        <div class="nav-domain">
          <span class="nav-domain-arrow">&#9660;</span>
          <span class="nav-domain-name">${esc(domain)}</span>
          <span class="nav-domain-count">${fs.length}</span>
        </div>
        <div class="nav-group-items">
          ${items}
        </div>
      </div>`
  }).join('\n')

  return `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-search">
        <input type="text" id="search-input" placeholder="Search decisions&#8230;" autocomplete="off" spellcheck="false">
        <button class="search-clear" id="search-clear" aria-label="Clear search">&times;</button>
      </div>
      <nav class="nav-tree" id="nav-tree">
        ${groups}
      </nav>
    </aside>`
}

// ── Main content HTML ──────────────────────────────────────────────────────────

function renderDecisionSection(entry: DecisionEntry): string {
  const decItems = entry.decisions.map((d, i) => {
    const rationale = d.rationale
      ? `<div class="dec-field"><span class="dec-field-label">Rationale</span><p class="dec-field-body">${esc(d.rationale)}</p></div>`
      : ''
    const alternativesHtml = d.alternativesConsidered && d.alternativesConsidered.length > 0
      ? `<div class="dec-field"><span class="dec-field-label">Alternatives considered</span><ul class="dec-alts">${d.alternativesConsidered.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>`
      : ''
    const date = d.date
      ? `<div class="dec-field dec-field-inline"><span class="dec-field-label">Date</span><span class="dec-field-value">${esc(d.date)}</span></div>`
      : ''

    return `
          <div class="dec-item" data-index="${i}">
            <h4 class="dec-title">
              <span class="dec-num">${i + 1}</span>
              <span class="dec-text">${esc(d.decision)}</span>
            </h4>
            ${rationale}
            ${alternativesHtml}
            ${date}
          </div>`
  }).join('\n')

  return `
      <section class="feature-section" id="${esc(entry.featureKey)}"
               data-domain="${esc(entry.domain.toLowerCase())}"
               data-key="${esc(entry.featureKey.toLowerCase())}"
               data-date="${entry.decisions.map(d => d.date ?? '').filter(Boolean).sort().reverse()[0] ?? ''}">
        <header class="feature-section-header">
          <div class="feature-section-title-row">
            <h2 class="feature-section-title">${esc(entry.title)}</h2>
            <code class="feature-section-key">${esc(entry.featureKey)}</code>
          </div>
          <div class="feature-section-meta">
            <span class="domain-chip">${esc(entry.domain)}</span>
            <span class="status-badge"
              style="color:${statusColor(entry.status)};background:${statusBg(entry.status)};border-color:${statusColor(entry.status)}40">
              ${esc(entry.status)}
            </span>
            <span class="dec-count-badge">${entry.decisions.length} decision${entry.decisions.length === 1 ? '' : 's'}</span>
          </div>
        </header>
        <div class="dec-list">
          ${decItems}
        </div>
      </section>`
}

// ── Public API ──────────────────────────────────────────────────────────────────

// Pre-built inline JS snippet for regex-escaping — avoids template literal parse issues
// with bracket characters that confuse the TypeScript template literal scanner.
const ESCAPE_REGEX_FN = [
  'function escRegex(s) {',
  "  var SPECIALS = '\\\\.+*?^${}()|[' + ']';",
  "  return s.split('').map(function(c) { return SPECIALS.indexOf(c) >= 0 ? '\\\\' + c : c; }).join('');",
  '}',
].join('\n  ')

export function generateDecisionLog(features: Feature[], projectName: string): string {
  const allEntries      = collectDecisionEntries(features)
  const totalDecisions  = features.reduce((sum, f) => sum + (f.decisions?.length ?? 0), 0)
  const featuresWithDec = allEntries.length
  const topFeature      = mostDecidedFeature(allEntries)
  const topTag          = mostCommonTagAmongDecisionHeavy(allEntries)

  // Safe JSON for inline data
  const dataJson = JSON.stringify(
    allEntries.map(e => ({
      key:    e.featureKey,
      title:  e.title,
      domain: e.domain,
      status: e.status,
      decs:   e.decisions.map(d => ({
        decision:               d.decision,
        rationale:              d.rationale ?? '',
        alternativesConsidered: d.alternativesConsidered ?? [],
        date:                   d.date ?? '',
      })),
    }))
  ).replace(/<\/script>/gi, '<\\/script>')

  const sidebar = renderSidebar(features)
  const sections = allEntries.map(renderDecisionSection).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)} — Decision Log</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:          #12100e;
  --bg-card:     #1a1714;
  --bg-hover:    #201d1a;
  --bg-active:   #251f18;
  --bg-sidebar:  #0e0c0a;
  --border:      #2a2420;
  --border-soft: #221e1b;
  --text:        #e8ddd4;
  --text-mid:    #b0a49c;
  --text-soft:   #7a6a5a;
  --accent:      #c4a255;
  --mono:        'Cascadia Code','Fira Code','JetBrains Mono','Consolas',monospace;
  --sans:        -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  --status-active:     #4aad72;
  --status-draft:      #c4a255;
  --status-frozen:     #5b82cc;
  --status-deprecated: #cc5b5b;
}

html, body { height: 100%; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  display: flex;
  flex-direction: column;
}

/* ── Shell ── */
.shell { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

/* ── Topbar ── */
.topbar {
  flex-shrink: 0;
  height: 48px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 18px;
  background: var(--bg-sidebar);
  border-bottom: 1px solid var(--border);
}
.topbar-logo    { font-family: var(--mono); font-size: 13px; color: var(--accent); letter-spacing: 0.05em; }
.topbar-sep     { color: var(--border); }
.topbar-project { font-family: var(--mono); font-size: 12px; color: var(--text-mid); }
.topbar-count   { margin-left: auto; font-family: var(--mono); font-size: 11px; color: var(--text-soft); }

.sort-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 16px;
}
.sort-btn {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--text-soft);
  background: none;
  border: 1px solid var(--border-soft);
  border-radius: 3px;
  padding: 3px 9px;
  cursor: pointer;
  letter-spacing: 0.05em;
  transition: color 0.15s, border-color 0.15s;
}
.sort-btn:hover { color: var(--text-mid); border-color: var(--accent); }
.sort-btn.active { color: var(--accent); border-color: var(--accent); }

/* ── Stats bar ── */
.stats-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0 18px;
  height: 36px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-soft);
  flex-wrap: wrap;
  overflow: hidden;
}

.stats-item { display: flex; align-items: center; gap: 6px; }
.stats-value { color: var(--text-mid); font-weight: 600; }
.stats-sep { margin: 0 12px; color: var(--border); }

/* ── Body row ── */
.body-row { display: flex; flex: 1; min-height: 0; }

/* ── Sidebar ── */
.sidebar {
  width: 272px;
  flex-shrink: 0;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-search {
  position: relative;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.sidebar-search input {
  width: 100%;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px 28px 6px 10px;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text);
  outline: none;
}
.sidebar-search input:focus { border-color: var(--accent); }
.sidebar-search input::placeholder { color: var(--text-soft); }

.search-clear {
  position: absolute;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--text-soft);
  font-size: 14px;
  cursor: pointer;
  line-height: 1;
  display: none;
  padding: 0;
}
.search-clear:hover { color: var(--text-mid); }
.search-clear.visible { display: block; }

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
.nav-group.collapsed .nav-domain-arrow { transform: rotate(-90deg); }
.nav-domain-name { flex: 1; }
.nav-domain-count { font-size: 10px; opacity: 0.6; }

.nav-group-items { overflow: hidden; }
.nav-group.collapsed .nav-group-items { display: none; }

.nav-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
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
.nav-item-dim { opacity: 0.45; }
.nav-item-dim:hover { opacity: 0.7; }

.nav-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 2px;
}
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
.nav-item.active .nav-item-key   { color: var(--accent); }

.nav-dec-count {
  font-family: var(--mono);
  font-size: 9px;
  color: var(--accent);
  background: rgba(196,162,85,0.1);
  border: 1px solid rgba(196,162,85,0.25);
  border-radius: 8px;
  padding: 0 5px;
  flex-shrink: 0;
  line-height: 1.6;
}

.nav-item.hidden { display: none; }
.nav-group.hidden { display: none; }

/* ── Content ── */
.content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
  padding: 32px 40px 80px;
}
.content::-webkit-scrollbar { width: 6px; }
.content::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

/* ── Feature section ── */
.feature-section {
  max-width: 760px;
  margin-bottom: 56px;
}
.feature-section.hidden { display: none; }

.feature-section-header {
  margin-bottom: 20px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border);
}

.feature-section-title-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.feature-section-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.3;
}

.feature-section-key {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-soft);
  background: var(--bg-sidebar);
  border: 1px solid var(--border-soft);
  border-radius: 3px;
  padding: 1px 6px;
  flex-shrink: 0;
}

.feature-section-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.domain-chip {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--accent);
  background: rgba(196,162,85,0.08);
  border: 1px solid rgba(196,162,85,0.25);
  border-radius: 10px;
  padding: 1px 9px;
  letter-spacing: 0.05em;
}

.status-badge {
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 3px;
  border: 1px solid currentColor;
  flex-shrink: 0;
}

.dec-count-badge {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-soft);
  background: var(--bg-sidebar);
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  padding: 1px 8px;
}

/* ── Decision items ── */
.dec-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.dec-item {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 16px 20px;
}

.dec-title {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
}

.dec-num {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-soft);
  background: var(--bg-sidebar);
  border: 1px solid var(--border-soft);
  border-radius: 3px;
  padding: 1px 7px;
  flex-shrink: 0;
  line-height: 1.8;
}

.dec-text {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.4;
}

.dec-field {
  margin-bottom: 10px;
}

.dec-field:last-child { margin-bottom: 0; }

.dec-field-label {
  display: block;
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-soft);
  margin-bottom: 4px;
}

.dec-field-body {
  font-size: 13.5px;
  color: var(--text-mid);
  line-height: 1.65;
}

.dec-recommendation {
  color: var(--accent);
  font-style: italic;
}

.dec-field-inline {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.dec-field-inline .dec-field-label {
  display: inline;
  margin-bottom: 0;
}

.dec-field-value {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text-mid);
}

/* ── Search highlight ── */
mark {
  background: rgba(196,162,85,0.3);
  color: var(--text);
  border-radius: 2px;
  padding: 0 1px;
}

/* ── Empty content ── */
.content-empty {
  max-width: 760px;
  padding: 80px 0;
  text-align: center;
  color: var(--text-soft);
  font-size: 14px;
}
.content-empty strong { color: var(--text-mid); }
</style>
</head>
<body>

<div class="shell">

  <div class="topbar">
    <span class="topbar-logo">&#9672; lac &middot; decisions</span>
    <span class="topbar-sep">|</span>
    <span class="topbar-project">${esc(projectName)}</span>
    <span class="topbar-count">${totalDecisions} total decisions</span>
    <div class="sort-controls">
      <span style="font-family:var(--mono);font-size:10px;color:var(--text-soft);margin-right:4px;">sort:</span>
      <button class="sort-btn active" id="sort-domain" data-sort="domain">domain</button>
      <button class="sort-btn" id="sort-date"   data-sort="date">date</button>
      <button class="sort-btn" id="sort-key"    data-sort="key">key</button>
    </div>
  </div>

  <div class="stats-bar">
    <span class="stats-item"><span class="stats-value">${totalDecisions}</span> decisions</span>
    <span class="stats-sep">&middot;</span>
    <span class="stats-item"><span class="stats-value">${featuresWithDec}</span> features with decisions</span>
    <span class="stats-sep">&middot;</span>
    <span class="stats-item">most decided: <span class="stats-value">${topFeature}</span></span>
    <span class="stats-sep">&middot;</span>
    <span class="stats-item">top tag: <span class="stats-value">${topTag}</span></span>
    <span class="stats-sep">&middot;</span>
    <span class="stats-item">${today()}</span>
  </div>

  <div class="body-row">

    ${sidebar}

    <main class="content" id="content">
      ${allEntries.length === 0
        ? `<div class="content-empty"><strong>No decisions logged yet.</strong><br>Add a <code>decisions</code> array to your feature.json files.</div>`
        : sections
      }
    </main>

  </div>
</div>

<script>
(function() {
  // ── Helpers ──
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Data ──
  var DATA = ${dataJson};

  // ── DOM refs ──
  var searchInput  = document.getElementById('search-input');
  var searchClear  = document.getElementById('search-clear');
  var navTree      = document.getElementById('nav-tree');
  var content      = document.getElementById('content');
  var sortButtons  = document.querySelectorAll('.sort-btn');

  // ── Sidebar collapse ──
  navTree.addEventListener('click', function(e) {
    var domain = e.target.closest('.nav-domain');
    if (domain) {
      var group = domain.closest('.nav-group');
      if (group) group.classList.toggle('collapsed');
    }
  });

  // ── Active nav item on scroll ──
  var sections = Array.from(content.querySelectorAll('.feature-section'));
  var navItems = Array.from(navTree.querySelectorAll('.nav-item'));

  function updateActive() {
    var scrollTop = content.scrollTop;
    var best = null;
    for (var i = sections.length - 1; i >= 0; i--) {
      if (sections[i].offsetTop <= scrollTop + 100) { best = sections[i]; break; }
    }
    navItems.forEach(function(el) { el.classList.remove('active'); });
    if (best) {
      var key = best.id;
      var match = navTree.querySelector('.nav-item[data-key="' + key + '"]');
      if (match) match.classList.add('active');
    }
  }

  content.addEventListener('scroll', updateActive, { passive: true });

  // ── Search ──
  ${ESCAPE_REGEX_FN}

  function highlightText(node, rx) {
    // Only process text nodes directly inside elements — skip script/style
    if (node.nodeType === 3) {
      var text = node.nodeValue;
      if (rx.test(text)) {
        var span = document.createElement('span');
        span.innerHTML = text.replace(rx, function(m) {
          return '<mark>' + esc(m) + '</mark>';
        });
        node.parentNode.replaceChild(span, node);
      }
      return;
    }
    if (node.nodeType === 1 && node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE') {
      Array.from(node.childNodes).forEach(function(c) { highlightText(c, rx); });
    }
  }

  function clearHighlights() {
    content.querySelectorAll('mark').forEach(function(m) {
      var parent = m.parentNode;
      parent.replaceChild(document.createTextNode(m.textContent), m);
      parent.normalize();
    });
  }

  var lastQuery = '';

  function applySearch(query) {
    var q = query.trim().toLowerCase();
    lastQuery = q;
    clearHighlights();

    searchClear.classList.toggle('visible', q.length > 0);

    var navGroups = navTree.querySelectorAll('.nav-group');

    if (!q) {
      // Show everything
      navItems.forEach(function(el) { el.classList.remove('hidden'); });
      navGroups.forEach(function(el) { el.classList.remove('hidden'); });
      sections.forEach(function(el) { el.classList.remove('hidden'); });
      return;
    }

    var rx = new RegExp('(' + escRegex(q) + ')', 'gi');

    // Filter sections
    sections.forEach(function(sec) {
      var key    = (sec.getAttribute('data-key') || '').toLowerCase();
      var domain = (sec.getAttribute('data-domain') || '').toLowerCase();
      var text   = (sec.textContent || '').toLowerCase();
      var match  = key.includes(q) || domain.includes(q) || text.includes(q);
      sec.classList.toggle('hidden', !match);
      if (match) highlightText(sec, rx);
    });

    // Filter sidebar items
    navGroups.forEach(function(group) {
      var items = group.querySelectorAll('.nav-item');
      var anyVisible = false;
      items.forEach(function(item) {
        var ikey   = (item.getAttribute('data-key') || '').toLowerCase();
        var ititle = (item.getAttribute('data-title') || '').toLowerCase();
        var idomain = (item.getAttribute('data-domain') || '').toLowerCase();
        var show = ikey.includes(q) || ititle.includes(q) || idomain.includes(q);
        item.classList.toggle('hidden', !show);
        if (show) anyVisible = true;
      });
      group.classList.toggle('hidden', !anyVisible);
    });
  }

  searchInput.addEventListener('input', function() {
    applySearch(searchInput.value);
  });

  searchClear.addEventListener('click', function() {
    searchInput.value = '';
    applySearch('');
    searchInput.focus();
  });

  // ── Sort ──
  var currentSort = 'domain';

  function sortSections(mode) {
    var parent = content;
    var secs = Array.from(content.querySelectorAll('.feature-section'));

    secs.sort(function(a, b) {
      if (mode === 'domain') {
        var da = a.getAttribute('data-domain') || '';
        var db = b.getAttribute('data-domain') || '';
        if (da !== db) return da.localeCompare(db);
        return (a.getAttribute('data-key') || '').localeCompare(b.getAttribute('data-key') || '');
      }
      if (mode === 'date') {
        var dateA = a.getAttribute('data-date') || '';
        var dateB = b.getAttribute('data-date') || '';
        // Most recent first — reverse compare
        if (dateB !== dateA) return dateB.localeCompare(dateA);
        return (a.getAttribute('data-key') || '').localeCompare(b.getAttribute('data-key') || '');
      }
      if (mode === 'key') {
        return (a.getAttribute('data-key') || '').localeCompare(b.getAttribute('data-key') || '');
      }
      return 0;
    });

    secs.forEach(function(s) { parent.appendChild(s); });
  }

  sortButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var mode = btn.getAttribute('data-sort');
      if (mode === currentSort) return;
      currentSort = mode;
      sortButtons.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      sortSections(mode);
      if (lastQuery) applySearch(lastQuery);
    });
  });

})();
</script>

</body>
</html>`
}

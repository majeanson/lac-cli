import type { RoleOverrideConfig } from './config.js'

/**
 * rolesGenerator — generates lac-roles.html
 *
 * THE answer to "all in one place, different viewers need different information."
 *
 * A single self-contained HTML file with:
 *   - Role switcher sidebar: User / Product / Dev / QA / Support / Architect
 *   - Per-role feature cards showing only the fields that matter to each audience
 *   - Role completeness summary (how many features have the critical fields filled)
 *   - Compare mode: select one feature, see all 6 role views side-by-side
 *   - Search + filter bar
 *   - Keyboard navigation (Tab cycles roles, Enter opens compare)
 *   - Fully self-contained — no external deps, no build step
 */

type Rec = Record<string, unknown>

interface RoleDef {
  id: string
  icon: string
  label: string
  desc: string
  /** Fields shown in this role's cards */
  fields: string[]
  /** Fields that are blocking-missing (shown as gap warnings) */
  required: string[]
  /** Accent color for this role */
  color: string
}

const ROLES: RoleDef[] = [
  {
    id: 'user',
    icon: '👤',
    label: 'User',
    desc: 'How end users experience each feature — plain guides, gotchas, workarounds',
    fields: ['userGuide', 'knownLimitations', 'knownWorkarounds', 'releaseVersion'],
    required: ['userGuide'],
    color: '#4aad72',
  },
  {
    id: 'product',
    icon: '📊',
    label: 'Product',
    desc: 'Business value, success criteria, risk, and acceptance criteria for POs & PMs',
    fields: ['problem', 'pmSummary', 'successCriteria', 'acceptanceCriteria', 'riskLevel', 'priority', 'tags'],
    required: ['pmSummary', 'successCriteria'],
    color: '#c4a255',
  },
  {
    id: 'dev',
    icon: '💻',
    label: 'Dev',
    desc: 'Implementation context, architectural decisions, code references, test strategy',
    fields: ['analysis', 'implementation', 'decisions', 'componentFile', 'codeSnippets', 'publicInterface', 'npmPackages', 'implementationNotes', 'testStrategy', 'externalDependencies'],
    required: ['decisions', 'componentFile'],
    color: '#5b82cc',
  },
  {
    id: 'qa',
    icon: '🧪',
    label: 'QA',
    desc: 'Test cases, acceptance criteria, edge cases, test strategy, and known bugs',
    fields: ['acceptanceCriteria', 'testCases', 'edgeCases', 'testStrategy', 'successCriteria', 'knownLimitations'],
    required: ['testStrategy', 'acceptanceCriteria'],
    color: '#9b6fc4',
  },
  {
    id: 'support',
    icon: '🛟',
    label: 'Support',
    desc: 'Known limitations, active workarounds, support notes, and escalation context',
    fields: ['knownLimitations', 'knownWorkarounds', 'supportNotes', 'annotations', 'userGuide'],
    required: [],
    color: '#cc5b5b',
  },
  {
    id: 'architect',
    icon: '🏛️',
    label: 'Architect',
    desc: 'Technical decisions, dependency graph, risk level, rollback plans, and interfaces',
    fields: ['decisions', 'analysis', 'implementationNotes', 'externalDependencies', 'publicInterface', 'riskLevel', 'rollbackPlan'],
    required: ['decisions'],
    color: '#4ab5cc',
  },
]

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function hasValue(v: unknown): boolean {
  if (v === undefined || v === null || v === '') return false
  if (Array.isArray(v)) return v.length > 0
  return true
}

/**
 * Merge project-level role overrides (from lac.config.json `roles` key) into
 * the built-in ROLES defaults. Only the keys provided are overridden.
 */
function applyRoleOverrides(
  defaults: RoleDef[],
  overrides: Record<string, RoleOverrideConfig>,
): RoleDef[] {
  return defaults.map(role => {
    const override = overrides[role.id]
    if (!override) return role
    return {
      ...role,
      label:    override.label    ?? role.label,
      desc:     override.desc     ?? role.desc,
      fields:   override.fields   ?? role.fields,
      required: override.required ?? role.required,
    }
  })
}

export function generateRoles(
  features: Rec[],
  projectName: string,
  options: { roleOverrides?: Record<string, RoleOverrideConfig> } = {},
): string {
  const resolvedRoles = options.roleOverrides && Object.keys(options.roleOverrides).length > 0
    ? applyRoleOverrides(ROLES, options.roleOverrides)
    : ROLES

  const rolesJson = JSON.stringify(resolvedRoles)
  const featuresJson = JSON.stringify(features)

  const statusColors: Record<string, string> = {
    frozen: '#5b82cc', active: '#4aad72', draft: '#c4a255', deprecated: '#cc5b5b',
  }

  // Precompute role completeness stats for the initial render hint
  const stats = ROLES.map(role => {
    const total = features.length
    const complete = features.filter(f =>
      role.required.every(field => hasValue(f[field])),
    ).length
    return { id: role.id, complete, total }
  })
  const statsJson = JSON.stringify(stats)

  // Domain → color hue map
  const domains = [...new Set(features.map(f => f['domain']).filter(Boolean) as string[])].sort()
  const domainColors: Record<string, string> = {}
  const DOMAIN_HUES = [200, 30, 130, 270, 10, 185, 45, 300, 150, 60, 230, 350]
  domains.forEach((d, i) => {
    domainColors[d] = `hsl(${DOMAIN_HUES[i % DOMAIN_HUES.length]},50%,60%)`
  })
  const domainColorsJson = JSON.stringify(domainColors)
  const statusColorsJson = JSON.stringify(statusColors)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)} — Roles View</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg:        #0f0d0b;
  --bg-card:   #181512;
  --bg-card2:  #1a1715;
  --bg-hover:  #1e1a16;
  --border:    #262018;
  --text:      #ece3d8;
  --text-mid:  #b0a494;
  --text-soft: #736455;
  --accent:    #c4a255;
  --mono: 'Cascadia Code','Fira Code','JetBrains Mono','Consolas',monospace;
  --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --sidebar-w: 188px;
}
html { height: 100%; }
body { background: var(--bg); color: var(--text); font-family: var(--sans); font-size: 14px; line-height: 1.6; height: 100%; display: flex; flex-direction: column; }

/* ── Topbar ── */
.topbar { height: 46px; display: flex; align-items: center; gap: 14px; padding: 0 20px; background: #0b0a08; border-bottom: 1px solid var(--border); flex-shrink: 0; z-index: 20; }
.topbar-brand { font-family: var(--mono); font-size: 12px; color: var(--accent); letter-spacing: 0.05em; }
.topbar-sep   { color: var(--border); }
.topbar-title { font-size: 12px; color: var(--text-mid); }
.topbar-role  { font-size: 11px; color: var(--text-soft); margin-left: auto; font-family: var(--mono); }
.topbar-compare-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 12px; border-radius: 5px; border: 1px solid var(--border);
  background: transparent; color: var(--text-mid); font-size: 11px; cursor: pointer;
  transition: border-color .15s, color .15s;
}
.topbar-compare-btn:hover, .topbar-compare-btn.active { border-color: var(--accent); color: var(--accent); }

/* ── Shell ── */
.shell { display: flex; flex: 1; overflow: hidden; }

/* ── Sidebar ── */
.sidebar {
  width: var(--sidebar-w); flex-shrink: 0; background: #0c0b09; border-right: 1px solid var(--border);
  display: flex; flex-direction: column; overflow-y: auto; padding: 16px 0 24px;
}
.sidebar-section { padding: 0 12px; margin-bottom: 4px; }
.sidebar-label { font-family: var(--mono); font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-soft); padding: 0 4px; margin-bottom: 6px; }
.role-btn {
  display: flex; align-items: center; gap: 9px; width: 100%; padding: 9px 10px;
  border-radius: 7px; border: none; background: transparent; cursor: pointer;
  color: var(--text-mid); transition: background .12s, color .12s; text-align: left; position: relative;
}
.role-btn:hover { background: var(--bg-card); color: var(--text); }
.role-btn.active { background: var(--bg-card); }
.role-btn-icon { font-size: 16px; flex-shrink: 0; width: 22px; text-align: center; }
.role-btn-body { flex: 1; min-width: 0; }
.role-btn-label { font-size: 13px; font-weight: 600; line-height: 1.2; }
.role-btn-count { font-family: var(--mono); font-size: 10px; color: var(--text-soft); }
.role-btn-indicator {
  width: 3px; height: 24px; border-radius: 2px; flex-shrink: 0;
  background: transparent; transition: background .12s;
}
.role-btn.active .role-btn-indicator { background: var(--role-color, var(--accent)); }
.sidebar-sep { height: 1px; background: var(--border); margin: 12px 16px; }

/* ── Search bar ── */
.search-bar { padding: 10px 16px 0; flex-shrink: 0; }
.search-input {
  width: 100%; padding: 8px 12px; border-radius: 7px; border: 1px solid var(--border);
  background: var(--bg-card); color: var(--text); font-size: 13px; outline: none;
  transition: border-color .15s;
}
.search-input:focus { border-color: var(--accent); }
.search-input::placeholder { color: var(--text-soft); }

/* ── Main ── */
.main { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }

/* ── Role header ── */
.role-header {
  padding: 20px 24px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0;
  display: flex; align-items: flex-start; gap: 16px;
}
.role-header-icon { font-size: 28px; flex-shrink: 0; margin-top: 2px; }
.role-header-body { flex: 1; }
.role-header-title { font-size: 20px; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 3px; }
.role-header-desc { font-size: 13px; color: var(--text-mid); margin-bottom: 10px; }
.role-completeness { display: flex; gap: 20px; flex-wrap: wrap; }
.rc-item { font-size: 12px; }
.rc-label { color: var(--text-soft); }
.rc-val { font-family: var(--mono); font-weight: 600; }
.rc-val.good { color: #4aad72; }
.rc-val.warn { color: #c4a255; }
.rc-val.bad  { color: #cc5b5b; }

/* ── Feature list ── */
.feature-list { padding: 16px 20px 60px; display: flex; flex-direction: column; gap: 10px; }
.feature-card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px;
  padding: 16px 18px; cursor: pointer; transition: border-color .15s, background .15s;
}
.feature-card:hover { background: var(--bg-hover); border-color: var(--text-soft); }
.feature-card.expanded { border-color: var(--role-color, var(--accent)); }
.fc-header { display: flex; align-items: flex-start; gap: 12px; }
.fc-meta { flex: 1; min-width: 0; }
.fc-title { font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 4px; line-height: 1.3; }
.fc-badges { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 6px; }
.badge {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 2px 7px; border-radius: 4px; font-family: var(--mono); font-size: 10px;
  background: var(--bg-card2); border: 1px solid var(--border);
}
.badge-domain { color: var(--domain-color, var(--text-soft)); border-color: var(--domain-color, var(--border)); }
.badge-status-frozen { color: #5b82cc; border-color: #5b82cc33; }
.badge-status-active { color: #4aad72; border-color: #4aad7233; }
.badge-status-draft  { color: #c4a255; border-color: #c4a25533; }
.badge-status-deprecated { color: #cc5b5b; border-color: #cc5b5b33; }
.badge-risk-critical { color: #cc5b5b; border-color: #cc5b5b44; background: rgba(204,91,91,0.08); }
.badge-risk-high     { color: #e87a4a; border-color: #e87a4a44; }
.badge-risk-medium   { color: #c4a255; border-color: #c4a25544; }
.badge-risk-low      { color: #4aad72; border-color: #4aad7244; }
.fc-gap { display: flex; align-items: center; gap: 5px; font-size: 11px; color: #cc5b5b; font-family: var(--mono); }
.fc-expand-arrow { font-size: 12px; color: var(--text-soft); flex-shrink: 0; transition: transform .15s; margin-top: 2px; }
.feature-card.expanded .fc-expand-arrow { transform: rotate(180deg); }

/* ── Role content (expanded) ── */
.fc-content { margin-top: 14px; border-top: 1px solid var(--border); padding-top: 14px; display: none; }
.feature-card.expanded .fc-content { display: block; }
.fc-section { margin-bottom: 14px; }
.fc-section:last-child { margin-bottom: 0; }
.fc-section-label {
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--text-soft); margin-bottom: 6px;
}
.fc-text { font-size: 13px; color: var(--text-mid); line-height: 1.65; }
.fc-list { list-style: none; padding: 0; }
.fc-list li { font-size: 13px; color: var(--text-mid); line-height: 1.5; padding: 4px 0 4px 16px; position: relative; }
.fc-list li::before { content: '–'; position: absolute; left: 0; color: var(--text-soft); }
.fc-list li.check::before { content: '☐'; color: var(--text-soft); }
.fc-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; margin: 2px 3px 2px 0; border-radius: 4px;
  background: var(--bg-card2); border: 1px solid var(--border);
  font-family: var(--mono); font-size: 11px; color: var(--text-mid);
}
.decision-card { background: var(--bg-card2); border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; margin-bottom: 8px; }
.decision-q { font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 3px; }
.decision-r { font-size: 12px; color: var(--text-soft); line-height: 1.5; }
.annotation-card {
  border-left: 3px solid var(--border); padding: 8px 10px; margin-bottom: 6px;
  background: rgba(0,0,0,0.2); border-radius: 0 4px 4px 0;
}
.annotation-type { font-family: var(--mono); font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-soft); margin-bottom: 3px; }
.annotation-body { font-size: 12px; color: var(--text-mid); line-height: 1.5; }
.code-snippet { background: var(--bg-card2); border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; margin-bottom: 8px; }
.code-label { font-size: 11px; color: var(--text-soft); margin-bottom: 5px; }
.code-block { font-family: var(--mono); font-size: 11px; color: #c4a255; white-space: pre-wrap; word-break: break-all; line-height: 1.5; }
.fc-missing { font-size: 12px; color: #736455; font-style: italic; }

/* ── Empty state ── */
.empty-state { padding: 60px 24px; text-align: center; color: var(--text-soft); }
.empty-icon { font-size: 40px; margin-bottom: 12px; }
.empty-title { font-size: 16px; font-weight: 600; color: var(--text-mid); margin-bottom: 6px; }
.empty-desc { font-size: 13px; }

/* ── Compare mode ── */
.compare-shell { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.compare-header {
  padding: 16px 24px 12px; border-bottom: 1px solid var(--border); flex-shrink: 0;
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
}
.compare-title { font-size: 16px; font-weight: 700; }
.compare-select {
  padding: 7px 12px; border-radius: 7px; border: 1px solid var(--border);
  background: var(--bg-card); color: var(--text); font-size: 13px; outline: none;
  max-width: 380px; transition: border-color .15s;
}
.compare-select:focus { border-color: var(--accent); }
.compare-grid {
  flex: 1; overflow-y: auto; padding: 16px 16px 60px;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px;
}
.compare-panel {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px;
  overflow: hidden; display: flex; flex-direction: column;
}
.compare-panel-header {
  padding: 12px 14px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 9px;
}
.compare-panel-icon { font-size: 18px; }
.compare-panel-label { font-size: 13px; font-weight: 700; flex: 1; }
.compare-panel-body { padding: 14px; overflow-y: auto; max-height: 420px; }
.compare-completeness-bar { height: 3px; width: 100%; background: var(--border); }
.compare-completeness-fill { height: 100%; transition: width .3s; }

/* ── Scrollbar ── */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
scrollbar-width: thin;
scrollbar-color: var(--border) transparent;

@media (max-width: 640px) {
  .sidebar { width: 54px; }
  .role-btn-body, .role-btn-count, .sidebar-label { display: none; }
  .role-btn-indicator { display: none; }
  .role-btn { justify-content: center; padding: 10px 6px; }
}
</style>
</head>
<body>

<div class="topbar">
  <span class="topbar-brand">lac·roles</span>
  <span class="topbar-sep">/</span>
  <span class="topbar-title">${esc(projectName)}</span>
  <span class="topbar-role" id="topbar-role-label"></span>
  <button class="topbar-compare-btn" id="compare-btn" onclick="toggleCompare()">🔀 Compare</button>
</div>

<div class="shell">
  <nav class="sidebar" id="sidebar"></nav>
  <div class="main" id="main-area">
    <div class="search-bar">
      <input class="search-input" id="search-input" type="search" placeholder="Search features…" oninput="onSearch(this.value)">
    </div>
    <div id="role-header-area"></div>
    <div class="feature-list" id="feature-list"></div>
    <div class="compare-shell" id="compare-area" style="display:none;">
      <div class="compare-header">
        <span class="compare-title">🔀 Compare All Roles</span>
        <select class="compare-select" id="compare-select" onchange="renderCompare()">
          ${features.map(f => `<option value="${esc(f['featureKey'])}">${esc(f['title'])}</option>`).join('')}
        </select>
      </div>
      <div class="compare-grid" id="compare-grid"></div>
    </div>
  </div>
</div>

<script>
(function() {
'use strict';

var ROLES = ${rolesJson};
var FEATURES = ${featuresJson};
var STATS = ${statsJson};
var DOMAIN_COLORS = ${domainColorsJson};
var STATUS_COLORS = ${statusColorsJson};

var activeRole = ROLES[0].id;
var compareMode = false;
var searchQuery = '';

// ── Helpers ────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function hasVal(v) {
  if (v == null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}
function domainColor(d) { return DOMAIN_COLORS[d] || '#736455'; }
function statusBadge(s) {
  return '<span class="badge badge-status-'+esc(s)+'">'+esc(s)+'</span>';
}
function domainBadge(d) {
  if (!d) return '';
  var col = domainColor(d);
  return '<span class="badge badge-domain" style="--domain-color:'+col+'">'+esc(d)+'</span>';
}
function riskBadge(r) {
  if (!r) return '';
  return '<span class="badge badge-risk-'+esc(r)+'">⚠ '+esc(r)+'</span>';
}
function priorityBadge(p) {
  if (!p) return '';
  return '<span class="badge" style="color:var(--text-soft)">P'+esc(p)+'</span>';
}

// ── Sidebar ────────────────────────────────────────────────────────────────
function renderSidebar() {
  var sidebar = document.getElementById('sidebar');
  var html = '<div class="sidebar-section"><div class="sidebar-label">Audience</div>';
  ROLES.forEach(function(role) {
    var stat = STATS.find(function(s){return s.id===role.id;}) || {complete:0,total:FEATURES.length};
    var pct = stat.total > 0 ? Math.round(stat.complete/stat.total*100) : 100;
    var isActive = role.id === activeRole && !compareMode;
    html += '<button class="role-btn'+(isActive?' active':'')+'" onclick="setRole(\''+role.id+'\')"';
    html += ' style="--role-color:'+role.color+'">';
    html += '<span class="role-btn-icon">'+role.icon+'</span>';
    html += '<span class="role-btn-body">';
    html += '<div class="role-btn-label">'+esc(role.label)+'</div>';
    html += '<div class="role-btn-count">'+pct+'% complete</div>';
    html += '</span>';
    html += '<span class="role-btn-indicator"></span>';
    html += '</button>';
  });
  html += '</div>';
  sidebar.innerHTML = html;
}

// ── Role header ────────────────────────────────────────────────────────────
function renderRoleHeader(role) {
  var area = document.getElementById('role-header-area');
  var stat = STATS.find(function(s){return s.id===role.id;}) || {complete:0,total:FEATURES.length};
  var pct = stat.total > 0 ? Math.round(stat.complete/stat.total*100) : 100;
  var cls = pct >= 80 ? 'good' : pct >= 50 ? 'warn' : 'bad';
  var filtered = filterFeatures();
  var withGaps = filtered.filter(function(f){
    return role.required.some(function(r){ return !hasVal(f[r]); });
  });
  var html = '<div class="role-header">';
  html += '<div class="role-header-icon">'+role.icon+'</div>';
  html += '<div class="role-header-body">';
  html += '<div class="role-header-title" style="color:'+role.color+'">'+esc(role.label)+'</div>';
  html += '<div class="role-header-desc">'+esc(role.desc)+'</div>';
  html += '<div class="role-completeness">';
  html += '<div class="rc-item"><span class="rc-label">Coverage </span><span class="rc-val '+cls+'">'+stat.complete+'/'+stat.total+'</span></div>';
  if (role.required.length > 0 && withGaps.length > 0) {
    html += '<div class="rc-item"><span class="rc-label">Missing required fields </span><span class="rc-val bad">'+withGaps.length+' features</span></div>';
  }
  html += '</div>';
  html += '</div>';
  html += '</div>';
  area.innerHTML = html;
}

// ── Feature content renderer for a given role ─────────────────────────────
function renderRoleContent(feature, role) {
  var html = '';

  if (role.id === 'user') {
    if (hasVal(feature.userGuide)) {
      html += section('How to use', textBlock(feature.userGuide));
    } else {
      html += section('How to use', '<span class="fc-missing">No user guide written yet. Run <code>lac fill --fields userGuide</code> to generate one.</span>');
    }
    if (hasVal(feature.knownLimitations)) {
      html += section('Gotchas', limitList(feature.knownLimitations));
    }
    if (hasVal(feature.knownWorkarounds)) {
      html += section('Workarounds', listItems(feature.knownWorkarounds));
    }
    if (hasVal(feature.releaseVersion)) {
      html += section('Released in', '<span class="fc-chip">'+esc(feature.releaseVersion)+'</span>');
    }
  }

  if (role.id === 'product') {
    if (hasVal(feature.pmSummary)) {
      html += section('Business value', textBlock(feature.pmSummary));
    } else if (hasVal(feature.problem)) {
      html += section('Problem', textBlock(feature.problem));
    } else {
      html += section('Business value', '<span class="fc-missing">No pmSummary written yet.</span>');
    }
    if (hasVal(feature.successCriteria)) {
      html += section('Success criteria', '<div class="fc-text" style="font-style:italic; border-left:3px solid #c4a25544; padding-left:12px">'+esc(feature.successCriteria)+'</div>');
    }
    if (hasVal(feature.acceptanceCriteria)) {
      html += section('Acceptance criteria', checkList(feature.acceptanceCriteria));
    }
    if (hasVal(feature.tags)) {
      html += section('Tags', (feature.tags).map(function(t){return '<span class="fc-chip">'+esc(t)+'</span>';}).join(''));
    }
  }

  if (role.id === 'dev') {
    if (hasVal(feature.analysis)) {
      html += section('Analysis', textBlock(feature.analysis));
    }
    if (hasVal(feature.decisions)) {
      html += section('Decisions ('+feature.decisions.length+')', decisionCards(feature.decisions));
    } else {
      html += section('Decisions', '<span class="fc-missing">No decisions documented yet.</span>');
    }
    if (hasVal(feature.implementation)) {
      html += section('Implementation', textBlock(feature.implementation));
    }
    if (hasVal(feature.componentFile)) {
      html += section('Component file', '<span class="fc-chip">📄 '+esc(feature.componentFile)+'</span>');
    }
    if (hasVal(feature.codeSnippets)) {
      html += section('Code snippets', codeSnippets(feature.codeSnippets));
    }
    if (hasVal(feature.npmPackages)) {
      html += section('npm packages', (feature.npmPackages).map(function(p){return '<span class="fc-chip">'+esc(p)+'</span>';}).join(''));
    }
    if (hasVal(feature.implementationNotes)) {
      html += section('Implementation notes', listItems(feature.implementationNotes));
    }
    if (hasVal(feature.testStrategy)) {
      html += section('Test strategy', textBlock(feature.testStrategy));
    }
    if (hasVal(feature.externalDependencies)) {
      html += section('Depends on', (feature.externalDependencies).map(function(d){return '<span class="fc-chip">'+esc(d)+'</span>';}).join(''));
    }
  }

  if (role.id === 'qa') {
    if (hasVal(feature.acceptanceCriteria)) {
      html += section('Acceptance criteria', checkList(feature.acceptanceCriteria));
    } else {
      html += section('Acceptance criteria', '<span class="fc-missing">No acceptance criteria yet. Run <code>lac fill --fields acceptanceCriteria</code>.</span>');
    }
    if (hasVal(feature.testCases)) {
      html += section('Test cases', listItems(feature.testCases));
    }
    if (hasVal(feature.edgeCases)) {
      html += section('Edge cases', listItems(feature.edgeCases));
    }
    if (hasVal(feature.testStrategy)) {
      html += section('Test strategy', textBlock(feature.testStrategy));
    } else {
      html += section('Test strategy', '<span class="fc-missing">No test strategy yet. Run <code>lac fill --fields testStrategy</code>.</span>');
    }
    if (hasVal(feature.successCriteria)) {
      html += section('Success criteria', textBlock(feature.successCriteria));
    }
    if (hasVal(feature.knownLimitations)) {
      html += section('Known bugs / limitations', limitList(feature.knownLimitations));
    }
  }

  if (role.id === 'support') {
    if (hasVal(feature.supportNotes)) {
      html += section('Support guidance', textBlock(feature.supportNotes));
    }
    if (hasVal(feature.knownLimitations)) {
      html += section('Known limitations', limitList(feature.knownLimitations));
    }
    if (hasVal(feature.knownWorkarounds)) {
      html += section('Workarounds', listItems(feature.knownWorkarounds));
    }
    if (hasVal(feature.annotations) && feature.annotations.length > 0) {
      html += section('Annotations', annotationCards(feature.annotations));
    }
    if (hasVal(feature.userGuide)) {
      html += section('User guide (reference)', textBlock(feature.userGuide));
    }
    if (!hasVal(feature.supportNotes) && !hasVal(feature.knownLimitations) && !hasVal(feature.knownWorkarounds)) {
      html += '<span class="fc-missing" style="display:block;padding:8px 0">No support-specific information documented for this feature.</span>';
    }
  }

  if (role.id === 'architect') {
    if (hasVal(feature.decisions)) {
      html += section('Decisions ('+feature.decisions.length+')', decisionCards(feature.decisions));
    } else {
      html += section('Decisions', '<span class="fc-missing">No decisions documented yet.</span>');
    }
    if (hasVal(feature.analysis)) {
      html += section('Analysis', textBlock(feature.analysis));
    }
    if (hasVal(feature.riskLevel)) {
      html += section('Risk level', riskBadge(feature.riskLevel));
    }
    if (hasVal(feature.rollbackPlan)) {
      html += section('Rollback plan', textBlock(feature.rollbackPlan));
    }
    if (hasVal(feature.implementationNotes)) {
      html += section('Implementation notes', listItems(feature.implementationNotes));
    }
    if (hasVal(feature.externalDependencies)) {
      html += section('Depends on', (feature.externalDependencies).map(function(d){return '<span class="fc-chip">'+esc(d)+'</span>';}).join(''));
    }
    if (hasVal(feature.publicInterface)) {
      html += section('Public interface', publicInterfaceTable(feature.publicInterface));
    }
  }

  if (!html) {
    html = '<span class="fc-missing">No ' + role.label.toLowerCase() + '-relevant content for this feature yet.</span>';
  }
  return html;
}

// ── Content helpers ────────────────────────────────────────────────────────
function section(label, content) {
  return '<div class="fc-section"><div class="fc-section-label">'+esc(label)+'</div>'+content+'</div>';
}
function textBlock(t) {
  return '<div class="fc-text">'+esc(t)+'</div>';
}
function listItems(arr) {
  if (!Array.isArray(arr) || !arr.length) return '';
  return '<ul class="fc-list">'+arr.map(function(i){return '<li>'+esc(i)+'</li>';}).join('')+'</ul>';
}
function checkList(arr) {
  if (!Array.isArray(arr) || !arr.length) return '';
  return '<ul class="fc-list">'+arr.map(function(i){return '<li class="check">'+esc(i)+'</li>';}).join('')+'</ul>';
}
function limitList(arr) {
  if (!Array.isArray(arr) || !arr.length) return '';
  return '<ul class="fc-list">'+arr.map(function(i){
    return '<li style="border-left:2px solid rgba(204,91,91,0.4);padding-left:10px;margin-left:2px">'+esc(i)+'</li>';
  }).join('')+'</ul>';
}
function decisionCards(arr) {
  if (!Array.isArray(arr) || !arr.length) return '';
  return arr.map(function(d){
    return '<div class="decision-card">'+
      '<div class="decision-q">'+esc(d.decision||'')+'</div>'+
      '<div class="decision-r">'+esc(d.rationale||'')+'</div>'+
      (d.alternativesConsidered && d.alternativesConsidered.length ? '<div class="decision-r" style="margin-top:4px;color:#736455">Alt: '+d.alternativesConsidered.map(esc).join(', ')+'</div>' : '')+
      '</div>';
  }).join('');
}
function annotationCards(arr) {
  var TYPE_COLORS = {'tech-debt':'#cc5b5b','warning':'#c4a255','lesson':'#4aad72','breaking-change':'#cc5b5b'};
  return arr.map(function(a){
    var col = TYPE_COLORS[a.type] || '#736455';
    return '<div class="annotation-card" style="border-left-color:'+col+'">'+
      '<div class="annotation-type" style="color:'+col+'">'+esc(a.type)+'</div>'+
      '<div class="annotation-body">'+esc(a.body)+'</div>'+
      '</div>';
  }).join('');
}
function codeSnippets(arr) {
  if (!Array.isArray(arr) || !arr.length) return '';
  return arr.map(function(s){
    return '<div class="code-snippet">'+
      '<div class="code-label">'+esc(s.label||'')+'</div>'+
      '<div class="code-block">'+esc(s.snippet||'')+'</div>'+
      '</div>';
  }).join('');
}
function publicInterfaceTable(arr) {
  if (!Array.isArray(arr) || !arr.length) return '';
  return arr.map(function(e){
    return '<div class="decision-card">'+
      '<div class="decision-q" style="font-family:monospace;font-size:12px">'+esc(e.name||'')+'</div>'+
      '<div class="decision-r" style="font-family:monospace;color:#5b82cc">'+esc(e.type||'')+'</div>'+
      (e.description ? '<div class="decision-r" style="margin-top:4px">'+esc(e.description)+'</div>' : '')+
      '</div>';
  }).join('');
}

// ── Feature list ────────────────────────────────────────────────────────────
function filterFeatures() {
  var q = searchQuery.toLowerCase();
  if (!q) return FEATURES;
  return FEATURES.filter(function(f) {
    var haystack = [f.title, f.domain, f.featureKey, ...(f.tags||[])].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

function renderFeatureList(role) {
  var list = document.getElementById('feature-list');
  var features = filterFeatures();
  if (!features.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">No features match your search</div></div>';
    return;
  }

  var hasAnyContent = features.some(function(f) {
    return role.fields.some(function(field) { return hasVal(f[field]); });
  });

  if (!hasAnyContent) {
    var roleEx = role.required.length > 0 ? role.required[0] : role.fields[0];
    list.innerHTML = '<div class="empty-state">'+
      '<div class="empty-icon">'+role.icon+'</div>'+
      '<div class="empty-title">No '+esc(role.label)+' content yet</div>'+
      '<div class="empty-desc">Run <code>lac fill --fields '+esc(roleEx)+'</code> to start populating this view.</div>'+
      '</div>';
    return;
  }

  list.innerHTML = features.map(function(f, i) {
    var role_obj = ROLES.find(function(r){return r.id===role.id;});
    var gaps = role_obj.required.filter(function(r){ return !hasVal(f[r]); });
    var domainCol = domainColor(f.domain);
    var statusCls = 'badge-status-'+(f.status||'draft');

    var html = '<div class="feature-card" id="fc-'+i+'" style="--role-color:'+role_obj.color+'" onclick="toggleCard('+i+')">';
    html += '<div class="fc-header">';
    html += '<div class="fc-meta">';
    html += '<div class="fc-title">'+esc(f.title)+'</div>';
    html += '<div class="fc-badges">';
    html += domainBadge(f.domain);
    html += statusBadge(f.status);
    if (f.riskLevel) html += riskBadge(f.riskLevel);
    if (f.priority)  html += priorityBadge(f.priority);
    html += '</div>';
    if (gaps.length > 0) {
      html += '<div class="fc-gap">⚠ Missing: '+gaps.map(esc).join(', ')+'</div>';
    }
    html += '</div>';
    html += '<div class="fc-expand-arrow">▾</div>';
    html += '</div>';
    html += '<div class="fc-content">'+renderRoleContent(f, role_obj)+'</div>';
    html += '</div>';
    return html;
  }).join('');
}

function toggleCard(i) {
  var card = document.getElementById('fc-'+i);
  if (card) card.classList.toggle('expanded');
}

// ── Compare mode ────────────────────────────────────────────────────────────
function renderCompare() {
  var sel = document.getElementById('compare-select');
  var key = sel ? sel.value : (FEATURES.length > 0 ? FEATURES[0].featureKey : '');
  var feature = FEATURES.find(function(f){ return f.featureKey === key; });
  if (!feature) return;

  var grid = document.getElementById('compare-grid');
  grid.innerHTML = ROLES.map(function(role) {
    var complete = role.required.length === 0 || role.required.every(function(r){ return hasVal(feature[r]); });
    var completePct = role.required.length === 0 ? 100 :
      Math.round(role.required.filter(function(r){ return hasVal(feature[r]); }).length / role.required.length * 100);
    var fillColor = completePct >= 100 ? '#4aad72' : completePct >= 50 ? '#c4a255' : '#cc5b5b';

    return '<div class="compare-panel">'+
      '<div class="compare-completeness-bar"><div class="compare-completeness-fill" style="width:'+completePct+'%;background:'+fillColor+'"></div></div>'+
      '<div class="compare-panel-header" style="border-bottom-color:'+role.color+'22">'+
        '<span class="compare-panel-icon">'+role.icon+'</span>'+
        '<span class="compare-panel-label" style="color:'+role.color+'">'+esc(role.label)+'</span>'+
        (complete ? '' : '<span style="font-size:10px;color:#cc5b5b;font-family:monospace">gaps</span>')+
      '</div>'+
      '<div class="compare-panel-body">'+renderRoleContent(feature, role)+'</div>'+
      '</div>';
  }).join('');
}

// ── State setters ────────────────────────────────────────────────────────────
window.setRole = function(roleId) {
  activeRole = roleId;
  compareMode = false;
  document.getElementById('compare-area').style.display = 'none';
  document.getElementById('role-header-area').style.display = '';
  document.getElementById('feature-list').style.display = '';
  document.getElementById('search-input').parentElement.style.display = '';
  document.getElementById('compare-btn').classList.remove('active');
  var role = ROLES.find(function(r){ return r.id === roleId; });
  document.getElementById('topbar-role-label').textContent = role.icon + ' ' + role.label;
  renderSidebar();
  renderRoleHeader(role);
  renderFeatureList(role);
};

window.toggleCompare = function() {
  compareMode = !compareMode;
  document.getElementById('compare-area').style.display = compareMode ? 'flex' : 'none';
  document.getElementById('role-header-area').style.display = compareMode ? 'none' : '';
  document.getElementById('feature-list').style.display = compareMode ? 'none' : '';
  document.getElementById('search-input').parentElement.style.display = compareMode ? 'none' : '';
  document.getElementById('compare-btn').classList.toggle('active', compareMode);
  if (compareMode) {
    document.getElementById('topbar-role-label').textContent = '🔀 Compare All';
    renderSidebar();
    renderCompare();
  } else {
    setRole(activeRole);
  }
};

window.onSearch = function(q) {
  searchQuery = q;
  if (!compareMode) {
    var role = ROLES.find(function(r){ return r.id === activeRole; });
    renderFeatureList(role);
  }
};

window.renderCompare = renderCompare;

// ── Init ────────────────────────────────────────────────────────────────────
setRole('user');

})();
</script>
</body>
</html>`;
}

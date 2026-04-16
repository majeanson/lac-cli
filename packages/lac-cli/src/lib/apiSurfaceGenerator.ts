import type { Feature } from '@life-as-code/feature-schema'

interface ApiEntry {
  name: string
  type: string
  description: string
  featureKey: string
  featureTitle: string
  featureDomain: string
  componentFile?: string
}

/**
 * generateApiSurface — aggregates all publicInterface[] entries across the workspace.
 *
 * Groups by interface type (React Components, Hooks, Contexts, Services, Functions, Other).
 * Full-text search. Each entry links back to the feature wiki.
 *
 * Output: lac-api-surface.html
 */
export function generateApiSurface(features: Feature[], projectName: string): string {
  function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  // Collect all entries
  const entries: ApiEntry[] = []
  for (const f of features) {
    const iface = (f as Record<string, unknown>)['publicInterface'] as Array<{ name: string; type: string; description?: string }> | undefined
    if (!iface || iface.length === 0) continue
    for (const e of iface) {
      entries.push({
        name: e.name,
        type: e.type,
        description: e.description ?? '',
        featureKey: f.featureKey,
        featureTitle: f.title,
        featureDomain: f.domain ?? 'misc',
        componentFile: typeof (f as Record<string, unknown>)['componentFile'] === 'string'
          ? (f as Record<string, unknown>)['componentFile'] as string
          : undefined,
      })
    }
  }

  // Classify by type
  function classifyType(t: string): string {
    const lower = t.toLowerCase()
    if (lower.includes('react component') || lower.includes('component') || lower.includes('view') || lower.includes('screen')) return 'Components'
    if (lower.includes('hook') || lower.startsWith('use')) return 'Hooks'
    if (lower.includes('context') || lower.includes('provider')) return 'Contexts'
    if (lower.includes('service') || lower.includes('class') || lower.includes('manager')) return 'Services'
    if (lower.includes('function') || lower.includes('util') || lower.includes('helper')) return 'Functions'
    if (lower.includes('type') || lower.includes('interface') || lower.includes('enum')) return 'Types'
    return 'Other'
  }

  const groupOrder = ['Components', 'Hooks', 'Contexts', 'Services', 'Functions', 'Types', 'Other']
  const groups = new Map<string, ApiEntry[]>()
  for (const e of entries) {
    const g = classifyType(e.type)
    const list = groups.get(g) ?? []
    list.push(e)
    groups.set(g, list)
  }
  const presentGroups = groupOrder.filter(g => groups.has(g))

  const groupIcons: Record<string, string> = {
    Components: '🧩', Hooks: '🪝', Contexts: '🔗', Services: '⚙️', Functions: '𝑓', Types: '📐', Other: '◻️',
  }

  const navHtml = presentGroups.map(g =>
    `<a class="nav-item" data-group="${esc(g)}" href="#group-${esc(g)}">${groupIcons[g] ?? ''} ${esc(g)} <span class="nav-count">${groups.get(g)!.length}</span></a>`
  ).join('\n')

  function renderEntry(e: ApiEntry): string {
    return `<div class="api-entry" data-search="${esc(`${e.name} ${e.type} ${e.description} ${e.featureTitle} ${e.featureDomain}`).toLowerCase()}">
      <div class="entry-top">
        <div class="entry-name"><code class="entry-code">${esc(e.name)}</code></div>
        <div class="entry-type">${esc(e.type)}</div>
      </div>
      ${e.description ? `<div class="entry-desc">${esc(e.description)}</div>` : ''}
      <div class="entry-source">
        <a class="entry-feature-link" href="./lac-wiki.html#${esc(e.featureKey)}">${esc(e.featureTitle)}</a>
        <span class="entry-domain">${esc(e.featureDomain.replace(/-/g, ' '))}</span>
        ${e.componentFile ? `<span class="entry-file">${esc(e.componentFile.split(',')[0]?.trim() ?? '')}</span>` : ''}
      </div>
    </div>`
  }

  const groupSectionsHtml = presentGroups.map(g =>
    `<section id="group-${esc(g)}" class="group-section">
      <div class="group-header">
        <span class="group-icon">${groupIcons[g] ?? ''}</span>
        <span class="group-title">${esc(g)}</span>
        <span class="group-count">${groups.get(g)!.length}</span>
      </div>
      <div class="entries-list">
        ${groups.get(g)!.map(renderEntry).join('')}
      </div>
    </section>`
  ).join('')

  const searchData = JSON.stringify(entries.map(e => ({
    name: e.name, type: e.type, description: e.description,
    featureTitle: e.featureTitle, featureDomain: e.featureDomain, featureKey: e.featureKey,
    group: classifyType(e.type),
  })))

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)} — API Surface</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0f0d0b; --bg-sidebar: #0b0a08; --bg-card: #181512; --bg-hover: #1e1a16; --bg-active: #231e17;
  --border: #262018; --border-soft: #1e1a14; --text: #ece3d8; --text-mid: #b0a494; --text-soft: #736455;
  --accent: #c4a255; --mono: 'Cascadia Code','Fira Code','Consolas',monospace; --sans: -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
}
html { scroll-behavior: smooth; }
body { background: var(--bg); color: var(--text); font-family: var(--sans); font-size: 14px; line-height: 1.6; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
.shell { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
.topbar { flex-shrink: 0; height: 46px; display: flex; align-items: center; gap: 14px; padding: 0 20px; background: var(--bg-sidebar); border-bottom: 1px solid var(--border); }
.topbar-brand { font-family: var(--mono); font-size: 13px; color: var(--accent); letter-spacing: 0.05em; }
.topbar-sep { color: var(--border); font-size: 18px; }
.topbar-title { font-size: 13px; color: var(--text-mid); }
.topbar-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.topbar-count { font-family: var(--mono); font-size: 11px; color: var(--text-soft); }
.search-wrap { position: relative; }
#gsearch { background: var(--bg-card); border: 1px solid var(--border); border-radius: 5px; padding: 5px 10px 5px 28px; font-family: var(--mono); font-size: 11px; color: var(--text); outline: none; width: 180px; transition: border-color 0.15s, width 0.2s; }
#gsearch:focus { border-color: var(--accent); width: 240px; }
#gsearch::placeholder { color: var(--text-soft); }
.search-icon { position: absolute; left: 8px; top: 50%; transform: translateY(-50%); color: var(--text-soft); pointer-events: none; }
.body-row { display: flex; flex: 1; min-height: 0; }
.sidebar { width: 200px; flex-shrink: 0; background: var(--bg-sidebar); border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
.sidebar-header { padding: 14px 16px 10px; border-bottom: 1px solid var(--border); }
.sidebar-label { font-family: var(--mono); font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-soft); }
.nav-tree { flex: 1; overflow-y: auto; padding: 8px 0; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
.nav-item { display: flex; align-items: center; justify-content: space-between; padding: 7px 14px; font-size: 12px; color: var(--text-mid); cursor: pointer; text-decoration: none; border-left: 2px solid transparent; transition: background 0.1s; gap: 6px; }
.nav-item:hover { background: var(--bg-hover); color: var(--text); }
.nav-item.active { background: var(--bg-active); border-left-color: var(--accent); color: var(--text); }
.nav-count { font-family: var(--mono); font-size: 10px; color: var(--text-soft); background: var(--bg-card); padding: 1px 5px; border-radius: 999px; border: 1px solid var(--border); margin-left: auto; }
.content { flex: 1; min-width: 0; overflow-y: auto; padding: 32px 40px 80px; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
.group-section { margin-bottom: 48px; max-width: 800px; }
.group-section.hidden { display: none; }
.group-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
.group-icon { font-size: 16px; }
.group-title { font-family: var(--mono); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text); }
.group-count { font-family: var(--mono); font-size: 10px; color: var(--text-soft); margin-left: auto; }
.entries-list { display: flex; flex-direction: column; gap: 8px; }
.api-entry { background: var(--bg-card); border: 1px solid var(--border); border-radius: 7px; padding: 14px 18px; transition: border-color 0.15s; }
.api-entry:hover { border-color: var(--text-soft); }
.api-entry.filtered-out { display: none; }
.entry-top { display: flex; align-items: baseline; gap: 12px; margin-bottom: 6px; }
.entry-name { flex-shrink: 0; }
.entry-code { font-family: var(--mono); font-size: 13px; color: var(--accent); background: transparent; }
.entry-type { font-family: var(--mono); font-size: 10px; color: var(--text-soft); padding: 1px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 3px; }
.entry-desc { font-size: 12px; color: var(--text-mid); line-height: 1.6; margin-bottom: 8px; }
.entry-source { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.entry-feature-link { font-family: var(--mono); font-size: 10px; color: var(--accent); text-decoration: none; opacity: 0.7; }
.entry-feature-link:hover { opacity: 1; text-decoration: underline; }
.entry-domain { font-family: var(--mono); font-size: 10px; color: var(--text-soft); padding: 1px 7px; background: var(--bg); border: 1px solid var(--border); border-radius: 999px; }
.entry-file { font-family: var(--mono); font-size: 10px; color: var(--text-soft); }
.empty-state { text-align: center; padding: 60px 40px; color: var(--text-soft); }
#no-results { display: none; padding: 40px; text-align: center; color: var(--text-soft); font-size: 13px; }
</style>
</head>
<body>
<div class="shell">
  <div class="topbar">
    <span class="topbar-brand">lac·api-surface</span>
    <span class="topbar-sep">/</span>
    <span class="topbar-title">${esc(projectName)}</span>
    <div class="topbar-right">
      <span class="topbar-count">${entries.length} exports</span>
      <div class="search-wrap">
        <svg class="search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="gsearch" placeholder="Search API…" autocomplete="off" spellcheck="false">
      </div>
    </div>
  </div>
  <div class="body-row">
    <div class="sidebar">
      <div class="sidebar-header"><div class="sidebar-label">By Type</div></div>
      <nav class="nav-tree">
        <a class="nav-item active" data-group="all" href="#">All <span class="nav-count">${entries.length}</span></a>
        ${navHtml}
      </nav>
    </div>
    <main class="content" id="content">
      ${entries.length === 0
        ? `<div class="empty-state">No publicInterface entries found. Add publicInterface[] to your feature.jsons.</div>`
        : groupSectionsHtml}
      <div id="no-results">No matches found.</div>
    </main>
  </div>
</div>
<script>
const SEARCH_DATA = ${searchData};
const gsearch = document.getElementById('gsearch');
function filterEntries(q) {
  const lower = q.toLowerCase().trim();
  let anyVisible = false;
  document.querySelectorAll('.api-entry').forEach(el => {
    const searchStr = el.dataset.search ?? '';
    const match = !lower || searchStr.includes(lower);
    el.classList.toggle('filtered-out', !match);
    if (match) anyVisible = true;
  });
  document.getElementById('no-results').style.display = (lower && !anyVisible) ? 'block' : 'none';
}
gsearch.addEventListener('input', () => filterEntries(gsearch.value));
document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    const group = el.dataset.group;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
    if (group === 'all') {
      document.querySelectorAll('.group-section').forEach(s => s.classList.remove('hidden'));
    } else {
      document.querySelectorAll('.group-section').forEach(s => {
        s.classList.toggle('hidden', s.id !== 'group-' + group);
      });
      const target = document.getElementById('group-' + group);
      if (target) { document.getElementById('content').scrollTop = target.offsetTop - 20; }
    }
  });
});
</script>
</body>
</html>`
}

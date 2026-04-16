import type { Feature } from '@life-as-code/feature-schema'

interface RevisionEntry {
  date: string
  author: string
  fields_changed: string[]
  reason: string
  featureKey: string
  featureTitle: string
  featureDomain: string
  featureStatus: string
}

/**
 * generateChangelog — aggregates all revision[] entries across the workspace,
 * sorts by date descending, groups by month, and renders a structured HTML changelog.
 *
 * Output: lac-changelog.html
 */
export function generateChangelog(features: Feature[], projectName: string, since?: string): string {
  function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  // Collect all revision entries
  const entries: RevisionEntry[] = []
  for (const f of features) {
    const revisions = (f as Record<string, unknown>)['revisions'] as Array<{
      date: string; author: string; fields_changed: string[]; reason: string
    }> | undefined
    if (!revisions) continue
    for (const r of revisions) {
      if (since && r.date < since) continue
      entries.push({
        date: r.date,
        author: r.author,
        fields_changed: r.fields_changed,
        reason: r.reason,
        featureKey: f.featureKey,
        featureTitle: f.title,
        featureDomain: f.domain ?? 'misc',
        featureStatus: f.status,
      })
    }
  }

  // Sort by date descending
  entries.sort((a, b) => b.date.localeCompare(a.date))

  // Group by YYYY-MM
  const byMonth = new Map<string, RevisionEntry[]>()
  for (const e of entries) {
    const month = e.date.slice(0, 7) // YYYY-MM
    const group = byMonth.get(month) ?? []
    group.push(e)
    byMonth.set(month, group)
  }

  const months = [...byMonth.keys()].sort((a, b) => b.localeCompare(a))

  function monthLabel(ym: string): string {
    const [y, m] = ym.split('-')
    const d = new Date(Number(y), Number(m) - 1, 1)
    return d.toLocaleString('en-US', { month: 'long', year: 'numeric' })
  }

  function statusColor(s: string): string {
    return s === 'frozen' ? 'var(--status-frozen)' : s === 'active' ? 'var(--status-active)' : s === 'draft' ? 'var(--status-draft)' : 'var(--status-deprecated)'
  }

  const navHtml = months.map((m, i) =>
    `<a class="nav-item${i === 0 ? ' active' : ''}" data-month="${esc(m)}" href="#${esc(m)}">${esc(monthLabel(m))} <span class="nav-count">${byMonth.get(m)!.length}</span></a>`
  ).join('\n')

  const sectionsHtml = months.map((m, i) => {
    const revs = byMonth.get(m)!
    const items = revs.map(r => `
      <div class="rev-card">
        <div class="rev-card-top">
          <div class="rev-feature">
            <span class="rev-key">${esc(r.featureKey)}</span>
            <span class="rev-title">${esc(r.featureTitle)}</span>
            <span class="rev-domain">${esc(r.featureDomain.replace(/-/g, ' '))}</span>
            <span class="rev-status" style="color:${statusColor(r.featureStatus)}">${esc(r.featureStatus)}</span>
          </div>
          <div class="rev-meta">
            <span class="rev-date">${esc(r.date)}</span>
            <span class="rev-author">${esc(r.author)}</span>
          </div>
        </div>
        <div class="rev-reason">${esc(r.reason)}</div>
        <div class="rev-fields">${r.fields_changed.map(f => `<span class="rev-field">${esc(f)}</span>`).join('')}</div>
      </div>`).join('')
    return `<section id="${esc(m)}" class="month-section${i > 0 ? ' hidden' : ''}">
      <div class="month-header">
        <div class="month-title">${esc(monthLabel(m))}</div>
        <div class="month-count">${revs.length} change${revs.length !== 1 ? 's' : ''}</div>
      </div>
      ${items}
    </section>`
  }).join('\n')

  const sinceNote = since ? ` · since ${since}` : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)} — Changelog</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0f0d0b; --bg-sidebar: #0b0a08; --bg-card: #181512; --bg-hover: #1e1a16; --bg-active: #231e17;
  --border: #262018; --border-soft: #1e1a14; --text: #ece3d8; --text-mid: #b0a494; --text-soft: #736455;
  --accent: #c4a255; --mono: 'Cascadia Code','Fira Code','Consolas',monospace; --sans: -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  --status-frozen: #5b82cc; --status-active: #4aad72; --status-draft: #c4a255; --status-deprecated: #cc5b5b;
}
html { scroll-behavior: smooth; }
body { background: var(--bg); color: var(--text); font-family: var(--sans); font-size: 14px; line-height: 1.6; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
.shell { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
.topbar { flex-shrink: 0; height: 46px; display: flex; align-items: center; gap: 14px; padding: 0 20px; background: var(--bg-sidebar); border-bottom: 1px solid var(--border); }
.topbar-brand { font-family: var(--mono); font-size: 13px; color: var(--accent); letter-spacing: 0.05em; }
.topbar-sep { color: var(--border); font-size: 18px; }
.topbar-title { font-size: 13px; color: var(--text-mid); }
.topbar-meta { margin-left: auto; font-family: var(--mono); font-size: 11px; color: var(--text-soft); }
.body-row { display: flex; flex: 1; min-height: 0; }
.sidebar { width: 220px; flex-shrink: 0; background: var(--bg-sidebar); border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
.sidebar-header { padding: 14px 16px 10px; border-bottom: 1px solid var(--border); }
.sidebar-label { font-family: var(--mono); font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-soft); }
.nav-tree { flex: 1; overflow-y: auto; padding: 8px 0 32px; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
.nav-item { display: flex; align-items: center; justify-content: space-between; padding: 7px 14px; font-size: 12px; color: var(--text-mid); cursor: pointer; text-decoration: none; border-left: 2px solid transparent; transition: background 0.1s; }
.nav-item:hover { background: var(--bg-hover); color: var(--text); }
.nav-item.active { background: var(--bg-active); border-left-color: var(--accent); color: var(--text); }
.nav-count { font-family: var(--mono); font-size: 10px; color: var(--text-soft); background: var(--bg-card); padding: 1px 6px; border-radius: 999px; border: 1px solid var(--border); }
.content { flex: 1; min-width: 0; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
.month-section { max-width: 760px; margin: 0 auto; padding: 40px 40px 80px; }
.month-section.hidden { display: none; }
.month-header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 28px; padding-bottom: 14px; border-bottom: 1px solid var(--border); }
.month-title { font-size: 22px; font-weight: 800; color: var(--text); letter-spacing: -0.01em; }
.month-count { font-family: var(--mono); font-size: 11px; color: var(--text-soft); }
.rev-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 16px 20px; margin-bottom: 12px; }
.rev-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 10px; }
.rev-feature { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rev-key { font-family: var(--mono); font-size: 10px; color: var(--text-soft); }
.rev-title { font-size: 13px; font-weight: 600; color: var(--text); }
.rev-domain { font-family: var(--mono); font-size: 10px; color: var(--text-soft); padding: 1px 7px; background: var(--bg); border: 1px solid var(--border); border-radius: 999px; }
.rev-status { font-family: var(--mono); font-size: 10px; }
.rev-meta { text-align: right; flex-shrink: 0; }
.rev-date { font-family: var(--mono); font-size: 11px; color: var(--text-soft); display: block; }
.rev-author { font-family: var(--mono); font-size: 10px; color: var(--accent); }
.rev-reason { font-size: 13px; color: var(--text-mid); line-height: 1.65; margin-bottom: 10px; }
.rev-fields { display: flex; gap: 6px; flex-wrap: wrap; }
.rev-field { font-family: var(--mono); font-size: 10px; color: var(--text-soft); background: var(--bg); border: 1px solid var(--border); border-radius: 3px; padding: 1px 7px; }
.empty-state { text-align: center; padding: 80px 40px; color: var(--text-soft); }
.empty-title { font-size: 18px; color: var(--text-mid); margin-bottom: 8px; }
</style>
</head>
<body>
<div class="shell">
  <div class="topbar">
    <span class="topbar-brand">lac·changelog</span>
    <span class="topbar-sep">/</span>
    <span class="topbar-title">${esc(projectName)}</span>
    <span class="topbar-meta">${entries.length} revision${entries.length !== 1 ? 's' : ''}${sinceNote}</span>
  </div>
  <div class="body-row">
    <div class="sidebar">
      <div class="sidebar-header"><div class="sidebar-label">By Month</div></div>
      <nav class="nav-tree">${navHtml}</nav>
    </div>
    <main class="content" id="content">
      ${entries.length === 0
        ? `<div class="empty-state"><div class="empty-title">No revisions found</div><p>Add revision entries to your feature.jsons${since ? ` after ${since}` : ''}.</p></div>`
        : sectionsHtml}
    </main>
  </div>
</div>
<script>
function showMonth(month) {
  document.querySelectorAll('.month-section').forEach(s => s.classList.add('hidden'))
  const sec = document.getElementById(month)
  if (sec) { sec.classList.remove('hidden'); document.getElementById('content').scrollTop = 0 }
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.month === month))
  history.replaceState(null, '', '#' + month)
}
document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', e => { e.preventDefault(); showMonth(el.dataset.month) })
})
const hash = window.location.hash.slice(1)
if (hash && document.getElementById(hash)) showMonth(hash)
</script>
</body>
</html>`
}

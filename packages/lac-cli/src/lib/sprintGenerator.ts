import type { Feature } from '@life-as-code/feature-schema'

/**
 * generateSprint — compact sprint planning view.
 *
 * Shows draft + active features sorted by priority.
 * Summary density: title, status badge, priority, problem (first sentence), successCriteria, tags.
 * Designed to be scannable in a standup or sprint planning meeting.
 *
 * Output: lac-sprint.html
 */
export function generateSprint(features: Feature[], projectName: string): string {
  function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  // Sort by priority (ascending), then by status (active first)
  const sorted = [...features].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1
    return ((a.priority ?? 99) - (b.priority ?? 99))
  })

  const activeCount = sorted.filter(f => f.status === 'active').length
  const draftCount = sorted.filter(f => f.status === 'draft').length
  const domains = [...new Set(sorted.map(f => f.domain).filter(Boolean))] as string[]

  function priorityLabel(p?: number): string {
    if (!p) return ''
    const colors: Record<number, string> = { 1: '#cc5b5b', 2: '#e8674a', 3: '#c4a255', 4: '#4aad72', 5: '#5b82cc' }
    const color = colors[p] ?? '#736455'
    return `<span class="priority-badge" style="background:${color}20;color:${color};border-color:${color}40">P${p}</span>`
  }

  function firstSentence(s: string): string {
    const match = s.match(/^[^.!?]+[.!?]/)
    return match ? match[0]! : (s.length > 120 ? s.slice(0, 120) + '…' : s)
  }

  const activeFeatures = sorted.filter(f => f.status === 'active')
  const draftFeatures = sorted.filter(f => f.status === 'draft')

  function renderCard(f: Feature): string {
    const tags = (f.tags ?? []).slice(0, 4).map(t => `<span class="tag">${esc(t)}</span>`).join('')
    const successCriteria = f.successCriteria ?? ''
    const domain = f.domain ?? ''

    return `<div class="sprint-card">
      <div class="card-top">
        <div class="card-header">
          ${f.priority ? priorityLabel(f.priority) : ''}
          <span class="status-dot ${esc(f.status)}"></span>
          <span class="card-key">${esc(f.featureKey)}</span>
        </div>
        <div class="card-title">${esc(f.title)}</div>
        ${domain ? `<div class="card-domain">${esc(domain.replace(/-/g, ' '))}</div>` : ''}
      </div>
      <div class="card-problem">${esc(firstSentence(f.problem))}</div>
      ${successCriteria ? `<div class="card-criteria"><span class="criteria-label">Done when:</span> ${esc(firstSentence(successCriteria))}</div>` : ''}
      ${tags ? `<div class="card-tags">${tags}</div>` : ''}
    </div>`
  }

  function renderGroup(title: string, groupFeatures: Feature[], statusClass: string): string {
    if (groupFeatures.length === 0) return ''
    return `<section class="group-section">
      <div class="group-header">
        <div class="group-dot ${statusClass}"></div>
        <div class="group-title">${esc(title)}</div>
        <div class="group-count">${groupFeatures.length}</div>
      </div>
      <div class="cards-grid">
        ${groupFeatures.map(renderCard).join('')}
      </div>
    </section>`
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)} — Sprint Board</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0f0d0b; --bg-card: #181512; --bg-hover: #1e1a16; --border: #262018; --text: #ece3d8; --text-mid: #b0a494; --text-soft: #736455;
  --accent: #c4a255; --mono: 'Cascadia Code','Fira Code','Consolas',monospace; --sans: -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  --active: #4aad72; --draft: #c4a255;
}
html { scroll-behavior: smooth; }
body { background: var(--bg); color: var(--text); font-family: var(--sans); font-size: 14px; line-height: 1.6; }
.topbar { height: 46px; display: flex; align-items: center; gap: 14px; padding: 0 24px; background: #0b0a08; border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 10; }
.topbar-brand { font-family: var(--mono); font-size: 13px; color: var(--accent); letter-spacing: 0.05em; }
.topbar-sep { color: var(--border); font-size: 18px; }
.topbar-title { font-size: 13px; color: var(--text-mid); }
.topbar-stats { margin-left: auto; display: flex; gap: 16px; }
.stat { font-family: var(--mono); font-size: 11px; color: var(--text-soft); }
.stat strong { color: var(--text-mid); }
.main { max-width: 1100px; margin: 0 auto; padding: 40px 32px 80px; }
.page-title { font-size: 26px; font-weight: 800; color: var(--text); letter-spacing: -0.015em; margin-bottom: 4px; }
.page-sub { font-size: 13px; color: var(--text-soft); margin-bottom: 40px; }
.group-section { margin-bottom: 48px; }
.group-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
.group-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.group-dot.active { background: var(--active); }
.group-dot.draft  { background: var(--draft); }
.group-title { font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text); }
.group-count { font-family: var(--mono); font-size: 10px; color: var(--text-soft); margin-left: auto; }
.cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
.sprint-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 16px 18px; transition: border-color 0.15s; }
.sprint-card:hover { border-color: var(--text-soft); }
.card-top { margin-bottom: 10px; }
.card-header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.status-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.status-dot.active { background: var(--active); }
.status-dot.draft  { background: var(--draft); }
.card-key { font-family: var(--mono); font-size: 10px; color: var(--text-soft); }
.priority-badge { font-family: var(--mono); font-size: 9px; padding: 1px 6px; border-radius: 3px; border: 1px solid; letter-spacing: 0.05em; }
.card-title { font-size: 13px; font-weight: 700; color: var(--text); line-height: 1.35; }
.card-domain { font-family: var(--mono); font-size: 10px; color: var(--text-soft); margin-top: 3px; }
.card-problem { font-size: 12px; color: var(--text-mid); line-height: 1.6; margin-bottom: 8px; }
.card-criteria { font-size: 11px; color: var(--text-soft); line-height: 1.5; margin-bottom: 8px; }
.criteria-label { font-family: var(--mono); font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-soft); }
.card-tags { display: flex; gap: 4px; flex-wrap: wrap; }
.tag { font-family: var(--mono); font-size: 9px; color: var(--text-soft); background: var(--bg); border: 1px solid var(--border); border-radius: 999px; padding: 1px 7px; }
.empty-state { text-align: center; padding: 80px 40px; color: var(--text-soft); }
</style>
</head>
<body>
<div class="topbar">
  <span class="topbar-brand">lac·sprint</span>
  <span class="topbar-sep">/</span>
  <span class="topbar-title">${esc(projectName)}</span>
  <div class="topbar-stats">
    <span class="stat"><strong>${activeCount}</strong> active</span>
    <span class="stat"><strong>${draftCount}</strong> draft</span>
    <span class="stat"><strong>${domains.length}</strong> domains</span>
  </div>
</div>
<main class="main">
  <div class="page-title">${esc(projectName)} — Sprint</div>
  <div class="page-sub">${sorted.length} features in flight · sorted by priority</div>
  ${sorted.length === 0
    ? `<div class="empty-state">No active or draft features found.</div>`
    : renderGroup('Active', activeFeatures, 'active') + renderGroup('Draft', draftFeatures, 'draft')}
</main>
</body>
</html>`
}

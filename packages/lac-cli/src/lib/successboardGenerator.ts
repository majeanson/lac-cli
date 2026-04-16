/**
 * successboardGenerator — Success Criteria Board
 *
 * Three-column layout (Achieved | In Progress | Planned) surfacing
 * successCriteria and acceptanceCriteria fields.
 *
 * Answers: "What does done look like across the product?"
 * No other generator aggregates these fields. Most useful for PM reviews,
 * sprint planning, and setting measurable goals.
 */

type Rec = Record<string, unknown>

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function first(s: unknown, chars = 160): string {
  const str = typeof s === 'string' ? s.trim() : ''
  return str.length > chars ? str.slice(0, chars - 1) + '…' : str
}

const STATUS_COLOR: Record<string, string> = {
  frozen: '#5b82cc',
  active: '#4aad72',
  draft:  '#c4a255',
  deprecated: '#664444',
}
const STATUS_LABEL: Record<string, string> = {
  frozen: '🔒 Achieved',
  active: '🟡 In Progress',
  draft:  '⚪ Planned',
  deprecated: '❌ Deprecated',
}
const COLUMN_ORDER = ['frozen', 'active', 'draft']

export function generateSuccessboard(features: Rec[], projectName: string): string {
  const hasCriteria = (f: Rec) =>
    (typeof f['successCriteria'] === 'string' && (f['successCriteria'] as string).trim().length > 0) ||
    (Array.isArray(f['acceptanceCriteria']) && (f['acceptanceCriteria'] as unknown[]).length > 0)

  const withCriteria = features.filter(hasCriteria)
  const withoutCriteria = features.filter(f => !hasCriteria(f))
  const domains = [...new Set(features.map(f => (f['domain'] as string) || 'misc'))].sort()

  // Group features with criteria by status
  const byStatus = new Map<string, Rec[]>()
  for (const status of COLUMN_ORDER) byStatus.set(status, [])
  for (const f of withCriteria) {
    const s = (f['status'] as string) || 'draft'
    if (!byStatus.has(s)) byStatus.set(s, [])
    byStatus.get(s)!.push(f)
  }

  // Progress stats
  const frozenCount = features.filter(f => f['status'] === 'frozen').length
  const criteriaPct = features.length ? Math.round(withCriteria.length / features.length * 100) : 0
  const frozenWithCriteria = withCriteria.filter(f => f['status'] === 'frozen').length

  function renderAC(f: Rec): string {
    const ac = f['acceptanceCriteria']
    if (!Array.isArray(ac) || ac.length === 0) return ''
    const isFrozen = f['status'] === 'frozen'
    return `<ul class="ac-list">` +
      (ac as unknown[]).map(item => {
        const text = typeof item === 'string' ? item : String(item)
        return `<li class="ac-item${isFrozen ? ' ac-done' : ''}">
          <span class="ac-check">${isFrozen ? '✓' : '○'}</span>
          <span class="ac-text">${esc(text)}</span>
        </li>`
      }).join('') + `</ul>`
  }

  function renderCard(f: Rec): string {
    const status = (f['status'] as string) || 'draft'
    const sc = typeof f['successCriteria'] === 'string' ? (f['successCriteria'] as string).trim() : ''
    const domain = (f['domain'] as string) || ''
    const priority = f['priority'] != null ? `P${f['priority']}` : ''
    const acHtml = renderAC(f)
    const key = (f['featureKey'] as string) || ''
    return `<div class="card" data-domain="${esc(domain)}" data-status="${esc(status)}" onclick="window.open('lac-wiki.html#${esc(key)}','_self')">
      <div class="card-header">
        ${domain ? `<span class="badge badge-domain">${esc(domain)}</span>` : ''}
        ${priority ? `<span class="badge badge-priority">${esc(priority)}</span>` : ''}
      </div>
      <div class="card-title">${esc(first(f['title'], 80))}</div>
      ${sc ? `<blockquote class="card-sc">${esc(first(sc, 200))}</blockquote>` : ''}
      ${acHtml}
      <div class="card-key">${esc(key)}</div>
    </div>`
  }

  const columnHtml = COLUMN_ORDER.map(status => {
    const colFeatures = (byStatus.get(status) ?? []).sort((a, b) =>
      ((a['priority'] as number) ?? 99) - ((b['priority'] as number) ?? 99)
    )
    const borderColor = STATUS_COLOR[status] ?? '#888'
    return `<div class="column">
      <div class="col-header" style="border-left:3px solid ${borderColor}">
        <span class="col-title">${STATUS_LABEL[status] ?? status}</span>
        <span class="col-count">${colFeatures.length}</span>
      </div>
      <div class="col-cards" id="col-${status}">
        ${colFeatures.length === 0
          ? `<div class="col-empty">No features yet</div>`
          : colFeatures.map(renderCard).join('\n')}
      </div>
    </div>`
  }).join('\n')

  // Domain filter pills
  const domainPills = domains.map(d => {
    const count = withCriteria.filter(f => f['domain'] === d).length
    return `<span class="domain-pill" data-domain="${esc(d)}" onclick="toggleDomain('${esc(d)}')">${esc(d)} <span class="pill-count">${count}</span></span>`
  }).join('')

  // Missing criteria section
  const missingCards = withoutCriteria.slice(0, 12).map(f => {
    const status = (f['status'] as string) || 'draft'
    return `<div class="missing-card" onclick="window.open('lac-wiki.html#${esc((f['featureKey'] as string) || '')}','_self')">
      <span class="missing-status" style="color:${STATUS_COLOR[status] ?? '#888'}">●</span>
      <span class="missing-title">${esc(first(f['title'], 60))}</span>
      <span class="missing-domain">${esc((f['domain'] as string) || '')}</span>
      <span class="missing-hint">+ add successCriteria</span>
    </div>`
  }).join('')

  const dataJson = JSON.stringify({
    total: features.length,
    withCriteria: withCriteria.length,
    without: withoutCriteria.length,
    frozenWithCriteria,
    criteriaPct,
  }).replace(/<\/script>/gi, '<\\/script>')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(projectName)} — Success Board</title>
<style>
:root {
  --bg: #12100e; --bg-card: #1a1714; --bg-hover: #201d1a;
  --border: #2a2724; --border-soft: #221f1c;
  --text: #e8e0d4; --text-soft: #8a7f74; --accent: #d4a853;
  --mono: 'SF Mono','Fira Code','Cascadia Code',monospace;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; background: var(--bg); color: var(--text); font-family: system-ui,-apple-system,sans-serif; }

.topbar {
  display: flex; align-items: center; gap: 10px; padding: 0 20px; height: 48px;
  background: #0e0c0a; border-bottom: 1px solid var(--border); flex-shrink: 0; font-size: 13px;
}
.topbar-logo { color: var(--accent); font-weight: 700; font-family: var(--mono); }
.topbar-sep { color: var(--border); }
.topbar-count { margin-left: auto; color: var(--text-soft); font-size: 12px; font-family: var(--mono); }

.hero {
  padding: 28px 24px 0;
  display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 20px;
}
.hero-text h1 { font-size: 22px; font-weight: 600; }
.hero-text p { font-size: 13px; color: var(--text-soft); margin-top: 4px; }

.stats-row { display: flex; gap: 16px; flex-wrap: wrap; }
.stat-card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
  padding: 14px 18px; text-align: center; min-width: 90px;
}
.stat-num { font-size: 28px; font-weight: 700; font-family: var(--mono); color: var(--accent); }
.stat-label { font-size: 11px; color: var(--text-soft); margin-top: 2px; }

.progress-bar-wrap { padding: 16px 24px 0; }
.progress-bar-label { font-size: 12px; color: var(--text-soft); margin-bottom: 6px; font-family: var(--mono); }
.progress-bar { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
.progress-fill { height: 100%; background: linear-gradient(90deg, #5b82cc, #4aad72); border-radius: 3px; transition: width .6s ease; }

.filters { padding: 16px 24px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; border-bottom: 1px solid var(--border); }
.filter-label { font-size: 11px; color: var(--text-soft); font-family: var(--mono); }
.domain-pill {
  font-size: 11px; padding: 4px 10px; border-radius: 12px; cursor: pointer;
  background: var(--bg-card); border: 1px solid var(--border); color: var(--text-soft);
  transition: all .15s; user-select: none;
}
.domain-pill:hover { border-color: var(--accent); color: var(--text); }
.domain-pill.active { background: var(--accent); color: #12100e; border-color: var(--accent); font-weight: 600; }
.pill-count { opacity: .6; }

.board { display: flex; gap: 0; flex: 1; overflow: hidden; height: calc(100vh - 260px); min-height: 400px; }
.column { flex: 1; display: flex; flex-direction: column; border-right: 1px solid var(--border); min-width: 260px; }
.column:last-child { border-right: none; }
.col-header { padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; background: var(--bg-card); border-bottom: 1px solid var(--border); flex-shrink: 0; margin: 0; padding-left: 13px; }
.col-title { font-size: 13px; font-weight: 600; }
.col-count { font-size: 12px; color: var(--text-soft); background: var(--border); border-radius: 10px; padding: 1px 8px; font-family: var(--mono); }
.col-cards { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.col-empty { padding: 24px 0; text-align: center; color: var(--text-soft); font-size: 13px; font-style: italic; }

.card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
  padding: 14px 14px 12px; cursor: pointer; transition: border-color .15s, background .15s;
}
.card:hover { border-color: var(--accent); background: var(--bg-hover); }
.card-header { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.badge { font-size: 10px; padding: 2px 8px; border-radius: 10px; font-family: var(--mono); }
.badge-domain { background: #2a2724; color: var(--text-soft); border: 1px solid var(--border); }
.badge-priority { background: #1e1b12; color: var(--accent); border: 1px solid #3a2f10; }
.card-title { font-size: 14px; font-weight: 600; line-height: 1.35; margin-bottom: 8px; }
.card-sc {
  font-size: 12px; color: var(--text-soft); font-style: italic; line-height: 1.5;
  border-left: 2px solid var(--accent); padding-left: 8px; margin: 6px 0 8px;
}
.ac-list { list-style: none; display: flex; flex-direction: column; gap: 4px; margin: 6px 0; }
.ac-item { display: flex; align-items: flex-start; gap: 6px; font-size: 12px; }
.ac-check { color: var(--text-soft); flex-shrink: 0; font-size: 11px; margin-top: 1px; font-family: var(--mono); }
.ac-done .ac-check { color: #4aad72; }
.ac-text { color: var(--text-soft); line-height: 1.4; }
.ac-done .ac-text { color: var(--text); text-decoration: line-through; opacity: .6; }
.card-key { font-size: 10px; font-family: var(--mono); color: #4a4540; margin-top: 8px; }

.missing-section { padding: 20px 24px; border-top: 1px solid var(--border); }
.missing-title { font-size: 13px; font-weight: 600; color: var(--text-soft); margin-bottom: 12px; }
.missing-grid { display: flex; flex-direction: column; gap: 6px; }
.missing-card {
  display: flex; align-items: center; gap: 10px; padding: 8px 12px;
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px;
  cursor: pointer; font-size: 12px; transition: border-color .15s;
}
.missing-card:hover { border-color: var(--accent); }
.missing-status { flex-shrink: 0; }
.missing-title-text, .missing-title { flex: 1; }
.missing-domain { color: var(--text-soft); font-family: var(--mono); font-size: 10px; }
.missing-hint { color: #4aad72; font-size: 10px; opacity: .6; }
</style>
</head>
<body>
<div class="topbar">
  <span class="topbar-logo">◈ lac</span>
  <span class="topbar-sep">|</span>
  <span class="topbar-project">${esc(projectName)} — Success Board</span>
  <span class="topbar-count">${withCriteria.length}/${features.length} features have criteria</span>
</div>

<div class="hero">
  <div class="hero-text">
    <h1>What does "done" look like?</h1>
    <p>Success criteria and acceptance criteria — organized by delivery status</p>
  </div>
  <div class="stats-row">
    <div class="stat-card">
      <div class="stat-num">${frozenWithCriteria}</div>
      <div class="stat-label">criteria met</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${withCriteria.filter(f => f['status'] === 'active').length}</div>
      <div class="stat-label">in progress</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${criteriaPct}%</div>
      <div class="stat-label">coverage</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${frozenCount}</div>
      <div class="stat-label">shipped total</div>
    </div>
  </div>
</div>

<div class="progress-bar-wrap">
  <div class="progress-bar-label">${criteriaPct}% of features have defined success criteria</div>
  <div class="progress-bar"><div class="progress-fill" style="width:${criteriaPct}%"></div></div>
</div>

<div class="filters">
  <span class="filter-label">Domain:</span>
  <span class="domain-pill active" data-domain="__all__" onclick="toggleDomain('__all__')">All <span class="pill-count">${withCriteria.length}</span></span>
  ${domainPills}
</div>

<div class="board">
  ${columnHtml}
</div>

${withoutCriteria.length > 0 ? `
<div class="missing-section">
  <div class="missing-title">⚠ ${withoutCriteria.length} feature${withoutCriteria.length !== 1 ? 's' : ''} missing success criteria${withoutCriteria.length > 12 ? ` (showing 12 of ${withoutCriteria.length})` : ''}</div>
  <div class="missing-grid">${missingCards}</div>
</div>` : ''}

<script>
const DATA = ${dataJson};
let activeDomain = '__all__';

function toggleDomain(d) {
  activeDomain = d;
  document.querySelectorAll('.domain-pill').forEach(el => {
    el.classList.toggle('active', el.dataset.domain === d);
  });
  document.querySelectorAll('.card').forEach(el => {
    const match = d === '__all__' || el.dataset.domain === d;
    el.style.display = match ? '' : 'none';
  });
  // Update column counts
  ['frozen','active','draft'].forEach(status => {
    const col = document.getElementById('col-' + status);
    if (!col) return;
    const visible = col.querySelectorAll('.card:not([style*="none"])').length;
    const hdr = col.closest('.column').querySelector('.col-count');
    if (hdr) hdr.textContent = visible;
  });
}
</script>
</body>
</html>`
}

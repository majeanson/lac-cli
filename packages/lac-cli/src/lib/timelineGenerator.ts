/**
 * timelineGenerator — Feature Velocity Timeline
 *
 * Horizontal SVG timeline from earliest statusHistory entry to today.
 * Domain swim lanes (rows). Each feature is a pill spanning its active lifetime
 * colored by current status. Hover for details. Zoom + pan via controls.
 *
 * Shows: when features were created, how long they stayed in each status,
 * which domains shipped fastest. Useful for retrospectives and velocity review.
 *
 * Falls back gracefully for features without statusHistory (shown as dots).
 */

type Rec = Record<string, unknown>

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const STATUS_COLOR: Record<string, string> = {
  frozen: '#5b82cc',
  active: '#4aad72',
  draft: '#c4a255',
  deprecated: '#664444',
}

const DOMAIN_ORDER = [
  'app-shell', 'auth', 'recording', 'editing', 'sessions',
  'versioning', 'collaboration', 'band', 'render', 'storage',
]

function getFeatureDates(f: Rec): { start: Date | null; end: Date | null; transitions: Array<{from: string; to: string; date: Date}> } {
  const history = f['statusHistory']
  const transitions: Array<{from: string; to: string; date: Date}> = []

  if (Array.isArray(history)) {
    for (const entry of history) {
      const e = entry as Rec
      const dateStr = e['date'] as string
      if (dateStr && typeof dateStr === 'string') {
        const d = new Date(dateStr)
        if (!isNaN(d.getTime())) {
          transitions.push({ from: String(e['from'] ?? ''), to: String(e['to'] ?? ''), date: d })
        }
      }
    }
    transitions.sort((a, b) => a.date.getTime() - b.date.getTime())
  }

  if (transitions.length === 0) return { start: null, end: null, transitions }

  const start = transitions[0].date
  const lastStatus = (f['status'] as string) || 'draft'
  const end = lastStatus === 'frozen' || lastStatus === 'deprecated'
    ? transitions[transitions.length - 1].date
    : new Date() // still active → extends to today

  return { start, end, transitions }
}

export function generateTimeline(features: Rec[], projectName: string): string {
  const today = new Date()

  // Gather all dates to find global range
  const allDates: Date[] = []
  for (const f of features) {
    const { start, end } = getFeatureDates(f)
    if (start) allDates.push(start)
    if (end) allDates.push(end)
  }

  // Default range: last 12 months if no dates found
  const minDate = allDates.length > 0 ? new Date(Math.min(...allDates.map(d => d.getTime()))) : new Date(today.getFullYear() - 1, 0, 1)
  const maxDate = today

  // Add 5% padding
  const range = maxDate.getTime() - minDate.getTime()
  const padded = range * 0.04
  const domainStart = new Date(minDate.getTime() - padded)
  const domainEnd = new Date(maxDate.getTime() + padded)
  const totalMs = domainEnd.getTime() - domainStart.getTime()

  function toPct(d: Date): number {
    return ((d.getTime() - domainStart.getTime()) / totalMs) * 100
  }

  // Group features by domain
  const domains: string[] = [
    ...DOMAIN_ORDER.filter(d => features.some(f => f['domain'] === d)),
    ...[...new Set(features.map(f => (f['domain'] as string) || 'misc'))].filter(d => !DOMAIN_ORDER.includes(d)).sort(),
  ]

  const byDomain = new Map<string, Rec[]>()
  for (const f of features) {
    const d = (f['domain'] as string) || 'misc'
    if (!byDomain.has(d)) byDomain.set(d, [])
    byDomain.get(d)!.push(f)
  }

  // Month tick marks
  const ticks: Array<{ date: Date; label: string }> = []
  const cursor = new Date(domainStart.getFullYear(), domainStart.getMonth(), 1)
  while (cursor <= domainEnd) {
    ticks.push({
      date: new Date(cursor),
      label: cursor.toLocaleString('en', { month: 'short', year: '2-digit' }),
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  // Build feature data for JS
  interface FeatData {
    key: string; title: string; status: string; domain: string;
    startPct: number | null; endPct: number | null; hasHistory: boolean;
    transitions: Array<{ from: string; to: string; date: string }>;
  }
  const featData: FeatData[] = features.map(f => {
    const { start, end, transitions } = getFeatureDates(f)
    return {
      key: String(f['featureKey'] ?? ''),
      title: String(f['title'] ?? ''),
      status: String(f['status'] ?? 'draft'),
      domain: String(f['domain'] ?? 'misc'),
      startPct: start ? toPct(start) : null,
      endPct: end ? toPct(end) : null,
      hasHistory: transitions.length > 0,
      transitions: transitions.map(t => ({ from: t.from, to: t.to, date: t.date.toISOString().slice(0, 10) })),
    }
  })

  const dataJson = JSON.stringify({
    projectName,
    today: today.toISOString().slice(0, 10),
    todayPct: toPct(today),
    domains,
    features: featData,
    ticks: ticks.map(t => ({ label: t.label, pct: toPct(t.date) })),
  }).replace(/<\/script>/gi, '<\\/script>')
  const statusColorJson = JSON.stringify(STATUS_COLOR).replace(/<\/script>/gi, '<\\/script>')

  const featuresWithHistory = features.filter(f => getFeatureDates(f).transitions.length > 0).length
  const featuresWithoutHistory = features.length - featuresWithHistory

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(projectName)} — Feature Timeline</title>
<style>
:root {
  --bg: #12100e; --bg-card: #1a1714; --bg-hover: #201d1a;
  --border: #2a2724; --border-soft: #221f1c;
  --text: #e8e0d4; --text-soft: #8a7f74; --accent: #d4a853;
  --lane-h: 52px; --label-w: 120px;
  --mono: 'SF Mono','Fira Code','Cascadia Code',monospace;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; background: var(--bg); color: var(--text); font-family: system-ui,-apple-system,sans-serif; overflow: hidden; display: flex; flex-direction: column; }

.topbar {
  display: flex; align-items: center; gap: 10px; padding: 0 20px; height: 48px;
  background: #0e0c0a; border-bottom: 1px solid var(--border); flex-shrink: 0; font-size: 13px;
}
.topbar-logo { color: var(--accent); font-weight: 700; font-family: var(--mono); }
.topbar-sep { color: var(--border); }
.topbar-count { margin-left: auto; color: var(--text-soft); font-size: 12px; font-family: var(--mono); }

.controls {
  display: flex; align-items: center; gap: 12px; padding: 10px 20px;
  background: var(--bg-card); border-bottom: 1px solid var(--border); flex-shrink: 0;
  font-size: 12px;
}
.ctrl-label { color: var(--text-soft); font-family: var(--mono); }
.ctrl-btn {
  padding: 4px 12px; border-radius: 4px; border: 1px solid var(--border);
  background: transparent; color: var(--text-soft); cursor: pointer; font-size: 12px; font-family: var(--mono);
  transition: all .15s;
}
.ctrl-btn:hover { border-color: var(--accent); color: var(--accent); }
.ctrl-sep { color: var(--border); }
.legend { display: flex; gap: 14px; margin-left: auto; }
.leg-item { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text-soft); }
.leg-dot { width: 10px; height: 10px; border-radius: 2px; }
.zoom-info { font-size: 11px; color: var(--text-soft); font-family: var(--mono); }

.timeline-wrap { flex: 1; overflow: hidden; position: relative; display: flex; flex-direction: column; }

/* Tick labels row */
.tick-row {
  display: flex; height: 32px; flex-shrink: 0;
  padding-left: var(--label-w); position: relative; overflow: hidden;
  border-bottom: 1px solid var(--border);
}
.tick-track { position: absolute; left: var(--label-w); right: 0; top: 0; bottom: 0; }

/* Lanes */
.lanes-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; position: relative; }
.lanes-inner { position: relative; }
.lane { display: flex; height: var(--lane-h); border-bottom: 1px solid var(--border-soft); }
.lane:hover { background: rgba(255,255,255,.012); }
.lane-label {
  width: var(--label-w); flex-shrink: 0; padding: 0 12px 0 16px;
  display: flex; align-items: center; border-right: 1px solid var(--border);
  position: sticky; left: 0; background: var(--bg); z-index: 2;
}
.lane-label-text { font-size: 11px; color: var(--text-soft); font-family: var(--mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lane-track { flex: 1; position: relative; }

/* Feature pill */
.feat-pill {
  position: absolute; top: 8px; height: 34px;
  border-radius: 5px; cursor: pointer;
  display: flex; align-items: center; padding: 0 6px;
  transition: filter .15s, z-index .15s;
  border: 1px solid rgba(255,255,255,.08);
  min-width: 6px; overflow: hidden;
}
.feat-pill:hover { filter: brightness(1.3); z-index: 10; }
.feat-pill-text { font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: rgba(255,255,255,.85); font-family: var(--mono); }

/* Dot for features without history */
.feat-dot {
  position: absolute; top: 50%; width: 8px; height: 8px;
  border-radius: 50%; transform: translate(-50%, -50%);
  cursor: pointer; border: 1px solid rgba(255,255,255,.2);
}

/* Today line */
.today-line { position: absolute; top: 0; bottom: 0; width: 1.5px; background: rgba(212,168,83,.5); pointer-events: none; z-index: 5; }
.today-label { position: absolute; top: 4px; font-size: 9px; color: var(--accent); font-family: var(--mono); transform: translateX(-50%); white-space: nowrap; }

/* Tooltip */
.tooltip {
  position: fixed; pointer-events: none; z-index: 999;
  background: #1e1b18; border: 1px solid var(--border); border-radius: 8px;
  padding: 12px 14px; font-size: 12px; color: var(--text); max-width: 260px;
  display: none; box-shadow: 0 8px 24px rgba(0,0,0,.5);
}
.tooltip.visible { display: block; }
.tooltip-title { font-weight: 600; margin-bottom: 6px; font-size: 13px; line-height: 1.3; }
.tooltip-row { display: flex; justify-content: space-between; gap: 20px; margin: 2px 0; font-size: 11px; }
.tooltip-label { color: var(--text-soft); }
.tooltip-val { font-family: var(--mono); }
.tooltip-hist { margin-top: 8px; border-top: 1px solid var(--border); padding-top: 8px; }
.tooltip-trans { font-size: 10px; color: var(--text-soft); font-family: var(--mono); margin: 1px 0; }
</style>
</head>
<body>
<div class="topbar">
  <span class="topbar-logo">◈ lac</span>
  <span class="topbar-sep">|</span>
  <span class="topbar-project">${esc(projectName)} — Feature Timeline</span>
  <span class="topbar-count">${features.length} features · ${featuresWithHistory} with history · ${featuresWithoutHistory} undated</span>
</div>

<div class="controls">
  <span class="ctrl-label">Zoom:</span>
  <button class="ctrl-btn" onclick="zoom(0.7)">−</button>
  <span class="zoom-info" id="zoom-info">100%</span>
  <button class="ctrl-btn" onclick="zoom(1.4)">+</button>
  <button class="ctrl-btn" onclick="resetZoom()">Reset</button>
  <span class="ctrl-sep">|</span>
  <span class="ctrl-label">Sort:</span>
  <button class="ctrl-btn" onclick="setSortMode('domain')">Domain</button>
  <button class="ctrl-btn" onclick="setSortMode('start')">Start date</button>
  <button class="ctrl-btn" onclick="setSortMode('status')">Status</button>
  <div class="legend">
    ${Object.entries(STATUS_COLOR).map(([s, c]) => `<div class="leg-item"><div class="leg-dot" style="background:${c}"></div>${s}</div>`).join('')}
    <div class="leg-item"><div class="leg-dot" style="background:#3a3530;border:1px solid #5a5550"></div>no history</div>
  </div>
</div>

<div class="timeline-wrap">
  <div class="tick-row">
    <div class="tick-track" id="tick-track"></div>
  </div>
  <div class="lanes-scroll">
    <div class="lanes-inner" id="lanes"></div>
  </div>
</div>

<div class="tooltip" id="tooltip"></div>

<script>
const DATA = ${dataJson};
const STATUS_COLOR = ${statusColorJson};

let zoomLevel = 1;
let sortMode = 'domain';
const tooltip = document.getElementById('tooltip');

// Scale: zoomLevel * 100% width for the track
function trackWidth() { return Math.round(zoomLevel * 100) + '%'; }

function pctToPx(pct) {
  const track = document.getElementById('lanes');
  return (pct / 100) * track.offsetWidth;
}

function render() {
  document.getElementById('zoom-info').textContent = Math.round(zoomLevel * 100) + '%';
  renderTicks();
  renderLanes();
}

function renderTicks() {
  const track = document.getElementById('tick-track');
  track.style.width = trackWidth();
  track.innerHTML = DATA.ticks.map(t =>
    t.pct >= 0 && t.pct <= 100
      ? \`<div style="position:absolute;left:\${t.pct}%;top:0;bottom:0;border-left:1px solid #2a2724;padding-top:8px">
           <span style="font-size:9px;color:#6a6055;font-family:var(--mono);padding-left:4px">\${t.label}</span>
         </div>\`
      : ''
  ).join('') + \`<div class="today-line" style="left:\${DATA.todayPct}%">
    <div class="today-label" style="left:50%">today</div>
  </div>\`;
}

function renderLanes() {
  const lanesEl = document.getElementById('lanes');
  // Sort domains
  let domainOrder = [...DATA.domains];
  if (sortMode === 'status') {
    // sort domains by avg frozen ratio descending
  }

  lanesEl.innerHTML = domainOrder.map(domain => {
    const domFeats = DATA.features.filter(f => f.domain === domain);
    // Sort features within domain
    let sorted = [...domFeats];
    if (sortMode === 'start') sorted.sort((a,b) => (a.startPct??101) - (b.startPct??101));
    else if (sortMode === 'status') sorted.sort((a,b) => a.status.localeCompare(b.status));
    else sorted.sort((a,b) => (a.startPct??101) - (b.startPct??101));

    const laneH = Math.max(${DOMAIN_ORDER.length > 0 ? 'Math.ceil(sorted.length / 1) * 44 + 8' : '52'}, 52);

    const pills = sorted.map((f, fi) => {
      const color = STATUS_COLOR[f.status] || '#444';
      const bgAlpha = f.hasHistory ? '55' : '22';
      const top = 8 + Math.floor(fi * 0) ; // stack vertically — one row per feature lane
      if (f.startPct !== null && f.endPct !== null) {
        const left = Math.max(0, f.startPct);
        const width = Math.max(0.4, f.endPct - f.startPct);
        return \`<div class="feat-pill"
          style="left:\${left}%;width:\${width}%;background:\${color}\${bgAlpha};top:8px"
          data-key="\${f.key}"
          onmousemove="showTooltip(event, '\${f.key}')"
          onmouseleave="hideTooltip()"
          onclick="window.open('lac-wiki.html#\${f.key}','_self')">
          \${width > 2 ? \`<span class="feat-pill-text">\${f.title}</span>\` : ''}
        </div>\`;
      } else {
        // dot at end of timeline
        return \`<div class="feat-dot"
          style="left:\${DATA.todayPct}%;background:\${color}44;border-color:\${color}88"
          data-key="\${f.key}"
          onmousemove="showTooltip(event, '\${f.key}')"
          onmouseleave="hideTooltip()"
          onclick="window.open('lac-wiki.html#\${f.key}','_self')">
        </div>\`;
      }
    }).join('');

    return \`<div class="lane" style="height:var(--lane-h)">
      <div class="lane-label"><span class="lane-label-text" title="\${domain}">\${domain}</span></div>
      <div class="lane-track" style="width:\${trackWidth()}">
        \${pills}
        <div class="today-line" style="left:\${DATA.todayPct}%"></div>
      </div>
    </div>\`;
  }).join('');
}

const featByKey = new Map(DATA.features.map(f => [f.key, f]));

function showTooltip(e, key) {
  const f = featByKey.get(key);
  if (!f) return;
  const color = STATUS_COLOR[f.status] || '#888';
  const histHtml = f.transitions.length > 0
    ? '<div class="tooltip-hist">' + f.transitions.map(t =>
        \`<div class="tooltip-trans">\${t.date} · \${t.from || '–'} → \${t.to}</div>\`
      ).join('') + '</div>'
    : '<div class="tooltip-row"><span class="tooltip-label">history</span><span class="tooltip-val" style="color:#4a4540">not recorded</span></div>';

  tooltip.innerHTML =
    \`<div class="tooltip-title">\${f.title}</div>\` +
    \`<div class="tooltip-row"><span class="tooltip-label">status</span><span class="tooltip-val" style="color:\${color}">\${f.status}</span></div>\` +
    \`<div class="tooltip-row"><span class="tooltip-label">domain</span><span class="tooltip-val">\${f.domain}</span></div>\` +
    \`<div class="tooltip-row"><span class="tooltip-label">key</span><span class="tooltip-val">\${f.key}</span></div>\` +
    histHtml;

  tooltip.style.left = (e.clientX + 14) + 'px';
  tooltip.style.top  = (e.clientY - 10) + 'px';
  tooltip.classList.add('visible');
}
function hideTooltip() { tooltip.classList.remove('visible'); }

function zoom(factor) {
  zoomLevel = Math.max(0.5, Math.min(8, zoomLevel * factor));
  render();
}
function resetZoom() { zoomLevel = 1; render(); }
function setSortMode(mode) { sortMode = mode; render(); }

render();
window.addEventListener('resize', render);
</script>
</body>
</html>`
}

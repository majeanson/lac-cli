/**
 * radarGenerator — Domain Maturity Radar Chart
 *
 * SVG polar/radar chart: N spokes (one per domain), 5 overlapping polygons
 * (one per quality dimension). Instantly shows which domains are weakest
 * across documentation, decision quality, user coverage, code, and ship rate.
 *
 * Dimensions scored per domain:
 *   docs       — avg fill of problem+analysis+implementation
 *   decisions  — % features with 2+ decisions
 *   userGuide  — % features with userGuide
 *   code       — % features with componentFile
 *   shipped    — % features with status=frozen
 */

type Rec = Record<string, unknown>

function hasText(v: unknown, min = 10): boolean {
  return typeof v === 'string' && v.trim().length >= min
}
function arrLen(v: unknown): number {
  return Array.isArray(v) ? v.length : 0
}
function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

interface Metric {
  key: string
  label: string
  color: string
  desc: string
  score(features: Rec[]): number
}

const METRICS: Metric[] = [
  {
    key: 'docs', label: 'Documentation', color: '#5b82cc', desc: 'Avg fill of problem, analysis, implementation',
    score(fs) {
      if (!fs.length) return 0
      const total = fs.reduce((s, f) => {
        let n = 0
        if (hasText(f['problem'])) n++
        if (hasText(f['analysis'])) n++
        if (hasText(f['implementation'])) n++
        return s + n / 3
      }, 0)
      return total / fs.length
    },
  },
  {
    key: 'decisions', label: 'Decision Quality', color: '#9b7ecc', desc: '% features with 2+ documented decisions',
    score(fs) {
      if (!fs.length) return 0
      return fs.filter(f => arrLen(f['decisions']) >= 2).length / fs.length
    },
  },
  {
    key: 'guide', label: 'User Guide', color: '#4aad72', desc: '% features with userGuide written',
    score(fs) {
      if (!fs.length) return 0
      return fs.filter(f => hasText(f['userGuide'], 1)).length / fs.length
    },
  },
  {
    key: 'code', label: 'Code Reference', color: '#d4a853', desc: '% features with componentFile linked',
    score(fs) {
      if (!fs.length) return 0
      return fs.filter(f => hasText(f['componentFile'], 1)).length / fs.length
    },
  },
  {
    key: 'shipped', label: 'Ship Rate', color: '#e07b54', desc: '% features frozen / shipped',
    score(fs) {
      if (!fs.length) return 0
      return fs.filter(f => f['status'] === 'frozen').length / fs.length
    },
  },
]

export function generateRadar(features: Rec[], projectName: string): string {
  const domains = [...new Set(features.map(f => (f['domain'] as string) || 'misc'))].sort()
  const byDomain = new Map<string, Rec[]>()
  for (const f of features) {
    const d = (f['domain'] as string) || 'misc'
    if (!byDomain.has(d)) byDomain.set(d, [])
    byDomain.get(d)!.push(f)
  }

  const N = domains.length
  const CX = 240, CY = 220, R = 170
  const PAD_LABEL = 28

  // Compute scores: scores[metricIdx][domainIdx] = 0..1
  const scores: number[][] = METRICS.map(m => domains.map(d => m.score(byDomain.get(d) ?? [])))

  function polar(i: number, r: number): { x: number; y: number } {
    const angle = (i / N) * 2 * Math.PI - Math.PI / 2
    return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) }
  }

  function polygonPts(scoreRow: number[]): string {
    return scoreRow.map((s, i) => {
      const p = polar(i, s * R)
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
    }).join(' ')
  }

  // Grid rings SVG
  const rings = [0.25, 0.5, 0.75, 1.0].map(pct => {
    const pts = domains.map((_, i) => {
      const p = polar(i, pct * R)
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
    }).join(' ')
    return `<polygon points="${pts}" fill="none" stroke="#2a2724" stroke-width="${pct === 1 ? 1.5 : 0.8}"/>`
  }).join('\n')

  // Spokes SVG
  const spokes = domains.map((_, i) => {
    const p = polar(i, R)
    return `<line x1="${CX}" y1="${CY}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="#2a2724" stroke-width="0.8"/>`
  }).join('\n')

  // Domain labels
  const labels = domains.map((d, i) => {
    const p = polar(i, R + PAD_LABEL)
    const anchor = p.x < CX - 5 ? 'end' : p.x > CX + 5 ? 'start' : 'middle'
    const label = d.replace(/-/g, '\u2011') // non-breaking hyphen
    return `<text x="${p.x.toFixed(1)}" y="${(p.y + 4).toFixed(1)}" text-anchor="${anchor}" class="domain-label">${esc(label)}</text>`
  }).join('\n')

  // Metric polygons (5 overlapping, semi-transparent)
  const metricPolygons = METRICS.map((m, mi) => {
    const pts = polygonPts(scores[mi])
    return `<polygon id="poly-${m.key}" points="${pts}" fill="${m.color}" fill-opacity="0.12" stroke="${m.color}" stroke-width="1.8" stroke-linejoin="round" class="metric-poly" data-metric="${m.key}"/>`
  }).join('\n')

  // Ring % labels (left spoke)
  const ringLabels = [25, 50, 75, 100].map(pct => {
    const p = polar(0, pct / 100 * R)
    return `<text x="${(CX - 6).toFixed(1)}" y="${(p.y + 3).toFixed(1)}" text-anchor="end" class="ring-label">${pct}%</text>`
  }).join('\n')

  // Data table rows
  const tableRows = domains.map((d, di) => {
    const domFeats = byDomain.get(d) ?? []
    const cells = METRICS.map((m, mi) => {
      const pct = Math.round(scores[mi][di] * 100)
      const color = pct >= 70 ? '#4aad72' : pct >= 40 ? '#c4a255' : '#cc5b5b'
      return `<td style="color:${color};font-family:var(--mono);text-align:center">${pct}%</td>`
    })
    return `<tr>
      <td><strong>${esc(d)}</strong></td>
      <td style="color:var(--text-soft);text-align:center">${domFeats.length}</td>
      ${cells.join('')}
    </tr>`
  }).join('\n')

  // Composite score per domain (avg of all metrics)
  const compositeByDomain = domains.map((_, di) =>
    Math.round(METRICS.reduce((s, _, mi) => s + scores[mi][di], 0) / METRICS.length * 100)
  )

  const dataJson = JSON.stringify(
    domains.map((d, di) => ({
      domain: d,
      count: (byDomain.get(d) ?? []).length,
      composite: compositeByDomain[di],
      scores: Object.fromEntries(METRICS.map((m, mi) => [m.key, Math.round(scores[mi][di] * 100)])),
    }))
  ).replace(/<\/script>/gi, '<\\/script>')

  const svgWidth = 480, svgHeight = 440

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(projectName)} — Domain Maturity Radar</title>
<style>
:root {
  --bg: #12100e;
  --bg-card: #1a1714;
  --bg-hover: #201d1a;
  --border: #2a2724;
  --border-soft: #221f1c;
  --text: #e8e0d4;
  --text-soft: #8a7f74;
  --accent: #d4a853;
  --mono: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, sans-serif; }
body { display: flex; flex-direction: column; min-height: 100vh; }

.topbar {
  display: flex; align-items: center; gap: 10px; padding: 0 20px; height: 48px;
  background: #0e0c0a; border-bottom: 1px solid var(--border); flex-shrink: 0;
  font-size: 13px;
}
.topbar-logo { color: var(--accent); font-weight: 700; font-family: var(--mono); }
.topbar-sep { color: var(--border); }
.topbar-project { color: var(--text); }
.topbar-count { margin-left: auto; color: var(--text-soft); font-size: 12px; font-family: var(--mono); }

.main { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 32px 24px; gap: 32px; }

h1 { font-size: 20px; font-weight: 600; color: var(--text); }
.subtitle { font-size: 13px; color: var(--text-soft); margin-top: 4px; text-align: center; }

.radar-wrap {
  display: flex; gap: 40px; align-items: flex-start; flex-wrap: wrap; justify-content: center;
}

svg.radar { overflow: visible; }
.domain-label { font-size: 11px; fill: var(--text); font-family: var(--mono); }
.ring-label { font-size: 9px; fill: var(--text-soft); font-family: var(--mono); }
.metric-poly { cursor: pointer; transition: fill-opacity 0.2s, stroke-width 0.2s; }
.metric-poly:hover { fill-opacity: 0.35; stroke-width: 2.5; }
.metric-poly.dimmed { fill-opacity: 0.04; stroke-opacity: 0.25; }

.legend {
  display: flex; flex-direction: column; gap: 10px; padding: 20px;
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
  min-width: 200px;
}
.legend-title { font-size: 11px; color: var(--text-soft); font-family: var(--mono); text-transform: uppercase; letter-spacing: .08em; margin-bottom: 4px; }
.legend-item {
  display: flex; align-items: flex-start; gap: 10px; cursor: pointer;
  padding: 6px 8px; border-radius: 4px; transition: background 0.15s;
}
.legend-item:hover { background: var(--bg-hover); }
.legend-item.dimmed { opacity: 0.35; }
.legend-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; margin-top: 2px; }
.legend-text { display: flex; flex-direction: column; }
.legend-label { font-size: 13px; font-weight: 500; color: var(--text); }
.legend-desc { font-size: 11px; color: var(--text-soft); margin-top: 1px; }

.table-wrap {
  width: 100%; max-width: 760px;
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
  overflow: hidden;
}
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th {
  padding: 10px 14px; text-align: left; font-weight: 500; font-size: 11px;
  color: var(--text-soft); border-bottom: 1px solid var(--border);
  text-transform: uppercase; letter-spacing: .06em; font-family: var(--mono);
}
th.metric-header { cursor: pointer; }
th.metric-header:hover { color: var(--text); }
td { padding: 10px 14px; border-bottom: 1px solid var(--border-soft); }
tr:last-child td { border-bottom: none; }
tr:hover td { background: var(--bg-hover); }

.tooltip {
  position: fixed; pointer-events: none; z-index: 999;
  background: #1e1b18; border: 1px solid var(--border); border-radius: 6px;
  padding: 10px 14px; font-size: 12px; color: var(--text); max-width: 220px;
  display: none; box-shadow: 0 8px 24px rgba(0,0,0,.5);
}
.tooltip.visible { display: block; }
.tooltip-domain { font-weight: 600; margin-bottom: 6px; color: var(--accent); font-family: var(--mono); font-size: 11px; }
.tooltip-row { display: flex; justify-content: space-between; gap: 16px; margin: 2px 0; }
.tooltip-label { color: var(--text-soft); }
.tooltip-val { font-family: var(--mono); }
</style>
</head>
<body>
<div class="topbar">
  <span class="topbar-logo">◈ lac</span>
  <span class="topbar-sep">|</span>
  <span class="topbar-project">${esc(projectName)}</span>
  <span class="topbar-count">${features.length} features · ${domains.length} domains · Domain Maturity Radar</span>
</div>

<div class="main">
  <div style="text-align:center">
    <h1>Domain Maturity Radar</h1>
    <p class="subtitle">5 quality dimensions scored per domain — hover a legend item to isolate a metric</p>
  </div>

  <div class="radar-wrap">
    <svg class="radar" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
      <!-- Guide rings -->
      ${rings}
      <!-- Spokes -->
      ${spokes}
      <!-- Ring labels -->
      ${ringLabels}
      <!-- Metric polygons -->
      ${metricPolygons}
      <!-- Domain labels -->
      ${labels}
      <!-- Center dot -->
      <circle cx="${CX}" cy="${CY}" r="3" fill="var(--border)"/>
    </svg>

    <div class="legend">
      <div class="legend-title">Metric</div>
      ${METRICS.map(m => `
      <div class="legend-item" data-metric="${m.key}" onclick="toggleMetric('${m.key}')">
        <span class="legend-dot" style="background:${m.color}"></span>
        <span class="legend-text">
          <span class="legend-label">${esc(m.label)}</span>
          <span class="legend-desc">${esc(m.desc)}</span>
        </span>
      </div>`).join('')}
    </div>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Domain</th>
          <th style="text-align:center">Features</th>
          ${METRICS.map(m => `<th class="metric-header" style="text-align:center;color:${m.color}" title="${esc(m.desc)}">${esc(m.label)}</th>`).join('')}
        </tr>
      </thead>
      <tbody id="table-body">
        ${tableRows}
      </tbody>
    </table>
  </div>
</div>

<div class="tooltip" id="tooltip"></div>

<script>
const DATA = ${dataJson};
const byDomain = new Map(DATA.map(d => [d.domain, d]));
const METRIC_COLORS = {${METRICS.map(m => `'${m.key}': '${m.color}'`).join(', ')}};

let activeMetrics = new Set(${JSON.stringify(METRICS.map(m => m.key))});

function toggleMetric(key) {
  if (activeMetrics.size === ${METRICS.length} && activeMetrics.has(key)) {
    // Solo this metric
    activeMetrics.clear();
    activeMetrics.add(key);
  } else if (activeMetrics.size === 1 && activeMetrics.has(key)) {
    // Re-activate all
    ${JSON.stringify(METRICS.map(m => m.key))}.forEach(k => activeMetrics.add(k));
  } else {
    if (activeMetrics.has(key)) activeMetrics.delete(key);
    else activeMetrics.add(key);
  }
  updateVisibility();
}

function updateVisibility() {
  document.querySelectorAll('.metric-poly').forEach(el => {
    const k = el.dataset.metric;
    el.classList.toggle('dimmed', !activeMetrics.has(k));
  });
  document.querySelectorAll('.legend-item').forEach(el => {
    const k = el.dataset.metric;
    el.classList.toggle('dimmed', !activeMetrics.has(k));
  });
}

// Domain hover tooltip via SVG polygon hit-test approximation
// Attach mousemove to SVG, find nearest domain spoke
const svg = document.querySelector('svg.radar');
const tooltip = document.getElementById('tooltip');
const CX = ${CX}, CY = ${CY};
const domainAngles = ${JSON.stringify(domains.map((_, i) => (i / N) * 360 - 90))};
const domainNames = ${JSON.stringify(domains)};

svg.addEventListener('mousemove', e => {
  const rect = svg.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (${svgWidth} / rect.width) - CX;
  const y = (e.clientY - rect.top) * (${svgHeight} / rect.height) - CY;
  const dist = Math.sqrt(x*x + y*y);
  if (dist < 15 || dist > ${R + 40}) { tooltip.classList.remove('visible'); return; }

  let angle = Math.atan2(y, x) * 180 / Math.PI + 90;
  if (angle < 0) angle += 360;

  // Find nearest domain spoke
  const step = 360 / domainNames.length;
  const idx = Math.round(angle / step) % domainNames.length;
  const domain = domainNames[idx];
  const d = byDomain.get(domain);
  if (!d) { tooltip.classList.remove('visible'); return; }

  const metricsHtml = Object.entries(d.scores).map(([k, v]) => {
    const color = v >= 70 ? '#4aad72' : v >= 40 ? '#c4a255' : '#cc5b5b';
    return '<div class="tooltip-row"><span class="tooltip-label">' + k + '</span><span class="tooltip-val" style="color:' + color + '">' + v + '%</span></div>';
  }).join('');

  tooltip.innerHTML = '<div class="tooltip-domain">' + domain + '</div>' +
    '<div class="tooltip-row"><span class="tooltip-label">features</span><span class="tooltip-val">' + d.count + '</span></div>' +
    metricsHtml;
  tooltip.style.left = (e.clientX + 14) + 'px';
  tooltip.style.top = (e.clientY - 10) + 'px';
  tooltip.classList.add('visible');
});

svg.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));
</script>
</body>
</html>`
}

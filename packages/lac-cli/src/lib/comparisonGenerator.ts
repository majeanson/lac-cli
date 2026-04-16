/**
 * Comparison report generator — produces a self-contained HTML report for a
 * 3-depth LAC reconstruction experiment.
 *
 * Each depth represents how much feature.json context was available during
 * reconstruction: depth 1 = Why (intent only), depth 2 = What (intent + API),
 * depth 3 = How (full context including code snippets and tooling annotations).
 *
 * The report includes:
 *   - Three-column overview cards with test pass rates and stats
 *   - A fields matrix showing which fields were available at each depth
 *   - Side-by-side diffs of original vs each depth's reconstruction
 *   - Subagent notes per depth
 *   - A verdict strip summarising the experiment outcome
 *
 * All result data is embedded as JSON; no external dependencies.
 */

// ── Public types ────────────────────────────────────────────────────────────

export interface DepthResult {
  depth: 1 | 2 | 3
  label: string            // "Why", "What", "How"
  fieldsIncluded: string[] // field names available at this depth
  reconstruction: string   // the reconstructed source file content
  testsPassed: number
  testsFailed: number
  coveragePct: number
  linesWritten: number
  notes: string            // subagent notes — what was hard, what had to be guessed
}

// ── Field definitions ───────────────────────────────────────────────────────

type FieldGroup = {
  label: string
  fields: string[]
}

const FIELD_GROUPS: FieldGroup[] = [
  {
    label: 'Intent',
    fields: ['analysis', 'decisions', 'problem', 'successCriteria', 'knownLimitations', 'userGuide', 'tags', 'domain'],
  },
  {
    label: 'API',
    fields: ['implementation', 'publicInterface', 'componentFile', 'npmPackages', 'externalDependencies'],
  },
  {
    label: 'Spec',
    fields: ['codeSnippets', 'toolingAnnotations'],
  },
]

const ALL_FIELDS: string[] = FIELD_GROUPS.flatMap(g => g.fields)

// ── Helpers ─────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function passRate(r: DepthResult): number {
  const total = r.testsPassed + r.testsFailed
  if (total === 0) return 100
  return Math.round((r.testsPassed / total) * 100)
}

function passColor(pct: number): string {
  if (pct < 80) return '#f85149'
  if (pct < 100) return '#d29922'
  return '#3fb950'
}

function depthBadgeStyle(depth: 1 | 2 | 3): string {
  if (depth === 1) return 'background:#1c2d4e;color:#79c0ff;border:1px solid #388bfd;'
  if (depth === 2) return 'background:#2d2008;color:#d29922;border:1px solid #9e6a03;'
  return 'background:#1a4731;color:#3fb950;border:1px solid #2ea043;'
}

// ── Overview cards ──────────────────────────────────────────────────────────

function renderOverviewCards(results: DepthResult[]): string {
  const cards = results.map(r => {
    const total = r.testsPassed + r.testsFailed
    const pct = passRate(r)
    const color = passColor(pct)
    const badgeStyle = depthBadgeStyle(r.depth)

    return `
      <div class="overview-card">
        <div class="card-depth-badge" style="${esc(badgeStyle)}">
          Depth ${r.depth} — ${esc(r.label)}
        </div>
        <div class="card-pass-rate" style="color:${color}">
          ${r.testsPassed}/${total}
          <span class="card-pass-label">tests pass</span>
        </div>
        <div class="card-stats">
          <div class="card-stat">
            <span class="card-stat-value">${r.coveragePct}<span class="stat-unit">%</span></span>
            <span class="card-stat-label">coverage</span>
          </div>
          <div class="card-stat">
            <span class="card-stat-value">${r.linesWritten}</span>
            <span class="card-stat-label">lines written</span>
          </div>
          <div class="card-stat">
            <span class="card-stat-value">${r.fieldsIncluded.length}</span>
            <span class="card-stat-label">fields available</span>
          </div>
        </div>
      </div>`
  }).join('\n')

  return `
    <section class="section">
      <h2 class="section-title">Depth Overview</h2>
      <div class="overview-grid">
        ${cards}
      </div>
    </section>`
}

// ── Fields matrix ───────────────────────────────────────────────────────────

function renderFieldsMatrix(results: DepthResult[]): string {
  const depthSets = results.map(r => new Set(r.fieldsIncluded))

  const headerCells = results.map(r =>
    `<th class="matrix-depth-header" style="${esc(depthBadgeStyle(r.depth))}padding:6px 12px;border-radius:4px;">D${r.depth} ${esc(r.label)}</th>`
  ).join('\n            ')

  const groupRows = FIELD_GROUPS.map(group => {
    const groupHeader = `
          <tr class="matrix-group-row">
            <td colspan="${results.length + 1}" class="matrix-group-label">${esc(group.label)}</td>
          </tr>`

    const fieldRows = group.fields.map(field => {
      const cells = depthSets.map(set => {
        const included = set.has(field)
        return included
          ? `<td class="matrix-cell matrix-cell-yes" title="${esc(field)} included at this depth">&#10003;</td>`
          : `<td class="matrix-cell matrix-cell-no" title="${esc(field)} not included at this depth">&#8212;</td>`
      }).join('\n            ')

      return `
          <tr class="matrix-field-row">
            <td class="matrix-field-name">${esc(field)}</td>
            ${cells}
          </tr>`
    }).join('')

    return groupHeader + fieldRows
  }).join('')

  return `
    <section class="section">
      <h2 class="section-title">Fields Matrix</h2>
      <p class="section-subtitle">Which feature.json fields were available at each reconstruction depth.</p>
      <div class="matrix-wrap">
        <table class="matrix-table">
          <thead>
            <tr>
              <th class="matrix-field-header">Field</th>
              ${headerCells}
            </tr>
          </thead>
          <tbody>
            ${groupRows}
          </tbody>
        </table>
      </div>
    </section>`
}

// ── Diff panels ─────────────────────────────────────────────────────────────

function renderDiffPanels(results: DepthResult[], originalSource: string): string {
  const panels = results.map((r, idx) => {
    const isOpen = idx === 0
    const badgeStyle = depthBadgeStyle(r.depth)
    const pct = passRate(r)
    const color = passColor(pct)

    return `
      <details class="diff-panel" ${isOpen ? 'open' : ''}>
        <summary class="diff-panel-summary">
          <span class="diff-depth-badge" style="${esc(badgeStyle)}">Depth ${r.depth} — ${esc(r.label)}</span>
          <span class="diff-pass-badge" style="color:${color};margin-left:10px;">${pct}% pass rate</span>
          <span class="diff-chevron">&#9660;</span>
        </summary>
        <div class="diff-toolbar">
          <div class="diff-view-group" data-target="diff-body-${r.depth}">
            <button class="diff-view-btn active" data-mode="split">Split</button>
            <button class="diff-view-btn" data-mode="unified">Unified</button>
          </div>
          <label class="diff-toggle"><input type="checkbox" class="diff-strip-toggle" data-depth="${r.depth}" checked> Code only</label>
        </div>
        <div class="diff-body" id="diff-body-${r.depth}">
          <p class="diff-loading">Computing diff&hellip;</p>
        </div>
      </details>`
  }).join('\n')

  return `
    <section class="section">
      <h2 class="section-title">Reconstruction Diffs</h2>
      <p class="section-subtitle">Original source vs each depth's reconstruction. Green = reconstruction-only lines, red = original-only lines, gray = matching.</p>
      ${panels}
    </section>`
}

// ── Cross-depth comparison panels ───────────────────────────────────────────

function renderCrossDepthDiffs(results: DepthResult[]): string {
  if (results.length < 2) return ''

  const pairs: Array<[DepthResult, DepthResult]> = []
  for (let i = 0; i < results.length - 1; i++) {
    pairs.push([results[i]!, results[i + 1]!])
  }

  const panels = pairs.map(([a, b], idx) => {
    const isOpen = idx === 0
    return `
      <details class="diff-panel" ${isOpen ? 'open' : ''}>
        <summary class="diff-panel-summary">
          <span class="diff-depth-badge" style="${esc(depthBadgeStyle(a.depth))}">D${a.depth} ${esc(a.label)}</span>
          <span style="margin:0 10px;color:var(--text-mid);">&#8594;</span>
          <span class="diff-depth-badge" style="${esc(depthBadgeStyle(b.depth))}">D${b.depth} ${esc(b.label)}</span>
          <span style="margin-left:12px;color:var(--text-mid);font-size:12px;">what more context changed</span>
          <span class="diff-chevron">&#9660;</span>
        </summary>
        <div class="diff-toolbar">
          <div class="diff-view-group" data-target="cross-diff-body-${a.depth}-${b.depth}">
            <button class="diff-view-btn active" data-mode="split">Split</button>
            <button class="diff-view-btn" data-mode="unified">Unified</button>
          </div>
        </div>
        <div class="diff-body" id="cross-diff-body-${a.depth}-${b.depth}">
          <p class="diff-loading">Computing diff&hellip;</p>
        </div>
      </details>`
  }).join('\n')

  return `
    <section class="section">
      <h2 class="section-title">Cross-Depth Comparison</h2>
      <p class="section-subtitle">Reconstruction vs reconstruction — what actually changed when more feature context was available. Green = lines added at the higher depth, red = lines dropped.</p>
      ${panels}
    </section>`
}

// ── Notes panels ────────────────────────────────────────────────────────────

function renderNotesPanels(results: DepthResult[]): string {
  const cards = results.map(r => {
    const badgeStyle = depthBadgeStyle(r.depth)
    return `
      <div class="notes-card">
        <div class="notes-card-header">
          <span class="notes-depth-badge" style="${esc(badgeStyle)}">Depth ${r.depth} — ${esc(r.label)}</span>
        </div>
        <p class="notes-text">${esc(r.notes)}</p>
      </div>`
  }).join('\n')

  return `
    <section class="section">
      <h2 class="section-title">Subagent Notes</h2>
      <p class="section-subtitle">What the reconstructing agent found hard, ambiguous, or had to guess.</p>
      <div class="notes-grid">
        ${cards}
      </div>
    </section>`
}

// ── Verdict strip ────────────────────────────────────────────────────────────

function renderVerdict(results: DepthResult[]): string {
  const verdictItems = results.map(r => {
    const pct = passRate(r)
    const color = passColor(pct)
    const bg = pct >= 100 ? '#1a4731' : pct >= 80 ? '#2d2008' : '#3d1f1f'
    const border = pct >= 100 ? '#2ea043' : pct >= 80 ? '#9e6a03' : '#da3633'
    return `
      <div class="verdict-item" style="background:${bg};border:1px solid ${border};border-radius:6px;padding:12px 16px;">
        <div class="verdict-depth" style="color:${color};font-weight:700;font-size:14px;">Depth ${r.depth} — ${esc(r.label)}</div>
        <div class="verdict-stat" style="font-size:24px;font-weight:700;color:${color};margin:6px 0;">${pct}%</div>
        <div class="verdict-desc" style="font-size:12px;color:#8b949e;">${r.testsPassed}/${r.testsPassed + r.testsFailed} tests · ${r.coveragePct}% coverage</div>
      </div>`
  }).join('\n')

  // Derive interpretation text
  const [d1, d2, d3] = results
  const lines: string[] = []

  if (d1) {
    const pct1 = passRate(d1)
    if (pct1 === 100) lines.push(`Depth 1 (${d1.label}) achieved full test passage from intent fields alone.`)
    else if (pct1 >= 80) lines.push(`Depth 1 (${d1.label}) came close but missed ${d1.testsFailed} test${d1.testsFailed === 1 ? '' : 's'} — intent fields were nearly sufficient.`)
    else lines.push(`Depth 1 (${d1.label}) struggled with only intent fields — ${d1.testsFailed} test${d1.testsFailed === 1 ? '' : 's'} failed.`)
  }
  if (d2) {
    const pct2 = passRate(d2)
    if (pct2 === 100) lines.push(`Depth 2 (${d2.label}) produced a functionally complete reconstruction once API fields were added.`)
    else lines.push(`Depth 2 (${d2.label}) improved but still missed ${d2.testsFailed} test${d2.testsFailed === 1 ? '' : 's'}.`)
  }
  if (d3) {
    const pct3 = passRate(d3)
    if (pct3 === 100) lines.push(`Depth 3 (${d3.label}) with full spec context was nearly identical to the original.`)
    else lines.push(`Depth 3 (${d3.label}) still had ${d3.testsFailed} test${d3.testsFailed === 1 ? '' : 's'} failing even with full spec context.`)
  }

  return `
    <section class="section verdict-section">
      <h2 class="section-title">Experiment Verdict</h2>
      <div class="verdict-grid">
        ${verdictItems}
      </div>
      <div class="verdict-interpretation">
        <ul class="verdict-list">
          ${lines.map(l => `<li>${esc(l)}</li>`).join('\n          ')}
        </ul>
      </div>
    </section>`
}

// ── Public API ───────────────────────────────────────────────────────────────

export function generateComparisonReport(
  results: DepthResult[],
  projectName: string,
  originalSource: string,
): string {
  const overviewSection = renderOverviewCards(results)
  const matrixSection = renderFieldsMatrix(results)
  const diffSection = renderDiffPanels(results, originalSource)
  const crossDepthSection = renderCrossDepthDiffs(results)
  const notesSection = renderNotesPanels(results)
  const verdictSection = renderVerdict(results)

  // Embed result data and original source for the diff JS
  const dataJson = JSON.stringify({
    results: results.map(r => ({
      depth: r.depth,
      label: r.label,
      reconstruction: r.reconstruction,
    })),
    original: originalSource,
  }).replace(/<\/script>/gi, '<\\/script>')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)} — LAC Depth Comparison</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0d1117;
    --bg-card: #161b22;
    --bg-hover: #1c2128;
    --border: #30363d;
    --text: #e6edf3;
    --text-mid: #8b949e;
    --text-soft: #484f58;
    --green: #3fb950;
    --red: #f85149;
    --yellow: #d29922;
    --blue: #79c0ff;
    --mono: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
    --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  }

  html, body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--sans);
    font-size: 14px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  /* ── Header ── */

  .header {
    background: #161b22;
    border-bottom: 1px solid var(--border);
    padding: 20px 32px;
  }

  .header-inner {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .header h1 {
    font-size: 18px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 4px;
  }

  .header .subtitle {
    font-size: 13px;
    color: var(--text-mid);
  }

  .header-badge {
    display: inline-flex;
    align-items: center;
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
    background: #1c2d4e;
    color: var(--blue);
    border: 1px solid #388bfd;
    white-space: nowrap;
    margin-top: 4px;
  }

  /* ── Page body ── */

  .page-body {
    max-width: 1200px;
    margin: 0 auto;
    padding: 32px 32px 64px;
    display: flex;
    flex-direction: column;
    gap: 40px;
  }

  /* ── Section ── */

  .section {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .section-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }

  .section-subtitle {
    font-size: 13px;
    color: var(--text-mid);
    margin-top: -8px;
  }

  /* ── Overview cards ── */

  .overview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 16px;
  }

  .overview-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .card-depth-badge {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    font-family: var(--mono);
    align-self: flex-start;
  }

  .card-pass-rate {
    font-size: 36px;
    font-weight: 700;
    font-family: var(--mono);
    line-height: 1;
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .card-pass-label {
    font-size: 13px;
    color: var(--text-mid);
    font-family: var(--sans);
    font-weight: 400;
  }

  .card-stats {
    display: flex;
    gap: 16px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }

  .card-stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .card-stat-value {
    font-family: var(--mono);
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
  }

  .card-stat-label {
    font-size: 11px;
    color: var(--text-mid);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat-unit {
    font-size: 14px;
    opacity: 0.7;
  }

  /* ── Fields matrix ── */

  .matrix-wrap {
    overflow-x: auto;
  }

  .matrix-table {
    border-collapse: collapse;
    width: 100%;
    font-size: 13px;
  }

  .matrix-field-header {
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-mid);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 8px 12px;
    background: var(--bg-card);
    border-bottom: 1px solid var(--border);
  }

  .matrix-depth-header {
    text-align: center;
    padding: 8px 12px;
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 600;
    border-bottom: 1px solid var(--border);
  }

  .matrix-group-row td {
    background: #1c2128;
    padding: 5px 12px;
    font-size: 11px;
    font-weight: 700;
    color: var(--text-mid);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border-top: 1px solid var(--border);
  }

  .matrix-field-row:hover td {
    background: var(--bg-hover);
  }

  .matrix-field-name {
    padding: 6px 12px;
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text);
    border-right: 1px solid var(--border);
  }

  .matrix-cell {
    text-align: center;
    padding: 6px 16px;
    font-size: 14px;
    font-weight: 700;
    border-right: 1px solid var(--border);
  }

  .matrix-cell-yes {
    color: var(--green);
    background: rgba(63, 185, 80, 0.05);
  }

  .matrix-cell-no {
    color: var(--text-soft);
  }

  /* ── Diff panels ── */

  .diff-panel {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }

  .diff-panel-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    cursor: pointer;
    user-select: none;
    list-style: none;
    background: var(--bg-card);
  }

  .diff-panel-summary::-webkit-details-marker { display: none; }

  .diff-panel-summary:hover {
    background: var(--bg-hover);
  }

  .diff-depth-badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 600;
    font-family: var(--mono);
  }

  .diff-chevron {
    margin-left: auto;
    color: var(--text-soft);
    font-size: 12px;
    transition: transform 0.2s;
  }

  details[open] .diff-chevron {
    transform: rotate(180deg);
  }

  .diff-body {
    padding: 0;
    border-top: 1px solid var(--border);
    overflow-x: auto;
  }

  .diff-toolbar {
    padding: 6px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-alt);
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .diff-view-group {
    display: flex;
    border: 1px solid var(--border);
    border-radius: 5px;
    overflow: hidden;
  }
  .diff-view-btn {
    background: var(--bg-card);
    color: var(--text-mid);
    border: none;
    padding: 3px 10px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    letter-spacing: 0.04em;
    transition: background 0.12s, color 0.12s;
  }
  .diff-view-btn + .diff-view-btn { border-left: 1px solid var(--border); }
  .diff-view-btn.active {
    background: var(--accent);
    color: #fff;
  }
  .diff-view-btn:not(.active):hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .diff-toggle {
    font-size: 12px;
    color: var(--text-mid);
    cursor: pointer;
    user-select: none;
  }
  .diff-toggle input { cursor: pointer; margin-right: 4px; }

  /* Unified diff specific */
  table.diff-table.unified thead th { }
  table.diff-table.unified td.ln { width: 40px; min-width: 40px; }
  table.diff-table.unified td.u-marker {
    width: 18px; min-width: 18px;
    text-align: center;
    padding: 0 2px;
    font-weight: 700;
    user-select: none;
    border-right: 1px solid var(--border);
    vertical-align: top;
  }
  table.diff-table.unified tr.u-removed td { background: #3d1f1f; color: #ffa198; }
  table.diff-table.unified tr.u-removed td.ln { color: var(--red); }
  table.diff-table.unified tr.u-removed td.u-marker { color: var(--red); }
  table.diff-table.unified tr.u-added td { background: #1a4731; color: #56d364; }
  table.diff-table.unified tr.u-added td.ln { color: var(--green); }
  table.diff-table.unified tr.u-added td.u-marker { color: var(--green); }
  table.diff-table.unified tr.u-same td { background: var(--bg); color: var(--text-soft); }
  table.diff-table.unified tr.u-same td.code { color: var(--text-mid); }

  .diff-loading {
    padding: 20px;
    color: var(--text-mid);
    font-size: 13px;
  }

  table.diff-table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--mono);
    font-size: 12px;
    line-height: 1.6;
  }

  table.diff-table thead th {
    background: #1c2128;
    color: var(--text-mid);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 6px 12px;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }

  table.diff-table thead th:nth-child(3) {
    border-left: 1px solid var(--border);
  }

  td.ln {
    width: 48px;
    min-width: 48px;
    text-align: right;
    padding: 0 8px;
    color: var(--text-soft);
    user-select: none;
    border-right: 1px solid var(--border);
    vertical-align: top;
  }

  td.code {
    padding: 0 12px;
    white-space: pre;
    vertical-align: top;
  }

  td.ln.right-ln {
    border-left: 1px solid var(--border);
  }

  tr.same td { background: var(--bg); color: var(--text); }
  tr.same td.ln { color: var(--text-soft); }

  tr.removed td.left-ln, tr.removed td.left-code { background: #3d1f1f; }
  tr.removed td.left-ln { color: var(--red); }
  tr.removed td.left-code { color: #ffa198; }
  tr.removed td.right-ln, tr.removed td.right-code { background: var(--bg); }

  tr.added td.right-ln, tr.added td.right-code { background: #1a4731; }
  tr.added td.right-ln { color: var(--green); }
  tr.added td.right-code { color: #56d364; }
  tr.added td.left-ln, tr.added td.left-code { background: var(--bg); }

  tr.modified td.left-ln, tr.modified td.left-code { background: #3d1f1f; }
  tr.modified td.left-ln { color: var(--red); }
  tr.modified td.left-code { color: #ffa198; }
  tr.modified td.right-ln, tr.modified td.right-code { background: #1a4731; }
  tr.modified td.right-ln { color: var(--green); }
  tr.modified td.right-code { color: #56d364; }

  .collapse-row td {
    background: #161b22;
    color: var(--text-mid);
    text-align: center;
    font-size: 11px;
    padding: 5px;
    cursor: pointer;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }

  .collapse-row:hover td {
    background: var(--bg-hover);
    color: var(--text);
  }

  .diff-no-original {
    padding: 20px;
    color: var(--text-mid);
    font-size: 13px;
    font-style: italic;
  }

  /* ── Notes ── */

  .notes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 16px;
  }

  .notes-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .notes-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .notes-depth-badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 600;
    font-family: var(--mono);
  }

  .notes-text {
    font-size: 13px;
    color: var(--text-mid);
    line-height: 1.7;
    white-space: pre-wrap;
  }

  /* ── Verdict ── */

  .verdict-section {
    padding: 24px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .verdict-section .section-title {
    border-color: var(--border);
  }

  .verdict-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
  }

  .verdict-item {
    text-align: center;
  }

  .verdict-depth {
    font-family: var(--mono);
    font-size: 12px;
    margin-bottom: 4px;
  }

  .verdict-interpretation {
    margin-top: 16px;
    padding: 14px 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .verdict-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .verdict-list li {
    font-size: 13px;
    color: var(--text-mid);
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }

  .verdict-list li::before {
    content: '→';
    color: var(--text-soft);
    flex-shrink: 0;
  }
</style>
</head>
<body>

  <div class="header">
    <div class="header-inner">
      <div>
        <h1>LAC Reconstruction Depth Experiment — ${esc(projectName)}</h1>
        <div class="subtitle">How much context does faithful reconstruction actually need?</div>
      </div>
      <span class="header-badge">LAC Experiment</span>
    </div>
  </div>

  <div class="page-body">
    ${overviewSection}
    ${matrixSection}
    ${diffSection}
    ${crossDepthSection}
    ${notesSection}
    ${verdictSection}
  </div>

<script>
(function () {
  'use strict';

  var DATA = ${dataJson};
  var original = DATA.original || '';
  var hasOriginal = original.length > 0;

  // ── LCS diff algorithm (same as lac-diff.html) ───────────────────────────

  function lcs(a, b) {
    var m = a.length, n = b.length;
    var dp = [];
    for (var i = 0; i <= m; i++) {
      dp[i] = new Array(n + 1).fill(0);
    }
    for (var i = 1; i <= m; i++) {
      for (var j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
    var i = m, j = n, ops = [];
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
        ops.unshift({ t: '=', l: a[i - 1], r: b[j - 1], li: i, ri: j });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        ops.unshift({ t: '+', r: b[j - 1], ri: j });
        j--;
      } else {
        ops.unshift({ t: '-', l: a[i - 1], li: i });
        i--;
      }
    }
    return ops;
  }

  function pairOps(ops) {
    var paired = [], i = 0;
    while (i < ops.length) {
      var op = ops[i];
      if (op.t === '-' && i + 1 < ops.length && ops[i + 1].t === '+') {
        paired.push({ t: '~', l: op.l, li: op.li, r: ops[i + 1].r, ri: ops[i + 1].ri });
        i += 2;
      } else {
        paired.push(op);
        i++;
      }
    }
    return paired;
  }

  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function buildDiffTable(origLines, reconLines) {
    var ops = pairOps(lcs(origLines, reconLines));
    var rows = [], lNum = 0, rNum = 0;

    for (var k = 0; k < ops.length; k++) {
      var op = ops[k];
      if (op.t === '=')      { lNum++; rNum++; }
      else if (op.t === '-') { lNum++; }
      else if (op.t === '+') { rNum++; }
      else                   { lNum++; rNum++; }
      rows.push(Object.assign({}, op, { lNum: lNum, rNum: rNum }));
    }

    var CONTEXT = 4, COLLAPSE = 6;
    var changed = new Set();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].t !== '=') {
        for (var j = Math.max(0, i - CONTEXT); j <= Math.min(rows.length - 1, i + CONTEXT); j++) {
          changed.add(j);
        }
      }
    }

    var table = document.createElement('table');
    table.className = 'diff-table';

    var thead = document.createElement('thead');
    thead.innerHTML = '<tr><th colspan="2">Original</th><th colspan="2">Reconstructed (Depth ' + reconLines._depth + ')</th></tr>';
    table.appendChild(thead);

    var tbody = document.createElement('tbody');

    function renderRow(row) {
      var tr = document.createElement('tr');
      if (row.t === '=') {
        tr.className = 'same';
        tr.innerHTML =
          '<td class="ln">' + row.lNum + '</td><td class="code">' + escHtml(row.l) + '</td>' +
          '<td class="ln right-ln">' + row.rNum + '</td><td class="code">' + escHtml(row.r) + '</td>';
      } else if (row.t === '-') {
        tr.className = 'removed';
        tr.innerHTML =
          '<td class="ln left-ln">' + row.lNum + '</td><td class="code left-code">' + escHtml(row.l) + '</td>' +
          '<td class="ln right-ln"></td><td class="code right-code"></td>';
      } else if (row.t === '+') {
        tr.className = 'added';
        tr.innerHTML =
          '<td class="ln left-ln"></td><td class="code left-code"></td>' +
          '<td class="ln right-ln">' + row.rNum + '</td><td class="code right-code">' + escHtml(row.r) + '</td>';
      } else {
        tr.className = 'modified';
        tr.innerHTML =
          '<td class="ln left-ln">' + row.lNum + '</td><td class="code left-code">' + escHtml(row.l) + '</td>' +
          '<td class="ln right-ln">' + row.rNum + '</td><td class="code right-code">' + escHtml(row.r) + '</td>';
      }
      tbody.appendChild(tr);
    }

    function flushCollapse(collapseStart, collapseCount) {
      if (collapseCount <= 0) return;
      if (collapseCount <= COLLAPSE) {
        for (var k = collapseStart; k < collapseStart + collapseCount; k++) renderRow(rows[k]);
      } else {
        var tr = document.createElement('tr');
        tr.className = 'collapse-row';
        tr.innerHTML = '<td colspan="4">\u2195 ' + collapseCount + ' unchanged lines</td>';
        tbody.appendChild(tr);
      }
    }

    var inCollapse = false, collapseStart = 0, collapseCount = 0;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.t === '=' && !changed.has(i)) {
        if (!inCollapse) { inCollapse = true; collapseStart = i; collapseCount = 0; }
        collapseCount++;
      } else {
        if (inCollapse) { flushCollapse(collapseStart, collapseCount); inCollapse = false; }
        renderRow(row);
      }
    }
    if (inCollapse) flushCollapse(collapseStart, collapseCount);

    table.appendChild(tbody);
    return table;
  }

  // ── Comment-stripping helper ─────────────────────────────────────────────

  function stripComments(lines) {
    var result = [];
    var inBlock = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (inBlock) {
        if (line.indexOf('*/') !== -1) inBlock = false;
        continue;
      }
      var trimmed = line.trim();
      if (trimmed === '') continue;
      if (trimmed.indexOf('/**') === 0 || (trimmed.indexOf('/*') === 0 && trimmed.indexOf('*/') === -1)) {
        inBlock = true;
        continue;
      }
      if (trimmed.indexOf('/*') === 0) continue;
      if (trimmed.indexOf('//') === 0) continue;
      result.push(line);
    }
    return result;
  }

  // ── Unified diff builder ─────────────────────────────────────────────────

  function buildUnifiedTable(leftLines, rightLines, leftHeader, rightHeader) {
    var ops = pairOps(lcs(leftLines, rightLines));
    var rows = [], lNum = 0, rNum = 0;
    for (var k = 0; k < ops.length; k++) {
      var op = ops[k];
      if (op.t === '=')      { lNum++; rNum++; rows.push({ t: '=',  ln: lNum, text: op.l }); }
      else if (op.t === '-') { lNum++;         rows.push({ t: '-',  ln: lNum, text: op.l }); }
      else if (op.t === '+') {         rNum++; rows.push({ t: '+',  ln: rNum, text: op.r }); }
      else                   { lNum++; rNum++;
        rows.push({ t: '-', ln: lNum, text: op.l });
        rows.push({ t: '+', ln: rNum, text: op.r });
      }
    }

    var CONTEXT = 4, COLLAPSE = 6;
    var changed = new Set();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].t !== '=') {
        for (var j = Math.max(0, i - CONTEXT); j <= Math.min(rows.length - 1, i + CONTEXT); j++) {
          changed.add(j);
        }
      }
    }

    var table = document.createElement('table');
    table.className = 'diff-table unified';

    var thead = document.createElement('thead');
    thead.innerHTML = '<tr><th colspan="3">' + escHtml(leftHeader || 'Left') + ' &rarr; ' + escHtml(rightHeader || 'Right') + '</th></tr>';
    table.appendChild(thead);

    var tbody = document.createElement('tbody');

    function renderURow(row) {
      var tr = document.createElement('tr');
      var marker = row.t === '-' ? '-' : row.t === '+' ? '+' : ' ';
      var cls = row.t === '-' ? 'u-removed' : row.t === '+' ? 'u-added' : 'u-same';
      tr.className = cls;
      tr.innerHTML =
        '<td class="u-marker">' + marker + '</td>' +
        '<td class="ln">' + row.ln + '</td>' +
        '<td class="code">' + escHtml(row.text) + '</td>';
      tbody.appendChild(tr);
    }

    function flushUCollapse(start, count) {
      if (count <= 0) return;
      if (count <= COLLAPSE) {
        for (var k = start; k < start + count; k++) renderURow(rows[k]);
      } else {
        var tr = document.createElement('tr');
        tr.className = 'collapse-row';
        tr.innerHTML = '<td colspan="3">\u2195 ' + count + ' unchanged lines</td>';
        tbody.appendChild(tr);
      }
    }

    var inCollapse = false, collapseStart = 0, collapseCount = 0;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.t === '=' && !changed.has(i)) {
        if (!inCollapse) { inCollapse = true; collapseStart = i; collapseCount = 0; }
        collapseCount++;
      } else {
        if (inCollapse) { flushUCollapse(collapseStart, collapseCount); inCollapse = false; }
        renderURow(row);
      }
    }
    if (inCollapse) flushUCollapse(collapseStart, collapseCount);

    table.appendChild(tbody);
    return table;
  }

  // ── Panel state & render helpers ─────────────────────────────────────────

  function renderPanel(container, leftLines, rightLines, mode, lHeader, rHeader) {
    var table = mode === 'unified'
      ? buildUnifiedTable(leftLines, rightLines, lHeader, rHeader)
      : buildDiffTable(leftLines, rightLines);
    // Retitle split table header if custom headers given
    if (mode === 'split' && (lHeader || rHeader)) {
      var thead = table.querySelector('thead tr');
      if (thead) {
        thead.innerHTML =
          '<th colspan="2">' + escHtml(lHeader || '') + '</th>' +
          '<th colspan="2">' + escHtml(rHeader || '') + '</th>';
      }
    }
    container.innerHTML = '';
    container.appendChild(table);
  }

  function wireViewGroup(group, renderFn) {
    var btns = group.querySelectorAll('.diff-view-btn');
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        btns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        renderFn(btn.getAttribute('data-mode'));
      });
    });
  }

  // ── Wire up vs-original diff panels ─────────────────────────────────────

  var origLines = original.split('\\n');

  DATA.results.forEach(function (r) {
    var container = document.getElementById('diff-body-' + r.depth);
    if (!container) return;

    if (!hasOriginal) {
      var p = document.createElement('p');
      p.className = 'diff-no-original';
      p.textContent = 'No original source provided — diff not available.';
      container.innerHTML = '';
      container.appendChild(p);
      return;
    }

    var rawReconLines = r.reconstruction.split('\\n');
    var currentMode = 'split';
    var currentStrip = true;

    function render() {
      var oLines = currentStrip ? stripComments(origLines) : origLines;
      var rLines = currentStrip ? stripComments(rawReconLines) : rawReconLines;
      rLines._depth = r.depth;
      renderPanel(container, oLines, rLines, currentMode, 'Original', 'D' + r.depth + ' ' + r.label);
    }

    render();

    var stripToggle = document.querySelector('.diff-strip-toggle[data-depth="' + r.depth + '"]');
    if (stripToggle) {
      stripToggle.addEventListener('change', function () { currentStrip = this.checked; render(); });
    }

    var viewGroup = document.querySelector('.diff-view-group[data-target="diff-body-' + r.depth + '"]');
    if (viewGroup) {
      wireViewGroup(viewGroup, function (mode) { currentMode = mode; render(); });
    }
  });

  // ── Wire up cross-depth diff panels ─────────────────────────────────────

  for (var di = 0; di < DATA.results.length - 1; di++) {
    (function (a, b) {
      var container = document.getElementById('cross-diff-body-' + a.depth + '-' + b.depth);
      if (!container) return;

      var aLines = a.reconstruction.split('\\n');
      var bLines = b.reconstruction.split('\\n');
      var lHeader = 'D' + a.depth + ' ' + a.label;
      var rHeader = 'D' + b.depth + ' ' + b.label;
      var currentMode = 'split';

      function render() {
        bLines._depth = b.depth;
        renderPanel(container, aLines, bLines, currentMode, lHeader, rHeader);
      }

      render();

      var viewGroup = document.querySelector('.diff-view-group[data-target="cross-diff-body-' + a.depth + '-' + b.depth + '"]');
      if (viewGroup) {
        wireViewGroup(viewGroup, function (mode) { currentMode = mode; render(); });
      }
    })(DATA.results[di], DATA.results[di + 1]);
  }

})();
</script>
</body>
</html>`
}

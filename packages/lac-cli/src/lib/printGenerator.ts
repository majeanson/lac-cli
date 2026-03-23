import type { ScannedFeature } from './scanner.js'

type Feature = ScannedFeature['feature']

// ── Helpers ────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Minimal markdown → HTML for print output.
 * Supports: **bold**, `inline code`, fenced code blocks, bullet lists,
 * ordered lists, headings (h1–h3), and paragraphs.
 * HTML-escapes all raw text before processing inline patterns.
 */
function mdToHtml(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i] ?? ''

    // ── Fenced code block ───────────────────────────────────────────────────
    if (line.startsWith('```')) {
      const lang = esc(line.slice(3).trim())
      const codeLines: string[] = []
      i++
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) {
        codeLines.push(esc(lines[i] ?? ''))
        i++
      }
      if (i < lines.length) i++ // skip closing fence
      const langAttr = lang ? ` class="language-${lang}"` : ''
      out.push(`<pre><code${langAttr}>${codeLines.join('\n')}</code></pre>`)
      continue
    }

    // ── Headings ─────────────────────────────────────────────────────────────
    if (line.startsWith('### ')) {
      out.push(`<h3>${renderInline(esc(line.slice(4)))}</h3>`)
      i++; continue
    }
    if (line.startsWith('## ')) {
      out.push(`<h2>${renderInline(esc(line.slice(3)))}</h2>`)
      i++; continue
    }
    if (line.startsWith('# ')) {
      out.push(`<h1>${renderInline(esc(line.slice(2)))}</h1>`)
      i++; continue
    }

    // ── Unordered list ────────────────────────────────────────────────────────
    if (/^[-*] /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*] /.test(lines[i] ?? '')) {
        items.push(`<li>${renderInline(esc((lines[i] ?? '').slice(2)))}</li>`)
        i++
      }
      out.push(`<ul>${items.join('')}</ul>`)
      continue
    }

    // ── Ordered list ─────────────────────────────────────────────────────────
    if (/^[1-9]\d*\. /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[1-9]\d*\. /.test(lines[i] ?? '')) {
        items.push(`<li>${renderInline(esc((lines[i] ?? '').replace(/^[1-9]\d*\. /, '')))}</li>`)
        i++
      }
      out.push(`<ol>${items.join('')}</ol>`)
      continue
    }

    // ── Blank line ────────────────────────────────────────────────────────────
    if (line.trim() === '') { i++; continue }

    // ── Paragraph ─────────────────────────────────────────────────────────────
    const paraLines: string[] = []
    while (
      i < lines.length &&
      (lines[i] ?? '').trim() !== '' &&
      !(lines[i] ?? '').startsWith('#') &&
      !(lines[i] ?? '').startsWith('```') &&
      !/^[-*] /.test(lines[i] ?? '') &&
      !/^[1-9]\d*\. /.test(lines[i] ?? '')
    ) {
      paraLines.push(lines[i] ?? '')
      i++
    }
    if (paraLines.length > 0) {
      out.push(`<p>${renderInline(esc(paraLines.join(' ')))}</p>`)
    }
  }

  return out.join('\n')
}

function renderInline(s: string): string {
  // Input is already HTML-escaped — only apply span-level replacements.
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
}

// ── Status helpers ─────────────────────────────────────────────────────────────

function statusColor(status: string): string {
  switch (status) {
    case 'active':     return '#4aad72'
    case 'frozen':     return '#5b82cc'
    case 'deprecated': return '#cc5b5b'
    default:           return '#c4a255'
  }
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

// ── Count helpers ──────────────────────────────────────────────────────────────

function countByStatus(features: Feature[], status: string): number {
  return features.filter(f => f.status === status).length
}

// ── CSS ───────────────────────────────────────────────────────────────────────

function buildCss(today: string): string {
  return `
  /* ── CSS counters for page simulation ───────────────────────────────────── */
  :root {
    --page-bg: #ffffff;
    --page-shadow: 0 2px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06);
    --ink: #1a1714;
    --ink-mid: #4a3f35;
    --ink-soft: #8a7a6a;
    --ink-faint: #c8bdb4;
    --rule: #e0d8d0;
    --accent: #c4a255;
    --code-bg: #f5f2ee;
    --status-active: #2a8a52;
    --status-draft: #a07828;
    --status-frozen: #3a60a8;
    --status-deprecated: #a83a3a;
  }

  /* ── Reset ───────────────────────────────────────────────────────────────── */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* ── Screen layout ───────────────────────────────────────────────────────── */
  @media screen {
    body {
      background: #e8e0d8;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      font-size: 14px;
      color: var(--ink);
      padding: 40px 20px 80px;
      line-height: 1.6;
      counter-reset: page-num;
    }
    .page {
      background: var(--page-bg);
      max-width: 800px;
      margin: 0 auto 32px;
      padding: 64px 72px;
      border-radius: 4px;
      box-shadow: var(--page-shadow);
      position: relative;
      counter-increment: page-num;
    }
    .page + .page {
      /* visual separation between pages on screen */
    }
  }

  /* ── Print layout ────────────────────────────────────────────────────────── */
  @media print {
    @page {
      size: A4;
      margin: 18mm 20mm 22mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      font-size: 11pt;
      color: #1a1714;
      line-height: 1.55;
      background: #fff;
      counter-reset: page-num;
    }
    .page {
      padding: 0;
      margin: 0;
      counter-increment: page-num;
    }
    .page + .page {
      page-break-before: always;
    }
    /* Print footers via running elements aren't universally supported;
       we use a CSS-counter based footer pseudo-element as a best-effort. */
  }

  /* ── Page footer (screen + print) ───────────────────────────────────────── */
  .page-footer {
    margin-top: 40px;
    padding-top: 12px;
    border-top: 1px solid var(--rule);
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 10px;
    color: var(--ink-faint);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  }
  .page-footer .footer-left  { text-align: left; }
  .page-footer .footer-right { text-align: right; }

  /* ── Page top rule ───────────────────────────────────────────────────────── */
  .page-rule {
    border: none;
    border-top: 2px solid var(--accent);
    margin-bottom: 28px;
    opacity: 0.6;
  }

  /* ── Cover page ──────────────────────────────────────────────────────────── */
  .cover {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 560px;
  }
  .cover-eyebrow {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 16px;
  }
  .cover-title {
    font-size: 3rem;
    font-weight: 800;
    color: var(--ink);
    line-height: 1.1;
    letter-spacing: -0.03em;
    margin-bottom: 12px;
  }
  .cover-subtitle {
    font-size: 1.1rem;
    color: var(--ink-mid);
    font-weight: 400;
    margin-bottom: 40px;
  }
  .cover-meta {
    font-size: 12px;
    color: var(--ink-soft);
    border-top: 1px solid var(--rule);
    padding-top: 20px;
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
  }
  .cover-meta-item strong {
    display: block;
    font-size: 10px;
    letter-spacing: 0.10em;
    text-transform: uppercase;
    color: var(--ink-faint);
    margin-bottom: 3px;
    font-weight: 600;
  }
  .cover-stat {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }
  .cover-stat-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
  }

  /* ── Table of contents ───────────────────────────────────────────────────── */
  .toc-title {
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--ink);
    margin-bottom: 24px;
    letter-spacing: -0.01em;
  }
  .toc-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .toc-item {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 7px 0;
    border-bottom: 1px solid var(--rule);
  }
  .toc-num {
    font-size: 11px;
    color: var(--ink-faint);
    font-variant-numeric: tabular-nums;
    min-width: 24px;
    flex-shrink: 0;
  }
  .toc-key {
    font-family: 'Cascadia Code','Fira Code','JetBrains Mono','Consolas',monospace;
    font-size: 11px;
    color: var(--ink-soft);
    flex-shrink: 0;
    min-width: 160px;
  }
  .toc-feature-title {
    font-size: 13px;
    color: var(--ink-mid);
    flex: 1;
  }
  .toc-badge {
    font-size: 10px;
    font-weight: 600;
    border-radius: 3px;
    padding: 1px 6px;
    flex-shrink: 0;
  }

  /* ── Feature page ────────────────────────────────────────────────────────── */
  .feature-eyebrow {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }
  .feature-key {
    font-family: 'Cascadia Code','Fira Code','JetBrains Mono','Consolas',monospace;
    font-size: 11px;
    color: var(--ink-soft);
  }
  .feature-badge {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border-radius: 3px;
    padding: 2px 7px;
  }
  .feature-domain {
    font-size: 11px;
    color: var(--ink-soft);
    background: #f0ece8;
    border-radius: 3px;
    padding: 2px 7px;
  }
  .feature-h1 {
    font-size: 2rem;
    font-weight: 800;
    color: var(--ink);
    line-height: 1.15;
    letter-spacing: -0.025em;
    margin-bottom: 24px;
  }

  /* ── Section headings ────────────────────────────────────────────────────── */
  .section {
    margin-top: 24px;
  }
  .section-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink-faint);
    margin-bottom: 8px;
    border-bottom: 1px solid var(--rule);
    padding-bottom: 5px;
  }

  /* ── Problem block ───────────────────────────────────────────────────────── */
  .problem-block {
    padding: 14px 18px;
    border-left: 3px solid var(--accent);
    background: #faf7f2;
    border-radius: 0 5px 5px 0;
    font-size: 14px;
    color: var(--ink-mid);
    line-height: 1.7;
  }
  .problem-block p { margin: 0; }
  .problem-block p + p { margin-top: 8px; }

  /* ── Body text ───────────────────────────────────────────────────────────── */
  .body-text {
    font-size: 13px;
    color: var(--ink-mid);
    line-height: 1.65;
  }
  .body-text p { margin: 0; }
  .body-text p + p { margin-top: 10px; }
  .body-text ul, .body-text ol {
    margin: 8px 0 0 20px;
  }
  .body-text li { margin-bottom: 3px; }
  .body-text code {
    font-family: 'Cascadia Code','Fira Code','JetBrains Mono','Consolas',monospace;
    font-size: 11px;
    background: var(--code-bg);
    border-radius: 3px;
    padding: 1px 4px;
  }
  .body-text pre {
    background: var(--code-bg);
    border-radius: 5px;
    padding: 12px 14px;
    overflow-x: auto;
    margin: 10px 0;
    font-size: 11px;
    line-height: 1.5;
  }
  .body-text pre code {
    background: none;
    border-radius: 0;
    padding: 0;
    font-size: inherit;
  }
  .body-text h1, .body-text h2, .body-text h3 {
    color: var(--ink);
    margin: 14px 0 6px;
    font-weight: 700;
  }
  .body-text h1 { font-size: 15px; }
  .body-text h2 { font-size: 14px; }
  .body-text h3 { font-size: 13px; }

  /* ── Decisions ───────────────────────────────────────────────────────────── */
  .decisions-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .decision-item {
    padding: 12px 14px;
    background: #faf7f2;
    border: 1px solid var(--rule);
    border-radius: 5px;
  }
  .decision-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 4px;
    flex-wrap: wrap;
  }
  .decision-num {
    font-size: 11px;
    color: var(--accent);
    font-weight: 700;
    min-width: 16px;
  }
  .decision-text {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
    flex: 1;
  }
  .decision-date {
    font-family: 'Cascadia Code','Fira Code','JetBrains Mono','Consolas',monospace;
    font-size: 10px;
    color: var(--ink-faint);
  }
  .decision-rationale {
    font-size: 12px;
    color: var(--ink-mid);
    line-height: 1.55;
    padding-left: 24px;
  }
  .decision-alts {
    font-size: 11px;
    color: var(--ink-soft);
    margin-top: 5px;
    padding-left: 24px;
    font-style: italic;
  }

  /* ── Known limitations ───────────────────────────────────────────────────── */
  .limitations-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .limitations-list li {
    font-size: 13px;
    color: var(--ink-soft);
    padding-left: 14px;
    position: relative;
  }
  .limitations-list li::before {
    content: '–';
    position: absolute;
    left: 0;
    color: var(--ink-faint);
  }

  /* ── Tags ────────────────────────────────────────────────────────────────── */
  .tags-row {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 6px;
  }
  .tag {
    font-family: 'Cascadia Code','Fira Code','JetBrains Mono','Consolas',monospace;
    font-size: 10px;
    color: var(--ink-soft);
    background: #f0ece8;
    border-radius: 3px;
    padding: 2px 7px;
  }

  /* ── Success criteria ────────────────────────────────────────────────────── */
  .success-block {
    padding: 12px 14px;
    background: #faf7f2;
    border: 1px solid var(--rule);
    border-radius: 5px;
    font-size: 13px;
    color: var(--ink-mid);
    line-height: 1.6;
  }
  .success-block p { margin: 0; }
  .success-block p + p { margin-top: 8px; }
  .success-block ul { margin: 6px 0 0 18px; }
  .success-block li { margin-bottom: 3px; }
  .success-block code {
    font-family: 'Cascadia Code','Fira Code','JetBrains Mono','Consolas',monospace;
    font-size: 11px;
    background: var(--code-bg);
    border-radius: 3px;
    padding: 1px 4px;
  }
`
}

// ── Cover page ─────────────────────────────────────────────────────────────────

function buildCoverPage(features: Feature[], projectName: string, viewLabel: string, today: string): string {
  const active     = countByStatus(features, 'active')
  const frozen     = countByStatus(features, 'frozen')
  const draft      = countByStatus(features, 'draft')
  const deprecated = countByStatus(features, 'deprecated')
  const total      = features.length

  const statRow = (label: string, count: number, color: string) =>
    count > 0
      ? `<span class="cover-stat">
           <span class="cover-stat-dot" style="background:${color}"></span>
           <span>${count} ${label}</span>
         </span>`
      : ''

  return `
  <div class="page">
    <hr class="page-rule">
    <div class="cover">
      <div class="cover-eyebrow">◈ life-as-code · Feature Documentation</div>
      <div class="cover-title">${esc(projectName)}</div>
      <div class="cover-subtitle">${esc(viewLabel)}</div>
      <div class="cover-meta">
        <div class="cover-meta-item">
          <strong>Generated</strong>
          ${today}
        </div>
        <div class="cover-meta-item">
          <strong>Total features</strong>
          ${total}
        </div>
        <div class="cover-meta-item">
          <strong>By status</strong>
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px">
            ${statRow('active', active, '#4aad72')}
            ${statRow('frozen', frozen, '#5b82cc')}
            ${statRow('draft', draft, '#c4a255')}
            ${statRow('deprecated', deprecated, '#cc5b5b')}
          </div>
        </div>
      </div>
    </div>
    <div class="page-footer">
      <span class="footer-left">${esc(projectName)}</span>
      <span class="footer-right">${today}</span>
    </div>
  </div>`
}

// ── Table of contents ──────────────────────────────────────────────────────────

function buildTocPage(features: Feature[], projectName: string, today: string): string {
  const items = features.map((f, idx) => {
    const color = statusColor(f.status)
    const label = statusLabel(f.status)
    return `
    <li class="toc-item">
      <span class="toc-num">${idx + 1}.</span>
      <span class="toc-key">${esc(f.featureKey)}</span>
      <span class="toc-feature-title">${esc(f.title)}</span>
      <span class="toc-badge" style="color:${color};background:${color}1a">${esc(label)}</span>
    </li>`
  }).join('')

  return `
  <div class="page">
    <hr class="page-rule">
    <div class="toc-title">Table of Contents</div>
    <ol class="toc-list">
      ${items}
    </ol>
    <div class="page-footer">
      <span class="footer-left">${esc(projectName)}</span>
      <span class="footer-right">${today}</span>
    </div>
  </div>`
}

// ── Feature page ───────────────────────────────────────────────────────────────

function buildFeaturePage(feature: Feature, projectName: string, today: string): string {
  const color = statusColor(feature.status)
  const label = statusLabel(feature.status)

  // ── Decisions ────────────────────────────────────────────────────────────────
  const decisionsHtml = feature.decisions && feature.decisions.length > 0
    ? `
      <div class="section">
        <div class="section-label">Decisions</div>
        <ol class="decisions-list">
          ${feature.decisions.map((d, i) => `
            <li class="decision-item">
              <div class="decision-header">
                <span class="decision-num">${i + 1}.</span>
                <span class="decision-text">${esc(d.decision)}</span>
                ${d.date ? `<span class="decision-date">${esc(d.date)}</span>` : ''}
              </div>
              <div class="decision-rationale">${esc(d.rationale)}</div>
              ${d.alternativesConsidered && d.alternativesConsidered.length > 0
                ? `<div class="decision-alts">Alternatives considered: ${d.alternativesConsidered.map(a => esc(a)).join(', ')}</div>`
                : ''}
            </li>`).join('')}
        </ol>
      </div>`
    : ''

  // ── Analysis ─────────────────────────────────────────────────────────────────
  const analysisHtml = feature.analysis
    ? `
      <div class="section">
        <div class="section-label">Analysis</div>
        <div class="body-text">${mdToHtml(feature.analysis)}</div>
      </div>`
    : ''

  // ── Implementation ────────────────────────────────────────────────────────────
  const implementationHtml = feature.implementation
    ? `
      <div class="section">
        <div class="section-label">Implementation</div>
        <div class="body-text">${mdToHtml(feature.implementation)}</div>
      </div>`
    : ''

  // ── Success criteria ──────────────────────────────────────────────────────────
  const successHtml = feature.successCriteria
    ? `
      <div class="section">
        <div class="section-label">Success Criteria</div>
        <div class="success-block body-text">${mdToHtml(feature.successCriteria)}</div>
      </div>`
    : ''

  // ── Known limitations ─────────────────────────────────────────────────────────
  const limitationsHtml = feature.knownLimitations && feature.knownLimitations.length > 0
    ? `
      <div class="section">
        <div class="section-label">Known Limitations</div>
        <ul class="limitations-list">
          ${feature.knownLimitations.map(l => `<li>${esc(l)}</li>`).join('')}
        </ul>
      </div>`
    : ''

  // ── Tags ──────────────────────────────────────────────────────────────────────
  const tagsHtml = feature.tags && feature.tags.length > 0
    ? `
      <div class="section">
        <div class="section-label">Tags</div>
        <div class="tags-row">
          ${feature.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}
        </div>
      </div>`
    : ''

  return `
  <div class="page">
    <hr class="page-rule">
    <div class="feature-eyebrow">
      <span class="feature-key">${esc(feature.featureKey)}</span>
      <span class="feature-badge" style="color:${color};background:${color}1a">${esc(label)}</span>
      ${feature.domain ? `<span class="feature-domain">${esc(feature.domain)}</span>` : ''}
      ${feature.priority != null ? `<span class="feature-domain">P${feature.priority}</span>` : ''}
    </div>
    <h1 class="feature-h1">${esc(feature.title)}</h1>

    <div class="section">
      <div class="section-label">Problem</div>
      <div class="problem-block body-text">${mdToHtml(feature.problem)}</div>
    </div>

    ${analysisHtml}
    ${decisionsHtml}
    ${implementationHtml}
    ${limitationsHtml}
    ${successHtml}
    ${tagsHtml}

    <div class="page-footer">
      <span class="footer-left">${esc(projectName)}</span>
      <span class="footer-right">${today}</span>
    </div>
  </div>`
}

// ── Main generator ─────────────────────────────────────────────────────────────

/**
 * Generates a print-ready standalone HTML document for all features.
 * Includes a cover page, table of contents, and one page per feature.
 * Uses `@media print` with `page-break-before: always` between features.
 * No JavaScript, no external dependencies.
 */
export function generatePrint(features: Feature[], projectName: string, viewLabel?: string): string {
  const today       = new Date().toISOString().split('T')[0]!
  const resolvedLabel = viewLabel ?? 'Feature Documentation'

  const coverHtml   = buildCoverPage(features, projectName, resolvedLabel, today)
  const tocHtml     = buildTocPage(features, projectName, today)
  const featurePages = features.map(f => buildFeaturePage(f, projectName, today)).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)} — ${esc(resolvedLabel)}</title>
<style>
${buildCss(today)}
</style>
</head>
<body>

${coverHtml}
${tocHtml}
${featurePages}

</body>
</html>`
}

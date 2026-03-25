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

function renderInline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
}

/** Minimal markdown → HTML for postcard body text. */
function md(text: string): string {
  const escaped = esc(text)
  const lines = escaped.split('\n')
  const result: string[] = []
  let inList = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^[-*] /.test(trimmed)) {
      if (!inList) { result.push('<ul>'); inList = true }
      result.push(`<li>${renderInline(trimmed.slice(2))}</li>`)
    } else {
      if (inList) { result.push('</ul>'); inList = false }
      result.push(line)
    }
  }
  if (inList) result.push('</ul>')

  const blocks = result.join('\n').split(/\n{2,}/)
  return blocks.map(block => {
    const t = block.trim()
    if (!t) return ''
    if (t.startsWith('<ul>') || t.startsWith('<li>')) return t
    return `<p>${renderInline(t.replace(/\n/g, ' '))}</p>`
  }).filter(Boolean).join('\n')
}

function statusColor(status: string): string {
  switch (status) {
    case 'active':     return 'var(--status-active)'
    case 'frozen':     return 'var(--status-frozen)'
    case 'deprecated': return 'var(--status-deprecated)'
    default:           return 'var(--status-draft)'
  }
}

function statusBg(status: string): string {
  switch (status) {
    case 'active':     return 'var(--status-active-bg)'
    case 'frozen':     return 'var(--status-frozen-bg)'
    case 'deprecated': return 'var(--status-deprecated-bg)'
    default:           return 'var(--status-draft-bg)'
  }
}

// ── Main generator ─────────────────────────────────────────────────────────────

/**
 * Generates a standalone, shareable HTML "postcard" for a single feature.
 * Suitable for dropping in a Slack thread or design review — pure HTML/CSS,
 * no JavaScript, no external dependencies.
 */
export function generatePostcard(feature: Feature, projectName: string): string {
  const _dt = new Date()
  const today = `${_dt.getFullYear()}-${String(_dt.getMonth() + 1).padStart(2, '0')}-${String(_dt.getDate()).padStart(2, '0')}`

  const statusLabel = feature.status.charAt(0).toUpperCase() + feature.status.slice(1)
  const sColor = statusColor(feature.status)
  const sBg    = statusBg(feature.status)

  // ── Decisions block ──────────────────────────────────────────────────────────
  const decisionsHtml = feature.decisions && feature.decisions.length > 0
    ? `
      <section class="section">
        <h2 class="section-label">Decisions</h2>
        <ol class="decisions-list">
          ${feature.decisions.map((d, i) => `
            <li class="decision-item">
              <div class="decision-header">
                <span class="decision-index">${i + 1}</span>
                <span class="decision-text">${esc(d.decision)}</span>
                ${d.date ? `<span class="decision-date">${esc(d.date)}</span>` : ''}
              </div>
              <div class="decision-rationale">${esc(d.rationale)}</div>
              ${d.alternativesConsidered && d.alternativesConsidered.length > 0 ? `
                <div class="decision-alts">
                  <span class="alts-label">Alternatives considered:</span>
                  ${d.alternativesConsidered.map(a => `<span class="alt-pill">${esc(a)}</span>`).join('')}
                </div>
              ` : ''}
            </li>
          `).join('')}
        </ol>
      </section>`
    : ''

  // ── Success criteria block ───────────────────────────────────────────────────
  const successHtml = feature.successCriteria
    ? `
      <section class="section">
        <h2 class="section-label">Success Criteria</h2>
        <div class="success-card">${md(feature.successCriteria)}</div>
      </section>`
    : ''

  // ── Known limitations block ──────────────────────────────────────────────────
  const limitationsHtml = feature.knownLimitations && feature.knownLimitations.length > 0
    ? `
      <section class="section">
        <h2 class="section-label">Known Limitations</h2>
        <ul class="limitations-list">
          ${feature.knownLimitations.map(l => `<li>${esc(l)}</li>`).join('')}
        </ul>
      </section>`
    : ''

  // ── Tags row ─────────────────────────────────────────────────────────────────
  const tagsHtml = feature.tags && feature.tags.length > 0
    ? `
      <div class="tags-row">
        ${feature.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}
      </div>`
    : ''

  // ── Priority indicator ───────────────────────────────────────────────────────
  const priorityHtml = feature.priority != null
    ? `<span class="meta-pill priority-pill">P${feature.priority}</span>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(feature.title)} — ${esc(projectName)}</title>
<style>
  :root {
    --bg: #12100e;
    --bg-sidebar: #0e0c0a;
    --bg-card: #1a1714;
    --bg-hover: #201d1a;
    --border: #2a2420;
    --border-soft: #221e1b;
    --text: #e8ddd4;
    --text-mid: #b0a49c;
    --text-soft: #7a6a5a;
    --accent: #c4a255;
    --accent-warm: #e8b865;
    --mono: 'Cascadia Code','Fira Code','JetBrains Mono','Consolas',monospace;
    --sans: -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
    --status-active: #4aad72;
    --status-draft: #c4a255;
    --status-frozen: #5b82cc;
    --status-deprecated: #cc5b5b;
    --status-active-bg: rgba(74,173,114,0.12);
    --status-draft-bg: rgba(196,162,85,0.12);
    --status-frozen-bg: rgba(91,130,204,0.12);
    --status-deprecated-bg: rgba(204,91,91,0.12);
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--sans);
    font-size: 15px;
    line-height: 1.65;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 32px 16px 64px;
  }

  /* ── Card shell ────────────────────────────────────────────────────────────── */
  .postcard {
    width: 100%;
    max-width: 620px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }

  /* ── Top bar ───────────────────────────────────────────────────────────────── */
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 11px 20px;
    background: var(--bg-sidebar);
    border-bottom: 1px solid var(--border);
    gap: 12px;
  }
  .topbar-logo {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--accent);
    font-weight: 600;
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }
  .topbar-project {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text-soft);
    flex: 1;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .topbar-project strong {
    color: var(--text-mid);
    font-weight: 500;
  }
  .topbar-date {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text-soft);
    flex-shrink: 0;
  }

  /* ── Feature hero ──────────────────────────────────────────────────────────── */
  .hero {
    padding: 28px 28px 20px;
    border-bottom: 1px solid var(--border-soft);
  }
  .badges {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 14px;
    flex-wrap: wrap;
  }
  .badge-status {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding: 3px 9px;
    border-radius: 4px;
    color: ${sColor};
    background: ${sBg};
    border: 1px solid ${sColor}33;
  }
  .badge-domain {
    font-family: var(--mono);
    font-size: 11px;
    padding: 3px 9px;
    border-radius: 4px;
    color: var(--text-soft);
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border);
  }
  .meta-pill {
    font-family: var(--mono);
    font-size: 11px;
    padding: 3px 9px;
    border-radius: 4px;
    border: 1px solid var(--border);
    color: var(--text-soft);
    background: rgba(255,255,255,0.03);
  }
  .priority-pill {
    color: var(--accent);
    border-color: var(--accent)44;
    background: rgba(196,162,85,0.06);
  }
  .feature-title {
    font-size: 2.05rem;
    font-weight: 700;
    color: var(--text);
    line-height: 1.2;
    letter-spacing: -0.02em;
  }

  /* ── Body ──────────────────────────────────────────────────────────────────── */
  .body {
    padding: 0 28px 24px;
  }

  /* ── Problem block ─────────────────────────────────────────────────────────── */
  .problem-block {
    margin: 24px 0 0;
    padding: 16px 20px;
    border-left: 3px solid var(--accent);
    background: rgba(196,162,85,0.04);
    border-radius: 0 6px 6px 0;
  }
  .problem-label {
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 8px;
  }
  .problem-text {
    font-size: 1.05rem;
    color: var(--text-mid);
    line-height: 1.7;
  }
  .problem-text p { margin: 0; }
  .problem-text p + p { margin-top: 10px; }

  /* ── Sections ──────────────────────────────────────────────────────────────── */
  .section {
    margin-top: 24px;
  }
  .section-label {
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-soft);
    margin-bottom: 12px;
  }

  /* ── Decisions ─────────────────────────────────────────────────────────────── */
  .decisions-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .decision-item {
    padding: 14px 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 7px;
  }
  .decision-header {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 6px;
    flex-wrap: wrap;
  }
  .decision-index {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--accent);
    font-weight: 700;
    flex-shrink: 0;
    min-width: 16px;
  }
  .decision-text {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    flex: 1;
  }
  .decision-date {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--text-soft);
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 1px 6px;
    flex-shrink: 0;
  }
  .decision-rationale {
    font-size: 13px;
    color: var(--text-mid);
    line-height: 1.6;
    padding-left: 26px;
  }
  .decision-alts {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 8px;
    padding-left: 26px;
  }
  .alts-label {
    font-size: 11px;
    color: var(--text-soft);
  }
  .alt-pill {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--text-soft);
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 1px 6px;
  }

  /* ── Success criteria ──────────────────────────────────────────────────────── */
  .success-card {
    padding: 14px 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 7px;
    font-size: 13px;
    color: var(--text-mid);
    line-height: 1.65;
  }
  .success-card p { margin: 0; }
  .success-card p + p { margin-top: 8px; }
  .success-card ul { margin: 6px 0 0 18px; }
  .success-card li { margin-bottom: 3px; }
  .success-card code {
    font-family: var(--mono);
    font-size: 12px;
    background: rgba(255,255,255,0.05);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 1px 5px;
  }

  /* ── Known limitations ─────────────────────────────────────────────────────── */
  .limitations-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .limitations-list li {
    font-size: 13px;
    color: var(--text-soft);
    padding-left: 14px;
    position: relative;
  }
  .limitations-list li::before {
    content: '–';
    position: absolute;
    left: 0;
    color: var(--border);
  }

  /* ── Tags row ──────────────────────────────────────────────────────────────── */
  .tags-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid var(--border-soft);
  }
  .tag {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text-soft);
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 3px 8px;
  }

  /* ── Footer ────────────────────────────────────────────────────────────────── */
  .postcard-footer {
    padding: 16px 20px;
    background: var(--bg-sidebar);
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  .footer-brand {
    font-size: 11px;
    color: var(--text-soft);
  }
  .footer-key {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text-soft);
    opacity: 0.6;
  }
  .footer-sep {
    color: var(--border);
    font-size: 11px;
  }
</style>
</head>
<body>

<article class="postcard">

  <!-- Top bar -->
  <header class="topbar">
    <span class="topbar-logo">◈ lac</span>
    <span class="topbar-project">
      <strong>${esc(projectName)}</strong> / ${esc(feature.featureKey)}
    </span>
    <span class="topbar-date">${today}</span>
  </header>

  <!-- Hero -->
  <div class="hero">
    <div class="badges">
      <span class="badge-status">${esc(statusLabel)}</span>
      ${feature.domain ? `<span class="badge-domain">${esc(feature.domain)}</span>` : ''}
      ${priorityHtml}
      ${feature.owner ? `<span class="meta-pill">${esc(feature.owner)}</span>` : ''}
    </div>
    <h1 class="feature-title">${esc(feature.title)}</h1>
  </div>

  <!-- Body -->
  <div class="body">

    <!-- Problem -->
    <div class="problem-block">
      <div class="problem-label">Problem</div>
      <div class="problem-text">${md(feature.problem)}</div>
    </div>

    ${decisionsHtml}
    ${successHtml}
    ${limitationsHtml}
    ${tagsHtml}

  </div>

  <!-- Footer -->
  <footer class="postcard-footer">
    <span class="footer-brand">generated via life-as-code</span>
    <span class="footer-sep">·</span>
    <span class="footer-key">${esc(feature.featureKey)}</span>
  </footer>

</article>

</body>
</html>`
}

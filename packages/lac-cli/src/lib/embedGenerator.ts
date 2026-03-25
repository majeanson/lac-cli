/**
 * Embed generator — exports a compact stats widget.
 * Design intent: "Drop it in a README iframe or GitHub Pages sidebar."
 * The whole page IS the widget — no topbar, 380px card, zero external deps.
 *
 * Pure HTML/CSS — no JavaScript (except copy-to-clipboard for the embed code).
 */

import type { Feature } from '@life-as-code/feature-schema'

// ── Helpers ────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function completeness(f: Feature): number {
  const checks = [
    !!f.analysis,
    !!f.implementation,
    !!(f.decisions && f.decisions.length > 0),
    !!f.successCriteria,
    !!(f.knownLimitations && f.knownLimitations.length > 0),
    !!(f.tags && f.tags.length > 0),
    !!f.domain,
  ]
  return Math.round(checks.filter(Boolean).length / checks.length * 100)
}

function latestDate(features: Feature[]): string {
  let latest = ''
  for (const f of features) {
    if (f.lastVerifiedDate && f.lastVerifiedDate > latest) {
      latest = f.lastVerifiedDate
    }
    if (f.statusHistory) {
      for (const h of f.statusHistory) {
        if (h.date && h.date > latest) latest = h.date
      }
    }
  }
  return latest || today()
}

function uniqueDomains(features: Feature[]): string[] {
  return [...new Set(features.map(f => f.domain).filter(Boolean) as string[])].sort()
}

// ── Domain dot colors — cycle through a fixed palette ─────────────────────────

const DOT_PALETTE = ['#c4a255', '#4aad72', '#5b82cc', '#cc5b5b', '#9b7fd4', '#4ab5cc']

function domainDotColor(index: number): string {
  return DOT_PALETTE[index % DOT_PALETTE.length] ?? '#c4a255'
}

// ── Public API ──────────────────────────────────────────────────────────────────

export function generateEmbed(features: Feature[], projectName: string): string {
  const total     = features.length
  const frozen    = features.filter(f => f.status === 'frozen').length
  const frozenPct = total === 0 ? 0 : Math.round(frozen / total * 100)
  const avgComp   = total === 0
    ? 0
    : Math.round(features.reduce((sum, f) => sum + completeness(f), 0) / total)
  const totalDec  = features.reduce((sum, f) => sum + (f.decisions?.length ?? 0), 0)
  const domains   = uniqueDomains(features)
  const domainCount = domains.length
  const updated   = latestDate(features)

  const MAX_DOMAINS_SHOWN = 4
  const shownDomains = domains.slice(0, MAX_DOMAINS_SHOWN)
  const extraDomains = domains.length > MAX_DOMAINS_SHOWN ? domains.length - MAX_DOMAINS_SHOWN : 0

  const domainDots = shownDomains.map((d, i) =>
    `<span class="domain-dot-item">
        <span class="domain-dot" style="background:${domainDotColor(i)}"></span>
        <span class="domain-dot-name">${esc(d)}</span>
      </span>`
  ).join('')

  const extraBadge = extraDomains > 0
    ? `<span class="domain-extra">+${extraDomains} more</span>`
    : ''

  // The iframe embed code
  const iframeCode = `<iframe src="lac-embed.html" width="380" height="320" frameborder="0" style="border-radius:8px;"></iframe>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)} — LAC Embed</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:          #12100e;
  --bg-card:     #1a1714;
  --bg-hover:    #201d1a;
  --bg-sidebar:  #0e0c0a;
  --border:      #2a2420;
  --border-soft: #221e1b;
  --text:        #e8ddd4;
  --text-mid:    #b0a49c;
  --text-soft:   #7a6a5a;
  --accent:      #c4a255;
  --mono:        'Cascadia Code','Fira Code','JetBrains Mono','Consolas',monospace;
  --sans:        -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  --status-active:     #4aad72;
  --status-draft:      #c4a255;
  --status-frozen:     #5b82cc;
  --status-deprecated: #cc5b5b;
}

html, body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 16px;
  min-height: 100vh;
}

/* ── Widget card ── */
.widget {
  width: 380px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
}

/* ── Header ── */
.widget-header {
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--border);
}

.widget-brand {
  font-family: var(--mono);
  font-size: 15px;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 0.02em;
  margin-bottom: 2px;
}

.widget-sub {
  font-size: 11px;
  color: var(--text-soft);
  font-family: var(--mono);
  letter-spacing: 0.05em;
}

/* ── Stats row ── */
.widget-stats {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}

.stat-block {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-block + .stat-block {
  border-left: 1px solid var(--border);
  padding-left: 16px;
  margin-left: 0;
}

.stat-big {
  font-family: var(--mono);
  font-size: 1.7rem;
  font-weight: 700;
  color: var(--accent);
  line-height: 1;
}

.stat-lbl {
  font-size: 11px;
  color: var(--text-soft);
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

/* ── Completeness bar ── */
.widget-comp {
  padding: 12px 18px;
  border-bottom: 1px solid var(--border);
}

.comp-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.comp-label {
  font-size: 11px;
  color: var(--text-soft);
  flex-shrink: 0;
}

.comp-pct {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--accent);
  margin-left: auto;
}

.comp-bar-wrap {
  width: 100%;
  height: 6px;
  background: var(--border);
  border-radius: 3px;
  overflow: hidden;
}

.comp-bar {
  height: 100%;
  background: var(--accent);
  border-radius: 3px;
}

/* ── Domain row ── */
.widget-domains {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 11px 18px;
  border-bottom: 1px solid var(--border);
  min-height: 40px;
}

.domain-dot-item {
  display: flex;
  align-items: center;
  gap: 5px;
}

.domain-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.domain-dot-name {
  font-size: 12px;
  color: var(--text-mid);
  font-family: var(--mono);
}

.domain-extra {
  font-size: 11px;
  color: var(--text-soft);
  font-family: var(--mono);
  background: var(--bg-sidebar);
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  padding: 1px 7px;
}

/* ── Footer row ── */
.widget-footer {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 10px 18px;
  flex-wrap: wrap;
  row-gap: 4px;
}

.footer-item {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-soft);
}

.footer-sep {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--border);
  margin: 0 8px;
}

/* ── Embed code area ── */
.embed-area {
  padding: 0 18px 14px;
}

.embed-toggle {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--text-soft);
  background: none;
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  transition: color 0.15s, border-color 0.15s;
  width: 100%;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 8px;
}
.embed-toggle:hover { color: var(--text-mid); border-color: var(--accent); }

.embed-code-wrap {
  display: none;
  margin-top: 8px;
}
.embed-code-wrap.open { display: block; }

.embed-pre {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--text-mid);
  background: var(--bg-sidebar);
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  padding: 10px 12px;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.55;
}

.embed-copy-row {
  display: flex;
  justify-content: flex-end;
  margin-top: 6px;
}

.embed-copy-btn {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--text-soft);
  background: none;
  border: 1px solid var(--border-soft);
  border-radius: 3px;
  padding: 3px 10px;
  cursor: pointer;
  letter-spacing: 0.05em;
  transition: color 0.15s, border-color 0.15s;
}
.embed-copy-btn:hover { color: var(--accent); border-color: var(--accent); }
.embed-copy-btn.copied { color: var(--status-active); border-color: var(--status-active); }
</style>
</head>
<body>

<div class="widget">

  <div class="widget-header">
    <div class="widget-brand">&#9672; ${esc(projectName)}</div>
    <div class="widget-sub">life-as-code feature map</div>
  </div>

  <div class="widget-stats">
    <div class="stat-block">
      <span class="stat-big">${total}</span>
      <span class="stat-lbl">features</span>
    </div>
    <div class="stat-block">
      <span class="stat-big">${frozenPct}%</span>
      <span class="stat-lbl">frozen</span>
    </div>
  </div>

  <div class="widget-comp">
    <div class="comp-row">
      <span class="comp-label">avg completeness</span>
      <span class="comp-pct">${avgComp}%</span>
    </div>
    <div class="comp-bar-wrap">
      <div class="comp-bar" style="width:${avgComp}%"></div>
    </div>
  </div>

  <div class="widget-domains">
    ${domainDots}
    ${extraBadge}
    ${domains.length === 0 ? '<span class="footer-item" style="opacity:0.5">no domains assigned</span>' : ''}
  </div>

  <div class="widget-footer">
    <span class="footer-item">${totalDec} decision${totalDec === 1 ? '' : 's'}</span>
    <span class="footer-sep">&middot;</span>
    <span class="footer-item">${domainCount} domain${domainCount === 1 ? '' : 's'}</span>
    <span class="footer-sep">&middot;</span>
    <span class="footer-item">Updated: ${esc(updated)}</span>
  </div>

  <div class="embed-area">
    <button class="embed-toggle" id="embed-toggle" aria-expanded="false">
      <span>&#60;/&#62;</span>
      <span>embed code</span>
    </button>
    <div class="embed-code-wrap" id="embed-code-wrap">
      <pre class="embed-pre" id="embed-pre">${esc(iframeCode)}</pre>
      <div class="embed-copy-row">
        <button class="embed-copy-btn" id="embed-copy-btn">copy</button>
      </div>
    </div>
  </div>

</div>

<script>
(function() {
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var toggle = document.getElementById('embed-toggle');
  var wrap   = document.getElementById('embed-code-wrap');
  var copyBtn = document.getElementById('embed-copy-btn');
  var pre    = document.getElementById('embed-pre');

  toggle.addEventListener('click', function() {
    var open = wrap.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  copyBtn.addEventListener('click', function() {
    var raw = ${JSON.stringify(iframeCode)};
    if (navigator.clipboard) {
      navigator.clipboard.writeText(raw).then(function() {
        copyBtn.textContent = 'copied!';
        copyBtn.classList.add('copied');
        setTimeout(function() {
          copyBtn.textContent = 'copy';
          copyBtn.classList.remove('copied');
        }, 2000);
      });
    }
  });
})();
</script>

</body>
</html>`
}

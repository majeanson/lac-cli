import type { Feature } from '@life-as-code/feature-schema'
import { markdownToHtml } from './markdown.js'
import { css } from './site-style.css.js'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function statusBadge(status: Feature['status']): string {
  return `<span class="status-badge status-${escapeHtml(status)}">${escapeHtml(status)}</span>`
}

function renderDecisions(decisions: NonNullable<Feature['decisions']>): string {
  if (decisions.length === 0) return ''
  const items = decisions
    .map((d) => {
      const date = d.date
        ? `<div class="decision-date">${escapeHtml(d.date)}</div>`
        : ''
      const alts =
        d.alternativesConsidered && d.alternativesConsidered.length > 0
          ? `<div class="alternatives"><span>Alternatives considered:</span> ${d.alternativesConsidered.map(escapeHtml).join(', ')}</div>`
          : ''
      return `
      <li>
        ${date}
        <div class="decision-text">${escapeHtml(d.decision)}</div>
        <div class="decision-rationale">${escapeHtml(d.rationale)}</div>
        ${alts}
      </li>`
    })
    .join('\n')

  return `
  <section class="decisions">
    <h2>Decisions</h2>
    <ol class="decisions">
      ${items}
    </ol>
  </section>`
}

function renderLineage(lineage: NonNullable<Feature['lineage']>): string {
  const parts: string[] = []

  if (lineage.parent) {
    parts.push(
      `<p><strong>Parent:</strong> <a href="${escapeHtml(lineage.parent)}.html">${escapeHtml(lineage.parent)}</a></p>`,
    )
  }
  if (lineage.children && lineage.children.length > 0) {
    const childLinks = lineage.children
      .map((c) => `<a href="${escapeHtml(c)}.html">${escapeHtml(c)}</a>`)
      .join(', ')
    parts.push(`<p><strong>Children:</strong> ${childLinks}</p>`)
  }
  if (lineage.spawnReason) {
    parts.push(`<p><strong>Spawn reason:</strong> ${escapeHtml(lineage.spawnReason)}</p>`)
  }

  if (parts.length === 0) return ''

  return `
  <section class="lineage">
    <h2>Lineage</h2>
    <div class="lineage-info">
      ${parts.join('\n      ')}
    </div>
  </section>`
}

export function renderFeature(feature: Feature): string {
  const decisionsSection =
    feature.decisions && feature.decisions.length > 0
      ? renderDecisions(feature.decisions)
      : ''

  const implementationSection = feature.implementation
    ? `
  <section class="implementation">
    <h2>How it works</h2>
    <div class="implementation-text">${markdownToHtml(feature.implementation)}</div>
  </section>`
    : ''

  const analysisSection = (feature as Record<string, unknown>)['analysis']
    ? `
  <section class="analysis">
    <h2>Background &amp; Context</h2>
    <div class="analysis-text">${markdownToHtml(((feature as Record<string, unknown>)['analysis'] as string))}</div>
  </section>`
    : ''

  const limitationsSection =
    feature.knownLimitations && feature.knownLimitations.length > 0
      ? `
  <section class="limitations">
    <h2>Known Limitations</h2>
    <ul class="limitations">
      ${feature.knownLimitations.map((l) => `<li>${escapeHtml(l)}</li>`).join('\n      ')}
    </ul>
  </section>`
      : ''

  const lineageSection =
    feature.lineage &&
    (feature.lineage.parent ||
      (feature.lineage.children && feature.lineage.children.length > 0) ||
      feature.lineage.spawnReason)
      ? renderLineage(feature.lineage)
      : ''

  const tagsSection =
    feature.tags && feature.tags.length > 0
      ? `<div class="meta" style="margin-top:0.5rem;flex-wrap:wrap">${feature.tags.map((t) => `<span style="font-size:0.75rem;padding:0.125rem 0.5rem;border-radius:9999px;background-color:var(--color-surface);border:1px solid var(--color-border)">${escapeHtml(t)}</span>`).join('')}</div>`
      : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(feature.title)} — Feature Provenance</title>
  <style>${css}</style>
</head>
<body>
  <div class="container">
    <a href="index.html" class="back-link">&#8592; All features</a>

    <h1>${escapeHtml(feature.title)}</h1>
    <div class="meta">
      ${statusBadge(feature.status)}
      <span class="feature-key">${escapeHtml(feature.featureKey)}</span>
    </div>
    ${tagsSection}

    <section class="problem">
      <h2>Problem</h2>
      <p class="problem-text">${escapeHtml(feature.problem)}</p>
    </section>

    ${analysisSection}
    ${decisionsSection}
    ${implementationSection}
    ${limitationsSection}
    ${lineageSection}
  </div>
</body>
</html>`
}

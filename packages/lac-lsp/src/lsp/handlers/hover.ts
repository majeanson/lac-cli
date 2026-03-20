import { fileURLToPath } from 'node:url'

import { MarkupKind, type Hover, type TextDocumentPositionParams } from 'vscode-languageserver/node.js'

import type { FeatureIndex } from '../../indexer/FeatureIndex.js'
import { blame } from '../../lib/blame.js'

const OPTIONAL_FIELDS_LABELS: Record<string, string> = {
  analysis: 'analysis',
  decisions: 'decisions',
  implementation: 'implementation',
  knownLimitations: 'knownLimitations',
  tags: 'tags',
  annotations: 'annotations',
}

const STATUS_ICON: Record<string, string> = {
  active: '⊙',
  draft: '◌',
  frozen: '❄',
  deprecated: '⊘',
}

/**
 * Returns a Markdown hover card for any file that lives inside a feature directory.
 * The card shows: key, title, status, problem, analysis, decisions, limitations, tags,
 * completeness score, and the path to feature.json.
 *
 * Returns null if no feature owns the file.
 */
export function handleHover(
  params: TextDocumentPositionParams,
  index: FeatureIndex,
): Hover | null {
  let filePath: string
  try {
    filePath = fileURLToPath(params.textDocument.uri)
  } catch {
    return null
  }

  const indexed = blame(filePath, index)
  if (!indexed) return null

  const { feature, completeness, filePath: featurePath } = indexed
  const icon = STATUS_ICON[feature.status] ?? '?'

  const lines: string[] = [
    `**${icon} \`${feature.featureKey}\`** · ${feature.title} · \`${feature.status}\``,
    ``,
    `**Problem**`,
    feature.problem,
  ]

  if (feature.analysis) {
    lines.push(``, `**Analysis**`, feature.analysis)
  }

  if (feature.decisions && feature.decisions.length > 0) {
    lines.push(``, `**Decisions (${feature.decisions.length})**`)
    for (const d of feature.decisions) {
      lines.push(`- **${d.decision}**`)
      lines.push(`  *${d.rationale}*`)
    }
  }

  if (feature.knownLimitations && feature.knownLimitations.length > 0) {
    lines.push(``, `**Known Limitations**`)
    for (const lim of feature.knownLimitations) {
      lines.push(`- ${lim}`)
    }
  }

  if (feature.tags && feature.tags.length > 0) {
    lines.push(
      ``,
      `**Tags:** ${feature.tags.map((t: string) => `\`${t}\``).join('  ')}`,
    )
  }

  if (feature.lineage?.parent) {
    lines.push(``, `**Parent:** \`${feature.lineage.parent}\``)
  }

  // Compute missing optional fields
  const raw = feature as unknown as Record<string, unknown>
  const missingFields = Object.keys(OPTIONAL_FIELDS_LABELS).filter((field) => {
    const val = raw[field]
    if (val === undefined || val === null || val === '') return true
    if (Array.isArray(val)) return val.length === 0
    return typeof val === 'string' && val.trim().length === 0
  })

  lines.push(``, `---`)
  if (missingFields.length > 0) {
    lines.push(`**Completeness:** ${completeness}% · Missing: ${missingFields.join(', ')}`)
  } else {
    lines.push(`**Completeness:** ${completeness}%`)
  }
  lines.push(`\`${featurePath}\``)

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: lines.join('\n'),
    },
  }
}

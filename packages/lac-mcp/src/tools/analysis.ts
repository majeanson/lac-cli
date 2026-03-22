import fs from 'node:fs'
import path from 'node:path'

import type { Feature } from '@life-as-code/feature-schema'
import { validateFeature } from '@life-as-code/feature-schema'

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: true
}

interface ScannedFeature { feature: Feature; filePath: string }

function scanFeatures(dir: string): ScannedFeature[] {
  const results: ScannedFeature[] = []
  walk(dir, results)
  return results
}

function walk(dir: string, results: ScannedFeature[]): void {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
      if (['node_modules', '.git', 'dist'].includes(e.name)) continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full, results)
      else if (e.name === 'feature.json') {
        try {
          const parsed = JSON.parse(fs.readFileSync(full, 'utf-8')) as unknown
          const r = validateFeature(parsed)
          if (r.success) results.push({ feature: r.data, filePath: full })
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}

function resolve(p: string, root: string): string {
  return path.isAbsolute(p) ? p : path.resolve(root, p)
}

const RISK_KEYWORDS = ['revisit', 'temporary', 'todo', 'hack', 'fixme', 'workaround', 'short-term', 'quick fix']

export function handleAuditDecisions(
  a: Record<string, unknown>,
  workspaceRoot: string,
): ToolResult {
  const scanDir = a.path ? resolve(String(a.path), workspaceRoot) : workspaceRoot
  const features = scanFeatures(scanDir)

  const missingDecisions: string[] = []
  const flaggedDecisions: Array<{ key: string; decision: string; keyword: string }> = []
  const unaddressedReopens: string[] = []
  const domainGroups = new Map<string, Feature[]>()
  let cleanCount = 0

  for (const { feature } of features) {
    if (feature.status === 'draft') continue

    let hasIssue = false

    if (!feature.decisions?.length) {
      missingDecisions.push(`  ${feature.featureKey.padEnd(20)} ${feature.status}`)
      hasIssue = true
    } else {
      for (const d of feature.decisions) {
        const text = (d.decision + ' ' + d.rationale).toLowerCase()
        const found = RISK_KEYWORDS.find(k => text.includes(k))
        if (found) {
          flaggedDecisions.push({ key: feature.featureKey, decision: d.decision, keyword: found })
          hasIssue = true
        }
      }
    }

    // Detect unaddressed stale-review annotations (feature was reopened but fields not updated)
    const staleAnnotation = feature.annotations?.find(a => a.type === 'stale-review')
    if (staleAnnotation) {
      unaddressedReopens.push(`  ${feature.featureKey.padEnd(20)} ${feature.status.padEnd(10)} — ${staleAnnotation.body}`)
      hasIssue = true
    }

    if (feature.domain) {
      const group = domainGroups.get(feature.domain) ?? []
      group.push(feature)
      domainGroups.set(feature.domain, group)
    }

    if (!hasIssue) cleanCount++
  }

  const duplicateSuspects: string[] = []
  for (const [domain, group] of domainGroups) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const fi = group[i]
        const fj = group[j]
        if (!fi || !fj) continue
        const wordsA = new Set(fi.title.toLowerCase().split(/\W+/).filter(w => w.length > 3))
        const wordsB = new Set(fj.title.toLowerCase().split(/\W+/).filter(w => w.length > 3))
        const overlap = [...wordsA].filter(w => wordsB.has(w)).length
        if (overlap >= 2) {
          duplicateSuspects.push(
            `  ${fi.featureKey} + ${fj.featureKey} (${domain}) — "${fi.title}" / "${fj.title}"`,
          )
        }
      }
    }
  }

  const sections: string[] = []
  if (unaddressedReopens.length > 0)
    sections.push(`⚠ Unaddressed reopens — stale fields not yet reviewed (${unaddressedReopens.length}):\n${unaddressedReopens.join('\n')}`)
  if (missingDecisions.length > 0)
    sections.push(`⚠ Missing decisions (${missingDecisions.length}):\n${missingDecisions.join('\n')}`)
  if (flaggedDecisions.length > 0) {
    const lines = flaggedDecisions.map(
      f => `  ${f.key.padEnd(20)} "${f.decision.slice(0, 60)}" — contains "${f.keyword}"`,
    )
    sections.push(`⚠ Decisions flagged for review (${flaggedDecisions.length}):\n${lines.join('\n')}`)
  }
  if (duplicateSuspects.length > 0)
    sections.push(`⚠ Possible duplicates (${duplicateSuspects.length}):\n${duplicateSuspects.join('\n')}`)

  sections.push(`✓ ${cleanCount} feature(s) with clean decisions`)
  return { content: [{ type: 'text', text: sections.join('\n\n') }] }
}

export function handleFeatureSimilarity(
  a: Record<string, unknown>,
  workspaceRoot: string,
): ToolResult {
  if (!a.path) return { content: [{ type: 'text', text: 'path is required' }], isError: true }

  const featureDir = resolve(String(a.path), workspaceRoot)
  const featurePath = path.join(featureDir, 'feature.json')

  let raw: string
  try { raw = fs.readFileSync(featurePath, 'utf-8') } catch {
    return { content: [{ type: 'text', text: `No feature.json found at "${featurePath}"` }], isError: true }
  }
  const parsed = JSON.parse(raw) as unknown
  const result = validateFeature(parsed)
  if (!result.success)
    return { content: [{ type: 'text', text: `Invalid feature.json: ${result.errors.join(', ')}` }], isError: true }

  const target = result.data
  const targetTags = new Set(target.tags ?? [])
  const targetWords = new Set(
    (target.title + ' ' + target.problem).toLowerCase().split(/\W+/).filter(w => w.length > 4),
  )

  const allFeatures = scanFeatures(workspaceRoot)

  type Match = { feature: Feature; score: number; reasons: string[] }
  const matches: Match[] = []

  for (const { feature } of allFeatures) {
    if (feature.featureKey === target.featureKey) continue
    if (feature.lineage?.parent === target.featureKey || target.lineage?.parent === feature.featureKey) continue

    let score = 0
    const reasons: string[] = []

    if (target.domain && feature.domain === target.domain) {
      score += 3
      reasons.push(`same domain: ${feature.domain}`)
    }

    const sharedTags = (feature.tags ?? []).filter(t => targetTags.has(t))
    if (sharedTags.length > 0) {
      score += sharedTags.length * 2
      reasons.push(`shared tags: ${sharedTags.join(', ')}`)
    }

    const featureWords = new Set(
      (feature.title + ' ' + feature.problem).toLowerCase().split(/\W+/).filter(w => w.length > 4),
    )
    const wordOverlap = [...targetWords].filter(w => featureWords.has(w)).length
    if (wordOverlap >= 2) {
      score += wordOverlap
      reasons.push(`${wordOverlap} shared keywords`)
    }

    if (score > 0) matches.push({ feature, score, reasons })
  }

  matches.sort((a, b) => b.score - a.score)

  if (matches.length === 0)
    return { content: [{ type: 'text', text: `No similar features found for "${target.featureKey} — ${target.title}".` }] }

  const stars = (score: number) => score >= 6 ? '★★★' : score >= 4 ? '★★ ' : '★  '
  const lines = [
    `Similar features to "${target.featureKey} — ${target.title}":\n`,
    ...matches.slice(0, 10).map(m =>
      `${stars(m.score)} ${m.feature.featureKey.padEnd(20)} "${m.feature.title}"\n     ${m.reasons.join(' · ')}`,
    ),
  ]

  return { content: [{ type: 'text', text: lines.join('\n') }] }
}

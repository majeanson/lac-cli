import type { Feature } from '@life-as-code/feature-schema'

import { createClient, generateText } from './client.js'
import { buildContext } from './context-builder.js'

export interface ExtractedFeatureFields {
  title: string
  problem: string
  domain: string
  tags: string[]
  analysis: string
  decisions: Array<{
    decision: string
    rationale: string
    alternativesConsidered?: string[]
    date: null
  }>
  implementation: string
  knownLimitations: string[]
  successCriteria: string
}

const EXTRACT_SYSTEM = `You are a software engineering analyst. Given source code from a repository directory, generate a complete feature descriptor for this module or package.

Return ONLY valid JSON with EXACTLY these fields — no markdown fences, no explanation:
{
  "title": "Short descriptive name (5-10 words)",
  "problem": "What problem does this module solve? 1-2 sentences.",
  "domain": "Single lowercase word or hyphenated phrase (e.g. auth, data-pipeline, payments)",
  "tags": ["3-6 lowercase tags reflecting actual domain language"],
  "analysis": "Architectural overview: what the code does, key patterns used, why they were chosen. Name actual functions/modules/techniques visible in the code. 150-300 words.",
  "decisions": [
    {
      "decision": "what was decided (concrete, e.g. 'Use JWT for session tokens')",
      "rationale": "why, based on code evidence",
      "alternativesConsidered": ["alternative 1", "alternative 2"],
      "date": null
    }
  ],
  "implementation": "Main components and their roles, how data flows through the module, non-obvious patterns or constraints. 100-200 words.",
  "knownLimitations": ["2-4 limitations, TODOs, or tech-debt items visible in the code"],
  "successCriteria": "How do we know this module works correctly? 1-3 testable sentences."
}

Include 2-4 decisions. Be specific — generic observations are not useful.`

/**
 * Given a directory with source code (no feature.json required),
 * calls Claude in a single API request and returns all feature fields.
 *
 * This is designed for bulk extraction (lac extract-all) where
 * one API call per module is more efficient than field-by-field filling.
 */
export async function extractFeature(options: {
  dir: string
  model?: string
}): Promise<ExtractedFeatureFields> {
  const { dir, model = 'claude-sonnet-4-6' } = options

  const client = createClient()

  // Use a minimal placeholder to drive buildContext (we only need source files)
  const placeholder: Feature = {
    featureKey: 'feat-2026-000',
    title: '(pending extraction)',
    status: 'draft',
    problem: '(pending)',
  }
  const ctx = buildContext(dir, placeholder)

  if (ctx.sourceFiles.length === 0) {
    throw new Error(`No source files found in "${dir}".`)
  }

  // Build context string without the placeholder feature.json section
  const parts: string[] = []
  if (ctx.truncatedFiles.length > 0) {
    parts.push(
      `⚠ WARNING: ${ctx.truncatedFiles.length} file(s) were truncated — extraction may be incomplete:\n` +
      ctx.truncatedFiles.map(f => `  - ${f}`).join('\n'),
    )
    parts.push('')
  }
  if (ctx.gitLog) {
    parts.push('=== git log (last 20 commits) ===')
    parts.push(ctx.gitLog)
  }
  for (const file of ctx.sourceFiles) {
    parts.push(`\n=== ${file.relativePath}${file.truncated ? ' [truncated]' : ''} ===`)
    parts.push(file.content)
  }
  const contextStr = parts.join('\n')

  const raw = await generateText(
    client,
    EXTRACT_SYSTEM,
    `Directory: ${dir}\n\nSource files:\n\n${contextStr}\n\nGenerate the feature descriptor JSON for this module.`,
    model,
  )

  // Strip markdown fences if present
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = (fenceMatch?.[1] ?? raw).trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error(
      `Claude returned invalid JSON for "${dir}".\nRaw response:\n${raw.slice(0, 500)}`,
    )
  }

  const result = parsed as Record<string, unknown>

  // Coerce and validate the shape — fill defaults for missing fields rather than crashing
  return {
    title: String(result['title'] ?? 'Untitled Module'),
    problem: String(result['problem'] ?? 'Problem statement not extracted.'),
    domain: String(result['domain'] ?? 'general'),
    tags: Array.isArray(result['tags']) ? (result['tags'] as string[]) : [],
    analysis: String(result['analysis'] ?? ''),
    decisions: Array.isArray(result['decisions'])
      ? (result['decisions'] as ExtractedFeatureFields['decisions'])
      : [],
    implementation: String(result['implementation'] ?? ''),
    knownLimitations: Array.isArray(result['knownLimitations'])
      ? (result['knownLimitations'] as string[])
      : [],
    successCriteria: String(result['successCriteria'] ?? ''),
  }
}

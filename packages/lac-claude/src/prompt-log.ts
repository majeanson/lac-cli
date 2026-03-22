import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const PROMPT_LOG_FILENAME = 'prompt.log.jsonl'

/**
 * One line in prompt.log.jsonl — written next to feature.json every time a field
 * is AI-filled. Append-only. Each line is a self-contained JSON object.
 *
 * Fields common to both sources:
 *   date             ISO 8601 timestamp of the fill
 *   field            which FillableField was written
 *   source           'lac fill' (CLI) | 'mcp' (write_feature_fields called by Claude)
 *
 * Fields only present when source === 'lac fill':
 *   model            model string used for the API call
 *   prompt_hash      8-char sha256 of the system prompt — lets you detect prompt drift
 *   response_preview first 120 chars of the raw AI response before JSON parsing
 *
 * Fields only present when source === 'mcp':
 *   value_preview    first 120 chars of the written value (JSON-stringified if not a string)
 */
export interface PromptLogEntry {
  date: string
  field: string
  source: 'lac fill' | 'mcp'
  model?: string
  prompt_hash?: string
  response_preview?: string
  value_preview?: string
}

/** Append one or more entries to the feature's prompt.log.jsonl. Creates the file if absent. */
export function appendPromptLog(featureDir: string, entries: PromptLogEntry[]): void {
  if (entries.length === 0) return
  const logPath = path.join(featureDir, PROMPT_LOG_FILENAME)
  const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n'
  fs.appendFileSync(logPath, lines, 'utf-8')
}

/** 8-char sha256 prefix of a string — stable identifier for a prompt version. */
export function hashPrompt(prompt: string): string {
  return crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 8)
}

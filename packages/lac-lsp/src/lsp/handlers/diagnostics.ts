import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import { validateFeature } from '@life-as-code/feature-schema'
import {
  DiagnosticSeverity,
  type Connection,
  type Diagnostic,
} from 'vscode-languageserver/node.js'

import type { FeatureIndex } from '../../indexer/FeatureIndex.js'

/** Required fields that trigger a Warning diagnostic when empty. */
const REQUIRED_FIELDS = ['problem'] as const

/**
 * Wires up diagnostic push for all feature.json files.
 *
 * - On ready: pushes diagnostics for every indexed feature.json
 * - On index 'change' event: re-pushes diagnostics for the changed file
 *   (or clears them on delete)
 *
 * Diagnostics cover:
 *   Error   – invalid JSON or schema validation failures
 *   Warning – required field empty (default: problem)
 *   Hint    – completeness below 50%
 */
export function setupDiagnostics(connection: Connection, index: FeatureIndex): void {
  // Push diagnostics for all known files once the index is ready
  if (index.isReady) {
    pushAll()
  } else {
    index.once('ready', pushAll)
  }

  // Keep diagnostics up to date as files change
  index.on('change', (event) => {
    const uri = pathToFileURL(event.filePath).toString()
    if (event.type === 'delete') {
      connection.sendDiagnostics({ uri, diagnostics: [] })
    } else {
      pushForFile(event.filePath)
    }
  })

  function pushAll(): void {
    for (const indexed of index.getAll()) {
      pushForFile(indexed.filePath)
    }
  }

  function pushForFile(filePath: string): void {
    const uri = pathToFileURL(filePath).toString()
    const diagnostics = computeDiagnostics(filePath, index)
    connection.sendDiagnostics({ uri, diagnostics })
  }
}

/**
 * Reads a feature.json from disk and computes diagnostics.
 * Returns an empty array on read errors (file may have been deleted in a race).
 */
function computeDiagnostics(filePath: string, index: FeatureIndex): Diagnostic[] {
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf-8')
  } catch {
    return []
  }

  // --- JSON parse error ---
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return [
      makeDiagnostic(
        0,
        0,
        'feature.json contains invalid JSON.',
        DiagnosticSeverity.Error,
      ),
    ]
  }

  const result = validateFeature(parsed)
  const diagnostics: Diagnostic[] = []

  // --- Schema validation errors ---
  if (!result.success) {
    for (const err of result.errors) {
      diagnostics.push(makeDiagnostic(0, 0, err, DiagnosticSeverity.Error))
    }
    return diagnostics
  }

  // --- Additional checks on a valid feature ---
  const feature = result.data as unknown as Record<string, unknown>

  for (const field of REQUIRED_FIELDS) {
    const val = feature[field]
    const isEmpty =
      val === undefined ||
      val === null ||
      val === '' ||
      (typeof val === 'string' && val.trim().length === 0)
    if (isEmpty) {
      diagnostics.push(
        makeDiagnostic(
          0,
          0,
          `Required field "${field}" is empty. Add a problem statement.`,
          DiagnosticSeverity.Warning,
        ),
      )
    }
  }

  // Hint: completeness — look it up from the index if available
  const indexed = index.getByKey(result.data.featureKey)
  if (indexed && indexed.completeness < 50) {
    diagnostics.push(
      makeDiagnostic(
        0,
        0,
        `Feature completeness is ${indexed.completeness}% — consider filling analysis, decisions, or implementation.`,
        DiagnosticSeverity.Hint,
      ),
    )
  }

  return diagnostics
}

function makeDiagnostic(
  line: number,
  char: number,
  message: string,
  severity: DiagnosticSeverity,
): Diagnostic {
  return {
    range: {
      start: { line, character: char },
      end: { line, character: char + 1 },
    },
    message,
    severity,
    source: 'lac',
  }
}

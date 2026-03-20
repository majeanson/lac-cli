import { fileURLToPath } from 'node:url'

import {
  CodeLens,
  Position,
  Range,
  type CodeLensParams,
} from 'vscode-languageserver/node.js'

import type { FeatureIndex } from '../../indexer/FeatureIndex.js'
import { blame } from '../../lib/blame.js'

const STATUS_ICON: Record<string, string> = {
  active: '⊙',
  draft: '◌',
  frozen: '❄',
  deprecated: '⊘',
}

/**
 * Returns a CodeLens at line 0 of any file inside a feature directory.
 * The lens shows "⊙ feat-2026-001 · Title · status" and, when clicked,
 * executes the `lac.openFeatureJson` command registered by the VS Code extension.
 *
 * Returns an empty array if no feature owns the file.
 */
export function handleCodeLens(params: CodeLensParams, index: FeatureIndex): CodeLens[] {
  let filePath: string
  try {
    filePath = fileURLToPath(params.textDocument.uri)
  } catch {
    return []
  }

  const indexed = blame(filePath, index)
  if (!indexed) return []

  const { feature } = indexed
  const icon = STATUS_ICON[feature.status] ?? '?'
  const title = `${icon}  ${feature.featureKey}  ·  ${feature.title}  ·  ${feature.status}`

  return [
    CodeLens.create(
      Range.create(Position.create(0, 0), Position.create(0, 0)),
      {
        title,
        command: 'lac.openFeatureJson',
        arguments: [indexed.filePath],
      },
    ),
  ]
}

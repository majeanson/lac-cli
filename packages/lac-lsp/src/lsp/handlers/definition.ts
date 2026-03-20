import { pathToFileURL, fileURLToPath } from 'node:url'

import { Location, Position, Range, type DefinitionParams } from 'vscode-languageserver/node.js'

import type { FeatureIndex } from '../../indexer/FeatureIndex.js'
import { blame } from '../../lib/blame.js'

/**
 * Returns a Location pointing to the feature.json that owns the requested file.
 *
 * Given a text document URI + position, walks up the directory tree to find the
 * owning feature via the blame function, then returns a Location at line 0 of
 * that feature's feature.json file.
 *
 * Returns null if no feature owns the file.
 */
export function handleDefinition(
  params: DefinitionParams,
  index: FeatureIndex,
): Location | null {
  let filePath: string
  try {
    filePath = fileURLToPath(params.textDocument.uri)
  } catch {
    return null
  }

  const indexed = blame(filePath, index)
  if (!indexed) return null

  const uri = pathToFileURL(indexed.filePath).toString()
  const pos = Position.create(0, 0)
  return Location.create(uri, Range.create(pos, pos))
}

import { pathToFileURL } from 'node:url'

import {
  Position,
  Range,
  SymbolInformation,
  SymbolKind,
  type WorkspaceSymbolParams,
} from 'vscode-languageserver/node.js'

import type { FeatureIndex } from '../../indexer/FeatureIndex.js'

/**
 * Returns workspace symbols matching the query.
 *
 * Searches across featureKey, title, problem, tags, and status.
 * An empty query returns all features (capped at 200 to avoid overwhelming the client).
 *
 * Each feature is returned as a Module symbol so editors render it with a box icon.
 * containerName shows the human-readable title alongside the featureKey.
 */
export function handleWorkspaceSymbols(
  params: WorkspaceSymbolParams,
  index: FeatureIndex,
): SymbolInformation[] {
  const query = params.query.toLowerCase().trim()

  const features = index.getAll()

  const matched =
    query === ''
      ? features
      : features.filter(({ feature }) => {
          if (feature.featureKey.toLowerCase().includes(query)) return true
          if (feature.title.toLowerCase().includes(query)) return true
          if (feature.problem.toLowerCase().includes(query)) return true
          if (feature.tags?.some((t: string) => t.toLowerCase().includes(query))) return true
          if (feature.status.toLowerCase().includes(query)) return true
          return false
        })

  // Cap result set — editors handle pagination differently
  const total = matched.length
  if (total > 200) {
    process.stderr.write(
      `lac-lsp: workspace symbols capped at 200 (${total} total) — narrow your query\n`,
    )
  }

  return matched.slice(0, 200).map(({ feature, filePath }) =>
    SymbolInformation.create(
      feature.featureKey,
      SymbolKind.Module,
      Range.create(Position.create(0, 0), Position.create(0, 0)),
      pathToFileURL(filePath).toString(),
      feature.title,
    ),
  )
}

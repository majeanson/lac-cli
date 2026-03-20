import { generateFeatureKey } from '@life-as-code/feature-schema'

import { loadConfig } from './config.js'

/**
 * Generates a new featureKey for the given directory, honouring the `domain`
 * field from the nearest `lac.config.json`.
 *
 * @throws {Error} If no `.lac/` directory can be found in fromDir or its parents.
 */
export function nextFeatureKey(fromDir: string): string {
  const config = loadConfig(fromDir)
  return generateFeatureKey(fromDir, config.domain)
}

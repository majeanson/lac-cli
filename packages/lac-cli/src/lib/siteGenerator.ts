import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { Feature } from '@life-as-code/feature-schema'
import { renderFeature } from '../templates/site-feature.html.js'
import { renderIndex } from '../templates/site-index.html.js'
import { css } from '../templates/site-style.css.js'

export interface SiteFeature {
  filePath: string
  feature: Feature
}

/**
 * Generates a static HTML site for the given features.
 * Creates:
 *   outDir/index.html         — searchable feature list
 *   outDir/{featureKey}.html  — one page per feature
 *   outDir/style.css          — shared stylesheet
 */
export async function generateSite(features: SiteFeature[], outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true })

  // Write shared stylesheet
  await writeFile(join(outDir, 'style.css'), css.trim(), 'utf-8')

  // Write index page
  const allFeatures = features.map((f) => f.feature)
  await writeFile(join(outDir, 'index.html'), renderIndex(allFeatures), 'utf-8')

  // Write one page per feature
  for (const { feature } of features) {
    const pageHtml = renderFeature(feature)
    await writeFile(join(outDir, `${feature.featureKey}.html`), pageHtml, 'utf-8')
  }
}

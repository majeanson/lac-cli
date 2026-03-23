import { mkdir, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import type { ScannedFeature } from './scanner.js'
import { generateHtmlWiki } from './htmlGenerator.js'

export async function generateSite(
  features: ScannedFeature[],
  outDir: string,
  viewLabel?: string,
  viewName?: string,
): Promise<void> {
  await mkdir(outDir, { recursive: true })

  const projectName = basename(outDir.replace(/[/\\]+$/, '')) || 'project'
  const html = generateHtmlWiki(features.map(f => f.feature), projectName, viewLabel, viewName)

  await writeFile(join(outDir, 'index.html'), html, 'utf-8')
}

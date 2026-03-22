import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { validateFeature } from '@life-as-code/feature-schema'

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: true
}

export function handleTimeTravel(
  a: Record<string, unknown>,
  workspaceRoot: string,
): ToolResult {
  if (!a.path) return { content: [{ type: 'text', text: 'path is required' }], isError: true }

  const featureDir = path.isAbsolute(String(a.path))
    ? String(a.path)
    : path.resolve(workspaceRoot, String(a.path))

  const featurePath = path.join(featureDir, 'feature.json')

  let gitRoot: string
  try {
    gitRoot = execSync('git rev-parse --show-toplevel', {
      cwd: featureDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
  } catch {
    return { content: [{ type: 'text', text: 'Not a git repository. time_travel requires git.' }], isError: true }
  }

  const relPath = path.relative(gitRoot, featurePath).replace(/\\/g, '/')

  let logOutput: string
  try {
    logOutput = execSync(`git log --format="%H %as %s" -- "${relPath}"`, {
      cwd: gitRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
  } catch {
    logOutput = ''
  }

  if (!logOutput) {
    return {
      content: [{ type: 'text', text: `No git history found for "${relPath}". Has this file been committed?` }],
    }
  }

  const commits = logOutput.split('\n').map(line => {
    const parts = line.split(' ')
    return { sha: parts[0] ?? '', date: parts[1] ?? '', message: parts.slice(2).join(' ') }
  })

  // No date/commit provided — show history
  if (!a.date && !a.commit) {
    const historyLines = commits.map(c => `  ${c.date}  ${c.sha.slice(0, 8)}  ${c.message}`)
    return {
      content: [{
        type: 'text',
        text: `Git history for "${relPath}" (${commits.length} commit(s)):\n\n${historyLines.join('\n')}\n\nCall time_travel again with date (YYYY-MM-DD) or commit (SHA) to view a specific version.`,
      }],
    }
  }

  let targetSha: string | undefined

  if (a.commit) {
    targetSha = String(a.commit)
  } else {
    const targetDate = String(a.date)
    const match = commits.find(c => c.date <= targetDate)
    if (!match) {
      const historyLines = commits.map(c => `  ${c.date}  ${c.sha.slice(0, 8)}  ${c.message}`)
      return {
        content: [{
          type: 'text',
          text: `No commits found at or before "${targetDate}".\n\nAvailable history:\n${historyLines.join('\n')}`,
        }],
      }
    }
    targetSha = match.sha
  }

  let historicalContent: string
  try {
    historicalContent = execSync(`git show "${targetSha}:${relPath}"`, {
      cwd: gitRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch {
    return {
      content: [{ type: 'text', text: `Could not read "${relPath}" at commit ${targetSha.slice(0, 8)}.` }],
      isError: true,
    }
  }

  const targetCommit = commits.find(c => c.sha === targetSha || (targetSha != null && c.sha.length >= 7 && targetSha.startsWith(c.sha.slice(0, 7))))
  const commitInfo = targetCommit
    ? `${targetCommit.date}  ${targetSha!.slice(0, 8)}  ${targetCommit.message}`
    : targetSha!.slice(0, 8)

  // Validate and pretty-print if possible
  let displayContent: string
  try {
    const parsed = JSON.parse(historicalContent)
    const validation = validateFeature(parsed)
    displayContent = validation.success
      ? JSON.stringify(validation.data, null, 2)
      : historicalContent
  } catch {
    displayContent = historicalContent
  }

  // Also check if there are newer commits — show diff summary
  const newerCommits = commits.filter(c => targetCommit?.date != null ? c.date > targetCommit.date : false)
  const newerNote = newerCommits.length > 0
    ? `\n\n[${newerCommits.length} commit(s) made after this snapshot]`
    : ''

  return {
    content: [{
      type: 'text',
      text: `feature.json at: ${commitInfo}${newerNote}\n\n${displayContent}`,
    }],
  }
}

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

import type { Feature } from '@life-as-code/feature-schema'
import { validateFeature } from '@life-as-code/feature-schema'
import { fillFeature, genFromFeature } from '@life-as-code/lac-claude'

// Workspace root: first CLI arg, LAC_WORKSPACE env, or cwd
const workspaceRoot = process.argv[2] ?? process.env.LAC_WORKSPACE ?? process.cwd()

const server = new Server(
  { name: 'lac', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

// ─── Tool definitions ────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'fill_feature',
      description:
        'Fill missing fields in a feature.json using AI analysis of the code. Returns proposed changes and optionally applies them.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute or relative path to the feature folder (contains feature.json)',
          },
          fields: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Specific fields to fill. Omit to fill all missing fields. Options: analysis, decisions, implementation, knownLimitations, tags, successCriteria, domain',
          },
          dryRun: {
            type: 'boolean',
            description: 'If true, returns proposed changes without writing to disk',
          },
          model: {
            type: 'string',
            description: 'Claude model to use (default: claude-sonnet-4-6)',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'generate_from_feature',
      description:
        'Generate code artifacts from a feature.json — component, tests, migration, or docs.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute or relative path to the feature folder',
          },
          type: {
            type: 'string',
            enum: ['component', 'test', 'migration', 'docs'],
            description: 'What to generate',
          },
          dryRun: {
            type: 'boolean',
            description: 'If true, returns generated content without writing to disk',
          },
          model: {
            type: 'string',
            description: 'Claude model to use (default: claude-sonnet-4-6)',
          },
        },
        required: ['path', 'type'],
      },
    },
    {
      name: 'blame_file',
      description: 'Show which feature owns a file — returns the feature summary.',
      inputSchema: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            description: 'Path to the file to look up',
          },
        },
        required: ['file'],
      },
    },
    {
      name: 'search_features',
      description: 'Search all features in the workspace by key, title, tags, or problem text.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          status: {
            type: 'string',
            enum: ['draft', 'active', 'frozen', 'deprecated'],
            description: 'Filter by status (optional)',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'create_feature',
      description: 'Create a new feature.json in the specified directory.',
      inputSchema: {
        type: 'object',
        properties: {
          dir: {
            type: 'string',
            description: 'Directory to create the feature in',
          },
          featureKey: {
            type: 'string',
            description: 'Feature key (e.g. feat-2026-042)',
          },
          title: { type: 'string', description: 'Feature title' },
          problem: { type: 'string', description: 'Problem statement' },
          status: {
            type: 'string',
            enum: ['draft', 'active', 'frozen', 'deprecated'],
            description: 'Status (default: draft)',
          },
        },
        required: ['dir', 'featureKey', 'title', 'problem'],
      },
    },
    {
      name: 'get_lineage',
      description: 'Show the parent/child lineage tree for a feature key.',
      inputSchema: {
        type: 'object',
        properties: {
          featureKey: { type: 'string', description: 'Feature key to look up' },
        },
        required: ['featureKey'],
      },
    },
    {
      name: 'lint_workspace',
      description: 'Check all features for completeness and required fields.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Directory to scan (default: workspace root)',
          },
        },
      },
    },
  ],
}))

// ─── Tool handlers ───────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  const a = (args ?? {}) as Record<string, unknown>

  try {
    switch (name) {
      case 'fill_feature': {
        const featureDir = resolvePath(String(a.path))
        const result = await fillFeature({
          featureDir,
          fields: a.fields as string[] | undefined,
          dryRun: (a.dryRun as boolean | undefined) ?? false,
          skipConfirm: true, // MCP always applies without interactive prompt
          model: (a.model as string | undefined) ?? 'claude-sonnet-4-6',
        })
        return {
          content: [
            {
              type: 'text',
              text: result.applied
                ? `Applied ${result.fields.length} field(s) to feature.json: ${result.fields.join(', ')}`
                : `Proposed changes (dry-run): ${result.fields.join(', ')}\n\n${JSON.stringify(result.patch, null, 2)}`,
            },
          ],
        }
      }

      case 'generate_from_feature': {
        const featureDir = resolvePath(String(a.path))
        const generated = await genFromFeature({
          featureDir,
          type: a.type as 'component' | 'test' | 'migration' | 'docs',
          dryRun: (a.dryRun as boolean | undefined) ?? false,
          model: (a.model as string | undefined) ?? 'claude-sonnet-4-6',
        })
        return { content: [{ type: 'text', text: generated }] }
      }

      case 'blame_file': {
        const filePath = resolvePath(String(a.file))
        const feature = findNearestFeature(path.dirname(filePath))
        if (!feature) {
          return {
            content: [{ type: 'text', text: `No feature.json found for "${a.file}".` }],
          }
        }
        return { content: [{ type: 'text', text: formatFeatureSummary(feature) }] }
      }

      case 'search_features': {
        const query = String(a.query).toLowerCase()
        const statusFilter = a.status as string | undefined
        const features = scanAllFeatures(workspaceRoot)
        const matches = features.filter(({ feature }) => {
          if (statusFilter && feature.status !== statusFilter) return false
          const haystack = [
            feature.featureKey,
            feature.title,
            feature.problem,
            ...(feature.tags ?? []),
            feature.analysis ?? '',
          ]
            .join(' ')
            .toLowerCase()
          return haystack.includes(query)
        })
        if (matches.length === 0) {
          return { content: [{ type: 'text', text: `No features found matching "${a.query}".` }] }
        }
        const lines = matches.map(
          ({ feature }) =>
            `${statusIcon(feature.status)} ${feature.featureKey.padEnd(18)} ${feature.status.padEnd(12)} ${feature.title}\n   ${feature.problem.slice(0, 80)}`,
        )
        return {
          content: [
            {
              type: 'text',
              text: `Found ${matches.length} feature(s):\n\n${lines.join('\n\n')}`,
            },
          ],
        }
      }

      case 'create_feature': {
        const dir = resolvePath(String(a.dir))
        const featurePath = path.join(dir, 'feature.json')
        if (fs.existsSync(featurePath)) {
          return {
            content: [{ type: 'text', text: `feature.json already exists at "${featurePath}".` }],
          }
        }
        const feature: Feature = {
          featureKey: String(a.featureKey),
          title: String(a.title),
          status: (String(a.status ?? 'draft')) as Feature['status'],
          problem: String(a.problem),
          schemaVersion: 1,
        }
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(featurePath, JSON.stringify(feature, null, 2) + '\n', 'utf-8')
        return {
          content: [{ type: 'text', text: `Created feature.json at "${featurePath}".` }],
        }
      }

      case 'get_lineage': {
        const featureKey = String(a.featureKey)
        const features = scanAllFeatures(workspaceRoot)
        const featureMap = new Map(features.map(({ feature }) => [feature.featureKey, feature]))
        const root = featureMap.get(featureKey)
        if (!root) {
          return {
            content: [{ type: 'text', text: `Feature "${featureKey}" not found.` }],
          }
        }
        const tree = buildLineageTree(root, featureMap, 0)
        return { content: [{ type: 'text', text: tree }] }
      }

      case 'lint_workspace': {
        const scanDir = a.path ? resolvePath(String(a.path)) : workspaceRoot
        const features = scanAllFeatures(scanDir)
        const results = features.map(({ feature, filePath }) => {
          const issues: string[] = []
          if (!feature.problem?.trim()) issues.push('missing problem')
          if (feature.status === 'active') {
            if (!feature.analysis?.trim()) issues.push('missing analysis')
            if (!feature.implementation?.trim()) issues.push('missing implementation')
            if (!feature.decisions?.length) issues.push('no decisions recorded')
          }
          return { feature, filePath, issues }
        })
        const failures = results.filter((r) => r.issues.length > 0)
        const passes = results.filter((r) => r.issues.length === 0)
        const lines = [
          ...passes.map((r) => `  ✓  ${r.feature.featureKey.padEnd(18)} ${r.feature.status}`),
          ...failures.map(
            (r) =>
              `  ✗  ${r.feature.featureKey.padEnd(18)} ${r.feature.status}\n       ${r.issues.join(', ')}`,
          ),
        ]
        return {
          content: [
            {
              type: 'text',
              text: `${passes.length} passed, ${failures.length} failed — ${results.length} features checked\n\n${lines.join('\n')}`,
            },
          ],
        }
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] }
    }
  } catch (err) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    }
  }
})

// ─── Utilities ───────────────────────────────────────────────────────────────

function resolvePath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(workspaceRoot, p)
}

function findNearestFeature(startDir: string): Feature | null {
  let current = startDir
  while (true) {
    const candidate = path.join(current, 'feature.json')
    if (fs.existsSync(candidate)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(candidate, 'utf-8')) as unknown
        const result = validateFeature(parsed)
        if (result.success) return result.data
      } catch {
        // ignore
      }
    }
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

interface ScannedFeature {
  feature: Feature
  filePath: string
}

function scanAllFeatures(dir: string): ScannedFeature[] {
  const results: ScannedFeature[] = []
  walkForFeatures(dir, results)
  return results
}

function walkForFeatures(dir: string, results: ScannedFeature[]): void {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walkForFeatures(full, results)
      } else if (entry.name === 'feature.json') {
        try {
          const parsed = JSON.parse(fs.readFileSync(full, 'utf-8')) as unknown
          const result = validateFeature(parsed)
          if (result.success) results.push({ feature: result.data, filePath: full })
        } catch {
          // ignore invalid files
        }
      }
    }
  } catch {
    // ignore unreadable dirs
  }
}

function formatFeatureSummary(feature: ScannedFeature['feature']): string {
  const lines = [
    `Feature   : ${feature.featureKey}`,
    `Title     : ${feature.title}`,
    `Status    : ${statusIcon(feature.status)}  ${feature.status}`,
    `Problem   : ${feature.problem}`,
  ]
  if (feature.analysis) lines.push(`Analysis  : ${feature.analysis.slice(0, 200)}`)
  if (feature.successCriteria) lines.push(`Success   : ${feature.successCriteria}`)
  if (feature.domain) lines.push(`Domain    : ${feature.domain}`)
  if (feature.decisions?.length)
    lines.push(`Decisions : ${feature.decisions.length} recorded`)
  if (feature.lineage?.parent) lines.push(`Parent    : ${feature.lineage.parent}`)
  if (feature.lineage?.children?.length)
    lines.push(`Children  : ${feature.lineage.children.join(', ')}`)
  return lines.join('\n')
}

function buildLineageTree(
  feature: ScannedFeature['feature'],
  map: Map<string, ScannedFeature['feature']>,
  depth: number,
): string {
  const indent = '    '.repeat(depth)
  const line = `${indent}${statusIcon(feature.status)} ${feature.featureKey} (${feature.status}) — ${feature.title}`
  const children = feature.lineage?.children ?? []
  const childLines = children.flatMap((key) => {
    const child = map.get(key)
    return child ? [buildLineageTree(child, map, depth + 1)] : []
  })
  return [line, ...childLines].join('\n')
}

function statusIcon(status: string): string {
  const icons: Record<string, string> = {
    active: '⊙',
    draft: '◌',
    frozen: '❄',
    deprecated: '⊘',
  }
  return icons[status] ?? '?'
}

// ─── Start ───────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write(`lac MCP server running (workspace: ${workspaceRoot})\n`)
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})

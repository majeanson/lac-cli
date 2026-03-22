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
import { validateFeature, generateFeatureKey, registerFeatureKey } from '@life-as-code/feature-schema'
import {
  fillFeature,
  genFromFeature,
  buildContext,
  contextToString,
  getMissingFields,
  ALL_FILLABLE_FIELDS,
  FILL_PROMPTS,
  JSON_FIELDS,
} from '@life-as-code/lac-claude'

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
            description: 'Feature key (e.g. feat-2026-042). Omit to auto-generate the next key from the workspace counter — recommended to avoid duplicates.',
          },
          title: { type: 'string', description: 'Feature title' },
          problem: { type: 'string', description: 'Problem statement' },
          status: {
            type: 'string',
            enum: ['draft', 'active', 'frozen', 'deprecated'],
            description: 'Status (default: draft)',
          },
        },
        required: ['dir', 'title', 'problem'],
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
    {
      name: 'read_feature_context',
      description:
        'Read a feature.json and all surrounding source files. Returns the full context needed to fill missing fields — use this when the user asks you to fill or analyse a feature WITHOUT calling an external AI API (you ARE the AI). After reading, generate the missing fields yourself and call write_feature_fields to save.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute or relative path to the feature folder (contains feature.json)',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'write_feature_fields',
      description:
        'Patch a feature.json with new field values. Use this after read_feature_context — write the fields you generated back to disk.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute or relative path to the feature folder (contains feature.json)',
          },
          fields: {
            type: 'object',
            description:
              'Key-value pairs to merge into feature.json. Values may be strings, arrays, or objects depending on the field.',
          },
        },
        required: ['path', 'fields'],
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
        fs.mkdirSync(dir, { recursive: true })
        // Auto-generate key from workspace counter (prevents duplicates with CLI / VS Code).
        // If the caller supplies a key, register it so the counter advances past it.
        let featureKey: string
        if (a.featureKey) {
          featureKey = String(a.featureKey)
          registerFeatureKey(dir, featureKey)
        } else {
          featureKey = generateFeatureKey(dir)
        }
        const feature: Feature = {
          featureKey,
          title: String(a.title),
          status: (String(a.status ?? 'draft')) as Feature['status'],
          problem: String(a.problem),
          schemaVersion: 1,
        }
        fs.writeFileSync(featurePath, JSON.stringify(feature, null, 2) + '\n', 'utf-8')
        return {
          content: [{ type: 'text', text: `Created feature.json at "${featurePath}" with key "${featureKey}".` }],
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
        // Build a children map by scanning parent references (works even if lineage.children is missing)
        const childrenOf = new Map<string, string[]>()
        for (const { feature } of features) {
          const parent = feature.lineage?.parent
          if (parent) {
            const existing = childrenOf.get(parent) ?? []
            existing.push(feature.featureKey)
            childrenOf.set(parent, existing)
          }
        }
        const tree = buildLineageTree(root, featureMap, childrenOf, 0)
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

      case 'read_feature_context': {
        const featureDir = resolvePath(String(a.path))
        const featurePath = path.join(featureDir, 'feature.json')
        let raw: string
        try {
          raw = fs.readFileSync(featurePath, 'utf-8')
        } catch {
          return { content: [{ type: 'text', text: `No feature.json found at "${featurePath}"` }], isError: true }
        }
        const parsed = JSON.parse(raw) as unknown
        const result = validateFeature(parsed)
        if (!result.success) {
          return { content: [{ type: 'text', text: `Invalid feature.json: ${result.errors.join(', ')}` }], isError: true }
        }
        const feature = result.data
        const ctx = buildContext(featureDir, feature)
        const contextStr = contextToString(ctx)
        const missingFields = getMissingFields(feature)

        // Build per-field instructions so Claude knows exactly what to generate
        const fieldInstructions = missingFields.map((field) => {
          const prompt = FILL_PROMPTS[field]
          const isJson = JSON_FIELDS.has(field)
          return `### ${field}\n${prompt.system}\n${prompt.userSuffix}\n${isJson ? '(Return valid JSON for this field)' : '(Return plain text for this field)'}`
        }).join('\n\n')

        const instructions = missingFields.length === 0
          ? 'All fillable fields are already populated. No generation needed.'
          : `## Missing fields to fill (${missingFields.join(', ')})\n\nFor each field below, generate the value described, then call write_feature_fields with all generated values.\n\n${fieldInstructions}`

        return {
          content: [{
            type: 'text',
            text: `${instructions}\n\n## Context\n\n${contextStr}`,
          }],
        }
      }

      case 'write_feature_fields': {
        const featureDir = resolvePath(String(a.path))
        const featurePath = path.join(featureDir, 'feature.json')
        let raw: string
        try {
          raw = fs.readFileSync(featurePath, 'utf-8')
        } catch {
          return { content: [{ type: 'text', text: `No feature.json found at "${featurePath}"` }], isError: true }
        }
        const existing = JSON.parse(raw) as Record<string, unknown>
        const fields = a.fields as Record<string, unknown>
        if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
          return { content: [{ type: 'text', text: 'fields must be a JSON object' }], isError: true }
        }
        const updated = { ...existing, ...fields }
        fs.writeFileSync(featurePath, JSON.stringify(updated, null, 2) + '\n', 'utf-8')
        const writtenKeys = Object.keys(fields)
        return {
          content: [{
            type: 'text',
            text: `✓ Wrote ${writtenKeys.length} field(s) to ${featurePath}: ${writtenKeys.join(', ')}`,
          }],
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
  if (feature.priority) lines.push(`Priority  : P${feature.priority}/5`)
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
  childrenOf: Map<string, string[]>,
  depth: number,
): string {
  const indent = '    '.repeat(depth)
  const line = `${indent}${statusIcon(feature.status)} ${feature.featureKey} (${feature.status}) — ${feature.title}`
  // Prefer the scanned childrenOf map (derived from parent refs) so the tree
  // works even when lineage.children arrays are absent or stale.
  // Sort siblings by priority (1 = highest) then by key for stable order.
  const children = (childrenOf.get(feature.featureKey) ?? feature.lineage?.children ?? [])
    .slice()
    .sort((a, b) => {
      const pa = map.get(a)?.priority ?? 9999
      const pb = map.get(b)?.priority ?? 9999
      return pa !== pb ? pa - pb : a.localeCompare(b)
    })
  const childLines = children.flatMap((key) => {
    const child = map.get(key)
    return child ? [buildLineageTree(child, map, childrenOf, depth + 1)] : []
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

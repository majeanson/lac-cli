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
import { handleAuditDecisions, handleFeatureSimilarity } from './tools/analysis.js'
import { handleTimeTravel } from './tools/git-tools.js'
import { handleCrossFeatureImpact } from './tools/impact.js'
import {
  buildContext,
  contextToString,
  getMissingFields,
  ALL_FILLABLE_FIELDS,
  FILL_PROMPTS,
  JSON_FIELDS,
  appendPromptLog,
  loadGuardlockConfig,
  checkGuardlock,
  formatGuardlockMessage,
  type FieldLock,
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
      description: 'Search all features in the workspace by key, title, tags, problem, analysis, implementation, or decisions text.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          status: {
            type: 'string',
            enum: ['draft', 'active', 'frozen', 'deprecated'],
            description: 'Filter by status (optional)',
          },
          domain: {
            type: 'string',
            description: 'Filter by domain (optional)',
          },
          path: {
            type: 'string',
            description: 'Directory to scan (default: workspace root)',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'create_feature',
      description: 'Create a new feature.json in the specified directory. After creating, immediately call read_feature_context on the same path to analyze surrounding code and fill all required fields before calling advance_feature.',
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
          path: {
            type: 'string',
            description: 'Directory to scan (default: workspace root)',
          },
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
          revisionWarnings: {
            type: 'boolean',
            description: 'Include warnings for features with no revision entries (default: true). Set false during migration of existing repos.',
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
        'Patch a feature.json with new field values. Use this after read_feature_context — write the fields you generated back to disk. If you are changing intent-critical fields (problem, analysis, implementation, decisions, successCriteria), pass a revision object with author and reason. Guardlock: if the feature has restricted fields (via lac.config.json guardlock.restrictedFields, feature.fieldLocks, or feature.featureLocked), those fields are blocked or warned by default — pass override: true to force-write them. After writing, call advance_feature to check if the feature is ready to transition.',
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
          revision: {
            type: 'object',
            description:
              'Required when changing intent-critical fields (problem, analysis, implementation, decisions, successCriteria). Appended to the revisions array.',
            properties: {
              author: { type: 'string', description: 'Who is making the change.' },
              reason: { type: 'string', description: 'Why these fields are being changed.' },
            },
            required: ['author', 'reason'],
          },
          override: {
            type: 'boolean',
            description:
              'Set to true to bypass guardlock and write restricted fields anyway. Only use when the user explicitly requests it — guardlocks exist to protect human decisions from AI drift.',
          },
        },
        required: ['path', 'fields'],
      },
    },
    {
      name: 'advance_feature',
      description:
        'Validate and transition a feature to a new status. Call this after write_feature_fields — it checks that required fields are filled for the target status and writes the new status. If fields are missing it returns exactly which ones so you can ask the user or fill them first. Transitions: draft→active (requires analysis, implementation, decisions, successCriteria), active→frozen (requires all fields + tags + knownLimitations), frozen→active (reopen — requires a reason describing what changed), any→deprecated.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute or relative path to the feature folder',
          },
          to: {
            type: 'string',
            enum: ['active', 'frozen', 'deprecated'],
            description: 'Target status',
          },
          reason: {
            type: 'string',
            description: 'Required when reopening (frozen→active). Describe what changed.',
          },
        },
        required: ['path', 'to'],
      },
    },
    {
      name: 'spawn_child_feature',
      description:
        "Spawn a child feature from a parent — use when a bug is found, a subtask is extracted, or scope is split. Creates the child feature.json with lineage.parent set and patches the parent's lineage.children. After spawning, call read_feature_context on the child path to begin its lifecycle.",
      inputSchema: {
        type: 'object',
        properties: {
          parentPath: {
            type: 'string',
            description: 'Absolute or relative path to the parent feature folder',
          },
          dir: {
            type: 'string',
            description: 'Directory to create the child feature in',
          },
          title: { type: 'string', description: 'Child feature title' },
          problem: { type: 'string', description: 'Problem the child addresses' },
          spawnReason: {
            type: 'string',
            description: 'Why this child was spawned (e.g. "bug: login fails on Safari", "scope split: extract payment flow")',
          },
        },
        required: ['parentPath', 'dir', 'title', 'problem', 'spawnReason'],
      },
    },
    {
      name: 'get_feature_status',
      description:
        'Lightweight orientation tool — returns the current lifecycle state of a feature: status, filled vs missing fields, stale fields flagged from reopens, valid next transitions, and the exact next tool to call. Use this whenever picking up a feature mid-session to know where it stands before taking action.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute or relative path to the feature folder',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'extract_feature_from_code',
      description:
        'Inverse of create_feature — given a directory with existing code but NO feature.json, reads all source files and returns instructions for Claude to generate a complete feature.json proposal. Use this to onboard legacy code into LAC. After calling this tool, generate the fields, then call create_feature followed by write_feature_fields.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Directory containing source code (must NOT already have a feature.json)',
          },
          maxFileSize: {
            type: 'number',
            description: 'Maximum characters to read per file before truncating (default: 8000). Increase for large files.',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'feature_changelog',
      description:
        'Generate a chronological changelog for a feature — shows status transitions (from statusHistory), reopens, and spawned children in timeline form. Use this to understand the full history of a feature.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute or relative path to the feature folder',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'roadmap_view',
      description:
        'Return a structured overview of all features in the workspace grouped by status (active → draft → frozen → deprecated) and sorted by priority. Shows missing fields and child counts at a glance. Use this to orient before a session or plan what to work on.',
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
      name: 'suggest_split',
      description:
        'Analyze a feature and recommend whether it should be broken into child features. Reads source files, detects split signals (file count, mixed domains, "and" in problem statement), and returns context + instructions for Claude to propose a split and call spawn_child_feature.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute or relative path to the feature folder',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'feature_summary_for_pr',
      description:
        'Generate a ready-to-paste pull request description from a feature.json — includes problem, what was built, key decisions, known limitations, success criteria, and lineage. Use this when opening a PR for a feature.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute or relative path to the feature folder',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'audit_decisions',
      description:
        'Scan all features and surface technical debt in decisions: features missing decisions, decisions with risky language (revisit/temporary/hack/workaround), and features with suspiciously similar titles in the same domain that may be duplicates. Run this periodically to keep the workspace healthy.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory to scan (default: workspace root)' },
        },
      },
    },
    {
      name: 'feature_similarity',
      description:
        'Find features semantically similar to a given one — same domain, shared tags, or overlapping keywords in title/problem. Use this before create_feature to avoid duplication, or to discover related work.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative path to the feature folder to compare against' },
        },
        required: ['path'],
      },
    },
    {
      name: 'time_travel',
      description:
        'Show what a feature.json looked like at a specific point in git history. Call with just path to see the full commit history for the file. Call with path + date (YYYY-MM-DD) or commit (SHA) to view that specific version.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative path to the feature folder' },
          date: { type: 'string', description: 'YYYY-MM-DD — show the most recent version at or before this date' },
          commit: { type: 'string', description: 'Git commit SHA to view (full or short)' },
        },
        required: ['path'],
      },
    },
    {
      name: 'cross_feature_impact',
      description:
        'Given a source file, find all features whose code imports or references it. Use this before refactoring a shared utility, changing an interface, or deleting a file — shows the blast radius across all tracked features.',
      inputSchema: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Absolute or relative path to the source file to analyze' },
        },
        required: ['file'],
      },
    },
    {
      name: 'summarize_workspace',
      description:
        'Summarize the entire codebase by reading only feature.json files and READMEs — no source code. Returns a structured overview: project purpose, features grouped by domain, key decisions, and stats. Ideal for fast orientation before a coding session or for injecting project context into an AI prompt.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Directory to scan (default: workspace root)',
          },
          format: {
            type: 'string',
            enum: ['markdown', 'json'],
            description: 'Output format: "markdown" (default) or "json"',
          },
        },
        required: [],
      },
    },
    {
      name: 'lock_feature_fields',
      description:
        'Lock or unlock specific fields in a feature.json, or toggle featureLocked for the whole feature. Use this when the user says "lock these fields while working on this feature" or "don\'t let AI touch X". Locked fields are skipped by write_feature_fields and read_feature_context will tell Claude not to generate them.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute or relative path to the feature folder',
          },
          action: {
            type: 'string',
            enum: ['lock', 'unlock', 'freeze', 'thaw', 'status'],
            description:
              '"lock" — add fields to fieldLocks. "unlock" — remove from fieldLocks. "freeze" — set featureLocked: true (lock all fields). "thaw" — remove featureLocked. "status" — show current locks.',
          },
          fields: {
            type: 'array',
            items: { type: 'string' },
            description: 'Field names to lock or unlock (required for lock/unlock actions)',
          },
          reason: {
            type: 'string',
            description: 'Why these fields are being locked (shown in guardlock notices)',
          },
          author: {
            type: 'string',
            description: 'Who is setting the lock (defaults to "Claude" for MCP-initiated locks)',
          },
        },
        required: ['path', 'action'],
      },
    },
    {
      name: 'extract_all_features',
      description:
        'Scan a repository and return a manifest of all directories that should have feature.json files but do not yet. Useful for onboarding a legacy or external repo into LAC. After calling this tool, iterate over the returned candidates and call extract_feature_from_code on each one.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Root directory to scan (default: workspace root)',
          },
          strategy: {
            type: 'string',
            enum: ['module', 'directory'],
            description:
              '"module" (default) — directories containing package.json, go.mod, Cargo.toml, index.ts, etc. "directory" — every directory that contains source files.',
          },
          depth: {
            type: 'number',
            description: 'Maximum directory depth to descend (default: 4 for module, 2 for directory)',
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
      case 'blame_file': {
        const filePath = resolvePath(String(a.file))
        const feature = findNearestFeature(path.dirname(filePath))
        if (!feature) {
          return {
            content: [{ type: 'text', text: `No feature.json found for "${a.file}". The file may not be under any tracked feature directory.` }],
          }
        }
        return { content: [{ type: 'text', text: `File      : ${String(a.file)}\n${formatFeatureSummary(feature)}` }] }
      }

      case 'search_features': {
        const query = String(a.query).toLowerCase()
        const statusFilter = a.status as string | undefined
        const domainFilter = a.domain as string | undefined
        const scanDir = a.path ? resolvePath(String(a.path)) : workspaceRoot
        const features = scanAllFeatures(scanDir)
        const matches = features.filter(({ feature }) => {
          if (statusFilter && feature.status !== statusFilter) return false
          if (domainFilter && feature.domain !== domainFilter) return false
          const decisionsText = (feature.decisions ?? []).map(d => d.decision + ' ' + d.rationale).join(' ')
          const haystack = [
            feature.featureKey,
            feature.title,
            feature.problem,
            feature.analysis ?? '',
            feature.implementation ?? '',
            decisionsText,
            ...(feature.tags ?? []),
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
          content: [{ type: 'text', text: `Created "${featureKey}" at "${featurePath}" (${feature.status}).\n\nNext: call read_feature_context on "${dir}" to analyze the code and fill missing fields, then advance_feature when ready.` }],
        }
      }

      case 'get_lineage': {
        const featureKey = String(a.featureKey)
        const scanDir = a.path ? resolvePath(String(a.path)) : workspaceRoot
        const features = scanAllFeatures(scanDir)
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
        const revisionWarnings = a.revisionWarnings !== false
        const features = scanAllFeatures(scanDir)
        const featureKeys = new Set(features.map(({ feature }) => feature.featureKey))
        const INTENT_CRITICAL_LINT = ['problem', 'analysis', 'implementation', 'decisions', 'successCriteria'] as const
        const results = features.map(({ feature, filePath }) => {
          const issues: string[] = []
          const warnings: string[] = []
          const raw = feature as unknown as Record<string, unknown>

          if (!feature.problem?.trim()) issues.push('missing problem')
          if (feature.status === 'active') {
            if (!feature.analysis?.trim()) issues.push('missing analysis')
            if (!feature.implementation?.trim()) issues.push('missing implementation')
            if (!feature.decisions?.length) issues.push('no decisions recorded')
          }
          // Lineage integrity
          if (feature.lineage?.parent && !featureKeys.has(feature.lineage.parent)) {
            issues.push(`orphaned: parent "${feature.lineage.parent}" not found`)
          }
          for (const child of feature.lineage?.children ?? []) {
            if (!featureKeys.has(child)) issues.push(`broken child ref: "${child}" not found`)
          }
          // Pointer integrity
          if (raw.superseded_by && !featureKeys.has(String(raw.superseded_by))) {
            issues.push(`broken superseded_by ref: "${raw.superseded_by}" not found`)
          }
          if (raw.merged_into && !featureKeys.has(String(raw.merged_into))) {
            issues.push(`broken merged_into ref: "${raw.merged_into}" not found`)
          }
          for (const key of (raw.merged_from as string[] | undefined) ?? []) {
            if (!featureKeys.has(key)) issues.push(`broken merged_from ref: "${key}" not found`)
          }
          // Pre-freeze warnings: surface fields that will block advance_feature(frozen) while still active/draft
          if (feature.status === 'active' || feature.status === 'draft') {
            const preFreeze = getMissingForTransition(feature, 'frozen')
            if (preFreeze.length > 0) {
              warnings.push(`will block freeze — missing: ${preFreeze.join(', ')}`)
            }
          }
          // Lifecycle warnings
          if (raw.superseded_by && feature.status !== 'deprecated') {
            warnings.push(`superseded_by set but status is "${feature.status}" — consider deprecating`)
          }
          if (raw.merged_into && feature.status !== 'deprecated') {
            warnings.push(`merged_into set but status is "${feature.status}" — consider deprecating`)
          }
          // Revision warnings
          const hasRevisions = Array.isArray(raw.revisions) && (raw.revisions as unknown[]).length > 0
          if (revisionWarnings && !hasRevisions) {
            const filledCritical = INTENT_CRITICAL_LINT.filter((f) => {
              const val = raw[f]
              if (val === undefined || val === null) return false
              if (typeof val === 'string') return val.trim().length > 0
              if (Array.isArray(val)) return val.length > 0
              return false
            })
            if (filledCritical.length > 0) {
              warnings.push(`no revisions recorded for: ${filledCritical.join(', ')}`)
            }
          }
          return { feature, filePath, issues, warnings }
        })

        // Bidirectional pointer consistency (requires full feature map)
        const featureByKey = new Map(features.map(({ feature }) => [feature.featureKey, feature as unknown as Record<string, unknown>]))
        for (const result of results) {
          const raw = featureByKey.get(result.feature.featureKey)
          if (!raw) continue
          if (raw.merged_into) {
            const target = featureByKey.get(String(raw.merged_into))
            if (target) {
              const mergedFrom = (target.merged_from as string[] | undefined) ?? []
              if (!mergedFrom.includes(result.feature.featureKey)) {
                result.warnings.push(`merged_into "${raw.merged_into}" but that feature does not list this key in merged_from`)
              }
            }
          }
          for (const sourceKey of (raw.merged_from as string[] | undefined) ?? []) {
            const source = featureByKey.get(sourceKey)
            if (source && source.merged_into !== result.feature.featureKey) {
              result.warnings.push(`merged_from includes "${sourceKey}" but that feature does not point merged_into this key`)
            }
          }
          if (raw.superseded_by) {
            const successor = featureByKey.get(String(raw.superseded_by))
            if (successor) {
              const supersededFrom = (successor.superseded_from as string[] | undefined) ?? []
              if (!supersededFrom.includes(result.feature.featureKey)) {
                result.warnings.push(`superseded_by "${raw.superseded_by}" but that feature does not list this key in superseded_from`)
              }
            }
          }
        }

        // Detect duplicate featureKeys across the workspace
        const keyCount = new Map<string, string[]>()
        for (const { feature, filePath } of features) {
          const paths = keyCount.get(feature.featureKey) ?? []
          paths.push(filePath)
          keyCount.set(feature.featureKey, paths)
        }
        const duplicateKeys = [...keyCount.entries()].filter(([, paths]) => paths.length > 1)

        const failures = results.filter((r) => r.issues.length > 0)
        const warned = results.filter((r) => r.warnings.length > 0)
        const passes = results.filter((r) => r.issues.length === 0)
        const lines = [
          ...passes.map((r) => `  ✓  ${r.feature.featureKey.padEnd(18)} ${r.feature.status}${r.warnings.length > 0 ? ` ⚠ ${r.warnings.join('; ')}` : ''}`),
          ...failures.map(
            (r) =>
              `  ✗  ${r.feature.featureKey.padEnd(18)} ${r.feature.status}\n       ${r.issues.join(', ')}${r.warnings.length > 0 ? `\n       ⚠ ${r.warnings.join('; ')}` : ''}`,
          ),
        ]
        if (duplicateKeys.length > 0) {
          lines.push('')
          lines.push(`⛔ Duplicate featureKeys detected (${duplicateKeys.length}):`)
          for (const [key, paths] of duplicateKeys) {
            lines.push(`  ${key}`)
            for (const p of paths) lines.push(`    ${path.relative(scanDir, p)}`)
          }
        }
        return {
          content: [
            {
              type: 'text',
              text: `${passes.length} passed, ${failures.length} failed, ${warned.length} warned — ${results.length} features checked${duplicateKeys.length > 0 ? ` ⛔ ${duplicateKeys.length} duplicate key(s)` : ''}\n\n${lines.join('\n')}`,
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

        // Check componentFile paths exist on disk — catches stale file references
        let componentFileWarning = ''
        if (feature.componentFile) {
          const filePaths = feature.componentFile.split(',').map((s) => s.trim()).filter(Boolean)
          const notFound = filePaths.filter((p) => {
            const candidates = [
              path.resolve(featureDir, p),
              path.resolve(workspaceRoot, p),
            ]
            return candidates.every((c) => !fs.existsSync(c))
          })
          if (notFound.length > 0) {
            componentFileWarning = `\n## ⚠ componentFile drift\nThese paths do not exist on disk — update componentFile to match actual source files:\n${notFound.map((p) => `  - ${p}`).join('\n')}\n`
          }
        }

        // ── Guardlock: resolve which fields are locked ────────────────────────
        const guardConfig = loadGuardlockConfig(featureDir)
        const featureFieldLocks = (feature as Record<string, unknown>).fieldLocks as FieldLock[] | undefined ?? []
        const featureLocked = !!(feature as Record<string, unknown>).featureLocked
        let lockedFieldNames = new Set<string>()
        let guardlockNotice = ''
        if (guardConfig.mode !== 'off') {
          const { lockedFields, lockReasons } = (() => {
            if (featureLocked) {
              // All fields are locked — build a set from all attempted fields
              const allFields = new Set(missingFields.map(String))
              const reasons = new Map<string, string>()
              for (const f of allFields) reasons.set(f, 'feature is AI-locked (featureLocked: true)')
              return { lockedFields: allFields, lockReasons: reasons }
            }
            const locked = new Set<string>()
            const reasons = new Map<string, string>()
            for (const f of guardConfig.restrictedFields) {
              locked.add(f)
              reasons.set(f, 'workspace guardlock.restrictedFields')
            }
            for (const lock of featureFieldLocks) {
              locked.add(lock.field)
              if (!reasons.has(lock.field)) {
                reasons.set(lock.field, lock.reason ? `per-feature lock: ${lock.reason}` : `locked by ${lock.lockedBy}`)
              }
            }
            return { lockedFields: locked, lockReasons: reasons }
          })()
          lockedFieldNames = lockedFields
          if (lockedFields.size > 0) {
            const lockedLines = [...lockedFields]
              .filter((f) => missingFields.includes(f as typeof missingFields[number]))
              .map((f) => `  - ${f}: ${lockReasons.get(f)}`)
            if (lockedLines.length > 0) {
              guardlockNotice = `## 🔒 Guardlock — DO NOT generate these fields\nThese fields are human-locked. Do not write values for them. The human will fill them.\n${lockedLines.join('\n')}\n\n`
            }
          }
        }

        // Build per-field instructions so Claude knows exactly what to generate
        const fieldInstructions = missingFields
          .filter((f) => !lockedFieldNames.has(f))
          .map((field) => {
            const prompt = FILL_PROMPTS[field]
            const isJson = JSON_FIELDS.has(field)
            return `### ${field}\n${prompt.system}\n${prompt.userSuffix}\n${isJson ? '(Return valid JSON for this field)' : '(Return plain text for this field)'}`
          }).join('\n\n')
        const fillableFields = missingFields.filter((f) => !lockedFieldNames.has(f))

        // Check for stale-review annotation written by advance_feature on reopen
        const staleAnnotation = feature.annotations?.find((ann) => ann.type === 'stale-review')
        const staleWarning = staleAnnotation
          ? `## ⚠ Stale fields (feature was reopened)\n${staleAnnotation.body}\nReview and rewrite these fields against the current code, then call write_feature_fields.\n\n`
          : ''

        const instructions =
          fillableFields.length === 0 && missingFields.length === 0
            ? staleWarning || 'All fillable fields are already populated. No generation needed.'
            : fillableFields.length === 0 && missingFields.length > 0
            ? `${guardlockNotice}${staleWarning}All missing fields are human-locked. No AI generation needed — the human will fill them.`
            : `${guardlockNotice}${staleWarning}## Missing fields to fill (${fillableFields.join(', ')})\n\nGenerate each field described below, then call write_feature_fields with all values at once. Fill ALL missing fields before calling advance_feature.\n\n${fieldInstructions}`

        return {
          content: [{
            type: 'text',
            text: `${componentFileWarning}${instructions}\n\n## Context\n\n${contextStr}`,
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

        const override = a.override === true

        // ── Guardlock check ──────────────────────────────────────────────────
        if (!override) {
          const guardConfig = loadGuardlockConfig(featureDir)
          const featureFieldLocks = (existing.fieldLocks as FieldLock[] | undefined) ?? []
          const featureLocked = existing.featureLocked === true
          const violations = checkGuardlock(guardConfig, featureFieldLocks, Object.keys(fields), featureLocked)
          if (violations.length > 0) {
            const msg = formatGuardlockMessage(violations, guardConfig.mode === 'block' ? 'block' : 'warn', true)
            if (guardConfig.mode === 'block') {
              return { content: [{ type: 'text', text: msg }], isError: true }
            }
            // warn mode: proceed but prepend the warning to the response
            // (handled below by injecting guardlockWarning into the response text)
            ;(a as Record<string, unknown>).__guardlockWarning = msg
          }
        }
        const guardlockWarning = (a as Record<string, unknown>).__guardlockWarning as string | undefined

        const INTENT_CRITICAL = new Set(['problem', 'analysis', 'implementation', 'decisions', 'successCriteria'])
        const changingCritical = Object.keys(fields).filter((k) => INTENT_CRITICAL.has(k))

        const updated = { ...existing, ...fields }

        // Always bump lastVerifiedDate on any write
        const _d0 = new Date()
        updated.lastVerifiedDate = `${_d0.getFullYear()}-${String(_d0.getMonth() + 1).padStart(2, '0')}-${String(_d0.getDate()).padStart(2, '0')}`

        // Handle revision
        const revisionInput = a.revision as { author: string; reason: string } | undefined
        let revisionWarning = ''
        if (changingCritical.length > 0) {
          if (revisionInput?.author && revisionInput?.reason) {
            const _d1 = new Date()
            const today = `${_d1.getFullYear()}-${String(_d1.getMonth() + 1).padStart(2, '0')}-${String(_d1.getDate()).padStart(2, '0')}`
            const existingRevisions = (existing.revisions as unknown[]) ?? []
            updated.revisions = [
              ...existingRevisions,
              { date: today, author: revisionInput.author, fields_changed: changingCritical, reason: revisionInput.reason },
            ]
            // Clear stale-review annotations — fields have been actively revised
            const existingAnnotations = (existing.annotations as Array<{ type: string }> | undefined) ?? []
            updated.annotations = existingAnnotations.filter((ann) => ann.type !== 'stale-review')
          } else {
            revisionWarning = `\n\n⚠ Intent-critical fields changed (${changingCritical.join(', ')}) without a revision entry. Pass a "revision" object with author and reason to attribute this change.`
          }
        }

        fs.writeFileSync(featurePath, JSON.stringify(updated, null, 2) + '\n', 'utf-8')

        // Append prompt log entries — source 'mcp' because Claude wrote the values directly
        const now = new Date().toISOString()
        appendPromptLog(featureDir, Object.keys(fields).map((field) => {
          const val = fields[field]
          const value_preview = (typeof val === 'string' ? val : JSON.stringify(val)).slice(0, 120)
          return { date: now, field, source: 'mcp' as const, value_preview }
        }))

        const writtenKeys = Object.keys(fields)
        const afterWrite = JSON.parse(fs.readFileSync(featurePath, 'utf-8')) as unknown
        const afterResult = validateFeature(afterWrite)
        const stillMissing = afterResult.success ? getMissingFields(afterResult.data) : []
        const nextHint = stillMissing.length > 0
          ? `${stillMissing.length} field(s) still missing: ${stillMissing.join(', ')}. Fill all remaining fields with write_feature_fields before calling advance_feature.`
          : `All AI fields filled. Call advance_feature to transition status when ready.`
        return {
          content: [{
            type: 'text',
            text: `${guardlockWarning ? guardlockWarning + '\n\n' : ''}✓ Wrote ${writtenKeys.length} field(s) to ${featurePath}: ${writtenKeys.join(', ')}\n\n${nextHint}${revisionWarning}`,
          }],
        }
      }

      case 'advance_feature': {
        const featureDir = resolvePath(String(a.path))
        const featurePath = path.join(featureDir, 'feature.json')
        let raw: string
        try {
          raw = fs.readFileSync(featurePath, 'utf-8')
        } catch {
          return { content: [{ type: 'text', text: `No feature.json found at "${featurePath}"` }], isError: true }
        }
        const parsed = JSON.parse(raw) as Record<string, unknown>
        const result = validateFeature(parsed)
        if (!result.success) {
          return { content: [{ type: 'text', text: `Invalid feature.json: ${result.errors.join(', ')}` }], isError: true }
        }
        const feature = result.data
        const to = String(a.to) as Feature['status']
        const from = feature.status
        const reason = a.reason ? String(a.reason) : undefined

        const illegal = checkIllegalTransition(from, to)
        if (illegal) return { content: [{ type: 'text', text: illegal }] }

        if (from === 'frozen' && to === 'active' && !reason) {
          return {
            content: [{ type: 'text', text: 'Reopening a frozen feature requires a reason. Call advance_feature again with the reason parameter describing what changed.' }],
          }
        }

        const missing = getMissingForTransition(feature, to)
        if (missing.length > 0) {
          return {
            content: [{
              type: 'text',
              text: `Cannot advance "${feature.featureKey}" to "${to}" — ${missing.length} required field(s) missing: ${missing.join(', ')}.\n\nCall read_feature_context on this path, fill the missing fields with write_feature_fields, then try advance_feature again.`,
            }],
          }
        }

        // ── Guardlock checks on freeze ────────────────────────────────────────
        if (to === 'frozen') {
          const guardConfig = loadGuardlockConfig(featureDir)

          // requireAlternatives: every decision must document what was rejected
          if (guardConfig.requireAlternatives) {
            const decisionsWithoutAlternatives = (feature.decisions ?? []).filter(
              (d) => !d.alternativesConsidered || d.alternativesConsidered.length === 0,
            )
            if (decisionsWithoutAlternatives.length > 0) {
              const names = decisionsWithoutAlternatives.map((d) => `"${d.decision.slice(0, 50)}"`)
              return {
                content: [{
                  type: 'text',
                  text: `🔒 Guardlock blocked freeze — ${decisionsWithoutAlternatives.length} decision(s) missing alternativesConsidered:\n${names.map((n) => `  - ${n}`).join('\n')}\n\nAdd alternativesConsidered to each decision explaining what was rejected and why, then try again.\nThis is what makes a feature.json a real guardlock — not just what you chose, but what you didn't.`,
                }],
              }
            }
          }

          // freezeRequiresHumanRevision: at least one revision entry must exist on intent-critical fields
          if (guardConfig.freezeRequiresHumanRevision) {
            const INTENT_CRITICAL_FREEZE = ['problem', 'analysis', 'implementation', 'decisions', 'successCriteria'] as const
            const hasRevisions = Array.isArray(parsed.revisions) && (parsed.revisions as unknown[]).length > 0
            const filledCritical = INTENT_CRITICAL_FREEZE.filter((f) => {
              const val = (feature as Record<string, unknown>)[f]
              if (val === undefined || val === null) return false
              if (typeof val === 'string') return val.trim().length > 0
              if (Array.isArray(val)) return val.length > 0
              return false
            })
            if (filledCritical.length > 0 && !hasRevisions) {
              return {
                content: [{
                  type: 'text',
                  text: `🔒 Guardlock blocked freeze — no revision entries recorded for intent-critical fields (${filledCritical.join(', ')}).\n\nA human must review and sign off before freezing. Call write_feature_fields with a revision object (author + reason) on any of these fields, then try advance_feature again.\nThis enforces that a human reviewed the decisions before they become a frozen contract.`,
                }],
              }
            }
          }
        }

        // On deprecation: warn if no lifecycle pointer is set
        let deprecationHint = ''
        if (to === 'deprecated') {
          const hasSuperseeded = !!parsed.superseded_by
          const hasMerged = !!parsed.merged_into
          if (!hasSuperseeded && !hasMerged) {
            deprecationHint = '\n\n⚠ No lifecycle pointer set. Consider running `lac supersede` or `lac merge`, or call write_feature_fields with superseded_by or merged_into before deprecating so future readers know where this feature went.'
          }
        }

        const _da = new Date()
        const today = `${_da.getFullYear()}-${String(_da.getMonth() + 1).padStart(2, '0')}-${String(_da.getDate()).padStart(2, '0')}`
        const updated: Record<string, unknown> = { ...parsed, status: to }

        // Freezing is a comprehensive review — stamp lastVerifiedDate
        if (to === 'frozen') updated.lastVerifiedDate = today

        // Always append to statusHistory
        const existingHistory = (updated.statusHistory as unknown[]) ?? []
        updated.statusHistory = [...existingHistory, { from, to, date: today, ...(reason ? { reason } : {}) }]

        // On reopen: log reopen + stale-review annotations so read_feature_context surfaces them
        if (from === 'frozen' && to === 'active' && reason) {
          const STALE_CANDIDATES: (keyof Feature)[] = ['analysis', 'implementation', 'decisions', 'successCriteria']
          const filledCritical = STALE_CANDIDATES.filter((f) => {
            const val = (feature as Record<string, unknown>)[f]
            if (val === undefined || val === null) return false
            if (typeof val === 'string') return val.trim().length > 0
            if (Array.isArray(val)) return val.length > 0
            return false
          })
          const staleBody = filledCritical.length > 0
            ? `Fields that may need updating after reopen: ${filledCritical.join(', ')}`
            : 'Review all intent-critical fields after reopen'
          const existingAnnotations = (updated.annotations as unknown[]) ?? []
          updated.annotations = [
            ...existingAnnotations,
            {
              id: `reopen-${Date.now()}`,
              author: 'lac advance',
              date: today,
              type: 'reopen',
              body: reason,
            },
            {
              id: `stale-${Date.now() + 1}`,
              author: 'lac advance',
              date: today,
              type: 'stale-review',
              body: staleBody,
            },
          ]
        }

        fs.writeFileSync(featurePath, JSON.stringify(updated, null, 2) + '\n', 'utf-8')

        const nextStep =
          to === 'active'
            ? from === 'frozen'
              ? 'Feature reopened. Call read_feature_context to review stale fields, update with write_feature_fields, then advance_feature to frozen when ready.'
              : 'Feature is active. Call read_feature_context to fill any missing fields, then advance_feature to frozen when complete.'
            : to === 'frozen'
            ? 'Feature is frozen. If a bug is found or requirements change, call spawn_child_feature or advance_feature with to: "active" and a reason.'
            : 'Feature deprecated.'
        return {
          content: [{ type: 'text', text: `✓ "${feature.featureKey}" ${from} → ${to}.\n\n${nextStep}${deprecationHint}` }],
        }
      }

      case 'spawn_child_feature': {
        const parentDir = resolvePath(String(a.parentPath))
        const parentFeaturePath = path.join(parentDir, 'feature.json')
        let parentRaw: string
        try {
          parentRaw = fs.readFileSync(parentFeaturePath, 'utf-8')
        } catch {
          return { content: [{ type: 'text', text: `No feature.json found at "${parentFeaturePath}"` }], isError: true }
        }
        const parentParsed = JSON.parse(parentRaw) as Record<string, unknown>
        const parentResult = validateFeature(parentParsed)
        if (!parentResult.success) {
          return { content: [{ type: 'text', text: `Invalid parent feature.json: ${parentResult.errors.join(', ')}` }], isError: true }
        }
        const parentFeature = parentResult.data

        const childDir = resolvePath(String(a.dir))
        const childFeaturePath = path.join(childDir, 'feature.json')
        if (fs.existsSync(childFeaturePath)) {
          return { content: [{ type: 'text', text: `feature.json already exists at "${childFeaturePath}".` }] }
        }
        fs.mkdirSync(childDir, { recursive: true })
        const childKey = generateFeatureKey(childDir)
        const child: Feature = {
          featureKey: childKey,
          title: String(a.title),
          status: 'draft',
          problem: String(a.problem),
          schemaVersion: 1,
          ...(parentFeature.domain ? { domain: parentFeature.domain } : {}),
          ...(parentFeature.tags?.length ? { tags: parentFeature.tags } : {}),
          lineage: {
            parent: parentFeature.featureKey,
            spawnReason: String(a.spawnReason),
          },
        }
        fs.writeFileSync(childFeaturePath, JSON.stringify(child, null, 2) + '\n', 'utf-8')

        const existingChildren = ((parentParsed.lineage as Record<string, unknown>)?.children as string[]) ?? []
        const updatedParent = {
          ...parentParsed,
          lineage: {
            ...(parentParsed.lineage as object ?? {}),
            children: [...existingChildren, childKey],
          },
        }
        fs.writeFileSync(parentFeaturePath, JSON.stringify(updatedParent, null, 2) + '\n', 'utf-8')

        return {
          content: [{
            type: 'text',
            text: `✓ Spawned "${childKey}" under "${parentFeature.featureKey}".\nReason: ${a.spawnReason}\nChild path: ${childDir}\n\nNext: call read_feature_context on "${childDir}" to begin the child feature's lifecycle.`,
          }],
        }
      }

      case 'get_feature_status': {
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
        const missingFields = getMissingFields(feature)
        const staleAnnotation = feature.annotations?.find((ann) => ann.type === 'stale-review')

        const validTransitions: string[] = []
        if (feature.status !== 'deprecated') validTransitions.push('deprecated')
        if (feature.status === 'draft') validTransitions.push('active')
        if (feature.status === 'active') validTransitions.push('frozen')
        if (feature.status === 'frozen') validTransitions.push('active (requires reason)')

        const nextAction =
          missingFields.length > 0
            ? `call read_feature_context to fill: ${missingFields.join(', ')}`
            : staleAnnotation
            ? `call read_feature_context to review stale fields (reopened feature)`
            : feature.status === 'draft'
            ? `call advance_feature with to: "active"`
            : feature.status === 'active'
            ? `call advance_feature with to: "frozen" when complete`
            : feature.status === 'frozen'
            ? `frozen — call spawn_child_feature for bugs, or advance_feature to reopen`
            : 'deprecated — no action needed'

        const currentStatusEntry = feature.statusHistory
          ? [...feature.statusHistory].reverse().find(h => h.to === feature.status)
          : undefined
        const sinceDate = currentStatusEntry?.date ?? null
        const lines = [
          `Key        : ${feature.featureKey}`,
          `Title      : ${feature.title}`,
          `Status     : ${statusIcon(feature.status)} ${feature.status}${sinceDate ? ` (since ${sinceDate})` : ''}`,
          `Missing    : ${missingFields.length === 0 ? 'none' : missingFields.join(', ')}`,
          `Stale      : ${staleAnnotation ? staleAnnotation.body : 'none'}`,
          `Transitions: ${validTransitions.join(', ')}`,
          `Parent     : ${feature.lineage?.parent ?? 'none'}`,
          `Children   : ${feature.lineage?.children?.length ?? 0}`,
          ``,
          `Next action: ${nextAction}`,
        ]
        return { content: [{ type: 'text', text: lines.join('\n') }] }
      }

      case 'extract_feature_from_code': {
        const dir = resolvePath(String(a.path))
        const featurePath = path.join(dir, 'feature.json')
        if (fs.existsSync(featurePath)) {
          return {
            content: [{ type: 'text', text: `feature.json already exists at "${featurePath}". Use read_feature_context instead.` }],
          }
        }
        // Use a placeholder feature to drive buildContext (we only need source files + git log)
        const placeholder: Feature = {
          featureKey: 'extract-pending',
          title: '(pending)',
          status: 'draft',
          problem: '(to be determined)',
        }
        const maxFileChars = a.maxFileSize ? Number(a.maxFileSize) : undefined
        const ctx = buildContext(dir, placeholder, maxFileChars !== undefined ? { maxFileChars } : {})
        if (ctx.sourceFiles.length === 0) {
          return {
            content: [{ type: 'text', text: `No source files found in "${dir}". Is this the right directory?` }],
          }
        }
        // Build context string without the placeholder feature.json section
        const parts: string[] = []
        if (ctx.truncatedFiles.length > 0) {
          parts.push(
            `⚠ WARNING: ${ctx.truncatedFiles.length} file(s) were truncated at ${maxFileChars ?? 8000} chars — extraction may be incomplete:`,
          )
          for (const f of ctx.truncatedFiles) parts.push(`  - ${f}`)
          parts.push(`Tip: re-call with maxFileSize set higher (e.g. 16000) to capture the full content.`)
          parts.push('')
        }
        if (ctx.gitLog) {
          parts.push('=== git log (last 20 commits) ===')
          parts.push(ctx.gitLog)
        }
        for (const file of ctx.sourceFiles) {
          parts.push(`\n=== ${file.relativePath}${file.truncated ? ' [truncated]' : ''} ===`)
          parts.push(file.content)
        }
        const rawContext = parts.join('\n')
        const instructions = `## Extract feature.json from existing code

No feature.json exists at "${dir}". Analyze the ${ctx.sourceFiles.length} source file(s) below and generate a complete feature.json proposal.

When done, execute in order:
1. Call create_feature with: dir="${dir}", plus your generated title and problem
2. Call write_feature_fields with: path="${dir}", fields containing analysis, decisions, implementation, knownLimitations, tags, successCriteria, domain
3. Call advance_feature to transition when ready

### Fields to generate
**title** — Short descriptive name (5-10 words)
**problem** — What problem does this code solve? 1-2 sentences.
**domain** — Single lowercase word or hyphenated phrase (e.g. "auth", "data-pipeline")
**tags** — 3-6 lowercase tags as JSON array: ["tag1", "tag2"]
**analysis** — Architectural overview, key patterns, why they were chosen. 150-300 words.
**decisions** — 2-4 key technical decisions as JSON array: [{"decision":"...","rationale":"...","alternativesConsidered":["..."]}]
**implementation** — Main components, data flow, non-obvious patterns. 100-200 words.
**knownLimitations** — 2-4 limitations/TODOs as JSON array: ["..."]
**successCriteria** — How do we know this works? 1-3 testable sentences.`
        return {
          content: [{ type: 'text', text: `${instructions}\n\n## Source files\n\n${rawContext}` }],
        }
      }

      case 'feature_changelog': {
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
        interface TimelineEvent { date: string; label: string }
        const events: TimelineEvent[] = []
        if (feature.statusHistory?.length) {
          for (const h of feature.statusHistory) {
            events.push({
              date: h.date,
              label: `${statusIcon(h.to)} ${h.from} → ${h.to}${h.reason ? ` — "${h.reason}"` : ''}`,
            })
          }
        } else {
          events.push({ date: '(unknown)', label: `${statusIcon(feature.status)} current: ${feature.status}` })
        }
        // Include revisions in timeline
        for (const rev of feature.revisions ?? []) {
          events.push({
            date: rev.date,
            label: `✎ revision by ${rev.author}: ${rev.fields_changed.join(', ')} — ${rev.reason}`,
          })
        }
        // Include all annotations (spawn, reopen, stale-review, tech-debt, etc.)
        for (const ann of feature.annotations ?? []) {
          if (ann.type === 'spawn') {
            events.push({ date: ann.date, label: `↳ spawned child — ${ann.body}` })
          } else if (ann.type === 'reopen') {
            events.push({ date: ann.date, label: `↺ reopened — ${ann.body}` })
          } else if (ann.type === 'stale-review') {
            events.push({ date: ann.date, label: `⚠ stale-review — ${ann.body}` })
          } else {
            events.push({ date: ann.date, label: `[${ann.type}] ${ann.body} (by ${ann.author})` })
          }
        }
        // Spawned children not covered by annotations
        const annotatedChildren = new Set(
          (feature.annotations ?? []).filter(a => a.type === 'spawn').map(a => a.body),
        )
        for (const child of feature.lineage?.children ?? []) {
          if (!annotatedChildren.has(child)) {
            events.push({ date: '(unknown)', label: `↳ spawned child: ${child}` })
          }
        }
        events.sort((a, b) => a.date.localeCompare(b.date))
        const decisionsLine = feature.decisions?.length
          ? `\nDecisions: ${feature.decisions.map((d) => `"${d.decision}"`).join(' · ')}`
          : ''
        const header = `${feature.featureKey} — "${feature.title}"\n${'─'.repeat(50)}`
        const timeline = events.map((e) => `${e.date.padEnd(12)} ${e.label}`).join('\n')
        return { content: [{ type: 'text', text: `${header}\n${timeline}${decisionsLine}` }] }
      }

      case 'roadmap_view': {
        const scanDir = a.path ? resolvePath(String(a.path)) : workspaceRoot
        const features = scanAllFeatures(scanDir)
        const byStatus: Record<string, ScannedFeature[]> = { active: [], draft: [], frozen: [], deprecated: [] }
        for (const f of features) {
          const group = byStatus[f.feature.status]
          if (group) group.push(f)
        }
        for (const group of Object.values(byStatus) as ScannedFeature[][]) {
          group.sort((a, b) => {
            const pa = a.feature.priority ?? 9999
            const pb = b.feature.priority ?? 9999
            return pa !== pb ? pa - pb : a.feature.featureKey.localeCompare(b.feature.featureKey)
          })
        }
        const formatGroup = (status: string, items: ScannedFeature[]): string => {
          if (items.length === 0) return ''
          const rows = items.map(({ feature }) => {
            const priority = feature.priority ? `P${feature.priority}` : ' - '
            const childCount = feature.lineage?.children?.length ?? 0
            const childNote = childCount > 0 ? `  [${childCount}↳]` : ''
            const missing = getMissingFields(feature)
            const warn = missing.length > 0 ? `  ⚠ missing: ${missing.join(', ')}` : ''
            return `  ${priority.padEnd(3)} ${feature.featureKey.padEnd(18)} ${feature.title}${childNote}${warn}`
          })
          return [`${statusIcon(status)} ${status.toUpperCase()} (${items.length})`, ...rows].join('\n')
        }
        const sections = ['active', 'draft', 'frozen', 'deprecated']
          .map((s) => formatGroup(s, byStatus[s] ?? []))
          .filter(Boolean)
        if (sections.length === 0) return { content: [{ type: 'text', text: 'No features found.' }] }
        return { content: [{ type: 'text', text: sections.join('\n\n') }] }
      }

      case 'suggest_split': {
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
        const signals = [
          ctx.sourceFiles.length > 8 ? `⚠ ${ctx.sourceFiles.length} source files (large)` : null,
          (feature.decisions?.length ?? 0) > 4 ? `⚠ ${feature.decisions!.length} decisions (broad scope)` : null,
          (feature.title + ' ' + feature.problem).toLowerCase().includes(' and ')
            ? '⚠ title/problem contains "and" (possible dual concern)'
            : null,
        ].filter(Boolean)
        const signalNote = signals.length > 0
          ? `\n**Signals detected:**\n${signals.map((s) => `- ${s}`).join('\n')}\n`
          : '\n**No obvious split signals — evaluate from the code.**\n'
        const instructions = `## Suggest split for "${feature.featureKey}" — "${feature.title}"
${signalNote}
Analyze the source files and determine whether this feature should be broken into smaller child features.

**Split signals to look for:**
- Source files with distinct concerns that don't depend on each other
- Multiple technical domains in the same codebase
- Decisions covering unrelated areas
- Problem statement describes multiple independent things

**Your response:**
1. Recommend: split or keep as-is, with 2-3 sentence justification
2. If split: propose 2-4 child features each with title, problem, spawnReason, and which files belong to it
   Then call spawn_child_feature for each (parentPath="${featureDir}", dir=<new subfolder>)
3. If keep: explain what makes this feature cohesive`
        return { content: [{ type: 'text', text: `${instructions}\n\n## Context\n\n${contextStr}` }] }
      }

      case 'feature_summary_for_pr': {
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
        const lines: string[] = [`## ${feature.featureKey} — ${feature.title}`, '', `**Problem:** ${feature.problem}`]
        if (feature.implementation) {
          lines.push('', '**What was built:**', feature.implementation)
        } else if (feature.analysis) {
          lines.push('', '**Overview:**', feature.analysis.slice(0, 300) + (feature.analysis.length > 300 ? '…' : ''))
        }
        if (feature.decisions?.length) {
          lines.push('', '**Key decisions:**')
          for (const d of feature.decisions) lines.push(`- **${d.decision}** — ${d.rationale}`)
        }
        if (feature.knownLimitations?.length) {
          lines.push('', '**Known limitations:**')
          for (const l of feature.knownLimitations) lines.push(`- ${l}`)
        }
        if (feature.successCriteria) lines.push('', `**Success criteria:** ${feature.successCriteria}`)
        const lineageParts: string[] = []
        if (feature.lineage?.parent) lineageParts.push(`child of \`${feature.lineage.parent}\``)
        if (feature.lineage?.children?.length) lineageParts.push(`spawned: ${feature.lineage.children.map((c) => `\`${c}\``).join(', ')}`)
        if (lineageParts.length) lines.push('', `**Lineage:** ${lineageParts.join(' · ')}`)
        if (feature.tags?.length) lines.push('', `**Tags:** ${feature.tags.map((t) => `\`${t}\``).join(', ')}`)
        lines.push('', '---', `*Generated from [\`${feature.featureKey}\`](feature.json) via LAC*`)
        return { content: [{ type: 'text', text: lines.join('\n') }] }
      }

      case 'summarize_workspace': {
        const scanDir = a.path ? resolvePath(String(a.path)) : workspaceRoot
        const format = a.format === 'json' ? 'json' : 'markdown'

        function readReadmeSummary(dir: string): string | null {
          for (const name of ['README.md', 'readme.md', 'Readme.md']) {
            const p = path.join(dir, name)
            if (!fs.existsSync(p)) continue
            try {
              const content = fs.readFileSync(p, 'utf-8')
              // Extract opening heading + first meaningful paragraph (up to 300 chars)
              const lines = content.split('\n')
              const parts: string[] = []
              let started = false
              for (const line of lines) {
                if (!started && line.trim()) started = true
                if (!started) continue
                parts.push(line)
                // Stop at first blank line after we have some content, or at 8 lines
                if (parts.length >= 2 && line.trim() === '') break
                if (parts.length >= 8) break
              }
              const text = parts.join('\n').trim()
              return text.length > 300 ? text.slice(0, 297) + '…' : text
            } catch { /* ignore */ }
          }
          return null
        }

        const allFeatures = scanAllFeatures(scanDir)

        if (allFeatures.length === 0) return { content: [{ type: 'text', text: 'No features found.' }] }

        const rootReadme = readReadmeSummary(scanDir)

        // Cache README reads per directory so features sharing a dir don't trigger N reads
        const readmeCache = new Map<string, string | null>()
        const cachedReadme = (dir: string): string | null => {
          if (!readmeCache.has(dir)) readmeCache.set(dir, readReadmeSummary(dir))
          return readmeCache.get(dir) ?? null
        }

        const statusCounts: Record<string, number> = { active: 0, draft: 0, frozen: 0, deprecated: 0 }
        let staleCount = 0
        for (const { feature } of allFeatures) {
          const s = feature.status
          if (s in statusCounts) statusCounts[s] = (statusCounts[s] ?? 0) + 1
          if (feature.annotations?.some(a => a.type === 'stale-review')) staleCount++
        }

        const byDomain = new Map<string, ScannedFeature[]>()
        const noDomain: ScannedFeature[] = []
        for (const f of allFeatures) {
          const d = f.feature.domain
          if (d) {
            const group = byDomain.get(d) ?? []
            group.push(f)
            byDomain.set(d, group)
          } else {
            noDomain.push(f)
          }
        }

        if (format === 'json') {
          const data = {
            rootReadme: rootReadme ?? null,
            stats: { total: allFeatures.length, byStatus: statusCounts, domains: [...byDomain.keys()] },
            domains: Object.fromEntries(
              [...byDomain.entries()].map(([domain, features]) => [
                domain,
                features.map(({ feature, filePath }) => ({
                  key: feature.featureKey,
                  title: feature.title,
                  status: feature.status,
                  problem: feature.problem,
                  tags: feature.tags ?? [],
                  decisionsCount: feature.decisions?.length ?? 0,
                  readme: readReadmeSummary(path.dirname(filePath)),
                  path: filePath,
                })),
              ]),
            ),
            uncategorized: noDomain.map(({ feature, filePath }) => ({
              key: feature.featureKey,
              title: feature.title,
              status: feature.status,
              problem: feature.problem,
              tags: feature.tags ?? [],
              decisionsCount: feature.decisions?.length ?? 0,
              readme: readReadmeSummary(path.dirname(filePath)),
              path: filePath,
            })),
          }
          return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
        }

        // Markdown format
        const lines: string[] = []

        if (rootReadme) {
          lines.push('## Project', '', rootReadme, '')
        }

        lines.push(
          '## Stats',
          `${allFeatures.length} features — ${statusCounts.active} active · ${statusCounts.draft} draft · ${statusCounts.frozen} frozen · ${statusCounts.deprecated} deprecated${staleCount > 0 ? ` · ${staleCount} stale (needs review)` : ''}`,
          '',
        )

        const formatRow = (feature: Feature, filePath: string): string => {
          const featureDir = path.dirname(filePath)
          const readme = cachedReadme(featureDir)
          const problem = feature.problem.length > 100 ? feature.problem.slice(0, 97) + '…' : feature.problem
          const tags = feature.tags?.length ? `  [${feature.tags.join(', ')}]` : ''
          const dec = feature.decisions?.length ? `  ${feature.decisions.length} decisions` : ''
          const readmeLine = readme
            ? `\n     ${(readme.split('\n')[0] ?? '').replace(/^#+\s*/, '').slice(0, 80)}`
            : ''
          return `  ${statusIcon(feature.status)} ${feature.featureKey.padEnd(18)} ${feature.title}${tags}${dec}\n     ${problem}${readmeLine}`
        }

        for (const [domain, features] of [...byDomain.entries()].sort(([a], [b]) => a.localeCompare(b))) {
          lines.push(`### ${domain}`)
          for (const { feature, filePath } of features) lines.push(formatRow(feature, filePath))
          lines.push('')
        }

        if (noDomain.length > 0) {
          lines.push('### (no domain)')
          for (const { feature, filePath } of noDomain) lines.push(formatRow(feature, filePath))
          lines.push('')
        }

        return { content: [{ type: 'text', text: lines.join('\n') }] }
      }

      case 'audit_decisions':
        return { ...handleAuditDecisions(a, workspaceRoot) }

      case 'feature_similarity':
        return { ...handleFeatureSimilarity(a, workspaceRoot) }

      case 'time_travel':
        return { ...handleTimeTravel(a, workspaceRoot) }

      case 'cross_feature_impact':
        return { ...handleCrossFeatureImpact(a, workspaceRoot) }

      case 'lock_feature_fields': {
        const featureDir = resolvePath(String(a.path))
        const featurePath = path.join(featureDir, 'feature.json')
        let rawStr: string
        try {
          rawStr = fs.readFileSync(featurePath, 'utf-8')
        } catch {
          return { content: [{ type: 'text', text: `No feature.json found at "${featurePath}"` }], isError: true }
        }
        const raw = JSON.parse(rawStr) as Record<string, unknown>
        const action = String(a.action)
        const author = a.author ? String(a.author) : 'Claude (MCP)'
        const reason = a.reason ? String(a.reason) : undefined
        const _dl = new Date()
        const lockedAt = `${_dl.getFullYear()}-${String(_dl.getMonth() + 1).padStart(2, '0')}-${String(_dl.getDate()).padStart(2, '0')}`
        type LockEntry = { field: string; lockedBy: string; lockedAt: string; reason?: string }
        const existingLocks: LockEntry[] = (raw.fieldLocks as LockEntry[] | undefined) ?? []

        if (action === 'status') {
          const featureLocked = raw.featureLocked === true
          const lines: string[] = [`🔒 Lock status for ${String(raw.featureKey)}`]
          if (featureLocked) lines.push('  ⚡ featureLocked: true — ALL fields are AI-locked')
          if (existingLocks.length > 0) {
            lines.push('  Per-field locks:')
            for (const l of existingLocks) {
              lines.push(`    🔒 ${l.field.padEnd(24)} by ${l.lockedBy} on ${l.lockedAt}${l.reason ? ` — ${l.reason}` : ''}`)
            }
          } else if (!featureLocked) {
            lines.push('  No per-field locks set.')
          }
          return { content: [{ type: 'text', text: lines.join('\n') }] }
        }

        if (action === 'freeze') {
          if (raw.featureLocked === true) {
            return { content: [{ type: 'text', text: `${String(raw.featureKey)} is already fully locked.` }] }
          }
          raw.featureLocked = true
          fs.writeFileSync(featurePath, JSON.stringify(raw, null, 2) + '\n', 'utf-8')
          return { content: [{ type: 'text', text: `⚡ ${String(raw.featureKey)} is now fully AI-locked (featureLocked: true).\nAI tools will refuse to write any field without override: true.` }] }
        }

        if (action === 'thaw') {
          if (!raw.featureLocked) {
            return { content: [{ type: 'text', text: `${String(raw.featureKey)} is not fully locked — nothing to thaw.` }] }
          }
          delete raw.featureLocked
          fs.writeFileSync(featurePath, JSON.stringify(raw, null, 2) + '\n', 'utf-8')
          return { content: [{ type: 'text', text: `🔓 ${String(raw.featureKey)}: featureLocked removed. Per-field locks (if any) remain.` }] }
        }

        const fields = (a.fields as string[] | undefined) ?? []
        if (fields.length === 0) {
          return { content: [{ type: 'text', text: `"fields" array is required for action "${action}"` }], isError: true }
        }

        if (action === 'lock') {
          const existingSet = new Set(existingLocks.map((l) => l.field))
          const newLocks = fields
            .filter((f) => !existingSet.has(f))
            .map((field) => ({ field, lockedBy: author, lockedAt, ...(reason ? { reason } : {}) }))
          const alreadyLocked = fields.filter((f) => existingSet.has(f))
          raw.fieldLocks = [...existingLocks, ...newLocks]
          fs.writeFileSync(featurePath, JSON.stringify(raw, null, 2) + '\n', 'utf-8')
          const lines = newLocks.map((l) => `  🔒 ${l.field}${l.reason ? ` — ${l.reason}` : ''}`)
          if (alreadyLocked.length > 0) lines.push(`  Already locked: ${alreadyLocked.join(', ')}`)
          return { content: [{ type: 'text', text: `Locked ${newLocks.length} field(s) in ${String(raw.featureKey)}:\n${lines.join('\n')}\n\nread_feature_context will now skip these fields. write_feature_fields will warn (or block) if these fields are in a write request.` }] }
        }

        if (action === 'unlock') {
          const toRemove = new Set(fields)
          const after = existingLocks.filter((l) => !toRemove.has(l.field))
          const removed = existingLocks.filter((l) => toRemove.has(l.field)).map((l) => l.field)
          raw.fieldLocks = after.length > 0 ? after : undefined
          if (raw.fieldLocks === undefined) delete raw.fieldLocks
          fs.writeFileSync(featurePath, JSON.stringify(raw, null, 2) + '\n', 'utf-8')
          return { content: [{ type: 'text', text: `🔓 Unlocked ${removed.length} field(s): ${removed.join(', ')}` }] }
        }

        return { content: [{ type: 'text', text: `Unknown action: "${action}"` }], isError: true }
      }

      case 'extract_all_features': {
        const toUnix = (p: string) => p.replace(/\\/g, '/')
        const scanRoot = a.path ? resolvePath(String(a.path)) : workspaceRoot
        const strategy = String(a.strategy ?? 'module') as 'module' | 'directory'
        const defaultDepth = strategy === 'directory' ? 2 : 4
        const maxDepth = a.depth ? Number(a.depth) : defaultDepth

        const MODULE_SIGNALS = new Set([
          'package.json', 'go.mod', 'Cargo.toml', 'pyproject.toml', 'setup.py',
          'pom.xml', 'build.gradle', 'build.gradle.kts', 'Gemfile', 'composer.json',
          'index.ts', 'index.js', 'index.tsx', 'mod.ts',
          'main.rs', 'main.go', 'main.ts', 'main.js', 'main.py',
          '__init__.py', 'lib.rs',
        ])
        const SOURCE_EXTS = new Set([
          '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs',
          '.java', '.kt', '.cs', '.rb', '.php', '.vue', '.svelte', '.sql',
          '.c', '.cpp', '.swift',
        ])
        const SKIP = new Set([
          'node_modules', '.git', 'dist', 'build', 'out', '__pycache__',
          '.turbo', 'coverage', 'vendor', 'target', '.next', '.nuxt',
          '.cache', '.venv', 'venv', '_archive', 'tmp', 'temp',
          'migrations', 'fixtures', 'mocks', '__mocks__',
        ])

        interface Candidate {
          dir: string
          relativePath: string
          signals: string[]
          sourceFileCount: number
          alreadyHasFeature: boolean
          parentDir: string | null
        }

        const candidates: Candidate[] = []
        const alreadyDocumented: string[] = []

        function mcpWalk(dir: string, depth: number): void {
          if (depth > maxDepth) return
          let entries: fs.Dirent[]
          try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }

          const names = new Set(entries.filter(e => e.isFile()).map(e => e.name))
          const hasFeatureJson = names.has('feature.json')

          if (hasFeatureJson) {
            alreadyDocumented.push(toUnix(path.relative(scanRoot, dir)) || '.')
          } else if (depth > 0) {
            const signals: string[] = []
            let sourceFileCount = 0
            for (const name of names) {
              if (MODULE_SIGNALS.has(name) || name.endsWith('.csproj')) signals.push(name)
              if (SOURCE_EXTS.has(path.extname(name))) sourceFileCount++
            }
            const shouldInclude =
              strategy === 'module' ? signals.length > 0 : sourceFileCount > 0
            if (shouldInclude) {
              candidates.push({
                dir,
                relativePath: toUnix(path.relative(scanRoot, dir)),
                signals,
                sourceFileCount,
                alreadyHasFeature: false,
                parentDir: null,
              })
            }
          }

          for (const e of entries) {
            if (!e.isDirectory() || e.name.startsWith('.') || SKIP.has(e.name)) continue
            mcpWalk(path.join(dir, e.name), depth + 1)
          }
        }

        mcpWalk(scanRoot, 0)

        // Assign parents
        candidates.sort((a, b) => a.dir.split(path.sep).length - b.dir.split(path.sep).length)
        const candidateDirs = new Set(candidates.map(c => c.dir))
        for (const c of candidates) {
          let parent = path.dirname(c.dir)
          while (parent !== scanRoot && parent !== path.dirname(parent)) {
            if (candidateDirs.has(parent)) { c.parentDir = parent; break }
            parent = path.dirname(parent)
          }
        }

        if (candidates.length === 0) {
          return {
            content: [{
              type: 'text',
              text: [
                `No undocumented modules found in "${scanRoot}".`,
                alreadyDocumented.length > 0
                  ? `${alreadyDocumented.length} director${alreadyDocumented.length === 1 ? 'y is' : 'ies are'} already documented:\n${alreadyDocumented.map(p => `  - \`${p}\``).join('\n')}`
                  : '',
                strategy === 'module'
                  ? 'Tip: try strategy="directory" to capture all directories with source files.'
                  : '',
              ].filter(Boolean).join('\n'),
            }],
          }
        }

        const lines: string[] = [
          `## extract_all_features — ${scanRoot}`,
          '',
          `**Strategy:** ${strategy}   **Depth:** ${maxDepth}`,
          `**Found:** ${candidates.length} undocumented module${candidates.length === 1 ? '' : 's'}`,
          alreadyDocumented.length > 0
            ? `**Already documented:** ${alreadyDocumented.length} (skipped):\n${alreadyDocumented.map(p => `  - \`${p}\``).join('\n')}`
            : null,
          '',
          '### Candidates',
          '',
        ].filter((s): s is string => s !== null)

        for (const c of candidates) {
          const indent = c.parentDir ? '  ' : ''
          const sigStr = c.signals.length > 0 ? ` [${c.signals.slice(0, 3).join(', ')}]` : ''
          const parentNote = c.parentDir
            ? ` (child of ${toUnix(path.relative(scanRoot, c.parentDir))})`
            : ''
          lines.push(
            `${indent}- \`${c.relativePath}\`` +
            `  —  ${c.sourceFileCount} src file${c.sourceFileCount === 1 ? '' : 's'}` +
            `${sigStr}${parentNote}`,
          )
        }

        lines.push('')
        lines.push('### Next steps')
        lines.push('')
        lines.push(
          'Call `extract_feature_from_code` on each candidate path above, in order (parents before children).',
          'Then call `create_feature` + `write_feature_fields` for each.',
          'Finally, wire lineage: for each child feature, set `lineage.parent` in write_feature_fields.',
          '',
          `**First call:** \`extract_feature_from_code("${candidates[0]?.dir}")\``,
        )

        return { content: [{ type: 'text', text: lines.join('\n') }] }
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
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '_archive') continue
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

// ─── Lifecycle helpers ────────────────────────────────────────────────────────

const REQUIRED_FOR_ACTIVE: (keyof Feature)[] = ['analysis', 'implementation', 'successCriteria']
const REQUIRED_FOR_FROZEN: (keyof Feature)[] = [
  'analysis', 'implementation', 'successCriteria', 'knownLimitations', 'tags',
  'userGuide', 'componentFile',
]

function getMissingForTransition(feature: Feature, to: Feature['status']): string[] {
  const required = to === 'active' ? REQUIRED_FOR_ACTIVE : to === 'frozen' ? REQUIRED_FOR_FROZEN : []
  const missing: string[] = []
  for (const field of required) {
    const val = (feature as Record<string, unknown>)[field]
    if (val === undefined || val === null) { missing.push(field); continue }
    if (typeof val === 'string' && val.trim().length === 0) { missing.push(field); continue }
    if (Array.isArray(val) && val.length === 0) { missing.push(field); continue }
  }
  if ((to === 'active' || to === 'frozen') && (!feature.decisions || feature.decisions.length === 0)) {
    missing.push('decisions')
  }
  return [...new Set(missing)]
}

function checkIllegalTransition(from: string, to: string): string | null {
  if (from === to) return `Feature is already "${to}".`
  if (from === 'deprecated') return `Cannot transition from deprecated. Create a new feature instead.`
  if (to === 'draft') return `Cannot transition back to draft. Use "active" to reopen.`
  return null
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

import type { Feature } from '@life-as-code/feature-schema'

export type FillableField =
  | 'analysis'
  | 'decisions'
  | 'implementation'
  | 'knownLimitations'
  | 'tags'
  | 'annotations'
  | 'successCriteria'
  | 'domain'
  | 'componentFile'
  | 'npmPackages'
  | 'publicInterface'
  | 'externalDependencies'
  | 'lastVerifiedDate'
  | 'codeSnippets'

export interface FieldPrompt {
  system: string
  userSuffix: string
}

const today = new Date().toISOString().split('T')[0]

export const FILL_PROMPTS: Record<FillableField, FieldPrompt> = {
  analysis: {
    system: `You are a software engineering analyst. Given a feature.json and the feature's source code, write a clear analysis section. Cover: what the code does architecturally, key patterns used, and why they were likely chosen. Be specific — name actual functions, modules, and techniques visible in the code. Write in first-person technical prose, 150-300 words. Return only the analysis text, no JSON wrapper, no markdown heading.`,
    userSuffix: 'Write the analysis field for this feature.',
  },
  decisions: {
    system: `You are a software engineering analyst. Given a feature.json and source code, extract 2-4 key technical decisions evident from the code. For each: what was decided (concrete), why (rationale from code evidence), what alternatives were likely considered.

Return ONLY a valid JSON array — no other text, no markdown fences:
[
  {
    "decision": "string",
    "rationale": "string",
    "alternativesConsidered": ["string"],
    "date": null
  }
]`,
    userSuffix: 'Extract the key technical decisions from this feature.',
  },
  implementation: {
    system: `You are a software engineering analyst. Given a feature.json and source code, write concise implementation notes. Cover: the main components and their roles, how data flows through the feature, and any non-obvious patterns or constraints. 100-200 words. Return only the text, no JSON wrapper, no heading.`,
    userSuffix: 'Write the implementation field for this feature.',
  },
  knownLimitations: {
    system: `You are a software engineering analyst. Identify 2-4 known limitations, trade-offs, or tech-debt items visible in this code. Look for TODOs, FIXMEs, missing error handling, overly complex patterns, or performance gaps.

Return ONLY a valid JSON array of strings — no other text:
["limitation 1", "limitation 2"]`,
    userSuffix: 'List the known limitations visible in this feature.',
  },
  tags: {
    system: `You are a software engineering analyst. Generate 3-6 tags from the domain language in this code. Lowercase, single words or hyphenated. Reflect the actual domain, not generic terms like "code" or "feature".

Return ONLY a valid JSON array of strings — no other text:
["tag1", "tag2", "tag3"]`,
    userSuffix: 'Generate tags for this feature.',
  },
  annotations: {
    system: `You are a software engineering analyst. Identify 1-3 significant annotations worth capturing — warnings, lessons, tech debt, or breaking-change risks visible in the code.

Return ONLY a valid JSON array — no other text:
[
  {
    "id": "auto-1",
    "author": "lac fill",
    "date": "${today}",
    "type": "tech-debt",
    "body": "string"
  }
]`,
    userSuffix: 'Generate annotations for this feature.',
  },
  successCriteria: {
    system: `You are a software engineering analyst. Write a plain-language success criteria statement for this feature — "how do we know it's done and working?" Be specific and testable. 1-3 sentences. Return only the text, no JSON wrapper, no heading.`,
    userSuffix: 'Write the success criteria for this feature.',
  },
  domain: {
    system: `You are a software engineering analyst. Identify the primary technical domain for this feature from its code and problem statement. Return a single lowercase word or short hyphenated phrase (e.g. "auth", "payments", "notifications", "data-pipeline"). Return only the domain value — nothing else.`,
    userSuffix: 'Identify the domain for this feature.',
  },
  componentFile: {
    system: `You are a software engineering analyst. Given a feature.json and its source code, identify the single primary file that implements this feature. Return a relative path from the project root (e.g. "src/components/FeatureCard.tsx", "packages/lac-mcp/src/index.ts"). Return only the path — nothing else.`,
    userSuffix: 'Identify the primary source file for this feature.',
  },
  npmPackages: {
    system: `You are a software engineering analyst. Given a feature.json and its source code, list the npm packages this feature directly imports or depends on at runtime. Exclude dev-only tools (vitest, eslint, etc.). Exclude Node built-ins.

Return ONLY a valid JSON array of package name strings — no other text:
["package-a", "package-b"]`,
    userSuffix: 'List the npm packages this feature depends on.',
  },
  publicInterface: {
    system: `You are a software engineering analyst. Given a feature.json and its source code, extract the public interface — exported props, function signatures, or API surface that consumers of this feature depend on.

Return ONLY a valid JSON array — no other text:
[
  {
    "name": "string",
    "type": "string",
    "description": "string"
  }
]`,
    userSuffix: 'Extract the public interface for this feature.',
  },
  externalDependencies: {
    system: `You are a software engineering analyst. Given a feature.json and its source code, identify runtime dependencies on other features or internal modules that are NOT captured by the lineage (parent/children). These are cross-feature implementation dependencies — e.g. a feature that calls into another feature's API at runtime, or imports a shared utility that belongs to a distinct feature.

Return ONLY a valid JSON array of featureKey strings or relative file paths — no other text:
["feat-2026-003", "src/utils/shared.ts"]`,
    userSuffix: 'List the external runtime dependencies for this feature.',
  },
  lastVerifiedDate: {
    system: `You are a software engineering analyst. Return today's date in YYYY-MM-DD format as the lastVerifiedDate — marking that this feature.json was reviewed and confirmed accurate right now. Return only the date string — nothing else.`,
    userSuffix: `Return today's date as the lastVerifiedDate.`,
  },
  codeSnippets: {
    system: `You are a software engineering analyst. Given a feature.json and its source code, extract 2-5 critical one-liners or short code blocks that are the most important to preserve verbatim — glob patterns, key API calls, non-obvious configuration, or architectural pivots. These are the snippets someone would need to reconstruct this feature accurately.

Return ONLY a valid JSON array — no other text:
[
  {
    "label": "string",
    "snippet": "string"
  }
]`,
    userSuffix: 'Extract the critical code snippets for this feature.',
  },
}

// Fields whose AI response is JSON (needs parsing) vs plain text
export const JSON_FIELDS = new Set<FillableField>([
  'decisions',
  'knownLimitations',
  'tags',
  'annotations',
  'npmPackages',
  'publicInterface',
  'externalDependencies',
  'codeSnippets',
])

export const ALL_FILLABLE_FIELDS: FillableField[] = [
  'analysis',
  'decisions',
  'implementation',
  'knownLimitations',
  'tags',
  'successCriteria',
  'domain',
  'componentFile',
  'npmPackages',
  'publicInterface',
  'externalDependencies',
  'lastVerifiedDate',
  'codeSnippets',
]

export function getMissingFields(feature: Feature): FillableField[] {
  return ALL_FILLABLE_FIELDS.filter((field) => {
    const val = (feature as Record<string, unknown>)[field]
    if (val === undefined || val === null) return true
    if (typeof val === 'string') return val.trim().length === 0
    if (Array.isArray(val)) return val.length === 0
    return false
  })
}

export const GEN_PROMPTS: Record<string, FieldPrompt> = {
  component: {
    system: `You are an expert React/TypeScript developer. You will be given a feature.json describing a feature. Generate a production-quality React component implementing the core UI for this feature. Include TypeScript types, sensible props, and clear comments. Make it maintainable — any developer unfamiliar with this feature should understand it. Return only the component code, no explanation.`,
    userSuffix: 'Generate a React TypeScript component for this feature.',
  },
  test: {
    system: `You are an expert software testing engineer. You will be given a feature.json. Generate a comprehensive test suite using Vitest. Use the successCriteria to derive happy-path tests and the knownLimitations to derive edge-case tests. Return only the test code, no explanation.`,
    userSuffix: 'Generate a Vitest test suite for this feature.',
  },
  migration: {
    system: `You are an expert database engineer. You will be given a feature.json. Generate a database migration scaffold for the data model this feature implies. Use SQL with clear comments. Include both up (CREATE) and down (DROP) sections. Return only the SQL, no explanation.`,
    userSuffix: 'Generate a database migration for this feature.',
  },
  docs: {
    system: `You are a technical writer. You will be given a feature.json. Generate user-facing documentation for this feature. Write it clearly enough that any end user can understand it (not developer-focused). Cover: what it does, how to use it, and known limitations. Use Markdown. Return only the documentation, no explanation.`,
    userSuffix: 'Generate user-facing documentation for this feature.',
  },
}

import type { Feature } from '@life-as-code/feature-schema'

export type FillableField =
  | 'analysis'
  | 'decisions'
  | 'implementation'
  | 'knownLimitations'
  | 'tags'
  | 'annotations'
  | 'successCriteria'
  | 'userGuide'
  | 'domain'
  | 'componentFile'
  | 'npmPackages'
  | 'publicInterface'
  | 'externalDependencies'
  | 'lastVerifiedDate'
  | 'codeSnippets'
  | 'implementationNotes'
  | 'pmSummary'
  | 'testStrategy'
  | 'releaseVersion'
  | 'acceptanceCriteria'
  | 'testCases'
  | 'edgeCases'
  | 'riskLevel'
  | 'rollbackPlan'
  | 'supportNotes'
  | 'knownWorkarounds'

export interface FieldPrompt {
  system: string
  userSuffix: string
}

const _dtNow = new Date()
const today = `${_dtNow.getFullYear()}-${String(_dtNow.getMonth() + 1).padStart(2, '0')}-${String(_dtNow.getDate()).padStart(2, '0')}`

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
  userGuide: {
    system: `You are a technical writer writing for end users — not developers. Given a feature.json, write a plain-language user guide for this feature. Explain what it does and how to use it in everyday language. Avoid technical terms, implementation details, and acceptance-criteria framing. Write from the user's perspective: what they will see, what they can do, and why it helps them. 2-5 sentences or a short bullet list. Return only the guide text, no JSON wrapper, no heading.`,
    userSuffix: 'Write a plain-language user guide for this feature.',
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
  implementationNotes: {
    system: `You are a software engineering analyst. Given a feature.json and its source code, write 2-5 short implementation notes — free-form sentences capturing context that does not fit neatly into decisions[], analysis, or userGuide. Good candidates: architectural choices made for non-obvious reasons, constraints the code works around, "why not X" rationale, threading/ordering requirements, or performance trade-offs visible in the implementation.

Return ONLY a valid JSON array of plain strings — no other text, no markdown fences:
["Note about why X was done this way.", "Note about a constraint that affects Y."]

If there are no notable implementation notes, return an empty array: []`,
    userSuffix: 'Extract free-form implementation notes for this feature.',
  },
  pmSummary: {
    system: `You are a product manager writing for a non-technical executive audience. Given a feature.json, write a 1–2 sentence business-value summary. Focus on the outcome and the user or business benefit — not the technical implementation. Avoid words like "component", "schema", "API", "TypeScript". Write as if you are telling a stakeholder why this feature matters. Return only the summary text, no JSON wrapper, no heading.`,
    userSuffix: 'Write a 1–2 sentence PM/exec summary for this feature.',
  },
  testStrategy: {
    system: `You are a software testing expert. Given a feature.json, describe in 2-4 sentences how this feature should be tested. Cover: what type of tests are appropriate (unit, integration, E2E, manual), what the hardest thing to test is, and any test setup or environment requirements implied by the feature. Be specific — name the actual components or flows that need coverage. Return only the strategy text, no JSON wrapper, no heading.`,
    userSuffix: 'Describe the test strategy for this feature.',
  },
  releaseVersion: {
    system: `You are a software engineering analyst. Given a feature.json, return the release version string this feature first shipped in, if it can be inferred from the statusHistory dates, revisions, or annotations. If not determinable, return an empty string. Return only the version string (e.g. "3.5.0", "v2", "2026-Q2") or an empty string — nothing else.`,
    userSuffix: 'Identify the release version this feature first shipped in, or return empty string if unknown.',
  },
  acceptanceCriteria: {
    system: `You are a software testing expert. Given a feature.json, break the successCriteria and problem statement into 3-8 discrete, testable acceptance criteria. Each criterion must be a single concrete, verifiable statement (e.g. "Camera roll permission prompt appears on first launch only", "Denying permission shows a recovery screen with an Open Settings button"). No vague statements. No compound criteria (one thing per item).

Return ONLY a valid JSON array of strings — no other text:
["criterion 1", "criterion 2", "criterion 3"]`,
    userSuffix: 'Generate structured acceptance criteria for this feature.',
  },
  testCases: {
    system: `You are a QA engineer. Given a feature.json, write 3-6 explicit test case descriptions in Given/When/Then or Action/Expected format. Cover happy paths and important error paths. Each test case should be executable — concrete enough that a tester could run it without additional context.

Return ONLY a valid JSON array of strings — no other text:
["Given X, when Y, then Z", "Action: do A. Expected: B"]`,
    userSuffix: 'Write explicit test cases for this feature.',
  },
  edgeCases: {
    system: `You are a QA engineer. Given a feature.json, identify 2-5 edge cases and boundary conditions that are likely to reveal bugs if untested. Think about: empty/null inputs, maximum/minimum values, concurrent access, network failures, permission denials, and state transitions. Be specific to this feature.

Return ONLY a valid JSON array of strings — no other text:
["edge case 1", "edge case 2"]`,
    userSuffix: 'Identify edge cases and boundary conditions for this feature.',
  },
  riskLevel: {
    system: `You are a software risk analyst. Given a feature.json, assess the risk level if this feature regresses or fails in production. Consider: user impact, data integrity risk, blast radius, reversibility, and complexity. Choose one level: "low" (minor inconvenience, easy to hotfix), "medium" (noticeable degradation, moderate effort to fix), "high" (significant user impact, hard to hotfix), "critical" (data loss, security breach, or production outage). Return ONLY the single word — nothing else.`,
    userSuffix: 'Assess the production risk level for this feature (low/medium/high/critical).',
  },
  rollbackPlan: {
    system: `You are a software reliability engineer. Given a feature.json, describe in 2-3 sentences how to safely roll back or mitigate this feature if it causes issues in production. Cover: what to revert (feature flag, deployment, migration), any cleanup needed, and who needs to be notified. If the feature is low-risk or trivially reversible, say so briefly. Return only the plan text, no JSON wrapper, no heading.`,
    userSuffix: 'Write a rollback plan for this feature.',
  },
  supportNotes: {
    system: `You are a customer support lead. Given a feature.json, write 2-4 sentences of guidance for a support team handling tickets about this feature. Cover: how to verify the issue is in-scope for this feature, common causes, triage questions to ask the user, and when to escalate to engineering. Return only the notes text, no JSON wrapper, no heading.`,
    userSuffix: 'Write support team guidance notes for this feature.',
  },
  knownWorkarounds: {
    system: `You are a customer support expert. Given a feature.json and its knownLimitations[], describe practical workarounds users or support agents can apply for each known limitation. Only include workarounds that actually help — if none exist, return an empty array.

Return ONLY a valid JSON array of strings — no other text:
["For limitation X, users can work around it by Y", "If Z fails, do W instead"]`,
    userSuffix: 'List known workarounds for the limitations of this feature.',
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
  'implementationNotes',
  'acceptanceCriteria',
  'testCases',
  'edgeCases',
  'knownWorkarounds',
])

export const ALL_FILLABLE_FIELDS: FillableField[] = [
  'analysis',
  'decisions',
  'implementation',
  'knownLimitations',
  'tags',
  'successCriteria',
  'userGuide',
  'pmSummary',
  'testStrategy',
  'acceptanceCriteria',
  'domain',
  'componentFile',
  'npmPackages',
  'publicInterface',
  'externalDependencies',
  'lastVerifiedDate',
  'codeSnippets',
  'implementationNotes',
  'releaseVersion',
  'testCases',
  'edgeCases',
  'riskLevel',
  'rollbackPlan',
  'supportNotes',
  'knownWorkarounds',
]

export function getMissingFields(feature: Feature): FillableField[] {
  return ALL_FILLABLE_FIELDS.filter((field) => {
    const val = (feature as Record<string, unknown>)[field]
    if (val === undefined || val === null) return true
    if (typeof val === 'string') return val.trim().length === 0
    if (Array.isArray(val)) return false // [] means "verified empty" — not missing
    return false
  })
}

export const GEN_PROMPTS: Record<string, FieldPrompt> = {
  component: {
    system: `You are an expert React/TypeScript developer. You will be given a feature.json describing a feature. Generate a production-quality React component implementing the core UI for this feature. Include TypeScript types, sensible props, and clear comments. Make it maintainable — any developer unfamiliar with this feature should understand it. Return only the component code, no explanation.`,
    userSuffix: 'Generate a React TypeScript component for this feature.',
  },
  test: {
    system: `You are an expert software testing engineer. You will be given a feature.json. Generate a comprehensive test suite using Vitest. Primary inputs: use acceptanceCriteria[] for happy-path test cases (one test per criterion), testStrategy to determine the appropriate test type (unit/integration/E2E), and knownLimitations for edge-case tests. If acceptanceCriteria is absent, derive tests from successCriteria. Return only the test code, no explanation.`,
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
  mock: {
    system: `You are an expert TypeScript developer. You will be given a feature.json with a publicInterface[] array describing exported types, components, hooks, services, and functions. Generate realistic TypeScript mock factories for each entry. Use hand-crafted realistic static values (no external faker library). Export a factory function for each interface named \`mock<Name>(overrides?: Partial<Type>): Type\`. Where the shape is not fully defined in the feature, make reasonable assumptions from the name and description. Return only the TypeScript code, no explanation.`,
    userSuffix: 'Generate TypeScript mock factories for this feature.',
  },
}

# @life-as-code/feature-schema

Internal package. Defines the canonical `Feature` type and Zod schema used across all lac-cli packages and the MCP server.

---

## What It Does

- Exports the `FeatureSchema` Zod object — the single source of truth for what a `feature.json` can contain
- Exports inferred TypeScript types (`Feature`, `FeatureStatus`, `Revision`, `PublicInterfaceEntry`, `CodeSnippet`)
- Exports sub-schemas for object fields (`DecisionSchema`, `AnnotationSchema`, `RevisionSchema`, etc.)
- Exports `validateFeature(json)` for safe parse with typed errors
- Exports `generateFeatureKey(domain, workspacePath)` for key generation

---

## Build

```bash
cd packages/feature-schema && bun run build
```

Must run after every `src/` change. Consumers (`lac-mcp`, `lac-lsp`, `lac-cli`, `lac-claude`) import from `dist/`.

---

## Schema Fields

### Required

| Field | Type | Notes |
|---|---|---|
| `featureKey` | `string` | Pattern `<domain>-YYYY-NNN`, e.g. `feat-2026-001` |
| `title` | `string` | Short human-readable title |
| `status` | `draft \| active \| frozen \| deprecated` | |
| `problem` | `string` | The human problem this solves |

### Core optional

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | `number` | Integer; omit → assume 1 |
| `owner` | `string` | Person or team |
| `analysis` | `string` | Architecture / problem space research |
| `decisions` | `Decision[]` | Architectural decisions with rationale |
| `implementation` | `string` | Implementation notes |
| `knownLimitations` | `string[]` | Trade-offs and tech debt |
| `tags` | `string[]` | Free-form tags |
| `annotations` | `Annotation[]` | Time-stamped notes (tech-debt, warning, lesson…) |
| `lineage` | `Lineage` | `parent`, `children`, `spawnReason` |
| `successCriteria` | `string` | Plain-language definition of done |
| `domain` | `string` | Free-form domain tag, e.g. `auth`, `payments` |
| `priority` | `1–5` | 1 = highest; controls sibling ordering |
| `statusHistory` | `StatusTransition[]` | Append-only log — written by `advance_feature` |
| `revisions` | `Revision[]` | Append-only log of intent-critical field changes with author + reason |

### Lifecycle pointers

| Field | Type | Notes |
|---|---|---|
| `superseded_by` | `string` | featureKey of the feature that replaces this one |
| `superseded_from` | `string[]` | featureKeys this feature supersedes (bidirectional) |
| `merged_into` | `string` | featureKey this feature was merged into |
| `merged_from` | `string[]` | featureKeys merged into this feature (bidirectional) |

### Reconstruction-critical fields

Added 2026-03-22. Motivated by the Extract→Strip→Rebuild POC: these were the fields whose absence caused the most reconstruction errors.

| Field | Type | Notes |
|---|---|---|
| `componentFile` | `string` | Relative path to the primary source file, e.g. `src/components/Foo.tsx` |
| `npmPackages` | `string[]` | npm packages this feature directly depends on at runtime |
| `publicInterface` | `PublicInterfaceEntry[]` | Exported props / function signatures (`name`, `type`, `description?`) |
| `externalDependencies` | `string[]` | Cross-feature runtime deps not captured by lineage (featureKeys or file paths) |
| `lastVerifiedDate` | `string` | YYYY-MM-DD — date this feature.json was last confirmed accurate |
| `codeSnippets` | `CodeSnippet[]` | Critical one-liners verbatim (`label`, `snippet`) — glob patterns, API calls, etc. |

---

## Sub-schema shapes

**Decision**
```json
{ "decision": "string", "rationale": "string", "alternativesConsidered": ["string"], "date": "YYYY-MM-DD" }
```

**Annotation**
```json
{ "id": "string", "author": "string", "date": "string", "type": "tech-debt|warning|lesson|breaking-change", "body": "string" }
```

**Revision**
```json
{ "date": "YYYY-MM-DD", "author": "string", "fields_changed": ["string"], "reason": "string" }
```

**PublicInterfaceEntry**
```json
{ "name": "string", "type": "string", "description": "string" }
```

**CodeSnippet**
```json
{ "label": "string", "snippet": "string" }
```

---

## Exports

```ts
// Schemas
export { FeatureSchema, FeatureStatusSchema, DecisionSchema, AnnotationSchema,
         LineageSchema, StatusTransitionSchema, RevisionSchema,
         PublicInterfaceEntrySchema, CodeSnippetSchema, FEATURE_KEY_PATTERN }

// Types
export type { Feature, FeatureStatus, Revision, PublicInterfaceEntry, CodeSnippet }

// Utilities
export { validateFeature }
export { generateFeatureKey, registerFeatureKey, getCurrentYear, padCounter }
```

---

## Adding a new field

1. Add the Zod field to `FeatureSchema` in `src/schema.ts`
2. If it's a new object shape, define a named sub-schema (e.g. `FooSchema`) and export it from `src/index.ts`
3. If it should be AI-fillable: add to `FillableField`, `ALL_FILLABLE_FIELDS`, `FILL_PROMPTS`, and `JSON_FIELDS` in `packages/lac-claude/src/prompts.ts`
4. Run `bun run build`
5. Check consumers: `lac-mcp`, `lac-lsp`, `lac-cli`
6. Update `ECOSYSTEM.md` schema fields table

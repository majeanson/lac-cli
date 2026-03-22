# @life-as-code/lac-claude

Internal package. The Claude integration layer — defines what fields can be AI-filled, the prompts used to fill them, and the logic for detecting which fields are missing.

Used by `lac fill` (CLI) and `write_feature_fields` / `read_feature_context` (MCP).

---

## What It Does

- Defines `FillableField` — the union of all fields the AI can populate
- Provides `FILL_PROMPTS` — per-field `{ system, userSuffix }` prompt pairs
- Provides `JSON_FIELDS` — the set of fields whose AI response is a JSON array (needs parsing)
- Provides `ALL_FILLABLE_FIELDS` — ordered list used for gap detection and `lac fill` prompting
- Provides `getMissingFields(feature)` — returns which fillable fields are empty
- Provides `GEN_PROMPTS` — prompts for code generation artifacts (`component`, `test`, `migration`, `docs`)

---

## Fillable fields

| Field | Type | AI response format |
|---|---|---|
| `analysis` | string | Plain prose (150–300 words) |
| `decisions` | Decision[] | JSON array |
| `implementation` | string | Plain prose (100–200 words) |
| `knownLimitations` | string[] | JSON array of strings |
| `tags` | string[] | JSON array of strings |
| `annotations` | Annotation[] | JSON array |
| `successCriteria` | string | Plain prose (1–3 sentences) |
| `domain` | string | Single word or hyphenated phrase |
| `componentFile` | string | Relative file path |
| `npmPackages` | string[] | JSON array of strings |
| `publicInterface` | PublicInterfaceEntry[] | JSON array |
| `externalDependencies` | string[] | JSON array of featureKeys / file paths |
| `lastVerifiedDate` | string | YYYY-MM-DD string |
| `codeSnippets` | CodeSnippet[] | JSON array |

---

## JSON_FIELDS

Fields in this set have their AI response passed through `JSON.parse()` before being written to `feature.json`. All others are written as-is (strings).

```ts
JSON_FIELDS = { decisions, knownLimitations, tags, annotations,
                npmPackages, publicInterface, externalDependencies, codeSnippets }
```

---

## Adding a fillable field

1. Add to `FillableField` union type
2. Add to `ALL_FILLABLE_FIELDS` array (order determines fill sequence)
3. Add an entry to `FILL_PROMPTS` with `system` and `userSuffix`
4. If the AI returns JSON: add to `JSON_FIELDS`
5. The field must already exist in `FeatureSchema` (`packages/feature-schema/src/schema.ts`)

---

## GEN_PROMPTS

Separate from fill prompts — used by `lac gen` to produce code artifacts from a feature.json:

| Key | Output |
|---|---|
| `component` | React/TypeScript component |
| `test` | Vitest test suite |
| `migration` | SQL migration (up + down) |
| `docs` | User-facing Markdown documentation |

---

## Dependencies

- `@life-as-code/feature-schema` — for the `Feature` type used in `getMissingFields`

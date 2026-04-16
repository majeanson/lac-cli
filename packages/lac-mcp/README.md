# @life-as-code/lac-mcp

Internal package. The MCP (Model Context Protocol) server that exposes the LAC feature lifecycle as tools callable by Claude Code.

Bundled into the CLI. Activated when Claude Code opens a workspace containing a `.lac/` directory and `.mcp.json` points to it.

---

## What It Does

Exposes 22 tools that drive a guided, validated feature lifecycle — from creation through freezing, spawning children, reopening, and deprecation. Claude uses these tools instead of editing `feature.json` files directly.

---

## Tool Inventory

### Creation

| Tool | What it does |
|---|---|
| `create_feature` | Creates a new `feature.json` with required fields; `featureKey` auto-generated if omitted |
| `extract_feature_from_code` | Onboards existing code — reads source files and bootstraps a feature.json from what it finds |

### Context & analysis

| Tool | What it does |
|---|---|
| `read_feature_context` | Reads a feature.json + source files; returns fill instructions for missing fields; surfaces ⚠ stale-review annotations |
| `suggest_split` | Analyzes a feature and suggests if/how it should be split into children |
| `feature_similarity` | Checks for duplicate or closely related features before creating a new one |

### Writing

| Tool | What it does |
|---|---|
| `write_feature_fields` | Patches feature.json with new field values; accepts optional `revision: { author, reason }` for intent-critical changes |

### Lifecycle

| Tool | What it does |
|---|---|
| `advance_feature` | Transitions status (`draft → active → frozen → deprecated`); validates required fields per transition; logs stale-review annotation on reopen |
| `get_feature_status` | Returns orientation: current status, missing fields, exact next action — use at session start or when lost |

### Children

| Tool | What it does |
|---|---|
| `spawn_child_feature` | Creates a child feature with `lineage.parent` pre-linked; child starts at `draft` |

### History

| Tool | What it does |
|---|---|
| `feature_changelog` | Shows the full timeline of a feature: revisions, status transitions, and annotations in chronological order |
| `time_travel` | Returns the feature.json as it looked on a given date (via git history) |

### Workspace

| Tool | What it does |
|---|---|
| `roadmap_view` | All features across the workspace with status and priority |
| `lint_workspace` | Full workspace lint: completeness, bidirectional pointer consistency, revision warnings; `revisionWarnings: false` suppresses revision checks |
| `audit_decisions` | Surfaces features with no decisions, stale decisions, or high tech-debt annotations |

### Navigation

| Tool | What it does |
|---|---|
| `blame_file` | Returns which feature owns a given file |
| `search_features` | Full-text search across all feature.json fields |
| `get_lineage` | Shows the parent/child tree for a feature |

### Impact & output

| Tool | What it does |
|---|---|
| `cross_feature_impact` | Given a file, returns all features that reference it — blast radius before refactoring |
| `feature_summary_for_pr` | Generates a PR description from a feature.json |
| `summarize_workspace` | Returns a high-level summary of the whole workspace: feature counts, status distribution, top domains |
| `extract_all_features` | Batch-extracts feature context for all features in the workspace — useful for seeding a new project |

### Guardlock

| Tool | What it does |
|---|---|
| `lock_feature_fields` | Manage per-feature field locks. Actions: `lock`, `unlock`, `freeze` (featureLocked: true), `thaw`, `status`. AI tools skip locked fields unless `override: true` is passed. |

---

## Lifecycle flow

```
create_feature          → status: draft
read_feature_context    → Claude fills missing fields
write_feature_fields    → writes fields (+ revision for intent-critical changes)
advance_feature(active) → validates: analysis, implementation, decisions (1+), successCriteria
advance_feature(frozen) → validates: all above + tags, knownLimitations
                          [blocked if requireAlternatives: decisions must have alternativesConsidered]
                          [blocked if freezeRequiresHumanRevision: revisions[] must exist]

[bug found]    spawn_child_feature  → child restarts at draft
[req change]   advance_feature(active, reason)  → stale-review annotation written
               read_feature_context              → surfaces ⚠ stale fields
               write_feature_fields + revision   → update fields
               advance_feature(frozen)
[mid-session]  get_feature_status                → orientation, exact next action
[superseded]   write_feature_fields(superseded_by) → advance_feature(deprecated)
[merged]       write_feature_fields(merged_into)   → advance_feature(deprecated)
[lock fields]  lock_feature_fields(action:"lock"/"freeze") → AI tools skip/warn on protected fields
```

---

## Source layout

```
src/
  index.ts          — MCP server + all tool handlers (monolithic, ~1600 lines)
  tools/
    analysis.ts     — handleAuditDecisions
    git-tools.ts    — git history operations for time_travel, feature_changelog
    impact.ts       — cross_feature_impact
```

---

## Dependencies

- `@life-as-code/feature-schema` — Feature type, FeatureSchema, validateFeature
- `@life-as-code/lac-claude` — getMissingFields, FILL_PROMPTS, FillableField
- `@modelcontextprotocol/sdk` — MCP server infrastructure

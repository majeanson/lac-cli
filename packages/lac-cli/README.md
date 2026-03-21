# @majeanson/lac

**Feature provenance, from the terminal.**

`lac` gives every feature in your codebase a small, versioned document — `feature.json` — that captures *why* it exists, what decisions shaped it, and where it came from. Structured. Queryable. Committed to git.

```bash
npm install -g @majeanson/lac
```

---

## Thirty-second tour

```bash
# init a workspace at your repo root
lac workspace init

# scaffold a new feature
cd src/payments/checkout
lac init
# ✓ Created feature.json — feat-2026-007

# who owns this file?
lac blame src/payments/checkout/handler.ts

#   Feature   : feat-2026-007
#   Title     : Checkout flow redesign
#   Status    : ⊙  active
#   Complete  : [████████░░] 80%
#   Problem:
#     Cart abandonment spikes at the shipping step.

# search across everything
lac search "cart abandonment"

# open a live dashboard
lac serve
```

---

## Commands

| Command | What it does |
|---|---|
| `lac init` | Scaffold a `feature.json` interactively |
| `lac blame <path>` | Show which feature owns a file or path |
| `lac search <query>` | Full-text search across all features |
| `lac lineage <key>` | Print the parent → key → children tree |
| `lac stat` | Summary table of all features + completeness |
| `lac diff` | Features changed since a git ref |
| `lac lint` | Validate all `feature.json` files |
| `lac serve` | Start the HTTP dashboard in your browser |
| `lac spawn <key>` | Create a child feature with lineage wired |
| `lac archive <key>` | Deprecate a feature |
| `lac doctor` | Workspace health check |

Full documentation: [github.com/majeanson/lac-cli](https://github.com/majeanson/lac-cli)

---

## The feature.json

```json
{
  "featureKey": "feat-2026-007",
  "title": "Checkout flow redesign",
  "status": "active",
  "problem": "Cart abandonment spikes at the shipping step.",
  "decisions": [
    {
      "decision": "Single-page checkout, no step redirects",
      "rationale": "Reduces load time and perceived friction.",
      "date": "2026-02-14"
    }
  ],
  "lineage": { "parent": "feat-2025-031" },
  "tags": ["payments", "ux", "conversion"]
}
```

Plain JSON. Committed with your code. Validated by a Zod schema. Indexed by the CLI and optionally the LSP server.

Feature keys follow the pattern `<domain>-YYYY-NNN`. The domain is yours: `feat-`, `proc-`, `goal-`, `adr-`.

---

## Why not tickets / ADRs / commit messages?

**Tickets** (Jira, Linear, GitHub Issues) live outside your repo. They get closed, archived, migrated. The context evaporates. `feature.json` is in git forever.

**ADRs** document architecture, not features. `lac` is complementary — it works at the folder level, with a typed lifecycle, lineage, and tooling.

**Commit messages** describe what changed, not why a thing exists. They're not queryable, not structured, and don't survive a `git squash`.

---

## Build on top of it

`feature.json` is plain JSON. The `lac serve` HTTP API is standard REST. Both are designed to be consumed by custom tooling.

**[lifeascode-ruddy.vercel.app](https://lifeascode-ruddy.vercel.app/)** is a companion web UI that talks to `lac serve` in real time — fork it and deploy it for your team.

**HTTP API** (start with `lac serve`, port 7474):
```
GET  /features            all features as JSON
GET  /features/:key       single feature
PUT  /features/:key       write back to disk
GET  /blame?path=<abs>    which feature owns a file
GET  /lint                validation results
GET  /events              SSE stream of changes
```

**Sync to a database:**
```bash
lac export --json | curl -X POST https://your-api/features \
  -H "Content-Type: application/json" -d @-
```

This package ships with `lac` (CLI) and `lac-lsp` (LSP server + HTTP API) bundled together — one install, two binaries.

---

MIT License

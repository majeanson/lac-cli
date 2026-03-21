# 🗂️ lac — life as code

> **Feature provenance, from the terminal.**
> Every feature has a story. `lac` makes sure it doesn't get lost.

```bash
npm install -g @majeanson/lac
```

---

Your codebase grows. Context erodes. Six months later no one knows _why_ that folder exists, who made that call, or whether anyone still cares about that half-shipped thing in `src/payments/v2`.

`lac` solves this by putting a small, structured `feature.json` inside each feature folder. It travels with your code, validates against a schema, and powers a full CLI + web dashboard.

---

## ⚡ 10 things you can do right now

### 1 · Start a new feature

```bash
cd src/payments/checkout
lac init
```

```
? What problem does this feature solve? › Cart abandonment spikes at the shipping step.
? Status? › draft
✓ Created feature.json — feat-2026-007
```

---

### 2 · Ask who owns a file

```bash
lac blame src/payments/checkout/handler.ts
```

```
  Feature   : feat-2026-007
  Title     : Checkout flow redesign
  Status    : ⊙  active
  Complete  : [████████░░] 80%
  Problem:
    Cart abandonment spikes at the shipping step.
```

---

### 3 · Search across everything

```bash
lac search "cart"
```

```
Found 2 feature(s) matching "cart":

  ⊙  feat-2026-007        Checkout flow redesign
     Cart abandonment spikes at the shipping step.

  ◌  feat-2026-012        Abandoned cart email
     Users who leave without purchasing receive no follow-up.
```

---

### 4 · See the lineage tree

```bash
lac lineage feat-2026-001
```

```
feat-2026-001 (active) — Auth system
    ├── feat-2026-004 (active) — Password reset
    │   └── feat-2026-009 (draft) — Magic link login
    └── feat-2026-006 (deprecated) — SMS OTP
```

---

### 5 · Check completeness across your workspace

```bash
lac stat
```

```
  feat-2026-001   active      [██████████] 100%   Auth system
  feat-2026-004   active      [████████░░]  80%   Password reset
  feat-2026-007   active      [██████░░░░]  60%   Checkout flow redesign
  feat-2026-012   draft       [███░░░░░░░]  30%   Abandoned cart email
```

---

### 6 · Diff two features side by side

```bash
lac diff feat-2026-004 feat-2026-009
```

```
diff feat-2026-004 → feat-2026-009
────────────────────────────────────────────────────────────
~ title:
    OLD: Password reset
    NEW: Magic link login
~ status:
    OLD: active
    NEW: draft
+ lineage: {"parent":"feat-2026-004"}
```

---

### 7 · Lint your whole workspace

```bash
lac lint
```

```
✓ feat-2026-001   valid
✓ feat-2026-004   valid
✗ feat-2026-007   missing: analysis, decisions
✗ feat-2026-012   missing: owner, analysis, decisions
```

---

### 8 · Export to JSON and pipe anywhere

```bash
lac export --json | jq '[.[] | {key: .featureKey, status}]'
```

```json
[
  { "key": "feat-2026-001", "status": "active" },
  { "key": "feat-2026-007", "status": "active" },
  { "key": "feat-2026-012", "status": "draft" }
]
```

---

### 9 · Spawn a child feature (lineage pre-wired)

```bash
lac spawn feat-2026-007
```

```
? What problem does this child feature solve? › Guest checkout — users don't want to create an account.
✓ Created feature.json — feat-2026-013
  lineage.parent → feat-2026-007
```

---

### 10 · Open the live dashboard

```bash
lac serve
```

```
Starting lac-lsp HTTP server on port 7474...

Ready — http://127.0.0.1:7474

  GET /features     all indexed features
  GET /lint         run lint against all features
  GET /events       SSE stream of changes

Press Ctrl+C to stop.
```

---

### 11 · Fill feature docs with AI

```bash
export ANTHROPIC_API_KEY=sk-ant-...
lac fill src/payments/checkout
```

```
Analyzing feat-2026-007 (Checkout flow redesign)...
Reading 6 source files...
Generating with claude-sonnet-4-6...
  → analysis... done
  → decisions... done
  → tags... done
  → successCriteria... done

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  analysis  (empty → generated)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Stateless checkout flow using Stripe Payment Intents.
  Cart state stored in Redis with 30-min TTL...

Apply? [Y]es / [n]o / [f]ield-by-field
```

Use `--dry-run` to preview without writing. Use `--field analysis,decisions` to fill specific fields.

---

### 12 · Generate code from a feature

```bash
lac gen src/payments/checkout --type test
```

Reads the feature's `successCriteria` and `knownLimitations`, generates a Vitest test suite, writes it next to your code.

```bash
lac gen src/payments/checkout --type component   # React component
lac gen src/payments/checkout --type migration   # SQL migration
lac gen src/payments/checkout --type docs        # User documentation
```

---

### 13 · Use lac from any Claude session (MCP)

Add to your `.mcp.json` (Claude Code) or any MCP-supporting Claude client:

```json
{
  "mcpServers": {
    "lac": {
      "command": "lac-mcp",
      "args": []
    }
  }
}
```

After `npm install -g @majeanson/lac`, `lac-mcp` is on your PATH automatically. Then in Claude:

```
> Fill the checkout feature for me
> What feature owns src/api/payments.ts?
> Generate tests for src/auth/ based on the feature file
> Show me the lineage tree for feat-2026-001
```

---

## 🔌 VS Code extension — _life-as-code Lens_

**Install from the marketplace:**
Open VS Code → Extensions → search **`life-as-code Lens`** → Install.
Or press `Ctrl+P` and run:

```
ext install majeanson.lac-lens
```

**What it does:**

- 🔍 **Code lens** above every file in a feature folder — key, status icon, title, and completeness %
- 💬 **Hover** to see the full feature summary without leaving the editor
- 📌 **Status bar chip** — click to open the Feature Panel for the current file's feature
- 🗂️ **Feature Panel** — rich webview with tabs (Overview, Analysis, Decisions, Implementation, Limitations, Annotations), **inline editing** of every field, and clickable parent/child lineage navigation
- 🌲 **Feature Tree View** — sidebar listing all workspace features grouped by status
- ⚠️ **Diagnostics** — completeness warnings on `feature.json` files (active features without analysis/decisions flagged automatically)

**Commands** (all in `Ctrl+Shift+P → lac:`):

| Command | Action |
|---|---|
| `lac: New Feature here…` | 4-step wizard — creates `feature.json` and opens the panel |
| `lac: New Child Feature…` | Spawns a child with lineage pre-wired |
| `lac: Change Feature Status…` | Flip status via QuickPick |
| `lac: Search Features…` | Workspace-wide fuzzy search by key, title, tags |
| `lac: Add Decision…` | Append a decision + rationale in two prompts |
| `lac: Export Feature as Markdown` | Render full feature as `.md` |

**Enable richer LSP mode** (hover + workspace symbols from the language server):

```jsonc
// .vscode/settings.json
{
  "lacLens.lspMode": true  // lac-lsp is already on PATH after installing @majeanson/lac
}
```

**Publish it yourself** (if you forked and want your own marketplace listing):

```bash
# 1. Create a publisher at marketplace.visualstudio.com/manage
# 2. Get a Personal Access Token from dev.azure.com → User Settings → PAT
#    Scope: Marketplace → Manage

cd packages/vscode-extension

# 3. Login
npx vsce login <your-publisher-id>

# 4. Package and publish
npx vsce publish
```

> Update the `publisher` field in `packages/vscode-extension/package.json` before publishing.

---

## 🤔 Why not just use…

|                                          | `lac` | Jira / Linear | ADRs | Commit messages |
| ---------------------------------------- | ----- | ------------- | ---- | --------------- |
| Lives with the code                      | ✅    | ❌            | ✅   | ✅              |
| Structured + typed                       | ✅    | ✅            | ❌   | ❌              |
| Queryable CLI                            | ✅    | ❌            | ❌   | ❌              |
| Feature lifecycle (`draft → deprecated`) | ✅    | ✅            | ❌   | ❌              |
| Lineage (parent → children)              | ✅    | ❌            | ❌   | ❌              |
| Completeness scoring                     | ✅    | ❌            | ❌   | ❌              |
| Survives a ticket tracker migration      | ✅    | ❌            | ✅   | ✅              |
| Web dashboard                            | ✅    | ✅            | ❌   | ❌              |
| Works fully offline                      | ✅    | ❌            | ✅   | ✅              |

---

## 🖥️ The web UI

> 📸 _Screenshots below — [lifeascode-ruddy.vercel.app](https://lifeascode-ruddy.vercel.app/)_

![Feature list dashboard](docs/screenshots/ui-dashboard.png)
![Feature detail with tabs](docs/screenshots/ui-feature-detail.png)

**[lifeascode-ruddy.vercel.app](https://lifeascode-ruddy.vercel.app/)** is a companion Next.js app built for teams who want a shared dashboard on top of the same `feature.json` files.

It includes:

- 🔍 Debounced live search + status filter pills
- 📊 Completeness histogram and RBAC views (Dev / PM / Support / User)
- 🗂️ Feature detail with 6 tabs — overview, guide, lineage, decisions, annotations, history
- ✏️ Inline editor that writes back to `feature.json` on disk
- ⌨️ Keyboard shortcuts — `/` to search, `n` for new feature, `g d` for dashboard
- 🔄 File watcher syncs filesystem changes to Postgres within 300ms

The CLI and the UI are two separate repos designed to be **forked together**:

```
you fork @majeanson/lac          →  your CLI, adapted to your team's key conventions
you fork lifeascode (the UI)     →  your dashboard, connected to your own DB
```

### Fork and deploy the UI on Vercel

**1. Fork the repo**
[github.com/majeanson/lifeascode](https://github.com/majeanson/lifeascode) → Fork

**2. Create a Postgres database**
The UI uses [Supabase](https://supabase.com) (free tier works). Grab your `DATABASE_URL` from Project Settings → Database → Connection string.

**3. Import to Vercel**
Go to [vercel.com/new](https://vercel.com/new), import your fork, and set these environment variables:

```
DATABASE_URL=postgresql://...          # Supabase direct URL (for migrations)
DATABASE_URL_POOLED=postgresql://...   # Supabase pooled URL (for runtime)
AUTH_SECRET=<random 32-char string>    # NextAuth secret — openssl rand -base64 32
AUTH_DISCORD_ID=                       # Optional — Discord OAuth app ID
AUTH_DISCORD_SECRET=                   # Optional — Discord OAuth secret
```

**4. Deploy**
Vercel picks up the `vercel.json` at the repo root and builds the Next.js app automatically. First deploy runs the DB migration.

**5. Point it at your local workspace**
Run `lac serve` locally — the dashboard reads from `http://localhost:7474` by default. To use the hosted version against a remote server, set `LAC_API_URL` in your Vercel env.

---

## 📦 What's inside `@majeanson/lac`

One install, no separate packages needed:

|                  | What it gives you                                                          |
| ---------------- | -------------------------------------------------------------------------- |
| `lac` binary     | The full CLI — all 19 commands including `fill` and `gen`                  |
| `lac-lsp` binary | LSP server + HTTP dashboard API (bundled in)                               |
| `lac-mcp` binary | MCP server — use lac tools from Claude Code and any MCP-supporting client  |
| Schema types     | Zod schema + TypeScript types (bundled in)                                 |

```bash
npm install -g @majeanson/lac
lac --version   # 1.0.1
lac-lsp --help  # also available immediately
```

---

## 🔑 Feature key format

Keys follow `<domain>-YYYY-NNN`:

| Key             | Meaning                         |
| --------------- | ------------------------------- |
| `feat-2026-001` | A user-facing feature           |
| `proc-2026-003` | An internal process or workflow |
| `goal-2026-007` | A team or product goal          |
| `adr-2026-002`  | An architecture decision record |

The domain prefix is yours to define. The year gives temporal context at a glance. Sequences are per-workspace and auto-incremented by `lac init`.

---

## License

MIT — [github.com/majeanson/lac-cli](https://github.com/majeanson/lac-cli)

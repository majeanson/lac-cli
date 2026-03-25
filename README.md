# lac — life as code

> **Your codebase knows what it does. It just can't explain why.**
> `lac` fixes that — one `feature.json` per feature, forever.

```bash
npm install -g @majeanson/lac
```

---

## The problem in one screenshot

Six months after shipping, nobody remembers why that folder exists, who made that call, or whether anyone still needs the half-finished thing in `src/payments/v2`. Tickets rot in Jira. Commit messages lie. ADRs go stale.

`lac` puts the answer _in the repo_ — a small structured `feature.json` next to every feature. It travels with your code through every rename, refactor, and rewrite.

---

## AI drift — and the guardlock

Every problem has multiple valid solutions. You picked one. You had reasons. You considered the alternatives and rejected them.

Six months later, you ask Claude to extend that feature. Claude doesn't know what you decided. It re-solves the problem from scratch — and picks a different solution. Not a wrong one. Just _different_. It silently undoes the tradeoff you made.

This is **AI drift**: the AI doesn't lie, it just forgets. Every new session starts with no memory of what was decided before.

```
Problem: "how should we store session state?"
  Solution A: Redis (fast, volatile) ← you chose this, for a reason
  Solution B: Postgres (durable, slower)
  Solution C: JWT (stateless, no infra)

Six months later, Claude picks Solution B. Your Redis infra is now partially abandoned.
```

A `feature.json` is the guardlock. The `decisions` field captures not just what you chose, but _why_ — and critically, what you **didn't** choose and why you rejected it.

```json
{
  "decisions": [
    {
      "decision": "Redis for session state with 30-min TTL",
      "rationale": "Checkout must survive a page refresh but not persist indefinitely. Redis TTL handles expiry automatically without a cron job.",
      "alternativesConsidered": [
        "Postgres sessions (overkill, adds DB load)",
        "JWT (stateless but can't invalidate on logout)"
      ],
      "date": "2026-01-14"
    }
  ]
}
```

When Claude reads this before touching the code, it can't drift. It knows the solution space was already explored, a choice was made, and here's why the alternatives were rejected.

**The MCP server injects these guardlocks automatically.** Every tool call reads the feature context first. Claude doesn't get a blank slate — it gets your decisions.

---

## The loop: fill → complete → guardlock

`lac` is built around one repeatable workflow. Three steps. Flexible at every one.

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│   1. FILL            2. COMPLETE          3. GUARDLOCK               │
│                                                                      │
│   AI reads your  →   You add what     →   Freeze. Future AI         │
│   code and drafts    only you know:       reads this before         │
│   the fields         the why behind       writing code. It          │
│   (fast, ~80%)       the why              can't drift.              │
│                                                                      │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ reopen → iterate → refreeze
                                └────────────────────────────▶
```

**Step 1 — Fill.** AI reads your source files and extracts everything it can: analysis, key decisions, implementation notes, success criteria, tags. Fast. One command. Usually 70–90% accurate.

**Step 2 — Complete.** You review and add what only you know. The vendor limitation you hit at 2am. The alternative you considered and rejected for a reason that was never written down. The political constraint that shaped the tradeoff. This is the most important step — and the one the AI can't do for you.

The `decisions` field is where the real lock-in lives:

```json
{
  "decisions": [
    {
      "decision": "Redis for session state, 30-min TTL",
      "rationale": "Checkout must survive a page refresh but not persist indefinitely. TTL handles expiry without a cron job.",
      "alternativesConsidered": [
        "Postgres sessions — adds DB load, overkill for this TTL",
        "JWT — stateless but can't invalidate on logout"
      ]
    }
  ]
}
```

`alternativesConsidered` is the real guardlock. It says: _we looked at the full solution space. here is why we didn't go the other way._ A future AI that reads this can't re-propose JWT without knowing it was already rejected.

**Step 3 — Guardlock.** Freeze. Every future AI session that touches this feature reads its decisions first. The MCP server injects them automatically. Claude doesn't get a blank slate — it gets your full context, including the roads you already decided not to take.

**The loop is flexible:**

| You want to…                 | Do this                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------- |
| Move fast                    | `lac fill` → quick review → freeze. Minutes per feature.                      |
| Write it yourself            | `lac init` → fill every field manually. AI not required.                      |
| Iterate slowly               | Draft in week 1. Freeze in week 4 after production taught you something.      |
| Onboard an existing codebase | `lac fill` on everything. Complete the gaps. No feature.jsons needed upfront. |
| Respond to a change          | Reopen a frozen feature with a reason. Loop again. Refreeze.                  |
| Reconstruct a project        | `lac fill` on project A → `lac export --prompt` → clone into B → strip source → Claude rebuilds from spec. |

The guardlock is only as strong as step 2. AI fill gives you a head start. Your review and completion make it a real contract.

---

## The killer feature: talk to Claude about your codebase

Add `lac-mcp` to Claude Code once.

```json
{
  "mcpServers": {
    "lac": { "command": "lac-mcp" }
  }
}
```

 Then just ask:
 
```
> What feature owns src/api/payments.ts?
→ feat-2026-007 — Checkout flow redesign (active, 80% complete)
   Cart abandonment spikes at the shipping step.

> Fill the checkout feature for me
→ Reading 6 source files...
  Writing analysis, decisions, successCriteria, userGuide...
  Done — feat-2026-007 is ready to freeze.

> What tech debt should we tackle next?
→ 3 features with risky decisions flagged for revisit:
  feat-2026-012 — "hardcoded timeout, revisit before scale"
  ...

> Is anything too similar to what I'm about to build?
→ feat-2026-019 overlaps 74% — Guest checkout (draft, same domain)
  Consider spawning a child instead of a new feature.
```

**19 MCP tools.** Claude runs the entire feature lifecycle — create, fill, advance, audit, query, lock — without leaving the chat. Works in Claude Code, Cursor, and any MCP host.

---

## `lac fill` — AI docs from your source code

No MCP? No problem. Point the CLI at any feature folder:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
lac fill src/payments/checkout
```

```
Analyzing feat-2026-007 — Checkout flow redesign
Reading 6 source files...
Generating with claude-sonnet-4-6...
  → analysis........... done
  → decisions.......... done  (3 found)
  → tags............... done
  → successCriteria.... done
  → userGuide.......... done

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  analysis
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Stateless checkout using Stripe Payment Intents.
  Cart state in Redis with 30-min TTL. Guest checkout
  allowed — no account required...

Apply? [Y]es / [n]o / [f]ield-by-field  _
```

Works on brownfield codebases too — drop it into an existing project with zero feature files and it onboards everything in one pass.

---

## Start a new feature in 30 seconds

```bash
cd src/payments/checkout
lac init
```

```
? What problem does this feature solve?
  › Cart abandonment spikes at the shipping step.
? Status? › draft
✓ Created feature.json — feat-2026-007
```

Then fill it:

```bash
lac fill .   # AI reads your source files and writes the rest
```

---

## One command. 18 different views.

`lac export` turns your feature workspace into anything:

```bash
lac export --graph .        # force-directed lineage graph, zoomable
lac export --kanban .       # Active / Frozen / Draft / Deprecated board
lac export --health .       # project health scorecard with animated counters
lac export --quiz .         # flashcard quiz — ship it to your whole team
lac export --slide .        # full-screen slideshow, keyboard nav
lac export --treemap .      # features as tiles, sized by decisions × completeness
lac export --heatmap .      # completeness grid — spot the holes instantly
lac export --decisions .    # consolidated ADR doc, searchable
lac export --story .        # long-form narrative, one chapter per domain
lac export --resume .       # portfolio from frozen features only
lac export --html .         # sidebar wiki with search + domain groups
lac export --site .         # full multi-page static site
lac export --prompt .       # AI reconstruction spec (see below)
```

Every export is a single self-contained HTML file. No server. No build step. Just open it.

---

## The everyday CLI

```bash
lac blame src/api/payments.ts     # → which feature owns this file
lac search "cart"                 # → full-text search across all features
lac lineage feat-2026-001         # → parent/child tree
lac stat                          # → completeness across the workspace
lac lint                          # → catch missing required fields
lac diff feat-2026-004 feat-2026-009  # → field-by-field comparison
lac spawn feat-2026-007           # → child feature, lineage pre-wired
lac log feat-2026-007             # → revision + status history timeline
lac serve                         # → live local dashboard on :7474
```

**Guardlock — protect human decisions from AI drift:**

```bash
lac config                                     # → see all resolved settings including guardlock
lac guardlock base                             # → which fields are restricted workspace-wide
lac guardlock base mode block                  # → AI writes to restricted fields = hard error
lac guardlock base lock problem decisions      # → add to workspace restrictedFields
lac guardlock status                           # → what's locked on this feature?
lac guardlock lock decisions --reason "final"  # → lock specific fields on this feature
lac guardlock freeze                           # → featureLocked: true — everything locked
lac fill .                                     # → skips locked fields automatically
lac fill . --force                             # → override locks, fill everything
```

**Filter everything by tag:**

```bash
lac stat --tags auth,payments     # scope to tagged features
lac stat --by-tag                 # group output by tag
lac search "db" --tags backend    # keyword search within tagged features
lac lint --tags experimental      # lint only a subset
```

---

## VS Code — _life-as-code Lens_

```
ext install majeanson.lac-lens
```

- **CodeLens** above every file in a feature folder — key, status, completeness %
- **Hover** to see the full feature without leaving the editor
- **Status bar chip** — click to open the Feature Panel for the current file
- **Feature Panel** — tabbed webview with inline field editing
- **Sidebar tree** — all features, grouped by status
- **Diagnostics** — red squiggles on incomplete active features

```jsonc
// .vscode/settings.json — enable LSP mode for hover + workspace symbols
{ "lacLens.lspMode": true }
```

---

## Real projects built with lac

### [lacexample.vercel.app](https://lacexample.vercel.app/) — the self-documenting app

A React app that reads its own `feature.json` files and renders them as a feature tree. The build process and the content are the same thing — the self-documenting loop is closed.

**29 features · all frozen · deployed**

```bash
git clone https://github.com/majeanson/lac-showcase
cd lac-showcase
lac stat    # 29/29 frozen · 100% complete
lac export --graph .   # open lac-graph.html — the full lineage tree
```

---

### SecondProjectExample — the reconstruction experiment

**Goal:** take only the `feature.json` files. Delete all source code. Rebuild the app from scratch using `lac export --prompt` and Claude.

```bash
# Step 1: extract feature context from an existing codebase
lac extract-all src/

# Step 2: export as an AI reconstruction spec
lac export --prompt . > spec.md

# Step 3: delete the source
rm -rf src/

# Step 4: give spec.md to Claude and ask it to rebuild
# → Claude reconstructs working source from the spec alone
```

The result: a working app rebuilt from documentation. The experiment surfaces exactly which fields matter most for reconstruction — that's why `codeSnippets`, `publicInterface`, and `componentFile` exist in the schema.

---

### FourthProjectExample — Recall (32 features · LAC-first iOS app)

Every screen, every SQLite table, every service function starts as a `feature.json`. No TypeScript written before the feature is frozen.

**Design rule:** feature.jsons are tech-agnostic (what/why) — stack specifics live in `codeSnippets` and `Recommendations`. The 32-feature spec survives a stack change.

```bash
lac lint      # 32/32 pass — zero schema gaps
lac audit     # 0 missing decisions
lac export --kanban .   # drag-and-drop board of all 32 features
```

---

## Why not just use…

|                                     | `lac` | Jira/Linear | ADRs | Commit messages |
| ----------------------------------- | ----- | ----------- | ---- | --------------- |
| Lives with the code                 | ✅    | ❌          | ✅   | ✅              |
| Structured + typed                  | ✅    | ✅          | ❌   | ❌              |
| AI can fill it from your source     | ✅    | ❌          | ❌   | ❌              |
| Queryable CLI                       | ✅    | ❌          | ❌   | ❌              |
| 18 export formats                   | ✅    | ❌          | ❌   | ❌              |
| Feature lifecycle (draft→frozen)    | ✅    | ✅          | ❌   | ❌              |
| Lineage (parent→children)           | ✅    | ❌          | ❌   | ❌              |
| Survives a ticket tracker migration | ✅    | ❌          | ✅   | ✅              |
| Works fully offline                 | ✅    | ❌          | ✅   | ✅              |

---

## The web dashboard

**[lifeascode-ruddy.vercel.app](https://lifeascode-ruddy.vercel.app/)** — a shared team dashboard on top of the same `feature.json` files.

- Live search + status filter pills
- Completeness histogram, RBAC views (Dev / PM / Support / User)
- Feature detail: 6 tabs — overview, guide, lineage, decisions, annotations, history
- Inline editor that writes back to `feature.json` on disk
- File watcher — filesystem changes sync to Postgres within 300ms

**Deploy your own in 5 minutes:**

Fork [github.com/majeanson/lifeascode](https://github.com/majeanson/lifeascode), set `DATABASE_URL` + `AUTH_SECRET` in Vercel env, and deploy. The first deploy runs the migration automatically.

---

## What's in the box

One install. No separate packages needed.

| Binary    | What it gives you                                         |
| --------- | --------------------------------------------------------- |
| `lac`     | Full CLI — all commands including `fill`, `gen`, `export` |
| `lac-lsp` | LSP server + HTTP dashboard API                           |
| `lac-mcp` | MCP server — 19 tools for Claude Code and any MCP client  |

```bash
npm install -g @majeanson/lac
lac --version   # 3.3.0
```

---

## Feature key format

```
feat-2026-007   user-facing feature
proc-2026-003   internal process or workflow
goal-2026-007   team or product goal
adr-2026-002    architecture decision record
```

Domain prefix is yours to define. Year gives temporal context at a glance. Keys auto-increment via `lac init`.

---

## License

MIT — [github.com/majeanson/lac-cli](https://github.com/majeanson/lac-cli)

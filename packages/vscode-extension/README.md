# life-as-code Lens

**Feature provenance, inline in your editor.**

See which feature owns the file you're editing, check its status and completeness, navigate the full feature hierarchy, and create or annotate features — without ever leaving VS Code.

---

## What it does

### Always-on inline context

**Code lens** — appears above the first line of every file inside a feature folder. Shows the feature key, status icon, title, and completeness score at a glance.

**Hover** — hover anywhere in your code to see the full feature summary for the file's owning feature: status, problem, decisions, annotations, and lineage.

**Status bar** — a chip in the bottom bar shows which feature owns your current file. Click it to open the Feature Panel.

**Diagnostics** — squiggles on `feature.json` files with completeness warnings:
- Active features missing `analysis` or `implementation` get ⚠️ warnings
- Active features with no recorded decisions get ℹ️ hints
- Any feature missing a `problem` statement gets an ❌ error

---

### Feature Panel

Click any code lens or status bar chip to open the **Feature Panel** — a rich webview with:

| Tab | Content |
|---|---|
| Overview | Problem statement, lineage block with clickable parent/child links |
| Analysis | Markdown-rendered analysis with inline edit |
| Decisions | All decisions with rationale, date, and alternatives |
| Implementation | Markdown-rendered implementation notes with inline edit |
| Limitations | Editable list of known limitations |
| Annotations | All annotations with type badges (warning, lesson, tech-debt…) |

**Inline editing** — every section has a ✏ edit button. Click it, edit the text directly in the panel, and press **Ctrl+Enter** or **Save** to write back to `feature.json` on disk. No file switching needed.

**Navigate lineage** — parent and child feature keys in the Lineage block are clickable links (`↗`). Click any one to open its Feature Panel.

**Export** — the ⤓ Export button renders the full feature as Markdown and offers to save it next to `feature.json`.

---

### Feature Tree View

A **Features** panel in the Explorer sidebar lists all `feature.json` files in your workspace, grouped by status:

```
Features
  ⊙ active  (4)
    ⊙ auth-otp
    ⊙ payment-v2
  ◌ draft  (2)
    ◌ dark-mode
  ❄ frozen  (1)
    ❄ legacy-api
```

Click any feature to open its panel. Right-click for context actions.

---

### Commands (Ctrl+Shift+P → `lac:`)

| Command | What it does |
|---|---|
| `lac: New Feature here…` | 4-step wizard: key, title, status, problem. Creates `feature.json` and opens the panel. |
| `lac: New Child Feature…` | Creates a child feature in a new subfolder with lineage pre-wired. Updates parent's `children[]`. |
| `lac: Change Feature Status…` | QuickPick to flip status (draft / active / frozen / deprecated) for the nearest feature. |
| `lac: Search Features…` | Workspace-wide search across all features — filter by key, title, tags, or problem text. |
| `lac: Add Decision…` | 2-step wizard (decision + rationale) that appends to `decisions[]` with today's date. |
| `lac: Export Feature as Markdown` | Renders the full feature as `.md` and offers to save it alongside `feature.json`. |
| `lac: Show Feature Panel` | Opens the panel for the feature owning your current file. |

All commands are also available in the **editor right-click menu** and the **Explorer context menu**.

---

## Requirements

Install the CLI first — it includes `lac-lsp`, the language server the extension uses:

```bash
npm install -g @majeanson/lac
```

Then initialise a workspace in your repo:

```bash
lac workspace init
```

---

## LSP mode (richer features)

By default the extension runs in lightweight mode (local file walking). Enable LSP mode for full hover, workspace symbol search (`Ctrl+T` → type a feature key), and richer diagnostics from the language server:

```jsonc
// .vscode/settings.json
{
  "lacLens.lspMode": true
}
```

`lac-lsp` is already on your PATH after installing `@majeanson/lac` — no extra install needed. The extension auto-detects it and notifies you.

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `lacLens.enableCodeLens` | `true` | Show code lens above files in feature folders |
| `lacLens.enableStatusBar` | `true` | Show active feature in the status bar |
| `lacLens.lspMode` | `false` | Use `lac-lsp` for richer hover + diagnostics |
| `lacLens.lspServerPath` | `"lac-lsp"` | Path to the `lac-lsp` binary |
| `lacLens.httpPort` | `7474` | Port the LSP HTTP API listens on |

---

## Links

- [CLI — @majeanson/lac](https://www.npmjs.com/package/@majeanson/lac)
- [Web UI — lifeascode-ruddy.vercel.app](https://lifeascode-ruddy.vercel.app/)
- [Source — github.com/majeanson/lac-cli](https://github.com/majeanson/lac-cli)

MIT License

/**
 * hubGenerator — generates lac-hub.html / index.html
 *
 * A single-page hub that links to every LAC-generated HTML view.
 * Used as the entry point when the app has a "Life-as-Code" button.
 *
 * Design:
 *   - Same dark-amber LAC design language as all other generators
 *   - Two-tier layout: "User-facing" (guide, story) featured at top
 *   - Developer tools in a secondary grid below
 *   - Project stats row + generation timestamp
 *   - Fully self-contained (no external deps)
 */

export interface HubEntry {
  /** Relative filename, e.g. "lac-guide.html" */
  file: string;
  /** Human label shown on the card */
  label: string;
  /** One-sentence description shown under the label */
  description: string;
  /** Emoji used as card icon */
  icon: string;
  /** True → appears in the "User-facing" featured section */
  primary: boolean;
}

export interface HubStats {
  total:      number;
  frozen:     number;
  active:     number;
  draft:      number;
  deprecated: number;
  domains:    string[];
}

/** Canonical ordered entry definitions for all standard LAC outputs. */
export const ALL_HUB_ENTRIES: HubEntry[] = [
  { file: "lac-guide.html",     label: "User Guide",         description: "How to use every user-facing feature — generated from userGuide fields",   icon: "📖", primary: true  },
  { file: "lac-story.html",     label: "Product Story",      description: "Long-form narrative case study built from feature data",                    icon: "📰", primary: true  },
  { file: "lac-wiki.html",      label: "Feature Wiki",       description: "Complete searchable wiki — all fields, all features, sidebar navigation",    icon: "🗂️",  primary: false },
  { file: "lac-kanban.html",    label: "Kanban Board",       description: "Active / Frozen / Draft columns with sortable, filterable cards",            icon: "📋", primary: false },
  { file: "lac-health.html",    label: "Health Scorecard",   description: "Completeness, coverage, tech-debt score, and field fill rates",              icon: "🏥", primary: false },
  { file: "lac-decisions.html", label: "Decision Log",       description: "All architectural decisions consolidated and searchable by domain",          icon: "⚖️",  primary: false },
  { file: "lac-heatmap.html",   label: "Completeness Heatmap", description: "Field x feature completeness grid — quickly spot gaps",                               icon: "🔥", primary: false },
  { file: "lac-graph.html",     label: "Lineage Graph",      description: "Interactive force-directed feature dependency graph",                        icon: "🕸️",  primary: false },
  { file: "lac-print.html",     label: "Print",              description: "Print-ready A4 document — all features in clean two-column layout",          icon: "🖨️",  primary: false },
  { file: "lac-raw.html",       label: "Raw Dump",           description: "Field-by-field dump of every feature.json with sidebar navigation",          icon: "🔩", primary: false },
];

export function generateHub(
  projectName: string,
  stats: HubStats,
  entries: HubEntry[],
  generatedAt: string = new Date().toISOString(),
): string {
  function esc(s: string): string {
    return s
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  const primaryEntries   = entries.filter(e => e.primary);
  const secondaryEntries = entries.filter(e => !e.primary);

  const date = new Date(generatedAt).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  function primaryCard(e: HubEntry): string {
    return `
    <a href="./${esc(e.file)}" class="primary-card" target="_self">
      <div class="primary-card-icon">${e.icon}</div>
      <div class="primary-card-body">
        <div class="primary-card-label">${esc(e.label)}</div>
        <div class="primary-card-desc">${esc(e.description)}</div>
      </div>
      <div class="primary-card-arrow">→</div>
    </a>`;
  }

  function secondaryCard(e: HubEntry): string {
    return `
    <a href="./${esc(e.file)}" class="secondary-card" target="_self">
      <div class="secondary-card-icon">${e.icon}</div>
      <div class="secondary-card-label">${esc(e.label)}</div>
      <div class="secondary-card-desc">${esc(e.description)}</div>
    </a>`;
  }

  const domainList = stats.domains.length > 0
    ? stats.domains.slice(0, 6).map(d => `<span class="domain-tag">${esc(d)}</span>`).join("") +
      (stats.domains.length > 6 ? `<span class="domain-tag">+${stats.domains.length - 6}</span>` : "")
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)} — Life-as-Code Hub</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg:        #0f0d0b;
  --bg-card:   #181512;
  --bg-hover:  #1e1a16;
  --border:    #262018;
  --text:      #ece3d8;
  --text-mid:  #b0a494;
  --text-soft: #736455;
  --accent:    #c4a255;
  --accent-w:  #e8b865;
  --mono: 'Cascadia Code','Fira Code','JetBrains Mono','Consolas',monospace;
  --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --frozen:  #5b82cc; --active: #4aad72; --draft: #c4a255; --deprecated: #cc5b5b;
}
html { scroll-behavior: smooth; }
body { background: var(--bg); color: var(--text); font-family: var(--sans); font-size: 14px; line-height: 1.6; min-height: 100vh; }

/* ── Topbar ── */
.topbar { height: 46px; display: flex; align-items: center; gap: 14px; padding: 0 28px; background: #0b0a08; border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 10; }
.topbar-brand { font-family: var(--mono); font-size: 13px; color: var(--accent); letter-spacing: 0.05em; }
.topbar-sep   { color: var(--border); font-size: 18px; line-height: 1; }
.topbar-title { font-size: 13px; color: var(--text-mid); }
.topbar-date  { margin-left: auto; font-family: var(--mono); font-size: 10px; color: var(--text-soft); }

/* ── Layout ── */
.page { max-width: 880px; margin: 0 auto; padding: 56px 28px 100px; }

/* ── Hero ── */
.hero { margin-bottom: 48px; }
.hero-eyebrow { font-family: var(--mono); font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--accent); margin-bottom: 12px; }
.hero-title   { font-size: 40px; font-weight: 800; color: var(--text); letter-spacing: -0.025em; line-height: 1.1; margin-bottom: 10px; }
.hero-sub     { font-size: 15px; color: var(--text-mid); max-width: 520px; line-height: 1.7; margin-bottom: 28px; }

/* ── Stats row ── */
.stats-row { display: flex; flex-wrap: wrap; gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; margin-bottom: 8px; }
.stat { flex: 1; min-width: 90px; padding: 14px 20px; background: var(--bg-card); }
.stat-num   { font-family: var(--mono); font-size: 22px; font-weight: 700; line-height: 1; }
.stat-lbl   { font-size: 11px; color: var(--text-soft); margin-top: 3px; }
.stat-total  .stat-num { color: var(--accent); }
.stat-frozen .stat-num { color: var(--frozen); }
.stat-active .stat-num { color: var(--active); }
.stat-draft  .stat-num { color: var(--draft);  }

.domains-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.domain-tag  { display: inline-block; padding: 2px 9px; border-radius: 999px; font-family: var(--mono); font-size: 10px; color: var(--text-soft); background: var(--bg-card); border: 1px solid var(--border); }

/* ── Section headings ── */
.section-header { margin-top: 52px; margin-bottom: 16px; display: flex; align-items: center; gap: 12px; }
.section-title  { font-family: var(--mono); font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--text-soft); }
.section-rule   { flex: 1; height: 1px; background: var(--border); }

/* ── Primary cards (user-facing) ── */
.primary-grid { display: flex; flex-direction: column; gap: 12px; }
.primary-card {
  display: flex; align-items: center; gap: 20px;
  padding: 22px 24px; background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 12px; text-decoration: none;
  transition: border-color 0.15s, background 0.15s, transform 0.1s;
}
.primary-card:hover { background: var(--bg-hover); border-color: var(--accent); transform: translateX(2px); }
.primary-card-icon  { font-size: 28px; flex-shrink: 0; width: 44px; text-align: center; }
.primary-card-body  { flex: 1; min-width: 0; }
.primary-card-label { font-size: 17px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
.primary-card-desc  { font-size: 13px; color: var(--text-mid); line-height: 1.5; }
.primary-card-arrow { font-size: 18px; color: var(--accent); flex-shrink: 0; transition: transform 0.15s; }
.primary-card:hover .primary-card-arrow { transform: translateX(4px); }

/* ── Secondary grid (developer) ── */
.secondary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
.secondary-card {
  display: block; padding: 18px 20px; background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 10px; text-decoration: none;
  transition: border-color 0.15s, background 0.15s;
}
.secondary-card:hover { background: var(--bg-hover); border-color: var(--text-soft); }
.secondary-card-icon  { font-size: 20px; margin-bottom: 8px; display: block; }
.secondary-card-label { font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 4px; }
.secondary-card-desc  { font-size: 12px; color: var(--text-soft); line-height: 1.55; }

/* ── Footer ── */
.footer { margin-top: 64px; padding-top: 24px; border-top: 1px solid var(--border); display: flex; align-items: center; gap: 12px; }
.footer-brand { font-family: var(--mono); font-size: 10px; color: var(--text-soft); }
.footer-sep   { font-family: var(--mono); font-size: 10px; color: var(--border); }
.footer-note  { font-size: 11px; color: var(--text-soft); }
</style>
<script>if(location.pathname.slice(-1)!=='/')location.replace(location.pathname+'/')</script>
</head>
<body>

<div class="topbar">
  <span class="topbar-brand">lac·hub</span>
  <span class="topbar-sep">/</span>
  <span class="topbar-title">${esc(projectName)}</span>
  <span class="topbar-date">Generated ${esc(date)}</span>
</div>

<div class="page">

  <div class="hero">
    <div class="hero-eyebrow">life-as-code</div>
    <div class="hero-title">${esc(projectName)}</div>
    <div class="hero-sub">Feature documentation hub — every view of the project's feature.json data in one place.</div>
    <div class="stats-row">
      <div class="stat stat-total">
        <div class="stat-num">${stats.total}</div>
        <div class="stat-lbl">features</div>
      </div>
      <div class="stat stat-frozen">
        <div class="stat-num">${stats.frozen}</div>
        <div class="stat-lbl">frozen</div>
      </div>
      <div class="stat stat-active">
        <div class="stat-num">${stats.active}</div>
        <div class="stat-lbl">active</div>
      </div>
      <div class="stat stat-draft">
        <div class="stat-num">${stats.draft}</div>
        <div class="stat-lbl">draft</div>
      </div>
      <div class="stat">
        <div class="stat-num" style="color:var(--text-mid)">${stats.domains.length}</div>
        <div class="stat-lbl">domains</div>
      </div>
    </div>
    ${domainList ? `<div class="domains-row">${domainList}</div>` : ""}
  </div>

  ${primaryEntries.length > 0 ? `
  <div class="section-header">
    <div class="section-title">User-facing</div>
    <div class="section-rule"></div>
  </div>
  <div class="primary-grid">
    ${primaryEntries.map(primaryCard).join("")}
  </div>` : ""}

  ${secondaryEntries.length > 0 ? `
  <div class="section-header">
    <div class="section-title">Developer views</div>
    <div class="section-rule"></div>
  </div>
  <div class="secondary-grid">
    ${secondaryEntries.map(secondaryCard).join("")}
  </div>` : ""}

  <div class="footer">
    <span class="footer-brand">@majeanson/lac</span>
    <span class="footer-sep">//</span>
    <span class="footer-note">Generated from feature.json files. Run <code style="font-family:var(--mono);font-size:10px;background:#1e1a16;padding:1px 5px;border-radius:3px">lac export --all</code> to regenerate.</span>
  </div>

</div>
</body>
</html>`;
}

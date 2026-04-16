import type { Feature } from "@life-as-code/feature-schema";

/**
 * generateUserGuide — builds a self-contained HTML user guide from feature.jsons.
 *
 * Inclusion rule:
 *   - Feature has a non-empty `userGuide` string → included
 *   - Feature has `userGuide: ""` (empty string) → intentionally excluded (not user-facing)
 *   - Feature has no `userGuide` field → also excluded (not yet documented)
 *
 * Output: lac-guide.html
 * Structure: sidebar navigation grouped by domain + content panel per feature.
 *            Includes full-text search, prev/next navigation, status badges, tag chips,
 *            known limitations, and domain colour coding.
 */
export function generateUserGuide(features: Feature[], projectName: string): string {
  // ── Helpers ──────────────────────────────────────────────────────────────

  function esc(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Basic markdown → HTML. Handles headers, bold, italic, code, bullets, paragraphs. */
  function mdToHtml(raw: string): string {
    function escLine(s: string): string {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function inline(s: string): string {
      return escLine(s)
        .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*\n]+?)\*/g, "<em>$1</em>")
        .replace(/_([^_\n]+?)_/g, "<em>$1</em>")
        .replace(/`([^`]+)`/g, "<code>$1</code>");
    }

    const blocks = raw.split(/\n{2,}/);
    const out: string[] = [];

    for (const block of blocks) {
      const lines = block.split("\n");
      const first = lines[0]?.trim() ?? "";

      if (/^#{3,}\s/.test(first)) {
        out.push(`<h5 class="guide-md-h">${inline(first.replace(/^#+\s+/, ""))}</h5>`);
        if (lines.length > 1)
          out.push(`<p class="guide-md-p">${lines.slice(1).map(l => inline(l.trim())).join(" ")}</p>`);
      } else if (/^#{2}\s/.test(first)) {
        out.push(`<h4 class="guide-md-h">${inline(first.replace(/^##\s+/, ""))}</h4>`);
        if (lines.length > 1)
          out.push(`<p class="guide-md-p">${lines.slice(1).map(l => inline(l.trim())).join(" ")}</p>`);
      } else if (/^#\s/.test(first)) {
        out.push(`<h3 class="guide-md-h">${inline(first.replace(/^#\s+/, ""))}</h3>`);
      } else if (lines.every(l => /^\s*[-*]\s/.test(l))) {
        out.push(
          `<ul class="guide-md-ul">${lines.map(l => `<li>${inline(l.replace(/^\s*[-*]\s/, "").trim())}</li>`).join("")}</ul>`,
        );
      } else {
        const items: string[] = [];
        const rest: string[] = [];
        let inList = true;
        for (const l of lines) {
          if (inList && /^\s*[-*]\s/.test(l)) {
            items.push(`<li>${inline(l.replace(/^\s*[-*]\s/, "").trim())}</li>`);
          } else {
            inList = false;
            rest.push(l);
          }
        }
        if (items.length) out.push(`<ul class="guide-md-ul">${items.join("")}</ul>`);
        if (rest.length)
          out.push(
            `<p class="guide-md-p">${rest.map(l => inline(l.trim())).filter(Boolean).join(" ")}</p>`,
          );
      }
    }
    return out.join("\n");
  }

  // ── Filter: only features with a non-empty userGuide ─────────────────────

  const guideFeatures = features.filter(f => typeof f.userGuide === "string" && f.userGuide.trim().length > 0);

  // ── Domain ordering & colours ─────────────────────────────────────────────

  // Collect domains in the order they first appear (respects feature.json build order)
  const domainOrder: string[] = [];
  const seen = new Set<string>();
  for (const f of guideFeatures) {
    const d = f.domain ?? "misc";
    if (!seen.has(d)) { seen.add(d); domainOrder.push(d); }
  }

  // Assign a colour to each domain from a fixed accessible palette
  const PALETTE = [
    "#c4a255", // amber
    "#e8674a", // orange-red
    "#4aad72", // green
    "#5b82cc", // blue
    "#b87fda", // purple
    "#e8b865", // warm amber
    "#4ab8cc", // teal
    "#cc5b5b", // red
    "#a2cc4a", // lime
    "#736455", // muted brown
  ];
  const domainColor: Record<string, string> = {};
  domainOrder.forEach((d, i) => {
    domainColor[d] = PALETTE[i % PALETTE.length]!;
  });

  // ── Build page data ───────────────────────────────────────────────────────

  interface PageData {
    id: string;
    feature: Feature;
    domain: string;
    color: string;
  }

  const pages: PageData[] = guideFeatures.map(f => ({
    id: f.featureKey,
    feature: f,
    domain: f.domain ?? "misc",
    color: domainColor[f.domain ?? "misc"] ?? "#c4a255",
  }));

  // ── Feature count by domain (for stat cards) ──────────────────────────────

  const countByDomain: Record<string, number> = {};
  for (const p of pages) {
    countByDomain[p.domain] = (countByDomain[p.domain] ?? 0) + 1;
  }

  // ── Stat rows ─────────────────────────────────────────────────────────────

  const frozenCount  = pages.filter(p => p.feature.status === "frozen").length;
  const activeCount  = pages.filter(p => p.feature.status === "active").length;
  const draftCount   = pages.filter(p => p.feature.status === "draft").length;
  const skippedCount = features.length - guideFeatures.length;

  // ── Sidebar nav HTML ──────────────────────────────────────────────────────

  function navItem(p: PageData): string {
    return `<a class="nav-item" data-id="${esc(p.id)}" href="#${esc(p.id)}">
      <div class="nav-item-dot ${esc(p.feature.status)}"></div>
      <span class="nav-item-name">${esc(p.feature.title)}</span>
    </a>`;
  }

  const navGroupsHtml = domainOrder.map(domain => {
    const domainPages = pages.filter(p => p.domain === domain);
    const color = domainColor[domain]!;
    const domainLabel = domain.replace(/-/g, " ");
    return `<div class="nav-group" data-domain="${esc(domain)}">
      <div class="nav-domain-header" onclick="this.closest('.nav-group').classList.toggle('collapsed')">
        <div class="nav-domain-pip" style="background:${color}"></div>
        ${esc(domainLabel)}
        <span class="nav-arrow">▾</span>
      </div>
      <div class="nav-group-items">
        ${domainPages.map(navItem).join("\n        ")}
      </div>
    </div>`;
  }).join("\n    ");

  // ── TOC cards (home page) ─────────────────────────────────────────────────

  const tocCardsHtml = pages.map(p =>
    `<a class="toc-card" href="#${esc(p.id)}">
      <div class="toc-pip" style="background:${p.color}"></div>
      <div>
        <div class="toc-card-title">${esc(p.feature.title)}</div>
        <div class="toc-card-sub">${esc(p.domain.replace(/-/g, " "))} · <span style="color:var(--status-${esc(p.feature.status)})">${esc(p.feature.status)}</span></div>
      </div>
    </a>`,
  ).join("\n        ");

  // ── Stat cards (home page) ────────────────────────────────────────────────

  const statCardsHtml = [
    { num: pages.length,    lbl: "with user guides" },
    { num: frozenCount,     lbl: "frozen",  color: "var(--status-frozen)"  },
    { num: activeCount,     lbl: "active",  color: "var(--status-active)"  },
    { num: draftCount,      lbl: "draft",   color: "var(--status-draft)"   },
    { num: skippedCount,    lbl: "internal / no guide" },
  ].map(s =>
    `<div class="stat-card">
      <div class="stat-num" style="color:${s.color ?? "var(--accent)"};">${s.num}</div>
      <div class="stat-lbl">${s.lbl}</div>
    </div>`,
  ).join("\n      ");

  // ── Per-feature page HTML ─────────────────────────────────────────────────

  function renderFeaturePage(p: PageData, idx: number): string {
    const f = p.feature;
    const prev = pages[idx - 1];
    const next = pages[idx + 1];

    const tags = (f.tags ?? []).map(t => `<span class="tag">${esc(t)}</span>`).join(" ");

    const guideHtml = mdToHtml(f.userGuide!);

    const limitsHtml =
      f.knownLimitations && f.knownLimitations.length > 0
        ? `<div class="limitations-block">
            <div class="limits-label">Known Limitations</div>
            <ul class="limits-list">${f.knownLimitations.map(l => `<li>${mdToHtml(l)}</li>`).join("")}</ul>
          </div>`
        : "";

    const prevBtn = prev
      ? `<div class="feature-nav-btn" onclick="showPage('${esc(prev.id)}')">
          <div class="nav-btn-arrow">←</div>
          <div><div class="nav-btn-label">Previous</div><div class="nav-btn-title">${esc(prev.feature.title)}</div></div>
        </div>`
      : `<div></div>`;

    const nextBtn = next
      ? `<div class="feature-nav-btn next" onclick="showPage('${esc(next.id)}')">
          <div><div class="nav-btn-label">Next</div><div class="nav-btn-title">${esc(next.feature.title)}</div></div>
          <div class="nav-btn-arrow">→</div>
        </div>`
      : `<div></div>`;

    return `<div id="page-${esc(p.id)}" class="feature-page hidden">
      <div class="feature-domain-eyebrow" style="color:${p.color}">${esc(p.domain.replace(/-/g, " "))}</div>
      <div class="feature-title">${esc(f.title)}</div>
      <div class="feature-meta">
        <span class="status-badge ${esc(f.status)}">${esc(f.status)}</span>
        ${f.featureKey ? `<span class="feature-key-label">${esc(f.featureKey)}</span>` : ""}
        ${tags}
      </div>
      ${f.featureKey ? `<div class="cross-links">
        <a class="cross-link" href="./lac-wiki.html#${esc(f.featureKey)}">🗂️ Wiki</a>
        <a class="cross-link" href="./lac-raw.html#${esc(f.featureKey)}">🔩 Raw</a>
      </div>` : ""}
      <div class="guide-block">
        <div class="guide-block-label">How to use</div>
        <div class="guide-text">${guideHtml}</div>
      </div>
      ${limitsHtml}
      <div class="feature-nav">
        ${prevBtn}
        ${nextBtn}
      </div>
    </div>`;
  }

  const featurePagesHtml = pages.map((p, i) => renderFeaturePage(p, i)).join("\n    ");

  // ── JSON blob for search (title + guide text + tags, stripped of HTML) ────

  const searchData = JSON.stringify(
    pages.map(p => ({
      id: p.id,
      title: p.feature.title,
      domain: p.domain,
      status: p.feature.status,
      tags: p.feature.tags ?? [],
      guide: p.feature.userGuide ?? "",
    })),
  );

  // ── Full document ─────────────────────────────────────────────────────────

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)} — User Guide</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:          #0f0d0b;
  --bg-sidebar:  #0b0a08;
  --bg-card:     #181512;
  --bg-hover:    #1e1a16;
  --bg-active:   #231e17;
  --border:      #262018;
  --border-soft: #1e1a14;
  --text:        #ece3d8;
  --text-mid:    #b0a494;
  --text-soft:   #736455;
  --accent:      #c4a255;
  --mono: 'Cascadia Code','Fira Code','JetBrains Mono','Consolas',monospace;
  --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --status-frozen:     #5b82cc;
  --status-active:     #4aad72;
  --status-draft:      #c4a255;
  --status-deprecated: #cc5b5b;
  --status-frozen-bg:  rgba(91,130,204,0.10);
  --status-active-bg:  rgba(74,173,114,0.10);
  --status-draft-bg:   rgba(196,162,85,0.10);
}
html { scroll-behavior: smooth; }
body {
  background: var(--bg); color: var(--text);
  font-family: var(--sans); font-size: 14px; line-height: 1.6;
  display: flex; flex-direction: column; height: 100vh; overflow: hidden;
}
.shell { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

/* Topbar */
.topbar {
  flex-shrink: 0; height: 46px; display: flex; align-items: center;
  gap: 14px; padding: 0 20px;
  background: var(--bg-sidebar); border-bottom: 1px solid var(--border); z-index: 10;
}
.topbar-brand { font-family: var(--mono); font-size: 13px; color: var(--accent); letter-spacing: 0.05em; white-space: nowrap; }
.topbar-sep   { color: var(--border); font-size: 18px; line-height: 1; }
.topbar-title { font-size: 13px; color: var(--text-mid); white-space: nowrap; }
.topbar-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.topbar-count { font-family: var(--mono); font-size: 11px; color: var(--text-soft); }
.search-wrap  { position: relative; }
#gsearch {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 5px;
  padding: 5px 10px 5px 28px; font-family: var(--mono); font-size: 11px;
  color: var(--text); outline: none; width: 180px;
  transition: border-color 0.15s, width 0.2s;
}
#gsearch:focus { border-color: var(--accent); width: 240px; }
#gsearch::placeholder { color: var(--text-soft); }
.search-icon { position: absolute; left: 8px; top: 50%; transform: translateY(-50%); color: var(--text-soft); pointer-events: none; }

.body-row { display: flex; flex: 1; min-height: 0; }

/* Sidebar */
.sidebar {
  width: 256px; flex-shrink: 0;
  background: var(--bg-sidebar); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; overflow: hidden;
}
.sidebar-header { padding: 14px 16px 10px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.sidebar-label  { font-family: var(--mono); font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-soft); margin-bottom: 4px; }
.sidebar-sub    { font-size: 11px; color: var(--text-mid); }
.nav-tree {
  flex: 1; overflow-y: auto; padding: 8px 0 32px;
  scrollbar-width: thin; scrollbar-color: var(--border) transparent;
}
.nav-tree::-webkit-scrollbar { width: 4px; }
.nav-tree::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

.nav-domain-header {
  display: flex; align-items: center; gap: 7px; padding: 10px 14px 5px;
  font-family: var(--mono); font-size: 9px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--text-soft);
  cursor: pointer; user-select: none;
}
.nav-domain-header:hover { color: var(--text-mid); }
.nav-domain-pip { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.nav-arrow { font-size: 8px; margin-left: auto; transition: transform 0.15s; }
.nav-group.collapsed .nav-arrow { transform: rotate(-90deg); }
.nav-group-items { overflow: hidden; }
.nav-group.collapsed .nav-group-items { display: none; }
.nav-item {
  display: flex; align-items: center; gap: 8px; padding: 5px 14px 5px 24px;
  cursor: pointer; border-left: 2px solid transparent; transition: background 0.1s;
  text-decoration: none;
}
.nav-item:hover { background: var(--bg-hover); }
.nav-item.active { background: var(--bg-active); border-left-color: var(--accent); }
.nav-item-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
.nav-item-dot.frozen     { background: var(--status-frozen); }
.nav-item-dot.active     { background: var(--status-active); }
.nav-item-dot.draft      { background: var(--status-draft); }
.nav-item-dot.deprecated { background: var(--status-deprecated); }
.nav-item-name { font-size: 12px; color: var(--text-mid); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
.nav-item:hover .nav-item-name, .nav-item.active .nav-item-name { color: var(--text); }

/* Content */
.content {
  flex: 1; min-width: 0; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: var(--border) transparent;
}
.content::-webkit-scrollbar { width: 6px; }
.content::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

/* Home */
.home-page { max-width: 760px; margin: 0 auto; padding: 56px 40px 80px; }
.home-eyebrow { font-family: var(--mono); font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--accent); margin-bottom: 14px; }
.home-title   { font-size: 36px; font-weight: 800; color: var(--text); letter-spacing: -0.02em; line-height: 1.1; margin-bottom: 10px; }
.home-sub     { font-size: 15px; color: var(--text-mid); line-height: 1.75; max-width: 560px; margin-bottom: 40px; }
.stat-row     { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 48px; }
.stat-card    { padding: 16px 20px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; min-width: 110px; }
.stat-num     { font-family: var(--mono); font-size: 26px; font-weight: 700; color: var(--accent); line-height: 1; }
.stat-lbl     { font-size: 11px; color: var(--text-soft); margin-top: 4px; }
.section-title { font-family: var(--mono); font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-soft); margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
.toc-grid  { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
.toc-card  { padding: 12px 16px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; transition: border-color 0.15s, background 0.15s; display: flex; align-items: flex-start; gap: 10px; text-decoration: none; }
.toc-card:hover { background: var(--bg-hover); border-color: var(--text-soft); }
.toc-pip   { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
.toc-card-title { font-size: 13px; font-weight: 600; color: var(--text); line-height: 1.3; }
.toc-card-sub   { font-size: 11px; color: var(--text-soft); margin-top: 2px; }

/* Feature pages */
.feature-page { max-width: 760px; margin: 0 auto; padding: 48px 40px 80px; }
.feature-page.hidden, .home-page.hidden { display: none; }
.feature-domain-eyebrow { font-family: var(--mono); font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 10px; }
.feature-title { font-size: 28px; font-weight: 800; color: var(--text); letter-spacing: -0.015em; line-height: 1.2; margin-bottom: 12px; }
.feature-meta  { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.cross-links   { display: flex; gap: 8px; margin-bottom: 24px; }
.cross-link    { font-family: var(--mono); font-size: 11px; color: var(--text-soft); text-decoration: none; padding: 3px 10px; border: 1px solid var(--border); border-radius: 999px; background: var(--bg-card); }
.cross-link:hover { color: var(--accent); border-color: var(--accent); }
.status-badge  { display: inline-block; padding: 2px 10px; border-radius: 999px; font-family: var(--mono); font-size: 10px; border: 1px solid; }
.status-badge.frozen     { color: var(--status-frozen);     border-color: rgba(91,130,204,0.4);  background: var(--status-frozen-bg); }
.status-badge.active     { color: var(--status-active);     border-color: rgba(74,173,114,0.4);  background: var(--status-active-bg); }
.status-badge.draft      { color: var(--status-draft);      border-color: rgba(196,162,85,0.4);  background: var(--status-draft-bg);  }
.status-badge.deprecated { color: var(--status-deprecated); border-color: rgba(204,91,91,0.4);   background: rgba(204,91,91,0.08);    }
.feature-key-label { font-family: var(--mono); font-size: 10px; color: var(--text-soft); }
.tag { display: inline-block; padding: 1px 8px; border-radius: 999px; font-family: var(--mono); font-size: 10px; color: var(--text-soft); background: var(--bg-card); border: 1px solid var(--border); }

/* Guide block */
.guide-block { background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 28px 32px; margin-bottom: 28px; }
.guide-block-label { font-family: var(--mono); font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--accent); margin-bottom: 16px; }
.guide-text  { font-size: 14px; line-height: 1.85; color: var(--text-mid); }
.guide-md-p  { margin: 0 0 0.85em; line-height: 1.85; }
.guide-md-p:last-child { margin-bottom: 0; }
.guide-md-h  { font-family: var(--mono); font-size: 0.78rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text); margin: 1.2em 0 0.5em; }
.guide-md-ul { margin: 0.4em 0 0.8em 1.4em; }
.guide-md-ul li { margin-bottom: 0.4em; }
.guide-text strong { color: var(--text); font-weight: 600; }
.guide-text code   { font-family: var(--mono); font-size: 12px; background: var(--bg-hover); border: 1px solid var(--border); border-radius: 3px; padding: 1px 5px; color: var(--text); }

/* Limitations */
.limitations-block { margin-top: 8px; margin-bottom: 28px; }
.limits-label { font-family: var(--mono); font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--text-soft); margin-bottom: 10px; }
.limits-list  { list-style: none; padding: 0; }
.limits-list li { display: flex; gap: 10px; font-size: 13px; color: var(--text-soft); line-height: 1.65; margin-bottom: 6px; }
.limits-list li::before { content: '—'; opacity: 0.4; flex-shrink: 0; }

/* Prev / Next */
.feature-nav { display: flex; gap: 10px; margin-top: 40px; padding-top: 24px; border-top: 1px solid var(--border); }
.feature-nav-btn { flex: 1; padding: 14px 18px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; transition: border-color 0.15s, background 0.15s; display: flex; align-items: center; gap: 12px; }
.feature-nav-btn:hover { background: var(--bg-hover); border-color: var(--text-soft); }
.feature-nav-btn.next { justify-content: flex-end; text-align: right; }
.nav-btn-arrow { font-size: 16px; color: var(--text-soft); flex-shrink: 0; }
.nav-btn-label { font-family: var(--mono); font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-soft); }
.nav-btn-title { font-size: 13px; font-weight: 600; color: var(--text); margin-top: 2px; }

/* Search overlay */
#sresults { position: fixed; top: 46px; right: 20px; width: 340px; max-height: 400px; overflow-y: auto; background: var(--bg-sidebar); border: 1px solid var(--border); border-radius: 8px; z-index: 100; box-shadow: 0 8px 32px rgba(0,0,0,0.6); display: none; }
#sresults.visible { display: block; }
.sr-item { padding: 10px 16px; cursor: pointer; border-bottom: 1px solid var(--border-soft); transition: background 0.1s; }
.sr-item:last-child { border-bottom: none; }
.sr-item:hover { background: var(--bg-hover); }
.sr-title   { font-size: 13px; font-weight: 600; color: var(--text); }
.sr-domain  { font-family: var(--mono); font-size: 10px; color: var(--text-soft); margin-top: 2px; }
.sr-snippet { font-size: 12px; color: var(--text-mid); margin-top: 4px; line-height: 1.5; }
.sr-empty   { padding: 20px 16px; font-size: 13px; color: var(--text-soft); }
mark { background: rgba(196,162,85,0.25); color: var(--text); border-radius: 2px; padding: 0 2px; }

/* Skipped notice */
.skipped-notice { margin-top: 32px; padding: 14px 18px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; font-size: 12px; color: var(--text-soft); line-height: 1.7; }
.skipped-notice strong { color: var(--text-mid); }
</style>
</head>
<body>
<div class="shell">

  <div class="topbar">
    <span class="topbar-brand">lac·guide</span>
    <span class="topbar-sep">/</span>
    <span class="topbar-title">${esc(projectName)}</span>
    <div class="topbar-right">
      <span class="topbar-count">${pages.length} features</span>
      <div class="search-wrap">
        <svg class="search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="gsearch" placeholder="Search guide…" autocomplete="off" spellcheck="false">
      </div>
    </div>
  </div>

  <div class="body-row">
    <div class="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-label">User Guide</div>
        <div class="sidebar-sub">${esc(projectName)}</div>
      </div>
      <nav class="nav-tree">
        <div class="nav-item active" data-id="home" onclick="showPage('home')" style="border-left-color:var(--accent);background:var(--bg-active);margin-bottom:6px">
          <span class="nav-item-name" style="color:var(--text)">Overview</span>
        </div>
        ${navGroupsHtml}
      </nav>
    </div>

    <main class="content" id="content">

      <!-- Home page -->
      <div id="page-home" class="home-page">
        <div class="home-eyebrow">user guide</div>
        <div class="home-title">${esc(projectName)}</div>
        <div class="home-sub">How to use every user-facing feature — generated from <code style="font-size:13px">feature.json</code> files.</div>
        <div class="stat-row">
          ${statCardsHtml}
        </div>
        <div class="section-title">All features</div>
        <div class="toc-grid">
          ${tocCardsHtml}
        </div>
        ${skippedCount > 0 ? `<div class="skipped-notice"><strong>${skippedCount} feature${skippedCount !== 1 ? "s" : ""}</strong> omitted — they have an empty <code>userGuide</code> field, meaning they are intentionally internal / not user-facing.</div>` : ""}
      </div>

      <!-- Feature pages -->
      ${featurePagesHtml}

    </main>
  </div>
</div>

<div id="sresults"></div>

<script>
const SEARCH_DATA = ${searchData};

function showPage(id) {
  document.querySelectorAll('.feature-page, .home-page').forEach(p => p.classList.add('hidden'));
  const page = document.getElementById('page-' + id);
  if (page) { page.classList.remove('hidden'); document.getElementById('content').scrollTop = 0; }
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.id === id));
  var hash = '#' + id;
  if (window.location.hash !== hash) { history.replaceState(null, '', hash); }
}
// init
document.querySelectorAll('.feature-page').forEach(p => p.classList.add('hidden'));
// Navigate to feature on page load if hash is present
(function() {
  var hash = window.location.hash.slice(1);
  if (hash) { showPage(hash); }
})();
// Click delegation — catch clicks on any element with data-id (nav items, TOC cards, search results)
document.addEventListener('click', function(e) {
  var el = e.target.closest('[data-id]');
  if (!el) return;
  var id = el.dataset.id;
  if (!id) return;
  e.preventDefault();
  showPage(id);
  history.pushState(null, '', '#' + id);
  gsearch.value = '';
  sresults.classList.remove('visible');
});
// Browser back/forward navigation
window.addEventListener('popstate', function() {
  var hash = window.location.hash.slice(1);
  showPage(hash || 'home');
});

const gsearch  = document.getElementById('gsearch');
const sresults = document.getElementById('sresults');

function strip(html) {
  const d = document.createElement('div'); d.innerHTML = html; return d.textContent || '';
}

// Simple case-insensitive highlight — avoids regex with special chars in query
function hlText(s, q) {
  var qi = s.toLowerCase().indexOf(q);
  if (qi < 0) return s;
  return s.slice(0, qi) + '<mark>' + s.slice(qi, qi + q.length) + '</mark>' + hlText(s.slice(qi + q.length), q);
}

gsearch.addEventListener('input', () => {
  const q = gsearch.value.trim().toLowerCase();
  if (!q) { sresults.classList.remove('visible'); return; }
  const matches = SEARCH_DATA.filter(f => {
    return [f.title, f.domain, f.guide, ...(f.tags||[])].join(' ').toLowerCase().includes(q);
  });
  if (!matches.length) {
    sresults.innerHTML = '<div class="sr-empty">No results</div>';
  } else {
    sresults.innerHTML = matches.map(f => {
      const snip = strip(f.guide).slice(0, 90) + (f.guide.length > 90 ? '\u2026' : '');
      return '<div class="sr-item" data-id="' + f.id + '">'
        + '<div class="sr-title">'   + hlText(f.title, q) + '</div>'
        + '<div class="sr-domain">'  + hlText(f.domain.replace(/-/g,' '), q) + ' \u00b7 ' + f.status + '</div>'
        + '<div class="sr-snippet">' + hlText(snip, q) + '</div>'
        + '</div>';
    }).join('');
  }
  sresults.classList.add('visible');
});
document.addEventListener('click', e => {
  if (!gsearch.contains(e.target) && !sresults.contains(e.target)) sresults.classList.remove('visible');
});
gsearch.addEventListener('keydown', e => {
  if (e.key === 'Escape') { gsearch.value = ''; sresults.classList.remove('visible'); }
});
</script>
</body>
</html>`;
}

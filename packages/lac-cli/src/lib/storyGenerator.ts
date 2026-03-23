import type { Feature } from "@life-as-code/feature-schema";

export function generateStory(features: Feature[], projectName: string): string {
  function esc(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Convert basic markdown to safe HTML. Handles headers, bold, italic, code, bullets, paragraphs. */
  function mdToHtml(raw: string): string {
    function escLine(s: string): string {
      return s
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }
    function inline(s: string): string {
      return escLine(s)
        .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
        .replace(/_([^_\n]+?)_/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
    }

    const blocks = raw.split(/\n{2,}/)
    const out: string[] = []

    for (const block of blocks) {
      const lines = block.split('\n')
      const first = lines[0]?.trim() ?? ''

      if (/^#{3,}\s/.test(first)) {
        out.push(`<h5 class="md-h">${inline(first.replace(/^#+\s+/, ''))}</h5>`)
        if (lines.length > 1) out.push(`<p class="md-p">${lines.slice(1).map(l => inline(l.trim())).join(' ')}</p>`)
      } else if (/^#{2}\s/.test(first)) {
        out.push(`<h4 class="md-h">${inline(first.replace(/^##\s+/, ''))}</h4>`)
        if (lines.length > 1) out.push(`<p class="md-p">${lines.slice(1).map(l => inline(l.trim())).join(' ')}</p>`)
      } else if (/^#\s/.test(first)) {
        out.push(`<h3 class="md-h">${inline(first.replace(/^#\s+/, ''))}</h3>`)
      } else if (lines.every(l => /^\s*[-*]\s/.test(l))) {
        out.push(`<ul class="md-ul">${lines.map(l => `<li>${inline(l.replace(/^\s*[-*]\s/, '').trim())}</li>`).join('')}</ul>`)
      } else {
        // Mixed: collect leading bullets, rest as paragraph
        const items: string[] = []
        const rest: string[] = []
        let inList = true
        for (const l of lines) {
          if (inList && /^\s*[-*]\s/.test(l)) {
            items.push(`<li>${inline(l.replace(/^\s*[-*]\s/, '').trim())}</li>`)
          } else { inList = false; rest.push(l) }
        }
        if (items.length) out.push(`<ul class="md-ul">${items.join('')}</ul>`)
        if (rest.length) out.push(`<p class="md-p">${rest.map(l => inline(l.trim())).filter(Boolean).join(' ')}</p>`)
      }
    }

    return out.join('\n')
  }

  function statusColor(status: string): string {
    switch (status) {
      case "active": return "var(--status-active)";
      case "frozen": return "var(--status-frozen)";
      case "deprecated": return "var(--status-deprecated)";
      default: return "var(--status-draft)";
    }
  }

  // ── Gather metadata ──
  const domains = [...new Set(features.map((f) => f.domain).filter(Boolean))] as string[];

  // Count features per domain, sort by count descending
  const domainCounts: Record<string, number> = {};
  for (const f of features) {
    if (f.domain) domainCounts[f.domain] = (domainCounts[f.domain] ?? 0) + 1;
  }
  const sortedDomains = [...domains].sort((a, b) => (domainCounts[b] ?? 0) - (domainCounts[a] ?? 0));

  const totalFeatures = features.length;
  const frozenFeatures = features.filter((f) => f.status === "frozen");
  const draftFeatures = features.filter((f) => f.status === "draft");
  const activeFeatures = features.filter((f) => f.status === "active");

  // Top problem themes: extract first sentence/phrase from problem fields
  const problemThemes = features
    .map((f) => f.problem ?? "")
    .filter(Boolean)
    .slice(0, 3)
    .map((p) => {
      const sentence = p.split(/[.!?]/)[0]?.trim() ?? p;
      return sentence.length > 80 ? sentence.slice(0, 80) + "…" : sentence;
    });

  // Executive summary prose
  const domainList =
    sortedDomains.length > 1
      ? sortedDomains.slice(0, -1).join(", ") + " and " + sortedDomains[sortedDomains.length - 1]
      : sortedDomains[0] ?? "multiple areas";

  const summaryProse =
    `${projectName} is a system built around ${totalFeatures} feature${totalFeatures !== 1 ? "s" : ""} ` +
    `spanning ${sortedDomains.length} domain${sortedDomains.length !== 1 ? "s" : ""}: ${domainList}. ` +
    (problemThemes.length > 0
      ? `It addresses challenges including: ${problemThemes.join("; ")}.`
      : "");

  // ── Word count & reading time ──
  function countWords(s: string): number {
    return s.trim().split(/\s+/).filter(Boolean).length;
  }

  // Estimate total word count from all rendered prose fields
  let totalWords = countWords(summaryProse);
  for (const f of features) {
    if (f.problem) totalWords += countWords(f.problem);
    if (f.implementation) totalWords += countWords(f.implementation);
    if (f.decisions) {
      for (const d of f.decisions) {
        totalWords += countWords(d.decision ?? "");
        totalWords += countWords(d.rationale ?? "");
      }
    }
    if (f.knownLimitations) {
      for (const l of f.knownLimitations) totalWords += countWords(l);
    }
  }
  const readingMinutes = Math.max(1, Math.round(totalWords / 200));
  const readingLabel = `${readingMinutes} min read`;

  // ── Build domain chapters ──
  let chapterCounter = 0;

  function featureArticle(f: Feature, featureGlobalIdx: number): string {
    const implText = f.implementation ?? "";
    const isLong = implText.length > 400;
    const implShort = isLong ? mdToHtml(implText.slice(0, 400)) + '<span class="impl-ellipsis">…</span>' : mdToHtml(implText);
    const implFull = mdToHtml(implText);
    const implId = `impl-${featureGlobalIdx}`;

    const decisionsHtml =
      f.decisions && f.decisions.length > 0
        ? `<div class="decisions-block">
            ${f.decisions
              .map(
                (d) =>
                  `<blockquote class="pull-quote">
                    <div class="pull-quote-text">&#10077; ${esc(d.decision ?? "")}</div>
                    ${d.rationale ? `<div class="pull-quote-rationale">— ${esc(d.rationale)}</div>` : ""}
                    <div class="pull-quote-mark">&#10078;</div>
                  </blockquote>`
              )
              .join("")}
          </div>`
        : "";

    const limitationsHtml =
      f.knownLimitations && f.knownLimitations.length > 0
        ? `<aside class="caveats-box">
            <div class="caveats-label">Caveats</div>
            <ul class="caveats-list">
              ${f.knownLimitations.map((l) => `<li>${esc(l)}</li>`).join("")}
            </ul>
          </aside>`
        : "";

    const implHtml = implText
      ? `<div class="feature-section-label">How it was solved</div>
         <div class="impl-wrap" id="${implId}">
           <div class="impl-text">
             ${isLong
               ? `<span class="impl-short">${implShort}</span><span class="impl-full" style="display:none;">${implFull}</span>`
               : `<span class="impl-full">${implFull}</span>`
             }
           </div>
           ${isLong
             ? `<button class="read-more-btn" onclick="toggleImpl('${implId}')">Read more ▾</button>`
             : ""
           }
         </div>`
      : "";

    const problemHtml = f.problem
      ? `<div class="feature-section-label">The problem it solves</div>
         <div class="feature-problem">${mdToHtml(f.problem)}</div>`
      : "";

    return `<article class="feature-article">
      <div class="feature-headline">
        <h3 class="feature-title">${esc(f.title)}</h3>
        <span class="status-badge" style="color:${statusColor(f.status)};border-color:${statusColor(f.status)}44;background:${statusColor(f.status)}18;">${f.status}</span>
      </div>
      <div class="feature-key-label">${esc(f.featureKey)}</div>
      ${problemHtml}
      ${implHtml}
      ${decisionsHtml}
      ${limitationsHtml}
    </article>`;
  }

  const chaptersHtml = sortedDomains
    .map((domain) => {
      chapterCounter++;
      const domainFeatures = features
        .filter((f) => f.domain === domain)
        .sort((a, b) => {
          const order: Record<string, number> = { active: 0, frozen: 1, draft: 2, deprecated: 3 };
          return (order[a.status] ?? 4) - (order[b.status] ?? 4);
        });

      const articles = domainFeatures
        .map((f) => {
          const globalIdx = features.indexOf(f);
          return featureArticle(f, globalIdx);
        })
        .join("\n");

      return `<section class="domain-chapter" id="chapter-${chapterCounter}">
        <div class="chapter-number">Chapter ${chapterCounter}</div>
        <h2 class="chapter-title">${esc(domain)}</h2>
        <div class="chapter-meta">${domainFeatures.length} feature${domainFeatures.length !== 1 ? "s" : ""}</div>
        ${articles}
      </section>`;
    })
    .join("\n");

  // Features with no domain
  const noDomainFeatures = features.filter((f) => !f.domain);
  const noDomainChapter =
    noDomainFeatures.length > 0
      ? `<section class="domain-chapter" id="chapter-unclassified">
          <div class="chapter-number">Unclassified</div>
          <h2 class="chapter-title">Unclassified</h2>
          <div class="chapter-meta">${noDomainFeatures.length} feature${noDomainFeatures.length !== 1 ? "s" : ""}</div>
          ${noDomainFeatures.map((f, i) => featureArticle(f, features.length + i)).join("\n")}
        </section>`
      : "";

  // ── Closing / Roadmap teaser ──
  const roadmapHtml =
    draftFeatures.length > 0
      ? `<section class="domain-chapter closing-chapter" id="chapter-roadmap">
          <div class="chapter-number">What's next</div>
          <h2 class="chapter-title" style="color:var(--text-mid);">In progress</h2>
          <div class="chapter-meta">${draftFeatures.length} feature${draftFeatures.length !== 1 ? "s" : ""} in draft</div>
          <div class="roadmap-list">
            ${draftFeatures
              .map(
                (f) =>
                  `<div class="roadmap-item">
                    <span class="roadmap-key">${esc(f.featureKey)}</span>
                    <span class="roadmap-title">${esc(f.title)}</span>
                    ${f.problem
                      ? `<span class="roadmap-problem">${esc(f.problem.slice(0, 80))}${f.problem.length > 80 ? "…" : ""}</span>`
                      : ""}
                  </div>`
              )
              .join("")}
          </div>
        </section>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)} · Product Story</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#12100e;--bg-card:#1a1714;--bg-hover:#201d1a;--bg-sidebar:#0e0c0a;
  --border:#2a2420;--border-soft:#221e1b;
  --text:#e8ddd4;--text-mid:#b0a49c;--text-soft:#7a6a5a;
  --accent:#c4a255;
  --mono:'Cascadia Code','Fira Code','JetBrains Mono','Consolas',monospace;
  --sans:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  --status-active:#4aad72;--status-draft:#c4a255;--status-frozen:#5b82cc;--status-deprecated:#cc5b5b;
}
html{scroll-behavior:smooth;}
body{
  background:var(--bg);color:var(--text);
  font-family:Georgia,'Times New Roman',serif;
  -webkit-font-smoothing:antialiased;
  line-height:1.75;font-size:1rem;
}

/* ── Topbar ── */
#topbar{
  position:fixed;top:0;left:0;right:0;height:48px;
  background:var(--bg-sidebar);border-bottom:1px solid var(--border);
  display:flex;align-items:center;gap:0;
  padding:0 20px;z-index:200;
}
#topbar-brand{
  font-family:var(--mono);font-size:0.82rem;color:var(--accent);
  white-space:nowrap;margin-right:20px;
}
#topbar-project{
  font-family:var(--sans);font-size:0.82rem;color:var(--text-mid);
  white-space:nowrap;flex:1;overflow:hidden;text-overflow:ellipsis;
}
#topbar-right{
  display:flex;align-items:center;gap:16px;flex-shrink:0;
}
#reading-time{
  font-family:var(--mono);font-size:0.72rem;color:var(--text-soft);
  white-space:nowrap;
}
#print-btn{
  padding:4px 14px;border-radius:6px;
  border:1px solid var(--border);
  background:transparent;color:var(--text-soft);
  font-family:var(--mono);font-size:0.72rem;
  cursor:pointer;transition:all 0.15s;
  white-space:nowrap;
}
#print-btn:hover{border-color:var(--accent);color:var(--accent);}

/* ── Reading column ── */
#content{
  margin-top:48px;
  padding:60px 20px 120px;
}
.reading-col{
  max-width:720px;
  margin:0 auto;
}

/* ── Opening section ── */
.opening-section{
  margin-bottom:64px;
}
.opening-eyebrow{
  font-family:var(--mono);font-size:0.7rem;letter-spacing:0.15em;
  text-transform:uppercase;color:var(--text-soft);
  margin-bottom:20px;
}
.opening-title{
  font-family:var(--sans);font-size:2.6rem;font-weight:800;
  color:var(--text);letter-spacing:-0.02em;line-height:1.1;
  margin-bottom:24px;
}
.opening-summary{
  font-size:1.1rem;color:var(--text-mid);line-height:1.8;
  margin-bottom:32px;
}
.stats-row{
  display:flex;flex-wrap:wrap;gap:12px;
  padding:20px;border-radius:10px;
  background:var(--bg-card);border:1px solid var(--border);
}
.stat-item{
  display:flex;flex-direction:column;
  padding:0 16px;border-right:1px solid var(--border-soft);
}
.stat-item:last-child{border-right:none;}
.stat-num{
  font-family:var(--mono);font-size:1.4rem;font-weight:700;
  color:var(--accent);line-height:1;
}
.stat-label{
  font-family:var(--sans);font-size:0.72rem;color:var(--text-soft);
  margin-top:4px;
}

/* ── Domain chapters ── */
.domain-chapter{
  margin-bottom:80px;
  padding-top:48px;
  border-top:1px solid var(--border);
}
.domain-chapter:first-of-type{border-top:none;}
.chapter-number{
  font-family:var(--mono);font-size:0.68rem;letter-spacing:0.18em;
  text-transform:uppercase;color:var(--text-soft);
  margin-bottom:8px;
}
.chapter-title{
  font-family:var(--sans);font-size:2rem;font-weight:700;
  color:var(--accent);letter-spacing:-0.01em;line-height:1.15;
  margin-bottom:6px;
}
.chapter-meta{
  font-family:var(--mono);font-size:0.72rem;color:var(--text-soft);
  margin-bottom:40px;
}

/* ── Feature articles ── */
.feature-article{
  margin-bottom:52px;
  padding-bottom:52px;
  border-bottom:1px solid var(--border-soft);
}
.feature-article:last-child{border-bottom:none;}
.feature-headline{
  display:flex;align-items:flex-start;gap:12px;
  margin-bottom:6px;
  flex-wrap:wrap;
}
.feature-title{
  font-family:var(--sans);font-size:1.35rem;font-weight:700;
  color:var(--text);letter-spacing:-0.01em;line-height:1.3;
}
.status-badge{
  display:inline-block;
  padding:2px 10px;border-radius:999px;
  font-family:var(--mono);font-size:0.68rem;
  border:1px solid;
  white-space:nowrap;margin-top:4px;
  flex-shrink:0;
}
.feature-key-label{
  font-family:var(--mono);font-size:0.72rem;color:var(--text-soft);
  margin-bottom:20px;
  letter-spacing:0.04em;
}
.feature-section-label{
  font-family:var(--sans);font-size:0.72rem;font-weight:600;
  letter-spacing:0.1em;text-transform:uppercase;
  color:var(--text-soft);margin-bottom:10px;margin-top:24px;
}
.feature-problem{
  font-size:1rem;color:var(--text-mid);line-height:1.75;
}

/* ── Markdown rendered content ── */
.md-p{margin:0 0 0.75em;line-height:1.75;}
.md-p:last-child{margin-bottom:0;}
.md-h{font-family:var(--mono);font-size:0.78rem;letter-spacing:0.08em;text-transform:uppercase;
  color:var(--accent);margin:1.2em 0 0.4em;}
.md-ul{margin:0.4em 0 0.75em 1.2em;padding:0;}
.md-ul li{margin-bottom:0.3em;line-height:1.65;}
.md-ul li code,.md-p code,.impl-text code{
  font-family:var(--mono);font-size:0.82em;
  background:rgba(196,162,85,0.1);border:1px solid rgba(196,162,85,0.2);
  padding:1px 5px;border-radius:3px;color:var(--accent);
}

/* ── Implementation expand ── */
.impl-wrap{margin-top:0;}
.impl-text{
  font-size:0.92rem;color:var(--text-soft);line-height:1.7;
}
.read-more-btn{
  display:inline-block;margin-top:8px;
  background:none;border:none;
  color:var(--accent);font-family:var(--mono);font-size:0.75rem;
  cursor:pointer;padding:0;
  transition:opacity 0.15s;
}
.read-more-btn:hover{opacity:0.7;}

/* ── Pull quotes ── */
.decisions-block{margin-top:28px;}
.pull-quote{
  margin:16px 0;
  padding:18px 22px;
  border-left:3px solid var(--accent);
  background:var(--bg-card);
  border-radius:0 8px 8px 0;
  position:relative;
}
.pull-quote-text{
  font-size:1rem;color:var(--text);
  font-style:italic;line-height:1.65;
  margin-bottom:8px;
}
.pull-quote-rationale{
  font-family:var(--sans);font-size:0.82rem;color:var(--text-soft);
  font-style:normal;
}
.pull-quote-mark{
  position:absolute;bottom:12px;right:18px;
  font-size:1.5rem;color:var(--accent);opacity:0.25;
  line-height:1;
}

/* ── Caveats box ── */
.caveats-box{
  margin-top:24px;
  padding:14px 18px;
  border-left:3px solid rgba(196,162,85,0.5);
  background:rgba(196,162,85,0.06);
  border-radius:0 8px 8px 0;
}
.caveats-label{
  font-family:var(--sans);font-size:0.68rem;font-weight:700;
  letter-spacing:0.12em;text-transform:uppercase;
  color:var(--accent);margin-bottom:8px;opacity:0.8;
}
.caveats-list{
  list-style:disc;padding-left:18px;
  font-size:0.88rem;color:var(--text-soft);line-height:1.65;
}
.caveats-list li{margin-bottom:4px;}

/* ── Roadmap / closing ── */
.closing-chapter .chapter-title{color:var(--text-mid);}
.roadmap-list{display:flex;flex-direction:column;gap:12px;}
.roadmap-item{
  display:grid;
  grid-template-columns:auto 1fr;
  grid-template-rows:auto auto;
  column-gap:14px;row-gap:2px;
  padding:14px 16px;
  background:var(--bg-card);border:1px solid var(--border);
  border-radius:8px;
}
.roadmap-key{
  font-family:var(--mono);font-size:0.72rem;color:var(--text-soft);
  grid-column:1;grid-row:1;
  white-space:nowrap;
}
.roadmap-title{
  font-family:var(--sans);font-size:0.92rem;font-weight:600;color:var(--text-mid);
  grid-column:2;grid-row:1;
}
.roadmap-problem{
  font-size:0.8rem;color:var(--text-soft);
  grid-column:2;grid-row:2;
  font-style:italic;
}

/* ── Print styles ── */
@media print{
  #topbar{display:none!important;}
  #content{margin-top:0;padding:32px;}
  body{background:#fff;color:#111;font-size:11pt;}
  .domain-chapter{page-break-before:always;}
  .domain-chapter:first-of-type{page-break-before:avoid;}
  .opening-section{page-break-before:avoid;}
  .pull-quote{border-left:2px solid #333;background:#f9f9f9;}
  .pull-quote-text{color:#222;}
  .pull-quote-rationale{color:#555;}
  .caveats-box{border-left:2px solid #c4a255;background:#fffbf2;}
  .caveats-label{color:#8a6e2a;}
  .caveats-list{color:#444;}
  .chapter-title{color:#7a5a20;}
  .feature-title{color:#111;}
  .opening-title{color:#111;}
  .opening-summary{color:#333;}
  .stat-num{color:#7a5a20;}
  .stats-row{background:#f5f3ee;border:1px solid #ddd;}
  .roadmap-item{background:#f9f9f9;border:1px solid #ddd;}
  .read-more-btn{display:none!important;}
  .impl-full{display:inline!important;}
  .impl-short{display:none!important;}
}
</style>
</head>
<body>

<!-- Topbar -->
<div id="topbar">
  <div id="topbar-brand">◈ lac · story</div>
  <div id="topbar-project">${esc(projectName)}</div>
  <div id="topbar-right">
    <div id="reading-time">${esc(readingLabel)} · ${totalWords.toLocaleString()} words</div>
    <button id="print-btn" onclick="window.print()">⎙ Print</button>
  </div>
</div>

<!-- Content -->
<div id="content">
  <div class="reading-col">

    <!-- Opening / Executive Summary -->
    <section class="opening-section">
      <div class="opening-eyebrow">Life as Code · Product Story</div>
      <h1 class="opening-title">${esc(projectName)}</h1>
      <p class="opening-summary">${esc(summaryProse)}</p>
      <div class="stats-row">
        <div class="stat-item">
          <div class="stat-num">${totalFeatures}</div>
          <div class="stat-label">Total features</div>
        </div>
        <div class="stat-item">
          <div class="stat-num">${frozenFeatures.length}</div>
          <div class="stat-label">Frozen (shipped)</div>
        </div>
        <div class="stat-item">
          <div class="stat-num">${activeFeatures.length}</div>
          <div class="stat-label">Active (in progress)</div>
        </div>
        <div class="stat-item">
          <div class="stat-num">${draftFeatures.length}</div>
          <div class="stat-label">Draft (planned)</div>
        </div>
        <div class="stat-item">
          <div class="stat-num">${sortedDomains.length}</div>
          <div class="stat-label">Domain${sortedDomains.length !== 1 ? "s" : ""}</div>
        </div>
      </div>
    </section>

    <!-- Domain chapters -->
    ${chaptersHtml}
    ${noDomainChapter}

    <!-- Closing / Roadmap -->
    ${roadmapHtml}

  </div>
</div>

<script>
(function(){
  window.toggleImpl = function(id){
    var wrap = document.getElementById(id);
    if(!wrap) return;
    var shortEl = wrap.querySelector('.impl-short');
    var fullEl = wrap.querySelector('.impl-full');
    var btn = wrap.querySelector('.read-more-btn');
    if(!fullEl || !btn) return;

    if(fullEl.style.display === 'none'){
      // Expand
      fullEl.style.display = 'inline';
      if(shortEl) shortEl.style.display = 'none';
      btn.textContent = 'Read less \u25b4';
    } else {
      // Collapse
      fullEl.style.display = 'none';
      if(shortEl) shortEl.style.display = 'inline';
      btn.textContent = 'Read more \u25be';
    }
  };
})();
</script>
</body>
</html>`;
}

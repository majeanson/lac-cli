import type { Feature } from "@life-as-code/feature-schema";

export function generateSlides(
  features: Feature[],
  projectName: string,
  viewLabel?: string
): string {
  // Sort: priority 1 first, undefined last, then by featureKey
  const sorted = [...features].sort((a, b) => {
    const pa = a.priority ?? Infinity;
    const pb = b.priority ?? Infinity;
    if (pa !== pb) return pa - pb;
    return a.featureKey.localeCompare(b.featureKey);
  });

  const totalSlides = sorted.length + 1; // +1 for title slide

  // Gather metadata for title slide
  const domains = [...new Set(sorted.map((f) => f.domain).filter(Boolean))].sort() as string[];
  const statusCounts: Record<string, number> = { draft: 0, active: 0, frozen: 0, deprecated: 0 };
  for (const f of sorted) {
    if (f.status in statusCounts) statusCounts[f.status]++;
  }

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  function esc(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function statusColor(status: string): string {
    switch (status) {
      case "active": return "var(--status-active)";
      case "frozen": return "var(--status-frozen)";
      case "deprecated": return "var(--status-deprecated)";
      default: return "var(--status-draft)";
    }
  }

  function statusBgColor(status: string): string {
    switch (status) {
      case "active": return "var(--status-active-bg)";
      case "frozen": return "var(--status-frozen-bg)";
      case "deprecated": return "var(--status-deprecated-bg)";
      default: return "var(--status-draft-bg)";
    }
  }

  function completeness(f: Feature): number {
    const checks = [
      !!f.analysis,
      !!f.implementation,
      !!(f.decisions && f.decisions.length),
      !!f.successCriteria,
      !!(f.knownLimitations && f.knownLimitations.length),
      !!(f.tags && f.tags.length),
      !!f.domain,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }

  // Build title slide HTML
  const domainPills = domains
    .map(
      (d) =>
        `<span style="display:inline-block;padding:2px 10px;border-radius:999px;border:1px solid var(--border);font-size:0.72rem;font-family:var(--mono);color:var(--text-mid);margin:3px 2px;">${esc(d)}</span>`
    )
    .join("");

  const statusBreakdown = Object.entries(statusCounts)
    .filter(([, count]) => count > 0)
    .map(
      ([status, count]) =>
        `<span style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:6px;background:${statusBgColor(status)};border:1px solid ${statusColor(status)}33;font-size:0.78rem;margin:4px;">` +
        `<span style="width:7px;height:7px;border-radius:50%;background:${statusColor(status)};display:inline-block;"></span>` +
        `<span style="color:${statusColor(status)};font-family:var(--mono);">${count} ${status}</span></span>`
    )
    .join("");

  const subtitleText = `${features.length} feature${features.length !== 1 ? "s" : ""}${viewLabel ? " · " + viewLabel + " view" : ""}`;

  const titleSlide = `
    <div class="slide" id="slide-0" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:60px 40px;">
      <div style="font-family:var(--mono);font-size:0.75rem;color:var(--text-soft);letter-spacing:0.12em;text-transform:uppercase;margin-bottom:28px;">Life as Code · Feature Deck</div>
      <div style="font-size:3rem;font-weight:800;color:var(--text);letter-spacing:-0.02em;line-height:1.1;margin-bottom:16px;">◈ ${esc(projectName)}</div>
      <div style="font-family:var(--mono);font-size:0.9rem;color:var(--accent);margin-bottom:8px;">${esc(subtitleText)}</div>
      <div style="font-size:0.8rem;color:var(--text-soft);margin-bottom:40px;">${esc(today)}</div>
      ${domains.length > 0 ? `<div style="margin-bottom:24px;max-width:600px;">${domainPills}</div>` : ""}
      <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:0;">${statusBreakdown}</div>
      <div style="position:absolute;bottom:40px;left:50%;transform:translateX(-50%);font-size:0.72rem;color:var(--text-soft);font-family:var(--mono);">Press → or Space to begin</div>
    </div>`;

  // Build feature slides
  const featureSlides = sorted
    .map((feature, idx) => {
      const slideNum = idx + 1;
      const comp = completeness(feature);
      const decisions = (feature.decisions ?? []).slice(0, 3);
      const tags = feature.tags ?? [];

      const domainBadge = feature.domain
        ? `<span style="padding:3px 10px;border-radius:999px;background:var(--bg-hover);border:1px solid var(--border);font-size:0.7rem;font-family:var(--mono);color:var(--text-mid);">${esc(feature.domain)}</span>`
        : "";

      const statusBadge = `<span style="padding:3px 10px;border-radius:999px;background:${statusBgColor(feature.status)};border:1px solid ${statusColor(feature.status)}44;font-size:0.7rem;font-family:var(--mono);color:${statusColor(feature.status)};">${feature.status}</span>`;

      const decisionsHtml =
        decisions.length > 0
          ? `<div style="margin-top:28px;">
              <div style="font-family:var(--mono);font-size:0.65rem;letter-spacing:0.15em;text-transform:uppercase;color:var(--text-soft);margin-bottom:10px;">Decisions</div>
              ${decisions
                .map(
                  (d) =>
                    `<div style="font-size:0.88rem;color:var(--text-mid);margin-bottom:7px;padding-left:14px;position:relative;">` +
                    `<span style="position:absolute;left:0;color:var(--accent);">—</span>${esc(d.decision)}</div>`
                )
                .join("")}
            </div>`
          : "";

      const tagPills =
        tags.length > 0
          ? tags
              .map(
                (t) =>
                  `<span style="display:inline-block;padding:2px 9px;border-radius:999px;background:var(--bg-hover);border:1px solid var(--border);font-size:0.68rem;font-family:var(--mono);color:var(--text-soft);margin-right:5px;">${esc(t)}</span>`
              )
              .join("")
          : "";

      const priorityChip =
        feature.priority != null
          ? `<span style="padding:2px 9px;border-radius:999px;background:rgba(196,162,85,0.12);border:1px solid rgba(196,162,85,0.3);font-size:0.68rem;font-family:var(--mono);color:var(--accent);">P${feature.priority}</span>`
          : "";

      const completenessBar = `
        <div style="display:flex;align-items:center;gap:8px;margin-left:auto;">
          <div style="width:80px;height:3px;border-radius:2px;background:var(--border);overflow:hidden;">
            <div style="width:${comp}%;height:100%;background:var(--accent);border-radius:2px;transition:width 0.3s;"></div>
          </div>
          <span style="font-family:var(--mono);font-size:0.65rem;color:var(--text-soft);">${comp}%</span>
        </div>`;

      const problemText = feature.problem ?? "";

      return `
    <div class="slide" id="slide-${slideNum}">
      <!-- Slide counter (top-left) -->
      <div style="position:absolute;top:24px;left:32px;font-family:var(--mono);font-size:0.7rem;color:var(--text-soft);">${slideNum} / ${sorted.length}</div>
      <!-- Badges (top-right) -->
      <div style="position:absolute;top:20px;right:32px;display:flex;gap:8px;align-items:center;">${statusBadge}${domainBadge}</div>

      <!-- Main content -->
      <div style="width:100%;max-width:760px;margin:0 auto;padding:60px 20px 40px;">
        <!-- Feature key -->
        <div style="font-family:var(--mono);font-size:0.78rem;color:var(--accent);letter-spacing:0.05em;margin-bottom:10px;">${esc(feature.featureKey)}</div>
        <!-- Title -->
        <h2 style="font-size:2.25rem;font-weight:700;color:var(--text);margin:0 0 24px;line-height:1.15;letter-spacing:-0.02em;">${esc(feature.title)}</h2>
        <!-- Problem -->
        <div style="font-size:1.1rem;color:var(--text-mid);line-height:1.6;padding-left:16px;border-left:3px solid var(--accent);opacity:0.9;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${esc(problemText)}</div>

        ${decisionsHtml}

        <!-- Bottom row -->
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:36px;padding-top:16px;border-top:1px solid var(--border-soft);">
          <div style="display:flex;flex-wrap:wrap;gap:5px;flex:1;">${tagPills}${priorityChip}</div>
          ${completenessBar}
        </div>
      </div>
    </div>`;
    })
    .join("\n");

  // Serialize features for JS (not needed at runtime for slides, but useful for future)
  const featuresJson = JSON.stringify(sorted);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)} · Feature Slides</title>
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
  --status-active-bg:rgba(74,173,114,0.12);--status-draft-bg:rgba(196,162,85,0.12);
  --status-frozen-bg:rgba(91,130,204,0.12);--status-deprecated-bg:rgba(204,91,91,0.12);
}
html,body{
  width:100%;height:100%;overflow:hidden;
  background:var(--bg);color:var(--text);
  font-family:var(--sans);-webkit-font-smoothing:antialiased;
}

/* Slide container: clips to viewport */
#deck{
  position:relative;
  width:100vw;height:100vh;
  overflow:hidden;
}

/* Individual slides: absolute, stacked, transform drives visibility */
.slide{
  position:absolute;
  top:0;left:0;
  width:100%;height:100%;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  padding:32px;
  will-change:transform;
  transition:transform 0.3s cubic-bezier(0.4,0,0.2,1);
}

/* Progress bar */
#progress-bar{
  position:fixed;bottom:0;left:0;
  height:3px;
  background:var(--accent);
  transition:width 0.3s ease;
  z-index:100;
  border-radius:0 2px 2px 0;
}

/* Nav arrow buttons */
.nav-btn{
  position:fixed;top:50%;transform:translateY(-50%);
  width:52px;height:52px;
  border-radius:50%;
  background:var(--bg-card);
  border:1px solid var(--border);
  color:var(--text-mid);
  font-size:1.2rem;
  cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  opacity:0;
  transition:opacity 0.2s,background 0.15s,color 0.15s;
  z-index:50;
  user-select:none;
}
.nav-btn:hover{background:var(--bg-hover);color:var(--accent);}
#deck:hover .nav-btn{opacity:1;}
#btn-prev{left:16px;}
#btn-next{right:16px;}
.nav-btn:disabled{opacity:0!important;cursor:default;}

/* Slide counter in corner for title slide */
#slide-indicator{
  position:fixed;bottom:14px;left:50%;transform:translateX(-50%);
  font-family:var(--mono);font-size:0.65rem;color:var(--text-soft);
  z-index:50;
  letter-spacing:0.08em;
}
</style>
</head>
<body>
<div id="deck">
  ${titleSlide}
  ${featureSlides}

  <button class="nav-btn" id="btn-prev" title="Previous slide">&#8592;</button>
  <button class="nav-btn" id="btn-next" title="Next slide">&#8594;</button>
</div>

<div id="progress-bar"></div>
<div id="slide-indicator">1 / ${totalSlides}</div>

<script>
(function(){
  var TOTAL = ${totalSlides};
  var current = 0;

  var slides = [];
  for(var i=0;i<TOTAL;i++){
    slides.push(document.getElementById('slide-'+i));
  }

  var progressBar = document.getElementById('progress-bar');
  var indicator = document.getElementById('slide-indicator');
  var btnPrev = document.getElementById('btn-prev');
  var btnNext = document.getElementById('btn-next');

  // Position all slides: current=0, prev < 0, next > 0
  function layout(){
    for(var i=0;i<slides.length;i++){
      var offset = i - current;
      slides[i].style.transform = 'translateX('+( offset * 100)+'%)';
    }
  }

  function goTo(n){
    if(n < 0) n = 0;
    if(n >= TOTAL) n = TOTAL - 1;
    current = n;
    layout();

    // Progress bar
    var pct = TOTAL <= 1 ? 100 : (current / (TOTAL-1)) * 100;
    progressBar.style.width = pct + '%';

    // Indicator
    indicator.textContent = (current+1) + ' / ' + TOTAL;

    // Button states
    btnPrev.disabled = current === 0;
    btnNext.disabled = current === TOTAL - 1;
  }

  // Init
  layout();
  goTo(0);

  // Keyboard navigation
  document.addEventListener('keydown', function(e){
    switch(e.key){
      case 'ArrowLeft':  goTo(current - 1); break;
      case 'ArrowRight': goTo(current + 1); break;
      case ' ':          e.preventDefault(); goTo(current + 1); break;
      case 'Home':       goTo(0); break;
      case 'End':        goTo(TOTAL - 1); break;
    }
  });

  btnPrev.addEventListener('click', function(){ goTo(current - 1); });
  btnNext.addEventListener('click', function(){ goTo(current + 1); });

  // Touch/swipe support
  var touchStartX = 0;
  document.addEventListener('touchstart', function(e){
    touchStartX = e.touches[0].clientX;
  }, {passive:true});
  document.addEventListener('touchend', function(e){
    var dx = e.changedTouches[0].clientX - touchStartX;
    if(Math.abs(dx) > 50){
      if(dx < 0) goTo(current + 1);
      else goTo(current - 1);
    }
  }, {passive:true});

})();
</script>
</body>
</html>`;
}

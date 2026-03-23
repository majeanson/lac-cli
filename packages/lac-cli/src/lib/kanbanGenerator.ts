/**
 * Kanban generator — exports a read-only Kanban board with columns for each
 * feature status. Cards are filterable by domain and sortable.
 *
 * Static HTML; all CSS + JS inline, zero external dependencies.
 */

import type { Feature } from "@life-as-code/feature-schema";

// ── Helpers ─────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function completeness(f: Feature): number {
  const checks = [
    !!f.analysis,
    !!f.implementation,
    !!(f.decisions && f.decisions.length > 0),
    !!f.successCriteria,
    !!(f.knownLimitations && f.knownLimitations.length > 0),
    !!(f.tags && f.tags.length > 0),
    !!f.domain,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

// ── Public API ───────────────────────────────────────────────────────────────

export function generateKanban(features: Feature[], projectName: string): string {
  const featuresJson = JSON.stringify(features).replace(/<\/script>/gi, "<\\/script>");

  const count = features.length;

  // Collect unique domains for the dropdown
  const domainSet = new Set<string>();
  for (const f of features) {
    if (f.domain) domainSet.add(f.domain);
  }
  const domains = Array.from(domainSet).sort();

  const domainOptions = domains
    .map((d) => `<option value="${esc(d)}">${esc(d)}</option>`)
    .join("\n          ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)} · LAC Kanban</title>
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
  --topbar-h:48px;
  --col-header-h:52px;
}
html,body{
  width:100%;height:100%;overflow:hidden;
  background:var(--bg);color:var(--text);
  font-family:var(--sans);-webkit-font-smoothing:antialiased;
}

/* ── Topbar ── */
#topbar{
  position:fixed;top:0;left:0;right:0;
  height:var(--topbar-h);
  background:rgba(14,12,10,0.94);
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  border-bottom:1px solid var(--border);
  display:flex;align-items:center;
  padding:0 20px;gap:12px;
  z-index:200;user-select:none;flex-shrink:0;
}
#topbar-brand{
  font-family:var(--mono);font-size:0.78rem;color:var(--accent);
  letter-spacing:0.05em;white-space:nowrap;
}
#topbar-sep{color:var(--border);font-size:1rem;}
#topbar-project{
  font-size:0.88rem;font-weight:600;color:var(--text);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;
}
#topbar-count{
  font-family:var(--mono);font-size:0.7rem;color:var(--text-soft);white-space:nowrap;
}
#topbar-controls{
  margin-left:auto;display:flex;align-items:center;gap:10px;
}
.ctrl-label{
  font-family:var(--mono);font-size:0.64rem;color:var(--text-soft);
  text-transform:uppercase;letter-spacing:0.06em;white-space:nowrap;
}
select.ctrl-select{
  padding:4px 10px;border-radius:6px;
  border:1px solid var(--border);
  background:var(--bg-card);color:var(--text-mid);
  font-family:var(--mono);font-size:0.7rem;cursor:pointer;
  outline:none;
  -webkit-appearance:none;appearance:none;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%237a6a5a'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:right 8px center;
  padding-right:26px;
}
select.ctrl-select:hover{border-color:var(--accent);color:var(--text);}
select.ctrl-select:focus{border-color:var(--accent);}
.ctrl-divider{width:1px;height:20px;background:var(--border);}

/* ── Board ── */
#board{
  position:absolute;
  top:var(--topbar-h);left:0;right:0;bottom:0;
  display:flex;gap:0;
  overflow-x:auto;
  scrollbar-width:thin;scrollbar-color:var(--border) transparent;
}
#board::-webkit-scrollbar{height:6px;}
#board::-webkit-scrollbar-track{background:var(--bg-sidebar);}
#board::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px;}

/* ── Column ── */
.col{
  flex:1;min-width:280px;
  display:flex;flex-direction:column;
  border-right:1px solid var(--border);
  height:100%;
  overflow:hidden;
  flex-shrink:0;
}
.col:last-child{border-right:none;}

.col-header{
  height:var(--col-header-h);
  display:flex;align-items:center;justify-content:space-between;
  padding:0 16px;
  border-bottom:1px solid var(--border);
  flex-shrink:0;
  cursor:pointer;
  user-select:none;
  transition:background 0.15s;
  background:var(--bg-sidebar);
}
.col-header:hover{background:var(--bg-hover);}
.col-header-left{display:flex;align-items:center;gap:10px;}
.col-status-name{
  font-size:0.82rem;font-weight:700;letter-spacing:0.01em;
}
.col-count{
  display:inline-flex;align-items:center;justify-content:center;
  min-width:22px;height:18px;padding:0 6px;border-radius:999px;
  font-family:var(--mono);font-size:0.62rem;font-weight:600;
}
.col-chevron{
  font-size:0.65rem;color:var(--text-soft);
  transition:transform 0.2s;
}
.col.collapsed .col-chevron{transform:rotate(-90deg);}

.col-body{
  flex:1;overflow-y:auto;padding:10px;
  scrollbar-width:thin;scrollbar-color:var(--border) transparent;
  display:flex;flex-direction:column;gap:8px;
}
.col-body::-webkit-scrollbar{width:4px;}
.col-body::-webkit-scrollbar-track{background:transparent;}
.col-body::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px;}
.col.collapsed .col-body{display:none;}

/* ── Card ── */
.card{
  background:var(--bg-card);
  border:1px solid var(--border);
  border-radius:8px;
  padding:12px 14px 0;
  cursor:pointer;
  transition:border-color 0.15s,background 0.15s;
  position:relative;
  overflow:hidden;
}
.card:hover{border-color:var(--accent);background:var(--bg-hover);}
.card.hidden{display:none;}
.card-key{
  font-family:var(--mono);font-size:0.68rem;color:var(--accent);
  letter-spacing:0.04em;margin-bottom:5px;
}
.card-title{
  font-size:0.84rem;font-weight:700;color:var(--text);
  line-height:1.35;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
  overflow:hidden;margin-bottom:8px;
}
.card-title.expanded{-webkit-line-clamp:unset;display:block;}
.card-domain{
  display:inline-block;padding:1px 7px;border-radius:999px;
  background:var(--bg-hover);border:1px solid var(--border-soft);
  font-family:var(--mono);font-size:0.62rem;color:var(--text-soft);
  margin-bottom:8px;
}
.card-meta{
  display:flex;align-items:center;gap:8px;
  font-family:var(--mono);font-size:0.66rem;color:var(--text-soft);
  margin-bottom:8px;
}
.card-decisions-icon{color:var(--text-soft);}
.card-comp-bar{
  height:4px;
  background:var(--border);
  border-radius:0 0 8px 8px;
  margin:8px -14px 0;
  overflow:hidden;
  position:relative;
}
.card-comp-fill{
  height:100%;border-radius:0 0 8px 8px;
  background:var(--accent);
  transition:width 0.3s;
}

/* ── Card expanded body ── */
.card-expand{
  display:none;
  padding-top:10px;border-top:1px solid var(--border-soft);
  margin-top:8px;
}
.card.expanded .card-expand{display:block;}
.card-problem{
  font-size:0.78rem;color:var(--text-mid);line-height:1.55;
  margin-bottom:10px;padding-left:8px;border-left:2px solid var(--accent);
}
.card-tags{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;}
.card-tag{
  display:inline-block;padding:1px 7px;border-radius:999px;
  background:var(--bg-hover);border:1px solid var(--border);
  font-family:var(--mono);font-size:0.62rem;color:var(--text-soft);
}
.card-expand-meta{
  font-family:var(--mono);font-size:0.68rem;color:var(--text-soft);
  margin-bottom:6px;display:flex;gap:14px;flex-wrap:wrap;
}
.card-expand-meta span{color:var(--text-mid);}
.card-analysis-section{margin-top:8px;}
.show-more-btn{
  display:inline-block;margin-top:6px;
  font-family:var(--mono);font-size:0.66rem;color:var(--accent);
  cursor:pointer;border:none;background:none;padding:0;
}
.show-more-btn:hover{text-decoration:underline;}
.card-analysis{
  display:none;
  font-size:0.76rem;color:var(--text-mid);line-height:1.5;
  margin-top:6px;padding-left:8px;border-left:2px solid var(--border);
}
.card.analysis-open .card-analysis{display:block;}

/* ── Empty placeholder ── */
.col-empty{
  font-family:var(--mono);font-size:0.72rem;color:var(--text-soft);
  text-align:center;padding:24px 12px;
  border:1px dashed var(--border);border-radius:8px;
  opacity:0.6;
}
.col-empty.hidden{display:none;}

/* ── Empty state ── */
#empty-state{
  position:fixed;inset:0;top:var(--topbar-h);
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  color:var(--text-soft);font-size:0.9rem;gap:12px;
}
.empty-icon{font-size:3rem;color:var(--border);}
</style>
</head>
<body>

<div id="topbar">
  <span id="topbar-brand">◈ lac · kanban</span>
  <span id="topbar-sep">|</span>
  <span id="topbar-project">${esc(projectName)}</span>
  <span id="topbar-count">${count} feature${count === 1 ? "" : "s"}</span>
  <div id="topbar-controls">
    <span class="ctrl-label">Domain</span>
    <select id="domain-select" class="ctrl-select">
      <option value="">All domains</option>
      ${domainOptions}
    </select>
    <div class="ctrl-divider"></div>
    <span class="ctrl-label">Sort</span>
    <select id="sort-select" class="ctrl-select">
      <option value="default">Default</option>
      <option value="alpha">A–Z (title)</option>
      <option value="completeness">Completeness ↓</option>
      <option value="decisions">Decisions ↓</option>
    </select>
  </div>
</div>

<div id="board">
  <!-- columns injected by JS -->
</div>

${count === 0
    ? `<div id="empty-state">
        <div class="empty-icon">◈</div>
        <p>No features found. Run <code style="font-family:var(--mono);color:var(--accent)">lac extract</code> first.</p>
      </div>`
    : ""}

<script>
(function(){
'use strict';

var features = ${featuresJson};

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(s){
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function completeness(f){
  var checks=[!!f.analysis,!!f.implementation,!!(f.decisions&&f.decisions.length),
    !!f.successCriteria,!!(f.knownLimitations&&f.knownLimitations.length),
    !!(f.tags&&f.tags.length),!!f.domain];
  return Math.round(checks.filter(Boolean).length/checks.length*100);
}

function statusColor(s){
  switch(s){
    case 'active':return '#4aad72';
    case 'frozen':return '#5b82cc';
    case 'deprecated':return '#cc5b5b';
    default:return '#c4a255';
  }
}
function statusBgColor(s){
  switch(s){
    case 'active':return 'rgba(74,173,114,0.14)';
    case 'frozen':return 'rgba(91,130,204,0.14)';
    case 'deprecated':return 'rgba(204,91,91,0.14)';
    default:return 'rgba(196,162,85,0.14)';
  }
}

// ── Column order & labels ─────────────────────────────────────────────────────
var COL_ORDER=['active','frozen','draft','deprecated'];
var COL_LABELS={active:'Active',frozen:'Frozen',draft:'Draft',deprecated:'Deprecated'};

// ── State ─────────────────────────────────────────────────────────────────────
var filterDomain='';
var sortMode='default';

// ── Build board ───────────────────────────────────────────────────────────────
var board=document.getElementById('board');
var colMeta={}; // status -> {el, bodyEl, emptyEl, cards:[{el, feature}]}

function buildBoard(){
  board.innerHTML='';
  colMeta={};
  if(!features.length)return;

  // Determine which statuses have features
  var statusSet=new Set(features.map(function(f){return f.status;}));
  var activeCols=COL_ORDER.filter(function(s){return statusSet.has(s);});

  activeCols.forEach(function(status){
    var col=document.createElement('div');
    col.className='col';
    col.dataset.status=status;

    var sColor=statusColor(status);
    var sBg=statusBgColor(status);
    var label=COL_LABELS[status]||status;

    // Header
    var header=document.createElement('div');
    header.className='col-header';
    header.innerHTML=
      '<div class="col-header-left">'
        +'<span class="col-status-name" style="color:'+sColor+'">'+esc(label)+'</span>'
        +'<span class="col-count" style="background:'+sBg+';color:'+sColor+';" data-count-el="'+status+'">0</span>'
      +'</div>'
      +'<span class="col-chevron">▾</span>';
    header.addEventListener('click',function(){
      col.classList.toggle('collapsed');
    });

    // Body
    var body=document.createElement('div');
    body.className='col-body';

    // Empty placeholder
    var empty=document.createElement('div');
    empty.className='col-empty';
    empty.textContent='No features';
    body.appendChild(empty);

    col.appendChild(header);
    col.appendChild(body);
    board.appendChild(col);

    colMeta[status]={
      el:col,
      bodyEl:body,
      emptyEl:empty,
      countEl:header.querySelector('[data-count-el]'),
      cards:[]
    };
  });

  // Create cards
  features.forEach(function(f){
    var status=f.status;
    if(!colMeta[status])return;

    var comp=completeness(f);
    var dcount=f.decisions?f.decisions.length:0;
    var lcount=f.knownLimitations?f.knownLimitations.length:0;
    var tags=f.tags||[];
    var analysis=f.analysis||'';
    var analysisTrunc=analysis.length>300?analysis.slice(0,297)+'…':analysis;
    var problem=f.problem||'';

    var card=document.createElement('div');
    card.className='card';
    card.dataset.featureKey=f.featureKey;
    card.dataset.domain=f.domain||'';
    card.dataset.title=f.title;
    card.dataset.comp=String(comp);
    card.dataset.decisions=String(dcount);

    var domainHtml=f.domain?'<div class="card-domain">'+esc(f.domain)+'</div>':'';
    var decisionsHtml=dcount>0?'<span class="card-decisions-icon">◆</span><span>'+dcount+' decision'+(dcount===1?'':'s')+'</span>':'';
    var tagsHtml=tags.map(function(t){return '<span class="card-tag">'+esc(String(t))+'</span>';}).join('');
    var expandMetaHtml=
      '<div class="card-expand-meta">'
      +'<div>decisions&nbsp;<span>'+dcount+'</span></div>'
      +'<div>limitations&nbsp;<span>'+lcount+'</span></div>'
      +'</div>';
    var analysisSection=analysis?
      '<div class="card-analysis-section">'
        +'<button class="show-more-btn" data-action="analysis">Show analysis ↓</button>'
        +'<div class="card-analysis">'+esc(analysisTrunc)+'</div>'
      +'</div>'
      :'';

    card.innerHTML=
      '<div class="card-key">'+esc(f.featureKey)+'</div>'
      +'<div class="card-title">'+esc(f.title)+'</div>'
      +domainHtml
      +(decisionsHtml?'<div class="card-meta">'+decisionsHtml+'</div>':'')
      +'<div class="card-expand">'
        +(problem?'<div class="card-problem">'+esc(problem)+'</div>':'')
        +(tags.length?'<div class="card-tags">'+tagsHtml+'</div>':'')
        +expandMetaHtml
        +analysisSection
      +'</div>'
      +'<div class="card-comp-bar"><div class="card-comp-fill" style="width:'+comp+'%"></div></div>';

    // Toggle expand on click (but not on show-more button)
    card.addEventListener('click',function(e){
      if(e.target.dataset&&e.target.dataset.action==='analysis'){
        // handled below
        return;
      }
      var wasExpanded=card.classList.contains('expanded');
      // collapse all cards in this column first
      colMeta[status].cards.forEach(function(item){
        item.el.classList.remove('expanded');
        var t=item.el.querySelector('.card-title');
        if(t)t.classList.remove('expanded');
        item.el.classList.remove('analysis-open');
        var btn=item.el.querySelector('[data-action="analysis"]');
        if(btn)btn.textContent='Show analysis ↓';
      });
      if(!wasExpanded){
        card.classList.add('expanded');
        var titleEl=card.querySelector('.card-title');
        if(titleEl)titleEl.classList.add('expanded');
      }
    });

    // Show-more for analysis
    card.addEventListener('click',function(e){
      if(!e.target.dataset||e.target.dataset.action!=='analysis')return;
      e.stopPropagation();
      var isOpen=card.classList.contains('analysis-open');
      card.classList.toggle('analysis-open',!isOpen);
      e.target.textContent=isOpen?'Show analysis ↓':'Hide analysis ↑';
    });

    colMeta[status].bodyEl.appendChild(card);
    colMeta[status].cards.push({el:card,feature:f});
  });

  renderCards();
}

// ── Render / filter / sort ────────────────────────────────────────────────────
function renderCards(){
  COL_ORDER.forEach(function(status){
    var meta=colMeta[status];
    if(!meta)return;

    // Sort
    var sorted=meta.cards.slice();
    if(sortMode==='alpha'){
      sorted.sort(function(a,b){return a.feature.title.localeCompare(b.feature.title);});
    } else if(sortMode==='completeness'){
      sorted.sort(function(a,b){return completeness(b.feature)-completeness(a.feature);});
    } else if(sortMode==='decisions'){
      var dc=function(f){return f.decisions?f.decisions.length:0;};
      sorted.sort(function(a,b){return dc(b.feature)-dc(a.feature);});
    } else {
      sorted.sort(function(a,b){return a.feature.featureKey.localeCompare(b.feature.featureKey);});
    }

    // Re-order DOM
    var body=meta.bodyEl;
    sorted.forEach(function(item){body.appendChild(item.el);});
    // Keep empty placeholder at end
    body.appendChild(meta.emptyEl);

    // Apply filter visibility
    var visible=0;
    sorted.forEach(function(item){
      var show=!filterDomain||item.feature.domain===filterDomain;
      item.el.classList.toggle('hidden',!show);
      if(show)visible++;
    });

    // Update count and empty state
    meta.countEl.textContent=String(visible);
    meta.emptyEl.classList.toggle('hidden',visible>0);
  });
}

// ── Controls ──────────────────────────────────────────────────────────────────
document.getElementById('domain-select').addEventListener('change',function(){
  filterDomain=this.value;
  renderCards();
});

document.getElementById('sort-select').addEventListener('change',function(){
  sortMode=this.value;
  renderCards();
});

// ── Init ──────────────────────────────────────────────────────────────────────
buildBoard();

})();
</script>
</body>
</html>`;
}

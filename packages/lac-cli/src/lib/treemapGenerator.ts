/**
 * Treemap generator — exports a rectangular treemap where each feature is a
 * colored tile sized by its documentation weight.
 *
 * Layout: row-based treemap algorithm — domains form horizontal rows whose
 * height is proportional to the domain's total weight; features within each
 * row are horizontal tiles proportional to individual weight.
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

export function generateTreemap(features: Feature[], projectName: string): string {
  const featuresJson = JSON.stringify(features).replace(/<\/script>/gi, "<\\/script>");

  const count = features.length;

  // Compute unique domains for the TS side (embedded into HTML for filter chips)
  const domainSet = new Set<string>();
  for (const f of features) {
    if (f.domain) domainSet.add(f.domain);
  }
  const domains = Array.from(domainSet).sort();

  const domainChips = domains
    .map((d) => `<button class="domain-chip" data-domain="${esc(d)}">${esc(d)}</button>`)
    .join("\n          ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)} · LAC Treemap</title>
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
#domain-chips{
  display:flex;align-items:center;gap:5px;
  border-left:1px solid var(--border);padding-left:14px;
  flex-wrap:nowrap;overflow-x:auto;
  scrollbar-width:none;
}
#domain-chips::-webkit-scrollbar{display:none;}
.domain-chip{
  padding:3px 10px;border-radius:999px;
  border:1px solid var(--border);background:transparent;
  color:var(--text-soft);font-family:var(--mono);font-size:0.64rem;
  cursor:pointer;transition:background 0.13s,color 0.13s,border-color 0.13s;
  white-space:nowrap;flex-shrink:0;
}
.domain-chip:hover{border-color:var(--accent);color:var(--accent);}
.domain-chip.active{
  background:rgba(196,162,85,0.13);
  border-color:var(--accent);color:var(--accent);
}
#chip-all{
  padding:3px 10px;border-radius:999px;
  border:1px solid var(--accent);
  background:rgba(196,162,85,0.13);
  color:var(--accent);
  font-family:var(--mono);font-size:0.64rem;
  cursor:pointer;white-space:nowrap;flex-shrink:0;
}

/* ── Treemap canvas ── */
#treemap-wrap{
  position:absolute;
  top:var(--topbar-h);left:0;right:0;bottom:0;
  overflow:hidden;
}
.tile{
  position:absolute;
  border:1px solid var(--border);
  overflow:hidden;
  cursor:pointer;
  transition:filter 0.15s,border-color 0.15s,opacity 0.2s;
}
.tile:hover{
  border-color:var(--accent);
  filter:brightness(1.25);
  z-index:10;
}
.tile.dimmed{opacity:0.18;}
.tile-inner{
  position:absolute;inset:0;
  padding:6px 8px;
  display:flex;flex-direction:column;justify-content:flex-start;
  overflow:hidden;
}
.tile-key{
  font-family:var(--mono);font-size:0.64rem;color:rgba(255,255,255,0.7);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  line-height:1.3;flex-shrink:0;
}
.tile-title{
  font-size:0.72rem;font-weight:600;color:rgba(255,255,255,0.88);
  overflow:hidden;text-overflow:ellipsis;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
  line-height:1.35;margin-top:2px;
}
.tile-status{
  position:absolute;bottom:5px;right:6px;
  width:8px;height:8px;border-radius:50%;
  flex-shrink:0;
}
.tile-domain-label{
  position:absolute;bottom:5px;left:7px;
  font-family:var(--mono);font-size:0.58rem;
  color:rgba(255,255,255,0.4);white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;max-width:60%;
}

/* ── Detail panel ── */
#detail-panel{
  position:fixed;top:var(--topbar-h);right:0;bottom:0;width:300px;
  background:var(--bg-sidebar);
  border-left:1px solid var(--border);
  transform:translateX(100%);
  transition:transform 0.25s cubic-bezier(0.4,0,0.2,1);
  z-index:150;display:flex;flex-direction:column;overflow:hidden;
}
#detail-panel.open{transform:translateX(0);}
#detail-header{
  display:flex;align-items:center;justify-content:space-between;
  padding:16px 16px 12px;border-bottom:1px solid var(--border-soft);flex-shrink:0;
}
#detail-key{
  font-family:var(--mono);font-size:0.78rem;color:var(--accent);letter-spacing:0.04em;
}
#detail-close{
  width:28px;height:28px;border-radius:6px;border:1px solid var(--border);
  background:transparent;color:var(--text-soft);
  font-size:1rem;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  transition:background 0.15s,color 0.15s;flex-shrink:0;
}
#detail-close:hover{background:var(--bg-hover);color:var(--text);}
#detail-body{
  flex:1;overflow-y:auto;padding:16px;
  scrollbar-width:thin;scrollbar-color:var(--border) transparent;
}
#detail-body::-webkit-scrollbar{width:4px;}
#detail-body::-webkit-scrollbar-track{background:transparent;}
#detail-body::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px;}
#detail-title{font-size:1rem;font-weight:700;color:var(--text);line-height:1.3;margin-bottom:10px;}
.detail-badge{
  display:inline-block;padding:2px 9px;border-radius:999px;
  font-family:var(--mono);font-size:0.68rem;margin-bottom:12px;
}
#detail-problem{
  font-size:0.82rem;color:var(--text-mid);line-height:1.55;
  margin-bottom:14px;padding-left:10px;border-left:2px solid var(--accent);
}
.detail-meta-row{
  display:flex;align-items:center;gap:8px;
  font-family:var(--mono);font-size:0.72rem;color:var(--text-soft);margin-bottom:8px;
}
.detail-meta-label{color:var(--text-soft);}
.detail-meta-val{color:var(--text-mid);}
.comp-bar-wrap{margin-top:12px;}
.comp-bar-label{font-family:var(--mono);font-size:0.65rem;color:var(--text-soft);margin-bottom:5px;}
.comp-bar-track{width:100%;height:4px;border-radius:2px;background:var(--border);overflow:hidden;}
.comp-bar-fill{height:100%;background:var(--accent);border-radius:2px;transition:width 0.3s;}
.detail-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px;}
.detail-tag{
  display:inline-block;padding:2px 8px;border-radius:999px;
  background:var(--bg-hover);border:1px solid var(--border);
  font-family:var(--mono);font-size:0.65rem;color:var(--text-soft);
}

/* ── Tooltip ── */
#lac-tooltip{
  position:fixed;z-index:9999;pointer-events:none;
  background:var(--bg-sidebar);border:1px solid var(--border);
  border-radius:6px;padding:10px 14px;max-width:260px;
  box-shadow:0 4px 20px rgba(0,0,0,0.55);
  opacity:0;transition:opacity 0.1s;font-size:0.78rem;
}
#lac-tooltip.visible{opacity:1;}
.tt-title{font-weight:700;color:var(--text);margin-bottom:4px;line-height:1.3;}
.tt-row{display:flex;gap:6px;align-items:center;margin-top:3px;font-family:var(--mono);font-size:0.66rem;}
.tt-label{color:var(--text-soft);}
.tt-val{color:var(--text-mid);}

/* ── Empty state ── */
#empty-state{
  position:absolute;inset:0;display:flex;flex-direction:column;
  align-items:center;justify-content:center;
  color:var(--text-soft);font-size:0.9rem;gap:12px;
}
.empty-icon{font-size:3rem;color:var(--border);}
</style>
</head>
<body>

<div id="topbar">
  <span id="topbar-brand">◈ lac · treemap</span>
  <span id="topbar-sep">|</span>
  <span id="topbar-project">${esc(projectName)}</span>
  <span id="topbar-count">${count} feature${count === 1 ? "" : "s"}</span>
  <div id="domain-chips">
    <button id="chip-all">All</button>
    ${domainChips}
  </div>
</div>

<div id="treemap-wrap">
  ${count === 0
    ? `<div id="empty-state">
        <div class="empty-icon">◈</div>
        <p>No features found. Run <code style="font-family:var(--mono);color:var(--accent)">lac extract</code> first.</p>
      </div>`
    : "<!-- tiles injected by JS -->"}
</div>

<!-- Detail panel -->
<div id="detail-panel">
  <div id="detail-header">
    <span id="detail-key"></span>
    <button id="detail-close" title="Close">×</button>
  </div>
  <div id="detail-body">
    <div id="detail-title"></div>
    <span id="detail-badge" class="detail-badge"></span>
    <div id="detail-problem"></div>
    <div id="detail-domain-row" class="detail-meta-row"></div>
    <div id="detail-decisions-row" class="detail-meta-row"></div>
    <div id="detail-limits-row" class="detail-meta-row"></div>
    <div class="comp-bar-wrap">
      <div class="comp-bar-label" id="detail-comp-label"></div>
      <div class="comp-bar-track"><div class="comp-bar-fill" id="detail-comp-fill"></div></div>
    </div>
    <div id="detail-tags" class="detail-tags"></div>
  </div>
</div>

<!-- Tooltip -->
<div id="lac-tooltip">
  <div class="tt-title" id="tt-title"></div>
  <div class="tt-row"><span class="tt-label">domain</span><span class="tt-val" id="tt-domain"></span></div>
  <div class="tt-row"><span class="tt-label">status</span><span class="tt-val" id="tt-status"></span></div>
  <div class="tt-row"><span class="tt-label">complete</span><span class="tt-val" id="tt-comp"></span></div>
  <div class="tt-row"><span class="tt-label">decisions</span><span class="tt-val" id="tt-decisions"></span></div>
</div>

<script>
(function(){
'use strict';

var features = ${featuresJson};

// ── Helpers ──────────────────────────────────────────────────────────────────
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

function weight(f){
  var d=f.decisions?f.decisions.length:0;
  var c=completeness(f);
  return (d+1)*(c/100+0.1);
}

function statusColor(s){
  switch(s){
    case 'active':return '#4aad72';
    case 'frozen':return '#5b82cc';
    case 'deprecated':return '#cc5b5b';
    default:return '#c4a255';
  }
}

function statusBg(s){
  switch(s){
    case 'active':return 'rgba(74,173,114,0.18)';
    case 'frozen':return 'rgba(91,130,204,0.18)';
    case 'deprecated':return 'rgba(204,91,91,0.18)';
    default:return 'rgba(196,162,85,0.18)';
  }
}

// 12-color domain palette (semi-transparent fills)
var PALETTE=[
  'rgba(196,162,85,0.28)','rgba(74,173,114,0.28)','rgba(91,130,204,0.28)',
  'rgba(204,91,91,0.28)','rgba(130,91,204,0.28)','rgba(91,204,196,0.28)',
  'rgba(204,156,91,0.28)','rgba(91,180,204,0.28)','rgba(173,74,130,0.28)',
  'rgba(74,130,173,0.28)','rgba(173,130,74,0.28)','rgba(74,173,156,0.28)',
];

// ── Domain palette map ────────────────────────────────────────────────────────
var domainPalette={};
var palIdx=0;
features.forEach(function(f){
  var d=f.domain||'(none)';
  if(!domainPalette[d]){domainPalette[d]=PALETTE[palIdx%PALETTE.length];palIdx++;}
});

// ── State ─────────────────────────────────────────────────────────────────────
var activeDomain=null; // null = all

// ── Layout ────────────────────────────────────────────────────────────────────
var wrap=document.getElementById('treemap-wrap');
var tileEls=[]; // {el, feature}

function buildTiles(){
  // Clear
  wrap.innerHTML='';
  tileEls=[];
  if(!features.length)return;

  var W=wrap.offsetWidth;
  var H=wrap.offsetHeight;

  // Group by domain
  var groups={};
  features.forEach(function(f){
    var d=f.domain||'(none)';
    if(!groups[d])groups[d]={domain:d,features:[],totalWeight:0};
    var w=weight(f);
    groups[d].features.push({feature:f,w:w});
    groups[d].totalWeight+=w;
  });

  var groupArr=Object.values(groups);
  groupArr.sort(function(a,b){return b.totalWeight-a.totalWeight;});
  var overallWeight=groupArr.reduce(function(s,g){return s+g.totalWeight;},0);

  var rowY=0;
  groupArr.forEach(function(g){
    var rowH=Math.round((g.totalWeight/overallWeight)*H);
    // Clamp: at least 40px if there are features
    if(rowH<40)rowH=40;

    var colX=0;
    g.features.forEach(function(item,i){
      var tileW=Math.round((item.w/g.totalWeight)*W);
      // Last tile takes remaining width
      if(i===g.features.length-1)tileW=W-colX;

      var f=item.feature;
      var comp=completeness(f);
      var bg=domainPalette[g.domain];
      var statusC=statusColor(f.status);

      var el=document.createElement('div');
      el.className='tile';
      el.style.left=colX+'px';
      el.style.top=rowY+'px';
      el.style.width=tileW+'px';
      el.style.height=rowH+'px';
      el.style.background=bg;

      var showKey=tileW>55&&rowH>28;
      var showTitle=tileW>80&&rowH>44;
      var showDomain=tileW>100&&rowH>60;

      el.innerHTML='<div class="tile-inner">'
        +(showKey?'<div class="tile-key">'+esc(f.featureKey)+'</div>':'')
        +(showTitle?'<div class="tile-title">'+esc(f.title)+'</div>':'')
        +'</div>'
        +'<div class="tile-status" style="background:'+statusC+'"></div>'
        +(showDomain?'<div class="tile-domain-label">'+esc(g.domain)+'</div>':'');

      el.dataset.featureKey=f.featureKey;
      el.dataset.domain=g.domain;

      // Events
      el.addEventListener('click',function(){openPanel(f);});
      el.addEventListener('mouseenter',function(e){showTooltip(e,f,comp);});
      el.addEventListener('mousemove',function(e){moveTooltip(e);});
      el.addEventListener('mouseleave',hideTooltip);

      wrap.appendChild(el);
      tileEls.push({el:el,feature:f,domain:g.domain});

      colX+=tileW;
    });

    rowY+=rowH;
  });

  applyFilter();
}

// ── Filter ────────────────────────────────────────────────────────────────────
function applyFilter(){
  tileEls.forEach(function(item){
    if(!activeDomain||item.domain===activeDomain){
      item.el.classList.remove('dimmed');
    } else {
      item.el.classList.add('dimmed');
    }
  });
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
var tooltip=document.getElementById('lac-tooltip');
var ttTitle=document.getElementById('tt-title');
var ttDomain=document.getElementById('tt-domain');
var ttStatus=document.getElementById('tt-status');
var ttComp=document.getElementById('tt-comp');
var ttDecisions=document.getElementById('tt-decisions');

function showTooltip(e,f,comp){
  ttTitle.textContent=f.title;
  ttDomain.textContent=f.domain||'—';
  ttStatus.textContent=f.status;
  ttComp.textContent=comp+'%';
  ttDecisions.textContent=f.decisions?f.decisions.length:0;
  tooltip.classList.add('visible');
  moveTooltip(e);
}
function moveTooltip(e){
  var tw=tooltip.offsetWidth,th=tooltip.offsetHeight;
  var vw=window.innerWidth,vh=window.innerHeight;
  var x=e.clientX+14,y=e.clientY+14;
  if(x+tw>vw-8)x=e.clientX-tw-14;
  if(y+th>vh-8)y=e.clientY-th-14;
  if(x<8)x=8;if(y<8)y=8;
  tooltip.style.left=x+'px';tooltip.style.top=y+'px';
}
function hideTooltip(){tooltip.classList.remove('visible');}

// ── Detail panel ──────────────────────────────────────────────────────────────
var panel=document.getElementById('detail-panel');
var detailKey=document.getElementById('detail-key');
var detailClose=document.getElementById('detail-close');
var detailTitle=document.getElementById('detail-title');
var detailBadge=document.getElementById('detail-badge');
var detailProblem=document.getElementById('detail-problem');
var detailDomainRow=document.getElementById('detail-domain-row');
var detailDecisionsRow=document.getElementById('detail-decisions-row');
var detailLimitsRow=document.getElementById('detail-limits-row');
var detailCompLabel=document.getElementById('detail-comp-label');
var detailCompFill=document.getElementById('detail-comp-fill');
var detailTags=document.getElementById('detail-tags');

function openPanel(f){
  var comp=completeness(f);
  detailKey.textContent=f.featureKey;
  detailTitle.textContent=f.title;
  detailBadge.textContent=f.status;
  detailBadge.style.background=statusBg(f.status);
  detailBadge.style.color=statusColor(f.status);
  detailBadge.style.border='1px solid '+statusColor(f.status)+'44';
  var prob=f.problem||'';
  detailProblem.textContent=prob.length>200?prob.slice(0,197)+'…':prob;
  detailProblem.style.display=prob?'block':'none';
  detailDomainRow.innerHTML=f.domain?'<span class="detail-meta-label">domain</span><span class="detail-meta-val">'+esc(f.domain)+'</span>':'';
  var dcount=f.decisions?f.decisions.length:0;
  detailDecisionsRow.innerHTML='<span class="detail-meta-label">decisions</span><span class="detail-meta-val">'+dcount+'</span>';
  var lcount=f.knownLimitations?f.knownLimitations.length:0;
  detailLimitsRow.innerHTML='<span class="detail-meta-label">limitations</span><span class="detail-meta-val">'+lcount+'</span>';
  detailCompLabel.textContent='completeness '+comp+'%';
  detailCompFill.style.width=comp+'%';
  // Tags
  var tags=f.tags||[];
  detailTags.innerHTML=tags.map(function(t){return '<span class="detail-tag">'+esc(String(t))+'</span>';}).join('');
  panel.classList.add('open');
}

detailClose.addEventListener('click',function(){panel.classList.remove('open');});

// ── Domain chips ──────────────────────────────────────────────────────────────
document.getElementById('chip-all').addEventListener('click',function(){
  activeDomain=null;
  document.querySelectorAll('.domain-chip').forEach(function(c){c.classList.remove('active');});
  this.style.background='rgba(196,162,85,0.13)';
  this.style.borderColor='var(--accent)';
  applyFilter();
});

document.querySelectorAll('.domain-chip').forEach(function(btn){
  btn.addEventListener('click',function(){
    var d=this.dataset.domain;
    if(activeDomain===d){
      activeDomain=null;
      this.classList.remove('active');
      var chipAll=document.getElementById('chip-all');
      chipAll.style.background='rgba(196,162,85,0.13)';
      chipAll.style.borderColor='var(--accent)';
    } else {
      activeDomain=d;
      document.querySelectorAll('.domain-chip').forEach(function(c){c.classList.remove('active');});
      this.classList.add('active');
      var chipAll=document.getElementById('chip-all');
      chipAll.style.background='transparent';
      chipAll.style.borderColor='var(--border)';
    }
    applyFilter();
  });
});

// ── Resize ────────────────────────────────────────────────────────────────────
var resizeTimer;
window.addEventListener('resize',function(){
  clearTimeout(resizeTimer);
  resizeTimer=setTimeout(buildTiles,120);
});

// ── Init ──────────────────────────────────────────────────────────────────────
buildTiles();

})();
</script>
</body>
</html>`;
}

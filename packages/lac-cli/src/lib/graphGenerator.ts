import type { Feature } from "@life-as-code/feature-schema";

export function generateGraph(features: Feature[], projectName: string): string {
  function esc(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const featuresJson = JSON.stringify(features);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)} · Feature Graph</title>
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
#canvas-wrap{
  position:absolute;inset:0;
}
canvas{
  display:block;width:100%;height:100%;cursor:grab;
}
canvas.dragging{cursor:grabbing;}

/* Topbar */
#topbar{
  position:fixed;top:0;left:0;right:0;
  height:48px;
  background:rgba(14,12,10,0.92);
  backdrop-filter:blur(8px);
  -webkit-backdrop-filter:blur(8px);
  border-bottom:1px solid var(--border);
  display:flex;align-items:center;
  padding:0 20px;
  gap:16px;
  z-index:100;
  user-select:none;
}
#topbar-brand{
  font-family:var(--mono);font-size:0.8rem;color:var(--accent);letter-spacing:0.05em;
  white-space:nowrap;
}
#topbar-sep{color:var(--border);font-size:1rem;}
#topbar-project{
  font-size:0.88rem;font-weight:600;color:var(--text);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px;
}
#topbar-count{
  font-family:var(--mono);font-size:0.7rem;color:var(--text-soft);
}
#btn-reset{
  margin-left:auto;
  padding:5px 14px;
  border-radius:6px;
  background:var(--bg-card);
  border:1px solid var(--border);
  color:var(--text-mid);
  font-family:var(--mono);font-size:0.72rem;
  cursor:pointer;
  transition:background 0.15s,color 0.15s,border-color 0.15s;
}
#btn-reset:hover{background:var(--bg-hover);color:var(--accent);border-color:var(--accent);}

/* Detail panel */
#detail-panel{
  position:fixed;
  top:48px;right:0;bottom:0;
  width:300px;
  background:var(--bg-sidebar);
  border-left:1px solid var(--border);
  transform:translateX(100%);
  transition:transform 0.25s cubic-bezier(0.4,0,0.2,1);
  z-index:90;
  display:flex;flex-direction:column;
  overflow:hidden;
}
#detail-panel.open{transform:translateX(0);}
#detail-header{
  display:flex;align-items:center;justify-content:space-between;
  padding:16px 16px 12px;
  border-bottom:1px solid var(--border-soft);
  flex-shrink:0;
}
#detail-key{
  font-family:var(--mono);font-size:0.78rem;color:var(--accent);letter-spacing:0.04em;
}
#detail-close{
  width:28px;height:28px;
  border-radius:6px;border:1px solid var(--border);
  background:transparent;color:var(--text-soft);
  font-size:1rem;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  transition:background 0.15s,color 0.15s;
  flex-shrink:0;
}
#detail-close:hover{background:var(--bg-hover);color:var(--text);}
#detail-body{
  flex:1;overflow-y:auto;padding:16px;
  scrollbar-width:thin;scrollbar-color:var(--border) transparent;
}
#detail-body::-webkit-scrollbar{width:4px;}
#detail-body::-webkit-scrollbar-track{background:transparent;}
#detail-body::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px;}
#detail-title{
  font-size:1.05rem;font-weight:700;color:var(--text);
  line-height:1.3;margin-bottom:10px;
}
.detail-badge{
  display:inline-block;padding:2px 9px;border-radius:999px;
  font-family:var(--mono);font-size:0.68rem;margin-bottom:12px;
}
#detail-problem{
  font-size:0.82rem;color:var(--text-mid);line-height:1.55;
  margin-bottom:14px;
  padding-left:10px;border-left:2px solid var(--accent);
}
.detail-meta-row{
  display:flex;align-items:center;gap:8px;
  font-family:var(--mono);font-size:0.72rem;color:var(--text-soft);
  margin-bottom:8px;
}
.detail-meta-label{color:var(--text-soft);}
.detail-meta-val{color:var(--text-mid);}
.detail-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px;}
.detail-tag{
  display:inline-block;padding:2px 8px;border-radius:999px;
  background:var(--bg-hover);border:1px solid var(--border);
  font-family:var(--mono);font-size:0.65rem;color:var(--text-soft);
}
.detail-lineage-section{margin-top:14px;padding-top:14px;border-top:1px solid var(--border-soft);}
.detail-lineage-title{
  font-family:var(--mono);font-size:0.65rem;letter-spacing:0.12em;
  text-transform:uppercase;color:var(--text-soft);margin-bottom:8px;
}
.detail-chip{
  display:inline-block;padding:3px 10px;border-radius:6px;
  background:var(--bg-hover);border:1px solid var(--border);
  font-family:var(--mono);font-size:0.7rem;color:var(--text-mid);
  cursor:pointer;margin:3px 3px 3px 0;
  transition:background 0.15s,border-color 0.15s,color 0.15s;
}
.detail-chip:hover{background:var(--bg-card);border-color:var(--accent);color:var(--accent);}
.comp-bar-wrap{margin-top:12px;}
.comp-bar-label{font-family:var(--mono);font-size:0.65rem;color:var(--text-soft);margin-bottom:5px;}
.comp-bar-track{width:100%;height:4px;border-radius:2px;background:var(--border);overflow:hidden;}
.comp-bar-fill{height:100%;background:var(--accent);border-radius:2px;}

/* Instructions overlay */
#instructions{
  position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
  font-family:var(--mono);font-size:0.68rem;color:var(--text-soft);
  background:rgba(14,12,10,0.7);
  padding:6px 16px;border-radius:999px;
  border:1px solid var(--border);
  pointer-events:none;
  z-index:80;
  white-space:nowrap;
  opacity:1;
  transition:opacity 0.5s;
}
#instructions.hidden{opacity:0;}

/* Group-by pills */
#group-wrap{
  display:flex;align-items:center;gap:7px;margin-left:10px;
  border-left:1px solid var(--border);padding-left:14px;
}
.group-label{
  font-family:var(--mono);font-size:0.62rem;color:var(--text-soft);
  white-space:nowrap;letter-spacing:0.06em;text-transform:uppercase;
}
#group-pills{display:flex;gap:3px;flex-wrap:nowrap;}
.group-pill{
  padding:3px 10px;border-radius:999px;
  border:1px solid var(--border);background:transparent;
  color:var(--text-soft);font-family:var(--mono);font-size:0.66rem;
  cursor:pointer;transition:background 0.13s,color 0.13s,border-color 0.13s;
  white-space:nowrap;
}
.group-pill:hover{border-color:var(--accent);color:var(--accent);}
.group-pill.active{
  background:rgba(196,162,85,0.13);
  border-color:var(--accent);color:var(--accent);
}

/* Lane label overlay */
#lane-labels{
  position:fixed;top:48px;left:0;bottom:0;
  width:110px;pointer-events:none;z-index:50;
  display:flex;flex-direction:column;
}
</style>
</head>
<body>

<div id="topbar">
  <span id="topbar-brand">◈ lac · graph</span>
  <span id="topbar-sep">|</span>
  <span id="topbar-project">${esc(projectName)}</span>
  <span id="topbar-count"></span>
  <div id="group-wrap">
    <span class="group-label">Group</span>
    <div id="group-pills">
      <button class="group-pill active" data-mode="lineage">Lineage</button>
      <button class="group-pill" data-mode="domain">Domain</button>
      <button class="group-pill" data-mode="status">Status</button>
      <button class="group-pill" data-mode="timeline">Timeline</button>
      <button class="group-pill" data-mode="completeness">Completeness</button>
    </div>
  </div>
  <button id="btn-reset">Fit view</button>
</div>

<div id="canvas-wrap">
  <canvas id="graph-canvas"></canvas>
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
    <div id="detail-decisions" class="detail-meta-row"></div>
    <div id="detail-domain" class="detail-meta-row"></div>
    <div id="detail-comp" class="comp-bar-wrap"></div>
    <div id="detail-tags" class="detail-tags"></div>
    <div id="detail-lineage"></div>
  </div>
</div>

<div id="instructions">Scroll to zoom · Drag to pan · Click node to inspect</div>

<script>
(function(){
  // ── Data ─────────────────────────────────────────────────────────────────
  var features = ${featuresJson};

  document.getElementById('topbar-count').textContent = features.length + ' features';

  // ── Helpers ───────────────────────────────────────────────────────────────
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
      case 'active':     return 'rgba(74,173,114,0.85)';
      case 'frozen':     return 'rgba(91,130,204,0.85)';
      case 'deprecated': return 'rgba(204,91,91,0.85)';
      default:           return 'rgba(196,162,85,0.85)';
    }
  }
  function statusColorSolid(s){
    switch(s){
      case 'active':     return '#4aad72';
      case 'frozen':     return '#5b82cc';
      case 'deprecated': return '#cc5b5b';
      default:           return '#c4a255';
    }
  }
  function statusBg(s){
    switch(s){
      case 'active':     return 'rgba(74,173,114,0.12)';
      case 'frozen':     return 'rgba(91,130,204,0.12)';
      case 'deprecated': return 'rgba(204,91,91,0.12)';
      default:           return 'rgba(196,162,85,0.12)';
    }
  }

  // ── Canvas setup ──────────────────────────────────────────────────────────
  var canvas = document.getElementById('graph-canvas');
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0;

  function resize(){
    var dpr = window.devicePixelRatio || 1;
    W = canvas.parentElement.offsetWidth;
    H = canvas.parentElement.offsetHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr,dpr);
    drawFrame();
  }
  window.addEventListener('resize', resize);

  // ── Transform (pan + zoom) ────────────────────────────────────────────────
  var transform = { x: 0, y: 0, scale: 1 };

  function worldToScreen(wx, wy){
    return {
      x: wx * transform.scale + transform.x,
      y: wy * transform.scale + transform.y
    };
  }
  function screenToWorld(sx, sy){
    return {
      x: (sx - transform.x) / transform.scale,
      y: (sy - transform.y) / transform.scale
    };
  }

  // ── Build nodes ───────────────────────────────────────────────────────────
  // Count children per feature
  var childCountMap = {};
  features.forEach(function(f){
    childCountMap[f.featureKey] = 0;
  });
  features.forEach(function(f){
    if(f.lineage && f.lineage.parent && childCountMap.hasOwnProperty(f.lineage.parent)){
      childCountMap[f.lineage.parent]++;
    }
    // Also count explicit children array
    if(f.lineage && f.lineage.children){
      f.lineage.children.forEach(function(ck){
        if(childCountMap.hasOwnProperty(ck)){
          childCountMap[ck] = Math.max(childCountMap[ck]||0, 0);
        }
      });
      childCountMap[f.featureKey] = Math.max(childCountMap[f.featureKey]||0, f.lineage.children.length);
    }
  });

  var nodes = [];
  var nodeMap = {}; // featureKey → node

  // Build nodes first (no position yet)
  features.forEach(function(f){
    var comp = completeness(f);
    var radius = 8 + (comp / 100) * 10;
    var node = { x: 0, y: 0, vx: 0, vy: 0, feature: f, radius: radius, comp: comp, depth: 0, targetY: 0 };
    nodes.push(node);
    nodeMap[f.featureKey] = node;
  });

  // ── Grouping state ────────────────────────────────────────────────────────
  var currentGroupMode = 'lineage';
  var lanes = []; // [{label, sublabel, y, color}]

  var LAYER_H  = 240;
  var H_SPREAD = 190;

  var LANE_COLORS = [
    'rgba(196,162,85,0.028)',  'rgba(74,173,114,0.028)',
    'rgba(91,130,204,0.028)',  'rgba(204,91,91,0.028)',
    'rgba(180,120,200,0.028)', 'rgba(120,200,180,0.028)',
    'rgba(200,150,80,0.028)',  'rgba(80,150,200,0.028)',
  ];
  var STATUS_LANE_COLOR = {
    active:     'rgba(74,173,114,0.05)',
    frozen:     'rgba(91,130,204,0.05)',
    draft:      'rgba(196,162,85,0.05)',
    deprecated: 'rgba(204,91,91,0.05)',
  };

  function assignLayer(groups){
    // groups: [{label, sublabel?, color, keys:[featureKey,...]}]
    // Sets targetY (and resets position + velocity) for each node.
    groups.forEach(function(g, laneIdx){
      var y = laneIdx * LAYER_H;
      var count = g.keys.length;
      lanes.push({ label: g.label, sublabel: g.sublabel||'', y: y, color: g.color });
      g.keys.forEach(function(key, i){
        var nd = nodeMap[key];
        if(!nd) return;
        nd.targetY = y;
        nd.depth   = laneIdx;
        // Reset position to lane with jitter so repulsion has room to spread
        nd.x  = (i - (count-1)/2) * H_SPREAD + (Math.random()-0.5)*20;
        nd.y  = y + (Math.random()-0.5)*30;
        nd.vx = 0; nd.vy = 0;
      });
    });
  }

  function computeLayout(mode){
    lanes = [];
    currentGroupMode = mode;

    if(mode === 'lineage'){
      // BFS depths
      var depths = {};
      var roots  = [];
      features.forEach(function(f){
        var hasParent = f.lineage && f.lineage.parent && nodeMap[f.lineage.parent];
        if(!hasParent){ roots.push(f.featureKey); depths[f.featureKey] = 0; }
      });
      var bfsQ = roots.slice();
      while(bfsQ.length){
        var cur = bfsQ.shift();
        features.forEach(function(f){
          if(f.lineage && f.lineage.parent === cur && depths[f.featureKey]===undefined){
            depths[f.featureKey] = depths[cur] + 1;
            bfsQ.push(f.featureKey);
          }
        });
      }
      features.forEach(function(f){ if(depths[f.featureKey]===undefined) depths[f.featureKey]=0; });

      var byDepth = {};
      var maxDepth = 0;
      features.forEach(function(f){
        var d = depths[f.featureKey];
        maxDepth = Math.max(maxDepth, d);
        if(!byDepth[d]) byDepth[d] = [];
        byDepth[d].push(f.featureKey);
      });
      var groups = [];
      for(var d=0; d<=maxDepth; d++){
        if(!byDepth[d] || !byDepth[d].length) continue;
        byDepth[d].sort();
        groups.push({
          label:    d === 0 ? 'Root' : 'Depth ' + d,
          sublabel: byDepth[d].length + ' feature' + (byDepth[d].length===1?'':'s'),
          color:    LANE_COLORS[d % LANE_COLORS.length],
          keys:     byDepth[d],
        });
      }
      assignLayer(groups);

    } else if(mode === 'domain'){
      var domainMap = {};
      features.forEach(function(f){
        var d = (f.domain||'Uncategorized').trim() || 'Uncategorized';
        if(!domainMap[d]) domainMap[d] = [];
        domainMap[d].push(f.featureKey);
      });
      var domains = Object.keys(domainMap).sort();
      if(domainMap['Uncategorized']){
        // push Uncategorized to end
        domains = domains.filter(function(d){ return d!=='Uncategorized'; });
        domains.push('Uncategorized');
      }
      var groups = domains.map(function(d, i){
        var keys = domainMap[d].slice().sort();
        return {
          label:    d,
          sublabel: keys.length + ' feature' + (keys.length===1?'':'s'),
          color:    LANE_COLORS[i % LANE_COLORS.length],
          keys:     keys,
        };
      });
      assignLayer(groups);

    } else if(mode === 'status'){
      var STATUS_ORDER = ['active', 'frozen', 'draft', 'deprecated'];
      var statusMap = {};
      features.forEach(function(f){
        var s = f.status || 'draft';
        if(!statusMap[s]) statusMap[s] = [];
        statusMap[s].push(f.featureKey);
      });
      // Also catch unknown statuses
      features.forEach(function(f){
        var s = f.status || 'draft';
        if(STATUS_ORDER.indexOf(s) === -1){
          if(!statusMap['draft']) statusMap['draft'] = [];
          statusMap['draft'].push(f.featureKey);
        }
      });
      var groups = STATUS_ORDER
        .filter(function(s){ return statusMap[s] && statusMap[s].length; })
        .map(function(s){
          var keys = statusMap[s].slice().sort();
          return {
            label:    s.charAt(0).toUpperCase() + s.slice(1),
            sublabel: keys.length + ' feature' + (keys.length===1?'':'s'),
            color:    STATUS_LANE_COLOR[s] || LANE_COLORS[0],
            keys:     keys,
          };
        });
      assignLayer(groups);

    } else if(mode === 'timeline'){
      // Group by year from earliest statusHistory entry or lastVerifiedDate
      var yearMap = {};
      features.forEach(function(f){
        var year = 'Unknown';
        if(f.statusHistory && f.statusHistory.length){
          var d = f.statusHistory[0].date || '';
          if(d.length >= 4) year = d.slice(0,4);
        } else if(f.lastVerifiedDate && f.lastVerifiedDate.length >= 4){
          year = f.lastVerifiedDate.slice(0,4);
        }
        if(!yearMap[year]) yearMap[year] = [];
        yearMap[year].push(f.featureKey);
      });
      var years = Object.keys(yearMap).filter(function(y){ return y!=='Unknown'; }).sort();
      if(yearMap['Unknown'] && yearMap['Unknown'].length) years.push('Unknown');
      var groups = years.map(function(y, i){
        var keys = yearMap[y].slice().sort();
        return {
          label:    y === 'Unknown' ? 'No date' : y,
          sublabel: keys.length + ' feature' + (keys.length===1?'':'s'),
          color:    LANE_COLORS[i % LANE_COLORS.length],
          keys:     keys,
        };
      });
      assignLayer(groups);

    } else if(mode === 'completeness'){
      var BUCKETS = [
        { label: 'Complete',  sublabel: '67 – 100%', min: 67, max: 100, color: 'rgba(74,173,114,0.05)',  keys: [] },
        { label: 'Partial',   sublabel: '34 – 66%',  min: 34, max:  66, color: 'rgba(196,162,85,0.05)',  keys: [] },
        { label: 'Sparse',    sublabel: '0 – 33%',   min:  0, max:  33, color: 'rgba(204,91,91,0.05)',   keys: [] },
      ];
      features.forEach(function(f){
        var c = completeness(f);
        for(var i=0;i<BUCKETS.length;i++){
          if(c >= BUCKETS[i].min && c <= BUCKETS[i].max){ BUCKETS[i].keys.push(f.featureKey); break; }
        }
      });
      var groups = BUCKETS
        .filter(function(b){ return b.keys.length; })
        .map(function(b){
          b.keys.sort();
          return { label: b.label, sublabel: b.sublabel + ' · ' + b.keys.length + ' features', color: b.color, keys: b.keys };
        });
      assignLayer(groups);
    }

    // Re-warm simulation
    alpha = Math.min(alpha + 0.6, 1.0);
    if(!simRunning){
      simRunning = true;
      rafId = requestAnimationFrame(tick);
    }
  }

  // ── Build edges ───────────────────────────────────────────────────────────
  var edges = [];
  features.forEach(function(f){
    if(f.lineage && f.lineage.parent){
      var parentNode = nodeMap[f.lineage.parent];
      var childNode  = nodeMap[f.featureKey];
      if(parentNode && childNode){
        edges.push({ source: parentNode, target: childNode });
      }
    }
  });

  // ── Force simulation ──────────────────────────────────────────────────────
  var K_REPEL      = 6000;   // stronger repulsion to spread siblings apart
  var K_SPRING     = 0.05;   // spring along edges
  var REST_LEN     = 180;    // rest length for edge springs
  var GRAVITY      = 0.002;  // weak center-X gravity (layer force handles Y)
  var DAMPING      = 0.78;   // heavier damping for quicker settle
  var LAYER_STRENGTH = 0.15; // attraction toward assigned Y layer
  var MIN_NODE_GAP = 40;     // minimum pixel gap between node surfaces
  var alpha        = 1.0;
  var ALPHA_DECAY  = 0.012;
  var simRunning   = true;
  var rafId        = null;

  function tick(){
    if(alpha < 0.001){
      simRunning = false;
      drawFrame();
      return;
    }

    var n = nodes.length;

    // 1. Repulsion: O(n²) — fine for <200 nodes
    for(var i=0;i<n;i++){
      for(var j=i+1;j<n;j++){
        var ni = nodes[i], nj = nodes[j];
        var dx = nj.x - ni.x;
        var dy = nj.y - ni.y;
        var dist2 = dx*dx + dy*dy;
        if(dist2 < 1) dist2 = 1;
        var dist = Math.sqrt(dist2);
        var f = K_REPEL / dist2;
        var fx = (dx/dist) * f;
        var fy = (dy/dist) * f;
        ni.vx -= fx * alpha;
        ni.vy -= fy * alpha;
        nj.vx += fx * alpha;
        nj.vy += fy * alpha;
      }
    }

    // 2. Spring attraction on edges
    for(var e=0;e<edges.length;e++){
      var edge = edges[e];
      var s = edge.source, t = edge.target;
      var dx = t.x - s.x;
      var dy = t.y - s.y;
      var dist = Math.sqrt(dx*dx+dy*dy);
      if(dist < 0.001) continue;
      var stretch = dist - REST_LEN;
      var fmag = K_SPRING * stretch;
      var fx = (dx/dist)*fmag;
      var fy = (dy/dist)*fmag;
      s.vx += fx * alpha;
      s.vy += fy * alpha;
      t.vx -= fx * alpha;
      t.vy -= fy * alpha;
    }

    // 3. Layer attraction — pull each node toward its assigned Y row
    for(var i=0;i<n;i++){
      var nd = nodes[i];
      nd.vy += (nd.targetY - nd.y) * LAYER_STRENGTH * alpha;
      // Weak X gravity toward center column only
      nd.vx += -nd.x * GRAVITY * alpha;
    }

    // 4+5. Velocity damping + position update
    for(var i=0;i<n;i++){
      var nd = nodes[i];
      nd.vx *= DAMPING;
      nd.vy *= DAMPING;
      nd.x  += nd.vx;
      nd.y  += nd.vy;
    }

    // 6. Collision correction — push overlapping nodes apart horizontally
    for(var i=0;i<n;i++){
      for(var j=i+1;j<n;j++){
        var ni = nodes[i], nj = nodes[j];
        var dx = nj.x - ni.x;
        var dy = nj.y - ni.y;
        var minDist = ni.radius + nj.radius + MIN_NODE_GAP;
        var dist = Math.sqrt(dx*dx+dy*dy);
        if(dist < minDist && dist > 0.001){
          var overlap = (minDist - dist) / 2;
          var ux = dx/dist, uy = dy/dist;
          ni.x -= ux * overlap;
          ni.y -= uy * overlap;
          nj.x += ux * overlap;
          nj.y += uy * overlap;
        }
      }
    }

    alpha -= ALPHA_DECAY;

    drawFrame();
    rafId = requestAnimationFrame(tick);
  }

  // ── Draw ──────────────────────────────────────────────────────────────────
  var selectedNode = null;

  function drawFrame(){
    ctx.clearRect(0,0,W,H);

    // Dark background gradient
    var grad = ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.max(W,H)*0.7);
    grad.addColorStop(0,'#16130f');
    grad.addColorStop(1,'#0e0c0a');
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,W,H);

    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    // Lane background bands (world space)
    drawLaneBands();

    // Draw edges
    for(var e=0;e<edges.length;e++){
      drawEdge(edges[e]);
    }

    // Draw nodes (non-selected first, selected on top)
    for(var i=0;i<nodes.length;i++){
      if(nodes[i] !== selectedNode) drawNode(nodes[i], false);
    }
    if(selectedNode) drawNode(selectedNode, true);

    ctx.restore();

    // Lane labels (screen space — always readable regardless of pan/zoom)
    drawLaneLabels();
  }

  function drawLaneBands(){
    if(!lanes.length) return;
    var BAND_H = LAYER_H;
    lanes.forEach(function(lane, i){
      // Subtle background band
      ctx.fillStyle = lane.color;
      ctx.fillRect(-8000, lane.y - BAND_H/2, 16000, BAND_H);
      // Separator line between lanes
      if(i > 0){
        ctx.beginPath();
        ctx.setLineDash([5, 10]);
        ctx.strokeStyle = 'rgba(42,36,32,0.45)';
        ctx.lineWidth = 0.5 / transform.scale; // stay 0.5px visually
        ctx.moveTo(-8000, lane.y - BAND_H/2);
        ctx.lineTo( 8000, lane.y - BAND_H/2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
  }

  function drawLaneLabels(){
    if(!lanes.length) return;
    lanes.forEach(function(lane){
      var sy = lane.y * transform.scale + transform.y;
      if(sy < 56 || sy > H + 20) return;
      // Label
      ctx.font = 'bold 10px Cascadia Code, Fira Code, JetBrains Mono, monospace';
      ctx.fillStyle = 'rgba(196,162,85,0.7)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(lane.label, 14, sy - 7);
      // Sublabel
      if(lane.sublabel){
        ctx.font = '9px Cascadia Code, Fira Code, JetBrains Mono, monospace';
        ctx.fillStyle = 'rgba(122,106,90,0.5)';
        ctx.fillText(lane.sublabel, 14, sy + 7);
      }
    });
  }

  function drawEdge(edge){
    var s = edge.source, t = edge.target;
    var dx = t.x - s.x;
    var dy = t.y - s.y;
    var dist = Math.sqrt(dx*dx+dy*dy);
    if(dist < 0.001) return;

    // In non-lineage modes edges are shown as faint relationship hints
    var isLineage = currentGroupMode === 'lineage';
    var lineAlpha  = isLineage ? 0.9 : 0.22;
    var arrowAlpha = isLineage ? 1.0 : 0.3;

    // Line (stop at node radius)
    var ux = dx/dist, uy = dy/dist;
    var x1 = s.x + ux*s.radius;
    var y1 = s.y + uy*s.radius;
    var x2 = t.x - ux*(t.radius+7); // leave room for arrowhead
    var y2 = t.y - uy*(t.radius+7);

    ctx.beginPath();
    ctx.moveTo(x1,y1);
    ctx.lineTo(x2,y2);
    if(!isLineage) ctx.setLineDash([3,6]);
    ctx.strokeStyle='rgba(42,36,32,'+lineAlpha+')';
    ctx.lineWidth=isLineage ? 1.2 : 0.8;
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrowhead at target end
    var arrowLen = isLineage ? 7 : 5;
    var arrowAng = 0.45;
    var ax = t.x - ux*(t.radius+1);
    var ay = t.y - uy*(t.radius+1);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(
      ax - arrowLen*Math.cos(Math.atan2(uy,ux)-arrowAng),
      ay - arrowLen*Math.sin(Math.atan2(uy,ux)-arrowAng)
    );
    ctx.lineTo(
      ax - arrowLen*Math.cos(Math.atan2(uy,ux)+arrowAng),
      ay - arrowLen*Math.sin(Math.atan2(uy,ux)+arrowAng)
    );
    ctx.closePath();
    ctx.fillStyle='rgba(42,36,32,'+arrowAlpha+')';
    ctx.fill();
  }

  function drawNode(node, isSelected){
    var f = node.feature;
    var r = node.radius;

    // Glow for selected
    if(isSelected){
      ctx.beginPath();
      ctx.arc(node.x, node.y, r+6, 0, Math.PI*2);
      var glow = ctx.createRadialGradient(node.x,node.y,r,node.x,node.y,r+10);
      glow.addColorStop(0,'rgba(196,162,85,0.25)');
      glow.addColorStop(1,'rgba(196,162,85,0)');
      ctx.fillStyle=glow;
      ctx.fill();
    }

    // Node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI*2);
    ctx.fillStyle = statusColor(f.status);
    ctx.fill();

    // Stroke
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI*2);
    ctx.strokeStyle = isSelected ? '#c4a255' : 'rgba(42,36,32,0.6)';
    ctx.lineWidth   = isSelected ? 2 : 1;
    ctx.stroke();

    // Label (only if zoom > 0.7)
    if(transform.scale > 0.7){
      ctx.font = '10px Cascadia Code, Fira Code, JetBrains Mono, Consolas, monospace';
      ctx.fillStyle = isSelected ? '#c4a255' : 'rgba(176,164,156,0.85)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(f.featureKey, node.x, node.y + r + 4);
    }
  }

  // ── Hit testing ───────────────────────────────────────────────────────────
  function hitTest(sx, sy){
    var world = screenToWorld(sx, sy);
    // Test in reverse order (top-most first), selected node takes priority
    var best = null;
    var bestDist = Infinity;
    for(var i=0;i<nodes.length;i++){
      var nd = nodes[i];
      var dx = world.x - nd.x;
      var dy = world.y - nd.y;
      var dist = Math.sqrt(dx*dx+dy*dy);
      if(dist <= nd.radius + 3 && dist < bestDist){
        best = nd;
        bestDist = dist;
      }
    }
    return best;
  }

  // ── Detail panel ──────────────────────────────────────────────────────────
  var panel      = document.getElementById('detail-panel');
  var detailKey  = document.getElementById('detail-key');
  var detailTitle= document.getElementById('detail-title');
  var detailBadge= document.getElementById('detail-badge');
  var detailProb = document.getElementById('detail-problem');
  var detailDec  = document.getElementById('detail-decisions');
  var detailDom  = document.getElementById('detail-domain');
  var detailComp = document.getElementById('detail-comp');
  var detailTags = document.getElementById('detail-tags');
  var detailLin  = document.getElementById('detail-lineage');

  function openPanel(node){
    var f = node.feature;
    var comp = node.comp;

    detailKey.textContent = f.featureKey;
    detailTitle.textContent = f.title;

    detailBadge.textContent = f.status;
    detailBadge.style.background = statusBg(f.status);
    detailBadge.style.border = '1px solid '+statusColorSolid(f.status)+'44';
    detailBadge.style.color  = statusColorSolid(f.status);

    var problemText = f.problem || '';
    if(problemText.length > 150) problemText = problemText.slice(0,147)+'…';
    detailProb.textContent = problemText;

    // Decisions count
    var decCount = (f.decisions && f.decisions.length) ? f.decisions.length : 0;
    detailDec.innerHTML = decCount > 0
      ? '<span class="detail-meta-label">Decisions:&nbsp;</span><span class="detail-meta-val">'+decCount+'</span>'
      : '';

    // Domain
    detailDom.innerHTML = f.domain
      ? '<span class="detail-meta-label">Domain:&nbsp;</span><span class="detail-meta-val">'+esc(f.domain)+'</span>'
      : '';

    // Completeness bar
    detailComp.innerHTML =
      '<div class="comp-bar-label">Completeness: '+comp+'%</div>'+
      '<div class="comp-bar-track"><div class="comp-bar-fill" style="width:'+comp+'%"></div></div>';

    // Tags
    detailTags.innerHTML = '';
    if(f.tags && f.tags.length){
      f.tags.forEach(function(t){
        var span = document.createElement('span');
        span.className='detail-tag';
        span.textContent=t;
        detailTags.appendChild(span);
      });
    }

    // Lineage
    detailLin.innerHTML = '';
    var hasLineage = f.lineage && (f.lineage.parent || (f.lineage.children&&f.lineage.children.length));
    if(hasLineage){
      var html = '<div class="detail-lineage-section">';
      if(f.lineage.parent){
        html += '<div class="detail-lineage-title">Parent</div>';
        html += '<span class="detail-chip" data-key="'+esc(f.lineage.parent)+'">'+esc(f.lineage.parent)+'</span>';
      }
      if(f.lineage.children && f.lineage.children.length){
        html += '<div class="detail-lineage-title" style="margin-top:10px;">Children ('+f.lineage.children.length+')</div>';
        f.lineage.children.forEach(function(ck){
          html += '<span class="detail-chip" data-key="'+esc(ck)+'">'+esc(ck)+'</span>';
        });
      }
      html += '</div>';
      detailLin.innerHTML = html;

      // Bind chip clicks
      detailLin.querySelectorAll('.detail-chip').forEach(function(chip){
        chip.addEventListener('click', function(){
          var key = chip.getAttribute('data-key');
          var targetNode = nodeMap[key];
          if(targetNode){
            selectNode(targetNode);
            flyTo(targetNode);
          }
        });
      });
    }

    panel.classList.add('open');
  }

  function closePanel(){
    panel.classList.remove('open');
    selectedNode = null;
    drawFrame();
  }

  function selectNode(node){
    selectedNode = node;
    openPanel(node);
    drawFrame();
  }

  document.getElementById('detail-close').addEventListener('click', closePanel);

  // ── Fly-to animation ──────────────────────────────────────────────────────
  function flyTo(node){
    // Center the node in the available viewport (excluding panel)
    var panelWidth = panel.classList.contains('open') ? 300 : 0;
    var targetX = (W - panelWidth) / 2 - node.x * transform.scale;
    var targetY = (H - 48)         / 2 - node.y * transform.scale + 48;

    var startX = transform.x, startY = transform.y;
    var dur = 400, start = performance.now();

    function step(now){
      var t = Math.min((now-start)/dur,1);
      // ease out cubic
      var e = 1 - Math.pow(1-t,3);
      transform.x = startX + (targetX - startX)*e;
      transform.y = startY + (targetY - startY)*e;
      drawFrame();
      if(t<1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ── Mouse interaction ─────────────────────────────────────────────────────
  var isDragging = false;
  var dragStartX = 0, dragStartY = 0;
  var dragStartTX = 0, dragStartTY = 0;
  var hasDragged  = false;
  var DRAG_THRESHOLD = 4;

  canvas.addEventListener('mousedown', function(e){
    isDragging  = true;
    hasDragged  = false;
    dragStartX  = e.clientX;
    dragStartY  = e.clientY;
    dragStartTX = transform.x;
    dragStartTY = transform.y;
    canvas.classList.add('dragging');
  });

  window.addEventListener('mousemove', function(e){
    if(!isDragging) return;
    var dx = e.clientX - dragStartX;
    var dy = e.clientY - dragStartY;
    if(Math.abs(dx)>DRAG_THRESHOLD || Math.abs(dy)>DRAG_THRESHOLD) hasDragged=true;
    if(hasDragged){
      transform.x = dragStartTX + dx;
      transform.y = dragStartTY + dy;
      drawFrame();
    }
  });

  window.addEventListener('mouseup', function(e){
    if(!isDragging) return;
    isDragging = false;
    canvas.classList.remove('dragging');
    if(!hasDragged){
      // Click: hit-test
      var hit = hitTest(e.clientX, e.clientY);
      if(hit){
        selectNode(hit);
      } else {
        closePanel();
      }
    }
  });

  // Scroll to zoom
  canvas.addEventListener('wheel', function(e){
    e.preventDefault();
    var factor = e.deltaY < 0 ? 1.1 : 0.91;
    var newScale = Math.max(0.2, Math.min(4, transform.scale * factor));

    // Zoom around mouse position
    var mx = e.clientX, my = e.clientY;
    transform.x = mx - (mx - transform.x) * (newScale/transform.scale);
    transform.y = my - (my - transform.y) * (newScale/transform.scale);
    transform.scale = newScale;
    drawFrame();
  }, {passive:false});

  // Touch support (single-finger pan, pinch-zoom)
  var lastTouches = null;
  canvas.addEventListener('touchstart', function(e){
    e.preventDefault();
    lastTouches = Array.from(e.touches);
    hasDragged = false;
    if(e.touches.length===1){
      dragStartX  = e.touches[0].clientX;
      dragStartY  = e.touches[0].clientY;
      dragStartTX = transform.x;
      dragStartTY = transform.y;
    }
  },{passive:false});

  canvas.addEventListener('touchmove', function(e){
    e.preventDefault();
    var touches = Array.from(e.touches);
    if(touches.length===1 && lastTouches && lastTouches.length===1){
      var dx = touches[0].clientX - dragStartX;
      var dy = touches[0].clientY - dragStartY;
      if(Math.abs(dx)>DRAG_THRESHOLD||Math.abs(dy)>DRAG_THRESHOLD) hasDragged=true;
      transform.x = dragStartTX + dx;
      transform.y = dragStartTY + dy;
    } else if(touches.length===2 && lastTouches && lastTouches.length===2){
      var d0 = Math.hypot(lastTouches[0].clientX-lastTouches[1].clientX, lastTouches[0].clientY-lastTouches[1].clientY);
      var d1 = Math.hypot(touches[0].clientX-touches[1].clientX, touches[0].clientY-touches[1].clientY);
      if(d0>0){
        var factor = d1/d0;
        var cx = (touches[0].clientX+touches[1].clientX)/2;
        var cy = (touches[0].clientY+touches[1].clientY)/2;
        var newScale = Math.max(0.2,Math.min(4,transform.scale*factor));
        transform.x = cx-(cx-transform.x)*(newScale/transform.scale);
        transform.y = cy-(cy-transform.y)*(newScale/transform.scale);
        transform.scale = newScale;
      }
      hasDragged = true;
    }
    lastTouches = touches;
    drawFrame();
  },{passive:false});

  canvas.addEventListener('touchend', function(e){
    if(!hasDragged && lastTouches && lastTouches.length===1){
      var t = lastTouches[0];
      var hit = hitTest(t.clientX, t.clientY);
      if(hit) selectNode(hit);
      else closePanel();
    }
    lastTouches = null;
  },{passive:false});

  // ── Reset button ──────────────────────────────────────────────────────────
  function fitLayout(){
    // Compute bounding box of all nodes
    var minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    nodes.forEach(function(nd){
      minX=Math.min(minX,nd.x-nd.radius);
      maxX=Math.max(maxX,nd.x+nd.radius);
      minY=Math.min(minY,nd.y-nd.radius);
      maxY=Math.max(maxY,nd.y+nd.radius);
    });
    if(!isFinite(minX)){ minX=-200; maxX=200; minY=-200; maxY=200; }
    var panelWidth = panel.classList.contains('open') ? 300 : 0;
    var vw = W - panelWidth;
    var vh = H - 48;
    var fw = maxX - minX + 80;
    var fh = maxY - minY + 80;
    var fitScale = Math.max(0.25, Math.min(1.2, Math.min(vw/fw, vh/fh)));
    return {
      scale: fitScale,
      x: vw/2 - ((minX+maxX)/2)*fitScale,
      y: 48 + vh/2 - ((minY+maxY)/2)*fitScale
    };
  }

  function resetView(){
    var target = fitLayout();
    var dur = 380, start = performance.now();
    var sx = transform.x, sy = transform.y, ss = transform.scale;

    function step(now){
      var t = Math.min((now-start)/dur,1);
      var e = 1-Math.pow(1-t,3);
      transform.x     = sx + (target.x-sx)*e;
      transform.y     = sy + (target.y-sy)*e;
      transform.scale = ss + (target.scale-ss)*e;
      drawFrame();
      if(t<1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  document.getElementById('btn-reset').addEventListener('click', resetView);

  // ── Group-by pills ────────────────────────────────────────────────────────
  var pills = document.querySelectorAll('.group-pill');
  pills.forEach(function(pill){
    pill.addEventListener('click', function(){
      var mode = pill.getAttribute('data-mode');
      if(mode === currentGroupMode) return;
      pills.forEach(function(p){ p.classList.remove('active'); });
      pill.classList.add('active');
      computeLayout(mode);
      // Fit view after a brief settle period
      setTimeout(function(){ resetView(); }, 300);
    });
  });

  // ── Hide instructions after 5 seconds or first interaction ───────────────
  var instructions = document.getElementById('instructions');
  var instrHidden = false;
  function hideInstructions(){
    if(instrHidden) return;
    instrHidden = true;
    instructions.classList.add('hidden');
  }
  setTimeout(hideInstructions, 5000);
  canvas.addEventListener('mousedown', hideInstructions, {once:true});
  canvas.addEventListener('wheel', hideInstructions, {once:true});

  // ── Init ──────────────────────────────────────────────────────────────────
  resize();

  // Compute initial layout (lineage mode) and place nodes
  computeLayout('lineage');

  // Fit view to the initial layout
  var initFit = fitLayout();
  transform.x     = initFit.x;
  transform.y     = initFit.y;
  transform.scale = initFit.scale;

  // Start simulation
  rafId = requestAnimationFrame(tick);

})();
</script>
</body>
</html>`;
}

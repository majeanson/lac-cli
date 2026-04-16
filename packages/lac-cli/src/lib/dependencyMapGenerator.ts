import type { Feature } from '@life-as-code/feature-schema'

interface DepNode {
  key: string
  title: string
  domain: string
  status: string
  deps: string[]        // features this one depends on
  dependents: string[]  // features that depend on this one
}

/**
 * generateDependencyMap — visualizes cross-feature runtime dependencies from externalDependencies[].
 *
 * Distinct from the lineage graph (which shows parent/child hierarchy).
 * This shows the RUNTIME dependency web — which features call into other features at runtime.
 *
 * Uses a force-directed canvas graph with:
 * - Node size = number of dependents (high coupling = larger node)
 * - Node color = domain
 * - Edge direction = dependency (A → B means A depends on B)
 * - Red edges = potential cycles
 * - Detail panel on click
 *
 * Output: lac-depmap.html
 */
export function generateDependencyMap(features: Feature[], projectName: string): string {
  function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  // Build dependency map
  const nodeMap = new Map<string, DepNode>()
  for (const f of features) {
    nodeMap.set(f.featureKey, {
      key: f.featureKey,
      title: f.title,
      domain: f.domain ?? 'misc',
      status: f.status,
      deps: [],
      dependents: [],
    })
  }

  // Wire up externalDependencies
  for (const f of features) {
    const externalDeps = (f as Record<string, unknown>)['externalDependencies'] as string[] | undefined
    if (!externalDeps || externalDeps.length === 0) continue
    const node = nodeMap.get(f.featureKey)!
    for (const dep of externalDeps) {
      // dep can be a featureKey or a file path — only wire featureKeys that exist in workspace
      if (nodeMap.has(dep)) {
        node.deps.push(dep)
        nodeMap.get(dep)!.dependents.push(f.featureKey)
      }
    }
  }

  const nodes = [...nodeMap.values()]
  const edges = nodes.flatMap(n => n.deps.map(dep => ({ from: n.key, to: dep })))

  // Detect cycles (simple DFS)
  function hasCycle(from: string, to: string, visited = new Set<string>()): boolean {
    if (from === to) return true
    if (visited.has(from)) return false
    visited.add(from)
    const node = nodeMap.get(from)
    return node?.deps.some(dep => hasCycle(dep, to, new Set(visited))) ?? false
  }
  const cycleEdges = new Set(edges.filter(e => hasCycle(e.to, e.from)).map(e => `${e.from}→${e.to}`))

  // Domains → colors
  const domains = [...new Set(nodes.map(n => n.domain))]
  const PALETTE = ['#c4a255','#e8674a','#4aad72','#5b82cc','#b87fda','#4ab8cc','#cc5b5b','#a2cc4a','#e8b865','#736455']
  const domainColor: Record<string, string> = {}
  domains.forEach((d, i) => { domainColor[d] = PALETTE[i % PALETTE.length]! })

  const graphData = JSON.stringify({
    nodes: nodes.map(n => ({
      key: n.key, title: n.title, domain: n.domain, status: n.status,
      depCount: n.deps.length, dependentCount: n.dependents.length,
      color: domainColor[n.domain] ?? '#736455',
    })),
    edges: edges.map(e => ({ from: e.from, to: e.to, isCycle: cycleEdges.has(`${e.from}→${e.to}`) })),
  })

  const isolatedCount = nodes.filter(n => n.deps.length === 0 && n.dependents.length === 0).length
  const highCouplingCount = nodes.filter(n => n.dependents.length >= 3).length

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)} — Dependency Map</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0f0d0b; --bg-card: #181512; --bg-hover: #1e1a16; --border: #262018; --text: #ece3d8; --text-mid: #b0a494; --text-soft: #736455;
  --accent: #c4a255; --mono: 'Cascadia Code','Fira Code','Consolas',monospace; --sans: -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
}
body { background: var(--bg); color: var(--text); font-family: var(--sans); font-size: 14px; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
.topbar { flex-shrink: 0; height: 46px; display: flex; align-items: center; gap: 14px; padding: 0 20px; background: #0b0a08; border-bottom: 1px solid var(--border); }
.topbar-brand { font-family: var(--mono); font-size: 13px; color: var(--accent); letter-spacing: 0.05em; }
.topbar-sep { color: var(--border); font-size: 18px; }
.topbar-title { font-size: 13px; color: var(--text-mid); }
.topbar-stats { margin-left: auto; display: flex; gap: 16px; }
.topbar-stat { font-family: var(--mono); font-size: 11px; color: var(--text-soft); }
.topbar-stat strong { color: var(--text-mid); }
.main { display: flex; flex: 1; min-height: 0; position: relative; }
canvas { flex: 1; cursor: grab; display: block; }
canvas:active { cursor: grabbing; }
.legend { position: absolute; top: 16px; left: 16px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; min-width: 180px; }
.legend-title { font-family: var(--mono); font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-soft); margin-bottom: 10px; }
.legend-items { display: flex; flex-direction: column; gap: 6px; }
.legend-item { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--text-mid); }
.legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.legend-line { width: 20px; height: 2px; flex-shrink: 0; }
.detail-panel { position: absolute; top: 16px; right: 16px; width: 280px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 18px 20px; display: none; }
.detail-panel.visible { display: block; }
.detail-key { font-family: var(--mono); font-size: 10px; color: var(--text-soft); margin-bottom: 4px; }
.detail-title { font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 8px; line-height: 1.3; }
.detail-domain { font-family: var(--mono); font-size: 10px; color: var(--text-soft); margin-bottom: 12px; }
.detail-section { margin-bottom: 10px; }
.detail-label { font-family: var(--mono); font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-soft); margin-bottom: 4px; }
.detail-links { display: flex; flex-direction: column; gap: 3px; }
.detail-link { font-family: var(--mono); font-size: 11px; color: var(--accent); opacity: 0.7; cursor: pointer; }
.detail-link:hover { opacity: 1; }
.detail-close { position: absolute; top: 10px; right: 12px; font-size: 16px; color: var(--text-soft); cursor: pointer; }
.detail-close:hover { color: var(--text); }
.detail-count { font-family: var(--mono); font-size: 11px; color: var(--text-soft); }
.empty-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 12px; color: var(--text-soft); pointer-events: none; }
.empty-title { font-size: 18px; color: var(--text-mid); font-weight: 700; }
</style>
</head>
<body>
<div class="topbar">
  <span class="topbar-brand">lac·depmap</span>
  <span class="topbar-sep">/</span>
  <span class="topbar-title">${esc(projectName)}</span>
  <div class="topbar-stats">
    <span class="topbar-stat"><strong>${nodes.length}</strong> features</span>
    <span class="topbar-stat"><strong>${edges.length}</strong> dependencies</span>
    ${highCouplingCount > 0 ? `<span class="topbar-stat" style="color:#cc5b5b"><strong>${highCouplingCount}</strong> high-coupling</span>` : ''}
    ${isolatedCount > 0 ? `<span class="topbar-stat"><strong>${isolatedCount}</strong> isolated</span>` : ''}
  </div>
</div>
<div class="main">
  <canvas id="canvas"></canvas>
  <div class="legend">
    <div class="legend-title">Legend</div>
    <div class="legend-items">
      <div class="legend-item"><div class="legend-line" style="background:#5b82cc;height:1.5px"></div> depends on</div>
      <div class="legend-item"><div class="legend-line" style="background:#cc5b5b;height:2px"></div> cycle risk</div>
      <div class="legend-item"><span style="font-family:var(--mono);font-size:11px;color:var(--text-soft)">size = dependents</span></div>
      ${domains.map(d => `<div class="legend-item"><div class="legend-dot" style="background:${domainColor[d] ?? '#736455'}"></div>${esc(d.replace(/-/g,' '))}</div>`).join('')}
    </div>
  </div>
  <div class="detail-panel" id="detail">
    <span class="detail-close" onclick="closeDetail()">×</span>
    <div class="detail-key" id="detail-key"></div>
    <div class="detail-title" id="detail-title"></div>
    <div class="detail-domain" id="detail-domain"></div>
    <div class="detail-section" id="detail-deps-section">
      <div class="detail-label">Depends on</div>
      <div class="detail-links" id="detail-deps"></div>
    </div>
    <div class="detail-section" id="detail-dependents-section">
      <div class="detail-label">Depended on by</div>
      <div class="detail-links" id="detail-dependents"></div>
    </div>
    <div class="detail-count" id="detail-isolated"></div>
  </div>
  ${edges.length === 0 ? `<div class="empty-overlay"><div class="empty-title">No dependencies mapped</div><p>Add featureKeys to externalDependencies[] in your feature.jsons.</p></div>` : ''}
</div>
<script>
const GRAPH = ${graphData};
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let W, H, dpr, nodes, edges;
let pan = { x: 0, y: 0 }, zoom = 1, dragging = false, lastMouse = null, hoveredKey = null, selectedKey = null;

function resize() {
  dpr = window.devicePixelRatio || 1;
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
}

function initNodes() {
  nodes = GRAPH.nodes.map((n, i) => {
    const angle = (i / GRAPH.nodes.length) * 2 * Math.PI;
    const r = Math.min(W, H) * 0.3;
    return { ...n, x: W/2 + r * Math.cos(angle), y: H/2 + r * Math.sin(angle), vx: 0, vy: 0 };
  });
  edges = GRAPH.edges;
}

const nodeByKey = () => new Map(nodes.map(n => [n.key, n]));

function tick() {
  const map = nodeByKey();
  // Repulsion
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;
      const force = 8000 / (dist * dist);
      const fx = (dx / dist) * force, fy = (dy / dist) * force;
      a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
    }
  }
  // Spring edges
  for (const e of edges) {
    const a = map.get(e.from), b = map.get(e.to);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx*dx + dy*dy) || 1;
    const target = 120;
    const force = (dist - target) * 0.04;
    const fx = (dx / dist) * force, fy = (dy / dist) * force;
    a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
  }
  // Gravity to center
  for (const n of nodes) {
    n.vx += (W/2 - n.x) * 0.003;
    n.vy += (H/2 - n.y) * 0.003;
  }
  // Apply + dampen
  for (const n of nodes) {
    n.x += n.vx * 0.4; n.y += n.vy * 0.4;
    n.vx *= 0.7; n.vy *= 0.7;
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(pan.x, pan.y);
  ctx.scale(zoom, zoom);
  const map = nodeByKey();
  // Edges
  for (const e of edges) {
    const a = map.get(e.from), b = map.get(e.to);
    if (!a || !b) continue;
    const isHighlighted = selectedKey && (e.from === selectedKey || e.to === selectedKey);
    ctx.globalAlpha = isHighlighted ? 1 : (selectedKey ? 0.15 : 0.5);
    ctx.strokeStyle = e.isCycle ? '#cc5b5b' : '#5b82cc';
    ctx.lineWidth = isHighlighted ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    // Arrow to B
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const bR = nodeRadius(b);
    const ex = b.x - (dx/dist) * bR;
    const ey = b.y - (dy/dist) * bR;
    ctx.lineTo(ex, ey);
    ctx.stroke();
    // Arrowhead
    const angle = Math.atan2(dy, dx);
    ctx.fillStyle = e.isCycle ? '#cc5b5b' : '#5b82cc';
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - 8*Math.cos(angle-0.4), ey - 8*Math.sin(angle-0.4));
    ctx.lineTo(ex - 8*Math.cos(angle+0.4), ey - 8*Math.sin(angle+0.4));
    ctx.closePath();
    ctx.fill();
  }
  // Nodes
  for (const n of nodes) {
    const r = nodeRadius(n);
    const isHovered = n.key === hoveredKey;
    const isSelected = n.key === selectedKey;
    ctx.globalAlpha = selectedKey && !isSelected ? 0.3 : 1;
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = n.color;
    ctx.globalAlpha *= isHovered ? 1 : 0.85;
    ctx.fill();
    if (isSelected || isHovered) {
      ctx.strokeStyle = '#ece3d8';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.globalAlpha = selectedKey && !isSelected ? 0.3 : 1;
    ctx.fillStyle = '#ece3d8';
    ctx.font = \`\${Math.max(9, Math.min(12, r * 0.7))}px monospace\`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = n.title.length > 16 ? n.title.slice(0, 14) + '…' : n.title;
    ctx.fillText(label, n.x, n.y);
  }
  ctx.restore();
}

function nodeRadius(n) {
  return Math.max(18, 18 + (n.dependentCount ?? 0) * 4);
}

function hitTest(mx, my) {
  const wx = (mx - pan.x) / zoom, wy = (my - pan.y) / zoom;
  for (const n of [...nodes].reverse()) {
    const r = nodeRadius(n);
    if ((wx-n.x)**2 + (wy-n.y)**2 < r*r) return n;
  }
  return null;
}

function showDetail(n) {
  const map = nodeByKey();
  selectedKey = n.key;
  document.getElementById('detail-key').textContent = n.key;
  document.getElementById('detail-title').textContent = n.title;
  document.getElementById('detail-domain').textContent = n.domain;
  const depsEl = document.getElementById('detail-deps');
  const depsSection = document.getElementById('detail-deps-section');
  depsEl.innerHTML = (n.depCount > 0) ? GRAPH.nodes.filter(x => {
    const node = nodes.find(nd => nd.key === n.key);
    return node && GRAPH.edges.some(e => e.from === n.key && e.to === x.key);
  }).map(x => \`<span class="detail-link" onclick="showDetail(nodes.find(nd=>nd.key==='\${x.key}'))">\${x.title}</span>\`).join('') : '';
  depsSection.style.display = n.depCount > 0 ? '' : 'none';
  const depEl = document.getElementById('detail-dependents');
  const depSection = document.getElementById('detail-dependents-section');
  depEl.innerHTML = (n.dependentCount > 0) ? GRAPH.nodes.filter(x => {
    return GRAPH.edges.some(e => e.from === x.key && e.to === n.key);
  }).map(x => \`<span class="detail-link" onclick="showDetail(nodes.find(nd=>nd.key==='\${x.key}'))">\${x.title}</span>\`).join('') : '';
  depSection.style.display = n.dependentCount > 0 ? '' : 'none';
  const isolatedEl = document.getElementById('detail-isolated');
  isolatedEl.textContent = (n.depCount === 0 && n.dependentCount === 0) ? 'Isolated — no runtime dependencies' : '';
  document.getElementById('detail').classList.add('visible');
}

function closeDetail() {
  selectedKey = null;
  document.getElementById('detail').classList.remove('visible');
}

window.addEventListener('resize', () => { resize(); });
canvas.addEventListener('mousedown', e => { dragging = true; lastMouse = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('mouseup', e => {
  if (dragging && lastMouse && Math.abs(e.clientX - lastMouse.x) < 3 && Math.abs(e.clientY - lastMouse.y) < 3) {
    const hit = hitTest(e.clientX - canvas.getBoundingClientRect().left, e.clientY - canvas.getBoundingClientRect().top);
    if (hit) showDetail(hit); else closeDetail();
  }
  dragging = false; lastMouse = null;
});
canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  if (dragging && lastMouse) {
    pan.x += e.clientX - lastMouse.x; pan.y += e.clientY - lastMouse.y;
    lastMouse = { x: e.clientX, y: e.clientY };
  }
  const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
  hoveredKey = hit ? hit.key : null;
  canvas.style.cursor = hit ? 'pointer' : (dragging ? 'grabbing' : 'grab');
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const f = e.deltaY < 0 ? 1.1 : 0.9;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  pan.x = mx - (mx - pan.x) * f;
  pan.y = my - (my - pan.y) * f;
  zoom *= f;
}, { passive: false });

resize();
initNodes();
let frame = 0;
function loop() {
  if (frame < 200) tick();
  frame++;
  draw();
  requestAnimationFrame(loop);
}
loop();
</script>
</body>
</html>`
}

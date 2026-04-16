/**
 * pitchGenerator — Demo Slide Deck
 *
 * Full-screen, keyboard-navigable slide presentation generated from feature data.
 * Arrow keys / Space to advance. Touch swipe supported. Press G for slide grid overview.
 * Press P for presenter notes (decisions/analysis in faint text).
 *
 * Slide types:
 *   cover     — project name + tagline + stats
 *   overview  — status breakdown + domain chips
 *   domain    — one per domain: name, feature list, stat
 *   feature   — frozen features with userGuide (the "what you can do" slides)
 *   decisions — top 3 architectural decisions
 *   roadmap   — active features by priority
 *   outro     — "Built with LAC" + link
 */

type Rec = Record<string, unknown>

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function firstSentence(s: unknown): string {
  if (typeof s !== 'string') return ''
  const match = s.match(/^[^.!?]*[.!?]/)
  return match ? match[0].trim() : s.trim().slice(0, 120)
}
function hasText(v: unknown, min = 1): boolean {
  return typeof v === 'string' && v.trim().length >= min
}

const DOMAIN_HUE: Record<string, number> = {
  'app-shell': 215, 'auth': 195, 'recording': 10, 'editing': 35,
  'sessions': 265, 'versioning': 155, 'collaboration': 320, 'band': 55,
  'render': 180, 'storage': 240,
}

function domainBg(domain: string): string {
  const hue = DOMAIN_HUE[domain] ?? 215
  return `radial-gradient(ellipse at 30% 40%, hsl(${hue},28%,12%) 0%, #0d0b09 70%)`
}

const STATUS_COLOR: Record<string, string> = {
  frozen: '#5b82cc', active: '#4aad72', draft: '#c4a255', deprecated: '#664444',
}

export function generatePitch(features: Rec[], projectName: string): string {
  const domains = [...new Set(features.map(f => (f['domain'] as string) || 'misc'))].sort()
  const byDomain = new Map<string, Rec[]>()
  for (const f of features) {
    const d = (f['domain'] as string) || 'misc'
    if (!byDomain.has(d)) byDomain.set(d, [])
    byDomain.get(d)!.push(f)
  }

  const frozen = features.filter(f => f['status'] === 'frozen')
  const active = features.filter(f => f['status'] === 'active')
  const draft = features.filter(f => f['status'] === 'draft')
  const frozenWithGuide = frozen.filter(f => hasText(f['userGuide'], 20)).sort(
    (a, b) => ((a['priority'] as number) ?? 99) - ((b['priority'] as number) ?? 99)
  )

  // Top decisions (by rationale length)
  const allDecisions: Array<{ decision: string; rationale: string; domain: string; feature: string }> = []
  for (const f of features) {
    const decs = f['decisions']
    if (!Array.isArray(decs)) continue
    for (const d of decs) {
      const obj = d as Record<string, unknown>
      const rationale = typeof obj['rationale'] === 'string' ? obj['rationale'] : ''
      if (rationale.length > 40) {
        allDecisions.push({
          decision: String(obj['decision'] ?? ''),
          rationale,
          domain: (f['domain'] as string) || '',
          feature: (f['title'] as string) || '',
        })
      }
    }
  }
  allDecisions.sort((a, b) => b.rationale.length - a.rationale.length)
  const topDecisions = allDecisions.slice(0, 3)

  // Best tagline: first sentence of highest-priority frozen feature's problem
  const taglineSource = frozen.sort((a, b) => ((a['priority'] as number) ?? 99) - ((b['priority'] as number) ?? 99))[0]
  const tagline = taglineSource ? firstSentence(taglineSource['problem']) : ''

  // Build slides JSON data
  interface Slide {
    type: string
    [key: string]: unknown
  }
  const slides: Slide[] = []

  // Cover
  slides.push({
    type: 'cover',
    title: projectName,
    tagline: tagline || `${features.length} features across ${domains.length} domains`,
    stats: { total: features.length, frozen: frozen.length, active: active.length, draft: draft.length, domains: domains.length },
  })

  // Overview
  slides.push({
    type: 'overview',
    title: 'At a Glance',
    stats: { frozen: frozen.length, active: active.length, draft: draft.length },
    domains,
  })

  // Domain slides
  for (const domain of domains) {
    const domFeats = (byDomain.get(domain) ?? []).sort((a, b) =>
      ((a['priority'] as number) ?? 99) - ((b['priority'] as number) ?? 99)
    )
    slides.push({
      type: 'domain',
      domain,
      title: domain.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      features: domFeats.slice(0, 8).map(f => ({
        title: f['title'],
        status: f['status'],
        key: f['featureKey'],
      })),
      total: domFeats.length,
      frozen: domFeats.filter(f => f['status'] === 'frozen').length,
    })
  }

  // Feature slides (frozen with userGuide)
  for (const f of frozenWithGuide.slice(0, 12)) {
    const decs = Array.isArray(f['decisions']) ? f['decisions'] as Rec[] : []
    const topDec = decs[0] ? String((decs[0] as Rec)['rationale'] ?? '') : ''
    slides.push({
      type: 'feature',
      domain: (f['domain'] as string) || '',
      title: f['title'],
      userGuide: f['userGuide'],
      keyDecision: firstSentence(topDec),
      key: f['featureKey'],
    })
  }

  // Decisions slide
  if (topDecisions.length > 0) {
    slides.push({
      type: 'decisions',
      title: 'What We Decided',
      decisions: topDecisions.map(d => ({
        decision: d.decision.slice(0, 100),
        rationale: firstSentence(d.rationale),
        domain: d.domain,
        feature: d.feature,
      })),
    })
  }

  // Roadmap slide
  if (active.length > 0) {
    slides.push({
      type: 'roadmap',
      title: "What's Next",
      features: active.sort((a, b) =>
        ((a['priority'] as number) ?? 99) - ((b['priority'] as number) ?? 99)
      ).slice(0, 8).map(f => ({
        title: f['title'],
        domain: f['domain'],
        priority: f['priority'],
        problem: firstSentence(f['problem']),
      })),
    })
  }

  // Outro
  slides.push({
    type: 'outro',
    stats: { frozen: frozen.length, domains: domains.length, total: features.length },
  })

  const slidesJson = JSON.stringify(slides).replace(/<\/script>/gi, '<\\/script>')
  const domainBgMap: Record<string, string> = {}
  for (const d of domains) domainBgMap[d] = domainBg(d)
  const domainBgJson = JSON.stringify(domainBgMap).replace(/<\/script>/gi, '<\\/script>')
  const statusColorJson = JSON.stringify(STATUS_COLOR).replace(/<\/script>/gi, '<\\/script>')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(projectName)} — Pitch Deck</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; background: #0d0b09; color: #e8e0d4; font-family: system-ui, -apple-system, sans-serif; }

.deck { position: fixed; inset: 0; }

/* Slide */
.slide {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  justify-content: center; align-items: center;
  padding: 48px 64px;
  transform: translateX(100%);
  transition: transform 0.42s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: transform;
}
.slide.active  { transform: translateX(0); }
.slide.prev    { transform: translateX(-100%); }

/* Cover */
.cover { background: radial-gradient(ellipse at 30% 30%, #1a1508 0%, #0d0b09 65%); }
.cover-eyebrow { font-size: 13px; color: #d4a853; font-family: monospace; letter-spacing: .15em; text-transform: uppercase; margin-bottom: 20px; }
.cover-title { font-size: clamp(36px, 6vw, 72px); font-weight: 800; text-align: center; line-height: 1.1; letter-spacing: -.02em; margin-bottom: 20px; }
.cover-tagline { font-size: clamp(14px, 2vw, 20px); color: #8a7f74; text-align: center; max-width: 640px; line-height: 1.55; margin-bottom: 40px; }
.cover-pills { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; }
.cover-pill { font-size: 13px; padding: 6px 16px; border-radius: 20px; border: 1px solid #2a2724; color: #8a7f74; font-family: monospace; }
.cover-pill span { color: #d4a853; font-weight: 700; }

/* Overview */
.overview { background: #0d0b09; }
.slide-title { font-size: clamp(24px, 4vw, 48px); font-weight: 700; text-align: center; margin-bottom: 40px; letter-spacing: -.01em; }
.overview-stats { display: flex; gap: 40px; margin-bottom: 48px; flex-wrap: wrap; justify-content: center; }
.stat-block { text-align: center; }
.stat-num { font-size: clamp(48px, 7vw, 88px); font-weight: 800; font-family: monospace; }
.stat-label { font-size: 14px; color: #8a7f74; margin-top: 4px; }
.domain-cloud { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; max-width: 700px; }
.domain-chip { font-size: 13px; padding: 6px 14px; border-radius: 14px; background: #1a1714; border: 1px solid #2a2724; color: #8a7f74; }

/* Domain slide */
.domain-slide { text-align: left; align-items: flex-start; }
.domain-eyebrow { font-size: 11px; color: #d4a853; font-family: monospace; letter-spacing: .15em; text-transform: uppercase; margin-bottom: 16px; }
.domain-title { font-size: clamp(32px, 5vw, 64px); font-weight: 800; letter-spacing: -.02em; margin-bottom: 32px; }
.domain-features { display: flex; flex-direction: column; gap: 10px; max-width: 640px; }
.domain-feat { display: flex; align-items: center; gap: 12px; }
.feat-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.feat-title { font-size: clamp(13px, 1.8vw, 18px); color: #c8c0b4; line-height: 1.3; }
.domain-stat { margin-top: 32px; font-size: 13px; color: #8a7f74; font-family: monospace; }

/* Feature slide */
.feature-slide { align-items: flex-start; text-align: left; }
.feature-domain { font-size: 11px; color: #d4a853; font-family: monospace; letter-spacing: .15em; text-transform: uppercase; margin-bottom: 16px; }
.feature-title { font-size: clamp(24px, 4vw, 48px); font-weight: 700; line-height: 1.2; letter-spacing: -.01em; margin-bottom: 24px; max-width: 800px; }
.feature-guide-label { font-size: 11px; color: #4aad72; font-family: monospace; text-transform: uppercase; letter-spacing: .1em; margin-bottom: 10px; }
.feature-guide { font-size: clamp(15px, 2vw, 20px); color: #c8c0b4; line-height: 1.65; max-width: 680px; margin-bottom: 28px; }
.feature-decision { font-size: 13px; color: #8a7f74; border-left: 2px solid #d4a853; padding-left: 12px; max-width: 600px; line-height: 1.5; }
.feature-key { font-size: 10px; color: #3a3530; font-family: monospace; position: absolute; bottom: 60px; right: 64px; }

/* Decisions slide */
.decisions-grid { display: flex; gap: 24px; flex-wrap: wrap; justify-content: center; max-width: 960px; }
.decision-card {
  flex: 1; min-width: 240px; max-width: 280px;
  background: #1a1714; border: 1px solid #2a2724; border-radius: 12px;
  padding: 20px 18px;
}
.decision-meta { font-size: 10px; color: #8a7f74; font-family: monospace; margin-bottom: 10px; }
.decision-text { font-size: 14px; font-weight: 600; color: #e8e0d4; line-height: 1.4; margin-bottom: 10px; }
.decision-rationale { font-size: 12px; color: #8a7f74; line-height: 1.55; }

/* Roadmap */
.roadmap-grid { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; max-width: 960px; }
.roadmap-card {
  background: #1a1714; border: 1px solid #2a2724; border-radius: 10px;
  padding: 16px 16px 14px; min-width: 200px; max-width: 240px; flex: 1;
}
.roadmap-domain { font-size: 10px; color: #d4a853; font-family: monospace; margin-bottom: 6px; }
.roadmap-title { font-size: 13px; font-weight: 600; line-height: 1.35; margin-bottom: 6px; }
.roadmap-problem { font-size: 11px; color: #8a7f74; line-height: 1.4; }

/* Outro */
.outro { background: radial-gradient(ellipse at 70% 60%, #0f1008 0%, #0d0b09 65%); }
.outro-title { font-size: clamp(28px, 5vw, 56px); font-weight: 800; margin-bottom: 12px; letter-spacing: -.01em; }
.outro-sub { font-size: 16px; color: #8a7f74; margin-bottom: 40px; }
.outro-stats { display: flex; gap: 32px; flex-wrap: wrap; justify-content: center; margin-bottom: 40px; }
.outro-stat { text-align: center; }
.outro-num { font-size: 40px; font-weight: 800; font-family: monospace; color: #d4a853; }
.outro-label { font-size: 12px; color: #8a7f74; }
.lac-badge { font-size: 12px; color: #4a4540; font-family: monospace; }

/* Nav */
.nav { position: fixed; bottom: 0; left: 0; right: 0; display: flex; align-items: center; padding: 0 32px; height: 52px; background: rgba(13,11,9,.85); backdrop-filter: blur(8px); z-index: 100; gap: 16px; }
.progress-track { flex: 1; height: 2px; background: #2a2724; border-radius: 1px; overflow: hidden; }
.progress-bar { height: 100%; background: #d4a853; border-radius: 1px; transition: width .3s ease; }
.slide-counter { font-size: 12px; color: #8a7f74; font-family: monospace; min-width: 48px; text-align: right; }
.nav-btn { width: 32px; height: 32px; border-radius: 6px; border: 1px solid #2a2724; background: transparent; color: #8a7f74; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; transition: all .15s; }
.nav-btn:hover { border-color: #d4a853; color: #d4a853; }
.key-hint { font-size: 10px; color: #3a3530; font-family: monospace; }

/* Grid overview */
.grid-overlay {
  position: fixed; inset: 0; background: rgba(13,11,9,.96); z-index: 200;
  display: none; overflow-y: auto; padding: 24px;
}
.grid-overlay.visible { display: block; }
.grid-title { font-size: 14px; color: #8a7f74; font-family: monospace; margin-bottom: 16px; letter-spacing: .05em; }
.grid-slides { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
.grid-thumb {
  aspect-ratio: 16/9; border: 1px solid #2a2724; border-radius: 6px; background: #1a1714;
  cursor: pointer; display: flex; flex-direction: column; justify-content: center; align-items: center;
  padding: 10px; text-align: center; transition: border-color .15s; overflow: hidden;
}
.grid-thumb:hover { border-color: #d4a853; }
.grid-thumb.active-thumb { border-color: #d4a853; border-width: 2px; }
.grid-num { font-size: 9px; color: #4a4540; font-family: monospace; margin-bottom: 4px; }
.grid-thumb-title { font-size: 10px; color: #8a7f74; line-height: 1.3; }
.grid-thumb-type { font-size: 9px; color: #4a4540; font-family: monospace; margin-top: 3px; }
</style>
</head>
<body>
<div class="deck" id="deck"></div>

<div class="nav">
  <button class="nav-btn" onclick="prev()" title="Previous (←)">‹</button>
  <div class="progress-track"><div class="progress-bar" id="prog"></div></div>
  <div class="slide-counter" id="counter">1 / ${slides.length}</div>
  <button class="nav-btn" onclick="next()" title="Next (→ or Space)">›</button>
  <span class="key-hint">G=grid P=notes</span>
</div>

<div class="grid-overlay" id="grid-overlay">
  <div class="grid-title">◈ SLIDE OVERVIEW — click to jump · G or Esc to close</div>
  <div class="grid-slides" id="grid-slides"></div>
</div>

<script>
const SLIDES = ${slidesJson};
const DOMAIN_BG = ${domainBgJson};
const STATUS_COLOR = ${statusColorJson};

let current = 0;
let presenterMode = false;
let gridVisible = false;

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderSlide(slide, idx) {
  const isActive = idx === current;
  const isPrev = idx < current;
  const cls = isActive ? 'active' : isPrev ? 'prev' : '';

  if (slide.type === 'cover') {
    const s = slide.stats;
    return \`<div class="slide cover \${cls}" data-idx="\${idx}">
      <div class="cover-eyebrow">◈ life-as-code</div>
      <div class="cover-title">\${esc(slide.title)}</div>
      \${slide.tagline ? \`<div class="cover-tagline">\${esc(slide.tagline)}</div>\` : ''}
      <div class="cover-pills">
        <div class="cover-pill"><span>\${s.frozen}</span> shipped</div>
        <div class="cover-pill"><span>\${s.active}</span> active</div>
        <div class="cover-pill"><span>\${s.draft}</span> planned</div>
        <div class="cover-pill"><span>\${s.domains}</span> domains</div>
        <div class="cover-pill"><span>\${s.total}</span> features</div>
      </div>
    </div>\`;
  }

  if (slide.type === 'overview') {
    const s = slide.stats;
    return \`<div class="slide \${cls}" data-idx="\${idx}" style="background:#0d0b09">
      <div class="slide-title">\${esc(slide.title)}</div>
      <div class="overview-stats">
        <div class="stat-block"><div class="stat-num" style="color:#5b82cc">\${s.frozen}</div><div class="stat-label">shipped features</div></div>
        <div class="stat-block"><div class="stat-num" style="color:#4aad72">\${s.active}</div><div class="stat-label">in progress</div></div>
        <div class="stat-block"><div class="stat-num" style="color:#c4a255">\${s.draft}</div><div class="stat-label">planned</div></div>
      </div>
      <div class="domain-cloud">
        \${slide.domains.map(d => \`<span class="domain-chip">\${esc(d)}</span>\`).join('')}
      </div>
    </div>\`;
  }

  if (slide.type === 'domain') {
    const bg = DOMAIN_BG[slide.domain] || 'radial-gradient(ellipse at 30% 40%, #181410 0%, #0d0b09 70%)';
    return \`<div class="slide domain-slide \${cls}" data-idx="\${idx}" style="background:\${bg}">
      <div class="domain-eyebrow">domain</div>
      <div class="domain-title">\${esc(slide.title)}</div>
      <div class="domain-features">
        \${slide.features.map(f => \`<div class="domain-feat">
          <span class="feat-dot" style="background:\${STATUS_COLOR[f.status]||'#888'}"></span>
          <span class="feat-title">\${esc(f.title)}</span>
        </div>\`).join('')}
      </div>
      <div class="domain-stat">\${slide.total} feature\${slide.total!==1?'s':''} · \${slide.frozen} shipped</div>
    </div>\`;
  }

  if (slide.type === 'feature') {
    const bg = DOMAIN_BG[slide.domain] || 'radial-gradient(ellipse at 30% 40%, #181410 0%, #0d0b09 70%)';
    return \`<div class="slide feature-slide \${cls}" data-idx="\${idx}" style="background:\${bg}">
      <div class="feature-domain">\${esc(slide.domain)}</div>
      <div class="feature-title">\${esc(slide.title)}</div>
      <div class="feature-guide-label">what you can do</div>
      <div class="feature-guide">\${esc(String(slide.userGuide||''))}</div>
      \${slide.keyDecision && presenterMode ? \`<div class="feature-decision">💡 \${esc(slide.keyDecision)}</div>\` : ''}
      <div class="feature-key">\${esc(slide.key)}</div>
    </div>\`;
  }

  if (slide.type === 'decisions') {
    return \`<div class="slide \${cls}" data-idx="\${idx}" style="background:#0d0b09">
      <div class="slide-title">\${esc(slide.title)}</div>
      <div class="decisions-grid">
        \${slide.decisions.map(d => \`<div class="decision-card">
          <div class="decision-meta">\${esc(d.domain)} · \${esc(d.feature.slice(0,40))}</div>
          <div class="decision-text">\${esc(d.decision)}</div>
          <div class="decision-rationale">\${esc(d.rationale)}</div>
        </div>\`).join('')}
      </div>
    </div>\`;
  }

  if (slide.type === 'roadmap') {
    return \`<div class="slide \${cls}" data-idx="\${idx}" style="background:#0d0b09">
      <div class="slide-title">\${esc(slide.title)}</div>
      <div class="roadmap-grid">
        \${slide.features.map(f => \`<div class="roadmap-card">
          \${f.domain ? \`<div class="roadmap-domain">\${esc(f.domain)}</div>\` : ''}
          <div class="roadmap-title">\${esc(f.title)}</div>
          \${f.problem ? \`<div class="roadmap-problem">\${esc(f.problem)}</div>\` : ''}
        </div>\`).join('')}
      </div>
    </div>\`;
  }

  if (slide.type === 'outro') {
    const s = slide.stats;
    return \`<div class="slide outro \${cls}" data-idx="\${idx}">
      <div class="outro-title">\${esc(SLIDES[0].title)}</div>
      <div class="outro-sub">Built with life-as-code</div>
      <div class="outro-stats">
        <div class="outro-stat"><div class="outro-num">\${s.frozen}</div><div class="outro-label">features shipped</div></div>
        <div class="outro-stat"><div class="outro-num">\${s.domains}</div><div class="outro-label">domains</div></div>
        <div class="outro-stat"><div class="outro-num">\${s.total}</div><div class="outro-label">total features</div></div>
      </div>
      <div class="lac-badge">◈ lac · /lac/</div>
    </div>\`;
  }

  return \`<div class="slide \${cls}" data-idx="\${idx}" style="background:#0d0b09">
    <div class="slide-title">\${esc(slide.title||slide.type)}</div>
  </div>\`;
}

function render() {
  const deck = document.getElementById('deck');
  const start = Math.max(0, current - 1);
  const end = Math.min(SLIDES.length - 1, current + 1);

  // Remove stale slides
  deck.querySelectorAll('.slide').forEach(el => {
    const idx = parseInt(el.dataset.idx, 10);
    if (idx < start || idx > end) el.remove();
  });

  // Render/update visible slides
  for (let i = start; i <= end; i++) {
    const existing = deck.querySelector(\`.slide[data-idx="\${i}"]\`);
    const html = renderSlide(SLIDES[i], i);
    if (existing) {
      const cls = i === current ? 'active' : i < current ? 'prev' : '';
      existing.className = existing.className.replace(/\\b(active|prev)\\b/g, '').trim() + (cls ? ' ' + cls : '');
    } else {
      deck.insertAdjacentHTML('beforeend', html);
    }
  }

  // Progress
  const pct = SLIDES.length > 1 ? (current / (SLIDES.length - 1)) * 100 : 100;
  document.getElementById('prog').style.width = pct + '%';
  document.getElementById('counter').textContent = (current + 1) + ' / ' + SLIDES.length;

  // Grid thumbs
  document.querySelectorAll('.grid-thumb').forEach(el => {
    const idx = parseInt(el.dataset.idx, 10);
    el.classList.toggle('active-thumb', idx === current);
  });
}

function next() { if (current < SLIDES.length - 1) { current++; render(); } }
function prev() { if (current > 0) { current--; render(); } }

function toggleGrid() {
  gridVisible = !gridVisible;
  const overlay = document.getElementById('grid-overlay');
  overlay.classList.toggle('visible', gridVisible);
  if (gridVisible && !document.getElementById('grid-slides').children.length) {
    document.getElementById('grid-slides').innerHTML = SLIDES.map((s, i) =>
      \`<div class="grid-thumb\${i===current?' active-thumb':''}" data-idx="\${i}" onclick="jumpTo(\${i})">
        <div class="grid-num">\${i+1}</div>
        <div class="grid-thumb-title">\${esc(s.title||s.type)}</div>
        <div class="grid-thumb-type">\${esc(s.type)}</div>
      </div>\`
    ).join('');
  }
}

function jumpTo(idx) {
  current = idx;
  gridVisible = false;
  document.getElementById('grid-overlay').classList.remove('visible');
  render();
}

// Keyboard
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
  else if (e.key === 'g' || e.key === 'G') toggleGrid();
  else if (e.key === 'Escape' && gridVisible) { gridVisible = false; document.getElementById('grid-overlay').classList.remove('visible'); }
  else if (e.key === 'p' || e.key === 'P') { presenterMode = !presenterMode; render(); }
});

// Touch swipe
let tx = 0;
document.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
document.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - tx;
  if (Math.abs(dx) > 50) dx < 0 ? next() : prev();
});

// Init
render();
</script>
</body>
</html>`
}

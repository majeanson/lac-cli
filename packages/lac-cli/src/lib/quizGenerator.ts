import type { Feature } from "@life-as-code/feature-schema";

export function generateQuiz(features: Feature[], projectName: string): string {
  function esc(s: string): string {
    return s
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  const domains = [...new Set(features.map((f) => f.domain).filter(Boolean))].sort() as string[];

  const featuresJson = JSON.stringify(
    features.map((f) => ({
      featureKey: f.featureKey,
      title: f.title,
      status: f.status,
      domain: f.domain ?? "",
      problem: f.problem ?? "",
      userGuide: f.userGuide ?? "",
      successCriteria: f.successCriteria ?? "",
      analysis: f.analysis ? f.analysis.slice(0, 600) : "",
      implementation: f.implementation ? f.implementation.slice(0, 800) : "",
      decisions: (f.decisions ?? []).map(d => ({ decision: d.decision ?? "", rationale: d.rationale ?? "" })),
      knownLimitations: f.knownLimitations ?? [],
    }))
  );

  const domainPillsHtml = ["All", ...domains]
    .map((d, i) =>
      `<button class="domain-pill${i === 0 ? " active" : ""}" data-domain="${esc(d)}">${esc(d)}</button>`
    ).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)} · Feature Quiz</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#12100e;--bg-card:#1a1714;--bg-hover:#201d1a;
  --border:#2a2420;--border-soft:#221e1b;
  --text:#e8ddd4;--text-mid:#b0a49c;--text-soft:#7a6a5a;
  --accent:#c4a255;
  --mono:'Cascadia Code','Fira Code','JetBrains Mono','Consolas',monospace;
  --sans:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  --status-active:#4aad72;--status-draft:#c4a255;--status-frozen:#5b82cc;--status-deprecated:#cc5b5b;
}
html,body{
  width:100%;height:100%;background:var(--bg);color:var(--text);
  font-family:var(--sans);-webkit-font-smoothing:antialiased;overflow:hidden;
}

/* Topbar */
#topbar{
  position:fixed;top:0;left:0;right:0;height:48px;
  background:rgba(14,12,10,0.92);backdrop-filter:blur(8px);
  border-bottom:1px solid var(--border);
  display:flex;align-items:center;padding:0 20px;gap:12px;z-index:100;
  user-select:none;
}
#topbar-brand{font-family:var(--mono);font-size:0.8rem;color:var(--accent);letter-spacing:0.05em;white-space:nowrap;}
#topbar-sep{color:var(--border);}
#topbar-project{font-size:0.88rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;}
#topbar-count{font-family:var(--mono);font-size:0.7rem;color:var(--text-soft);}
#topbar-right{margin-left:auto;display:flex;align-items:center;gap:8px;}

/* View pills */
.view-label{font-family:var(--mono);font-size:0.62rem;color:var(--text-soft);text-transform:uppercase;letter-spacing:0.06em;white-space:nowrap;}
#view-pills{display:flex;gap:3px;}
.view-pill{
  padding:3px 10px;border-radius:999px;border:1px solid var(--border);
  background:transparent;color:var(--text-soft);
  font-family:var(--mono);font-size:0.66rem;cursor:pointer;white-space:nowrap;
  transition:background 0.13s,color 0.13s,border-color 0.13s;
}
.view-pill:hover{border-color:var(--accent);color:var(--accent);}
.view-pill.active{background:rgba(196,162,85,0.13);border-color:var(--accent);color:var(--accent);}

/* Control buttons */
.ctrl-btn{
  padding:4px 12px;border-radius:6px;border:1px solid var(--border);
  background:var(--bg-card);color:var(--text-mid);
  font-family:var(--mono);font-size:0.7rem;cursor:pointer;
  transition:background 0.13s,color 0.13s;
}
.ctrl-btn:hover{background:var(--bg-hover);color:var(--accent);border-color:var(--accent);}

/* Domain filter bar */
#filter-bar{
  position:fixed;top:48px;left:0;right:0;
  background:rgba(14,12,10,0.85);border-bottom:1px solid var(--border);
  display:flex;align-items:center;gap:6px;padding:6px 20px;
  overflow-x:auto;scrollbar-width:none;z-index:90;
}
#filter-bar::-webkit-scrollbar{display:none;}
.filter-label{font-family:var(--mono);font-size:0.62rem;color:var(--text-soft);white-space:nowrap;}
.domain-pill{
  padding:2px 10px;border-radius:999px;border:1px solid var(--border);
  background:transparent;color:var(--text-soft);
  font-family:var(--mono);font-size:0.65rem;cursor:pointer;white-space:nowrap;
  transition:background 0.12s,color 0.12s,border-color 0.12s;
}
.domain-pill:hover{border-color:var(--accent);color:var(--accent);}
.domain-pill.active{background:rgba(196,162,85,0.12);border-color:var(--accent);color:var(--accent);}

/* Progress */
#progress-track{
  position:fixed;top:80px;left:0;right:0;height:3px;
  background:var(--border);z-index:89;
}
#progress-fill{height:100%;background:var(--accent);transition:width 0.3s ease;width:0%;}
#progress-text{
  position:fixed;top:84px;right:20px;
  font-family:var(--mono);font-size:0.68rem;color:var(--text-soft);z-index:89;
}

/* Main area */
#quiz-area{
  position:fixed;top:112px;left:0;right:0;bottom:0;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:16px 20px 80px;
  overflow-y:auto;
}

/* Card */
#card{
  width:100%;max-width:680px;
  background:var(--bg-card);border:1px solid var(--border);
  border-radius:12px;padding:28px 32px;
  transition:opacity 0.2s;
}

/* Card header */
#card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
#feature-key{font-family:var(--mono);font-size:0.78rem;color:var(--accent);letter-spacing:0.04em;}
.status-badge{
  display:inline-block;padding:2px 10px;border-radius:999px;
  font-family:var(--mono);font-size:0.65rem;
}
#feature-title{font-size:1.25rem;font-weight:700;line-height:1.3;margin-bottom:8px;}
#domain-chip{
  display:inline-block;padding:2px 9px;border-radius:999px;
  background:var(--bg-hover);border:1px solid var(--border);
  font-family:var(--mono);font-size:0.65rem;color:var(--text-soft);
  margin-bottom:16px;
}

/* Context block */
.section-label{
  font-family:var(--mono);font-size:0.62rem;letter-spacing:0.1em;
  text-transform:uppercase;color:var(--text-soft);margin-bottom:6px;
}
#feature-problem{
  font-size:0.9rem;color:var(--text-mid);line-height:1.65;
  padding:12px 16px;background:rgba(196,162,85,0.04);
  border-left:2px solid rgba(196,162,85,0.3);border-radius:0 6px 6px 0;
  margin-bottom:20px;
}

/* Divider */
.card-divider{height:1px;background:var(--border-soft);margin:16px 0;}

/* Question */
#question-wrap{margin-bottom:20px;}
#question-text{
  font-size:0.95rem;font-weight:600;color:var(--text);
  line-height:1.4;margin-bottom:4px;
}
#question-hint{font-size:0.78rem;color:var(--text-soft);}

/* Reveal button */
#reveal-btn{
  display:block;width:100%;padding:12px;
  background:rgba(196,162,85,0.08);border:1px solid rgba(196,162,85,0.3);
  border-radius:8px;color:var(--accent);
  font-family:var(--mono);font-size:0.82rem;font-weight:600;
  cursor:pointer;text-align:center;letter-spacing:0.04em;
  transition:background 0.15s,border-color 0.15s;
}
#reveal-btn:hover{background:rgba(196,162,85,0.15);border-color:var(--accent);}

/* Answer */
#answer-area{display:none;}
#answer-content{
  font-size:0.88rem;color:var(--text-mid);line-height:1.7;
  padding:14px 16px;background:rgba(255,255,255,0.03);
  border:1px solid var(--border);border-radius:8px;
  margin-bottom:16px;max-height:260px;overflow-y:auto;
  scrollbar-width:thin;scrollbar-color:var(--border) transparent;
}
#answer-content code{
  font-family:var(--mono);font-size:0.82em;
  background:rgba(196,162,85,0.1);border:1px solid rgba(196,162,85,0.2);
  padding:1px 4px;border-radius:3px;color:var(--accent);
}
#answer-content ul{margin:6px 0 6px 16px;}
#answer-content li{margin-bottom:4px;}
.answer-empty{color:var(--text-soft);font-style:italic;}

/* Verdict buttons */
#verdict-btns{display:flex;gap:10px;}
.verdict-btn{
  flex:1;padding:10px 16px;border-radius:8px;
  font-family:var(--mono);font-size:0.78rem;font-weight:600;
  cursor:pointer;border:1px solid;transition:all 0.13s;
}
#btn-got-it{
  background:rgba(74,173,114,0.08);border-color:rgba(74,173,114,0.3);color:#4aad72;
}
#btn-got-it:hover{background:rgba(74,173,114,0.18);border-color:#4aad72;}
#btn-needs-work{
  background:rgba(204,91,91,0.08);border-color:rgba(204,91,91,0.3);color:#cc5b5b;
}
#btn-needs-work:hover{background:rgba(204,91,91,0.18);border-color:#cc5b5b;}

/* Nav */
#nav-row{
  position:fixed;bottom:0;left:0;right:0;height:64px;
  background:rgba(14,12,10,0.92);border-top:1px solid var(--border);
  display:flex;align-items:center;justify-content:center;gap:16px;z-index:100;
}
.nav-btn{
  padding:8px 24px;border-radius:8px;
  background:var(--bg-card);border:1px solid var(--border);
  color:var(--text-mid);font-family:var(--mono);font-size:0.78rem;
  cursor:pointer;transition:background 0.13s,color 0.13s,border-color 0.13s;
}
.nav-btn:hover{background:var(--bg-hover);color:var(--accent);border-color:var(--accent);}
.nav-btn:disabled{opacity:0.3;cursor:not-allowed;}
#score-display{font-family:var(--mono);font-size:0.72rem;color:var(--text-soft);min-width:80px;text-align:center;}

/* End screen */
#end-screen{
  display:none;flex-direction:column;align-items:center;
  gap:16px;text-align:center;
  width:100%;max-width:500px;
}
#end-score{font-size:3rem;font-weight:700;color:var(--accent);font-family:var(--mono);}
#end-label{font-size:1rem;color:var(--text-mid);}
#end-breakdown{font-family:var(--mono);font-size:0.78rem;color:var(--text-soft);}
.end-btn{
  padding:10px 28px;border-radius:8px;border:1px solid var(--border);
  background:var(--bg-card);color:var(--text-mid);
  font-family:var(--mono);font-size:0.78rem;cursor:pointer;
  transition:background 0.13s,color 0.13s,border-color 0.13s;
}
.end-btn:hover{background:var(--bg-hover);color:var(--accent);border-color:var(--accent);}
.end-btn.primary{background:rgba(196,162,85,0.1);border-color:rgba(196,162,85,0.4);color:var(--accent);}

/* No cards placeholder */
#no-cards{display:none;color:var(--text-soft);font-family:var(--mono);font-size:0.85rem;text-align:center;}
</style>
</head>
<body>

<div id="topbar">
  <span id="topbar-brand">◈ lac · quiz</span>
  <span id="topbar-sep">|</span>
  <span id="topbar-project">${esc(projectName)}</span>
  <span id="topbar-count"></span>
  <div id="topbar-right">
    <span class="view-label">View</span>
    <div id="view-pills">
      <button class="view-pill active" data-view="user">User</button>
      <button class="view-pill" data-view="product">Product</button>
      <button class="view-pill" data-view="dev">Dev</button>
      <button class="view-pill" data-view="tech">Tech</button>
      <button class="view-pill" data-view="support">Support</button>
    </div>
    <button class="ctrl-btn" id="btn-shuffle">Shuffle</button>
    <button class="ctrl-btn" id="btn-reset">Restart</button>
  </div>
</div>

<div id="filter-bar">
  <span class="filter-label">Domain</span>
  ${domainPillsHtml}
</div>

<div id="progress-track"><div id="progress-fill"></div></div>
<div id="progress-text"></div>

<div id="quiz-area">
  <div id="card">
    <div id="card-header">
      <span id="feature-key"></span>
      <span id="status-badge" class="status-badge"></span>
    </div>
    <div id="feature-title"></div>
    <div id="domain-chip"></div>

    <div class="section-label">Context — the problem this feature solves</div>
    <div id="feature-problem"></div>

    <div class="card-divider"></div>

    <div id="question-wrap">
      <div id="question-text"></div>
      <div id="question-hint"></div>
    </div>

    <button id="reveal-btn">Reveal answer</button>

    <div id="answer-area">
      <div class="card-divider"></div>
      <div id="answer-content"></div>
      <div id="verdict-btns">
        <button class="verdict-btn" id="btn-got-it">✓ Got it</button>
        <button class="verdict-btn" id="btn-needs-work">✗ Need more study</button>
      </div>
    </div>
  </div>

  <div id="end-screen">
    <div id="end-score"></div>
    <div id="end-label"></div>
    <div id="end-breakdown"></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">
      <button class="end-btn" id="btn-retry-wrong">Retry incorrect</button>
      <button class="end-btn primary" id="btn-restart-all">Restart all</button>
    </div>
  </div>

  <div id="no-cards">No features match the current filter.</div>
</div>

<div id="nav-row">
  <button class="nav-btn" id="btn-prev">← Prev</button>
  <div id="score-display"></div>
  <button class="nav-btn" id="btn-next">Next →</button>
</div>

<script>
(function(){
  var ALL_FEATURES = ${featuresJson};

  // ── View definitions ────────────────────────────────────────────────────
  var VIEWS = {
    user: {
      question: 'How would a user describe what this feature does?',
      hint: 'Think about the user guide or end-user value',
      getAnswer: function(f) {
        if(f.userGuide) return { type: 'text', label: 'User guide', content: f.userGuide };
        if(f.problem)   return { type: 'text', label: 'No user guide yet — problem statement', content: f.problem };
        return { type: 'empty', label: '', content: 'No user guide or problem statement documented yet.' };
      }
    },
    product: {
      question: 'What are the success criteria for this feature?',
      hint: 'How do we know when it is done and working correctly?',
      getAnswer: function(f) {
        if(f.successCriteria) return { type: 'text', label: 'Success criteria', content: f.successCriteria };
        if(f.problem)         return { type: 'text', label: 'No success criteria — problem statement', content: f.problem };
        return { type: 'empty', label: '', content: 'Success criteria not yet defined.' };
      }
    },
    dev: {
      question: 'How was this implemented?',
      hint: 'Approach, key files, libraries, technical choices',
      getAnswer: function(f) {
        if(f.implementation) return { type: 'text', label: 'Implementation', content: f.implementation };
        if(f.analysis)       return { type: 'text', label: 'No implementation yet — analysis', content: f.analysis };
        return { type: 'empty', label: '', content: 'No implementation or analysis documented yet.' };
      }
    },
    tech: {
      question: 'What were the key technical decisions?',
      hint: 'Decision made, rationale, alternatives considered',
      getAnswer: function(f) {
        if(f.decisions && f.decisions.length) return { type: 'decisions', label: f.decisions.length + ' decision' + (f.decisions.length===1?'':'s'), content: f.decisions };
        if(f.analysis) return { type: 'text', label: 'No decisions recorded — analysis', content: f.analysis };
        return { type: 'empty', label: '', content: 'No technical decisions documented yet.' };
      }
    },
    support: {
      question: 'What are the known limitations?',
      hint: 'Edge cases, caveats, things that do not work yet',
      getAnswer: function(f) {
        if(f.knownLimitations && f.knownLimitations.length) return { type: 'list', label: f.knownLimitations.length + ' limitation' + (f.knownLimitations.length===1?'':'s'), content: f.knownLimitations };
        return { type: 'empty', label: '', content: 'No known limitations documented.' };
      }
    }
  };

  // ── State ────────────────────────────────────────────────────────────────
  var currentView = 'user';
  var activeDomain = 'All';
  var deck = [];
  var idx = 0;
  var revealed = false;
  var score = { got: 0, needs: 0, wrong: [] };

  // ── DOM refs ─────────────────────────────────────────────────────────────
  var card          = document.getElementById('card');
  var endScreen     = document.getElementById('end-screen');
  var noCards       = document.getElementById('no-cards');
  var progressFill  = document.getElementById('progress-fill');
  var progressText  = document.getElementById('progress-text');
  var featureKey    = document.getElementById('feature-key');
  var statusBadge   = document.getElementById('status-badge');
  var featureTitle  = document.getElementById('feature-title');
  var domainChip    = document.getElementById('domain-chip');
  var featureProblem= document.getElementById('feature-problem');
  var questionText  = document.getElementById('question-text');
  var questionHint  = document.getElementById('question-hint');
  var revealBtn     = document.getElementById('reveal-btn');
  var answerArea    = document.getElementById('answer-area');
  var answerContent = document.getElementById('answer-content');
  var verdictBtns   = document.getElementById('verdict-btns');
  var btnGotIt      = document.getElementById('btn-got-it');
  var btnNeedsWork  = document.getElementById('btn-needs-work');
  var btnPrev       = document.getElementById('btn-prev');
  var btnNext       = document.getElementById('btn-next');
  var scoreDisplay  = document.getElementById('score-display');
  var endScore      = document.getElementById('end-score');
  var endLabel      = document.getElementById('end-label');
  var endBreakdown  = document.getElementById('end-breakdown');
  var topbarCount   = document.getElementById('topbar-count');

  // ── Helpers ──────────────────────────────────────────────────────────────
  function esc(s){
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function statusColor(s){
    return s==='active'?'#4aad72':s==='frozen'?'#5b82cc':s==='deprecated'?'#cc5b5b':'#c4a255';
  }
  function shuffle(arr){
    var a = arr.slice();
    for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}
    return a;
  }

  function buildDeck(featureList){
    deck = featureList.slice();
    idx = 0;
    score = { got: 0, needs: 0, wrong: [] };
    revealed = false;
    updateScoreDisplay();
    if(deck.length === 0){ showNoCards(); } else { showCard(); }
  }

  function getFilteredFeatures(){
    var base = activeDomain === 'All' ? ALL_FEATURES : ALL_FEATURES.filter(function(f){ return f.domain === activeDomain; });
    return base.filter(function(f){
      var ans = VIEWS[currentView].getAnswer(f);
      return ans && ans.type !== 'empty';
    });
  }

  function showNoCards(){
    card.style.display = 'none';
    endScreen.style.display = 'none';
    noCards.style.display = 'block';
    progressText.textContent = '';
    progressFill.style.width = '0%';
    btnPrev.disabled = true;
    btnNext.disabled = true;
  }

  function showCard(){
    card.style.display = 'block';
    endScreen.style.display = 'none';
    noCards.style.display = 'none';

    var f = deck[idx];
    var view = VIEWS[currentView];

    // Header
    featureKey.textContent = f.featureKey;
    statusBadge.textContent = f.status;
    var sc = statusColor(f.status);
    statusBadge.style.color = sc;
    statusBadge.style.border = '1px solid ' + sc + '44';
    statusBadge.style.background = sc + '18';

    featureTitle.textContent = f.title;

    if(f.domain){
      domainChip.textContent = f.domain;
      domainChip.style.display = 'inline-block';
    } else {
      domainChip.style.display = 'none';
    }

    featureProblem.textContent = f.problem || '(no problem statement)';

    // Question
    questionText.textContent = view.question;
    questionHint.textContent = view.hint;

    // Reset reveal state
    revealed = false;
    revealBtn.style.display = 'block';
    answerArea.style.display = 'none';
    answerContent.innerHTML = '';

    // Progress
    var pct = deck.length > 1 ? (idx / (deck.length - 1)) * 100 : 100;
    progressFill.style.width = pct + '%';
    progressText.textContent = (idx + 1) + ' / ' + deck.length;

    // Nav
    btnPrev.disabled = idx === 0;
    btnNext.disabled = false;
    btnNext.textContent = idx === deck.length - 1 ? 'Finish →' : 'Next →';

    card.style.opacity = '0';
    requestAnimationFrame(function(){ card.style.opacity = '1'; });
  }

  function renderAnswer(answer){
    if(!answer){
      answerContent.innerHTML = '<span class="answer-empty">No data for this view — skip or choose a different view.</span>';
      return;
    }
    if(answer.type === 'text'){
      // Basic inline markdown-ish rendering
      var html = esc(answer.content)
        .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
        .replace(new RegExp('\`([^\`]+)\`', 'g'), '<code>$1</code>');
      // Preserve line breaks + bullet lists
      var lines = html.split('\\n');
      var out = '';
      var inList = false;
      for(var i=0;i<lines.length;i++){
        var l = lines[i].trim();
        if(!l){ if(inList){out+='</ul>';inList=false;} out+='<br>'; continue; }
        if(/^[-*]\s/.test(l)){
          if(!inList){out+='<ul>';inList=true;}
          out+='<li>'+l.replace(/^[-*]\s/,'')+'</li>';
        } else {
          if(inList){out+='</ul>';inList=false;}
          out+=l+'<br>';
        }
      }
      if(inList) out+='</ul>';
      answerContent.innerHTML = out;
    } else if(answer.type === 'decisions'){
      var html = '';
      answer.content.forEach(function(d, i){
        html += '<div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border-soft);">';
        html += '<strong style="color:var(--text);">' + (i+1) + '. ' + esc(d.decision) + '</strong>';
        if(d.rationale) html += '<div style="color:var(--text-soft);margin-top:4px;font-size:0.84em;">— ' + esc(d.rationale) + '</div>';
        html += '</div>';
      });
      answerContent.innerHTML = html;
    } else if(answer.type === 'list'){
      var html = '<ul>';
      answer.content.forEach(function(item){ html += '<li>' + esc(item) + '</li>'; });
      html += '</ul>';
      answerContent.innerHTML = html;
    } else {
      // type === 'empty' or unknown
      answerContent.innerHTML = '<span class="answer-empty">' + esc(answer.content || 'Not documented yet.') + '</span>';
    }
  }

  function showEndScreen(){
    card.style.display = 'none';
    endScreen.style.display = 'flex';
    noCards.style.display = 'none';
    var total = score.got + score.needs;
    var pct = total > 0 ? Math.round(score.got / total * 100) : 0;
    endScore.textContent = pct + '%';
    endLabel.textContent = pct >= 80 ? 'Excellent recall!' : pct >= 60 ? 'Good — a few to revisit' : 'Keep practicing';
    endBreakdown.textContent = score.got + ' correct · ' + score.needs + ' to review · ' + deck.length + ' total';
    progressFill.style.width = '100%';
    progressText.textContent = 'Done';
    btnPrev.disabled = true; btnNext.disabled = true;
  }

  function updateScoreDisplay(){
    scoreDisplay.textContent = score.got + ' ✓  ' + score.needs + ' ✗';
  }

  // ── Events ───────────────────────────────────────────────────────────────
  revealBtn.addEventListener('click', function(){
    if(revealed) return;
    revealed = true;
    revealBtn.style.display = 'none';
    answerArea.style.display = 'block';
    var f = deck[idx];
    var view = VIEWS[currentView];
    renderAnswer(view.getAnswer(f));
  });

  btnGotIt.addEventListener('click', function(){
    if(!revealed) return;
    score.got++;
    updateScoreDisplay();
    advance();
  });

  btnNeedsWork.addEventListener('click', function(){
    if(!revealed) return;
    score.needs++;
    score.wrong.push(deck[idx]);
    updateScoreDisplay();
    advance();
  });

  function advance(){
    if(idx < deck.length - 1){
      idx++;
      showCard();
    } else {
      showEndScreen();
    }
  }

  btnPrev.addEventListener('click', function(){
    if(idx > 0){ idx--; showCard(); }
  });

  btnNext.addEventListener('click', function(){
    if(idx < deck.length - 1){ idx++; showCard(); }
    else { showEndScreen(); }
  });

  document.getElementById('btn-shuffle').addEventListener('click', function(){
    buildDeck(shuffle(getFilteredFeatures()));
  });

  document.getElementById('btn-reset').addEventListener('click', function(){
    buildDeck(getFilteredFeatures());
  });

  document.getElementById('btn-retry-wrong').addEventListener('click', function(){
    if(score.wrong.length === 0){ buildDeck(getFilteredFeatures()); return; }
    buildDeck(score.wrong.slice());
  });

  document.getElementById('btn-restart-all').addEventListener('click', function(){
    buildDeck(getFilteredFeatures());
  });

  // View pills
  document.querySelectorAll('.view-pill').forEach(function(pill){
    pill.addEventListener('click', function(){
      document.querySelectorAll('.view-pill').forEach(function(p){ p.classList.remove('active'); });
      pill.classList.add('active');
      currentView = pill.getAttribute('data-view');
      buildDeck(getFilteredFeatures());
    });
  });

  // Domain pills
  document.querySelectorAll('.domain-pill').forEach(function(pill){
    pill.addEventListener('click', function(){
      document.querySelectorAll('.domain-pill').forEach(function(p){ p.classList.remove('active'); });
      pill.classList.add('active');
      activeDomain = pill.textContent;
      buildDeck(getFilteredFeatures());
    });
  });

  // Keyboard
  document.addEventListener('keydown', function(e){
    if(e.key === 'ArrowLeft'){ if(idx > 0){idx--;showCard();} }
    else if(e.key === 'ArrowRight' || e.key === ' '){
      e.preventDefault();
      if(!revealed){ revealBtn.click(); }
      else if(idx < deck.length - 1){ idx++; showCard(); }
      else { showEndScreen(); }
    }
    else if(e.key === 'r' || e.key === 'R'){ document.getElementById('btn-shuffle').click(); }
    else if(e.key === 'Backspace'){ if(idx > 0){idx--;showCard();} }
    else if(e.key === '1' && revealed){ btnGotIt.click(); }
    else if(e.key === '2' && revealed){ btnNeedsWork.click(); }
  });

  // ── Init ─────────────────────────────────────────────────────────────────
  topbarCount.textContent = ALL_FEATURES.length + ' features';
  buildDeck(ALL_FEATURES);

})();
</script>
</body>
</html>`;
}

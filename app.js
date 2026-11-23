/* MSK Anatomy Quiz — static app, no server needed. Data comes from data/*.js */
(function(){
'use strict';
const T = window.MSK_TERMS, IMG = window.MSK_IMAGES, ARROWS0 = window.MSK_ARROWS;
const STORE_KEY = 'mskQuiz.v1';
const termById = Object.fromEntries(T.terms.map(t=>[t.id,t]));
const secById = Object.fromEntries(T.sections.map(s=>[s.id,s]));
const $ = s=>document.querySelector(s);
const esc = s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------------- state ---------------- */
const DEFAULTS = {needed:1, typo:'ask', requeue:'soon', order:'random', autoadvance:false, typeword:false, reviewedonly:false, varyimage:true};
let S = load();
function load(){
  let s={};
  try{ s = JSON.parse(localStorage.getItem(STORE_KEY)||'{}')||{}; }catch(e){}
  s.settings = Object.assign({}, DEFAULTS, s.settings||{});
  if(!s.mig1){ s.settings.autoadvance=false; s.mig1=1; }  // auto-advance now off by default
  s.progress = s.progress||{};       // termId -> {c: correct count, w: wrong count, seen}
  s.removed = s.removed||[];
  s.excluded = s.excluded||[];       // section ids
  s.focus = s.focus||null;           // section id
  s.arrowEdits = s.arrowEdits||{};   // arrowId -> {x,y,a,status:'ok'|'bad'|undefined,moved}
  return s;
}
function save(){ try{ localStorage.setItem(STORE_KEY, JSON.stringify(S)); }catch(e){} }

/* ---------------- arrows ---------------- */
function arrow(a0){
  const e = S.arrowEdits[a0.id]||{};
  return {id:a0.id, term:a0.term, img:a0.img, x:e.x??a0.x, y:e.y??a0.y, a:e.a??a0.a, status:e.status, moved:!!e.moved};
}
function arrowsFor(termId, opts={}){
  return ARROWS0.filter(a=>a.term===termId).map(arrow).filter(a=>{
    if(a.status==='bad') return false;
    if(opts.reviewedOnly && a.status!=='ok') return false;
    return !!IMG[a.img];
  });
}
const hasImage = id => arrowsFor(id).length>0;

/* draw image + arrow into container. returns {svg, setArrow} */
function drawFigure(el, ar, {labeled=false, draggable=false, onMove=null}={}){
  const im = IMG[ar.img];
  el.innerHTML='';
  const img = new Image();
  img.src = labeled ? im.labeled : im.clean;
  img.alt = labeled ? 'Labeled plate' : 'Anatomy image';
  img.draggable=false;
  el.appendChild(img);
  const W=im.w, H=im.h, NS='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(NS,'svg');
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio','none');
  el.appendChild(svg);
  const L = Math.max(40, Math.min(W,H)*0.16), sw=Math.max(3,Math.min(W,H)*0.009);
  const g=document.createElementNS(NS,'g'); svg.appendChild(g);
  function render(x,y,a){
    const tx=x*W, ty=y*H, rad=a*Math.PI/180;
    const sx=tx+Math.cos(rad)*L, sy=ty+Math.sin(rad)*L;
    const hl=sw*4.2, hw=sw*2.4;
    const ux=Math.cos(rad), uy=Math.sin(rad);
    const bx=tx+ux*hl, by=ty+uy*hl;
    const p1=`${bx-uy*hw},${by+ux*hw}`, p2=`${bx+uy*hw},${by-ux*hw}`;
    g.innerHTML = `
      <line x1="${sx}" y1="${sy}" x2="${bx}" y2="${by}" stroke="#fff" stroke-width="${sw*2.2}" stroke-linecap="round"/>
      <polygon points="${tx},${ty} ${p1} ${p2}" fill="#fff" stroke="#fff" stroke-width="${sw*1.4}" stroke-linejoin="round"/>
      <line x1="${sx}" y1="${sy}" x2="${bx}" y2="${by}" stroke="var(--arrow)" stroke-width="${sw}" stroke-linecap="round"/>
      <polygon points="${tx},${ty} ${p1} ${p2}" fill="var(--arrow)"/>
      ${draggable?`<circle class="tip" cx="${tx}" cy="${ty}" r="${sw*5}" fill="rgba(255,31,143,.12)" stroke="var(--arrow)" stroke-width="${sw*0.5}" stroke-dasharray="${sw},${sw}"/>
      <circle class="tip" cx="${sx}" cy="${sy}" r="${sw*3.2}" fill="rgba(255,255,255,.01)"/>`:''}`;
  }
  let cur={x:ar.x,y:ar.y,a:ar.a};
  render(cur.x,cur.y,cur.a);
  if(draggable){
    let dragging=false;
    const toImg=ev=>{const r=svg.getBoundingClientRect(); return {x:Math.min(1,Math.max(0,(ev.clientX-r.left)/r.width)), y:Math.min(1,Math.max(0,(ev.clientY-r.top)/r.height))};};
    svg.style.cursor='crosshair';
    svg.addEventListener('pointerdown',ev=>{dragging=true; svg.setPointerCapture(ev.pointerId); const p=toImg(ev); cur.x=p.x; cur.y=p.y; render(cur.x,cur.y,cur.a); ev.preventDefault();});
    svg.addEventListener('pointermove',ev=>{ if(!dragging) return; const p=toImg(ev); cur.x=p.x; cur.y=p.y; render(cur.x,cur.y,cur.a);});
    svg.addEventListener('pointerup',()=>{ if(dragging){dragging=false; onMove&&onMove({...cur});}});
  }
  return {rotate(d){cur.a=(cur.a+d+360)%360; render(cur.x,cur.y,cur.a); onMove&&onMove({...cur});}};
}
function creditHTML(imgId){
  const im=IMG[imgId]; if(!im) return '';
  return `Image: <a href="${esc(im.source)}" target="_blank" rel="noopener">${esc(im.title)}</a> · ${esc(im.author)} · ${esc(im.license)}`;
}

/* ---------------- answer checking ---------------- */
const ABBR={m:'muscle',mm:'muscle',a:'artery',aa:'artery',n:'nerve',nn:'nerve',v:'vein',vv:'vein',lig:'ligament',ligs:'ligament',ant:'anterior',post:'posterior',sup:'superior',inf:'inferior',med:'medial',lat:'lateral',br:'branch',tend:'tendon',
  muscles:'muscle',arteries:'artery',nerves:'nerve',veins:'vein',ligaments:'ligament',tendons:'tendon',branches:'branch',processes:'process',roots:'root',
  peroneal:'fibular',peroneus:'fibularis',volar:'palmar',quinti:'minimi',circumflex:'circumflex'};
const DROP_ALWAYS=new Set(['the','of','muscle','and','a','an']);
const TYPEWORDS=new Set(['artery','nerve','vein','ligament','tendon']);
function norm(s, dropType){
  let t=s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[’'`]/g,'').replace(/\([^)]*\)/g,' ').replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
  t=t.map(w=>ABBR[w]||w).map(w=>w.length>4&&/[^s]s$/.test(w)&&!/(ss|us|is)$/.test(w)?w.slice(0,-1):w);
  t=t.filter(w=>!DROP_ALWAYS.has(w));
  if(dropType) t=t.filter(w=>!TYPEWORDS.has(w));
  return t;
}
function variants(term, dropType){
  const out=new Set();
  for(const n of [term.name, ...(term.aliases||[])]){
    const w=norm(n, dropType); if(!w.length) continue;
    out.add(w.join(' ')); out.add('#'+[...w].sort().join(' '));
  }
  return out;
}
function keysFor(text, dropType){ const w=norm(text,dropType); return [w.join(' '), '#'+[...w].sort().join(' ')]; }
function matchesStrict(term,text){ const v=variants(term,false), k=keysFor(text,false); return k.some(x=>v.has(x)); }
function matches(term, text){
  // type word: if the setting does not require it, compare with type words dropped on both sides,
  // but only when the typed text omitted them entirely (so "femoral vein" never matches "femoral artery").
  const strictV=variants(term,false), k=keysFor(text,false);
  if(k.some(x=>strictV.has(x))) return true;
  if(!S.settings.typeword){
    const typed=norm(text,false);
    if(!typed.some(w=>TYPEWORDS.has(w))){
      const looseV=variants(term,true), k2=keysFor(text,true);
      if(k2[0] && k2.some(x=>looseV.has(x))) return true;
    }
  }
  return false;
}
function lev(a,b){
  if(a===b) return 0; const m=a.length,n=b.length; if(!m) return n; if(!n) return m;
  let prev=Array.from({length:n+1},(_,i)=>i), cur=new Array(n+1);
  for(let i=1;i<=m;i++){ cur[0]=i; for(let j=1;j<=n;j++){ cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1)); } [prev,cur]=[cur,prev]; }
  return prev[n];
}
function closeness(term, text){ // smallest edit distance to any accepted form
  const k=norm(text,false).join(' '); let best=Infinity;
  for(const n of [term.name,...(term.aliases||[])]){
    for(const dt of [false,true]){ const v=norm(n,dt).join(' '); if(v) best=Math.min(best,lev(k,v)); }
  }
  return best;
}
function tolerance(len){ return len<=5?1:len<=10?2:3; }
function grade(term, text){
  if(!text.trim()) return {kind:'wrong'};
  if(matchesStrict(term,text)) return {kind:'right'};
  if(matches(term,text)){
    // type word left off: only accept if it can't mean another structure (e.g. "femoral" = artery, vein or nerve)
    const amb=T.terms.some(o=>o.id!==term.id && matches(o,text));
    return amb ? {kind:'close', vague:true} : {kind:'right'};
  }
  // names another real term?
  const others=T.terms.filter(o=>o.id!==term.id && matchesStrict(o,text));
  if(others.length){
    const pref=others.find(o=>o.sections.some(s=>term.sections.some(ts=>ts.slice(0,3)===s.slice(0,3))))||others[0];
    return {kind:'other', other:pref};
  }
  if(S.settings.typo!=='strict'){
    const typedLen=norm(text,false).join(' ').length;
    const d=closeness(term,text);
    if(d<=tolerance(typedLen)){
      // make sure it isn't even closer to a different term
      const nearer=T.terms.find(o=>o.id!==term.id && closeness(o,text)<d);
      if(!nearer) return {kind:'close', dist:d};
      if(closeness(nearer,text)===0) return {kind:'other', other:nearer};
    }
  }
  return {kind:'wrong'};
}

/* ---------------- pool ---------------- */
function activeSections(){
  if(S.focus && secById[S.focus]) return [S.focus];
  return T.sections.map(s=>s.id).filter(id=>!S.excluded.includes(id));
}
function eligibleTerms(){
  const secs=new Set(activeSections());
  const ids=[]; const seen=new Set();
  for(const s of T.sections){ if(!secs.has(s.id)) continue;
    for(const id of s.terms){ if(seen.has(id)) continue; seen.add(id);
      if(S.removed.includes(id)) continue;
      if(!arrowsFor(id,{reviewedOnly:S.settings.reviewedonly}).length) continue;
      ids.push(id);
    }}
  return ids;
}
const prog = id => (S.progress[id] ||= {c:0,w:0});
const mastered = id => (S.progress[id]?.c||0) >= S.settings.needed;
function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0; [a[i],a[j]]=[a[j],a[i]];} return a; }

let queue=[], current=null, currentArrow=null, answered=false, session={right:0,wrong:0}, showingLabeled=false, lastImgFor={}, lockUntil=0;
function lockKeys(){ lockUntil=Date.now()+600; }
function holdFocus(){ const fb=$('#feedback'); fb.tabIndex=-1; fb.focus({preventScroll:true}); }
function buildQueue(){
  const ids=eligibleTerms().filter(id=>!mastered(id));
  const o=S.settings.order;
  if(o==='weak'){ shuffle(ids); ids.sort((a,b)=>((S.progress[b]?.w||0)-(S.progress[b]?.c||0))-((S.progress[a]?.w||0)-(S.progress[a]?.c||0))); }
  else if(o==='section'){
    const order=activeSections(); const bySec=order.map(sid=>shuffle(secById[sid].terms.filter(id=>ids.includes(id))));
    const seen=new Set(); queue=[]; bySec.flat().forEach(id=>{if(!seen.has(id)){seen.add(id);queue.push(id);}}); return;
  } else shuffle(ids);
  queue=ids;
}
function scopeLabel(){
  if(S.focus && secById[S.focus]){ const s=secById[S.focus]; return `Focus: ${s.lab.split(' ').slice(1).join(' ')} › ${s.name}`; }
  const n=activeSections().length; return n===T.sections.length?'All sections':`${n} of ${T.sections.length} sections`;
}
function updateStats(){
  const el=eligibleTerms(); const m=el.filter(mastered).length;
  $('#quiz-stats').innerHTML=`<span>Done <b>${m}</b>/<b>${el.length}</b></span><span>Left <b>${el.length-m}</b></span><span class="muted">Session ✓<b>${session.right}</b> ✗<b>${session.wrong}</b></span>`;
  $('#quiz-scope').textContent=scopeLabel()+` · leaves pool after ${S.settings.needed} correct`;
}

/* ---------------- quiz UI ---------------- */
function nextCard(){
  answered=false; showingLabeled=false; lockUntil=0;
  queue=queue.filter(id=>!mastered(id) && !S.removed.includes(id));
  const el=new Set(eligibleTerms()); queue=queue.filter(id=>el.has(id));
  if(!queue.length) buildQueue();
  updateStats();
  if(!queue.length){
    current=null; $('#quiz-card').classList.add('hidden');
    const e=$('#quiz-empty'); e.classList.remove('hidden');
    const total=eligibleTerms().length;
    e.innerHTML = total
      ? `<h2>All done in this scope 🎉</h2><p class="muted">Every term here has been answered correctly ${S.settings.needed}×. Reset progress in Settings, raise the "correct answers" setting, or pick other sections.</p><button class="primary" id="again">Go again (reset progress for these sections)</button>`
      : `<h2>No terms to quiz</h2><p class="muted">Every section is excluded, or the terms here have no usable image yet. Check Settings.</p>`;
    const b=$('#again'); if(b) b.onclick=()=>{ eligibleTerms().forEach(id=>{ if(S.progress[id]) S.progress[id].c=0; }); save(); buildQueue(); nextCard(); };
    return;
  }
  current=termById[queue[0]];
  const arr=arrowsFor(current.id,{reviewedOnly:S.settings.reviewedonly});
  let pick=arr[0];
  if(S.settings.varyimage && arr.length>1){ const others=arr.filter(a=>a.id!==lastImgFor[current.id]); pick=others[Math.random()*others.length|0]; }
  currentArrow=pick; lastImgFor[current.id]=pick.id;
  $('#quiz-empty').classList.add('hidden'); $('#quiz-card').classList.remove('hidden');
  drawFigure($('#quiz-figure'), pick);
  $('#credit').innerHTML=creditHTML(pick.img);
  $('#feedback').className='feedback hidden'; $('#hint').className='hint hidden';
  $('#btn-labeled').textContent='Show labeled plate';
  const inp=$('#answer'); inp.value=''; inp.disabled=false; inp.focus();
  $('#btn-submit').textContent='Check';
}
function record(ok){
  const p=prog(current.id); if(ok){p.c++; session.right++;} else {p.w++; session.wrong++;}
  p.seen=Date.now();
  const id=queue.shift();
  if(!ok || !mastered(id)){
    if(S.settings.requeue==='soon' && !ok){ const pos=Math.min(queue.length, 3+(Math.random()*3|0)); queue.splice(pos,0,id); }
    else queue.push(id);
  }
  save(); updateStats();
}
function submit(){
  if(!current) return;
  if(answered){ nextCard(); return; }
  if($('#cl-pass') && !$('#feedback').classList.contains('hidden')) return; // waiting for pass/fail choice
  const text=$('#answer').value;
  if(!text.trim()) return;   // empty Enter does nothing; use "I don't know" to give up
  const g=grade(current,text);
  const fb=$('#feedback');
  if(g.kind==='right'){
    answered=true; record(true);
    const left=Math.max(0,S.settings.needed-(S.progress[current.id].c));
    fb.className='feedback ok'; fb.innerHTML=`<div class="big">✓ ${esc(current.name)}</div>${left?`<div class="small">${left} more correct to clear this term</div>`:''}`;
    $('#answer').disabled=true; $('#btn-submit').textContent='Next (Enter)'; lockKeys(); holdFocus();
    if(S.settings.autoadvance){ const c=current; setTimeout(()=>{ if(answered && current===c) nextCard(); }, 1800); }
  } else if(g.kind==='close' && S.settings.typo==='accept' && !g.vague){
    answered=true; record(true);
    fb.className='feedback ok'; fb.innerHTML=`<div class="big">✓ Close enough</div><div class="answer">Spelled: <b>${esc(current.name)}</b></div>`;
    $('#answer').disabled=true; $('#btn-submit').textContent='Next (Enter)'; lockKeys(); holdFocus();
  } else if(g.kind==='close'){
    fb.className='feedback close';
    fb.innerHTML=`<div class="big">${g.vague?'Add the type (artery, vein, nerve…)':'Close spelling'}</div><div class="answer">You typed <b>${esc(text)}</b>. The answer is <b>${esc(current.name)}</b>.</div>
      <div class="tools-row"><button class="good" id="cl-pass">Count it (pass)</button><button class="bad" id="cl-fail">Count it wrong (fail)</button></div>`;
    $('#answer').disabled=true;
    $('#cl-pass').onclick=()=>{answered=true; record(true); fb.className='feedback ok'; fb.innerHTML=`<div class="big">✓ Passed</div><div class="answer">${esc(current.name)}</div>`; $('#btn-submit').textContent='Next (Enter)'; lockKeys(); holdFocus();};
    $('#cl-fail').onclick=()=>{answered=true; record(false); showWrong(text,null);};
    lockKeys(); holdFocus();
  } else {
    answered=true; record(false); showWrong(text, g.kind==='other'?g.other:null);
  }
}
function showWrong(text, other){
  const fb=$('#feedback'); fb.className='feedback no';
  let html=`<div class="big" style="color:var(--bad)">✗ Incorrect</div><div class="answer">Answer: <b>${esc(current.name)}</b>${text.trim()?` · you typed “${esc(text)}”`:''}</div>`;
  if(other){
    const oa=arrowsFor(other.id)[0];
    html+=`<div class="other"><div>“${esc(text)}” is the <b>${esc(other.name)}</b>${oa?', shown here:':' (no image for it yet).'}</div>${oa?'<div class="figure-wrap" style="margin-top:8px"><div class="figure" id="other-fig"></div></div><div class="credit" id="other-credit"></div>':''}</div>`;
    fb.innerHTML=html;
    if(oa){ drawFigure($('#other-fig'),oa); $('#other-credit').innerHTML=creditHTML(oa.img); }
  } else fb.innerHTML=html;
  $('#answer').disabled=true; $('#btn-submit').textContent='Next (Enter)'; lockKeys(); holdFocus();
}
$('#btn-submit').onclick=submit;
// One Enter handler for the quiz: Enter checks, the next Enter (a deliberate new press) moves on.
document.addEventListener('keydown',e=>{
  if(e.key!=='Enter' || !$('#view-quiz').classList.contains('active')) return;
  if(!$('#browse-modal').classList.contains('hidden')) return;
  e.preventDefault(); e.stopPropagation();          // stops a focused button from also "clicking"
  if(e.repeat || Date.now()<lockUntil) return;     // held key or bounce: ignore
  submit();
},true);
$('#btn-dontknow').onclick=()=>{ if(!current||answered) return; answered=true; record(false); showWrong('',null); };
$('#btn-hint').onclick=()=>{
  if(!current) return; const h=$('#hint');
  const words=current.name.replace(/\([^)]*\)/g,'').trim().split(/\s+/);
  h.textContent='Hint: '+words.map(w=>w[0]+'·'.repeat(Math.max(0,w.length-1))).join('  ');
  h.className='hint';
};
$('#btn-labeled').onclick=()=>{ if(!currentArrow) return; showingLabeled=!showingLabeled; drawFigure($('#quiz-figure'),currentArrow,{labeled:showingLabeled}); $('#btn-labeled').textContent=showingLabeled?'Hide labels':'Show labeled plate'; };
$('#btn-remove').onclick=()=>{
  if(!current) return; const b=$('#btn-remove');
  if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='Click again to remove'; setTimeout(()=>{b.dataset.armed='';b.textContent='Remove term';},2500); return; }
  b.dataset.armed=''; b.textContent='Remove term';
  S.removed.push(current.id); save(); queue.shift(); nextCard();
};

/* ---------------- review UI ---------------- */
let rvList=[], rvIdx=0, rvLabeled=false, rvCtl=null;
function rvBuild(){
  const f=$('#review-filter').value, sec=$('#review-section').value;
  const allowed = sec ? new Set(secById[sec].terms) : null;
  const order=[]; const seen=new Set();
  for(const s of T.sections) for(const id of s.terms) if(!seen.has(id)){seen.add(id);order.push(id);}
  rvList=[];
  for(const id of order){ if(allowed && !allowed.has(id)) continue;
    for(const a0 of ARROWS0.filter(a=>a.term===id)){ if(!IMG[a0.img]) continue; const a=arrow(a0);
      if(f==='unreviewed' && a.status) continue;
      if(f==='flagged' && a.status!=='bad') continue;
      if(f==='edited' && !a.moved) continue;
      rvList.push(a0.id);
    }}
  rvIdx=0; rvShow();
}
function rvCounts(){
  const all=ARROWS0.filter(a=>IMG[a.img]).map(arrow);
  const ok=all.filter(a=>a.status==='ok').length, bad=all.filter(a=>a.status==='bad').length;
  $('#review-count').textContent=`${ok} confirmed · ${bad} marked wrong · ${all.length-ok-bad} not reviewed`;
}
function rvShow(){
  rvCounts();
  const card=$('#review-card');
  if(!rvList.length){ card.querySelector('.figure').innerHTML=''; $('#review-term').textContent='Nothing to review with this filter 🎉'; $('#review-pos').textContent=''; $('#review-note').textContent=''; return; }
  rvIdx=(rvIdx+rvList.length)%rvList.length;
  const a0=ARROWS0.find(a=>a.id===rvList[rvIdx]); const a=arrow(a0); const t=termById[a.term];
  $('#review-term').textContent=t.name; $('#review-pos').textContent=`${rvIdx+1} / ${rvList.length}`;
  rvCtl=drawFigure($('#review-figure'),a,{labeled:rvLabeled,draggable:true,onMove:(p)=>{
    const e=S.arrowEdits[a.id]||(S.arrowEdits[a.id]={}); Object.assign(e,{x:+p.x.toFixed(4),y:+p.y.toFixed(4),a:Math.round(p.a),moved:true}); save();
    $('#review-note').textContent='Moved. Press “Looks right ✓” to confirm.';
  }});
  $('#review-note').innerHTML=(a.status==='ok'?'✓ Confirmed. ':a.status==='bad'?'✗ Marked wrong (left out of the quiz). ':'')+(a.moved?'You moved this arrow. ':'')+(a0.note?esc(a0.note)+' ':'')+'<br>'+creditHTML(a.img);
}
function rvSet(status){
  if(!rvList.length) return; const id=rvList[rvIdx];
  const e=S.arrowEdits[id]||(S.arrowEdits[id]={}); e.status=status; save();
  if($('#review-filter').value==='unreviewed'){ rvList.splice(rvIdx,1); } else rvIdx++;
  rvShow();
}
$('#rv-ok').onclick=()=>rvSet('ok'); $('#rv-bad').onclick=()=>rvSet('bad');
$('#rv-next').onclick=()=>{rvIdx++; rvShow();}; $('#rv-prev').onclick=()=>{rvIdx--; rvShow();};
$('#rv-rotl').onclick=()=>rvCtl&&rvCtl.rotate(-30); $('#rv-rotr').onclick=()=>rvCtl&&rvCtl.rotate(30);
$('#rv-labeled').onclick=()=>{rvLabeled=!rvLabeled; $('#rv-labeled').textContent=rvLabeled?'Hide labels':'Labeled plate'; rvShow();};
$('#rv-reset').onclick=()=>{ if(!rvList.length) return; delete S.arrowEdits[rvList[rvIdx]]; save(); rvShow(); };
$('#review-filter').onchange=rvBuild; $('#review-section').onchange=rvBuild;
document.addEventListener('keydown',e=>{
  if(!$('#view-review').classList.contains('active')||e.target.tagName==='SELECT') return;
  if(e.key==='Enter'||e.key==='y'){e.preventDefault(); rvSet('ok');}
  else if(e.key==='x'){rvSet('bad');}
  else if(e.key==='ArrowRight'){rvIdx++;rvShow();} else if(e.key==='ArrowLeft'){rvIdx--;rvShow();}
});

/* ---------------- browse UI ---------------- */
let bmArr=[], bmIdx=0, bmLab=false;
function browseRender(){
  const q=$('#browse-search').value.toLowerCase().trim(), onlyMissing=$('#browse-missing').checked;
  let html='', count=0, missing=0;
  for(const s of T.sections){
    const items=s.terms.map(id=>termById[id]).filter(t=>{
      const m=!hasImage(t.id); if(m) missing++;
      if(onlyMissing && !m) return false;
      if(q && !(t.name.toLowerCase().includes(q)||(t.aliases||[]).some(a=>a.toLowerCase().includes(q)))) return false;
      return true;});
    if(!items.length) continue; count+=items.length;
    html+=`<div class="browse-sec">${esc(s.lab)} › ${esc(s.name)}</div><div class="term-grid">`+items.map(t=>{
      const m=!hasImage(t.id);
      return `<div class="term-item" data-id="${t.id}"><span>${esc(t.name)}</span>${m?'<span class="tag missing">no image</span>':mastered(t.id)?'<span class="tag done">done</span>':''}</div>`;}).join('')+'</div>';
  }
  $('#browse-list').innerHTML=html||'<p class="muted">No matches.</p>';
  $('#browse-count').textContent=`${count} shown`;
  document.querySelectorAll('.term-item').forEach(el=>el.onclick=()=>browseOpen(el.dataset.id));
}
function browseOpen(id){
  const t=termById[id]; bmArr=arrowsFor(id); bmIdx=0; bmLab=false;
  $('#bm-title').textContent=t.name+((t.aliases&&t.aliases.length)?`  (also: ${t.aliases.slice(0,4).join(', ')})`:'');
  $('#browse-modal').classList.remove('hidden'); bmShow();
}
function bmShow(){
  if(!bmArr.length){ $('#bm-figure').innerHTML='<p class="muted" style="padding:20px">No suitable openly licensed image was found for this term yet, so it is left out of the quiz rather than guessed.</p>'; $('#bm-pos').textContent=''; $('#bm-credit').innerHTML=''; return; }
  bmIdx=(bmIdx+bmArr.length)%bmArr.length; const a=bmArr[bmIdx];
  drawFigure($('#bm-figure'),a,{labeled:bmLab}); $('#bm-pos').textContent=`${bmIdx+1} / ${bmArr.length}`; $('#bm-credit').innerHTML=creditHTML(a.img);
}
$('#bm-close').onclick=()=>$('#browse-modal').classList.add('hidden');
$('#browse-modal').onclick=e=>{ if(e.target.id==='browse-modal') $('#browse-modal').classList.add('hidden'); };
$('#bm-prev').onclick=()=>{bmIdx--;bmShow();}; $('#bm-next').onclick=()=>{bmIdx++;bmShow();};
$('#bm-labeled').onclick=()=>{bmLab=!bmLab; $('#bm-labeled').textContent=bmLab?'Hide labels':'Labeled plate'; bmShow();};
$('#browse-search').oninput=browseRender; $('#browse-missing').onchange=browseRender;

/* ---------------- settings UI ---------------- */
function settingsRender(){
  const st=S.settings;
  $('#set-needed').value=st.needed; $('#set-typo').value=st.typo; $('#set-requeue').value=st.requeue; $('#set-order').value=st.order;
  $('#set-autoadvance').checked=st.autoadvance; $('#set-typeword').checked=st.typeword; $('#set-reviewedonly').checked=st.reviewedonly; $('#set-varyimage').checked=st.varyimage;
  const labs=[...new Set(T.sections.map(s=>s.lab))];
  $('#section-list').innerHTML=labs.map(lab=>`<div class="lab"><div class="lab-name">${esc(lab)}</div>`+
    T.sections.filter(s=>s.lab===lab).map(s=>{
      const withImg=s.terms.filter(hasImage).length;
      return `<div class="sec-row ${S.focus===s.id?'focused':''}"><input type="checkbox" data-sec="${s.id}" ${S.excluded.includes(s.id)?'':'checked'}><span>${esc(s.name)}</span><span class="count">${withImg}/${s.terms.length} with images</span><button class="ghost ${S.focus===s.id?'on':''}" data-focus="${s.id}">Focus</button></div>`;}).join('')+'</div>').join('');
  document.querySelectorAll('[data-sec]').forEach(cb=>cb.onchange=()=>{ const id=cb.dataset.sec; S.excluded=S.excluded.filter(x=>x!==id); if(!cb.checked) S.excluded.push(id); save(); queue=[]; });
  document.querySelectorAll('[data-focus]').forEach(b=>b.onclick=()=>{ S.focus = S.focus===b.dataset.focus?null:b.dataset.focus; save(); queue=[]; settingsRender(); });
  $('#removed-list').innerHTML=S.removed.length?S.removed.map(id=>`<span class="chip">${esc(termById[id]?.name||id)}<button data-restore="${id}" title="Restore">↩</button></span>`).join(''):'None. Use “Remove term” during the quiz to drop a term you don’t need.';
  document.querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>{ S.removed=S.removed.filter(x=>x!==b.dataset.restore); save(); settingsRender(); });
  const used=new Set(ARROWS0.map(a=>a.img));
  $('#sources-list').innerHTML='<ul>'+Object.entries(IMG).filter(([k])=>used.has(k)).map(([k,im])=>`<li><a href="${esc(im.source)}" target="_blank" rel="noopener">${esc(im.title)}</a> · ${esc(im.author)} · ${esc(im.license)}</li>`).join('')+'</ul>';
}
const bindSet=(sel,key,conv=v=>v,prop='value')=>$(sel).onchange=e=>{ S.settings[key]=conv(e.target[prop]); save(); queue=[]; };
bindSet('#set-needed','needed',Number); bindSet('#set-typo','typo'); bindSet('#set-requeue','requeue'); bindSet('#set-order','order');
bindSet('#set-autoadvance','autoadvance',Boolean,'checked'); bindSet('#set-typeword','typeword',Boolean,'checked'); bindSet('#set-reviewedonly','reviewedonly',Boolean,'checked'); bindSet('#set-varyimage','varyimage',Boolean,'checked');
$('#sec-all').onclick=()=>{S.excluded=[]; save(); queue=[]; settingsRender();};
$('#sec-none').onclick=()=>{S.excluded=T.sections.map(s=>s.id); S.focus=null; save(); queue=[]; settingsRender();};
$('#sec-clearfocus').onclick=()=>{S.focus=null; save(); queue=[]; settingsRender();};
$('#btn-export').onclick=()=>{
  const blob=new Blob([JSON.stringify({app:'msk-quiz',version:1,exported:new Date().toISOString(),data:S},null,1)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='msk-quiz-backup.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  $('#backup-msg').textContent='Backup downloaded.';
};
$('#file-import').onchange=e=>{
  const f=e.target.files[0]; if(!f) return; const r=new FileReader();
  r.onload=()=>{ try{ const j=JSON.parse(r.result); const d=j.data||j; localStorage.setItem(STORE_KEY,JSON.stringify(d)); S=load(); queue=[]; settingsRender(); $('#backup-msg').textContent='Backup imported.'; }catch(err){ $('#backup-msg').textContent='That file could not be read.'; } };
  r.readAsText(f);
};
$('#btn-reset-progress').onclick=()=>{
  const b=$('#btn-reset-progress');
  if(b.dataset.armed!=='1'){ b.dataset.armed='1'; b.textContent='Click again to reset all quiz progress'; setTimeout(()=>{b.dataset.armed='';b.textContent='Reset quiz progress';},3000); return; }
  S.progress={}; save(); queue=[]; b.dataset.armed=''; b.textContent='Reset quiz progress'; $('#backup-msg').textContent='Quiz progress reset (arrow review and settings kept).';
};

/* ---------------- nav ---------------- */
document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>show(b.dataset.view));
function show(v){
  document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  document.querySelectorAll('.view').forEach(s=>s.classList.toggle('active',s.id==='view-'+v));
  if(v==='quiz'){ if(!current||!queue.length||queue[0]!==current.id) nextCard(); else { updateStats(); $('#answer').focus(); } }
  if(v==='review') rvBuild();
  if(v==='browse') browseRender();
  if(v==='settings') settingsRender();
}
$('#review-section').innerHTML='<option value="">All sections</option>'+T.sections.map(s=>`<option value="${s.id}">${esc(s.lab.split(' ')[0])} › ${esc(s.name)}</option>`).join('');
show('quiz');
window.__msk={current:()=>current&&current.id, grade:(id,t)=>grade(termById[id],t)};
})();

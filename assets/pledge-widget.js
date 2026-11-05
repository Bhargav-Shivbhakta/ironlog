/* Pledge widget: keep your pledges from the Hub without opening Pledge.
   Same document and rules as apps/pledge.html:  users/{uid}/apps/pledge-v3/data/state  {json:{version:3,pledges:[...]}}
   Does here: today's pledges with a tick (the ones you tick yourself), tap earlier days of this week, progress / streak /
   days left, claim an earned prize, start over after a miss, add a "tick it myself" pledge, edit, delete (Undo).
   Pledges that tick themselves from other apps show their status here; creating those stays in the Pledge app. */
(function(){
'use strict';
if(typeof WIDGET_TYPES==='undefined'||!WIDGET_TYPES.pledge)return;
const PW={list:null,busy:false,ui:{edit:null,adding:false}};
const esc2=s=>esc(String(s==null?'':s));
const DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const p2=n=>String(n).padStart(2,'0');
const dow=iso=>new Date(iso+'T12:00:00').getDay();
const between=(a,b)=>Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/864e5);
const pretty=iso=>new Date(iso+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'});
const safeUrl=u=>/^https?:\/\//i.test(u||'')?u:'';
const safeImg=u=>/^(data:image\/(jpeg|png|webp);base64,|https:\/\/)/i.test(u||'')?u:'';
const sref=()=>db.collection('users').doc(state.user.uid).collection('apps').doc('pledge-v3').collection('data').doc('state');
/* ---- the maths, same as the Pledge app ---- */
const plen=p=>p.length||(p.weeks||4)*7;
const pend=p=>addDays(p.start,plen(p)-1);
function weekBlocks(p){const out=[],end=pend(p);for(let s=p.start;s<=end;s=addDays(s,7)){const e=addDays(s,6)>end?end:addDays(s,6);out.push({s,e,n:between(s,e)+1})}return out}
function weekTicks(p,w){let t=0;for(let d=w.s;d<=w.e;d=addDays(d,1))if((p.log||{})[d])t++;return t}
function calc(p){
  const T=today(),end=pend(p),allowed=p.misses||0,daysLeft=Math.max(0,between(T,end)+1),log=p.log||{},days=p.days||[];
  let totalDue=0,done=0,missed=0,left=0,streak=0;
  if(p.mode==='milestone'){
    const reached=Object.keys(log).length>0;
    return{end,totalDue:1,done:reached?1:0,status:p.claimed?'claimed':reached?'earned':T>end?'failed':'active',streak:0,daysLeft,need:reached?0:1,unit:'day',milestone:true};
  }
  if(p.mode==='perweek'){
    const need=Math.max(1,p.perWeek||1);let run=0;
    weekBlocks(p).forEach(w=>{const q=Math.min(need,w.n),t=weekTicks(p,w);totalDue+=q;done+=Math.min(q,t);
      if(w.e<T){missed+=Math.max(0,q-t);run=t>=q?run+1:0}
      else if(w.s<=T){const rem=between(T,w.e)+1,gap=Math.max(0,q-t);if(gap>rem)missed+=gap-rem;left+=gap;if(t>=q)run++}
      else left+=q});
    streak=run;
  }else{
    for(let d=p.start;d<=end;d=addDays(d,1)){if(!days.includes(dow(d)))continue;totalDue++;if(log[d])done++;else if(d<T)missed++;else left++}
    for(let d=T>end?end:T;d>=p.start;d=addDays(d,-1)){if(!days.includes(dow(d)))continue;if(log[d])streak++;else if(d===T)continue;else break}
  }
  let status='active';
  if(p.claimed)status='claimed';else if(totalDue&&done>=Math.max(1,totalDue-allowed))status='earned';else if(missed>allowed)status='failed';
  return{end,totalDue,done,missed,left,status,streak,daysLeft,need:Math.max(0,Math.max(1,totalDue-allowed)-done),unit:p.mode==='perweek'?'week':'day'};
}
const inWindow=(p,d)=>d>=p.start&&d<=pend(p);
function isDue(p,d){if(!inWindow(p,d))return false;if(p.mode==='milestone')return false;if(p.mode==='perweek')return true;return(p.days||[]).includes(dow(d))}
function dueToday(p,T){
  if(!isDue(p,T))return false;
  if(p.mode==='perweek'){if((p.log||{})[T])return true;const w=weekBlocks(p).find(x=>T>=x.s&&T<=x.e);return !!w&&weekTicks(p,w)<Math.min(Math.max(1,p.perWeek||1),w.n)}
  return true;
}
/* ---- load / save (merge pledge by pledge, newest wins, like the app) ---- */
const parse=s=>{try{const j=s&&s.exists&&s.data().json?JSON.parse(s.data().json):null;return j&&Array.isArray(j.pledges)?j.pledges:null}catch(e){return null}};
async function load(){const l=parse(await sref().get());PW.list=l||[];return PW.list}
async function mutate(fn){
  if(PW.busy)return null;PW.busy=true;
  try{
    let out=null;
    await db.runTransaction(async tx=>{
      const sn=await tx.get(sref());const list=parse(sn)||[];
      out=fn(list);if(out===false)return;
      tx.set(sref(),{json:JSON.stringify({version:3,pledges:list}),updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
      PW.list=list;
    });
    if(out===false)return null;
    try{HubSync.emit(['pledge'],0)}catch(e){}
    return out||true;
  }catch(e){console.warn('pledge widget',e);toast('Could not save that');return null}
  finally{PW.busy=false}
}
const find=(list,id)=>list.find(p=>p.id===id);
const mine=()=>(PW.list||[]).filter(p=>!p.deleted&&p.owner===state.profile&&p.start);
/* ---- paint ---- */
function stamps(p){
  const T=today(),mon=addDays(T,-((dow(T)+6)%7)),linked=p.kind==='linked',c=calc(p);
  let h='<div class="pw-week">';
  for(let i=0;i<7;i++){
    const d=addDays(mon,i),due=isDue(p,d),done=!!(p.log||{})[d];
    let cls='pw-st',sym='';
    if(!due&&!done)cls+=' off';else if(done){cls+=' done';sym='✓'}else if(d>T)cls+=' up';else if(d===T)cls+=' now';else if(p.mode==='perweek')cls+=' up';else{cls+=' miss';sym='✕'}
    const tap=!linked&&c.status!=='claimed'&&(due||done)&&d<=T;
    h+='<span class="pw-d"><small>'+DOW[dow(d)].slice(0,2)+'</small>'+(tap?'<button type="button" class="'+cls+'" data-pw="day" data-d="'+d+'" title="'+pretty(d)+'">'+sym+'</button>':'<i class="'+cls+'" title="'+pretty(d)+'">'+sym+'</i>')+'</span>';
  }
  return h+'</div>';
}
function cadence(p){return p.mode==='perweek'?(p.perWeek||1)+'× a week':p.mode==='milestone'?'By '+pretty(pend(p)):((p.days||[]).length===7?'Every day':(p.days||[]).slice().sort((a,b)=>((a+6)%7)-((b+6)%7)).map(d=>DOW[d]).join(' '))}
function card(p,S){
  const T=today(),c=calc(p),linked=p.kind==='linked',ed=PW.ui.edit===p.id,due=dueToday(p,T),log=p.log||{};
  const prize=p.prize&&p.prize.name;
  let act='';
  if(c.status==='active'){
    if(p.mode==='milestone')act='<span class="pw-auto">Watches your weigh-ins</span>';
    else if(linked)act='<span class="pw-auto">Ticks itself · '+(due?(log[T]?'done today':'not yet today'):'nothing due today')+'</span>';
    else if(due||log[T])act=log[T]?'<button type="button" class="pw-btn on" data-pw="tick">✓ Kept today · undo</button>':'<button type="button" class="pw-btn go" data-pw="tick">Mark today kept</button>';
    else act='<span class="pw-auto">'+(p.mode==='perweek'?"This week's target is met":'Rest day today')+'</span>';
  }else if(c.status==='earned')act='<button type="button" class="pw-btn go" data-pw="claim">'+(prize?'Claim it':'Mark complete')+'</button>';
  else if(c.status==='failed')act='<span class="pw-auto">'+(p.mode==='milestone'?'Time ran out.':'Too many missed days.')+'</span><button type="button" class="pw-btn" data-pw="restart">Start over today</button>';
  else act='<span class="pw-auto">Claimed. Enjoy it.</span>';
  let h='<div class="pw-card '+c.status+'" data-id="'+esc2(p.id)+'"><div class="pw-top"><b>'+esc2(p.title)+'</b><span class="pw-chip">'+(linked?'Linked':'Mine')+' · '+esc2(cadence(p))+'</span></div>'+
    (S.week&&p.mode!=='milestone'?stamps(p):'')+
    '<div class="pw-line"><span>'+(p.mode==='milestone'?'Reach your target':c.done+' of '+c.totalDue+' ticks')+(c.streak?' · '+c.streak+' '+c.unit+' streak':'')+'</span><span>'+(c.status==='active'?c.daysLeft+' day'+(c.daysLeft===1?'':'s')+' left':'')+'</span></div>'+
    (S.prize&&(prize||(p.prize&&p.prize.image))?(()=>{const img=safeImg(p.prize.image),url=safeUrl(p.prize.url);
      return '<div class="pw-prize">'+(img?'<span class="pw-pic" style="background-image:url(\''+esc2(img)+'\')"></span>':'🎁 ')+'<span><b>'+esc2(p.prize.name||'Your prize')+'</b> · '+(c.status==='claimed'?'claimed':c.status==='earned'?'earned':c.status==='failed'?'not this round':c.need+' more tick'+(c.need===1?'':'s')+' to unlock')+(url?' · <a href="'+esc2(url)+'" target="_blank" rel="noopener noreferrer">View it</a>':'')+'</span></div>'})():'')+
    '<div class="pw-act">'+act+'<span class="pw-menu"><button type="button" data-pw="edit">Edit</button><button type="button" data-pw="del">Delete</button></span></div></div>';
  if(ed)h+='<div class="pw-edit" data-id="'+esc2(p.id)+'"><label>Name<input class="pw-e-t" maxlength="80" value="'+esc2(p.title)+'"></label><label>Prize<input class="pw-e-p" maxlength="80" placeholder="optional" value="'+esc2((p.prize&&p.prize.name)||'')+'"></label><label>Days<select class="pw-e-l">'+[7,14,21,30,60,90].concat([plen(p)]).filter((n,i,a)=>a.indexOf(n)===i).sort((a,b)=>a-b).map(n=>'<option value="'+n+'"'+(n===plen(p)?' selected':'')+'>'+n+'</option>').join('')+'</select></label><button type="button" class="pw-btn go" data-pw="save-edit">Save</button><button type="button" data-pw="cancel-edit">Cancel</button></div>';
  return h;
}
function addForm(){
  return '<div class="pw-add"><div class="pw-row"><input class="pw-n" maxlength="80" placeholder="New pledge you tick yourself, e.g. No sugar" aria-label="Pledge"></div>'+
    '<div class="pw-row"><select class="pw-c" aria-label="How often"><option value="d7">Every day</option><option value="wk">Mon to Fri</option>'+[1,2,3,4,5,6].map(n=>'<option value="w'+n+'">'+n+'× a week</option>').join('')+'</select>'+
    '<select class="pw-l" aria-label="For how many days">'+[7,14,21,30,60,90].map(n=>'<option value="'+n+'"'+(n===14?' selected':'')+'>'+n+' days</option>').join('')+'</select>'+
    '<input class="pw-z" maxlength="80" placeholder="Prize (optional)" aria-label="Prize"><button type="button" class="pw-btn go" data-pw="add">Pledge</button></div></div>';
}
function paint(el){
  if(!PW.list){el.innerHTML='<div class="empty-state"><strong>Unavailable</strong>Could not load Pledge.</div>';return}
  let S={list:true,week:true,prize:true,others:true};
  try{S=Object.assign(S,wsAll(state.widgets.find(w=>w.type==='pledge'),WIDGET_TYPES.pledge))}catch(e){}
  const T=today(),all=mine();
  const live=all.filter(p=>{const c=calc(p);return !p.claimed&&(c.status!=='claimed')&&T>=p.start&&(T<=pend(p)||c.status==='earned'||c.status==='failed')});
  const due=live.filter(p=>p.mode!=='milestone'&&dueToday(p,T)),kept=due.filter(p=>(p.log||{})[T]).length;
  const earned=live.filter(p=>calc(p).status==='earned').length;
  const keep={n:(el.querySelector('.pw-n')||{}).value,z:(el.querySelector('.pw-z')||{}).value};
  const rows=live.slice().sort((a,b)=>{const r=p=>calc(p).status==='earned'?0:dueToday(p,T)&&!(p.log||{})[T]?1:dueToday(p,T)?2:3;return r(a)-r(b)}).filter(p=>S.others||dueToday(p,T)||calc(p).status==='earned');
  let h='<div class="bw pw"><div class="pw-hero"><div class="bw-big"><strong>'+kept+' / '+due.length+'</strong><span>kept today'+(earned?' · '+earned+' prize'+(earned===1?'':'s')+' to claim':'')+'</span></div>'+(due.length?'<div class="bw-bar pw-meter"><i style="width:'+Math.round(kept/due.length*100)+'%"></i></div>':'')+'</div>';
  if(S.list)h+=rows.length?'<div class="pw-list">'+rows.map(p=>card(p,S)).join('')+'</div>':'<div class="bw-empty">Nothing pledged right now. Add one below.</div>';
  h+=addForm()+'<a class="widget-card-link" href="apps/pledge.html" data-profile-link>Open Pledge <i data-lucide="arrow-up-right"></i></a></div>';
  el.innerHTML=h;
  const n=el.querySelector('.pw-n');if(n&&keep.n)n.value=keep.n;const z=el.querySelector('.pw-z');if(z&&keep.z)z.value=keep.z;
  try{updateProfileLinks();window.lucide&&lucide.createIcons()}catch(e){}
}
/* ---- actions ---- */
async function toggleDay(el,id,d){
  const r=await mutate(l=>{const p=find(l,id);if(!p||p.kind==='linked')return false;p.log=p.log||{};const was=!!p.log[d];if(was)delete p.log[d];else p.log[d]=1;p.u=Date.now();return {id,d,was,earned:!was&&calc(p).status==='earned'}});
  paint(el);if(!r||!r.id)return;
  toast(r.earned?'Pledge kept. Your prize is unlocked':(r.was?'Unticked':'Kept'),'Undo',async()=>{await mutate(l=>{const p=find(l,r.id);if(!p)return false;p.log=p.log||{};if(r.was)p.log[r.d]=1;else delete p.log[r.d];p.u=Date.now()});paint(el)});
}
async function claim(el,id){
  const r=await mutate(l=>{const p=find(l,id);if(!p)return false;const prev=p.claimed;p.claimed=Date.now();p.u=Date.now();return {id,prev}});
  paint(el);if(r&&r.id)toast('Claimed. You earned it.','Undo',async()=>{await mutate(l=>{const p=find(l,r.id);if(!p)return false;p.claimed=r.prev||null;p.u=Date.now()});paint(el)});
}
async function restart(el,id){
  const r=await mutate(l=>{const p=find(l,id);if(!p)return false;const prev={start:p.start,log:p.log,claimed:p.claimed};p.start=today();p.log={};p.claimed=null;p.u=Date.now();return {id,prev}});
  paint(el);if(r&&r.id)toast('Fresh start','Undo',async()=>{await mutate(l=>{const p=find(l,r.id);if(!p)return false;Object.assign(p,r.prev);p.u=Date.now()});paint(el)});
}
async function del(el,id){
  const r=await mutate(l=>{const p=find(l,id);if(!p)return false;p.deleted=true;p.u=Date.now();return {id}});
  PW.ui.edit=null;paint(el);if(r&&r.id)toast('Pledge deleted','Undo',async()=>{await mutate(l=>{const p=find(l,r.id);if(!p)return false;p.deleted=false;p.u=Date.now()});paint(el)});
}
async function saveEdit(el,row){
  const id=row.dataset.id,t=(row.querySelector('.pw-e-t').value||'').trim(),pz=(row.querySelector('.pw-e-p').value||'').trim(),len=parseInt(row.querySelector('.pw-e-l').value,10)||0;
  if(!t)return toast('A pledge needs a name');
  const r=await mutate(l=>{const p=find(l,id);if(!p)return false;const prev={title:p.title,prize:JSON.parse(JSON.stringify(p.prize||{name:'',url:'',image:''})),length:p.length,weeks:p.weeks};
    p.title=t;p.prize=Object.assign({name:'',url:'',image:''},p.prize||{},{name:pz});if(len){p.length=len;delete p.weeks}p.u=Date.now();return {id,prev}});
  PW.ui.edit=null;paint(el);
  if(r&&r.id)toast('Saved','Undo',async()=>{await mutate(l=>{const p=find(l,r.id);if(!p)return false;p.title=r.prev.title;p.prize=r.prev.prize;if(r.prev.length==null)delete p.length;else p.length=r.prev.length;if(r.prev.weeks!=null)p.weeks=r.prev.weeks;p.u=Date.now()});paint(el)});
}
async function addPledge(el){
  const t=(el.querySelector('.pw-n').value||'').trim();if(!t)return toast('Name your pledge first');
  const c=el.querySelector('.pw-c').value,len=parseInt(el.querySelector('.pw-l').value,10)||14,pz=(el.querySelector('.pw-z').value||'').trim();
  const mode=/^w\d$/.test(c)?'perweek':'days',days=c==='wk'?[1,2,3,4,5]:[0,1,2,3,4,5,6];
  const id='p-'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  const r=await mutate(l=>{l.push({id,owner:state.profile,title:t,why:'',kind:'own',src:null,days,mode,perWeek:mode==='perweek'?parseInt(c.slice(1),10):3,length:len,start:today(),misses:0,prize:{name:pz,url:'',image:''},log:{},claimed:null,createdAt:Date.now(),u:Date.now()});return {id}});
  if(!r)return;
  el.querySelector('.pw-n').value='';el.querySelector('.pw-z').value='';paint(el);
  toast('Pledge made','Undo',async()=>{await mutate(l=>{const p=find(l,id);if(!p)return false;p.deleted=true;p.u=Date.now()});paint(el)});
}
function wire(el){
  if(el.__pw)return;el.__pw=1;
  el.addEventListener('click',e=>{
    const b=e.target.closest('[data-pw]');if(!b||!el.contains(b))return;
    const k=b.dataset.pw,row=b.closest('[data-id]'),id=row&&row.dataset.id;
    if(k==='tick')toggleDay(el,id,today());
    else if(k==='day')toggleDay(el,id,b.dataset.d);
    else if(k==='claim')claim(el,id);
    else if(k==='restart')restart(el,id);
    else if(k==='del')del(el,id);
    else if(k==='edit'){PW.ui.edit=PW.ui.edit===id?null:id;paint(el)}
    else if(k==='cancel-edit'){PW.ui.edit=null;paint(el)}
    else if(k==='save-edit')saveEdit(el,row);
    else if(k==='add')addPledge(el);
  });
  el.addEventListener('keydown',e=>{
    if(e.key!=='Enter')return;
    if(e.target.matches('.pw-n,.pw-z')){e.preventDefault();addPledge(el)}
    if(e.target.matches('.pw-e-t,.pw-e-p')){e.preventDefault();saveEdit(el,e.target.closest('[data-id]'))}
  });
}
Object.assign(WIDGET_TYPES.pledge,{
  desc:"Keep your pledges from here: tick today (or earlier this week), see streaks and days left, claim prizes, start over, add, edit or delete. Same data as the Pledge app.",
  defaultSize:'lg',
  async render(el){
    wire(el);
    if(!PW.list)el.innerHTML='<div class="empty-state">Loading your pledges…</div>';
    try{await load()}catch(e){if(!PW.list){el.innerHTML='<div class="empty-state"><strong>Unavailable</strong>Could not load Pledge.</div>';return}}
    paint(el);
  }
});
if(typeof WIDGET_NO_CACHE==='object')WIDGET_NO_CACHE.pledge=1;
window.__pw={PW,paint,load,calc};
})();

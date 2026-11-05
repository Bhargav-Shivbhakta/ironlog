/* To-Do widget — one place for everything to do. Loaded after app.js (uses its helpers) and assets/todo-core.js.
   Same documents as the To-Do app, so both stay in step live:
     yours   -> todo-profiles/{profile}/data/tasks      shared -> todo-shared/tasks   (a task handed to someone sits in the shared one with a = their name)
   Tasks keep the app's fields; the widget only adds a (who), by (who handed it over), est, dl (deadline), mp (map position), doneBy, completedAt.
   Replaces the old Priorities and Task order map widgets. */
(function(){
'use strict';
const TC=window.TodoCore;if(!TC||typeof WIDGET_TYPES==='undefined')return;
const TODO_SETTINGS=[
  {h:'New tasks'},
  {key:'defday',label:'A task with no day goes to',type:'seg',opts:[['today','Today'],['none','No date (Inbox)']],def:'today'},
  {key:'chips',label:'Show my usual tasks as quick buttons',type:'bool',def:true},
  {h:'What to show'},
  {key:'sort',label:'Order',type:'seg',opts:[['smart','Smart'],['time','Time'],['pri','Priority']],def:'smart'},
  {key:'first',label:'"Do this first" suggestion',hint:'The task that unlocks the most others',type:'bool',def:true},
  {key:'inbox',label:'Tasks with no date',type:'bool',def:true},
  {key:'later',label:'Coming up (later dates)',type:'bool',def:true},
  {key:'wait',label:'Waiting on something else',type:'bool',def:true},
  {key:'given',label:'Given to the other person',type:'bool',def:true},
  {key:'doneT',label:'Done today',type:'bool',def:true},
  {key:'week',label:'Week load strip',hint:'Open tasks per day, next 7 days',type:'bool',def:true},
  {key:'max',label:'Rows before "Show all"',type:'seg',opts:[['6','6'],['10','10'],['20','20'],['99','All']],def:'10'}
];
const td={p:[],s:[],got:{p:false,s:false},unP:null,unS:null,q:Promise.resolve(),open:{},comp:{text:'',ign:new Set(),day:null,who:null,pri:null,keep:false},map:{open:false,drag:null,sel:null},paintT:null,all:false,undo:null,err:false};
window.__td=td;window.__tdPaint=(f)=>paint(f);
const other=()=>state.profile==='Anusha'?'Bhargav':'Anusha';
const me=()=>state.profile;
const pRef=()=>profileRef('todo-profiles','tasks'),sRef=()=>sharedTodoRef();
const S=()=>wsAll(state.widgets.find(x=>x.type==='todo'),WIDGET_TYPES.todo);
const parseArr=d=>{try{const a=JSON.parse(d.data().json);return Array.isArray(a)?a:[]}catch(e){return[]}};
const all=()=>TC.view(td.p,td.s);
const allT=()=>td.p.concat(td.s);
const els=()=>[...document.querySelectorAll('[data-widget-type="todo"] .widget-card-body')];
function sync(){state.personalTasks=td.p;state.sharedTasks=td.s}

/* ---------- storage ---------- */
function tx(which,fn){
  td.q=td.q.then(async()=>{
    try{
      const ref=which==='s'?sRef():pRef();let out=null,skip=false;
      await db.runTransaction(async t=>{const sn=await t.get(ref);const arr=sn.exists&&sn.data().json?parseArr(sn):[];skip=false;if(fn(arr)===false){skip=true;return}t.set(ref,{json:JSON.stringify(arr),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});out=arr});
      if(!skip){if(which==='s')td.s=out;else td.p=out;sync();paint(true)}
      return{ok:true,skipped:skip};
    }catch(e){console.warn(e);toast('Couldn’t save — check your connection and try again');return{ok:false}}
  });
  return td.q;
}
const where=id=>td.p.some(t=>t.id===id)?'p':td.s.some(t=>t.id===id)?'s':null;
const setUndo=(label,fn)=>{td.undo=fn;toast(label,'Undo',async()=>{const f=td.undo;td.undo=null;if(f)await f()})};
function patch(id,fn,label){const w=where(id);if(!w)return Promise.resolve({ok:false});return tx(w,a=>{const t=a.find(x=>x.id===id);if(!t)return false;fn(t,a)})}
/* move a task between the two documents (add on the new side first so it can never be lost) */
async function move(id,to,edit){
  const from=where(id);if(!from)return;
  const src=(from==='p'?td.p:td.s).find(t=>t.id===id);if(!src)return;
  const copy=Object.assign({},src);if(edit)edit(copy);
  if(from===to){return patch(id,t=>{Object.keys(t).forEach(k=>delete t[k]);Object.assign(t,copy)})}
  const r=await tx(to,a=>{if(a.some(x=>x.id===id))return false;a.push(copy)});if(!r.ok)return;
  await tx(from,a=>{const i=a.findIndex(x=>x.id===id);if(i<0)return false;a.splice(i,1)});
}
async function addTask(p,o){
  const t=TC.newTask(p,{today:today(),me:me(),defaultToday:S().defday==='today',assignee:o.who&&o.who!=='me'&&o.who!=='shared'?o.who:null});
  if(p.deadline)t.dl=true;
  if(o.pri!=null)t.priority=o.pri;
  const shared=o.who==='shared'||(o.who&&o.who!=='me');
  if(shared)t.listId='shared';
  const r=await tx(shared?'s':'p',a=>{a.push(t)});
  if(r.ok){
    const who=t.a&&t.a!==me()?t.a:null;
    setUndo(who?'Given to '+who:'Task added',()=>tx(shared?'s':'p',a=>{const i=a.findIndex(x=>x.id===t.id);if(i<0)return false;a.splice(i,1)}));
  }
  return t;
}
async function tick(id){
  const w=where(id);if(!w)return;
  const arr=(w==='s'?td.s:td.p),t=arr.find(x=>x.id===id);if(!t)return;
  if(TC.isBlocked(t,allT())){const b=TC.openDeps(t,allT())[0];toast('Waiting for “'+(b&&b.title)+'” first');return}
  let spawned=null;
  const r=await tx(w,a=>{const o=TC.complete(a,id,me(),today());if(!o)return false;spawned=o.spawned});
  if(r.ok&&!r.skipped)setUndo('Done: '+t.title,()=>untick(id,spawned));
}
async function untick(id,spawned){const w=where(id);if(!w)return;await tx(w,a=>{const t=TC.reopen(a,id);if(!t)return false;if(spawned){const i=a.findIndex(x=>x.id===spawned&&!x.done);if(i>=0)a.splice(i,1)}})}
async function del(id){const w=where(id);if(!w)return;const keep=(w==='s'?td.s:td.p).find(t=>t.id===id);if(!keep)return;
  const r=await tx(w,a=>{const i=a.findIndex(x=>x.id===id);if(i<0)return false;a.splice(i,1);a.forEach(x=>{if(x.dependsOn&&x.dependsOn.includes(id))x.dependsOn=x.dependsOn.filter(d=>d!==id)})});
  if(r.ok)setUndo('Deleted “'+keep.title+'”',()=>tx(w,a=>{if(a.some(x=>x.id===keep.id))return false;a.push(keep)}))}
const setDue=(id,due)=>patch(id,t=>{t.due=due||null;if(!due)t.dueTime=null});
const setPri=(id,v)=>patch(id,t=>{t.priority=v});

/* ---------- live watch ---------- */
function startHubTodoWatch(){
  ['unP','unS'].forEach(k=>{if(td[k]){try{td[k]()}catch(e){}td[k]=null}});
  td.p=state.personalTasks||[];td.s=state.sharedTasks||[];td.got={p:false,s:false};td.err=false;
  if(!state.user||!state.profile)return;
  try{
    td.unP=pRef().onSnapshot(d=>{td.p=d.exists&&d.data().json?parseArr(d):[];td.got.p=true;sync();paint()},()=>{td.err=true;td.got.p=true;paint()});
    td.unS=sRef().onSnapshot(d=>{td.s=d.exists&&d.data().json?parseArr(d):[];td.got.s=true;sync();paint()},()=>{td.err=true;td.got.s=true;paint()});
  }catch(e){td.err=true}
}
window.startHubTodoWatch=startHubTodoWatch;

/* ---------- painting ---------- */
function paint(force){
  clearTimeout(td.paintT);
  td.paintT=setTimeout(()=>{els().forEach(el=>{
    const a=document.activeElement;
    if(!force&&a&&el.contains(a)&&(a.tagName==='INPUT'||a.isContentEditable)){return}
    if(td.drag&&!force)return;
    try{draw(el)}catch(e){console.warn(e)}});
    if(td.map.open)mapDraw();
  },force?0:40);
}
const chipOf=(t,today0)=>{
  const c=[];
  if(t.due){const lab=TC.dayLabel(t.due,today0);c.push('<span class="td-c '+(t.due<today0?'late':t.due===today0?'today':'')+'">'+esc(lab)+(t.dueTime?' · '+(t.dl?'by ':'')+esc(TC.time12(t.dueTime)):'')+'</span>')}
  else if(t.dueTime)c.push('<span class="td-c">'+(t.dl?'by ':'')+esc(TC.time12(t.dueTime))+'</span>');
  if(t.priority>=2)c.push('<span class="td-c p'+t.priority+'">'+(t.priority===3?'Urgent':'Important')+'</span>');
  if(t.repeat&&t.repeat!=='none')c.push('<span class="td-c">↻</span>');
  if(t.est)c.push('<span class="td-c">'+TC.fmtEst(t.est)+'</span>');
  const subs=t.subtasks||[];if(subs.length)c.push('<span class="td-c">'+subs.filter(s=>s.done).length+'/'+subs.length+'</span>');
  return c.join('');
};
function rowHtml(it,ctx){
  const t=it.t,blocked=TC.isBlocked(t,allT()),theirs=TC.owner(it,me())==='theirs',today0=ctx.today;
  const bl=blocked?TC.openDeps(t,allT())[0]:null;
  const who=it.sh?(t.a?(t.a===me()?(t.by&&t.by!==me()?'<span class="td-c who">from '+esc(t.by)+'</span>':''):'<span class="td-c who">→ '+esc(t.a)+'</span>'):'<span class="td-c sh">shared</span>'):'';
  const un=TC.unlocks(t,allT());
  return '<div class="td-row'+(t.done?' done':'')+(blocked?' blocked':'')+(theirs?' theirs':'')+'" data-id="'+esc(t.id)+'" draggable="false">'+
    '<button type="button" class="td-ck'+(t.done?' on':'')+'" data-a="tick" aria-label="'+(t.done?'Mark not done':'Done: '+esc(t.title))+'" '+(blocked?'title="Waiting for '+esc(bl&&bl.title)+'"':'')+'>'+(t.done?'✓':blocked?'🔒':'')+'</button>'+
    '<div class="td-main"><div class="td-t" data-a="open">'+esc(t.title)+'</div><div class="td-cs">'+chipOf(t,today0)+who+(t.done&&t.doneBy&&t.doneBy!==(t.by||t.createdBy)?'<span class="td-c who">done by '+esc(t.doneBy)+'</span>':'')+(un&&!t.done?'<span class="td-c">unlocks '+un+'</span>':'')+(blocked?'<span class="td-c">after “'+esc((bl&&bl.title||'').slice(0,24))+'”</span>':'')+'</div></div>'+
    '<button type="button" class="td-more" data-a="menu" aria-label="More">⋯</button></div>';
}
function groups(){
  const st=S(),today0=today(),items=all(),mine=[],theirs=[],done=[];
  items.forEach(it=>{const t=it.t;
    if(t.done){if(t.completedOn===today0&&(TC.owner(it,me())!=='theirs'||t.doneBy===me()))done.push(it);return}
    if(t.startDate&&t.startDate>today0&&!t.due)return;
    (TC.owner(it,me())==='theirs'?theirs:mine).push(it)});
  const all2=allT(),blocked=[],ready=[];
  mine.forEach(it=>(TC.isBlocked(it.t,all2)?blocked:ready).push(it));
  const sort=a=>TC.sortItems(a,st.sort==='pri'?'priority':st.sort==='time'?'time':'smart',all2,today0);
  const g=[];
  const over=ready.filter(i=>i.t.due&&i.t.due<today0),tod=ready.filter(i=>i.t.due===today0||(!i.t.due&&i.t.startDate===today0&&(i.t.priority||0)>0)),
    inbox=ready.filter(i=>!i.t.due&&!tod.includes(i)),later=ready.filter(i=>i.t.due&&i.t.due>today0);
  if(over.length)g.push({k:'over',h:'Overdue',items:sort(over),act:'<button type="button" class="td-link" data-a="moveall">Move all to today</button>'});
  g.push({k:'today',h:'Today',items:sort(tod),empty:over.length?'':'Nothing due today.'});
  if(st.inbox&&inbox.length)g.push({k:'inbox',h:'No date',items:sort(inbox),fold:document.documentElement.classList.contains('lap-look')});
  if(st.later&&later.length)g.push({k:'later',h:'Coming up',items:TC.sortItems(later,'time',all2,today0),fold:true});
  if(st.wait&&blocked.length)g.push({k:'wait',h:'Waiting on something',items:blocked,fold:true});
  if(st.given&&theirs.length)g.push({k:'given',h:'Given to '+other(),items:sort(theirs),fold:true});
  if(st.doneT&&done.length)g.push({k:'done',h:'Done today',items:done.sort((a,b)=>String(b.t.completedAt||'').localeCompare(String(a.t.completedAt||''))),fold:true});
  return{g,ready:over.concat(tod),all:items};
}
function draw(el){
  const st=S(),today0=today(),root=el.querySelector('.td-root')||(el.querySelector('.td-body')?el:null);
  if(!root){mount(el);return}
  if(!td.got.p&&!td.got.s&&!all().length){root.querySelector('.td-body').innerHTML='<div class="td-empty">Loading…</div>';return}
  const {g,ready}=groups(),ctx={today:today0},max=td.all?999:Math.max(3,parseInt(st.max,10)||10);
  let html='';
  if(td.err)html+='<div class="td-err">Couldn’t reach your tasks. <button type="button" class="td-link" data-a="retry">Try again</button></div>';
  if(st.first){const best=TC.sortItems(ready.filter(i=>!i.t.done&&TC.unlocks(i.t,allT())>0),'smart',allT(),today0)[0];
    if(best)html+='<div class="td-first"><span>Do this first</span><b>'+esc(best.t.title)+'</b><small>unlocks '+TC.unlocks(best.t,allT())+' other task'+(TC.unlocks(best.t,allT())===1?'':'s')+'</small><button type="button" class="td-ck" data-a="tick" data-id="'+esc(best.t.id)+'" aria-label="Done">✓</button></div>'}
  if(st.week){const ld=TC.load(all().filter(i=>TC.owner(i,me())!=='theirs'),today0,7),mx=Math.max(1,...ld.map(x=>x.n));
    html+='<div class="td-week" title="Open tasks per day">'+ld.map((x,i)=>'<span class="'+(i===0?'now':'')+'"><i style="height:'+Math.max(3,x.n/mx*100)+'%"></i><b>'+x.n+'</b><small>'+(i===0?'Now':['S','M','T','W','T','F','S'][new Date(x.date+'T12:00:00').getDay()])+'</small></span>').join('')+'</div>'}
  let shown=0;
  g.forEach(gr=>{
    const open=gr.fold?td.open[gr.k]===true:true;
    const list=open?gr.items.filter(()=>{shown++;return shown<=max||!gr.fold&&shown<=max}):[];
    html+='<section class="td-g td-g-'+gr.k+(open?' open':'')+'"><div class="td-gh" '+(gr.fold?'data-a="fold" data-k="'+gr.k+'" role="button"':'')+'><span>'+(gr.fold?'<i>'+(open?'▾':'▸')+'</i> ':'')+esc(gr.h)+'</span><em>'+gr.items.length+'</em>'+(gr.act||'')+'</div>'+
      (open?(gr.items.length?gr.items.slice(0,Math.max(0,max-(shown-list.length))).map(it=>rowHtml(it,ctx)).join(''):'<div class="td-empty">'+esc(gr.empty||'')+'</div>'):'')+'</section>';
  });
  const total=g.reduce((n,x)=>n+(x.fold&&td.open[x.k]!==true?0:x.items.length),0);
  if(!td.all&&total>max)html+='<button type="button" class="td-link td-all" data-a="showall">Show all '+total+'</button>';
  else if(td.all&&total>max)html+='<button type="button" class="td-link td-all" data-a="showless">Show fewer</button>';
  root.querySelector('.td-body').innerHTML=html;
  const often=st.chips?TC.often(all(),today0,5):[];
  const ch=root.querySelector('.td-often');if(ch)ch.innerHTML=often.map(o=>'<button type="button" data-often="'+esc(o.title)+'" data-wd="'+(o.wd==null?'':o.wd)+'" data-who="'+esc(o.who||(o.shared?'shared':''))+'" data-pri="'+o.pri+'" data-nodate="'+(o.nodate?1:'')+'">'+esc(o.title.length>16?o.title.slice(0,15)+'…':o.title)+'</button>').join('');
  const mb=root.querySelector('[data-a="map"]');if(mb)mb.classList.toggle('on',td.map.open);
  const n=g.find(x=>x.k==='today');const cnt=root.querySelector('.td-count');if(cnt)cnt.textContent=ready.length?ready.length+' to do':'All clear';
}

/* ---------- composer ---------- */
function compParse(){
  const c=td.comp;return TC.parse(c.text,{now:new Date(),me:me(),lists:[],tasks:allT().filter(t=>!t.done),ignore:c.ign});
}
function compChips(root){
  const c=td.comp,box=root.querySelector('.td-pv'),inp=root.querySelector('.td-in'),add=root.querySelector('.td-add');
  const has=c.text.trim().length>0;add.disabled=!has;
  if(!has){box.innerHTML='';root.querySelectorAll('.td-ch button.on').forEach(b=>b.classList.remove('on'));return}
  const p=compParse();
  const day=c.day!=null?c.day:(p.due===today()?'today':p.due===addDays(today(),1)?'tom':p.due?'later':'');
  const who=c.who||(p.shared?'shared':p.who&&p.who!==me()?other():'me');
  const pri=c.pri!=null?c.pri:p.pri;
  box.innerHTML=(p.title?'<span class="td-pt">'+esc(p.title)+'</span>':'')+p.chips.map(x=>'<span class="td-pc '+esc(x.cls||'')+'" data-key="'+esc(x.key)+'">'+esc(x.label)+'<button type="button" data-unchip="'+esc(x.key)+'" aria-label="Not this">×</button></span>').join('');
  root.querySelectorAll('[data-day]').forEach(b=>b.classList.toggle('on',b.dataset.day===day));
  root.querySelectorAll('[data-who]').forEach(b=>b.classList.toggle('on',b.dataset.who===(who===other()?'other':who)));
  root.querySelectorAll('[data-pri]').forEach(b=>b.classList.toggle('on',+b.dataset.pri===pri));
  root.querySelector('.td-keep').classList.toggle('on',!!c.keep);
}
async function compSubmit(root){
  const c=td.comp;if(!c.text.trim())return;
  const p=compParse();if(!p.title)return;
  let who=c.who||(p.shared?'shared':p.who&&p.who!==me()?p.who:'me');if(who==='other')who=other();
  let day=c.day;
  if(day==='today')p.due=today();else if(day==='tom')p.due=addDays(today(),1);else if(day==='none'){p.due=null;p.nodate=true;p.time=null}else if(day==='later'&&!p.due)p.due=addDays(today(),7);
  if(c.pri!=null)p.pri=c.pri;
  if(p.time&&!p.due)p.due=today();
  const wasKeep=c.keep;
  td.comp.text='';td.comp.ign=new Set();if(!wasKeep){td.comp.day=null;td.comp.who=null;td.comp.pri=null}
  const inp=root.querySelector('.td-in');inp.value='';compChips(root);
  const t=await addTask(p,{who,pri:c.pri!=null?c.pri:null});
  inp.focus();return t;
}
function mount(el){
  el.innerHTML='<div class="td-root"><div data-blk="add"><div class="td-comp"><div class="td-line"><input class="td-in" type="text" maxlength="240" placeholder="Add a task… try “call mom tomorrow 5pm urgent” or “pay rent for '+esc(other().toLowerCase())+'”" enterkeyhint="done" autocomplete="off"><button type="button" class="td-add" aria-label="Add task" disabled>Add</button><button type="button" class="td-mapb" data-a="map" title="Order map">Map</button></div>'+
    '<div class="td-pv"></div>'+
    '<div class="td-ch"><span class="td-cg" data-g="day">'+[['today','Today'],['tom','Tomorrow'],['later','Later'],['none','No date']].map(([k,l])=>'<button type="button" data-day="'+k+'">'+l+'</button>').join('')+'</span>'+
    '<span class="td-cg" data-g="who">'+[['me','Me'],['shared','Both'],['other',other()]].map(([k,l])=>'<button type="button" data-who="'+k+'">'+esc(l)+'</button>').join('')+'</span>'+
    '<span class="td-cg" data-g="pri">'+[[0,'Normal'],[2,'Important'],[3,'Urgent']].map(([k,l])=>'<button type="button" data-pri="'+k+'">'+l+'</button>').join('')+'</span>'+
    '<button type="button" class="td-keep" title="Keep these choices for the next task">Keep</button></div>'+
    '<div class="td-often"></div></div></div><div data-blk="list"><div class="td-sum"><span class="td-count"></span></div><div class="td-body"></div></div></div>';
  const root=el.querySelector('.td-root'),inp=root.querySelector('.td-in');
  inp.value=td.comp.text;compChips(root);
  const R=()=>el.querySelector('.td-root')||el;
  inp.addEventListener('input',()=>{td.comp.text=inp.value;compChips(R())});
  inp.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();compSubmit(R())}else if(e.key==='Escape'){inp.value='';td.comp.text='';td.comp.ign=new Set();compChips(R());inp.blur()}});
  if(!el.__tdClick){el.__tdClick=1;el.addEventListener('click',e=>onClick(e,el,el.querySelector('.td-root')||el))}
  draw(el);
}
function onClick(e,el,root){
  const q=s=>e.target.closest(s);let x;
  if(x=q('[data-unchip]')){td.comp.ign.add(x.dataset.unchip);compChips(root);return}
  if(x=q('[data-day]')){const k=x.dataset.day;td.comp.day=td.comp.day===k?null:k;compChips(root);root.querySelector('.td-in').focus();return}
  if(x=q('[data-who]')){const k=x.dataset.who;td.comp.who=td.comp.who===k?null:k;compChips(root);root.querySelector('.td-in').focus();return}
  if(x=q('[data-pri]')){const k=+x.dataset.pri;td.comp.pri=td.comp.pri===k?null:k;compChips(root);root.querySelector('.td-in').focus();return}
  if(q('.td-keep')){td.comp.keep=!td.comp.keep;compChips(root);return}
  if(q('.td-add')){compSubmit(root);return}
  if(x=q('[data-often]')){const inp=root.querySelector('.td-in');td.comp.text=x.dataset.often;td.comp.day=x.dataset.nodate?'none':null;td.comp.who=x.dataset.who||null;if(x.dataset.who==='shared')td.comp.who='shared';else if(x.dataset.who&&x.dataset.who!=='me')td.comp.who='other';td.comp.pri=+x.dataset.pri||null;
    if(x.dataset.wd!==''&&!x.dataset.nodate){const wd=+x.dataset.wd,t0=today();let d=t0;for(let i=0;i<8;i++){if(new Date(addDays(t0,i)+'T12:00:00').getDay()===wd){d=addDays(t0,i);break}}td.comp.day=d===t0?'today':d===addDays(t0,1)?'tom':'later'}
    inp.value=td.comp.text;compChips(root);compSubmit(root);return}
  if(q('[data-a="map"]')){mapToggle();return}
  const row=q('.td-row'),id=(x=q('[data-id]'))&&x.dataset.id||row&&row.dataset.id;
  if(x=q('[data-a="fold"]')){td.open[x.dataset.k]=td.open[x.dataset.k]!==true;draw(el);return}
  if(q('[data-a="showall"]')){td.all=true;draw(el);return}
  if(q('[data-a="showless"]')){td.all=false;draw(el);return}
  if(q('[data-a="retry"]')){startHubTodoWatch();return}
  if(q('[data-a="moveall"]')){const gr=groups().g.find(g=>g.k==='over');if(!gr)return;const lst=gr.items.map(i=>i.t.id),t0=today(),prev={};
    Promise.all(['p','s'].map(w=>tx(w,a=>{let n=0;a.forEach(t=>{if(lst.includes(t.id)){prev[t.id]=t.due;t.due=t0;n++}});if(!n)return false}))).then(()=>setUndo('Moved '+lst.length+' to today',()=>Promise.all(['p','s'].map(w=>tx(w,a=>{let n=0;a.forEach(t=>{if(t.id in prev){t.due=prev[t.id];n++}});if(!n)return false})))));return}
  if(q('[data-a="tick"]')&&id){const t=allT().find(t=>t.id===id);if(t&&t.done)untick(id);else tick(id);return}
  if(q('[data-a="menu"]')&&id){rowMenu(id,q('[data-a="menu"]'));return}
  if(q('[data-a="open"]')&&id){rowMenu(id,q('.td-row [data-a="menu"]')||q('.td-row'));return}
}
/* ---------- row menu ---------- */
function rowMenu(id,anchor){
  document.querySelectorAll('.td-menu').forEach(m=>m.remove());
  const w=where(id);if(!w)return;const t=(w==='s'?td.s:td.p).find(x=>x.id===id);if(!t)return;
  const t0=today(),m=document.createElement('div');m.className='td-menu';
  const sh=w==='s',o=other(),mine=!t.a||t.a===me();
  const items=[['Today',()=>setDue(id,t0)],['Tomorrow',()=>setDue(id,addDays(t0,1))],['Next week',()=>setDue(id,addDays(t0,7))],['No date',()=>setDue(id,null)],
    ['Priority: '+(['Normal','Low','Important','Urgent'][t.priority||0])+' → next',()=>setPri(id,((t.priority||0)+1)%4)],
    ...(mine?[['Give to '+o,()=>move(id,'s',c=>{c.a=o;c.by=me();c.listId='shared'})]]:[['Take it back',()=>move(id,'p',c=>{delete c.a;delete c.by;c.listId='personal'})]]),
    ...(!t.a&&!sh?[['Share with '+o,()=>move(id,'s',c=>{c.listId='shared'})]]:[]),
    ...(!t.a&&sh?[['Make private',()=>move(id,'p',c=>{c.listId='personal'})]]:[]),
    ['Open in To-Do app',()=>{location.href='apps/todo.html'}],['Delete',()=>del(id)]];
  m.innerHTML='<div class="td-mt">'+esc(t.title.slice(0,40))+'</div>'+items.map((x,i)=>'<button type="button" data-i="'+i+'">'+esc(x[0])+'</button>').join('');
  document.body.appendChild(m);
  const r=(anchor||document.body).getBoundingClientRect();
  m.style.top=Math.min(window.innerHeight-m.offsetHeight-8,Math.max(8,r.bottom+4))+'px';m.style.left=Math.min(window.innerWidth-m.offsetWidth-8,Math.max(8,r.right-m.offsetWidth))+'px';
  const close=()=>{m.remove();document.removeEventListener('pointerdown',away,true);document.removeEventListener('keydown',key,true)};
  const away=e=>{if(!m.contains(e.target))close()},key=e=>{if(e.key==='Escape'){e.stopPropagation();close()}};
  setTimeout(()=>{document.addEventListener('pointerdown',away,true);document.addEventListener('keydown',key,true)},0);
  m.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const f=items[+b.dataset.i];close();if(f)f[1]()});
}

/* ---------- the order map ---------- */
const NW=168,NH=54;
function mapToggle(on){
  td.map.open=on==null?!td.map.open:on;
  let pane=document.querySelector('.td-map');
  if(!td.map.open){if(pane)pane.remove();document.body.classList.remove('td-map-on');paint(true);return}
  if(!pane){pane=document.createElement('aside');pane.className='td-map';pane.setAttribute('aria-label','Order map');document.body.appendChild(pane);
    pane.innerHTML='<div class="tm-h"><b>Order map</b><small>Drag from a block’s ● to another block: it waits for the first. Drag blocks to place them.</small><span class="tm-btns"><button type="button" data-m="tidy">Tidy</button><button type="button" data-m="close" aria-label="Close map">✕</button></span></div>'+
      '<div class="tm-b"><div class="tm-tray"><h5>Not in the order yet</h5><div class="tm-tl"></div></div><div class="tm-cv"><svg class="tm-sv"></svg><div class="tm-nodes"></div><div class="tm-hint">Drag tasks here from the left, or double-click to make a new one.</div></div></div>';
    pane.insertAdjacentHTML('beforeend','<i class="tm-rz tm-rzw" title="Drag to change the width"></i><i class="tm-rz tm-rzh" title="Drag to change the height"></i><i class="tm-rz tm-rzc" title="Drag to resize"></i>');
    wireMap(pane);wireMapSize(pane)}
  mapApplySize();
  document.body.classList.add('td-map-on');mapDraw();
}
// The map window is resizable (drag its left edge, bottom edge or bottom-left corner); the size is remembered on this device.
function mapSizeGet(){let o={};try{o=JSON.parse(localStorage.getItem('td-map-size')||'{}')||{}}catch(e){}return o}
function mapApplySize(){
  const o=mapSizeGet(),r=document.documentElement.style,vw=innerWidth,vh=innerHeight;
  if(o.w)r.setProperty('--tdmw',Math.max(280,Math.min(vw-320,o.w))+'px');else r.removeProperty('--tdmw');
  if(o.h)r.setProperty('--tdmh',Math.max(240,Math.min(vh-24,o.h))+'px');else r.removeProperty('--tdmh');
}
function wireMapSize(pane){
  pane.querySelectorAll('.tm-rz').forEach(h=>h.addEventListener('pointerdown',e=>{
    e.preventDefault();e.stopPropagation();const mode=h.classList.contains('tm-rzw')?'w':h.classList.contains('tm-rzh')?'h':'wh',mobile=innerWidth<=800;
    const r=pane.getBoundingClientRect(),o=mapSizeGet();try{h.setPointerCapture(e.pointerId)}catch(x){}
    const mv=ev=>{
      if(mode.includes('w')&&!mobile)o.w=Math.round(Math.max(280,Math.min(innerWidth-320,r.right-ev.clientX)));
      if(mode.includes('h'))o.h=Math.round(Math.max(240,Math.min(innerHeight-24,mobile?innerHeight-8-ev.clientY:ev.clientY-r.top)));
      try{localStorage.setItem('td-map-size',JSON.stringify(o))}catch(x){}mapApplySize();
    };
    const up=()=>{h.removeEventListener('pointermove',mv);h.removeEventListener('pointerup',up);h.removeEventListener('pointercancel',up);mapDraw()};
    h.addEventListener('pointermove',mv);h.addEventListener('pointerup',up);h.addEventListener('pointercancel',up);
  }));
  pane.querySelectorAll('.tm-rz').forEach(h=>h.addEventListener('dblclick',()=>{try{localStorage.removeItem('td-map-size')}catch(x){}mapApplySize()}));
}
function mapData(){
  const open=allT().filter(t=>!t.done),idx=new Map(open.map(t=>[t.id,t]));
  const linked=new Set();open.forEach(t=>(t.dependsOn||[]).forEach(d=>{if(idx.has(d)){linked.add(t.id);linked.add(d)}}));
  const on=open.filter(t=>t.mp||linked.has(t.id)),tray=open.filter(t=>!on.includes(t));
  const memo={},pos={};const lv=id=>TC.level(open,id,memo);const cols={};
  on.forEach(t=>{if(t.mp&&typeof t.mp.x==='number'){pos[t.id]={x:t.mp.x,y:t.mp.y};return}const l=lv(t.id);cols[l]=(cols[l]||0)+1;pos[t.id]={x:14+l*(NW+54),y:14+(cols[l]-1)*(NH+16)}});
  return{open,on,tray,pos,idx};
}
function mapDraw(){
  const pane=document.querySelector('.td-map');if(!pane)return;
  const d=mapData(),nodes=pane.querySelector('.tm-nodes'),sv=pane.querySelector('.tm-sv');
  const mine=t=>!t.a||t.a===me();
  nodes.innerHTML=d.on.map(t=>{const p=d.pos[t.id],b=TC.isBlocked(t,allT());
    return '<div class="tm-n'+(b?' blocked':'')+(td.map.sel===t.id?' sel':'')+(t.priority>=3?' p3':'')+'" data-id="'+esc(t.id)+'" style="left:'+p.x+'px;top:'+p.y+'px;width:'+NW+'px;height:'+NH+'px"><span class="tm-in" title="Waits for…"></span><b>'+esc(t.title.slice(0,42))+'</b><small>'+(t.due?esc(TC.dayLabel(t.due,today())):'no date')+(t.a?' · '+esc(t.a):'')+'</small><span class="tm-out" data-out="'+esc(t.id)+'" title="Drag to the task that waits for this"></span><button type="button" class="tm-x" data-del="'+esc(t.id)+'" aria-label="Take out of the map">×</button></div>'}).join('');
  pane.querySelector('.tm-tl').innerHTML=d.tray.length?d.tray.map(t=>'<div class="tm-t" data-id="'+esc(t.id)+'"><b>'+esc(t.title.slice(0,40))+'</b><small>'+(t.due?esc(TC.dayLabel(t.due,today())):'no date')+'</small><span class="tm-out" data-out="'+esc(t.id)+'"></span></div>').join(''):'<p class="tm-no">Everything is in the map.</p>';
  pane.querySelector('.tm-hint').style.display=d.on.length?'none':'';
  let w=0,h=0;d.on.forEach(t=>{const p=d.pos[t.id];w=Math.max(w,p.x+NW+40);h=Math.max(h,p.y+NH+40)});
  sv.style.width=Math.max(w,pane.querySelector('.tm-cv').clientWidth)+'px';sv.style.height=Math.max(h,pane.querySelector('.tm-cv').clientHeight)+'px';nodes.style.width=sv.style.width;nodes.style.height=sv.style.height;
  let path='';
  d.on.forEach(t=>(t.dependsOn||[]).forEach(dep=>{const a=d.pos[dep],b=d.pos[t.id];if(!a||!b||!d.idx.has(dep))return;
    const x1=a.x+NW,y1=a.y+NH/2,x2=b.x,y2=b.y+NH/2,c=Math.max(30,Math.abs(x2-x1)/2);
    path+='<g class="tm-e" data-from="'+esc(dep)+'" data-to="'+esc(t.id)+'"><path d="M'+x1+' '+y1+' C'+(x1+c)+' '+y1+' '+(x2-c)+' '+y2+' '+x2+' '+y2+'" fill="none" stroke="var(--accent)" stroke-width="2"/><path d="M'+x2+' '+y2+' l-7 -4 v8z" fill="var(--accent)"/><path class="tm-hit" d="M'+x1+' '+y1+' C'+(x1+c)+' '+y1+' '+(x2-c)+' '+y2+' '+x2+' '+y2+'" fill="none" stroke="transparent" stroke-width="14"><title>Click to remove this link</title></path></g>'}));
  sv.innerHTML=path+'<path class="tm-rub" d="" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 4"/>';
}
function wireMap(pane){
  const cv=()=>pane.querySelector('.tm-cv'),pt=e=>{const r=cv().getBoundingClientRect();return{x:e.clientX-r.left+cv().scrollLeft,y:e.clientY-r.top+cv().scrollTop}};
  const nodeAt=(e,skip)=>{const els=document.elementsFromPoint(e.clientX,e.clientY);const n=els.find(x=>x.classList&&(x.classList.contains('tm-n')||x.classList.contains('tm-t'))&&x.dataset.id!==skip);return n?n.dataset.id:null};
  pane.addEventListener('click',e=>{
    const b=e.target.closest('[data-m]');if(b){if(b.dataset.m==='close')mapToggle(false);else if(b.dataset.m==='tidy'){const ids=mapData().on.map(t=>t.id);Promise.all(['p','s'].map(w=>tx(w,a=>{let n=0;a.forEach(t=>{if(ids.includes(t.id)&&t.mp){delete t.mp;n++}});if(!n)return false})))}return}
    const x=e.target.closest('[data-del]');if(x){const id=x.dataset.del;patch(id,t=>{delete t.mp;t.dependsOn=[]}).then(()=>{const w=allT();});
      tx('p',a=>{let n=0;a.forEach(t=>{if((t.dependsOn||[]).includes(id)){t.dependsOn=t.dependsOn.filter(d=>d!==id);n++}});if(!n)return false});tx('s',a=>{let n=0;a.forEach(t=>{if((t.dependsOn||[]).includes(id)){t.dependsOn=t.dependsOn.filter(d=>d!==id);n++}});if(!n)return false});return}
    const g=e.target.closest('.tm-e');if(g){const from=g.dataset.from,to=g.dataset.to;patch(to,t=>{t.dependsOn=(t.dependsOn||[]).filter(d=>d!==from)});return}
  });
  pane.addEventListener('pointerdown',e=>{
    if(e.target.closest('[data-del]')||e.button>0)return;
    const out=e.target.closest('[data-out]');
    if(out){e.preventDefault();const from=out.dataset.out,fn=allT().find(t=>t.id===from);if(!fn)return;
      const d=mapData(),p=d.pos[from],start=p?{x:p.x+NW,y:p.y+NH/2}:null;td.drag=1;
      const rub=()=>pane.querySelector('.tm-rub');pane.setPointerCapture&&pane.setPointerCapture(e.pointerId);
      const mv=ev=>{const c=pt(ev),s=start||c;rub()&&rub().setAttribute('d','M'+s.x+' '+s.y+' L'+c.x+' '+c.y);pane.querySelectorAll('.tm-n,.tm-t').forEach(n=>n.classList.toggle('tgt',n.dataset.id===nodeAt(ev,from)))};
      const up=async ev=>{pane.removeEventListener('pointermove',mv);pane.removeEventListener('pointerup',up);td.drag=0;pane.querySelectorAll('.tgt').forEach(n=>n.classList.remove('tgt'));rub()&&rub().setAttribute('d','');
        const to=nodeAt(ev,from);
        if(to){if(TC.wouldLoop(allT(),to,from)){toast('That would make a loop — one of them already waits for the other');return}
          await patch(to,t=>{t.dependsOn=(t.dependsOn||[]);if(!t.dependsOn.includes(from))t.dependsOn.push(from)});
        }else{const inCv=document.elementsFromPoint(ev.clientX,ev.clientY).some(x=>x.classList&&x.classList.contains('tm-cv'));
          if(inCv){const c=pt(ev);newBlock(pane,c,from)}}
        paint(true)};
      pane.addEventListener('pointermove',mv);pane.addEventListener('pointerup',up);return}
    const n=e.target.closest('.tm-n,.tm-t');
    if(n){const id=n.dataset.id,isTray=n.classList.contains('tm-t'),r=n.getBoundingClientRect(),ox=e.clientX-r.left,oy=e.clientY-r.top;let moved=false;
      td.drag=1;const ghost=isTray?n.cloneNode(true):null;
      if(ghost){ghost.className='tm-t tm-ghost';ghost.style.cssText='position:fixed;pointer-events:none;width:'+r.width+'px;left:'+r.left+'px;top:'+r.top+'px;z-index:300';document.body.appendChild(ghost)}
      const mv=ev=>{moved=true;if(ghost){ghost.style.left=(ev.clientX-ox)+'px';ghost.style.top=(ev.clientY-oy)+'px'}else{const c=pt(ev);n.style.left=Math.max(0,c.x-ox+ (cv().getBoundingClientRect().left-cv().getBoundingClientRect().left))+'px';n.style.top=Math.max(0,c.y-oy)+'px';redrawEdges(pane)}};
      const up=async ev=>{document.removeEventListener('pointermove',mv);document.removeEventListener('pointerup',up);td.drag=0;if(ghost)ghost.remove();
        if(!moved){td.map.sel=td.map.sel===id?null:id;mapDraw();return}
        const over=document.elementsFromPoint(ev.clientX,ev.clientY).some(x=>x.classList&&x.classList.contains('tm-cv'));
        const c=pt(ev);
        if(isTray){if(over)await patch(id,t=>{t.mp={x:Math.max(0,Math.round(c.x-NW/2)),y:Math.max(0,Math.round(c.y-NH/2))}})}
        else await patch(id,t=>{t.mp={x:Math.max(0,Math.round(c.x-ox)),y:Math.max(0,Math.round(c.y-oy))}});
        paint(true)};
      document.addEventListener('pointermove',mv);document.addEventListener('pointerup',up)}
  });
  pane.addEventListener('dblclick',e=>{if(e.target.closest('.tm-n,.tm-t'))return;if(!e.target.closest('.tm-cv'))return;newBlock(pane,pt(e),null)});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&td.map.open&&!document.querySelector('.td-menu')&&!(document.activeElement&&document.activeElement.tagName==='INPUT')){mapToggle(false)}},true);
}
function redrawEdges(pane){
  const pos={};pane.querySelectorAll('.tm-n').forEach(n=>{pos[n.dataset.id]={x:parseFloat(n.style.left),y:parseFloat(n.style.top)}});
  pane.querySelectorAll('.tm-e').forEach(g=>{const a=pos[g.dataset.from],b=pos[g.dataset.to];if(!a||!b)return;const x1=a.x+NW,y1=a.y+NH/2,x2=b.x,y2=b.y+NH/2,c=Math.max(30,Math.abs(x2-x1)/2);
    const dd='M'+x1+' '+y1+' C'+(x1+c)+' '+y1+' '+(x2-c)+' '+y2+' '+x2+' '+y2;g.querySelectorAll('path').forEach((p,i)=>{if(i!==1)p.setAttribute('d',dd);else p.setAttribute('d','M'+x2+' '+y2+' l-7 -4 v8z')})});
}
function newBlock(pane,c,after){
  pane.querySelectorAll('.tm-new').forEach(x=>x.remove());
  const f=document.createElement('form');f.className='tm-new';f.style.left=Math.max(6,c.x-60)+'px';f.style.top=Math.max(6,c.y-14)+'px';
  f.innerHTML='<input type="text" maxlength="120" placeholder="New task… (Enter)" aria-label="New task name">';pane.querySelector('.tm-cv').appendChild(f);
  const inp=f.querySelector('input');inp.focus();
  const done=()=>f.remove();inp.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();done()}});inp.addEventListener('blur',()=>setTimeout(done,150));
  f.addEventListener('submit',async e=>{e.preventDefault();const v=inp.value.trim();if(!v){done();return}
    const p=TC.parse(v,{now:new Date(),me:me(),lists:[],tasks:[]});const t=TC.newTask(p,{today:today(),me:me(),defaultToday:S().defday==='today'});t.mp={x:Math.round(c.x),y:Math.round(c.y)};
    if(after)t.dependsOn=[after];
    const sh=!!after&&where(after)==='s';await tx(sh?'s':'p',a=>{a.push(t)});done();paint(true)});
}

window.tdAddTask=addTask;
/* ---------- widget definition ---------- */
WIDGET_TYPES.todo={title:'To-Do',icon:'list-checks',desc:'Your tasks in one place: add with a sentence (“pay rent for Anusha tomorrow 4pm urgent”), hand tasks over, tick them off, and see what order to do them in on the Map. Same tasks as the To-Do app.',defaultSize:'lg',
  blocks:[{id:'add',label:'Add a task'},{id:'list',label:'Task list'}],
  settings:TODO_SETTINGS,ready:()=>Promise.resolve(),
  render(el){if(!td.unP&&!td.unS)startHubTodoWatch();mount(el)}};
if(typeof WIDGET_NO_CACHE==='object')WIDGET_NO_CACHE.todo=1;
// the board leaves the To-Do widget when it is removed: close the map
window.addEventListener('pagehide',()=>{td.map.open=false});
})();

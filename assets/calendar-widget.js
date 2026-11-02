/* Calendar widget — what is coming up that the Schedule widget does not show: appointments, meetings, birthdays and anniversaries,
   tasks on the day they are due, chores, and the Hindu festival / tithi line. Schedule blocks (incl. Gym and Skin) stay in their own widgets.
   Same documents as the Calendar app:  events -> schedule-profiles/{profile}/data/events   reminders -> apps/calendar/data/reminders
   Adding writes an event to the same place the Calendar app reads (or a task into To-Do). The Calendar app is not changed.
   Festival and tithi data: assets/calendar-core.js (copied from the Calendar app — KEEP IN SYNC). Replaces the old "Calendar & reminders" widget (same widget id: 'agenda'). */
(function(){
'use strict';
const TC=window.TodoCore,CC=window.CalCore;if(!TC||!CC||typeof WIDGET_TYPES==='undefined')return;
const CAL_SETTINGS=[
  {h:'Sources'},
  {key:'ev',label:'Events and reminders',hint:'Appointments, meetings, birthdays, anniversaries',type:'bool',def:true},
  {key:'tasks',label:'Tasks on the day they are due',hint:'Also in the To-Do widget',type:'bool',def:true},
  {key:'chores',label:'Chores',hint:'Also in the Household Chores widget',type:'bool',def:true},
  {h:'Show'},
  {key:'fest',label:'Festival and tithi line',hint:'Hindu calendar, the same as your Calendar app',type:'bool',def:true},
  {key:'next',label:'"Next up" bar',type:'bool',def:true},
  {key:'week',label:'Week strip',type:'bool',def:true},
  {key:'dim',label:'Dim events that have passed',type:'bool',def:true},
  {key:'hideDone',label:'Hide ticked items',type:'bool',def:false},
  {h:'Look'},
  {key:'days',label:'Days ahead',type:'seg',opts:[['3','3'],['7','7'],['14','14']],def:'7'},
  {key:'fmt',label:'Time format',type:'seg',opts:[['12','12 h'],['24','24 h']],def:'12'},
  {key:'add',label:'Add button',hint:'Off makes this a view-only widget',type:'bool',def:true}
];
const cal={ev:{},got:{},un:{},unR:null,sel:null,who:'me',paintT:null,t:0};
try{const v=localStorage.getItem('hub-cal-who');if(v==='me'||v==='other'||v==='both')cal.who=v}catch(e){}
const me=()=>state.profile,other=()=>state.profile==='Anusha'?'Bhargav':'Anusha';
const S=()=>wsAll(state.widgets.find(x=>x.type==='agenda'),WIDGET_TYPES.agenda);
const evRef=p=>db.collection('users').doc(state.user.uid).collection('schedule-profiles').doc(p).collection('data').doc('events');
const els=()=>[...document.querySelectorAll('[data-widget-type="agenda"] .widget-card-body')];
const parse=d=>{try{const a=JSON.parse(d.data().json);return Array.isArray(a)?a:[]}catch(e){return[]}};
const fmtT=(t,S0)=>!t?'':S0.fmt==='24'?t:TC.time12(t);
const minsOf=t=>{if(!t)return null;const p=String(t).split(':');return(+p[0])*60+(+p[1]||0)};

/* ---------- live data ---------- */
function watch(){
  Object.keys(cal.un).forEach(k=>{try{cal.un[k]()}catch(e){}});cal.un={};cal.ev={};cal.got={};if(cal.unR){try{cal.unR()}catch(e){}cal.unR=null}
  if(!state.user||!state.profile)return;
  const need=[me()];if(cal.who!=='me')need.push(other());
  need.forEach(p=>{try{cal.un[p]=evRef(p).onSnapshot(d=>{cal.ev[p]=d.exists&&d.data().json?parse(d):[];cal.got[p]=true;if(p===me())state.events=cal.ev[p];paint()},()=>{cal.got[p]=true;paint()})}catch(e){}});
  try{
    const r1=appRef('calendar','reminders'),r2=appRef('calendar','reminderCategories');
    const u1=r1.onSnapshot(d=>{state.reminders=d.exists&&d.data().json?parse(d):[];paint()},()=>{});
    const u2=r2.onSnapshot(d=>{state.reminderCats=d.exists&&d.data().json?parse(d):[];paint()},()=>{});
    cal.unR=()=>{try{u1()}catch(e){}try{u2()}catch(e){}};
  }catch(e){}
}
function evsFor(who){
  if(who==='me')return(cal.ev[me()]||state.events||[]);
  if(who==='other')return(cal.ev[other()]||[]);
  const a=(cal.ev[me()]||state.events||[]),b=(cal.ev[other()]||[]),seen=new Set(a.map(e=>e.id));
  return a.concat(b.filter(e=>!seen.has(e.id)&&!(e.mirrored&&seen.has(e.id))));
}

/* ---------- what is on a day ---------- */
function itemsFor(date,S0){
  const out=[],t0=today(),isT=date===t0;
  if(S0.ev){
    (state.reminders||[]).filter(r=>reminderHitsDateHub(r,date)).forEach(r=>{const c=agCatName(r.categoryId);
      out.push({k:'rem',allday:true,sort:-5,title:r.name+(c==='Birthday'?"'s birthday":c==='Anniversary'?' anniversary':' · '+c),ico:c==='Birthday'?'🎂':c==='Anniversary'?'💍':'🔔'})});
    evsFor(cal.who).filter(e=>eventOccursOnHub(e,date)&&(isT||!(e.recurring&&e.repeat&&e.repeat.type==='daily'))).forEach(e=>{
      out.push({k:'ev',sort:e.time?minsOf(e.time):-3,time:e.time||'',end:e.endTime||'',title:e.title||'Event',sub:e.location||'',who:e.mirrored?e.ownerProfile:null,shared:!!e.shared,allday:!e.time})});
  }
  if(S0.tasks){
    const all=(state.personalTasks||[]).map(x=>({t:x,sh:false})).concat((state.sharedTasks||[]).map(x=>({t:x,sh:true})));
    all.forEach(({t,sh})=>{
      if(t.done||!t.due||(isT?t.due>date:t.due!==date)||(t.startDate&&t.startDate>date))return;
      const mine=!t.a||t.a===me(),theirs=t.a&&t.a!==me();
      if(cal.who==='me'&&theirs)return;if(cal.who==='other'&&!(theirs||(sh&&!t.a)))return;
      const od=t.due<t0,blocked=TC.isBlocked(t,(state.personalTasks||[]).concat(state.sharedTasks||[]));
      out.push({k:'task',id:t.id,sort:od?-4:(t.dueTime?minsOf(t.dueTime):2000),time:t.dueTime||'',dl:!!t.dl,title:t.title,od,tick:isT&&!blocked&&mine,sub:od?'Overdue since '+TC.dayLabel(t.due,t0):blocked?'Waiting on another task':sh?(t.a?(mine?'from '+(t.by||'someone'):'for '+t.a):'Shared'):''});
    });
  }
  if(S0.chores&&isT){try{choresDueToday().forEach(c=>out.push({k:'chore',id:c.id,sort:9000,title:c.name,od:c.overdue,tick:true,sub:c.overdue?'Overdue':'Chore'}))}catch(e){}}
  return out.sort((a,b)=>a.sort-b.sort);
}
function festLine(date){
  const f=CC.festivals(date)||[],ti=CC.tithi(date);
  const moon=ti?(ti.isAnchor?(ti.name==='Purnima'?'🌕':'🌑'):ti.paksha==='Shukla'?'🌙':'🌘'):'';
  const t=ti?ti.paksha+' Paksha · '+ti.name:'';
  return{moon,tithi:t,fests:f.slice(0,3),big:ti&&ti.isAnchor};
}

/* ---------- painting ---------- */
function paint(force){
  clearTimeout(cal.paintT);
  cal.paintT=setTimeout(()=>{els().forEach(el=>{const a=document.activeElement;if(!force&&a&&el.contains(a)&&a.tagName==='INPUT')return;try{draw(el)}catch(e){console.warn(e)}})},force?0:50);
}
function row(it,S0,dim){
  const lead=it.tick?'<button type="button" class="cw-tick" data-k="'+it.k+'" data-id="'+esc(it.id)+'" aria-label="Done: '+esc(it.title)+'"></button>'
    :'<span class="cw-ico">'+(it.ico||(it.k==='task'?'☐':it.k==='chore'?'✦':'•'))+'</span>';
  const tm=it.allday?(it.k==='rem'?'All day':''):fmtT(it.time,S0)+(it.end?' – '+fmtT(it.end,S0):'');
  const sub=[it.dl&&it.time?'by '+fmtT(it.time,S0):tm,it.sub,it.who?it.who+"'s":'',it.shared&&!it.who?'both':''].filter(Boolean).join(' · ');
  return '<div class="cw-row cw-'+it.k+(it.od?' od':'')+(dim?' dim':'')+'">'+lead+'<span class="cw-c"><b>'+esc(it.title)+'</b>'+(sub?'<small>'+esc(sub)+'</small>':'')+'</span></div>';
}
function draw(el){
  const S0=S(),t0=today(),nowD=new Date(),nowM=nowD.getHours()*60+nowD.getMinutes(),sel=cal.sel&&cal.sel>=t0?cal.sel:t0;
  const days=Math.max(1,parseInt(S0.days,10)||7),foc=document.activeElement;
  const fl=festLine(sel);
  let h='<div class="cw-root">';
  h+='<div class="cw-bar"><div class="cw-who" role="tablist">'+[['me','Me'],['other',other()],['both','Both']].map(([k,l])=>'<button type="button" role="tab" data-who="'+k+'" class="'+(cal.who===k?'on':'')+'">'+esc(l)+'</button>').join('')+'</div>'+(S0.add?'<button type="button" class="cw-plus" data-a="add" aria-label="Add to calendar">+</button>':'')+'</div>';
  if(S0.fest&&(fl.tithi||fl.fests.length))h+='<div class="cw-fest'+(fl.big?' big':'')+'"><span>'+fl.moon+' '+esc(fl.tithi)+'</span>'+fl.fests.map(f=>'<b>'+esc(f)+'</b>').join('')+'</div>';
  const todayItems=itemsFor(t0,S0);
  if(S0.next){
    const nx=todayItems.filter(i=>(i.k==='ev'||i.k==='task')&&i.time&&!i.od&&minsOf(i.time)>nowM).sort((a,b)=>minsOf(a.time)-minsOf(b.time))[0];
    if(nx){const d=minsOf(nx.time)-nowM;h+='<div class="cw-next"><span>Next up</span><b>'+esc(nx.title)+'</b><small>'+fmtT(nx.time,S0)+(nx.sub?' · '+esc(nx.sub):'')+'</small><em>in '+(d>=60?Math.floor(d/60)+' h '+(d%60?d%60+' m':''):d+' m')+'</em></div>'}
  }
  if(S0.week){
    h+='<div class="cw-week">'+Array.from({length:7},(_,i)=>{const d=addDays(t0,i),n=itemsFor(d,S0).filter(x=>x.k!=='chore').length,f=festLine(d);
      return '<button type="button" data-day="'+d+'" class="'+(d===sel?'on':'')+(i===0?' now':'')+'"><small>'+(i===0?'Today':['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(d+'T12:00:00').getDay()])+'</small><b>'+new Date(d+'T12:00:00').getDate()+'</b><i>'+(f.big?(f.moon):'')+(n?'<u>'+'•'.repeat(Math.min(3,n))+'</u>':'')+'</i></button>'}).join('')+'</div>';
  }
  const dayItems=sel===t0?todayItems:itemsFor(sel,S0);
  const vis=dayItems.filter(i=>!(S0.hideDone&&i.done));
  h+='<div class="cw-sec"><span>'+(sel===t0?'Today':TC.dayLabel(sel,t0))+' · '+new Date(sel+'T12:00:00').toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})+'</span><em>'+vis.length+' item'+(vis.length===1?'':'s')+'</em></div>';
  h+=vis.length?vis.map(i=>row(i,S0,S0.dim&&sel===t0&&i.k==='ev'&&i.time&&(minsOf(i.end||i.time)<nowM))).join(''):'<div class="cw-empty">Nothing on the calendar'+(sel===t0?' today':' this day')+'.</div>';
  let up='',n=0;
  for(let i=1;i<=days;i++){const d=addDays(t0,i);if(d===sel)continue;const it=itemsFor(d,S0),f=S0.fest?festLine(d):null,fs=f&&f.big?CC.festivals(d).slice(0,1):[];
    if(!it.length&&!fs.length)continue;n+=it.length;
    up+='<div class="cw-day">'+(i===1?'Tomorrow':TC.dayLabel(d,t0))+'</div>'+it.map(x=>row(x,S0)).join('')+fs.map(x=>'<div class="cw-row cw-fe"><span class="cw-ico">'+(f.moon||'✦')+'</span><span class="cw-c"><b>'+esc(x)+'</b></span></div>').join('')}
  h+='<div class="cw-sec"><span>Next '+days+' days</span></div>'+(up||'<div class="cw-empty">Nothing coming up.</div>');
  h+='<a class="widget-card-link" href="apps/calendar.html" data-profile-link>Open Calendar <i data-lucide="arrow-up-right"></i></a></div>';
  el.innerHTML=h;
  if(typeof updateProfileLinks==='function')updateProfileLinks();if(window.lucide)lucide.createIcons();
  wire(el);
}
function wire(el){
  el.onclick=e=>{
    const q=s=>e.target.closest(s);let x;
    if(x=q('[data-who]')){cal.who=x.dataset.who;try{localStorage.setItem('hub-cal-who',cal.who)}catch(er){}watch();paint(true);return}
    if(x=q('[data-day]')){cal.sel=x.dataset.day;paint(true);return}
    if(q('[data-a="add"]')){addSheet();return}
    if(x=q('.cw-tick')){x.classList.add('on');const id=x.dataset.id;setTimeout(()=>{if(x.dataset.k==='task')completeTask(id);else completeChoreFromWidget(id,el,()=>paint(true))},160);return}
  };
}

/* ---------- add to calendar ---------- */
async function writeEvent(owner,ev,shared){
  const ref=evRef(owner);
  await db.runTransaction(async t=>{const sn=await t.get(ref);const a=sn.exists&&sn.data().json?parse(sn):[];a.push(ev);t.set(ref,{json:JSON.stringify(a)})});
  if(shared){const partner=owner==='Bhargav'?'Anusha':'Bhargav',pr=evRef(partner);
    await db.runTransaction(async t=>{const sn=await t.get(pr);const a=sn.exists&&sn.data().json?parse(sn):[];a.push(Object.assign({},ev,{mirrored:true,ownerProfile:owner}));t.set(pr,{json:JSON.stringify(a)})})}
}
async function removeEvent(owner,id,shared){
  const drop=async p=>{const ref=evRef(p);await db.runTransaction(async t=>{const sn=await t.get(ref);const a=sn.exists&&sn.data().json?parse(sn):[];const i=a.findIndex(x=>x.id===id);if(i<0)return;a.splice(i,1);t.set(ref,{json:JSON.stringify(a)})})};
  await drop(owner);if(shared)await drop(owner==='Bhargav'?'Anusha':'Bhargav');
}
function addSheet(){
  document.querySelectorAll('.cw-sheet').forEach(x=>x.remove());
  const t0=today(),o=other();
  const st={text:'',kind:'event',date:undefined,time:'',end:'',who:'me',ign:new Set()};
  const m=document.createElement('div');m.className='cw-sheet';m.setAttribute('role','dialog');m.setAttribute('aria-label','Add to calendar');
  const parsed=()=>TC.parse(st.text,{now:new Date(),me:me(),lists:[],tasks:[],ignore:st.ign});
  const draw=()=>{
    const p=st.text.trim()?parsed():null;
    const date=st.date!==undefined?st.date:(p&&p.due)||undefined,time=st.time!==''?st.time:(p&&p.time)||'';
    const title=p&&p.title?p.title:'';
    m.innerHTML='<form class="cw-sb"><div class="cw-sh"><b>Add to calendar</b><button type="button" data-x aria-label="Close">✕</button></div>'+
      '<div class="cw-seg" data-g="kind">'+[['event','Event'],['task','Task']].map(([k,l])=>'<button type="button" data-kind="'+k+'" class="'+(st.kind===k?'on':'')+'">'+l+'</button>').join('')+'</div>'+
      '<input class="cw-ti" type="text" maxlength="160" placeholder="'+(st.kind==='event'?'Dentist tue 3pm':'Pay rent tomorrow 4pm')+'" value="'+esc(st.text)+'" aria-label="What">'+
      (p?'<div class="cw-read">→ <b>'+esc(title||'…')+'</b>'+(date?' · '+esc(TC.dayLabel(date,t0))+(time?' · '+esc(TC.time12(time)):''):' · <em>pick a day</em>')+'</div>':'')+
      '<div class="cw-dt"><label>Day<input type="date" data-f="date" value="'+(date||'')+'" min="'+t0+'"></label><label>Time<input type="time" data-f="time" value="'+esc(time)+'"></label>'+(st.kind==='event'?'<label>Until<input type="time" data-f="end" value="'+esc(st.end)+'"></label>':'')+'</div>'+
      '<div class="cw-seg" data-g="who">'+[['me',st.kind==='event'?'Mine':'Mine'],['other',o+(st.kind==='event'?"'s":'')],['both','Both']].map(([k,l])=>'<button type="button" data-who2="'+k+'" class="'+(st.who===k?'on':'')+'">'+esc(l)+'</button>').join('')+'</div>'+
      '<div class="cw-act"><button type="button" data-x>Cancel</button><button type="submit" class="go"'+(!title||!date?' disabled':'')+'>Add '+(st.kind==='event'?'event':'task')+'</button></div></form>';
    st._date=date;st._time=time;st._title=title;
  };
  const keep=()=>{const g=k=>{const e=m.querySelector('[data-f="'+k+'"]');return e?e.value:null};const ti=m.querySelector('.cw-ti');if(ti)st.text=ti.value;const d=g('date');if(d!==null&&d)st.date=d;const tm=g('time');if(tm!==null)st.time=tm;const en=g('end');if(en!==null)st.end=en};
  const close=()=>{document.removeEventListener('keydown',key,true);m.remove()};
  const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close()}};
  draw();document.body.appendChild(m);document.addEventListener('keydown',key,true);
  const focusTi=()=>{const ti=m.querySelector('.cw-ti');if(ti){ti.focus();const n=ti.value.length;ti.setSelectionRange(n,n)}};focusTi();
  m.addEventListener('click',e=>{
    if(e.target===m){close();return}
    const b=e.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-x')){close();return}
    keep();
    if(b.dataset.kind){st.kind=b.dataset.kind;draw();focusTi();return}
    if(b.dataset.who2){st.who=b.dataset.who2;draw();return}
  });
  m.addEventListener('input',e=>{
    if(e.target.matches('.cw-ti')){const pos=e.target.selectionStart;keep();st.date=st.date;draw();const ti=m.querySelector('.cw-ti');ti.focus();ti.setSelectionRange(pos,pos)}
    else if(e.target.matches('[data-f]')){keep();const sb=m.querySelector('.go');const p=st.text.trim()?parsed():null;const ok=!!(st.date||(p&&p.due))&&!!(p&&p.title);if(sb)sb.disabled=!ok}
  });
  m.addEventListener('submit',async e=>{
    e.preventDefault();keep();draw();
    const date=st._date,title=st._title;if(!date||!title)return;
    const time=st._time||'',end=st.end||'';
    const go=m.querySelector('.go');if(go)go.disabled=true;
    try{
      if(st.kind==='event'){
        const owner=st.who==='other'?other():me(),shared=st.who==='both';
        const ev={id:'meet-'+Date.now()+'-'+Math.floor(Math.random()*1000),kind:'event',title,date,startDate:null,recurring:false,repeat:null,time:time||null,endTime:end||null,color:'var(--schedule)',shared,notes:null,location:null,link:null,reminderMinutes:null};
        await writeEvent(owner,ev,shared);
        close();paint(true);
        toast('Added “'+title+'” · '+TC.dayLabel(date,today()),'Undo',async()=>{await removeEvent(owner,ev.id,shared);paint(true)});
      }else{
        const p=parsed();p.due=date;p.time=time||p.time||null;
        const who=st.who==='other'?other():st.who==='both'?'shared':'me';
        if(typeof window.tdAddTask!=='function')throw new Error('no todo');
        await window.tdAddTask(p,{who});close();paint(true);
      }
    }catch(err){console.warn(err);toast('Couldn’t add that — check your connection and try again');if(go)go.disabled=false}
  });
}

WIDGET_TYPES.agenda=Object.assign({},WIDGET_TYPES.agenda||{},{title:'Calendar',icon:'calendar-days',desc:"Appointments, meetings, birthdays, tasks due and chores for the days ahead, with the festival and tithi line. Add events right here. Schedule blocks have their own widget. Same events as the Calendar app.",defaultSize:'lg',
  settings:CAL_SETTINGS,ready:()=>Promise.resolve(),
  render(el){if(!cal.un[me()])watch();draw(el);if(!cal.t)cal.t=setInterval(()=>{if(!document.hidden&&document.querySelector('[data-widget-type="agenda"]'))paint()},30000)}});
if(typeof WIDGET_NO_CACHE==='object')WIDGET_NO_CACHE.agenda=1;
window.__cal=cal;window.__calPaint=paint;
})();

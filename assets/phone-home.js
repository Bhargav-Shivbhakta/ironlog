/* Phone home screen (phones only, up to 700px wide).
   An iPhone-style home screen that replaces the Today page on a phone: pages of apps, folders and widgets,
   an App Library, search, an app switcher and a three-button bar (Back / Home / Apps).
   Layout is saved per profile (this device + the profile's Firestore doc). Needs the Hub's globals: state, today(), openAppFrame(),
   closeAppFrame(), showRoute(), ensureWater() and the water* helpers from app.js. */
(function(){
'use strict';
if(window.__phoneHome)return;window.__phoneHome=true;
const MQ=window.matchMedia('(max-width:700px)');
const LS_ON='hub-phone-home-on',LS_PREF='hub-phone-home-prefs';
const lsGet=(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:v}catch(e){return d}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
let enabled=lsGet(LS_ON,'1')!=='0';
let booted=false,profileNow=null,saveT=null;
let prefs={icons:'dark',wp:'dusk',dbl:true,rec:[],tint:'none',dim:0,blur:0,lbl:true,par:true};const LS_PHOTO='hub-phone-home-photo';
try{Object.assign(prefs,JSON.parse(lsGet(LS_PREF,'{}'))||{})}catch(e){}
if(!Array.isArray(prefs.rec))prefs.rec=[];
// real spring curve (response 0.42s, damping 0.8) as a CSS linear() easing
(function(){try{if(!CSS.supports('transition-timing-function','linear(0,1)'))return;const resp=.42,z=.8,w=2*Math.PI/resp,wd=w*Math.sqrt(1-z*z),dur=5.2/(z*w),n=48,pts=[];
 for(let i=0;i<=n;i++){const t=i/n*dur;const x=1-Math.exp(-z*w*t)*(Math.cos(wd*t)+(z*w/wd)*Math.sin(wd*t));pts.push(x.toFixed(4))}pts[n]='1';
 document.documentElement.style.setProperty('--spring','linear('+pts.join(',')+')');document.documentElement.style.setProperty('--sdur',dur.toFixed(2)+'s')}catch(e){}})();
const $=s=>document.querySelector(s);
let tt,undoFn=null;const toast=(m,undo)=>{const t=$('#to');if(!t)return;undoFn=undo||null;t.innerHTML='';const sp=document.createElement('span');sp.textContent=m;t.appendChild(sp);if(undo){const b=document.createElement('button');b.textContent='Undo';b.dataset.undo='1';t.appendChild(b)}t.classList.toggle('un',!!undo);t.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>{t.classList.remove('on');undoFn=null},undo?4500:1600)};
const P={calendar:'<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',schedule:'<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.6M9.5 3h5"/>',todo:'<circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.4l2.7 2.7 5-5.6"/>',pledge:'<path d="M12 3.2l7 2.8v5.4c0 4.5-3 7.4-7 9.4-4-2-7-4.9-7-9.4V6z"/><path d="M9 12l2.2 2.2L15.2 10"/>',water:'<path d="M12 3.2c3.4 4.3 6 7.3 6 10.8a6 6 0 0 1-12 0c0-3.5 2.6-6.5 6-10.8z"/>',gym:'<path d="M6.5 7.5v9M3.5 9.5v5M17.5 7.5v9M20.5 9.5v5M6.5 12h11"/>',diet:'<path d="M12 8c-2-2-6-1.2-7 2.8-.9 3.8 1 8.4 4.2 9 1 .2 1.9-.4 2.8-.4s1.8.6 2.8.4c3.2-.6 5.1-5.2 4.2-9C18 6.8 14 6 12 8z"/><path d="M12 8c0-2 1-3.6 3-4.4"/>',skin:'<path d="M11 3.5l1.9 5.3 5.3 1.9-5.3 1.9L11 17.9l-1.9-5.3-5.3-1.9 5.3-1.9z"/><path d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',chores:'<path d="M4 11.2L12 4l8 7.2V20H4z"/><path d="M10 20v-5.5h4V20"/>',grocery:'<circle cx="9.5" cy="19.5" r="1.4"/><circle cx="17.5" cy="19.5" r="1.4"/><path d="M3 4.5h3l2.3 10.5h10.2l2-8H7"/>',budget:'<path d="M4.5 8a2.5 2.5 0 0 1 2.5-2.5h11v3.5"/><rect x="3.5" y="8" width="17" height="12" rx="3"/><circle cx="16.6" cy="14" r="1.2"/>',insights:'<path d="M5.5 20v-8M12 20V4.5M18.5 20v-5.5"/>',clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.2V12l3 2"/>',settings:'<path d="M4 7.5h9.5M17.5 7.5H20M4 16.5h2.5M10.5 16.5H20"/><circle cx="15.5" cy="7.5" r="2.2"/><circle cx="8.5" cy="16.5" r="2.2"/>',_:'<rect x="4.5" y="4.5" width="6" height="6" rx="1.6"/><rect x="13.5" y="4.5" width="6" height="6" rx="1.6"/><rect x="4.5" y="13.5" width="6" height="6" rx="1.6"/><rect x="13.5" y="13.5" width="6" height="6" rx="1.6"/>'};
// app catalog: [name, group, url, route]. Extra apps found in the Hub are appended on boot.
const AP={schedule:['Schedule','Planner','apps/schedule.html'],todo:['To-Do','Planner','apps/todo.html'],calendar:['Calendar','Planner','apps/calendar.html'],pledge:['Pledge','Planner','apps/pledge.html'],
 gym:['Training','Health','gym/index.html'],diet:['Diet','Health','apps/diet.html'],skin:['Skin','Health','apps/skin.html'],
 chores:['Chores','Home','apps/chores.html'],grocery:['Grocery','Home','apps/grocery.html'],budget:['Budget','Home','apps/budget.html'],
 insights:['Insights','Insights',null,'insights'],clock:['Clock','Tools','apps/clock.html'],settings:['Settings','Tools',null,'settings']};
const CATS=['Planner','Health','Home','Insights','Tools'];const DOCK0=['schedule','todo','calendar','settings'];let dock=DOCK0.slice();
const glyph=k=>P[k]||P._;
function badgeOf(k){try{if(k==='todo'&&hasTasks())return dueTasks().length;if(k==='chores'&&typeof choresDueToday==='function')return choresDueToday().length}catch(e){}return 0}
const bdg=n=>n>0?`<b class="bdg">${n>99?'99+':n}</b>`:'';
const tile=(k,b)=>`<div class="tile c-${AP[k][1]}"><svg viewBox="0 0 24 24">${glyph(k)}</svg>${b?bdg(badgeOf(k)):''}</div>`;
const icon=(k,x)=>`<div class="app" data-k="${k}">${tile(k,1)}<span>${AP[k][0]}</span>${x||''}</div>`;
let uid=1;const A=k=>({id:uid++,t:'a',k}),W=(z,w)=>({id:uid++,t:'w',z,ws:Array.isArray(w)?w.slice():[w||'water'],si:0,o:{}}),F=(name,apps)=>({id:uid++,t:'f',name,apps});
let pages=[[]];
let rec=prefs.rec.filter(k=>AP[k]);
let editing=false,cur=0,view='home';
// ---- DOM root (hidden unless phone mode is on) ----
(function(){if(document.getElementById('ph'))return;const d=document.createElement('div');d.id='ph';
 d.innerHTML=`<div class="st"><button class="plus" id="plus" aria-label="Add widget">＋</button><button class="ed" id="edb">Done</button></div>
<div class="vp" id="vp"><div class="pgs" id="pgs"></div></div><div class="dots" id="dots"></div><div class="dock" id="dock"></div>
<div id="td"></div><div id="fo"></div><div id="sp" class="sp"></div><div id="sw"></div>
<div class="sheet" id="sheet"><div class="shi" id="shi"></div></div><div id="cm"></div><div class="ptoast" id="to"></div>`;
 document.body.appendChild(d);
 const n=document.createElement('div');n.id='ph-nb';n.className='nb';n.innerHTML='<button data-n="back" aria-label="Back"><svg viewBox="0 0 24 24"><path d="M15 5L8 12l7 7"/></svg></button><button data-n="home" aria-label="Home"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6.2"/></svg></button><button data-n="rec" aria-label="Apps"><svg viewBox="0 0 24 24"><rect x="5.5" y="5.5" width="13" height="13" rx="3"/></svg></button>';
 document.body.appendChild(n);
 d.addEventListener('contextmenu',e=>e.preventDefault())})();
const LQ=window.matchMedia?window.matchMedia('(prefers-color-scheme: light)'):null;
function applyLook(){const ph=$('#ph');const light=prefs.icons==='light'||(prefs.icons==='auto'&&LQ&&LQ.matches);ph.classList.toggle('ic-light',light);
 ph.classList.remove('wp-valley','wp-graphite','wp-photo');['blue','green','pink','orange','purple'].forEach(t=>ph.classList.remove('tn-'+t));
 if(prefs.wp==='valley'||prefs.wp==='graphite')ph.classList.add('wp-'+prefs.wp);
 let photo='';if(prefs.wp==='photo'){photo=lsGet(LS_PHOTO,'');if(photo)ph.classList.add('wp-photo');else prefs.wp='dusk'}
 if(photo)ph.style.setProperty('--wpimg','url("'+photo+'")');else ph.style.removeProperty('--wpimg');
 if(prefs.tint&&prefs.tint!=='none')ph.classList.add('tn-'+prefs.tint);
 ph.style.setProperty('--wpb',(+prefs.blur||0)+'px');ph.style.setProperty('--wpbr',String(1-(+prefs.dim||0)/100));
 ph.classList.toggle('nolbl',prefs.lbl===false);ph.classList.toggle('nopar',prefs.par===false)}
if(LQ){const f=()=>{if(prefs.icons==='auto'&&$('#ph'))applyLook()};LQ.addEventListener?LQ.addEventListener('change',f):LQ.addListener&&LQ.addListener(f)}
function savePrefs(){lsSet(LS_PREF,JSON.stringify(prefs))}
// ---- Water widget: the real Hub water data (state.water), same drinks the Today widget, Gym and Pledge read ----
let sel=null,cust={m:false,l:false},tap=null,tapT=null;
const WS=()=>(typeof state!=='undefined'&&state.water)?state.water:null;
const wDay=()=>today();
const wUnitOz=()=>!!(WS()&&WS().unit==='oz');
const wTotal=()=>WS()?waterTotal(wDay()):0;
const wGoalMl=()=>WS()?waterGoalFor(wDay()):2500;
const wPct=()=>Math.round(wTotal()/Math.max(1,wGoalMl())*100);
const unitAmt=ml=>wUnitOz()?Math.round(ml/OZ_ML):Math.round(ml);
const bigAmt=ml=>wUnitOz()?Math.round(ml/OZ_ML)+' oz':(+(ml/1000).toFixed(2))+' L';
const unitName=()=>wUnitOz()?'oz':'ml';
const hmMin=s=>{const m=/^(\d{1,2}):(\d{2})/.exec(s||'');return m?(+m[1])*60+(+m[2]):null};
const wWin=()=>{const w=WS()||{};let a=hmMin(w.start),b=hmMin(w.end);if(a==null)a=420;if(b==null||b<=a+120)b=Math.max(a+240,1320);return[a,Math.min(b,1440)]};
const hl=h=>h===0||h===24?'12a':h>12?(h-12)+'p':h===12?'12p':h+'a';
const sipsToday=()=>waterSips(wDay());
let ringPrev=null;const RM=window.matchMedia?window.matchMedia('(prefers-reduced-motion: reduce)'):{matches:false};
const ring=d=>{const pc=Math.min(100,wPct());const st=ringPrev==null||RM.matches?pc:ringPrev;return `<div class="ring" data-p="${pc}" style="--p:${st};--d:${d}px"><i data-n="${wPct()}">${ringPrev==null||RM.matches?wPct():Math.round(ringPrev)}%</i></div>`};
const seenS=new Set();let seenInit=false;
function afterRender(){requestAnimationFrame(()=>requestAnimationFrame(()=>{const pc=Math.min(100,wPct());const was=ringPrev;document.querySelectorAll('#ph .ring[data-p]').forEach(r=>{r.style.setProperty('--p',r.dataset.p);const i=r.querySelector('i');if(i&&was!=null&&!RM.matches&&was!==pc){const from=Math.round(was),to=+i.dataset.n,t0=performance.now();const f=t=>{const k=Math.min(1,(t-t0)/600),e=1-Math.pow(1-k,3);i.textContent=Math.round(from+(to-from)*e)+'%';if(k<1&&i.isConnected)requestAnimationFrame(f);else i.textContent=to+'%'};requestAnimationFrame(f)}else if(i)i.textContent=i.dataset.n+'%'});ringPrev=pc;if(WS()){const ids=sipsToday().map(s=>s.id);if(!seenInit){ids.forEach(i=>seenS.add(i));seenInit=true}else setTimeout(()=>ids.forEach(i=>seenS.add(i)),800)}}))}
function histo(){const h=Array(24).fill(0);const days=new Set();let tot=0;const t=wDay();for(let i=0;i<14;i++){const d=addDays(t,-i);waterSips(d).forEach(s=>{if(s.at!=null&&s.ml>0){h[Math.min(23,Math.floor(s.at/60))]+=s.ml;days.add(d);tot+=s.ml}})}return{h,days:days.size,tot}}
function slump(hs,wake,sleep){if(hs.days<3||hs.tot<3000)return null;const a=Math.max(10,Math.ceil(wake/60)),b=Math.min(20,Math.floor(sleep/60)-1);if(b<=a)return null;let best=null;for(let h=a;h<b;h++){const s=hs.h[h]+hs.h[h+1];if(!best||s<best.s)best={h,s}}
 const hrs=Math.max(1,(sleep-wake)/60);const avg=hs.tot/hs.days/hrs;return best&&best.s/hs.days<avg*2*.6?best.h:null}
function insight(hs,sl){if(hs.days<3||hs.tot<3000)return'Log a few days and your drinking pattern shows up here';const m=hs.h.slice(0,12).reduce((a,b)=>a+b,0),af=hs.h.slice(12,17).reduce((a,b)=>a+b,0),ev=hs.h.slice(17).reduce((a,b)=>a+b,0);const part=m>=af&&m>=ev?'morning':af>=ev?'afternoon':'evening';return'You drink most in the '+part+(sl!=null?' · shaded band = usual slump ('+hl(sl)+'–'+hl(sl+2)+')':'')}
function wTop(sz){const w=WS();if(!w)return'<div class="t"><span>Water</span></div><div class="shim"></div><div class="shim s2"></div>';
 const ka=sz==='m'?'ma':'la';const A_=w.cup,B_=w.bottle>0?w.bottle:0;const isT=v=>tap&&tap.v===v&&tap.sz===sz;const nm=n=>n;
 const[wk0,wk1]=wWin(),span=wk1-wk0,posn=m=>Math.max(0,Math.min(100,(m-wk0)/span*100));const now=wNow();const goal=wGoalMl(),tot=wTotal();
 const expd=Math.round(goal*Math.max(0,Math.min(1,(now-wk0)/span)));const diff=tot-expd;const tol=wUnitOz()?OZ_ML*8:200;
 const hrs=[];for(let h=Math.ceil(wk0/60);h*60<=wk1;h+=4)hrs.push(h);
 const hs=histo(),sl=slump(hs,wk0,wk1);const timed=sipsToday().filter(s=>s.at!=null);
 const paceTxt=goal<=tot?'goal reached':Math.abs(diff)<=tol?'on pace':diff>0?'+'+unitAmt(diff)+' '+unitName()+' ahead':unitAmt(-diff)+' '+unitName()+' behind';
 const btn=(v,label,z)=>`<button class="pbtn ${isT(v)?'ud':(v===A_?'pwt':'')}" data-v="${v}" data-z="${z}" style="padding:8px 4px">${isT(v)?'↶ Undo':'+'+unitAmt(v)}</button>`;
 return `<div class="t"><span>Water</span><span>goal ${bigAmt(goal)}</span></div><div class="fx" style="gap:12px">${ring(56)}<div class="g1"><div class="big" style="font-size:22px">${bigAmt(tot)} <span class="mu" style="font-weight:500">${tot>=goal?'goal reached':unitAmt(goal-tot)+' '+unitName()+' to go'}</span></div><div class="fx" style="margin-top:6px">${btn(A_,'',sz)}${B_&&B_!==A_?btn(B_,'',sz):''}<button class="pbtn ${cust[sz]?'pwt':''}" data-c="${sz}" style="padding:8px 4px">Custom</button></div></div></div>${cust[sz]?`<div class="fx" style="margin-top:6px"><input id="cu-${sz}" type="number" inputmode="numeric" placeholder="Amount in ${unitName()}" style="flex:1;min-width:0;border:1px solid #ffffff26;background:#ffffff12;color:#fff;font:inherit;font-size:16px;border-radius:12px;padding:6px 10px"><button class="pbtn pwt" data-cb="${sz}" style="flex:none;padding:7px 14px">Add</button></div>`:''}
<div class="t" style="margin:9px 0 14px"><span>Today${timed.length?' · last '+wT(timed[timed.length-1].at):''}</span><span class="${tot>=goal||Math.abs(diff)<=tol||diff>0?'good':'bad'}">${paceTxt}</span></div><div><div class="trk">${sl!=null?`<div class="slump" style="left:${posn(sl*60)}%;width:${Math.max(0,posn(Math.min(wk1,(sl+2)*60))-posn(sl*60))}%"></div>`:''}<div class="mk" style="left:${posn(now)}%"><b>now</b></div>${timed.map(s=>`<i class="pdt${seenInit&&!seenS.has(s.id)?' pop':''}" data-d="${s.id}" style="left:${posn(s.at)}%;--z:${Math.min(22,10+s.ml/45)}px;cursor:pointer"></i>`).join('')}</div><div class="hrs">${hrs.map(h=>`<span style="left:${posn(h*60)}%">${hl(h)}</span>`).join('')}</div></div>${sz==='m'?editRow(false):''}`}
function editRow(big){const s=sel!=null?sipsToday().find(x=>x.id===sel):null;const st=wUnitOz()?1:50;const lb=wUnitOz()?'1 oz':'50';
 if(!s)return big?'<div class="mu" style="margin-top:2px;font-size:10.5px">Tap a dot to edit or delete a drink</div>':'<div class="mu" style="margin-top:3px;font-size:10px">Tap a dot to edit or delete a drink</div>';
 return `<div class="edr"><b>${wT(s.at)} · ${unitAmt(s.ml)} ${unitName()}</b><button data-e="-1">−${lb}</button><button data-e="1">+${lb}</button><button data-e="del" class="dl">Delete</button></div>`}
function weekHtml(){const t=wDay();const days=[];for(let i=6;i>=0;i--)days.push(addDays(t,-i));const vals=days.map(d=>({d,ml:waterTotal(d),g:waterGoalFor(d)}));const have=vals.filter(v=>v.ml>0);const avg=have.length?have.reduce((a,v)=>a+v.ml,0)/have.length:0;
 return `<div class="t" style="margin:9px 0 5px"><span>This week</span><span>${have.length?'avg '+bigAmt(avg):'no data yet'}</span></div><div class="wk">${vals.map((v,i)=>`<div class="${i===6?'td':''}"><i style="height:${Math.min(1.2,v.ml/Math.max(1,v.g))/1.2*100}%"></i><small>${'SMTWTFS'[new Date(v.d+'T00:00:00').getDay()]}</small></div>`).join('')}<u class="gl"></u></div>`}
function wHtml(z){const w=WS();
 if(!w)return'<div class="t"><span>Water</span></div><div class="shim"></div><div class="shim s2"></div>';
 const A_=w.cup,tapped=sz=>tap&&tap.sz===sz;
 if(z==='xs')return `<div class="fx" style="gap:8px">${ring(40)}<div class="g1 col"><div style="font-weight:700;font-size:15px;line-height:1.1">${bigAmt(wTotal())}</div><div class="mu" style="font-size:10px">of ${bigAmt(wGoalMl())}</div></div></div><button class="xsb ${tapped('xs')?'ud':''}" data-v="${A_}" data-z="xs" style="margin-top:5px;width:100%;padding:4px">${tapped('xs')?'↶ Undo':'+'+unitAmt(A_)}</button>`;
 if(z==='s')return `<div class="t"><span>Water</span></div><div class="fx" style="justify-content:center">${ring(62)}</div><div class="mu" style="text-align:center;margin:2px 0 4px">${bigAmt(wTotal())} of ${bigAmt(wGoalMl())}</div><button class="pbtn ${tapped('s')?'ud':'pwt'}" data-v="${A_}" data-z="s" style="width:100%;margin-top:6px">${tapped('s')?'↶ Undo':'+'+unitAmt(A_)}</button>`;
 if(z==='m')return wTop('m');
 const hs=histo(),[a,b]=wWin();return wTop('l')+editRow(true)+weekHtml()+`<div class="ins">${insight(hs,slump(hs,a,b))}</div>`}
function wClick(b){const wd=b.closest('.w');const d=b.dataset;
 if(d.tdp!=null){openApp('todo',b.getBoundingClientRect());return}
 if(d.tdk){const row=b.closest('.tk');if(row)row.classList.add('dn2');setTimeout(()=>tdDone(d.tdk),160);return}
 if(d.tdr){tdRestore(d.tdr);toast('Brought back');return}
 if(d.tdadd!=null){tdAdd();return}
 if(d.tdm){TD.mtab=d.tdm;refresh();return}
 if(d.tdt){const id=d.tdi2||'';TD.tab[id]=d.tdt;TD.sel=null;refresh();return}
 if(d.tdn){tdSetSel(d.tdn);return}
 if(d.tdw){TD.when=d.tdw;refresh();return}
 if(d.tdpr!=null){TD.pr=+d.tdpr;refresh();return}
 if(d.tdl){TD.sh=d.tdl==='shared';refresh();return}
 if(d.tdrep!=null){const r=['none','daily','weekly'];TD.rep=r[(r.indexOf(TD.rep)+1)%3];refresh();return}
 if(d.tdcl!=null){TD.sel=null;refresh();return}
 if(d.tdsub!=null||d.tds!=null||d.tdmv!=null||d.tdsh!=null||d.tddel!=null){const f=tdFind(TD.sel);if(!f){TD.sel=null;refresh();return}const t=f.t;
  if(d.tdsub!=null){const u=(t.subtasks||[])[+d.tdsub];if(u){u.done=!u.done;tdWrite(f.sh,[t.id])}refresh();return}
  if(d.tds!=null){const v=(TD.stxt||'').trim();if(!v)return;t.subtasks=t.subtasks||[];t.subtasks.push({id:'sub-'+Date.now()+'-'+Math.floor(Math.random()*1000),text:v,done:false});TD.stxt='';tdWrite(f.sh,[t.id]);refresh();return}
  if(d.tdmv!=null){const tm=addDays(today(),1);t.due=tm;if(!t.startDate||t.startDate<tm)t.startDate=tm;tdWrite(f.sh,[t.id]);TD.sel=null;refresh();toast('Moved to tomorrow');return}
  if(d.tdsh!=null){const from=f.sh,to=!from,src=tdArr(from),dst=tdArr(to),i=src.indexOf(t);if(i>=0)src.splice(i,1);t.listId=to?'shared':'personal';dst.push(t);tdWrite(from,[],[t.id]);tdWrite(to,[t.id]);refresh();toast(to?'Shared with Anusha':'Moved to your list');return}
  if(d.tddel!=null){const sh=f.sh,arr=tdArr(sh),i=arr.indexOf(t);if(i>=0)arr.splice(i,1);TD.sel=null;tdWrite(sh,[],[t.id]);refresh();toast('Task deleted',()=>{tdArr(sh).push(t);tdWrite(sh,[t.id]);refresh()});return}}
 if(d.chp!=null){openApp('chores',null);return}
 if(d.grp!=null){openApp('grocery',null);return}
 if(d.inp!=null){openApp('insights',null);return}
 if(d.ckp!=null){openApp('clock',null);return}
 if(d.chk!=null){chComplete(d.chk);return}
 if(d.chu!=null){chUndo(d.chu);return}
 if(d.cht!=null){CH.tab[d.chi]=d.cht;refresh();return}
 if(d.dta!=null){dtSet(d.dta,'eaten');return}
 if(d.dtk!=null){const m=dtModel();const r=m&&m.rows.find(x=>x.key===d.dtk);if(r)dtSet(r.key,r.status==='eaten'||r.status==='skipped'?'planned':'eaten');return}
 if(d.dtq!=null){DT.add=!DT.add;refresh();return}
 if(d.dtgo!=null){dtQuick();return}
 if(d.qk!=null){openApp(d.qk,b.getBoundingClientRect());return}
 if(d.nti!=null){const[a,c]=d.nti.split(':');ntToggle(a,c);return}
 if(d.ntt!=null){NT.tab[d.nid]=d.ntt;refresh();return}
 if(d.ntp!=null){NT.pick[d.nid]=d.ntp;refresh();return}
 if(d.ntadd!=null){ntAddItem(d.ntadd);return}
 if(d.ntnadd!=null){ntAddNote();return}
 if(d.cka!=null){ckToggle(d.cka);return}
 if(d.trapp!=null||d.trx!=null||d.tra!=null||d.trl!=null||d.trsv!=null){trClick(d);return}
 if(d.plk!=null){plTick(d.plk);return}
 if(d.skt!=null||d.sks!=null||d.ska!=null){skClick(d);return}
 if(b.dataset.sd!=null){const was=schedToggle(+b.dataset.sd);toast(was?'Block unticked':'Block done');return}if(b.dataset.tk&&typeof completeTask==='function'){const row=b.closest('.tk');if(row)row.classList.add('dn2');setTimeout(()=>{completeTask(b.dataset.tk);setTimeout(()=>{refresh()},60)},160);return}if(!wd||!WS())return;
 if(b.dataset.c){const z=b.dataset.c;cust[z]=!cust[z];drawPages();if(cust[z])setTimeout(()=>{const i=$('#cu-'+z);i&&i.focus()},30);return}
 if(b.dataset.cb){const z=b.dataset.cb,v=waterFromUnit(+$('#cu-'+z).value);if(v>0&&v<10000){waterAddSip(wDay(),v,wNow(),undefined,'btn');toast('+'+unitAmt(v)+' '+unitName());cust[z]=false;drawPages()}else toast('Enter an amount');return}
 if(b.dataset.e!=null&&sel!=null){const s=sipsToday().find(x=>x.id===sel);if(!s){sel=null;drawPages();return}
  if(b.dataset.e==='del'){const sv={ml:s.ml,at:s.at};waterRemoveSips(wDay(),[s.id]);sel=null;toast('Drink deleted',()=>{waterAddSip(wDay(),sv.ml,sv.at,undefined,'btn');drawPages()})}else{const st=wUnitOz()?OZ_ML:50;s.ml=Math.max(10,Math.round(s.ml+(+b.dataset.e)*st));waterCommit(wDay())}drawPages();return}
 if(b.dataset.v!=null&&b.dataset.z){const v=+b.dataset.v,z=b.dataset.z;clearTimeout(tapT);
  if(prefs.dbl&&tap&&tap.v===v&&tap.sz===z){const gone=waterRemoveSips(wDay(),[tap.id]);tap=null;sel=null;toast('Undone'+(gone[0]?': '+unitAmt(gone[0].ml)+' '+unitName():''));drawPages();return}
  const r=waterAddSip(wDay(),v,wNow(),undefined,'btn');sel=null;tap=prefs.dbl?{v,sz:z,id:r.s.id}:null;toast('+'+unitAmt(v)+' '+unitName()+' · '+wT(wNow())+(prefs.dbl?' · tap again to undo':''));if(prefs.dbl)tapT=setTimeout(()=>{tap=null;drawPages()},2200);drawPages()}}
document.addEventListener('click',e=>{const d=e.target.closest('#ph .w [data-d]');if(d&&!editing){sel=sel===d.dataset.d?null:d.dataset.d;drawPages()}});
// ---- widget registry: Water, To-Do, Next up. Each draws itself by size; several can share one stack ----
const WG={water:{n:'Water',d:'Log drinks, see pace through the day',ic:'water',c:'Health',html:z=>wHtml(z)},
 tasks:{n:'To-Do',d:'Tasks due today, tick them off',ic:'todo',c:'Planner',open:'todo',html:(z,it)=>tasksHtml(z,it)},
 next:{n:'Schedule',d:'Your day, what is next, tick blocks done',ic:'schedule',c:'Planner',open:'schedule',html:(z,it)=>schedHtml(z,it)},
 schedule:{n:'Schedule',d:'Your day, what is next, tick blocks done',ic:'schedule',c:'Planner',open:'schedule',html:(z,it)=>schedHtml(z,it)},
 skin:{n:'Skin',d:'Your routine, tabbed by Morning, Shower, Night. Tick steps',ic:'skin',c:'Health',open:'skin',html:(z,it)=>skinHtml(z,it)},
 pledge:{n:'Pledge',d:'One pledge: streak, prize, check in. Add one per pledge',ic:'pledge',c:'Planner',open:'pledge',html:(z,it)=>pledgeHtml(z,it)},
 gym:{n:'Training',d:'Today\'s workout. Log the whole thing from the Large size',ic:'gym',c:'Health',open:'gym',html:(z,it)=>trainHtml(z,it)},
 diet:{n:'Diet',d:'Calories and protein left, log or skip meals, quick add',ic:'diet',c:'Health',open:'diet',html:z=>dietHtml(z)},
 chores:{n:'Chores',d:'Chores due today, tick them off, undo',ic:'chores',c:'Home',open:'chores',html:(z,it)=>choresHtml(z,it)},
 grocery:{n:'Grocery',d:'What is left for this week, by store, and the budget',ic:'grocery',c:'Home',open:'grocery',html:z=>groceryHtml(z)},
 clock:{n:'Clock',d:'Time, next alarm, focus minutes. Switch alarms on or off',ic:'clock',c:'Tools',open:'clock',html:z=>clockHtml(z)},
 insights:{n:'Insights',d:'Your week score and how each app is doing',ic:'insights',c:'Insights',open:'insights',html:z=>insightsHtml(z)},
 banner:{n:'Banner',d:'Your Today banner: greeting, next event and tasks',ic:'insights',c:'Insights',html:(z,it)=>bannerHtml(z,it)},
 ticks:{n:'Recent ticks',d:'What you and Anusha ticked across the apps',ic:'todo',c:'Insights',html:(z,it)=>ticksHtml(z,it)},
 qlinks:{n:'Quick links',d:'Shortcuts to the apps you pick',ic:'_',c:'Tools',html:(z,it)=>qlinksHtml(z,it)},
 notes:{n:'Notes & lists',d:'Tick checklist items, jot notes',ic:'_',c:'Planner',html:(z,it)=>notesHtml(z,it)}};
const WKEYS=['water','tasks','schedule','skin','pledge','gym','diet','chores','grocery','clock','insights','ticks','qlinks','notes','banner'];const STK=['water','tasks','schedule'];
const curW=it=>it.ws[Math.min(it.si,it.ws.length-1)]||'water';
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const t12=t=>{const m=/^(\d{1,2}):(\d{2})/.exec(t||'');if(!m)return'';let h=+m[1];const ap=h>=12?'PM':'AM';h=h%12||12;return h+':'+m[2]+' '+ap};
const hasTasks=()=>typeof state!=='undefined'&&Array.isArray(state.personalTasks)&&typeof dueTasks==='function';
function taskList(all){try{if(!hasTasks())return null;if(!all)return dueTasks();return state.personalTasks.map(t=>({...t,_shared:false})).concat(state.sharedTasks||[]).filter(t=>!t.done).sort((a,b)=>(b.priority||0)-(a.priority||0)||String(a.due||'9999').localeCompare(String(b.due||'9999')))}catch(e){return[]}}
// ---- To-Do widget: add, Today/All/Shared/Done, detail panel (subtasks, tomorrow, share, delete), undo ----
const TD={tab:{},mtab:'today',sel:null,txt:'',when:'today',time:'',pr:0,rep:'none',sh:false,stxt:'',cnt:0};
const tdAll=()=>(state.personalTasks||[]).map(t=>({t,sh:false})).concat((state.sharedTasks||[]).map(t=>({t,sh:true})));
const tdFind=id=>tdAll().find(x=>x.t.id===id);
const tdArr=sh=>sh?state.sharedTasks:state.personalTasks;
async function tdWrite(sh,touch,drop){const list=tdArr(sh),ref=sh?sharedTodoRef():profileRef('todo-profiles','tasks');try{const remote=await readJson(ref,null);let out;if(Array.isArray(remote)){const by=new Map(list.map(t=>[t.id,t])),dr=new Set(drop||[]),tc=touch||[];out=remote.filter(t=>!dr.has(t.id)).map(t=>tc.includes(t.id)&&by.has(t.id)?by.get(t.id):t);const have=new Set(out.map(t=>t.id));tc.forEach(id=>{if(by.has(id)&&!have.has(id))out.push(by.get(id))})}else out=list.slice();list.splice(0,list.length,...out);await ref.set({json:JSON.stringify(list),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true})}catch(e){toast("Couldn't save, try again")}}
function tdParse(raw){let n=raw||'',o={},m;m=n.match(/!([1-3])\b/);if(m){o.p=+m[1];n=n.replace(m[0],'')}
 m=n.match(/\b(tomorrow|today)\b/i);if(m){o.w=m[1].toLowerCase();n=n.replace(m[0],'')}
 m=n.match(/\b(?:at\s+)?(\d{1,2})(?::(\d\d))?\s?(am|pm)\b/i);if(m){let h=+m[1]%12;if(/pm/i.test(m[3]))h+=12;o.t=String(h).padStart(2,'0')+':'+(m[2]||'00');n=n.replace(m[0],'')}
 m=n.match(/\b(daily|weekly)\b/i);if(m){o.r=m[1].toLowerCase();n=n.replace(m[0],'')}
 return{n:n.replace(/\s+/g,' ').trim(),o}}
function tdPreview(){const o=tdParse(TD.txt).o,p=[];if(o.w)p.push(o.w[0].toUpperCase()+o.w.slice(1));if(o.t)p.push(t12(o.t));if(o.p)p.push('!'+o.p);if(o.r)p.push(o.r);return p.length?'Understood: '+p.join(' · '):''}
function tdAdd(){const pr=tdParse(TD.txt);if(!pr.n){toast('Type a task first');return}const o=pr.o,w=o.w||TD.when,sh=TD.sh,rep=o.r||TD.rep;let due=w==='today'?today():w==='tomorrow'?addDays(today(),1):null;if(rep!=='none'&&!due)due=today();
 const t={id:'task-'+Date.now()+'-'+Math.floor(Math.random()*1000),title:pr.n,done:false,priority:o.p!=null?o.p:TD.pr,startDate:today(),due,dueTime:(o.t!=null?o.t:TD.time)||null,repeat:rep,notes:'',link:'',tags:[],subtasks:[],listId:sh?'shared':'personal',createdBy:state.profile,order:Date.now(),createdAt:new Date().toISOString()};
 tdArr(sh).push(t);TD.txt='';TD.time='';TD.pr=0;TD.rep='none';TD.when='today';TD.sh=false;tdWrite(sh,[t.id]);refresh();
 toast('Added: '+pr.n,()=>{const i=tdArr(sh).findIndex(x=>x.id===t.id);if(i>=0)tdArr(sh).splice(i,1);tdWrite(sh,[],[t.id]);refresh()})}
function tdRestore(id){const f=tdFind(id);if(!f)return;const t=f.t,arr=tdArr(f.sh);t.done=false;t.completedOn=null;const drop=[];if(t.spawnedId){const i=arr.findIndex(x=>x.id===t.spawnedId&&!x.done);if(i>=0){drop.push(arr[i].id);arr.splice(i,1)}t.spawnedId=null}tdWrite(f.sh,[t.id],drop);refresh();if(typeof renderDashboard==='function')try{renderDashboard()}catch(e){}}
function tdDone(id){const f=tdFind(id);if(!f)return;const title=f.t.title;if(TD.sel===id)TD.sel=null;Promise.resolve(completeTask(id)).then(()=>{toast('Done: '+title,()=>tdRestore(id));refresh()})}
function tdSetSel(id){TD.sel=TD.sel===id?null:id;TD.stxt='';refresh()}
function tdRows(kind){const T=today(),od=x=>x.t.due&&x.t.due<T;const ids=kind==='today'?new Set((dueTasks()||[]).map(x=>x.id)):null;let L=tdAll();
 if(kind==='done')return L.filter(x=>x.t.done&&x.t.completedOn===T).reverse();
 L=L.filter(x=>!x.t.done);if(kind==='today')L=L.filter(x=>ids.has(x.t.id));else if(kind==='shared')L=L.filter(x=>x.sh);
 const key=x=>(od(x)?0:1);return L.map((x,i)=>({x,i})).sort((a,b)=>key(a.x)-key(b.x)||(b.x.t.priority||0)-(a.x.t.priority||0)||String(a.x.t.dueTime||'99:99').localeCompare(String(b.x.t.dueTime||'99:99'))||a.i-b.i).map(r=>r.x)}
function tdRow(x,done,pick){const t=x.t,T=today();const od=!done&&t.due&&t.due<T;const tag=done?'<i class="tg sh">Tap to bring back</i>':od?'<i class="tg od">Overdue</i>':x.sh?'<i class="tg sh">Shared</i>':(t.due===addDays(T,1)?'<i class="tg">Tomorrow</i>':'');
 return `<div class="tk${pick&&TD.sel===t.id?' sel':''}"><button class="ck${done?' on':''}" ${done?`data-tdr="${esc(t.id)}" aria-label="Bring back"`:`data-tdk="${esc(t.id)}" aria-label="Mark done"`}></button><i class="pd${t.priority?' p'+t.priority:''}"></i>${pick?`<button class="tdn${done?' dnx':''}" data-tdn="${esc(t.id)}">${esc(t.title)}</button>`:`<span${done?' class="dnx"':''}>${esc(t.title)}</span>`}${tag}${t.dueTime?`<small>${t12(t.dueTime)}</small>`:''}</div>`}
const tdChip=(a,v,l,on)=>`<button class="chp${on?' on':''}" ${a}="${v}">${l}</button>`;
function tdForm(){const rp={none:'None',daily:'Daily',weekly:'Weekly'};
 return `<div class="fc"><span class="lb">When</span>${[['today','Today'],['tomorrow','Tomorrow'],['none','No date']].map(([v,l])=>tdChip('data-tdw',v,l,TD.when===v)).join('')}</div>`+
 `<div class="fc"><span class="lb">Time</span><input class="tm tdi" type="time" value="${esc(TD.time)}" data-tdtm="1"><span class="lb" style="width:auto;margin-left:4px">Repeat</span><button class="chp on" data-tdrep="1">${rp[TD.rep]}</button></div>`+
 `<div class="fc"><span class="lb">Priority</span>${[[0,'None'],[1,'!1'],[2,'!2'],[3,'!3']].map(([v,l])=>tdChip('data-tdpr',v,l,TD.pr===v)).join('')}</div>`+
 `<div class="fc"><span class="lb">List</span>${tdChip('data-tdl','me','Mine',!TD.sh)}${tdChip('data-tdl','shared','Shared with Anusha',TD.sh)}</div>`}
function tdPanel(){const f=tdFind(TD.sel);if(!f){TD.sel=null;return''}const t=f.t;
 return `<div class="pn"><div class="fx"><b class="g1" style="font-size:13px">${esc(t.title)}</b><button class="btn sm g" data-tdcl="1">Close</button></div>`+(t.subtasks||[]).map((u,i)=>`<div class="tk"><button class="ck${u.done?' on':''}" data-tdsub="${i}" aria-label="Subtask"></button><span${u.done?' class="dnx"':''}>${esc(u.text||u.title||'')}</span></div>`).join('')+
 `<div class="tdadd"><input class="tdi" id="tds-in" placeholder="Add a subtask" value="${esc(TD.stxt)}" data-tdsi="1"><button class="btn sm g" data-tds="1">+</button></div><div class="fx" style="margin-top:6px;flex-wrap:wrap"><button class="btn sm g" data-tdmv="1">Move to tomorrow</button><button class="btn sm g" data-tdsh="1">${f.sh?'Make mine':'Share with Anusha'}</button><button class="btn sm g bad" data-tddel="1">Delete</button></div></div>`}
function tasksHtml(z,it){const all=it&&it.o&&it.o.tm==='all';
 if(!hasTasks())return`<div class="t"><span>To-Do</span></div><div class="shim"></div><div class="shim s2"></div>`;
 const due=tdRows('today'),n=due.length,T=today(),odn=due.filter(x=>x.t.due&&x.t.due<T).length;
 const plus=`<button class="tdp" data-tdp="1" aria-label="Add a task">+</button>`;
 if(z==='xs')return`<div class="t"><span>To-Do</span>${plus}</div><div class="fx" style="gap:8px"><div class="big" style="font-size:28px">${n}</div><div class="mu" style="line-height:1.15">${all?'open':'due today'}${odn?`<br><span class="bad">${odn} overdue</span>`:''}</div></div>`;
 if(z==='s'){const L=all?tdRows('all'):due;return`<div class="t"><span>${all?'To-Do':'To-Do · today'}</span>${plus}</div>${L.length?`<div class="tks">${L.slice(0,2).map(x=>tdRow(x)).join('')}</div>${L.length>2?`<div class="mu mor">+${L.length-2} more</div>`:''}`:`<div class="emp"><b>All clear</b><span class="mu">Nothing ${all?'open':'due today'}</span></div>`}`}
 const addBox=`<div class="tdadd"><input class="tdi" id="tda-${z}" placeholder="Add a task, try: call mom tomorrow 5pm !1" value="${esc(TD.txt)}" data-tdi="1"><button class="btn sm" data-tdadd="1">Add</button></div><div class="pv tdpv">${esc(tdPreview())}</div>`;
 if(z==='m'){const dn=TD.mtab==='done',L=dn?tdRows('done'):(all?tdRows('all'):due);
  const tg=`<span class="tabs"><button class="${dn?'':'on'}" data-tdm="today">Today</button><button class="${dn?'on':''}" data-tdm="done">Done</button></span>`;
  return`<div class="t">${tg}<span>${dn?L.length+' done':n}</span></div><div class="tks">${L.length?L.slice(0,dn?3:2).map(x=>tdRow(x,dn)).join(''):`<div class="mu" style="padding:6px 0">${dn?'Nothing completed yet today':'All clear'}</div>`}</div>${dn?'':addBox}`}
 const tab=TD.tab[it&&it.id]||(all?'all':'today');const dn=tab==='done',L=tdRows(tab);
 const tabs=`<span class="tabs">${[['today','Today'],['all','All'],['shared','Shared'],['done','Done']].map(([v,l])=>`<button class="${tab===v?'on':''}" data-tdt="${v}" data-tdi2="${esc(it&&it.id||'')}">${l}</button>`).join('')}</span>`;
 return`<div class="t">${tabs}<span>${L.length}${dn?' done':' open'}</span></div><div class="tks tdl">${L.length?L.slice(0,40).map(x=>tdRow(x,dn,!dn)).join(''):`<div class="mu" style="padding:6px 0">${dn?'Nothing completed yet today':'All clear'}</div>`}</div>${addBox}${TD.sel?tdPanel():tdForm()}`}
function nextList(it){try{const rb=!(it&&it.o&&it.o.rb===false);const nowM=wNow();let tl=todaysTimeline().filter(x=>x.time&&(rb||x.kind==='event'));let up=tl.filter(x=>minutes(x.time)>=nowM);let tom=false;
 if(!up.length){tom=true;up=timelineForDate(addDays(today(),1)).filter(x=>x.time&&(rb||x.kind==='event'))}return{up,tom,nowM}}catch(e){return null}}
function nextHtml(z,it){const r=nextList(it);if(!r)return`<div class="t"><span>Next up</span></div><div class="shim"></div><div class="shim s2"></div>`;
 const{up,tom,nowM}=r;if(!up.length)return`<div class="t"><span>Next up</span></div><div class="emp"><b>Nothing planned</b><span class="mu">Your schedule is clear</span></div>`;
 const f=up[0];const d=minutes(f.time)-nowM;const when=tom?'tomorrow '+t12(f.time):d<=0?'now':d<60?'in '+d+' min':'in '+Math.floor(d/60)+'h'+(d%60?' '+d%60+'m':'');
 if(z==='xs')return`<div class="t"><span>Next up</span></div><div class="nx1">${esc(f.title)}</div><div class="mu">${when}</div>`;
 if(z==='s')return`<div class="t"><span>Next up</span></div><div class="nx1" style="font-size:17px">${esc(f.title)}</div><div class="nxt">${t12(f.time)}</div><div class="mu">${when}</div>`;
 const k=z==='m'?3:7;return`<div class="t"><span>Next up</span><span>${tom?'tomorrow':when}</span></div><div class="evs">${up.slice(0,k).map((x,i)=>`<div class="ev${i?'':' f'}"><b>${t12(x.time)}</b><span>${esc(x.title)}</span></div>`).join('')}</div>`}

// ---- Schedule widget: your day as blocks. Done ticks are the same record the Schedule app keeps (schedule-profiles/templateLog) ----
let sLog=null,sLogP='';
function schedLoad(force){try{if(typeof profileRef!=='function'||typeof state==='undefined'||!state.user)return;if(!force&&sLogP===state.profile&&sLog)return;const pf=state.profile;sLogP=pf;if(!sLog)sLog={};profileRef('schedule-profiles','templateLog').get().then(sn=>{if(state.profile!==pf)return;sLog=(sn.exists&&sn.data().json)?safeJson(sn.data().json,{}):{};refresh()}).catch(()=>{})}catch(e){}}
function schedBlocks(){try{const bl=dayBlocksFor(today());if(!Array.isArray(bl))return null;return bl.map((x,i)=>{const s=minutes(x.start||'');let e=minutes(x.end||'');if(s<9999&&e<=s)e+=1440;return{i,t:x.activity||x.title||'Block',s,e,st:x.start||'',en:x.end||''}}).filter(b=>b.s<9999)}catch(e){return null}}
const sKey=i=>today()+':'+i;
const sPal=['#8ccbff','#f2ad62','#7fb0ff','#bba2ff','#62d996','#e6a1d1','#e6b866'];
function schedToggle(i){schedLoad();const k=sKey(i);const was=!!(sLog&&sLog[k]);if(!sLog)sLog={};if(was)delete sLog[k];else sLog[k]=true;refresh();
 try{profileRef('schedule-profiles','templateLog').get().then(sn=>{const l=(sn.exists&&sn.data().json)?safeJson(sn.data().json,{}):{};if(was)delete l[k];else l[k]=true;sLog=l;return profileRef('schedule-profiles','templateLog').set({json:JSON.stringify(l)})}).catch(()=>{toast("Couldn't save, try again")})}catch(e){}
 return was}
function schedHtml(z,it){schedLoad();const rb=!(it&&it.o&&it.o.rb===false);const bl=rb?schedBlocks():[];if(bl===null)return`<div class="t"><span>Schedule</span></div><div class="shim"></div><div class="shim s2"></div>`;
 const T=today();let evs=[];try{evs=todaysTimeline().filter(x=>x.kind==='event'&&x.time).map(x=>({ev:1,t:x.title,s:minutes(x.time),st:x.time,en:''}))}catch(e){}
 const nowM=wNow(),L=sLog||{},dn=b=>!b.ev&&!!L[sKey(b.i)];
 const all=bl.concat(evs).sort((a,b)=>a.s-b.s);
 if(!all.length){let tom=[];try{tom=timelineForDate(addDays(T,1)).filter(x=>x.time&&(rb||x.kind==='event'))}catch(e){}
  if(tom.length)return`<div class="t"><span>Schedule</span><span>tomorrow</span></div><div class="nx1">${esc(tom[0].title)}</div><div class="mu">tomorrow ${t12(tom[0].time)}</div>`;
  return`<div class="t"><span>Schedule</span></div><div class="emp"><b>Nothing planned</b><span class="mu">Your schedule is clear</span></div>`}
 const done=bl.filter(dn).length;
 const cur=bl.find(b=>b.s<=nowM&&nowM<b.e&&!dn(b))||null;
 const up=all.filter(x=>x.s>nowM&&!dn(x));const nxt=up[0]||null;const c=cur||nxt;const isNow=!!cur;
 let tomNext=null;if(!c){try{tomNext=timelineForDate(addDays(T,1)).filter(x=>x.time&&(rb||x.kind==='event'))[0]||null}catch(e){}}
 const d=nxt?nxt.s-nowM:0;const when=isNow?'now':!c?(tomNext?'tomorrow '+t12(tomNext.time):''):d<=0?'now':d<60?'in '+d+' min':'in '+Math.floor(d/60)+'h'+(d%60?' '+d%60+'m':'');
 const name=c?c.t:(tomNext?tomNext.title:'Day complete');const sub=c?(isNow?'until '+t12(c.en):t12(c.st)):(tomNext?'tomorrow '+t12(tomNext.time):done+' of '+bl.length+' done');
 const canDone=c&&!c.ev;const dbtn=canDone?`<button class="pbtn ud" data-sd="${c.i}" style="width:100%">Done</button>`:'';
 const cnt=bl.length?`${done}/${bl.length}`:'';
 if(z==='xs')return`<div class="t"><span>${isNow?'Now':'Next up'}</span><span>${esc(when)}</span></div><div class="nx1" style="font-size:16px;-webkit-line-clamp:1">${esc(name)}</div><div class="mu">${esc(sub)}</div>`;
 if(z==='s')return`<div class="t"><span>${isNow?'Now':'Next up'}</span><span>${cnt}</span></div><div class="nx1" style="font-size:17px">${esc(name)}</div><div class="mu">${esc(sub)}</div><div class="mu" style="color:var(--accent)">${esc(when)}</div><div style="margin-top:auto">${dbtn}</div>`;
 const mn=m=>t12(String(Math.floor((m%1440)/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'));
 const bar=()=>{if(!bl.length)return'';const lo=Math.min(...bl.map(b=>b.s)),hi=Math.max(...bl.map(b=>b.e)),sp=Math.max(60,hi-lo);const pos=m=>Math.max(0,Math.min(100,(m-lo)/sp*100));
  const seg=bl.map(b=>`<i style="left:${pos(b.s)}%;width:${Math.max(1.2,pos(b.e)-pos(b.s))}%;background:${sPal[b.i%sPal.length]};opacity:${dn(b)?.35:1}"></i>`).join('');
  return`<div class="sbar">${seg}<u style="left:${pos(nowM)}%"></u></div><div class="mu" style="display:flex;justify-content:space-between;font-size:10px"><span>${mn(lo)}</span><span>${mn(hi)}</span></div>`};
 if(z==='m')return`<div class="t"><span>Today</span><span>${cnt?cnt+' done':esc(when)}</span></div>${bar()}<div class="fx" style="margin-top:auto;gap:10px"><div class="g1"><div style="font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(name)}</div><div class="mu">${isNow?'Now · ':''}${esc(sub)}${when&&!isNow?' · '+esc(when):''}</div></div>${canDone?`<button class="pbtn ud" data-sd="${c.i}" style="flex:none;padding:7px 16px">Done</button>`:''}</div>`;
 const rows=all.filter(x=>x.ev?x.s>=nowM-30:(x.e>nowM-60||!dn(x))).slice(0,9);
 return`<div class="t"><span>Today</span><span>${cnt?cnt+' done':esc(when)}</span></div>${bar()}<div class="tks" style="margin-top:6px">${rows.map(x=>x.ev?`<div class="tk sbk"><small style="width:56px;text-align:left">${t12(x.st)}</small><span>${esc(x.t)}</span><i class="tg sh">Event</i></div>`:`<div class="tk sbk${cur&&cur.i===x.i?' nw':''}"><small style="width:56px;text-align:left">${t12(x.st)}</small><span class="${dn(x)?'dnx':''}">${esc(x.t)}</span><button class="ck${dn(x)?' on':''}" data-sd="${x.i}" aria-label="${dn(x)?'Undo done':'Mark done'}"></button></div>`).join('')}</div>`}
// ---- Skin widget: tabs are today's real routine sections; ticking uses the same Skin records and product stock as the Skin app ----
const SK={tab:{},ld:0};const SKS={am:'Morning',body:'Shower',nizoral:'Nizoral',face:'Night',pm:'Night'};
const skinReady=()=>{try{return typeof skinLoad==='function'&&typeof SkinCore!=='undefined'&&typeof skinW!=='undefined'&&typeof skinCommit==='function'}catch(e){return false}};
function skKick(){if(!skinReady())return;if(skinW.st&&Date.now()-skinW.t<20000)return;if(SK.ld&&Date.now()-SK.ld<4000)return;SK.ld=Date.now();skinLoad().then(()=>refresh()).catch(()=>{})}
function skModel(it){skKick();if(!skinReady()||!skinW.st)return null;const st=skinW.st,C=SkinCore,pf=state.profile,td=today();let secs=null;try{secs=C.sections(pf,td,st.start)}catch(e){}
 if(!secs||!secs.length)return{none:1};
 const stat=secs.map(s=>{const req=s.steps.map((x,i)=>i).filter(i=>!s.steps[i].optional);return{n:req.length,d:req.filter(i=>st.stepLog[C.stepKey(td,s.key,i)]).length}});
 const nx=stat.findIndex(x=>x.d<x.n);let ti=secs.findIndex(s=>s.key===SK.tab[it&&it.id]);if(ti<0)ti=nx>=0?nx:secs.length-1;
 const tD=stat.reduce((a,x)=>a+x.d,0),tN=stat.reduce((a,x)=>a+x.n,0);let streak=0,low=[];try{streak=C.streak(pf,st.start,st.stepLog,td)}catch(e){}try{low=C.low(st.productState,pf)}catch(e){}
 return{st,C,td,secs,stat,nx,ti,tD,tN,streak,low,sec:secs[ti]}}
function skRow(m,s,i,showProd){const step=s.steps[i],dn=!!m.st.stepLog[m.C.stepKey(m.td,s.key,i)];let pn='';if(showProd){try{pn=m.C.productName(state.profile,step)}catch(e){}}
 return`<div class="tk"><button class="ck${dn?' on':''}" data-sks="${esc(s.key)}:${i}" aria-label="${dn?'Untick':'Tick'}"></button><span class="${dn?'dnx':''}">${esc(step.text)}${step.optional?' <i class="tg">Optional</i>':''}</span>${pn?`<i class="tg sh">${esc(pn)}</i>`:''}</div>`}
function skinHtml(z,it){const m=skModel(it);const id=esc(it&&it.id||'');
 if(!m)return`<div class="t"><span>Skin</span></div><div class="shim"></div><div class="shim s2"></div>`;
 if(m.none)return`<div class="t"><span>Skin</span></div><div class="emp"><b>No routine today</b><span class="mu">Nothing planned</span></div>`;
 const {secs,stat,nx,ti,sec}=m,x=stat[ti],left=x.n-x.d,all=nx<0;const nxs=nx>=0?secs[nx]:null;
 if(z==='xs')return`<div class="t"><span>Skin</span><span>${m.tD}/${m.tN}</span></div><div class="nx1" style="font-size:16px;-webkit-line-clamp:1">${all?'All done':esc(SKS[nxs.key]||nxs.label)}</div><div class="mu">${all?'Routine complete':(stat[nx].n-stat[nx].d)+' step'+(stat[nx].n-stat[nx].d===1?'':'s')+' left'}</div>`;
 const allBtn=(full)=>left>0?`<button class="pbtn ud" data-ska="${esc(sec.key)}" data-ski="${id}"${full?' style="width:100%"':' style="flex:none;padding:7px 14px"'}>Tick all</button>`:`<button class="pbtn" data-ska="${esc(sec.key)}" data-ski="${id}"${full?' style="width:100%"':' style="flex:none;padding:7px 14px"'}>Done ✓ Undo</button>`;
 if(z==='s'){const nstep=sec.steps.findIndex((q,i)=>!q.optional&&!m.st.stepLog[m.C.stepKey(m.td,sec.key,i)]);return`<div class="t"><span>${esc(sec.label)}</span><span>${x.d}/${x.n}</span></div><div class="nx1" style="font-size:15px;-webkit-line-clamp:2">${nstep>=0?esc(sec.steps[nstep].text):'All steps done'}</div><div style="margin-top:auto">${allBtn(true)}</div>`}
 const tabs=`<span class="tabs sktabs">${secs.map((q,i)=>`<button class="${i===ti?'on':''}" data-skt="${esc(q.key)}" data-ski="${id}">${esc(SKS[q.key]||q.label)}</button>`).join('')}</span>`;
 const idx=sec.steps.map((q,i)=>i);
 if(z==='m')return`<div class="t">${tabs}<span>${x.d}/${x.n}</span></div><div class="tks tdl skl">${idx.map(i=>skRow(m,sec,i,false)).join('')}</div><div style="margin-top:6px">${allBtn(true)}</div>`;
 const lowT=m.low.length?`<div class="mu" style="color:var(--accent)">Running low: ${m.low.slice(0,3).map(q=>esc(q.name)).join(', ')}${m.low.length>3?' +'+(m.low.length-3):''}</div>`:'';
 return`<div class="t">${tabs}<span>${x.d}/${x.n}</span></div>${sec.treat?`<div class="mu" style="margin-bottom:2px">${esc(sec.treat)}${sec.time?' · '+esc(sec.time):''}</div>`:(sec.sub?`<div class="mu" style="margin-bottom:2px">${esc(sec.sub)}</div>`:'')}<div class="tks tdl skl skL">${idx.map(i=>skRow(m,sec,i,true)).join('')}</div>${sec.note?`<div class="mu">${esc(sec.note)}</div>`:''}<div style="margin-top:6px">${allBtn(true)}</div><div class="fx mu" style="margin-top:6px;justify-content:space-between"><span>Today ${m.tD}/${m.tN}</span><span>${m.streak>0?m.streak+'-day streak':'No streak yet'}</span></div>${lowT}`}
function skSet(secKey,idxs,on,msg){if(!skinReady()||!skinW.st)return;const C=SkinCore,td=today();const s=C.sections(state.profile,td,skinW.st.start).find(q=>q.key===secKey);if(!s)return;const ch=[],names=['stepLog','productState','usageLedger'];
 skinCommit(names,d=>{let any=false;idxs.forEach(i=>{if(C.setStep(d,C.stepKey(td,secKey,i),s.steps[i],on).changed){any=true;ch.push(i)}});return{changed:any}},null).then(r=>{refresh();if(r&&r.changed&&ch.length)toast(msg,()=>{skinCommit(names,d=>{let any=false;ch.forEach(i=>{if(C.setStep(d,C.stepKey(td,secKey,i),s.steps[i],!on).changed)any=true});return{changed:any}},null).then(()=>refresh())})})}
function skClick(d){if(d.skt!=null){SK.tab[d.ski]=d.skt;refresh();return}
 if(!skinReady()||!skinW.st)return;const C=SkinCore,td=today(),secs=C.sections(state.profile,td,skinW.st.start)||[];
 if(d.sks!=null){const[k,i]=d.sks.split(':'),s=secs.find(q=>q.key===k);if(!s)return;const was=!!skinW.st.stepLog[C.stepKey(td,k,+i)];skSet(k,[+i],!was,(was?'Unticked: ':'Ticked: ')+s.steps[+i].text.slice(0,34)+(s.steps[+i].product&&!was?' · stock updated':''));return}
 if(d.ska!=null){const s=secs.find(q=>q.key===d.ska);if(!s)return;const idx=s.steps.map((_,i)=>i),req=idx.filter(i=>!s.steps[i].optional),done=req.every(i=>skinW.st.stepLog[C.stepKey(td,s.key,i)]);skSet(s.key,done?idx:req,!done,(done?'Unticked all: ':'Ticked all: ')+s.label)}}

// ---- Pledge widget: one widget per pledge. Pick which pledge in the widget settings; add as many as you like ----
const PL={list:null,ld:0,uid:''};
const plLen=p=>p.length||(p.weeks||4)*7,plEnd=p=>addDays(p.start,plLen(p)-1),plBetween=(a,b)=>Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/864e5),plDow=d=>new Date(d+'T12:00:00').getDay();
function plKick(force){try{if(typeof appRef!=='function'||typeof state==='undefined'||!state.user)return;if(!force&&PL.list&&Date.now()-PL.ld<20000)return;if(PL.busy&&Date.now()-PL.busy<4000)return;PL.busy=Date.now();appRef('pledge-v3','state').get().then(sn=>{const j=sn.exists&&sn.data().json?safeJson(sn.data().json,null):null;PL.list=(j&&Array.isArray(j.pledges))?j.pledges:[];PL.ld=Date.now();refresh()}).catch(()=>{})}catch(e){}}
const plMine=()=>(PL.list||[]).filter(p=>!p.deleted&&p.owner===state.profile&&p.start);
function plPick(it){const L=plMine();if(!L.length)return null;const want=it&&it.o&&it.o.pid;if(want){const f=L.find(p=>p.id===want);if(f)return f}
 const act=L.filter(p=>!p.claimed&&today()<=plEnd(p)).sort((a,b)=>String(a.start).localeCompare(String(b.start)));const pool=act.length?act:L;
 const autos=[];pages.forEach(pg=>pg.forEach(x=>{if(x.t==='w'&&x.ws.includes('pledge')&&!(x.o&&x.o.pid))autos.push(x.id)}));const i=Math.max(0,autos.indexOf(it&&it.id));return pool[i%pool.length]}
function plCalc(p){const T=today(),end=plEnd(p),allowed=p.misses||0,daysLeft=Math.max(0,plBetween(T,end)+1);let tot=0,done=0,missed=0,left=0,streak=0;p.log=p.log||{};
 if(p.mode==='milestone'){const r=Object.keys(p.log).length>0;return{end,tot:1,done:r?1:0,need:r?0:1,streak:0,daysLeft,status:p.claimed?'claimed':r?'earned':T>end?'failed':'active',ms:1,missed:0,left:r?0:1}}
 const wb=[];for(let s=p.start;s<=end;s=addDays(s,7)){const e=addDays(s,6)>end?end:addDays(s,6);wb.push({s,e,n:plBetween(s,e)+1})}
 const wt=w=>{let t=0;for(let d=w.s;d<=w.e;d=addDays(d,1))if(p.log[d])t++;return t};
 if(p.mode==='perweek'){const need=Math.max(1,p.perWeek||1);let run=0;wb.forEach(w=>{const q=Math.min(need,w.n),t=wt(w);tot+=q;done+=Math.min(q,t);if(w.e<T){missed+=Math.max(0,q-t);run=t>=q?run+1:0}else if(w.s<=T){const rem=plBetween(T,w.e)+1,gap=Math.max(0,q-t);if(gap>rem)missed+=gap-rem;left+=gap;if(t>=q)run++}else left+=q});streak=run}
 else{const days=p.days||[0,1,2,3,4,5,6];for(let d=p.start;d<=end;d=addDays(d,1)){if(!days.includes(plDow(d)))continue;tot++;if(p.log[d])done++;else if(d<T)missed++;else left++}
  for(let d=T>end?end:T;d>=p.start;d=addDays(d,-1)){if(!days.includes(plDow(d)))continue;if(p.log[d])streak++;else if(d===T)continue;else break}}
 let status='active';if(p.claimed)status='claimed';else if(tot&&done>=Math.max(1,tot-allowed))status='earned';else if(missed>allowed)status='failed';
 return{end,tot,done,missed,left,streak,daysLeft,status,need:Math.max(0,Math.max(1,tot-allowed)-done)}}
function plDue(p,d){if(d<p.start||d>plEnd(p)||p.mode==='milestone')return false;if(p.mode==='perweek')return true;return(p.days||[0,1,2,3,4,5,6]).includes(plDow(d))}
function plRing(pc,d,txt){const R=18,C=2*Math.PI*R;return`<svg class="plr" width="${d}" height="${d}" viewBox="0 0 44 44"><circle cx="22" cy="22" r="${R}" fill="none" stroke="#ffffff22" stroke-width="4.5"/><circle cx="22" cy="22" r="${R}" fill="none" stroke="var(--accent)" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="${C*Math.min(1,pc)} ${C}" transform="rotate(-90 22 22)"/><text x="22" y="26" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor">${txt}</text></svg>`}
function plWeek(p){const T=today(),dow=plDow(T),mon=addDays(T,-((dow+6)%7)),nm=['M','T','W','T','F','S','S'];let h='<div class="plw">';for(let i=0;i<7;i++){const d=addDays(mon,i),due=plDue(p,d),dn=!!p.log[d];let c='plst';if(dn)c+=' pldn';else if(!due)c+=' ploff';else if(d<T)c+=' plms';else if(d===T)c+=' plnw';h+=`<span><i class="${c}">${dn?'✓':''}</i><small>${nm[i]}</small></span>`}return h+'</div>'}
function pledgeHtml(z,it){plKick();if(PL.list==null)return`<div class="t"><span>Pledge</span></div><div class="shim"></div><div class="shim s2"></div>`;
 const p=plPick(it);if(!p)return`<div class="t"><span>Pledge</span></div><div class="emp"><b>No pledges yet</b><span class="mu">Make one in the Pledge app</span></div>`;
 const c=plCalc(p),T=today(),linked=p.kind==='linked',inWin=T>=p.start&&T<=c.end;const dayN=Math.max(0,Math.min(plLen(p),plBetween(p.start,T)+1));const pc=c.tot?Math.min(1,c.done/Math.max(1,c.tot-(p.misses||0))):0;
 const dueNow=plDue(p,T),kept=!!p.log[T],canTap=!linked&&c.status==='active'&&!c.ms&&(dueNow||kept)&&inWin;
 const pz=p.prize&&p.prize.name?p.prize.name:'';const st=c.status==='earned'?'Earned':c.status==='claimed'?'Claimed':c.status==='failed'?'Missed':'';
 const act=canTap?`<button class="pbtn ${kept?'':'ud'}" data-plk="${esc(p.id)}" style="width:100%">${kept?'↶ Undo today':'Check in'}</button>`:`<div class="mu" style="text-align:center;padding:7px 0">${linked?'Ticks itself · Auto':st?st:c.ms?'Milestone':dueNow?'':'Rest day'}</div>`;
 const sub=st||(inWin?'Day '+dayN+' of '+plLen(p):T<p.start?'Starts '+p.start.slice(5):'Ended');
 if(z==='xs')return`<div class="fx" style="gap:8px">${plRing(pc,40,Math.round(pc*100)+'%')}<div class="g1 col"><div style="font-weight:700;font-size:13px;line-height:1.15;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(p.title)}</div><div class="mu" style="font-size:10px">${c.streak?c.streak+(c.streak===1?' day':' days')+' in a row':esc(sub)}</div></div></div>`;
 if(z==='s')return`<div class="t"><span>Pledge</span><span>${c.streak?'🔥 '+c.streak:''}</span></div><div class="nx1" style="font-size:15px;-webkit-line-clamp:2">${esc(p.title)}</div><div class="mu">${esc(sub)}</div><div style="margin-top:auto">${act}</div>`;
 if(z==='m')return`<div class="t"><span>Pledge</span><span>${esc(sub)}</span></div><div class="fx" style="gap:10px">${plRing(pc,54,Math.round(pc*100)+'%')}<div class="g1"><div style="font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.title)}</div><div class="mu">${c.done}/${c.tot} kept${c.streak?' · 🔥 '+c.streak:''}</div>${pz?`<div class="mu" style="color:var(--accent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">🎁 ${esc(pz)}</div>`:''}</div></div><div style="margin-top:auto">${act}</div>`;
 return`<div class="t"><span>Pledge</span><span>${esc(sub)}</span></div><div class="fx" style="gap:12px">${plRing(pc,72,Math.round(pc*100)+'%')}<div class="g1"><div style="font-weight:700;font-size:17px;line-height:1.15">${esc(p.title)}</div>${p.why?`<div class="mu" style="font-style:italic">${esc(p.why)}</div>`:''}${pz?`<div class="mu" style="color:var(--accent)">🎁 ${esc(pz)}</div>`:''}</div></div>${p.mode==='perweek'||p.mode==='milestone'?'':plWeek(p)}<div class="fx mu" style="justify-content:space-between;margin-top:6px"><span>${c.done} kept</span><span>${c.missed} missed</span><span>${c.left} to go</span><span>${c.daysLeft} day${c.daysLeft===1?'':'s'} left</span></div>${c.streak?`<div class="mu" style="color:var(--accent)">🔥 ${c.streak}${p.mode==='perweek'?' week':' day'} streak</div>`:''}<div style="margin-top:auto">${act}</div>`}
function plTick(id){const p=(PL.list||[]).find(x=>x.id===id);if(!p||p.kind==='linked')return;const T=today();p.log=p.log||{};const was=!!p.log[T];if(was)delete p.log[T];else p.log[T]=1;p.u=Date.now();refresh();plSave(p);
 const c=plCalc(p);toast(was?'Check-in removed':(c.status==='earned'?'Pledge kept. Prize unlocked':'Checked in'+(c.streak?' · 🔥 '+c.streak:'')),()=>{const q=(PL.list||[]).find(x=>x.id===id);if(!q)return;if(was)q.log[T]=1;else delete q.log[T];q.u=Date.now();refresh();plSave(q)})}
function plSave(p){try{const ref=appRef('pledge-v3','state');ref.get().then(sn=>{let remote=[];if(sn.exists&&sn.data().json){const j=safeJson(sn.data().json,null);if(j&&Array.isArray(j.pledges))remote=j.pledges}const by={};remote.forEach(x=>by[x.id]=x);if(!by[p.id]||(p.u||0)>=(by[p.id].u||0))by[p.id]=p;return ref.set({json:JSON.stringify({version:3,pledges:Object.values(by)})})}).catch(()=>toast("Couldn't save, try again"))}catch(e){}}

// ---- Training widget: today's workout from the same plan the Training app uses. The Large widget logs the whole workout ----
const TRA_SCHED={Monday:'Push + Core',Tuesday:'Rest',Wednesday:'Pull',Thursday:'Legs A',Friday:'Upper + Core',Saturday:'Active Recovery',Sunday:'Legs B + Light Arms/Core'};
const TRA_W={"Monday":[["mon1","Chest Press",3,12,15],["mon2","Pec Fly",2,12,15],["mon3","Shoulder Press",2,12,12],["mon4","Lateral Raise",2,15,15],["mon5","Triceps Pushdown",2,12,15],["mon6","Ab Crunch",3,15,20],["mon7","Back Extension",2,15,15]],"Wednesday":[["wed1","Lat Pulldown",3,12,15],["wed2","Low Row",3,12,15],["wed3","Rear Delt Fly",2,15,15],["wed4","Biceps Curl",2,12,15],["wed5","Back Extension",2,15,15]],"Thursday":[["thu1","Leg Press",3,12,15],["thu2","Leg Extension",2,12,15],["thu3","Leg Curl",3,12,15],["thu4","Glute Extension",2,12,15],["thu5","Inner Thigh",2,15,15],["thu6","Outer Thigh",2,15,15],["thu7","Calf Raise",2,15,20]],"Friday":[["fri1","Chest Press",2,15,15],["fri2","Low Row",2,15,15],["fri3","Lateral Raise",2,15,15],["fri4","Rear Delt Fly",2,15,15],["fri5","Triceps Pushdown",2,15,15],["fri6","Biceps Curl",2,15,15],["fri7","Ab Crunch",3,15,20],["fri8","Plank",3,30,45]],"Sunday":[["sun1","Leg Curl",3,12,15],["sun2","Leg Press",2,15,15],["sun3","Leg Extension",2,15,15],["sun4","Glute Extension",2,15,15],["sun5","Calf Raise",3,15,20],["sun6","Biceps Curl",2,15,15],["sun7","Ab Crunch",2,20,20]],"Tuesday":[],"Saturday":[]};
const TR={date:'',pid:'',ready:false,busy:0,day:'',title:'',ex:[],rest:false,logged:null,last:{},draft:{},open:null,wk:{},unit:'',saved:''};
const trDays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const trCol=n=>db.collection('users').doc(state.user.uid).collection('profiles').doc(state.profile.toLowerCase()).collection(n);
function trPlan(date,ov){const pf=state.profile,dn=trDays[new Date(date+'T12:00:00').getDay()];let day=dn,rest=ov==='__rest';
 let table=null,sched=null,unit=pf==='Anusha'?'kg':'lbs';
 if(pf==='Anusha'){table=Object.fromEntries(Object.entries(TRA_W).map(([d,l])=>[d,l.map(e=>({id:e[0],name:e[1],sets:e[2],repMin:e[3],repMax:e[4]}))]));sched=TRA_SCHED}
 else{const BP=window.BHARGAV_PLAN;if(BP&&BP.active&&BP.active(date)){const r=BP.resolve(date);if(r){table=r.workouts;sched=Object.fromEntries(Object.entries(r.weekSchedule).map(([d,v])=>[d,v.main]))}}}
 if(!table)return null;if(ov&&ov!=='__rest'&&table[ov])day=ov;const ex=rest?[]:(table[day]||[]);
 return{day,rest:rest||!ex.length,ex,unit,title:rest?'Rest day':(sched&&sched[day])||day}}
function trKey(){return 'ph-tr-'+state.profile+'-'+TR.date}
function trKick(force){try{if(typeof db==='undefined'||typeof state==='undefined'||!state.user)return;const T=today(),pid=state.profile.toLowerCase();if(!force&&TR.ready&&TR.date===T&&TR.pid===pid)return;if(TR.busy&&Date.now()-TR.busy<5000)return;TR.busy=Date.now();
 if(TR.date!==T||TR.pid!==pid){TR.ready=false;TR.draft={};TR.open=null;TR.logged=null}TR.date=T;TR.pid=pid;
 const cut=addDays(T,-70),fp=firebase.firestore.FieldPath.documentId();
 Promise.all([db.collection('users').doc(state.user.uid).collection('profiles').doc(pid).collection('meta').doc('workoutOverrides').get().catch(()=>null),trCol('workoutLogs').where(fp,'>=',cut).where(fp,'<',T+';').get().catch(()=>null)]).then(([ov,lg])=>{
  const map=(ov&&ov.exists&&ov.data()&&ov.data().map)||{};const pl=trPlan(T,map[T]);const docs=[];if(lg)lg.forEach(d=>{const x=d.data();if(x&&x.date&&x.mode==='regular'&&Array.isArray(x.exercises))docs.push(x)});docs.sort((a,b)=>a.date<b.date?1:-1);
  TR.plan=pl;if(pl){TR.day=pl.day;TR.title=pl.title;TR.ex=pl.ex;TR.rest=pl.rest;TR.unit=pl.unit}
  TR.last={};docs.filter(x=>x.day===TR.day).forEach(x=>x.exercises.forEach(e=>{const k=e.id;if(!TR.last[k])TR.last[k]=e.sets;const nk='n:'+String(e.name).toLowerCase();if(!TR.last[nk])TR.last[nk]=e.sets}));
  TR.wk={};const mon=addDays(T,-((new Date(T+'T12:00:00').getDay()+6)%7));docs.forEach(x=>{if(x.date>=mon)TR.wk[x.date]=1});
  return trCol('workoutLogs').doc(T+':regular:'+TR.day).get().catch(()=>null)}).then(sn=>{
  TR.logged=sn&&sn.exists?sn.data():null;
  TR.ex.forEach(e=>{const lg=TR.logged&&(TR.logged.exercises||[]).find(x=>x.id===e.id);TR.draft[e.id]=Array.from({length:Math.max(e.sets,lg?lg.sets.length:0)},(_,i)=>lg&&lg.sets[i]?{w:String(lg.sets[i].weight),r:String(lg.sets[i].reps)}:{w:'',r:''})});
  try{const sv=JSON.parse(localStorage.getItem(trKey())||'null');if(sv&&typeof sv==='object')Object.keys(sv).forEach(k=>{if(TR.draft[k]&&Array.isArray(sv[k]))sv[k].forEach((v,i)=>{if(v&&(v.w!==''||v.r!=='')){if(!TR.draft[k][i])TR.draft[k][i]={w:'',r:''};if(TR.draft[k][i].w===''&&TR.draft[k][i].r==='')TR.draft[k][i]=v}})})}catch(e){}
  TR.saved=trSig();TR.ready=true;TR.busy=0;refresh()}).catch(()=>{TR.busy=0})}catch(e){}}
const trNum=v=>v!==''&&v!=null&&isFinite(+v);
const trSets=id=>(TR.draft[id]||[]).filter(s=>trNum(s.w)&&trNum(s.r)&&+s.r>0);
const trSig=()=>JSON.stringify(TR.ex.map(e=>trSets(e.id).map(s=>[+s.w,+s.r])));
const trCount=()=>TR.ex.reduce((a,e)=>a+trSets(e.id).length,0);
const trExDone=e=>trSets(e.id).length>=e.sets;
function trLastFor(e,i){const L=TR.last[e.id]||TR.last['n:'+String(e.name).toLowerCase()];if(!L||!L.length)return null;return L[Math.min(i,L.length-1)]}
function trExRow(e){const open=TR.open===e.id,n=trSets(e.id).length,L=TR.last[e.id]||TR.last['n:'+String(e.name).toLowerCase()],lt=L&&L[0]?`last ${L[0].weight}×${L[0].reps}`:'';
 let h=`<div class="trx${open?' op':''}"><button class="trh" data-trx="${esc(e.id)}"><i class="trc${trExDone(e)?' ok':''}"></i><span class="tn">${esc(e.name)}</span><small>${n}/${e.sets} · ${e.repMin===e.repMax?e.repMin:e.repMin+'–'+e.repMax}</small></button>`;
 if(open){const dr=TR.draft[e.id]||[];h+=(e.planText?`<div class="mu" style="font-size:10.5px;margin:2px 0 4px">${esc(e.planText)}</div>`:'')+dr.map((s,i)=>{const l=trLastFor(e,i);return`<div class="trs"><small>${i+1}</small><input class="tdi trw" inputmode="decimal" data-trw="${esc(e.id)}:${i}:w" value="${esc(s.w)}" placeholder="${l?l.weight:TR.unit}" aria-label="Weight"><span>×</span><input class="tdi trw" inputmode="numeric" data-trw="${esc(e.id)}:${i}:r" value="${esc(s.r)}" placeholder="${l?l.reps:'reps'}" aria-label="Reps">${l?`<button class="chp" data-trl="${esc(e.id)}:${i}" aria-label="Same as last time">Last</button>`:'<i></i>'}</div>`}).join('')+`<div class="fx" style="gap:8px;margin-top:4px"><button class="chp" data-tra="${esc(e.id)}">+ Set</button>${lt?`<small class="mu">${esc(lt)} ${TR.unit}</small>`:''}</div>`}
 return h+'</div>'}
function tronDot(){const T=today(),mon=addDays(T,-((new Date(T+'T12:00:00').getDay()+6)%7));const nm=['M','T','W','T','F','S','S'];return`<div class="plw" style="margin:0;flex:0 0 210px">${nm.map((n,i)=>{const d=addDays(mon,i),on=TR.wk[d]||(d===T&&(TR.logged||trCount()>0));return`<span><i class="plst${on?' pldn':d===T?' plnw':''}" style="width:18px;height:18px;font-size:10px">${on?'✓':''}</i><small>${n}</small></span>`}).join('')}</div>`}
function trainHtml(z,it){trKick();if(!TR.ready)return`<div class="t"><span>Training</span></div><div class="shim"></div><div class="shim s2"></div>`;
 if(!TR.plan)return`<div class="t"><span>Training</span></div><div class="emp"><b>No plan today</b><span class="mu">Open Training</span></div>`;
 const T=TR.title,tot=TR.ex.length,dn=TR.ex.filter(trExDone).length,sets=trCount(),saved=TR.saved===trSig()&&(TR.logged||sets===0);
 if(TR.rest)return`<div class="t"><span>Training</span><span>${esc(TR.day.slice(0,3))}</span></div><div class="emp"><b>${esc(T)}</b><span class="mu">Recover well${Object.keys(TR.wk).length?' · '+Object.keys(TR.wk).length+' session'+(Object.keys(TR.wk).length===1?'':'s')+' this week':''}</span></div>`;
 const nx=TR.ex.find(e=>!trExDone(e));
 if(z==='xs')return`<div class="t"><span>Training</span><span>${dn}/${tot}</span></div><div class="nx1" style="font-size:15px;-webkit-line-clamp:1">${esc(T)}</div><div class="mu">${dn===tot?'Workout done':nx?esc(nx.name):''}</div>`;
 if(z==='s')return`<div class="t"><span>Training</span><span>${dn}/${tot}</span></div><div class="nx1" style="font-size:16px;-webkit-line-clamp:1">${esc(T)}</div><div class="mu">${dn===tot?'All exercises logged':'Next: '+esc(nx.name)}</div><div class="sbar" style="margin-top:auto"><i style="left:0;width:${tot?dn/tot*100:0}%;background:var(--accent)"></i></div>`;
 if(z==='m'){const l=nx?(TR.last[nx.id]||TR.last['n:'+nx.name.toLowerCase()]):null;return`<div class="t"><span>${esc(T)}</span><span>${dn}/${tot}</span></div><div class="sbar"><i style="left:0;width:${tot?dn/tot*100:0}%;background:var(--accent)"></i></div><div class="fx" style="margin-top:auto;gap:10px"><div class="g1"><div style="font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nx?esc(nx.name):'Workout complete'}</div><div class="mu">${nx?nx.sets+' sets · '+(nx.repMin===nx.repMax?nx.repMin:nx.repMin+'–'+nx.repMax)+' reps'+(l&&l[0]?' · last '+l[0].weight+'×'+l[0].reps:''):sets+' sets logged'}</div></div><button class="pbtn ud" data-trapp="1" style="flex:none;padding:7px 14px">Open</button></div>`}
 if(TR.open==null&&nx)TR.open=nx.id;
 return`<div class="t"><span>${esc(T)}</span><span>${dn}/${tot} · ${sets} sets</span></div><div class="tks tdl trl">${TR.ex.map(trExRow).join('')}</div><button class="pbtn ${saved?'':'ud'}" data-trsv="1" style="width:100%;margin-top:6px;flex:none">${saved?'Saved ✓':'Save workout · '+sets+' set'+(sets===1?'':'s')}</button><div class="fx" style="justify-content:space-between;margin-top:6px;align-items:center;flex:none"><small class="mu">This week</small>${tronDot()}</div>`}
async function trSave(){if(!TR.plan||TR.rest)return;const T=TR.date,exs=[];TR.ex.forEach(e=>{const sets=trSets(e.id).map(s=>({weight:+s.w,reps:Math.round(+s.r),effort:null}));if(sets.length)exs.push({id:e.id,name:e.name,sets})});
 if(!exs.length){toast('Log at least one set first (weight and reps)');return}
 const old=TR.logged,oc=old?old.exercises.reduce((a,e)=>a+e.sets.length,0):0,nc=exs.reduce((a,e)=>a+e.sets.length,0);
 if(oc>nc){toast('Not saved: this would remove '+(oc-nc)+' logged set'+(oc-nc===1?'':'s'));return}
 const doc={date:T,day:TR.day,mode:'regular',exercises:exs};if(old){if(Array.isArray(old.sessions))doc.sessions=old.sessions;if(old.sessionDurationSec!=null)doc.sessionDurationSec=old.sessionDurationSec}
 try{await trCol('workoutLogs').doc(T+':regular:'+TR.day).set(doc);TR.logged=doc;TR.saved=trSig();TR.wk[T]=1;try{localStorage.removeItem(trKey())}catch(e){}refresh();toast('Workout saved · '+nc+' set'+(nc===1?'':'s'),old?null:()=>{trCol('workoutLogs').doc(T+':regular:'+TR.day).delete().then(()=>{TR.logged=null;TR.saved='';refresh()})})}catch(e){toast("Couldn't save, try again")}}
function trClick(d){if(d.trapp!=null){openApp('gym',null);return}
 if(d.trx!=null){TR.open=TR.open===d.trx?null:d.trx;refresh();return}
 if(d.tra!=null){(TR.draft[d.tra]=TR.draft[d.tra]||[]).push({w:'',r:''});refresh();return}
 if(d.trl!=null){const[id,i]=d.trl.split(':'),e=TR.ex.find(x=>x.id===id);if(!e)return;const l=trLastFor(e,+i);if(l){TR.draft[id][+i]={w:String(l.weight),r:String(l.reps)};trPersist();refresh()}return}
 if(d.trsv!=null){trSave();return}}
function trPersist(){try{localStorage.setItem(trKey(),JSON.stringify(TR.draft))}catch(e){}}
document.addEventListener('input',e=>{const t=e.target;if(t&&t.dataset){if(t.dataset.dtn!=null)DT.n=t.value;else if(t.dataset.dtkc!=null)DT.k=t.value;else if(t.dataset.dtp!=null)DT.p=t.value;else if(t.dataset.nta!=null)NT.add=t.value;else if(t.dataset.ntn!=null)NT.nt=t.value}if(!t||!t.dataset||t.dataset.trw==null)return;const[id,i,f]=t.dataset.trw.split(':');if(!TR.draft[id])return;const s=(TR.draft[id][+i]=TR.draft[id][+i]||{w:'',r:''});s[f]=t.value;trPersist();
 const b=document.querySelector('#ph [data-trsv]');if(b){const n=trCount(),sv=TR.saved===trSig()&&(TR.logged||n===0);b.textContent=sv?'Saved ✓':'Save workout · '+n+' set'+(n===1?'':'s');b.classList.toggle('ud',!sv)}
 const row=t.closest('.trx');if(row){const e=TR.ex.find(x=>x.id===id);if(e){const sm=row.querySelector('.trh small');if(sm)sm.textContent=trSets(id).length+'/'+e.sets+' · '+(e.repMin===e.repMax?e.repMin:e.repMin+'–'+e.repMax);const c=row.querySelector('.trc');if(c)c.classList.toggle('ok',trExDone(e))}}});

// ---- Chores widget: same completion the Hub's Chores widget does (chores + history + Schedule link), with undo ----
const CH={tab:{}};
const chDue=()=>{try{return typeof choresDueToday==='function'&&Array.isArray(state.chores)?choresDueToday():null}catch(e){return null}};
const chDone=()=>{try{const T=today();return(state.choreHistory||[]).filter(h=>h.date===T&&!h.kind&&h.by===state.profile).map(h=>({id:h.choreId,log:h.id,name:h.task}))}catch(e){return[]}};
function chRow(c,done){const ov=c.overdue,who=Array.isArray(c.assignedTo)&&c.assignedTo.length>1?' · '+c.assignedTo.map(a=>a[0]).join('/'):'';
 return`<div class="tk"><button class="ck${done?' on':''}" ${done?`data-chu="${esc(c.id)}" aria-label="Undo"`:`data-chk="${esc(c.id)}" aria-label="Mark done"`}></button><span class="${done?'dnx':''}">${esc(done?c.name:c.name)}</span>${done?'<i class="tg sh">Tap to undo</i>':ov?'<i class="tg od">Overdue</i>':who?`<i class="tg sh">${esc(who.slice(3))}</i>`:''}</div>`}
function choresHtml(z,it){const L=chDue();if(L==null)return`<div class="t"><span>Chores</span></div><div class="shim"></div><div class="shim s2"></div>`;
 const n=L.length,od=L.filter(c=>c.overdue).length,dn=chDone(),open=`<button class="tdp" data-chp="1" aria-label="Open Chores">›</button>`;
 if(z==='xs')return`<div class="t"><span>Chores</span>${open}</div><div class="fx" style="gap:8px"><div class="big" style="font-size:28px">${n}</div><div class="mu" style="line-height:1.15">due today${od?`<br><span class="bad">${od} overdue</span>`:''}</div></div>`;
 const empty=`<div class="emp"><b>All clear</b><span class="mu">${dn.length?dn.length+' done today':'No chores due'}</span></div>`;
 if(z==='s')return`<div class="t"><span>Chores</span>${open}</div>${n?`<div class="tks">${L.slice(0,2).map(c=>chRow(c)).join('')}</div>${n>2?`<div class="mu mor">+${n-2} more</div>`:''}`:empty}`;
 const tab=CH.tab[it&&it.id]||'due';const tabs=`<span class="tabs">${[['due','Due'],['done','Done']].map(([v,l])=>`<button class="${tab===v?'on':''}" data-cht="${v}" data-chi="${esc(it&&it.id||'')}">${l}</button>`).join('')}</span>`;
 const rows=tab==='done'?dn.map(d=>chRow({id:d.id,name:d.name},true)).join('')||'<div class="mu" style="padding:6px 0">Nothing done yet today</div>':(n?L.slice(0,z==='m'?3:40).map(c=>chRow(c)).join(''):empty);
 return`<div class="t">${tabs}<span>${tab==='done'?dn.length+' done':n+' due'}</span></div><div class="tks${z==='l'?' tdl':''}" style="${z==='l'?'max-height:none;flex:1':''}">${rows}</div>`}
async function chComplete(id){const c=(state.chores||[]).find(x=>x.id===id);if(!c||typeof completeChoreFromWidget!=='function')return;const nm=c.name;await completeChoreFromWidget(id,null,()=>{});refresh();toast('Done: '+nm,()=>chUndo(id))}
async function chUndo(id){const c=(state.chores||[]).find(x=>x.id===id);if(!c||!c.undo){toast('Nothing to undo');return}const u=c.undo,keys=['lastCompleted','snoozedUntil','assignedTo','rotationIndex','passedBy'];
 keys.forEach(k=>{c[k]=u[k]});delete c.undo;state.choreHistory=(state.choreHistory||[]).filter(h=>h.id!==u.logId);refresh();
 try{const[lc,lh]=await Promise.all([readJson(appRef('chores','chores'),null),readJson(appRef('chores','history'),null)]);const list=Array.isArray(lc)?lc:state.chores,hist=Array.isArray(lh)?lh:state.choreHistory;const i=list.findIndex(x=>x.id===id);if(i>=0){keys.forEach(k=>{list[i][k]=u[k]});delete list[i].undo}
  await appRef('chores','chores').set({json:JSON.stringify(list)});await appRef('chores','history').set({json:JSON.stringify(hist.filter(h=>h.id!==u.logId))});
  for(const link of(c.links||[])){try{const ref=db.collection('users').doc(state.user.uid).collection('schedule-profiles').doc(link.profile).collection('data').doc('choreLog');const d=await ref.get();const log=(d.exists&&d.data().json)?safeJson(d.data().json,{}):{};delete log[link.scheduleChoreId+':'+u.date];await ref.set({json:JSON.stringify(log)})}catch(e){}}
 }catch(e){toast("Couldn't undo, try again")}}

// ---- Diet widget: same Diet records and pantry tracking as the Diet app; log or skip planned meals, quick add ----
const DT={ld:0,add:false,n:'',k:'',p:''};
const dtOk=()=>{try{return typeof dietLoad==='function'&&typeof dietCommit==='function'&&typeof DietCore!=='undefined'&&typeof dietW!=='undefined'}catch(e){return false}};
function dtKick(){if(!dtOk())return;if(dietW.S&&Date.now()-dietW.t<20000)return;if(DT.ld&&Date.now()-DT.ld<4000)return;DT.ld=Date.now();dietLoad().then(()=>refresh()).catch(()=>{})}
function dtModel(){dtKick();if(!dtOk()||!dietW.S)return null;const D=dietW.S,C=DietCore,pid=state.profile.toLowerCase(),td=today();let dr,t,G;try{dr=C.dayRows(D,pid,td);t=C.totals(D,pid,td);G=C.goals(D,pid)}catch(e){return null}
 const rows=dr.rows.slice().sort((a,b)=>(a.t==null?9999+a.idx:a.t)-(b.t==null?9999+b.idx:b.t));return{D,C,pid,td,rows,extras:dr.extras||[],t,g:G.goals,nx:dietNext(rows,wNow())}}
const dtTm=m=>m==null?'':t12(String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'));
function dtRing(pc,d,txt,sub){const R=18,C=2*Math.PI*R;return`<svg class="plr" width="${d}" height="${d}" viewBox="0 0 44 44"><circle cx="22" cy="22" r="${R}" fill="none" stroke="#ffffff22" stroke-width="4.5"/><circle cx="22" cy="22" r="${R}" fill="none" stroke="${pc>1?'#ff8a8a':'var(--accent)'}" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="${C*Math.min(1,Math.max(0,pc))} ${C}" transform="rotate(-90 22 22)"/><text x="22" y="${sub?20:25}" text-anchor="middle" font-size="9.5" font-weight="700" fill="currentColor">${txt}</text>${sub?`<text x="22" y="29" text-anchor="middle" font-size="5.5" fill="currentColor" opacity=".7">${sub}</text>`:''}</svg>`}
function dtRow(r){const st=r.status;return`<div class="tk"><button class="ck${st==='eaten'?' on':''}" data-dtk="${esc(r.key)}" aria-label="${st==='eaten'?'Unmark':'Ate it'}"></button><span class="${st==='eaten'||st==='skipped'?'dnx':''}">${esc(r.name)}</span><i class="tg sh">${st==='skipped'?'Skipped':dtTm(r.t)||Math.round(r.n.calories)+' kcal'}</i></div>`}
function dietHtml(z,it){const m=dtModel();if(!m)return`<div class="t"><span>Diet</span></div><div class="shim"></div><div class="shim s2"></div>`;
 const{t,g,nx,rows}=m,left=Math.round(g.calories-t.calories),over=left<0,pc=g.calories>0?t.calories/g.calories:0,eaten=rows.filter(r=>r.status==='eaten').length+m.extras.length;
 const eat=nx?`<button class="pbtn ud" data-dta="${esc(nx.key)}" style="flex:none;padding:7px 14px">Ate it</button>`:'';
 if(z==='xs')return`<div class="fx" style="gap:8px">${dtRing(pc,40,Math.abs(left).toLocaleString(),over?'over':'left')}<div class="g1 col"><div style="font-weight:700;font-size:13px;line-height:1.15">${Math.round(t.protein)} / ${Math.round(g.protein)} g</div><div class="mu" style="font-size:10px">protein</div></div></div>`;
 if(z==='s')return`<div class="t"><span>Diet</span><span>${eaten}/${rows.length}</span></div><div class="fx" style="gap:8px">${dtRing(pc,50,Math.abs(left).toLocaleString(),over?'over':'kcal left')}<div class="g1 mu" style="line-height:1.25">P ${Math.round(t.protein)}/${Math.round(g.protein)} g</div></div><div style="margin-top:auto">${nx?`<button class="pbtn ud" data-dta="${esc(nx.key)}" style="width:100%;padding:7px 4px;font-size:12px">Ate ${esc(nx.name.length>12?nx.name.slice(0,11)+'…':nx.name)}</button>`:'<div class="mu" style="text-align:center">All meals done</div>'}</div>`;
 const bar=(v,gl,c)=>`<div class="sbar" style="height:6px;margin:2px 0 6px"><i style="left:0;width:${Math.min(100,gl>0?v/gl*100:0)}%;background:${c}"></i></div>`;
 if(z==='m')return`<div class="t"><span>Diet</span><span>${eaten}/${rows.length} meals</span></div><div class="fx" style="gap:12px">${dtRing(pc,62,Math.abs(left).toLocaleString(),over?'kcal over':'kcal left')}<div class="g1"><div class="mu">Protein ${Math.round(t.protein)} / ${Math.round(g.protein)} g</div>${bar(t.protein,g.protein,'var(--accent)')}<div class="mu">Carbs ${Math.round(t.carbs)} · Fat ${Math.round(t.fat)} g</div></div></div><div class="fx" style="margin-top:auto;gap:10px"><div class="g1"><div style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nx?esc(nx.name):'All meals done'}</div><div class="mu">${nx?(dtTm(nx.t)||'Next')+' · '+Math.round(nx.n.calories)+' kcal':eaten+' logged'}</div></div>${eat}</div>`;
 const form=DT.add?`<div class="tdadd" style="margin-top:6px"><input class="tdi" data-dtn="1" placeholder="Name" value="${esc(DT.n)}" style="flex:2"><input class="tdi" data-dtkc="1" inputmode="numeric" placeholder="kcal" value="${esc(DT.k)}"><input class="tdi" data-dtp="1" inputmode="numeric" placeholder="P g" value="${esc(DT.p)}"><button class="btn sm" data-dtgo="1">Add</button></div>`:'';
 return`<div class="t"><span>Diet</span><span>${eaten}/${rows.length} meals</span></div><div class="fx" style="gap:12px">${dtRing(pc,72,Math.abs(left).toLocaleString(),over?'kcal over':'kcal left')}<div class="g1"><div class="mu">Protein ${Math.round(t.protein)} / ${Math.round(g.protein)} g</div>${bar(t.protein,g.protein,'var(--accent)')}<div class="mu">Carbs ${Math.round(t.carbs)} / ${Math.round(g.carbs)} g</div>${bar(t.carbs,g.carbs,'#8ccbff')}<div class="mu">Fat ${Math.round(t.fat)} / ${Math.round(g.fat)} g</div>${bar(t.fat,g.fat,'#e6a1d1')}</div></div><div class="tks tdl" style="max-height:none;flex:1;margin-top:4px">${rows.map(dtRow).join('')}${m.extras.map(e=>`<div class="tk"><button class="ck on" disabled></button><span class="dnx">${esc(e.name)}</span><i class="tg sh">${Math.round(e.n.calories)} kcal</i></div>`).join('')}</div><div class="fx" style="margin-top:6px;gap:8px">${nx?`<button class="pbtn ud" data-dta="${esc(nx.key)}" style="flex:1">Ate ${esc(nx.name.slice(0,14))}</button>`:''}<button class="pbtn" data-dtq="1" style="flex:none;padding:10px 14px">${DT.add?'Close':'+ Quick add'}</button></div>${form}`}
async function dtSet(key,val){if(!dtOk()||!dietW.S)return;const pid=state.profile.toLowerCase(),date=today(),r=DietCore.dayRows(dietW.S,pid,date).rows.find(x=>x.key===key);if(!r)return;
 if(val==='eaten'&&r.choice&&r.status==='planned'){toast('This meal has choices. Pick it in Diet');openApp('diet',null);return}
 const was=r.status;const res=await dietCommit(D=>DietCore.setStatus(D,pid,date,key,val),null);refresh();
 if(res&&res.changed)toast((val==='eaten'?'Ate ':val==='skipped'?'Skipped ':'Unmarked ')+r.name+(val==='eaten'?' · +'+Math.round(r.n.calories)+' kcal':''),()=>dietCommit(D=>DietCore.setStatus(D,pid,date,key,was),null).then(refresh))}
async function dtQuick(){const n=(DT.n||'').trim(),kc=Number(DT.k);if(!n||!(kc>0)){toast('Add a name and the calories');return}if(!dtOk()||!dietW.S)return;const pid=state.profile.toLowerCase(),date=today();let nid=null;
 const res=await dietCommit(D=>{const r=DietCore.quickAdd(D,pid,date,{name:n,kcal:kc,protein:Number(DT.p)||0,sugar:0,satFat:0});nid=r.id;return r},null);DT.add=false;DT.n=DT.k=DT.p='';refresh();
 if(res&&res.changed)toast('Logged '+n+' · '+Math.round(kc)+' kcal',()=>dietCommit(D=>({changed:DietCore.removeEntry(D,nid),jobs:[]}),null).then(refresh))}

// ---- Banner: the Today banner (greeting, next event, tasks) in the preset's colours ----
function bannerHtml(z,it){try{
 const tl=typeof todaysTimeline==='function'?todaysTimeline():[],tasks=typeof dueTasks==='function'?dueTasks():[];
 const nx=typeof nextUpcoming==='function'?nextUpcoming(tl):null;
 const P=(typeof bannerFind==='function'&&state.bannerTheme&&bannerFind(state.bannerTheme.current))||(typeof bannerPresetsFor==='function'?bannerPresetsFor(state.profile)[0]:null)||{};
 const a=P.accent2||'#e6b866',b1=P.bg||'#2a1a2c',b2=P.bg2||'#150e1a';
 const img=P.carImg||P.image||(P.scene==='porsche'?'assets/banners/porsche-gold.webp':'');
 const nm=nx?(nx.title||'Scheduled')+(nx._tomorrow?' · Tmrw':''):'Clear';
 const hrs=typeof plannedHours==='function'?plannedHours(tl):'0m';
 const sum=tasks.length?tasks.length+' task'+(tasks.length===1?'':'s')+' need you today':'Your priority list is clear';
 const bg=`<div class="bnb" style="background:linear-gradient(135deg,${esc(b1)},${esc(b2)})">${img&&z!=='xs'?`<img src="${esc(img)}" alt="" draggable="false">`:''}</div>`;
 const hi=esc(greeting())+', '+esc(state.profile);
 if(z==='xs')return bg+`<div class="bnx"><div class="bne" style="color:${a}">${tasks.length} task${tasks.length===1?'':'s'}</div><div class="bnh" style="font-size:15px">${esc(state.profile)}</div></div>`;
 if(z==='s')return bg+`<div class="bnx"><div class="bne" style="color:${a}">${esc(formatDate())}</div><div class="bnh">${hi}</div><div class="bns">${esc(sum)}</div></div>`;
 const stats=`<div class="bnst"><div><b>${esc(nm)}</b><i>Next event</i></div><div><b>${tasks.length}</b><i>Tasks</i></div><div><b>${esc(String(hrs))}</b><i>Planned</i></div></div>`;
 return bg+`<div class="bnx"><div class="bne" style="color:${a}">${esc(formatDate())}</div><div class="bnh">${hi}</div><div class="bns">${esc(sum)}</div>${z==='l'?'<div style="flex:1"></div>':''}${stats}</div>`;
}catch(e){return`<div class="t"><span>Banner</span></div><div class="emp"><b>Banner not ready</b></div>`}}
// ---- Recent ticks: the central tick log across your apps ----
const TKL={list:null,ld:0,key:'',busy:0};const TKS={schedule:'Schedule',skin:'Skin',todo:'To-do',chores:'Chores',checklist:'Checklist',pledge:'Pledge',diet:'Diet',water:'Water'};
function tkKick(it){try{if(!window.TickLog||typeof state==='undefined'||!state.user)return;const who=(it&&it.o&&it.o.who)==='mine'?'mine':'both',key=state.profile+'|'+who;if(TKL.key===key&&TKL.list&&Date.now()-TKL.ld<20000)return;if(TKL.busy&&Date.now()-TKL.busy<4000)return;TKL.busy=Date.now();
 const ps=who==='mine'?[state.profile]:['Bhargav','Anusha'];Promise.all(ps.map(p=>window.TickLog.read(p))).then(r=>{let a=[];r.forEach(x=>a=a.concat(x||[]));a.sort((x,y)=>y.t-x.t);TKL.list=a;TKL.key=key;TKL.ld=Date.now();TKL.busy=0;refresh()}).catch(()=>{TKL.busy=0})}catch(e){}}
function tkLabel(e){if(e.l)return e.l;if(e.s==='schedule'){const m=/^\d{4}-\d{2}-\d{2}:(\d+)$/.exec(e.k);try{const b=m&&dayBlocksFor(e.dt);const x=b&&b[Number(m[1])];if(x)return x.activity||x.title}catch(er){}}return'an item'}
function ticksHtml(z,it){tkKick(it);if(!window.TickLog)return`<div class="t"><span>Recent ticks</span></div><div class="emp"><b>Tick log not loaded</b></div>`;if(TKL.list==null)return`<div class="t"><span>Recent ticks</span></div><div class="shim"></div><div class="shim s2"></div>`;
 const un=!(it&&it.o&&it.o.un===false),all=TKL.list.filter(e=>un||e.d===1),T=today(),n=all.filter(e=>e.dt===T&&e.d===1).length;
 const fm=t=>{const d=new Date(t),tm=d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});return d.toDateString()===new Date().toDateString()?tm:d.toLocaleDateString([],{weekday:'short'})+' '+tm};
 if(z==='xs')return`<div class="t"><span>Ticks</span></div><div class="fx" style="gap:8px"><div class="big" style="font-size:28px">${n}</div><div class="mu">today</div></div>`;
 const row=e=>`<div class="tk"><span class="avt">${esc((e.p||'?')[0])}</span><span class="${e.d?'':'dnx'}">${esc(tkLabel(e))}</span><i class="tg sh">${esc(TKS[e.s]||e.s)} · ${esc(fm(e.t))}</i></div>`;
 if(!all.length)return`<div class="t"><span>Recent ticks</span></div><div class="emp"><b>Nothing ticked yet</b></div>`;
 if(z==='s')return`<div class="t"><span>Recent ticks</span><span>${n} today</span></div><div class="tks">${all.slice(0,2).map(row).join('')}</div>`;
 return`<div class="t"><span>Recent ticks</span><span>${n} today</span></div><div class="tks${z==='l'?' tdl':''}" style="${z==='l'?'max-height:none;flex:1':''}">${all.slice(0,z==='m'?3:25).map(row).join('')}</div>`}

// ---- Quick links ----
const QL0=['gym','diet','skin','chores'];
const qlList=it=>{const a=it&&it.o&&Array.isArray(it.o.ql)&&it.o.ql.length?it.o.ql.filter(k=>AP[k]):QL0;return a};
function qlinksHtml(z,it){const L=qlList(it),cap=z==='xs'?2:z==='s'?4:z==='m'?4:8;const tl=L.slice(0,cap).map(k=>`<button class="qk" data-qk="${k}">${tile(k,1)}<span>${esc(AP[k][0])}</span></button>`).join('');
 if(z==='xs')return`<div class="qkg q2">${tl}</div>`;return`<div class="t"><span>Quick links</span></div><div class="qkg ${z==='s'?'q2s':z==='m'?'q4':'q4l'}">${tl}</div>`}

// ---- Notes & lists: tick checklist items and jot notes, same documents as the Notes widget and To-Do app ----
const NT={lists:null,notes:null,ld:0,busy:0,tab:{},pick:{},add:'',nt:''};
const ntOk=()=>{try{return typeof NotesCore!=='undefined'&&typeof nwListsTx==='function'&&typeof appRef==='function'}catch(e){return false}};
function ntKick(){if(!ntOk()||typeof state==='undefined'||!state.user)return;if(NT.lists&&Date.now()-NT.ld<20000)return;if(NT.busy&&Date.now()-NT.busy<4000)return;NT.busy=Date.now();
 Promise.all([appRef('checklist','state').get().catch(()=>null),profileRef('todo-profiles','stickyNotes').get().catch(()=>null)]).then(([a,b])=>{NT.lists=NotesCore.active(a&&a.exists&&a.data().json?NotesCore.parseLists(a.data().json):[],state.profile);NT.notes=NotesCore.live(b&&b.exists&&b.data().json?NotesCore.parseNotes(b.data().json):[]);NT.ld=Date.now();NT.busy=0;refresh()}).catch(()=>{NT.busy=0})}
function ntList(it){const L=NT.lists||[];const w=NT.pick[it&&it.id]||(it&&it.o&&it.o.lid);return L.find(l=>l.id===w)||L.slice().sort((a,b)=>(b.pin?1:0)-(a.pin?1:0)||(b.u||0)-(a.u||0))[0]||null}
function ntRows(l){try{return NotesCore.rows(l).filter(r=>r&&r.it?true:true)}catch(e){return l.items.map(i=>({it:i}))}}
function notesHtml(z,it){ntKick();if(!ntOk()||NT.lists==null)return`<div class="t"><span>Notes</span></div><div class="shim"></div><div class="shim s2"></div>`;
 const l=ntList(it),id=esc(it&&it.id||'');const tab=NT.tab[it&&it.id]||'lists';
 const items=l?l.items.filter(i=>!(i.parent&&l.items.some(x=>x.id===i.parent&&false))):[];const pr=l?NotesCore.prog(l):null;
 const ir=i=>`<div class="tk"><button class="ck${i.done?' on':''}" data-nti="${esc(l.id)}:${esc(i.id)}" aria-label="Toggle"></button><span class="${i.done?'dnx':''}" style="${i.parent?'padding-left:12px':''}">${esc(i.t)}</span></div>`;
 const open=l?items.filter(i=>!i.done):[];
 if(!l&&z!=='l')return`<div class="t"><span>Notes</span></div><div class="emp"><b>No lists yet</b><span class="mu">Make one in Checklists</span></div>`;
 if(z==='xs')return`<div class="t"><span>${esc(l.title.slice(0,14))}</span><span>${pr.d}/${pr.n}</span></div><div class="mu">${open.length?esc(open[0].t):'All done'}</div>`;
 if(z==='s')return`<div class="t"><span>${esc(l.title)}</span><span>${pr.d}/${pr.n}</span></div><div class="tks">${open.slice(0,2).map(ir).join('')||'<div class="mu">All done 🎉</div>'}</div>${open.length>2?`<div class="mu mor">+${open.length-2} more</div>`:''}`;
 if(z==='m')return`<div class="t"><span>${esc(l.title)}</span><span>${pr.d}/${pr.n}</span></div><div class="sbar"><i style="left:0;width:${pr.pct}%;background:var(--accent)"></i></div><div class="tks tdl" style="max-height:none;flex:1;margin-top:4px">${open.slice(0,3).map(ir).join('')||'<div class="mu">All done 🎉</div>'}</div>`;
 const tabs=`<span class="tabs">${[['lists','Lists'],['notes','Notes']].map(([v,t])=>`<button class="${tab===v?'on':''}" data-ntt="${v}" data-nid="${id}">${t}</button>`).join('')}</span>`;
 if(tab==='notes'){const N=(NT.notes||[]).slice().sort((a,b)=>(b.pin?1:0)-(a.pin?1:0)||(b.u||0)-(a.u||0));
  return`<div class="t">${tabs}<span>${N.length} notes</span></div><div class="tdadd"><input class="tdi" data-ntn="1" placeholder="Jot a note" value="${esc(NT.nt)}"><button class="btn sm" data-ntnadd="1">Add</button></div><div class="tks tdl" style="max-height:none;flex:1;margin-top:4px">${N.slice(0,30).map(n=>`<div class="tk"><span>${esc(NotesCore.firstLine(n.text)||'(empty)')}</span>${n.pin?'<i class="tg sh">Pinned</i>':''}</div>`).join('')||'<div class="mu" style="padding:6px 0">No notes yet</div>'}</div>`}
 const chips=(NT.lists||[]).map(x=>`<button class="chp${l&&x.id===l.id?' on':''}" data-ntp="${esc(x.id)}" data-nid="${id}">${esc(x.title.slice(0,16))}</button>`).join('');
 return`<div class="t">${tabs}<span>${pr?pr.d+'/'+pr.n:''}</span></div><div class="fx" style="gap:6px;overflow-x:auto;flex:none;padding-bottom:4px">${chips}</div>${l?`<div class="tks tdl" style="max-height:none;flex:1">${items.slice(0,60).map(ir).join('')||'<div class="mu">Empty list</div>'}</div><div class="tdadd"><input class="tdi" data-nta="1" placeholder="Add an item" value="${esc(NT.add)}"><button class="btn sm" data-ntadd="${esc(l.id)}">Add</button></div>`:'<div class="emp"><b>No lists yet</b></div>'}`}
async function ntToggle(lid,iid){const r=await nwListsTx(ls=>{const l=ls.find(x=>x.id===lid);if(!l||l.gone)return false;const t=NotesCore.toggle(l,iid,state.profile);if(!t)return false;NotesCore.touch(l)});if(r&&r.ok&&!r.skipped){NT.lists=NotesCore.active(nw.lists,state.profile)}else NT.ld=0;refresh()}
async function ntAddItem(lid){const v=(NT.add||'').trim();if(!v)return;const r=await nwListsTx(ls=>{const l=ls.find(x=>x.id===lid);if(!l||!NotesCore.canAdd(l,1))return false;NotesCore.addItems(l,v);NotesCore.touch(l)});NT.add='';if(r&&r.ok&&!r.skipped)NT.lists=NotesCore.active(nw.lists,state.profile);else toast('Could not add that');refresh()}
async function ntAddNote(){const v=(NT.nt||'').trim();if(!v||typeof notesAdd!=='function')return;const r=await notesAdd(v,{quiet:true});NT.nt='';NT.ld=0;ntKick();if(!r||!r.ok)toast('Could not add the note');else toast('Note added')}

// ---- Grocery (read only): what is left for this week's trip, by store, plus budget ----
const GR={d:null,ld:0,busy:0};
function grKick(){try{if(typeof appRef!=='function'||typeof state==='undefined'||!state.user)return;if(GR.d&&Date.now()-GR.ld<30000)return;if(GR.busy&&Date.now()-GR.busy<4000)return;GR.busy=Date.now();appRef('grocery-v4','modernState').get().then(sn=>{GR.d=sn.exists&&sn.data().json?safeJson(sn.data().json,{}):{};GR.ld=Date.now();GR.busy=0;refresh()}).catch(()=>{GR.busy=0})}catch(e){}}
function groceryHtml(z){grKick();if(GR.d==null)return`<div class="t"><span>Grocery</span></div><div class="shim"></div><div class="shim s2"></div>`;
 const g=GR.d,wk=g&&g.weeks&&g.weeks[g.activeWeek];if(!wk||!Array.isArray(wk.items))return`<div class="t"><span>Grocery</span></div><div class="emp"><b>No list yet</b><span class="mu">Open Grocery to plan the week</span></div>`;
 const pn=id=>{const p=(g.products||[]).find(x=>x.id===id);return p};const open=x=>Math.max(0,(x.plannedQty||0)-(x.carriedQty||0)-(x.dismissedQty||0)),rem=x=>Math.max(0,open(x)-(x.purchasedQty||0));
 const left=wk.items.filter(x=>rem(x)>0).map(x=>{const p=x.productId?pn(x.productId):null;return{n:(p&&p.name)||x.name||'Item',store:(p&&p.store)||x.store||'Other',q:rem(x)}});
 const spent=wk.items.reduce((s,x)=>s+(x.purchasedQty||0)*((x.actualPrice!=null?x.actualPrice:x.unitPrice)||0),0),bud=g.budget||0,open2=`<button class="tdp" data-grp="1" aria-label="Open Grocery">›</button>`;
 if(z==='xs')return`<div class="t"><span>Grocery</span>${open2}</div><div class="fx" style="gap:8px"><div class="big" style="font-size:28px">${left.length}</div><div class="mu" style="line-height:1.15">item${left.length===1?'':'s'}<br>to buy</div></div>`;
 const bar=bud>0?`<div class="sbar" style="height:6px;margin:4px 0"><i style="left:0;width:${Math.min(100,spent/bud*100)}%;background:${spent>bud?'#ff8a8a':'var(--accent)'}"></i></div><div class="mu" style="font-size:11px">$${Math.round(spent)} of $${Math.round(bud)} this week</div>`:'';
 if(z==='s')return`<div class="t"><span>Grocery</span>${open2}</div><div class="big" style="font-size:26px">${left.length}</div><div class="mu">to buy this week</div>${bar}`;
 const by={};left.forEach(x=>(by[x.store]=by[x.store]||[]).push(x));
 if(z==='m')return`<div class="t"><span>Grocery</span>${open2}</div><div class="fx" style="gap:14px;align-items:flex-start"><div><div class="big" style="font-size:30px">${left.length}</div><div class="mu">to buy</div></div><div class="g1 mu" style="line-height:1.35">${left.slice(0,3).map(x=>esc(x.n)+(x.q>1?' ×'+x.q:'')).join('<br>')}${left.length>3?'<br>+'+(left.length-3)+' more':''}</div></div>${bar}`;
 return`<div class="t"><span>Grocery</span><span>${left.length} to buy</span></div>${bar}<div class="tks tdl" style="max-height:none;flex:1;margin-top:4px">${Object.keys(by).map(s=>`<div class="mu" style="margin:4px 0 2px;font-weight:700">${esc(s)} · ${by[s].length}</div>`+by[s].map(x=>`<div class="tk"><button class="ck" data-grp="1" aria-label="Open Grocery to tick"></button><span>${esc(x.n)}</span>${x.q>1?`<i class="tg sh">×${x.q}</i>`:''}</div>`).join('')).join('')||'<div class="emp"><b>All bought</b></div>'}</div><div class="mu" style="margin-top:4px;font-size:11px">Tick items off in the Grocery app.</div>`}

// ---- Insights (read only): last 7 finished days, same scoring as the Insights page ----
const IN={mods:null,ld:0,busy:0,key:''};
function inKick(){try{if(typeof ensureInsightsLoaded!=='function'||typeof insBuildMods!=='function'||typeof state==='undefined'||!state.user)return;if(IN.mods&&IN.key===state.profile&&Date.now()-IN.ld<60000)return;if(IN.busy&&Date.now()-IN.busy<6000)return;IN.busy=Date.now();
 ensureInsightsLoaded().then(()=>{try{if(typeof insCur!=='undefined'&&(!insCur||insCur.today!==today()))insCur={today:today(),facts:{},dayCache:{},sel:(insCur&&insCur.sel)||null}}catch(e){}const tdy=today(),days=Array.from({length:7},(_,i)=>addDays(tdy,i-7)),R=v=>v==null?null:(v.frac!=null?v.frac:(v.total?v.done/v.total:null));
  const mods=insBuildMods().filter(m=>m.since&&!(state.insights.prefs.off||[]).includes(m.id)).map(m=>{const per=days.map(d=>{const v=d>=m.since?m.get(d):null;return R(v)});const xs=per.filter(v=>v!=null);return{id:m.id,name:m.name,color:m.color,per,rate:xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null}}).filter(m=>m.rate!=null);
  const overall=days.map((d,i)=>{const x=mods.map(m=>m.per[i]).filter(v=>v!=null);return x.length?x.reduce((a,b)=>a+b,0)/x.length:null});
  IN.mods=mods;IN.days=days;IN.over=overall;IN.key=state.profile;IN.ld=Date.now();IN.busy=0;refresh()}).catch(()=>{IN.busy=0})}catch(e){}}
function insightsHtml(z){inKick();if(IN.mods==null)return`<div class="t"><span>Insights</span></div><div class="shim"></div><div class="shim s2"></div>`;
 const xs=IN.over.filter(v=>v!=null),sc=xs.length?Math.round(xs.reduce((a,b)=>a+b,0)/xs.length*100):null,open=`<button class="tdp" data-inp="1" aria-label="Open Insights">›</button>`;
 if(sc==null)return`<div class="t"><span>Insights</span>${open}</div><div class="emp"><b>No data yet</b><span class="mu">Tick things through the week</span></div>`;
 const spark=(w,h)=>`<div class="isp" style="height:${h}px">${IN.over.map((v,i)=>`<i style="height:${v==null?4:Math.max(6,v*100)}%;opacity:${v==null?.25:1}" title="${IN.days[i]}"></i>`).join('')}</div>`;
 if(z==='xs')return`<div class="t"><span>Week</span>${open}</div><div class="fx" style="gap:8px"><div class="big" style="font-size:28px">${sc}%</div><div class="mu">score</div></div>`;
 if(z==='s')return`<div class="t"><span>Week score</span>${open}</div><div class="big" style="font-size:30px">${sc}%</div>${spark(0,28)}`;
 if(z==='m')return`<div class="t"><span>Last 7 days</span>${open}</div><div class="fx" style="gap:14px;align-items:flex-end"><div><div class="big" style="font-size:34px">${sc}%</div><div class="mu">overall</div></div><div class="g1">${spark(0,46)}</div></div>`;
 return`<div class="t"><span>Last 7 days</span>${open}</div><div class="fx" style="gap:14px;align-items:flex-end"><div><div class="big" style="font-size:36px">${sc}%</div><div class="mu">overall score</div></div><div class="g1">${spark(0,50)}</div></div><div class="tks tdl" style="max-height:none;flex:1;margin-top:8px">${IN.mods.slice().sort((a,b)=>b.rate-a.rate).map(m=>`<div style="margin:3px 0"><div class="fx mu" style="justify-content:space-between"><span>${esc(m.name)}</span><span>${Math.round(m.rate*100)}%</span></div><div class="sbar" style="height:6px;margin:2px 0"><i style="left:0;width:${Math.round(m.rate*100)}%;background:${esc(m.color||'var(--accent)')}"></i></div></div>`).join('')}</div>`}

// ---- Clock: time, next alarm, focus today. Alarms come from the Clock app and can be switched on or off here ----
const CK={al:null,fs:null,goal:0,ld:0,busy:0};
const ckRef=k=>db.collection('users').doc(state.user.uid).collection('clock-profiles').doc(state.profile).collection('data').doc(k);
function ckKick(){try{if(typeof db==='undefined'||typeof state==='undefined'||!state.user)return;if(CK.al&&Date.now()-CK.ld<30000)return;if(CK.busy&&Date.now()-CK.busy<4000)return;CK.busy=Date.now();
 Promise.all([ckRef('alarms').get().catch(()=>null),ckRef('focusSessions').get().catch(()=>null),ckRef('focusGoal').get().catch(()=>null)]).then(([a,f,g])=>{CK.al=a&&a.exists&&a.data().json?safeJson(a.data().json,[]):[];CK.fs=f&&f.exists&&f.data().json?safeJson(f.data().json,[]):[];CK.goal=g&&g.exists&&g.data().value?+g.data().value:0;CK.ld=Date.now();CK.busy=0;refresh()}).catch(()=>{CK.busy=0})}catch(e){}}
function ckNext(){const now=new Date(),nm=now.getHours()*60+now.getMinutes();let best=null;(CK.al||[]).forEach(a=>{if(a.on===false||!/^\d{1,2}:\d{2}$/.test(a.time||''))return;const m=minutes(a.time),days=Array.isArray(a.days)&&a.days.length?a.days:null;for(let d=0;d<8;d++){const dow=(now.getDay()+d)%7;if(days&&!days.includes(dow))continue;if(d===0&&m<=nm)continue;const t=d*1440+m-nm;if(!best||t<best.t)best={t,a};break}});return best}
function clockHtml(z){ckKick();const n=new Date(),tm=n.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}),dt=n.toLocaleDateString([],{weekday:'long',month:'short',day:'numeric'});
 const nx=CK.al?ckNext():null,fm=CK.fs?CK.fs.filter(s=>new Date(s.date).toDateString()===n.toDateString()).reduce((a,s)=>a+(s.minutes||0),0):0;
 const when=nx?(nx.t<60?'in '+nx.t+' min':nx.t<1440?'in '+Math.floor(nx.t/60)+'h '+(nx.t%60)+'m':'tomorrow'):'';
 const open=`<button class="tdp" data-ckp="1" aria-label="Open Clock">›</button>`;
 if(z==='xs')return`<div class="t"><span>Clock</span>${open}</div><div class="big" style="font-size:24px">${esc(tm)}</div>`;
 if(z==='s')return`<div class="t"><span>Clock</span>${open}</div><div class="big" style="font-size:26px">${esc(tm)}</div><div class="mu">${nx?'Alarm '+esc(t12(nx.a.time))+' · '+when:'No alarm set'}</div>`;
 if(z==='m')return`<div class="t"><span>${esc(dt)}</span>${open}</div><div class="fx" style="gap:14px;align-items:flex-end"><div class="big" style="font-size:40px">${esc(tm)}</div><div class="g1 mu">${nx?'⏰ '+esc(t12(nx.a.time))+(nx.a.label?' · '+esc(nx.a.label):'')+'<br>'+when:'No alarm set'}<br>Focus ${fm} min${CK.goal?' / '+CK.goal:''}</div></div>`;
 const al=(CK.al||[]).slice().sort((a,b)=>minutes(a.time)-minutes(b.time));
 return`<div class="t"><span>${esc(dt)}</span>${open}</div><div class="big" style="font-size:46px">${esc(tm)}</div><div class="mu">Focus today ${fm} min${CK.goal?' of '+CK.goal:''}</div><div class="tks tdl" style="max-height:none;flex:1;margin-top:8px">${al.map(a=>`<div class="tk"><button class="ck${a.on===false?'':' on'}" data-cka="${esc(a.id)}" aria-label="Toggle alarm"></button><span class="${a.on===false?'dnx':''}">${esc(t12(a.time))}${a.label?' · '+esc(a.label):''}</span><i class="tg sh">${Array.isArray(a.days)&&a.days.length===7?'Daily':Array.isArray(a.days)&&a.days.length?a.days.map(d=>'SMTWTFS'[d]).join(''):'Once'}</i></div>`).join('')||'<div class="mu">No alarms. Add them in Clock.</div>'}</div>`}
async function ckToggle(id){const a=(CK.al||[]).find(x=>x.id===id);if(!a)return;a.on=a.on===false;refresh();try{const sn=await ckRef('alarms').get(),l=sn.exists&&sn.data().json?safeJson(sn.data().json,[]):CK.al,i=l.findIndex(x=>x.id===id);if(i>=0)l[i].on=a.on;await ckRef('alarms').set({json:JSON.stringify(l)});toast(a.on?'Alarm on':'Alarm off')}catch(e){toast("Couldn't save, try again")}}

// ---- layout engine: free grid positions (c,r), 4 columns x 5 rows ----
let COLS=4,ROWS=5,COLW=74.75,PX=84.75,PY=108,ROWH=98;
const SZ={a:[1,1],f:[1,1],xs:[2,1],s:[2,2],m:[4,2],l:[4,4]};const dims=it=>it.t==='w'?SZ[it.z]:[1,1];
const rc=it=>({c:it.c,r:it.r,w:dims(it)[0],h:dims(it)[1]});
const ov=(a,b)=>a.c<b.c+b.w&&b.c<a.c+a.w&&a.r<b.r+b.h&&b.r<a.r+a.h;
function freeSpot(fixed,w,h,r0){for(let r=r0||0;r+h<=ROWS;r++)for(let c=0;c<=COLS-w;c++){const x={c,r,w,h};if(!fixed.some(f=>ov(x,f)))return{c,r}}for(let r=0;r+h<=ROWS;r++)for(let c=0;c<=COLS-w;c++){const x={c,r,w,h};if(!fixed.some(f=>ov(x,f)))return{c,r}}return null}
function placeIn(items,mover,c,r){const[w,h]=dims(mover);c=Math.max(0,Math.min(COLS-w,c));r=Math.max(0,Math.min(ROWS-h,r));const pos=new Map();pos.set(mover.id,{c,r});const fixed=[{c,r,w,h}];
 const others=items.filter(i=>i.id!==mover.id).sort((a,b)=>a.r-b.r||a.c-b.c);const moving=[];
 for(const o of others){const q=rc(o);if(fixed.some(f=>ov(q,f)))moving.push(o);else{fixed.push(q);pos.set(o.id,{c:o.c,r:o.r})}}
 for(const o of moving){const[ow,oh]=dims(o);const sp=freeSpot(fixed,ow,oh,o.r);if(!sp)return null;pos.set(o.id,sp);fixed.push({c:sp.c,r:sp.r,w:ow,h:oh})}return pos}
function applyPos(items,pos){items.forEach(i=>{const p=pos.get(i.id);if(p){i.c=p.c;i.r=p.r}});placeAll(items)}
function flow(items){const fixed=[];for(const it of items){const[w,h]=dims(it);const sp=freeSpot(fixed,w,h,0)||{c:0,r:0};it.c=sp.c;it.r=sp.r;fixed.push({c:sp.c,r:sp.r,w,h})}}
function addItem(it,pref){const order=[pref!=null&&pref<pages.length?pref:0,...pages.map((_,i)=>i)];const[w,h]=dims(it);for(const pi of order){const fixed=pages[pi].map(rc);const sp=freeSpot(fixed,w,h,0);if(sp){it.c=sp.c;it.r=sp.r;pages[pi].push(it);return pi}}it.c=0;it.r=0;pages.push([it]);return pages.length-1}
const findItem=id=>{for(const p of pages){const i=p.find(x=>x.id===id);if(i)return i}};const pageOf=id=>pages.findIndex(p=>p.some(x=>x.id===id));
function removeItem(id){pages.forEach(p=>{const i=p.findIndex(x=>x.id===id);if(i>=0)p.splice(i,1)})}
const onHome=k=>pages.some(p=>p.some(i=>(i.t==='a'&&i.k===k)||(i.t==='f'&&i.apps.includes(k))))||dock.includes(k);
const mini=k=>`<div class="mt c-${AP[k][1]}"><svg viewBox="0 0 24 24">${P[k]}</svg></div>`;const fTile=f=>`<div class="ft">${f.apps.slice(0,9).map(mini).join('')}${bdg(f.apps.reduce((a,k)=>a+badgeOf(k),0))}</div>`;
// keyed DOM: one element per item, only transforms change when things move
const EL=new Map();
function mkEl(it){const el=document.createElement('div');el.dataset.id=it.id;el.className='it';el.style.setProperty('--jd',(-Math.random()*.27).toFixed(3)+'s');el.style.setProperty('--ja',(.8+Math.random()*.7).toFixed(2)+'deg');el.innerHTML='<div class="in"></div>';EL.set(it.id,el);return el}
function fillEl(it,el){el.className=('it '+(it.t==='w'?it.z:it.t==='f'?'f':'a')+(el.classList.contains('ghost')?' ghost':'')+(el.classList.contains('fldt')?' fldt':'')+(el.classList.contains('fl')?' fl':''));el.dataset.z=it.t==='w'?it.z:'';const n=el.firstChild;
 if(it.t==='a')n.innerHTML=icon(it.k,'<i class="x" data-rm="'+it.id+'">−</i>');
 else if(it.t==='f')n.innerHTML=`<div class="app" data-f="${it.id}">${fTile(it)}<span>${it.name}</span></div><i class="x" data-rm="${it.id}">−</i>`;
 else{const wk=curW(it),stk=it.ws.length>1,an=el._an||'';el._an='';n.innerHTML=`<div class="w${stk?' stk':''} ${an}" data-wk="${wk}"${WG[wk].open?` data-wo="${WG[wk].open}"`:''}>${WG[wk].html(it.z,it)}</div>${stk?`<div class="sdt">${it.ws.map((_,i)=>`<i class="${i===it.si?'on':''}"></i>`).join('')}</div>`:''}<i class="x" data-rm="${it.id}">✕</i><i class="rz" data-rz="${it.id}"></i>`}}
function placeEl(it){const el=EL.get(it.id);if(!el)return;const[w,h]=dims(it);el.style.width=(w*COLW+(w-1)*10)+'px';el.style.height=(h*ROWH+(h-1)*10)+'px';el.style.transform=`translate3d(${it.c*PX}px,${it.r*PY}px,0)`}
function placeAll(items){items.forEach(placeEl)}
function render(){const pgs=$('#pgs');if(pgs.children.length!==pages.length+1){pgs.innerHTML=pages.map((_,i)=>`<div class="pg" data-p="${i}"><div class="g"></div></div>`).join('')+`<div class="pg lib" data-p="${pages.length}"><div class="srch"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg><input id="srch" placeholder="App Library"><span class="cx2" id="cx2">Cancel</span></div><div id="libbody"></div></div>`;drawLib()}
 const ids=new Set();pages.forEach((p,i)=>{const g=pgs.children[i].querySelector('.g');p.forEach(it=>{ids.add(it.id);let el=EL.get(it.id);if(!el){el=mkEl(it);fillEl(it,el)}if(el.parentNode!==g)g.appendChild(el);placeEl(it)})});
 for(const[id,el]of[...EL]){if(!ids.has(id)){el.remove();EL.delete(id)}}
 document.querySelectorAll('#ph .g').forEach(g=>g.style.height=(ROWS*PY)+'px');pgs.style.transform=`translateX(${-cur*100}%)`;drawDock();if(!$('#dots').classList.contains('pg'))setDots(false)}
function drawDock(){$('#dock').innerHTML=dock.map(k=>`<div class="dk">${icon(k,'<i class="x" data-drm="'+k+'">−</i>')}</div>`).join('')+(editing&&dock.length<4?'<div class="dk"><button class="dadd" id="dadd" aria-label="Add to Dock">+</button></div>':'')}
function refresh(){pages.forEach(p=>p.forEach(it=>{let el=EL.get(it.id);if(!el)el=mkEl(it);fillEl(it,el)}));drawDock();if(todayOn)drawToday();afterRender()}
function drawPages(){render();refresh();drawLib($('#srch')&&$('#srch').value)}

let dotT=null;const visIdx=()=>pages.map((_,i)=>i).filter(i=>editing||!pages[i].hid);
const home0=()=>{const i=pages.findIndex(p=>!p.hid);return i<0?0:i};
function step(from,d){let i=from+d;while(i>=0&&i<pages.length&&pages[i].hid&&!editing)i+=d;if(i<0)return pages[from]&&!pages[from].hid||editing?from:home0();return Math.min(pages.length,i)}
function setDots(show){const d=$('#dots');if(show){d.classList.add('pg');d.innerHTML=visIdx().map(i=>`<i data-g="${i}" class="${i===cur?'on':''}${pages[i].hid?' hd':''}"></i>`).join('')+`<i data-g="${pages.length}" class="${cur===pages.length?'on':''}" style="width:7px;height:7px;border-radius:2px"></i>`;d.querySelectorAll('i').forEach(i=>{i.style.background=i.classList.contains('on')?'#fff':'#ffffff55'});clearTimeout(dotT);dotT=setTimeout(()=>setDots(false),editing?4000:1500)}else{d.classList.remove('pg');d.innerHTML=editing?'<span>Pages</span>':'<span><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>Search</span>'}}
function drawLib(q){const body=$('#libbody');if(!body)return;const add=k=>onHome(k)?'':'<i class="ad" data-add="'+k+'">+</i>';const ic=k=>icon(k,add(k));q=(q||'').trim().toLowerCase();
const lib=$('#pgs .pg.lib');const listMode=lib&&lib.classList.contains('sf');
if(listMode||q){const ks=Object.keys(AP).filter(k=>!q||AP[k][0].toLowerCase().includes(q)||AP[k][0].toLowerCase().replace(/[^a-z0-9]/g,'').includes(q.replace(/[^a-z0-9]/g,''))).sort((a,b)=>AP[a][0].localeCompare(AP[b][0]));let last='';body.innerHTML=ks.length?`<div class="al">${ks.map(k=>{const L_=AP[k][0][0].toUpperCase();const h=L_!==last?`<div class="az">${L_}</div>`:'';last=L_;return h+`<div class="rw" data-open="${k}">${tile(k)}<b>${AP[k][0]}</b></div>`}).join('')}</div>`:'<div class="mu" style="text-align:center;margin-top:30px">No apps found</div>';return}
const card=(title,ks)=>{const big=ks.length>4?ks.slice(0,3):ks;const rest=ks.length>4?ks.slice(3):[];return `<div class="cc"><h5>${title}</h5><div class="ci">${big.map(k=>`<div class="it2" style="position:relative">${ic(k)}</div>`).join('')}${rest.length?`<div class="cl" data-cat="${title}">${rest.slice(0,4).map(mini).join('')}</div>`:''}</div></div>`};
const all=Object.keys(AP);const byCat=c=>all.filter(k=>AP[k][1]===c);
body.innerHTML=`<div class="cg">${card('Suggestions',['todo','calendar','schedule','gym'].filter(k=>AP[k]))}${rec.length?card('Recently Used',rec.slice(0,4)):''}${CATS.filter(c=>byCat(c).length).map(c=>card(c,byCat(c))).join('')}</div>`}
let libScroll=0;
function go(i){const lb=document.querySelector('#pgs .pg.lib');if(lb&&cur===pages.length)libScroll=lb.scrollTop;cur=Math.max(0,Math.min(pages.length,i));prefs.last={p:cur,t:Date.now()};try{localStorage.setItem(LS_PREF,JSON.stringify(prefs))}catch(e){}if(cur===pages.length){const si=$('#srch');drawLib(si&&si.value);const lb2=document.querySelector('#pgs .pg.lib');if(lb2)requestAnimationFrame(()=>{lb2.scrollTop=libScroll})}$('#pgs').style.transform=`translateX(${-cur*100}%)`;$('#ph').style.setProperty('--par',(-Math.min(cur,2)*14)+'px');setDots(true)}
// apps / switcher
// apps / switcher (real apps open in the Hub's own app viewer)
const prx=()=>$('#ph').getBoundingClientRect();
const ovl=()=>document.getElementById('app-frame-overlay');
const frameOpen=()=>{const o=ovl();return !!o&&!o.hidden};
function openApp(k,rect){const a=AP[k];if(!a)return;rec=[k,...rec.filter(x=>x!==k)].slice(0,6);prefs.rec=rec;savePrefs();
 if(a[3]){showRouteView(a[3]);return}
 const ph=$('#ph');closeTok++;const ox=(rect?rect.left+rect.width/2:innerWidth/2)+'px',oy=(rect?rect.top+rect.height/2:innerHeight/2)+'px';ph.style.setProperty('--ox',ox);ph.style.setProperty('--oy',oy);document.documentElement.style.setProperty('--zox',ox);document.documentElement.style.setProperty('--zoy',oy);
 ph.classList.add('appopen');view='app';openAppFrame(a[2],a[0])}
function showRouteView(route){$('#ph').classList.add('away');view='route';routeNow=route;showRoute(route)}
let routeNow=null,closeTok=0;
function closeApp(){const ph=$('#ph');ph.classList.remove('appopen');if(view==='route'){ph.classList.remove('away');routeNow=null;try{showRoute('today')}catch(e){}view='home';return}
 if(frameOpen()){const o=ovl(),tok=++closeTok;if(RM.matches)closeAppFrame();else{o.classList.add('phzo');setTimeout(()=>{o.classList.remove('phzo');if(tok===closeTok&&frameOpen())closeAppFrame()},210)}}view='home'}
// ask the open app to handle Back itself (close a sheet, go up a screen); if it doesn't answer, close it
let backWait=null;
function appBack(){const fr=document.getElementById('app-frame-iframe');let handled=false;const on=e=>{if(e.data&&e.data.type==='hub-back-handled')handled=true};window.addEventListener('message',on);
 try{fr.contentWindow.postMessage({type:'hub-back'},'*')}catch(e){}
 clearTimeout(backWait);backWait=setTimeout(()=>{window.removeEventListener('message',on);if(!handled&&view==='app')closeApp()},180)}

function openSwitcher(){closeApp();$('#ph').classList.add('appopen');$('#fo').classList.remove('on');const sw=$('#sw');view='switch';drawSw();sw.classList.add('on')}
function closeSwitcher(){$('#sw').classList.remove('on');$('#ph').classList.remove('appopen');view='home'}
let swOff=0;
function drawSw(){const sw=$('#sw');const n=rec.length;sw.innerHTML=n?`<div class="rail" id="rail">${rec.map((k,i)=>`<div class="card" data-k="${k}"><div class="hd">${tile(k)}<span>${AP[k][0]}</span></div><div class="pv"><div style="display:flex;gap:10px;align-items:center">${tile(k)}<h4 style="margin:0">${AP[k][0]}</h4></div><div class="pvn">Tap to open</div></div><div class="cx" data-x="${k}">✕</div></div>`).join('')}</div><div class="swh">Swipe a card up to close it</div>`:`<div style="position:absolute;top:40%;left:0;right:0;text-align:center;color:#fff9">No recent apps<br><small>Tap anywhere to go home</small></div>`;placeCards()}
function placeCards(){const cs=[...document.querySelectorAll('#rail .card')];const W_=237,gap=14;const start=(innerWidth-W_)/2;cs.forEach((c,i)=>{c.style.left=(start+i*(W_+gap)+swOff)+'px'})}
$('#sw').addEventListener('click',e=>{if(swSup){swSup=false;return}const x=e.target.closest('[data-x]');if(x){rec=rec.filter(k=>k!==x.dataset.x);swOff=Math.max(Math.min(0,swOff),-(rec.length-1)*251);drawSw();return}const c=e.target.closest('.card');if(c){const k=c.dataset.k;closeSwitcher();setTimeout(()=>openApp(k,null),20);return}closeSwitcher()});
let swd=null,swSup=false;
$('#sw').addEventListener('pointerdown',e=>{swSup=false;const c=e.target.closest('.card');swd={x:e.clientX,y:e.clientY,c,ax:null,off0:swOff}});
document.addEventListener('pointermove',e=>{if(!swd)return;const dx=e.clientX-swd.x,dy=e.clientY-swd.y;if(!swd.ax&&Math.hypot(dx,dy)>8)swd.ax=(swd.c&&dy<0&&Math.abs(dy)>Math.abs(dx))?'v':'h';
 if(swd.ax==='v'){swSup=true;swd.c.classList.add('drg');swd.c.style.transform=`translateY(${dy}px)`;swd.c.style.opacity=Math.max(.3,1+dy/500)}
 else if(swd.ax==='h'){swSup=true;swOff=Math.max(-(rec.length-1)*251,Math.min(0+0,swd.off0+dx));placeCards()}});
document.addEventListener('pointerup',e=>{if(!swd)return;const d=swd;swd=null;if(d.ax==='v'){const dy=e.clientY-d.y;d.c.classList.remove('drg');if(dy<-90){d.c.style.transform='translateY(-620px)';d.c.style.opacity=0;const k=d.c.dataset.k;setTimeout(()=>{rec=rec.filter(x=>x!==k);drawSw()},260)}else{d.c.style.transform='';d.c.style.opacity=1}}});
// three-button navigation
function goHome(){closeMenu();closeToday();closeApp();closeSwitcher();closeSearch();$('#sheet').classList.remove('on');if(openF)closeFolder();if(editing)setEdit(false);go(home0());view='home'}
function goBack(){if(menuOpen()){closeMenu();return}if(view==='search'){closeSearch();return}if(todayOn){closeToday();return}if(sheetOpen()){$('#sheet').classList.remove('on');return}if(openF){closeFolder();return}if(view==='search'){closeSearch();return}if(view==='switch'){closeSwitcher();return}if(view==='app'){appBack();return}if(view==='route'){closeApp();return}if(editing){setEdit(false);return}if(cur>0){go(step(cur,-1));return}toast('Nothing to go back to')}
$('#ph-nb').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;closeMenu();const n=b.dataset.n;if(n==='home')goHome();else if(n==='back')goBack();else{if(view==='switch')closeSwitcher();else{if(openF)closeFolder();closeSearch();$('#sheet').classList.remove('on');if(editing)setEdit(false);openSwitcher()}}});
// search
function searchData(q){const out=[];const has=t=>String(t||'').toLowerCase().includes(q);if(!q)return out;
 try{const tasks=(state.personalTasks||[]).concat(state.sharedTasks||[]).filter(t=>!t.done&&has(t.title));tasks.slice(0,4).forEach(t=>out.push({g:'Tasks',k:'todo',t:t.title,s:(t.due?'Due '+t.due:'No due date')+(t.dueTime?' · '+t12(t.dueTime):'')}))}catch(e){}
 try{(state.events||[]).filter(ev=>has(ev.title)).slice(0,4).forEach(ev=>out.push({g:'Events',k:'calendar',t:ev.title,s:(ev.date||ev.startDate||'')+(ev.time?' · '+t12(ev.time):'')}))}catch(e){}
 try{(state.chores||[]).filter(c=>c.active!==false&&has(c.name||c.title)).slice(0,3).forEach(c=>out.push({g:'Chores',k:'chores',t:c.name||c.title,s:'Chore'}))}catch(e){}
 if('water'.includes(q)||'drink'.includes(q)){try{if(WS())out.push({g:'Health',k:'gym',t:'Water today',s:bigAmt(wTotal())+' of '+bigAmt(wGoalMl())})}catch(e){}}
 return out}
function openSearch(){const s=$('#sp');s.innerHTML=`<div class="f"><svg class="s" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg><input id="si" placeholder="Search apps, tasks, events"><span class="mu" id="sc" style="cursor:pointer">Cancel</span></div><div class="res" id="sres"></div>`;
 const row=(k,t,sub)=>`<div class="rw" data-k="${k}">${tile(k)}<div><b>${esc(t)}</b><small>${esc(sub)}</small></div></div>`;
 const f=q=>{q=(q||'').trim().toLowerCase();let h='';
  if(!q){const due=(taskList(false)||[]).slice(0,3);h+=`<div class="sg">Suggestions</div>`+['todo','calendar','schedule'].filter(k=>AP[k]).map(k=>row(k,AP[k][0],AP[k][1])).join('');if(due.length)h+=`<div class="sg">Due today</div>`+due.map(t=>row('todo',t.title,t.dueTime?t12(t.dueTime):'To-Do')).join('')}
  else{const nq=q.replace(/[^a-z0-9]/g,'');const apps=Object.keys(AP).filter(k=>AP[k][0].toLowerCase().includes(q)||(nq&&(AP[k][0].toLowerCase().replace(/[^a-z0-9]/g,'').includes(nq)||k.includes(nq))));if(apps.length)h+=`<div class="sg">Apps</div>`+apps.map(k=>row(k,AP[k][0],AP[k][1])).join('');
   const dat=searchData(q);const gs=[...new Set(dat.map(x=>x.g))];gs.forEach(g=>{h+=`<div class="sg">${g}</div>`+dat.filter(x=>x.g===g).map(x=>row(x.k,x.t,x.s)).join('')});
   if(!h)h='<div class="mu" style="padding:14px 6px">No results</div>'}
  $('#sres').innerHTML=h};
 f('');s.classList.add('on');view='search';$('#si').oninput=e=>f(e.target.value);$('#sc').onclick=closeSearch;$('#sres').onclick=e=>{const r=e.target.closest('.rw');if(r){closeSearch();closeToday();openApp(r.dataset.k,null)}};setTimeout(()=>$('#si').focus(),50)}
function closeSearch(){$('#sp').classList.remove('on');view='home'}
// folders
let openF=null;
function openFolder(id,rect){const f=findF(id);if(!f)return;openF=id;fpg=0;const pr=prx();const fo=$('#fo');fo.classList.add('on');$('#ph').classList.add('fopen');drawFolder(rect?{x:rect.left+rect.width/2-pr.left,y:rect.top-pr.top}:null);}
function findF(id){for(const p of pages){const f=p.find(x=>x.id===id&&x.t==='f');if(f)return f}}
let fpg=0;
function drawFolder(o){const f=findF(openF);if(!f){closeFolder();return}const chunks=[];for(let i=0;i<f.apps.length;i+=9)chunks.push(f.apps.slice(i,i+9));if(fpg>=chunks.length)fpg=Math.max(0,chunks.length-1);const fo=$('#fo');fo.innerHTML=`<div class="fwrap" ${o?`style="--ox:${o.x-18}px;--oy:${o.y-118}px"`:''}><input class="fn" id="fn" value="${f.name.replace(/"/g,'&quot;')}" maxlength="22"><div class="fp" id="fp"><div class="fsc" id="fsc">${chunks.map(c=>`<div class="fg">${c.map(k=>`<div class="it" data-fk="${k}"><div class="app" data-k="${k}">${tile(k,1)}<span>${AP[k][0]}</span></div><i class="x" data-frm="${k}">−</i></div>`).join('')}</div>`).join('')}</div>${chunks.length>1?`<div class="fpd" id="fpd">${chunks.map((_,i)=>`<i data-fpg="${i}" class="${i===fpg?'on':''}"></i>`).join('')}</div>`:''}</div></div>`;const sc=$('#fsc');if(sc){sc.scrollLeft=fpg*sc.clientWidth;sc.onscroll=()=>{const i=Math.round(sc.scrollLeft/Math.max(1,sc.clientWidth));if(i!==fpg){fpg=i;[...document.querySelectorAll('#fpd i')].forEach((d,j)=>d.classList.toggle('on',j===i))}}}$('#fn').oninput=e=>{f.name=e.target.value||'Folder'};$('#fn').onchange=()=>refresh();$('#fn').onblur=()=>refresh()}
function closeFolder(){persist();openF=null;$('#ph').classList.remove('fopen');$('#fo').classList.remove('on');render();refresh()}
$('#fo').addEventListener('click',e=>{if(e.target.id==='fo'){closeFolder();return}
 const pg=e.target.closest('[data-fpg]');if(pg){const sc=$('#fsc');fpg=+pg.dataset.fpg;sc.scrollTo({left:fpg*sc.clientWidth,behavior:'smooth'});[...document.querySelectorAll('#fpd i')].forEach((d,j)=>d.classList.toggle('on',j===fpg));return}
 const fr=e.target.closest('[data-frm]');if(fr){const f=findF(openF);const k=fr.dataset.frm;f.apps=f.apps.filter(a=>a!==k);dissolveIfSmall(f);toast(AP[k][0]+' moved to Library');if(!findF(openF))closeFolder();else drawFolder();render();refresh();return}
 if(editing||suppress)return;const ap=e.target.closest('.app[data-k]');if(ap){const r=ap.querySelector('.tile').getBoundingClientRect();const k=ap.dataset.k;closeFolder();openApp(k,r)}});
function dissolveIfSmall(f){if(f.apps.length>1)return;for(const p of pages){const i=p.findIndex(x=>x.id===f.id);if(i>=0){const na=f.apps.length===1?A(f.apps[0]):null;if(na){na.c=f.c;na.r=f.r;p.splice(i,1,na)}else p.splice(i,1);break}}}
// ---- Today panel (swipe right from the first page) ----
let todayOn=false;
function tdCard(k,z,o){const it={ws:[k],si:0,z,o:o||{}};return `<div class="tdw"><div class="w" data-wk="${k}"${WG[k].open?` data-wo="${WG[k].open}"`:''}>${WG[k].html(z,it)}</div></div>`}
function drawToday(){const t=$('#td');if(!t)return;let g='',d='';try{g=greeting();d=formatDate()}catch(e){}
 const sp=t.querySelector('.tdb');const keep=sp?sp.scrollTop:0;
 t.innerHTML=`<div class="tdh"><div><small>${esc(d)}</small><b>${esc(g)}</b></div><button class="tdx" id="tdx">Close</button></div><div class="tdb" id="tdb"><div class="srch tds" id="tds"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg><span>Search</span></div>${tdCard('next','m')}${tdCard('tasks','l')}${tdCard('water','m')}</div>`;
 const nb=t.querySelector('.tdb');if(nb)nb.scrollTop=keep}
function openToday(){if(todayOn||editing||view!=='home')return;closeMenu();todayOn=true;drawToday();const t=$('#td');t.style.transition='';t.style.transform='';t.classList.add('on');$('#ph').classList.add('tdopen');view='home'}
function closeToday(){if(!todayOn)return;todayOn=false;const t=$('#td');t.style.transition='';t.style.transform='';t.classList.remove('on','pk');$('#ph').classList.remove('tdopen')}
$('#td').addEventListener('click',e=>{if(suppress)return;if(e.target.closest('#tdx')){closeToday();return}if(e.target.closest('#tds')){openSearch();return}
 const b=e.target.closest('button');if(b){wClick(b);return}
 const wo=e.target.closest('.w[data-wo]');if(wo&&!e.target.closest('[data-d]')){closeToday();openApp(wo.dataset.wo,wo.getBoundingClientRect())}});
let tdg=null;
$('#td').addEventListener('pointerdown',e=>{tdg={x:e.clientX,y:e.clientY,on:false,v:false}});
document.addEventListener('pointermove',e=>{if(!tdg||!todayOn)return;const dx=e.clientX-tdg.x,dy=e.clientY-tdg.y;if(!tdg.on&&!tdg.v&&Math.hypot(dx,dy)>12){if(Math.abs(dx)>Math.abs(dy)&&dx<0)tdg.on=true;else tdg.v=true}
 if(tdg.on){const t=$('#td');t.style.transition='none';t.style.transform=`translateX(${Math.min(0,dx)}px)`}});
document.addEventListener('pointerup',e=>{if(!tdg)return;const g=tdg;tdg=null;if(!todayOn)return;if(g.on){suppress=true;const dx=e.clientX-g.x;const t=$('#td');t.style.transition='';if(dx<-innerWidth*.3)closeToday();else t.style.transform=''}});
// ---- undo snapshots ----
const snap=()=>JSON.stringify(serialize());
function restore(j){try{const d=JSON.parse(j);if(editing&&false)return;hydrate(d);if(cur>pages.length)cur=pages.length;$('#pgs').innerHTML='';render();refresh();drawLib();go(Math.min(cur,pages.length));persist()}catch(err){}}
document.addEventListener('click',e=>{const u=e.target.closest('#to [data-undo]');if(u&&undoFn){const f=undoFn;undoFn=null;$('#to').classList.remove('on');f()}},true);
// ---- long-press context menu ----
let menuInfo=null;const menuOpen=()=>$('#cm').classList.contains('on');
function closeMenu(){const m=$('#cm');if(!m||!m.classList.contains('on'))return;m.classList.remove('on');m.innerHTML='';menuInfo=null}
function showMenu(t){closeMenu();const pr=prx(),r=t.el.getBoundingClientRect();const it=t.id!=null?findItem(t.id):null;let items=[],clone='';
 if(t.kind==='w'&&it){const k=curW(it),st=it.ws.length>1;items=[[st?'Edit Stack':'Edit Widget','set'],...(WG[k].open?[['Open '+AP[WG[k].open][0],'openw']]:[]),['Edit Home Screen','edit'],[st?'Remove Stack':'Remove Widget','rm','red']];clone=t.el.querySelector('.w').outerHTML}
 else if(t.kind==='f'&&it){items=[['Rename','ren'],['Edit Home Screen','edit'],['Remove Folder','rm','red']];clone=t.el.outerHTML}
 else if(t.kind==='a'&&it){items=[['Open','open'],['Edit Home Screen','edit'],['Remove from Home Screen','rm','red']];clone=t.el.outerHTML}
 else if(t.kind==='d'){items=[['Open','open'],['Edit Home Screen','edit'],['Remove from Dock','rmd','red']];clone=t.el.outerHTML}
 else if(t.kind==='l'){const on=onHome(t.k);items=[['Open','open'],...(on?[]:[['Add to Home Screen','addh']])];clone=t.el.outerHTML}
 else return;
 menuInfo=Object.assign({},t,{items});const m=$('#cm');const pw=Math.min(232,pr.width-24);
 m.innerHTML=`<div class="cmlift ${t.kind==='w'?'wd':''}" style="left:${r.left-pr.left}px;top:${r.top-pr.top}px;width:${r.width}px;height:${r.height}px">${clone}</div><div class="cmp" id="cmp" style="width:${pw}px">${items.map(([l,a,c])=>`<button data-ma="${a}" class="${c||''}">${l}</button>`).join('')}</div>`;
 m.classList.add('on');const cp=$('#cmp'),ph=cp.offsetHeight;let top=r.bottom-pr.top+10;if(top+ph>pr.height-90)top=Math.max(60,r.top-pr.top-ph-10);let left=r.left-pr.left+(t.kind==='w'?0:r.width/2-pw/2);left=Math.max(12,Math.min(pr.width-pw-12,left));cp.style.top=top+'px';cp.style.left=left+'px'}
$('#cm').addEventListener('click',e=>{const b=e.target.closest('[data-ma]');if(!b){closeMenu();return}const t=menuInfo;if(!t)return;const a=b.dataset.ma;const rect=t.el.getBoundingClientRect();closeMenu();
 if(a==='edit'){setEdit(true);return}
 if(a==='set'){openSet(t.id);return}
 if(a==='openw'){const it=findItem(t.id);if(it)openApp(WG[curW(it)].open,rect);return}
 if(a==='open'){openApp(t.k,t.el.querySelector('.tile')?t.el.querySelector('.tile').getBoundingClientRect():rect);return}
 if(a==='rm'){const it=findItem(t.id);const sn=snap();const msg=it&&it.t==='f'?'Folder removed · apps are in the Library':it&&it.t==='w'?(it.ws.length>1?'Widget stack removed':'Widget removed'):'Removed from Home Screen';const el=EL.get(t.id);if(el)el.classList.add('rmv');setTimeout(()=>{removeItem(t.id);render();refresh();persist()},170);toast(msg,()=>restore(sn));return}
 if(a==='rmd'){const sn=snap();dock=dock.filter(x=>x!==t.k);drawDock();persist();toast(AP[t.k][0]+' removed from the Dock',()=>restore(sn));return}
 if(a==='ren'){const f=findF(t.id);if(!f)return;openFolder(f.id,rect);setTimeout(()=>{const i=$('#fn');i&&(i.focus(),i.select())},120);return}
 if(a==='addh'){const sn=snap();const pi=addItem(A(t.k),cur<pages.length?cur:0);render();refresh();drawLib($('#srch')&&$('#srch').value);persist();toast(AP[t.k][0]+' added to page '+(pi+1),()=>restore(sn));return}});
// ---- dock picker + page manager ----
function openDockPicker(){const ks=Object.keys(AP).filter(k=>!dock.includes(k));$('#shi').innerHTML=`<div class="grab"></div><h3>Add to Dock</h3><div class="mu">The Dock holds up to 4 apps.</div><div class="sr" style="margin-top:14px">${ks.map(k=>`<div class="it" style="position:relative"><div class="app" data-dk="${k}">${tile(k)}<span>${AP[k][0]}</span></div></div>`).join('')}</div><button class="dn" id="dn">Close</button>`;$('#sheet').classList.add('on')}
const thumb=p=>`<div class="thm">${p.map(it=>{const[w,h]=dims(it);return `<i class="th ${it.t}" style="left:${it.c*25}%;top:${it.r/ROWS*100}%;width:${w*25}%;height:${h/ROWS*100}%"></i>`}).join('')}</div>`;
function openPages(){$('#shi').innerHTML=`<div class="grab"></div><h3>Pages</h3><div class="mu">Hide pages you do not use. They stay saved and you can show them again here.</div><div class="pmg">${pages.map((p,i)=>`<div class="pmc ${p.hid?'h':''}"><div class="pth">${thumb(p)}${p.hid?'<span class="hdn">Hidden</span>':''}</div><div class="pmr"><button data-pm="mv:${i}:-1" ${i===0?'disabled':''} aria-label="Move left">‹</button><b>${i+1}</b><button data-pm="mv:${i}:1" ${i===pages.length-1?'disabled':''} aria-label="Move right">›</button></div><div class="pmr"><button data-pm="hid:${i}">${p.hid?'Show':'Hide'}</button><button data-pm="del:${i}" class="rd">Delete</button></div></div>`).join('')}<div class="pmc add"><button data-pm="add">+ New page</button></div></div><button class="dn" id="dn">Done</button>`;$('#sheet').classList.add('on')}
function pagesChanged(){$('#pgs').innerHTML='';render();refresh();drawLib();cur=Math.max(0,Math.min(cur,pages.length));go(cur);persist();openPages()}
function pageOp(op){const[a,i0,d0]=op.split(':');const i=+i0;
 if(a==='add'){pages.push([]);pagesChanged();toast('New page added · empty pages go away when you tap Done');return}
 if(a==='hid'){const p=pages[i];if(!p)return;if(!p.hid&&pages.filter(x=>!x.hid).length<2){toast('Keep at least one page visible');return}p.hid=!p.hid;if(p.hid&&cur===i){cur=home0()}pagesChanged();return}
 if(a==='mv'){const j=i+ +d0;if(!pages[j])return;[pages[i],pages[j]]=[pages[j],pages[i]];if(cur===i)cur=j;else if(cur===j)cur=i;pagesChanged();return}
 if(a==='del'){if(pages.length<2){toast('You need at least one page');return}if(!pages[i].hid&&pages.filter(x=>!x.hid).length<2){toast('Keep at least one page visible');return}const sn=snap();pages.splice(i,1);if(!pages.some(x=>!x.hid))pages[0].hid=false;cur=Math.min(cur,pages.length-1);pagesChanged();toast('Page deleted · apps are still in the Library',()=>{restore(sn);if(sheetOpen())openPages()})}}
// edit + pointer
function setEdit(on){editing=on;closeMenu();$('#ph').classList.toggle('edit',on);if(!on){const before=pages.length;pages=pages.filter((p,i)=>p.length||pages.length===1);if(!pages.some(p=>!p.hid))pages[0].hid=false;if(pages.length!==before){cur=Math.min(cur,pages.length-1);$('#pgs').innerHTML='';render();refresh()}if(cur<pages.length&&pages[cur].hid)go(home0());toast('Layout saved');persist()}drawDock();setDots(false)}
$('#edb').onclick=()=>setEdit(false);
let lpt=null,lpe=null,pos0=null,drag=null,sw=null,suppress=false,raf=0,lastE=null;
const sheetOpen=()=>$('#sheet').classList.contains('on');
const gridRect=p=>document.querySelector(`.pg[data-p="${p}"] .g`).getBoundingClientRect();
$('#ph').addEventListener('pointerdown',e=>{if(menuOpen()||sheetOpen()||view!=='home'&&!openF)return;if(e.target.closest('input,.x,.ad,#ph-nb,.st button,.dadd'))return;pos0={x:e.clientX,y:e.clientY};
 const dka=e.target.closest('#dock .app[data-k]');if(editing&&dka){drag={mode:'dock',k:dka.dataset.k,el:dka,x0:e.clientX,y0:e.clientY,started:false};return}
 const inFo=e.target.closest('#fo');const rz=e.target.closest('.rz');
 if(editing&&rz&&!inFo){const id=+rz.dataset.rz;drag={mode:'size',id,x0:e.clientX,y0:e.clientY,started:true,page:pageOf(id)};e.preventDefault();return}
 const it=e.target.closest(inFo?'.it[data-fk]':'#vp .it[data-id]');
 if(editing&&it&&(inFo||e.target.closest('#vp'))){drag={mode:'move',id:inFo?null:+it.dataset.id,fromF:inFo?openF:null,k:inFo?it.dataset.fk:null,el:it,x0:e.clientX,y0:e.clientY,started:false,page:inFo?cur:pageOf(+it.dataset.id)};return}
 if(!editing&&!inFo&&(e.target.closest('#vp')||dka)){const w=e.target.closest('.it.xs,.it.s,.it.m,.it.l');const tel=e.target.closest('#vp .it[data-id]');if(tel&&!w){tel.classList.add('hold');lpe=tel}
  let tg=null;if(dka)tg={kind:'d',k:dka.dataset.k,el:dka};else if(w&&tel)tg={kind:'w',id:+tel.dataset.id,el:tel};else if(tel){const itm=findItem(+tel.dataset.id);if(itm)tg={kind:itm.t,id:itm.id,k:itm.k,el:tel.querySelector('.app')||tel}}else{const la=e.target.closest('#libbody .app[data-k]');if(la)tg={kind:'l',k:la.dataset.k,el:la}}
  lpt=setTimeout(()=>{lpt=null;suppress=true;if(lpe){lpe.classList.remove('hold');lpe=null}if(tg)showMenu(tg);else{setEdit(true);if(navigator.vibrate)navigator.vibrate(15)}},560);if(dka)return;const sit=w&&tel?findItem(+tel.dataset.id):null;sw={x:e.clientX,y:e.clientY,on:false,dn:false,sv:false,stk:sit&&sit.ws&&sit.ws.length>1?sit.id:null}}});
const clr=()=>{if(lpt){clearTimeout(lpt);lpt=null}if(lpe){lpe.classList.remove('hold');lpe=null}};
function startMove(d,e){d.started=true;const r=d.el.getBoundingClientRect();d.ox=d.x0-r.left;d.oy=d.y0-r.top;if(d.mode==='dock'){d.cl=document.createElement('div');d.cl.className='it fl dkc';d.cl.innerHTML='<div class="in">'+d.el.outerHTML+'</div>';d.el.classList.add('dgh')}else{d.cl=d.el.cloneNode(true);d.cl.classList.add('fl')}d.cl.style.width=r.width+'px';d.cl.style.height=r.height+'px';d.cl.style.transition='none';$('#ph').appendChild(d.cl);if(d.id!=null)d.el.classList.add('ghost');if(navigator.vibrate)navigator.vibrate(8)}
function moveClone(d,e){const pr=$('#ph').getBoundingClientRect();d.cl.style.transform=`translate3d(${e.clientX-pr.left-d.ox}px,${e.clientY-pr.top-d.oy}px,0) scale(1.07)`}
function dragStep(){raf=0;const e=lastE;if(!e||!drag)return;const d=drag;
 if(d.mode==='size'){const it=findItem(d.id);if(!it)return;const pi=pageOf(d.id),gr=gridRect(pi);const wc=Math.max(1,Math.min(4,Math.round((e.clientX-gr.left-it.c*PX+10)/PX))),hc=Math.max(1,Math.round((e.clientY-gr.top-it.r*PY+10)/PY));const z=wc<=2?(hc<=1?'xs':'s'):(hc<=2?'m':'l');
  if(z!==it.z){const old=it.z;it.z=z;const pos=placeIn(pages[pi],it,it.c,it.r);if(pos){applyPos(pages[pi],pos);const el=EL.get(it.id);el.className='it '+z;el.dataset.z=z;fillEl(it,el);if(navigator.vibrate)navigator.vibrate(6)}else{it.z=old;if(d.noroom!==z){d.noroom=z;toast('Not enough room on this page')}}}return}
 if(!d.started){if(Math.hypot(e.clientX-d.x0,e.clientY-d.y0)<6)return;startMove(d,e)}
 moveClone(d,e);const pr=$('#ph').getBoundingClientRect();
 if(d.mode==='dock'){$('#dock').classList.toggle('dtg',overDock(e));return}
 if(d.fromF){const fp=$('#fp');const r=fp&&fp.getBoundingClientRect();const out=r&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);
  if(out&&cur<pages.length){const f=findF(d.fromF);const na=A(d.k);const gr=gridRect(cur);const c=Math.round((e.clientX-d.ox-gr.left)/PX),rr=Math.round((e.clientY-d.oy-gr.top)/PY);const items=pages[cur];items.push(na);na.c=0;na.r=0;const pos=placeIn(items,na,c,rr);if(!pos){items.pop();toast('That page is full');return}applyPos(items,pos);f.apps=f.apps.filter(a=>a!==d.k);dissolveIfSmall(f);closeFolder();render();refresh();d.fromF=null;d.id=na.id;d.el=EL.get(na.id);d.el.classList.add('ghost');d.page=cur;d.key=null}
  return}
 // edge page flip
 const rel=e.clientX-pr.left;const edge=rel<28?-1:rel>innerWidth-28?1:0;if(edge!==d.edge){clearTimeout(d.et);d.et=null;d.edge=edge}
 if(edge&&!d.et){d.et=setTimeout(()=>{d.et=null;if(d.edge!==edge)return;const to=cur+edge;if(to<0)return;if(to>=pages.length){if(cur===pages.length-1&&edge===1&&pages[cur].length){pages.push([]);render()}else return}
  const it=findItem(d.id);const from=pageOf(d.id);const dest=pages[to];dest.push(it);it.c=0;it.r=0;const gr=gridRect(to);const pos=placeIn(dest,it,0,0)||new Map([[it.id,{c:0,r:0}]]);{const fa=pages[from],ix=fa.findIndex(x=>x.id===it.id);if(ix>=0)fa.splice(ix,1)}applyPos(dest,pos);render();go(to);d.page=to;d.key=null;d.el=EL.get(it.id);d.el.classList.add('ghost')},560)}
 const it=findItem(d.id);if(!it)return;const pi=pageOf(d.id);if(pi<0||pi!==cur)return;const items=pages[pi],gr=gridRect(pi);
 const cc=Math.floor((e.clientX-gr.left)/PX),rr=Math.floor((e.clientY-gr.top)/PY);const tg=items.find(o=>o.id!==it.id&&o.t!=='w'&&o.c===cc&&o.r===rr);
 let near=false;if(tg&&it.t==='a'){const cx=gr.left+tg.c*PX+COLW/2,cy=gr.top+tg.r*PY+30;near=Math.hypot(e.clientX-cx,e.clientY-cy)<34}
 if(near){clearTimeout(d.rt);d.pend=null;d.pk=null;if(d.ftid!==tg.id){clearTimeout(d.ft);if(d.fold){const o=EL.get(d.fold);o&&o.classList.remove('fldt')}d.fold=null;d.ftid=tg.id;d.ft=setTimeout(()=>{d.fold=tg.id;EL.get(tg.id)&&EL.get(tg.id).classList.add('fldt')},520)}return}
 if(d.ftid){clearTimeout(d.ft);if(d.fold){const o=EL.get(d.fold);o&&o.classList.remove('fldt')}d.fold=null;d.ftid=null}
 const c=Math.round((e.clientX-d.ox-gr.left)/PX),r=Math.round((e.clientY-d.oy-gr.top)/PY);const key=c+','+r;if(key===d.key||key===d.pk)return;d.pk=key;d.pend={c,r,pi};clearTimeout(d.rt);d.rt=setTimeout(()=>{flushPend(d)},tg&&it.t==='a'?420:150)}
function flushPend(d){if(!d.pend)return;const{c,r,pi}=d.pend;d.pend=null;const it=findItem(d.id);if(!it||pageOf(d.id)!==pi)return;const items=pages[pi];const pos=placeIn(items,it,c,r);if(pos){applyPos(items,pos);d.key=c+','+r}}
document.addEventListener('pointermove',e=>{if(pos0&&Math.hypot(e.clientX-pos0.x,e.clientY-pos0.y)>8)clr();
 if(drag){lastE=e;if(!raf)raf=requestAnimationFrame(dragStep);return}
 if(sw&&!editing&&view==='home'){const dx=e.clientX-sw.x,dy=e.clientY-sw.y;if(!sw.on&&!sw.dn&&Math.hypot(dx,dy)>12){if(Math.abs(dx)>Math.abs(dy))sw.on=true;else if(sw.stk!=null)sw.sv=true;else if(dy>0)sw.dn=true}if(sw.on&&dx>0&&cur===home0()&&!sw.pg){if(!sw.td){sw.td=true;drawToday();const t=$('#td');t.classList.add('on','pk');t.style.transition='none'}const t=$('#td');t.style.transform=`translateX(${-innerWidth+Math.min(innerWidth,dx)}px)`;sw.hist=sw.hist||[];sw.hist.push([performance.now(),e.clientX]);if(sw.hist.length>6)sw.hist.shift();return}
 if(sw.on){sw.pg=true;$('#pgs').classList.add('nt');let x=dx;const last=pages.length;if((cur===0&&dx>0)||(cur===last&&dx<0))x=dx*.32;sw.hist=sw.hist||[];sw.hist.push([performance.now(),e.clientX]);if(sw.hist.length>6)sw.hist.shift();$('#pgs').style.transform=`translateX(calc(${-cur*100}% + ${x}px))`}}});
document.addEventListener('pointerup',e=>{clr();
 if(drag){const d=drag;drag=null;if(raf){cancelAnimationFrame(raf);raf=0}clearTimeout(d.et);clearTimeout(d.ft);$('#fo').style.opacity=1;
  if(d.mode==='size'){suppress=true;render();return}
  if(d.mode==='dock'){suppress=true;d.cl&&d.cl.remove();document.querySelectorAll('#dock .dgh').forEach(x=>x.classList.remove('dgh'));if(d.started)dockDrop(d,e);return}
  if(d.started){suppress=true;d.cl&&d.cl.remove();if(d.el)d.el.classList.remove('ghost');document.querySelectorAll('.fldt').forEach(x=>x.classList.remove('fldt'));
   clearTimeout(d.rt);$('#dock').classList.remove('dtg');{const itm=d.id!=null?findItem(d.id):null;if(itm&&itm.t==='a'&&overDock(e)){if(dock.includes(itm.k)){toast('Already in the Dock')}else if(dock.length>=4){toast('The Dock is full')}else{const sn=snap();removeItem(itm.id);dock.splice(dockIdx(e.clientX),0,itm.k);render();refresh();persist();toast(AP[itm.k][0]+' added to the Dock',()=>restore(sn));return}}}if(!d.fold)flushPend(d);if(d.fold&&d.id!=null){const src=findItem(d.id),tgt=findItem(d.fold);if(src&&tgt&&src.t==='a'){removeItem(src.id);combine(src.k,tgt);return}}
   if(d.fromF){drawFolder();return}
   render();refresh();{const e2=d.id!=null?EL.get(d.id):null;if(e2){e2.classList.add('settle');setTimeout(()=>e2.classList.remove('settle'),420)}}}
  return}
 if(sw){const dx=e.clientX-sw.x,dy=e.clientY-sw.y;$('#pgs').classList.remove('nt');if(sw.on&&sw.td){suppress=true;let v=0;if(sw.hist&&sw.hist.length>1){const a=sw.hist[0],b=sw.hist[sw.hist.length-1];v=(b[1]-a[1])/Math.max(1,b[0]-a[0])}const t=$('#td');t.style.transition='';if(sw.pg)go(cur);if(dx>innerWidth*.3||v>.45){todayOn=true;t.classList.remove('pk');t.style.transform='';$('#ph').classList.add('tdopen')}else{t.style.transform='translateX(-100%)';setTimeout(()=>{if(!todayOn){t.classList.remove('on','pk');t.style.transform=''}},380)}}else if(sw.on){suppress=true;let v=0;if(sw.hist&&sw.hist.length>1){const a=sw.hist[0],b=sw.hist[sw.hist.length-1];v=(b[1]-a[1])/Math.max(1,b[0]-a[0])}const wpx=innerWidth;if(Math.abs(dx)>wpx*.35||Math.abs(v)>.45)go(step(cur,(Math.abs(v)>.45?v:dx)<0?1:-1));else go(cur)}else if(sw.sv){suppress=true;if(Math.abs(dy)>28)cycle(sw.stk,dy<0?1:-1)}else if(sw.dn&&dy>80&&!editing){suppress=true;openSearch()}sw=null}pos0=null});
function cycle(id,d){const it=findItem(id);if(!it||it.ws.length<2)return;it.si=(it.si+d+it.ws.length)%it.ws.length;const el=EL.get(id);if(el){el._an=d>0?'sup':'sdn';fillEl(it,el)}persist()}
const overDock=e=>{const r=$('#dock').getBoundingClientRect();return e.clientY>r.top-18&&e.clientY<r.bottom+18};
function dockIdx(x){const ks=[...document.querySelectorAll('#dock .dk .app')];let i=0;ks.forEach((a,j)=>{const r=a.getBoundingClientRect();if(x>r.left+r.width/2)i=j+1});return i}
function dockDrop(d,e){$('#dock').classList.remove('dtg');const k=d.k;
 if(overDock(e)){const from=dock.indexOf(k);if(from<0)return;let to=dockIdx(e.clientX);dock.splice(from,1);if(to>from)to--;dock.splice(Math.max(0,Math.min(dock.length,to)),0,k);drawDock();persist();return}
 if(cur<pages.length){const sn=snap();const gr=gridRect(cur);const na=A(k);na.c=0;na.r=0;const items=pages[cur];items.push(na);const c=Math.round((e.clientX-d.ox-gr.left)/PX),rr=Math.round((e.clientY-d.oy-gr.top)/PY);const pos=placeIn(items,na,c,rr);if(!pos){items.pop();toast('That page is full');drawDock();return}applyPos(items,pos);dock=dock.filter(x=>x!==k);render();refresh();persist();toast(AP[k][0]+' moved to the page',()=>restore(sn));return}
 drawDock()}
function combine(k,tgt){if(!tgt)return;if(tgt.t==='f'){if(!tgt.apps.includes(k))tgt.apps.push(k);render();refresh();toast('Added to '+tgt.name);return}
 if(tgt.t==='a'){const same=AP[tgt.k][1]===AP[k][1];const f=F(same?AP[k][1]:'New folder',[tgt.k,k]);f.c=tgt.c;f.r=tgt.r;for(const p of pages){const i=p.findIndex(x=>x.id===tgt.id);if(i>=0){p.splice(i,1,f);break}}render();refresh();setTimeout(()=>{const el=document.querySelector(`.app[data-f="${f.id}"]`);openFolder(f.id,el&&el.getBoundingClientRect());const inp=$('#fn');inp&&inp.select()},140);toast('Folder created')}}
document.addEventListener('click',e=>{if(suppress){suppress=false;e.stopPropagation();e.preventDefault()}},true);
// clicks on home
$('#vp').addEventListener('click',e=>{
 const rm=e.target.closest('[data-rm]');if(rm){const id=+rm.dataset.rm;const it=findItem(id);const sn=snap();const msg=it&&it.t==='f'?'Folder removed · apps are in the Library':it&&it.t==='w'?(it.ws.length>1?'Widget stack removed':'Widget removed'):'Removed from Home Screen';const el=EL.get(id);if(el)el.classList.add('rmv');setTimeout(()=>{removeItem(id);render();refresh();persist()},170);toast(msg,()=>restore(sn));return}
 const ad=e.target.closest('[data-add]');if(ad){const k=ad.dataset.add;const pi=addItem(A(k),cur);render();refresh();drawLib($('#srch')&&$('#srch').value);toast(AP[k][0]+' added to page '+(pi+1));return}
 const cat=e.target.closest('[data-cat]');if(cat){openCat(cat.dataset.cat);return}
 const b=e.target.closest('button');if(b&&!editing){wClick(b);return}
 const wo=e.target.closest('.w[data-wo]');if(wo&&!editing&&!b&&!e.target.closest('[data-d]')){openApp(wo.dataset.wo,wo.getBoundingClientRect());return}
 const fa=e.target.closest('.app[data-f]');if(fa){openFolder(+fa.dataset.f,fa.querySelector('.ft').getBoundingClientRect());return}
 if(editing)return;
 const ap=e.target.closest('.app[data-k]');if(ap)openApp(ap.dataset.k,ap.querySelector('.tile').getBoundingClientRect())});
$('#dock').addEventListener('click',e=>{const dr=e.target.closest('[data-drm]');if(dr){const k=dr.dataset.drm;const sn=snap();dock=dock.filter(x=>x!==k);drawDock();persist();toast(AP[k][0]+' removed from the Dock',()=>restore(sn));return}if(e.target.closest('#dadd')){openDockPicker();return}if(editing||suppress)return;const ap=e.target.closest('.app[data-k]');if(ap)openApp(ap.dataset.k,ap.querySelector('.tile').getBoundingClientRect())});
$('#dots').addEventListener('click',e=>{const g=e.target.closest('[data-g]');if(g){go(+g.dataset.g);return}if(editing)openPages();else openSearch()});
document.addEventListener('input',e=>{if(e.target.id==='srch')drawLib(e.target.value)});
document.addEventListener('input',e=>{const el=e.target;if(!el.classList||!el.classList.contains('tdi'))return;
 if(el.dataset.tdi!=null){TD.txt=el.value;document.querySelectorAll('#ph .tdpv, #ph-today .tdpv').forEach(p=>p.textContent=tdPreview());document.querySelectorAll('#ph input.tdi[data-tdi]').forEach(o=>{if(o!==el)o.value=el.value})}
 else if(el.dataset.tdsi!=null)TD.stxt=el.value;else if(el.dataset.tdtm!=null)TD.time=el.value});
document.addEventListener('keydown',e=>{const el=e.target;if(e.key==='Enter'&&el.classList&&el.classList.contains('tdi')){e.preventDefault();if(el.dataset.tdi!=null)tdAdd();else if(el.dataset.tdsi!=null){const b=el.closest('.w').querySelector('[data-tds]');b&&b.click()}else if(el.dataset.nta!=null){const b=el.closest('.w').querySelector('[data-ntadd]');b&&ntAddItem(b.dataset.ntadd)}else if(el.dataset.ntn!=null)ntAddNote();else if(el.dataset.dtn!=null||el.dataset.dtkc!=null||el.dataset.dtp!=null)dtQuick()}});
document.addEventListener('focusin',e=>{if(e.target.id==='srch'){const l=$('#pgs .pg.lib');l.classList.add('sf');drawLib(e.target.value)}});
document.addEventListener('click',e=>{const c=e.target.closest('#cx2');if(c){const i=$('#srch');i.value='';i.blur();const l=$('#pgs .pg.lib');l.classList.remove('sf');drawLib('')}const o=e.target.closest('#libbody [data-open]');if(o)openApp(o.dataset.open,o.querySelector('.tile').getBoundingClientRect())});
function openCat(c){const ks=Object.keys(AP).filter(k=>AP[k][1]===c);$('#shi').innerHTML=`<h3>${c}</h3><div class="sr" style="margin-top:14px">${ks.map(k=>`<div class="it">${icon(k)}</div>`).join('')}</div><button class="dn" id="dn">Close</button>`;$('#sheet').classList.add('on')}

document.addEventListener('pointerdown',()=>{suppress=false},true);

document.addEventListener('pointercancel',e=>{clr();if(swd){const c=swd.c;swd=null;if(c){c.classList.remove('drg');c.style.transform='';c.style.opacity=1}}if(drag){const d=drag;drag=null;if(raf){cancelAnimationFrame(raf);raf=0}clearTimeout(d.et);clearTimeout(d.ft);clearTimeout(d.rt);d.cl&&d.cl.remove();document.querySelectorAll('.fldt,.ghost,.dgh').forEach(x=>x.classList.remove('fldt','ghost','dgh'));$('#dock').classList.remove('dtg');render();refresh()}if(sw){$('#pgs').classList.remove('nt');go(cur);sw=null}pos0=null});
const SZN={xs:'Extra small',s:'Small',m:'Medium',l:'Large'};
const PRML=[100,150,200,250,300,330,500,750,1000],PROZ=[4,6,8,12,16,20,24,32].map(o=>Math.round(o*OZ_ML));
let setId=null;
function waterSet(sz,w){const presets=wUnitOz()?PROZ:PRML;const ch=k=>presets.map(v=>`<button data-k="${k}" data-v="${v}" class="${Math.abs((w[k]||0)-v)<2?'on':''}">+${unitAmt(v)}</button>`).join('');
 const two=sz==='m'||sz==='l';const hh=m=>{const h=Math.floor(m/60);return h===0||h===24?'12 AM':h>12?h-12+' PM':h===12?'12 PM':h+' AM'};const[a,b]=wWin();
 return `<div class="mu">Goal and buttons are the same Water settings the Hub uses everywhere.</div><div class="lbl">DAILY GOAL</div><div class="stp"><button data-g="${-250}">−</button><b>${bigAmt(w.goal)}</b><button data-g="250">+</button></div><div class="lbl">${two?'BUTTON 1 · '+(w.ncup||'Cup'):'BUTTON · '+(w.ncup||'Cup')}</div><div class="chips">${ch('cup')}</div>${two?`<div class="lbl">BUTTON 2 · ${w.nbottle||'Bottle'}</div><div class="chips">${ch('bottle')}</div>`:''}<div class="lbl">TAP TWICE TO UNDO</div><div class="chips"><button data-t="1" class="${prefs.dbl?'on':''}">On</button><button data-t="0" class="${prefs.dbl?'':'on'}">Off</button></div>${two?`<div class="lbl">TIMELINE: DAY STARTS</div><div class="stp"><button data-h="start:-1">−</button><b style="font-size:16px">${hh(a)}</b><button data-h="start:1">+</button></div><div class="lbl">TIMELINE: DAY ENDS</div><div class="stp"><button data-h="end:-1">−</button><b style="font-size:16px">${hh(b)}</b><button data-h="end:1">+</button></div>`:''}`}
function openSet(id){const it=findItem(+id);if(!it||it.t!=='w')return;setId=it.id;const k=curW(it),sz=it.z;it.o=it.o||{};
 let h=`<div class="grab"></div><h3>${WG[k].n} · ${SZN[sz]} widget</h3>`;
 h+=`<div class="lbl">IN THIS WIDGET${it.ws.length>1?' · SWIPE UP/DOWN ON IT TO FLIP':''}</div><div class="chips">${WKEYS.map(x=>`<button data-sk="${x}" class="${it.ws.includes(x)?'on':''}">${WG[x].n}</button>`).join('')}</div><div class="mu" style="margin-top:6px">Turn on more than one to make a stack. Showing now: ${WG[k].n}.</div>`;
 if(k==='water'){const w=WS();h+=w?waterSet(sz,w):'<div class="mu">Water is still loading</div>'}
 else if(k==='tasks')h+=`<div class="lbl">SHOW</div><div class="chips"><button data-tm="due" class="${it.o.tm==='all'?'':'on'}">Due today</button><button data-tm="all" class="${it.o.tm==='all'?'on':''}">All open tasks</button></div><div class="mu" style="margin-top:8px">Tap a circle to complete a task. Tap the widget to open To-Do.</div>`;
 else if(k==='pledge'){plKick(true);const L=plMine(),cu=plPick(it);h+=`<div class="lbl">WHICH PLEDGE</div><div class="chips">${L.length?L.map(p=>`<button data-pid="${esc(p.id)}" class="${cu&&cu.id===p.id?'on':''}">${esc(p.title)}</button>`).join(''):'<span class="mu">No pledges yet. Make one in the Pledge app.</span>'}</div><div class="mu" style="margin-top:8px">Add more Pledge widgets from the gallery to show other pledges side by side. Linked pledges tick themselves.</div>`}
 else if(k==='ticks')h+=`<div class="lbl">WHOSE TICKS</div><div class="chips"><button data-who="both" class="${it.o.who==='mine'?'':'on'}">Both of us</button><button data-who="mine" class="${it.o.who==='mine'?'on':''}">Just mine</button></div><div class="lbl">UNTICKS</div><div class="chips"><button data-un="1" class="${it.o.un===false?'':'on'}">Show</button><button data-un="0" class="${it.o.un===false?'on':''}">Hide</button></div>`
 else if(k==='qlinks'){const cur=qlList(it);h+=`<div class="lbl">APPS TO SHOW (UP TO 8)</div><div class="chips">${Object.keys(AP).filter(x=>!AP[x][3]&&x!=='settings').map(x=>`<button data-ql="${x}" class="${cur.includes(x)?'on':''}">${AP[x][0]}</button>`).join('')}</div>`}
 else if(k==='notes')h+=`<div class="mu">Pick a list with the chips inside the Large widget. Lists and notes are the same ones in the Notes widget and the To-Do app.</div>`
 else if(['diet','chores','grocery','clock','insights','gym','skin'].includes(k))h+=`<div class="mu">${k==='grocery'||k==='insights'?'This widget is read only. ':''}Tap the widget header arrow to open ${WG[k].n}.</div>`
 else h+=`<div class="lbl">INCLUDE</div><div class="chips"><button data-rb="1" class="${it.o.rb===false?'':'on'}">Routine blocks and events</button><button data-rb="0" class="${it.o.rb===false?'on':''}">Events only</button></div><div class="mu" style="margin-top:8px">Tap the widget to open Schedule.</div>`;
 h+=`<button class="dn" id="dn">Done</button>`;$('#shi').innerHTML=h;$('#sheet').classList.add('on')}
// ---- sheet clicks: close, open from sheet, add widget, water settings ----
$('#shi').addEventListener('click',e=>{if(e.target.id==='dn'){$('#sheet').classList.remove('on');return}
 const dkp=e.target.closest('[data-dk]');if(dkp){const k=dkp.dataset.dk;if(dock.length>=4){toast('The Dock is full');return}const sn=snap();dock.push(k);$('#sheet').classList.remove('on');drawDock();persist();toast(AP[k][0]+' added to the Dock',()=>restore(sn));return}
 const ap=e.target.closest('.app[data-k]');if(ap){$('#sheet').classList.remove('on');openApp(ap.dataset.k,null);return}
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.pm){pageOp(b.dataset.pm);return}
 if(b.dataset.gk){gk=b.dataset.gk;galleryDraw(true);return}
 if(b.dataset.gadd){const z=b.dataset.gadd;const it=W(z,gk==='stack'?STK:[gk]);const pi=addItem(it,cur);$('#sheet').classList.remove('on');render();refresh();go(pi);persist();toast((gk==='stack'?'Widget stack':WG[gk].n+' widget')+' added · drag to move it');return}
 const it=findItem(setId);
 if(b.dataset.sk&&it){const k=b.dataset.sk,i=it.ws.indexOf(k);if(i>=0){if(it.ws.length<2){toast('A widget needs at least one');return}const was=curW(it);it.ws.splice(i,1);it.si=Math.max(0,it.ws.indexOf(was));if(it.si<0)it.si=0}else{it.ws.push(k);it.si=it.ws.length-1}refreshOne(it);persist();openSet(it.id);return}
 if(b.dataset.tm&&it){it.o.tm=b.dataset.tm;refreshOne(it);persist();openSet(it.id);return}
 if(b.dataset.who!=null&&it){it.o.who=b.dataset.who;TKL.ld=0;refreshOne(it);persist();openSet(it.id);return}
 if(b.dataset.un!=null&&it){it.o.un=b.dataset.un==='1';refreshOne(it);persist();openSet(it.id);return}
 if(b.dataset.ql&&it){let a=qlList(it).slice();const k2=b.dataset.ql,i=a.indexOf(k2);if(i>=0){if(a.length<2){toast('Keep at least one');return}a.splice(i,1)}else{if(a.length>=8){toast('Up to 8 apps');return}a.push(k2)}it.o.ql=a;refreshOne(it);persist();openSet(it.id);return}
 if(b.dataset.pid!=null&&it){it.o.pid=b.dataset.pid;refreshOne(it);persist();openSet(it.id);return}
 if(b.dataset.rb!=null&&it){it.o.rb=b.dataset.rb==='1';refreshOne(it);persist();openSet(it.id);return}
 const w=WS();if(!w)return;
 if(b.dataset.g){const g=Math.max(500,Math.min(8000,w.goal+ +b.dataset.g));w.goal=g;w.goals[wDay()]=g;saveWater()}
 else if(b.dataset.t!=null){prefs.dbl=b.dataset.t==='1';tap=null;savePrefs()}
 else if(b.dataset.h){const[k,v]=b.dataset.h.split(':');const cur_=hmMin(w[k])??(k==='start'?420:1320);const lo=k==='start'?4*60:15*60,hi=k==='start'?12*60:24*60;const nv=Math.max(lo,Math.min(hi,cur_+ +v*60));wSet(k,String(Math.floor(nv/60)).padStart(2,'0')+':00')}
 else if(b.dataset.k){wSet(b.dataset.k,+b.dataset.v)}
 else return;openSet(setId);drawPages()});
function refreshOne(it){const el=EL.get(it.id);if(el)fillEl(it,el)}
$('#sheet').addEventListener('click',e=>{if(e.target.id==='sheet')$('#sheet').classList.remove('on')});
let gz=0,gk='water';const GS=[['xs','Extra small',160,80],['s','Small',160,170],['m','Medium',336,170],['l','Large',336,366]];
const GTYPES=[['water','Water'],['tasks','To-Do'],['schedule','Schedule'],['skin','Skin'],['pledge','Pledge'],['gym','Training'],['diet','Diet'],['chores','Chores'],['grocery','Grocery'],['clock','Clock'],['insights','Insights'],['ticks','Recent ticks'],['qlinks','Quick links'],['notes','Notes'],['banner','Banner'],['stack','Stack']];
function galleryDraw(keep){const old=gz;const info=gk==='stack'?{n:'Widget stack',d:'Water, To-Do and Schedule in one widget. Swipe up or down on it to flip.',ic:'_',c:'Tools'}:WG[gk];const wk=gk==='stack'?'water':gk;
 const prev=z=>{const fake={ws:gk==='stack'?STK:[gk],si:0,z,o:{}};return `<div class="w${gk==='stack'?' stk':''}">${WG[wk].html(z,fake)}</div>${gk==='stack'?'<div class="sdt"><i class="on"></i><i></i><i></i></div>':''}`};
 $('#shi').innerHTML=`<div class="grab"></div><h3>Add a widget</h3><div class="chips" style="margin-top:8px">${GTYPES.map(([k,n])=>`<button data-gk="${k}" class="${gk===k?'on':''}">${n}</button>`).join('')}</div><div class="gin"><span class="gic"><div class="tile c-${info.c}"><svg viewBox="0 0 24 24">${P[info.ic]||P._}</svg></div></span><div class="n"><b>${info.n}</b><span>${info.d}</span></div></div><div class="gcar" id="gcar">${GS.map(([z,n,w,h])=>`<div class="gsl"><div class="gp it ${z}" style="width:${w}px;height:${h}px;${z==='l'?'transform:scale(.8)!important;transform-origin:top center;margin-bottom:-70px':''}"><div class="in">${prev(z)}</div></div></div>`).join('')}</div><div class="gdots" id="gdots">${GS.map((_,i)=>`<i class="${i===(keep?old:0)?'on':''}"></i>`).join('')}</div><div class="gnm" id="gnm">${GS[keep?old:0][1]}</div><button class="gadd" id="gadd" data-gadd="${GS[keep?old:0][0]}">Add Widget</button><div class="mu" style="text-align:center;margin-top:8px;font-size:11px">Swipe to change size. After adding, drag it to the screen edge to move it to another page.</div><button class="dn" id="dn">Close</button>`;
 $('#sheet').classList.add('on');gz=keep?old:0;const c=$('#gcar');if(keep)c.scrollLeft=old*c.clientWidth;c.onscroll=()=>{const i=Math.round(c.scrollLeft/c.clientWidth);if(i!==gz){gz=i;[...$('#gdots').children].forEach((d,j)=>d.classList.toggle('on',j===i));$('#gnm').textContent=GS[i][1];$('#gadd').dataset.gadd=GS[i][0]}}}
function openGallery(){if(!editing)setEdit(true);gk='water';galleryDraw(false)}
$('#plus').onclick=openGallery;
// ---- saving, loading, geometry, activation ----
const fileOf=k=>k==='gym'?'gym.html':(AP[k]&&AP[k][2]?AP[k][2].split('/').pop():null);
const GROUP={planner:'Planner',health:'Health',home:'Home'};
function syncApps(){let changed=false;try{
 (state.apps||[]).forEach(a=>{const key=String(a.file||'').replace(/\.html?$/i,'').toLowerCase();if(!key||key==='clock'||key==='checklist'||AP[key])return;
  const cat=typeof categoryFor==='function'?categoryFor(a.file):null;AP[key]=[a.title||key,GROUP[cat]||'Tools','apps/'+a.file];changed=true});
 Object.keys(AP).forEach(k=>{const f=fileOf(k);if(!f||typeof categoryFor!=='function')return;const g=GROUP[categoryFor(f)];if(g&&AP[k][1]!==g){AP[k][1]=g;changed=true}})}catch(e){}
 if(changed&&booted)drawLib($('#srch')&&$('#srch').value)}
function putIn(pi,it){while(pages.length<=pi)pages.push([]);const[w,h]=dims(it);const sp=freeSpot(pages[pi].map(rc),w,h,0);if(sp&&sp.r+h<=ROWS){it.c=sp.c;it.r=sp.r;pages[pi].push(it);return pi}return putIn(pi+1,it)}
function defaultPages(){uid=1;dock=DOCK0.slice();const grp=c=>Object.keys(AP).filter(k=>AP[k][1]===c&&!AP[k][3]&&k!=='clock');pages=[[]];
 const seed=[W('m',['water','tasks','schedule'])];['Planner','Health','Home'].forEach(c=>{const ks=grp(c);if(ks.length>1)seed.push(F(c,ks));else if(ks.length)seed.push(A(ks[0]))});seed.push(A('insights'),A('clock'));
 seed.forEach(it=>putIn(0,it));const p1=pages.length;putIn(p1,W('l'));putIn(p1,W('xs',['water','tasks']));putIn(pages.length-1,W('s',['water','schedule']))}
function serialize(){return{v:2,ts:Date.now(),dock:dock.slice(),hid:pages.map((p,i)=>p.hid?i:-1).filter(x=>x>=0),pages:pages.map(p=>p.map(i=>i.t==='a'?{t:'a',k:i.k,c:i.c,r:i.r}:i.t==='f'?{t:'f',name:i.name,apps:i.apps.slice(),c:i.c,r:i.r}:{t:'w',ws:i.ws.slice(),si:i.si,o:i.o||{},z:i.z,c:i.c,r:i.r}))}}
function persist(){if(!profileNow)return;const data=serialize();lsSet('hub-phone-home-'+profileNow,JSON.stringify(data));clearTimeout(saveT);const prof=profileNow;
 saveT=setTimeout(()=>{try{if(typeof state!=='undefined'&&state.user&&state.profile===prof)profileRef('hub-profiles','phonehome').set({json:JSON.stringify(data)}).catch(()=>{})}catch(e){}},500)}
function hydrate(d){uid=1;const seen=new Set();const out=[];
 (d.pages||[]).forEach(p=>{const items=[];(p||[]).forEach(o=>{let it=null;
  if(o.t==='a'&&AP[o.k]&&!seen.has(o.k)){it=A(o.k);seen.add(o.k)}
  else if(o.t==='f'){const ks=(o.apps||[]).filter(k=>AP[k]&&!seen.has(k));ks.forEach(k=>seen.add(k));if(ks.length>1)it=F(String(o.name||'Folder').slice(0,22),ks);else if(ks.length===1)it=A(ks[0])}
  else if(o.t==='w'&&SZ[o.z]){const ws=(Array.isArray(o.ws)?o.ws:[o.w||'water']).map(k=>k==='next'?'schedule':k).filter(k=>WG[k]).filter((k,i,a)=>a.indexOf(k)===i);if(ws.length){it=W(o.z,ws);it.si=Math.max(0,Math.min(ws.length-1,+o.si||0));it.o=(o.o&&typeof o.o==='object')?o.o:{}}}
  if(it){it.c=+o.c||0;it.r=+o.r||0;items.push(it)}});
  out.push(items)});
 pages=out.length?out:[[]];if(!pages.some(p=>p.length))defaultPages();else{dock=Array.isArray(d.dock)?[...new Set(d.dock.filter(k=>AP[k]))].slice(0,4):DOCK0.slice();(Array.isArray(d.hid)?d.hid:[]).forEach(i=>{if(pages[i])pages[i].hid=true});if(!pages.some(p=>!p.hid))pages[0].hid=false}fitPages()}
function bad(items){const rs=items.map(rc);return rs.some((a,i)=>a.c<0||a.r<0||a.c+a.w>COLS||a.r+a.h>ROWS||rs.some((b,j)=>j>i&&ov(a,b)))}
// after a size change (rotation, different phone): anything that no longer fits moves to the next free spot
function fitPages(){for(let pi=0;pi<pages.length;pi++){const items=pages[pi];if(!bad(items))continue;const keep=[],move=[];const fixed=[];
  items.slice().sort((a,b)=>a.r-b.r||a.c-b.c).forEach(it=>{const[w,h]=dims(it);const q={c:it.c,r:it.r,w,h};if(q.c>=0&&q.r>=0&&q.c+w<=COLS&&q.r+h<=ROWS&&!fixed.some(f=>ov(q,f))){fixed.push(q);keep.push(it)}else move.push(it)});
  keep.hid=pages[pi].hid;pages[pi]=keep;move.forEach(it=>{const sp=freeSpot(pages[pi].map(rc),...dims(it),0);if(sp){it.c=sp.c;it.r=sp.r;pages[pi].push(it)}else addItem(it,pi+1===pages.length?pi:pi+1)})}
 pages=pages.filter((p,i)=>p.length||i===0||false);if(!pages.length)pages=[[]];cur=Math.min(cur,pages.length)}
function geom(){const ph=$('#ph');const wpx=innerWidth-28;PX=(wpx+10)/4;COLW=PX-10;const vp=$('#vp');const h=vp.clientHeight||440;ROWS=Math.max(4,Math.min(7,Math.floor((h+10)/108)));PY=ROWS===4?Math.max(86,Math.min(108,Math.floor((h+10)/4))):108;ROWH=PY-10;ph.classList.toggle('tight',PY<100);
 ph.style.setProperty('--px',PX+'px');ph.style.setProperty('--py',PY+'px');ph.style.setProperty('--pcx',(COLW/2+1)+'px');document.querySelectorAll('#ph .g').forEach(g=>g.style.height=(ROWS*PY)+'px')}
const active=()=>enabled&&MQ.matches;
let started=false;
function start(){profileNow=state.profile;started=true;syncApps();applyLook();
 let loc=null;try{loc=JSON.parse(lsGet('hub-phone-home-'+profileNow,'null'))}catch(e){}
 geom();if(loc&&loc.pages)hydrate(loc);else defaultPages();cur=0;editing=false;$('#ph').classList.remove('edit');
 const pgs=$('#pgs');pgs.innerHTML='';render();refresh();drawLib();{const L_=prefs.last;let to=0;if(L_&&Date.now()-L_.t<20*60000&&L_.p<=pages.length&&(L_.p===pages.length||!pages[L_.p].hid))to=L_.p;go(to)}
 const pg=document.querySelector('[data-page].active');if(pg&&pg.dataset.page!=='today'&&!frameOpen()){$('#ph').classList.add('away');view='route';routeNow=pg.dataset.page}
 if(frameOpen()){view='app';$('#ph').classList.add('appopen')}
 const prof=profileNow;
 try{ensureWater().then(()=>{drawPages()}).catch(()=>{})}catch(e){}
 try{profileRef('hub-profiles','phonehome').get().then(snap=>{if(!snap.exists||state.profile!==prof)return;const d=safeJson(snap.data().json,null);if(!d||!d.pages)return;let l=null;try{l=JSON.parse(lsGet('hub-phone-home-'+prof,'null'))}catch(e){}
  if((!l||(d.ts||0)>(l.ts||0))&&!editing&&!drag){hydrate(d);lsSet('hub-phone-home-'+prof,JSON.stringify(d));$('#pgs').innerHTML='';render();refresh();drawLib()}}).catch(()=>{})}catch(e){}}
function apply(){const on=active();document.body.classList.toggle('ph-on',on);if(!on)return;
 const pgAct=document.querySelector('[data-page].active');
 if(started){geom();const before=JSON.stringify(serialize().pages);fitPages();$('#pgs').innerHTML='';render();refresh();drawLib();if(JSON.stringify(serialize().pages)!==before)persist();go(Math.min(cur,pages.length))}
 // turned on while looking at another Hub page (Settings): stay there, the bar gets you home
 if(started&&view==='home'&&pgAct&&pgAct.dataset.page!=='today'&&!frameOpen()){$('#ph').classList.add('away');view='route';routeNow=pgAct.dataset.page}}
function ready(){return typeof state!=='undefined'&&state.user&&state.profile&&document.getElementById('app-shell')&&!document.getElementById('app-shell').hidden&&typeof ensureWater==='function'}
let sig='';const taskSig=()=>{try{if(!hasTasks())return 0;return dueTasks().map(t=>t.id).join(',')+'|'+state.personalTasks.length+'|'+(state.events||[]).length}catch(e){return 1}};
function tick(){if(!ready()){return}
 if(active()&&(!started||profileNow!==state.profile)){document.body.classList.add('ph-on');start();apply();return}
 if(!active()||!started)return;syncApps();
 if(drag||document.hidden||view==='switch')return;const ae=document.activeElement;if(ae&&(/^cu-/.test(ae.id||'')||(ae.classList&&ae.classList.contains('tdi'))))return;
 const w=WS();const s=JSON.stringify([w?[wTotal(),wGoalMl(),w.cup,w.bottle,w.unit,sipsToday().map(x=>x.id+x.ml).join()]:0,Math.floor(wNow()/5),sel,taskSig()]);
 if(s!==sig){sig=s;if(!$('#sheet').classList.contains('on'))refresh()}}
setInterval(tick,800);
MQ.addEventListener?MQ.addEventListener('change',apply):MQ.addListener(apply);
let rzT=null;window.addEventListener('resize',()=>{clearTimeout(rzT);rzT=setTimeout(()=>{if(active()&&started)apply()},200)});
window.addEventListener('orientationchange',()=>setTimeout(()=>{if(active()&&started)apply()},300));
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(started)persist()}else if(active()&&started){sig='';tick()}});
window.addEventListener('pagehide',()=>{if(started)persist()});
// the app viewer can also be closed by its own "Back to Hub" button
(function(){const o=ovl();if(!o)return;new MutationObserver(()=>{if(!active())return;const open=frameOpen(),ph=$('#ph');
 if(!open&&view==='app'){view='home';ph.classList.remove('appopen')}else if(open&&(view==='home')){view='app';ph.classList.add('appopen')}}).observe(o,{attributes:true,attributeFilter:['hidden']})})();
// ---- Settings page card ----
(function(){const page=document.getElementById('page-settings');if(!page)return;const c=document.createElement('section');c.className='surface settings-card';c.id='ph-settings-card';
 const seg=(g,items)=>`<div class="phs-seg" data-g="${g}">${items.map(([v,l])=>`<button type="button" data-v="${v}">${l}</button>`).join('')}</div>`;
 c.innerHTML=`<div class="section-head with-icon"><span class="section-head-icon"><i data-lucide="smartphone"></i></span><div><p class="section-kicker">Phone</p><h2>Home screen</h2></div></div>
 <p class="settings-hint">On a phone the Today page becomes an iPhone-style home screen: pages, folders, widgets, an App Library, and a Back / Home / Apps bar. It only appears on screens up to 700px wide. Hold an icon, widget or folder for its menu, or hold empty space to rearrange the screen.</p>
 <div class="phs-row"><span>Phone home screen</span>${seg('on',[['1','On'],['0','Off']])}</div>
 <div class="phs-row"><span>Icon style</span>${seg('icons',[['dark','Dark'],['light','Light'],['auto','Auto']])}</div>
 <div class="phs-row"><span>Icon tint</span>${seg('tint',[['none','None'],['blue','Blue'],['green','Green'],['pink','Pink'],['orange','Orange'],['purple','Purple']])}</div>
 <div class="phs-row"><span>Wallpaper</span>${seg('wp',[['dusk','Dusk'],['valley','Valley'],['graphite','Graphite'],['photo','Photo']])}</div>
 <div class="phs-row"><span>Your photo</span><span class="phs-seg"><button type="button" id="phs-pick">Choose photo</button><button type="button" id="phs-clear">Remove</button></span><input type="file" id="phs-file" accept="image/*" hidden></div>
 <div class="phs-row"><span>Dim wallpaper</span><input type="range" class="phs-rng" id="phs-dim" min="0" max="70" step="5"></div>
 <div class="phs-row"><span>Blur wallpaper</span><input type="range" class="phs-rng" id="phs-blur" min="0" max="24" step="2"></div>
 <div class="phs-row"><span>Icon names</span>${seg('lbl',[['true','Show'],['false','Hide']])}</div>
 <div class="phs-row"><span>Wallpaper moves with pages</span>${seg('par',[['true','On'],['false','Off']])}</div>
 <p class="settings-hint">Wallpaper photo and look settings are saved on this device. Your layout, dock and hidden pages sync with your profile.</p>
 <div class="phs-row"><span>Layout</span><button type="button" class="button secondary" id="phs-reset">Reset home screen</button></div>`;
 const anchor=document.getElementById('links-card');(anchor&&anchor.parentNode===page?page.insertBefore(c,anchor):page.appendChild(c));
 const paint=()=>{c.querySelectorAll('.phs-seg[data-g]').forEach(s=>{const g=s.dataset.g,val=g==='on'?(enabled?'1':'0'):prefs[g];s.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.v===String(val)))});const d=c.querySelector('#phs-dim'),bl=c.querySelector('#phs-blur');if(d)d.value=prefs.dim||0;if(bl)bl.value=prefs.blur||0};paint();
 c.addEventListener('input',e=>{if(e.target.id==='phs-dim'){prefs.dim=+e.target.value;savePrefs();if(started)applyLook()}else if(e.target.id==='phs-blur'){prefs.blur=+e.target.value;savePrefs();if(started)applyLook()}});
 c.addEventListener('change',e=>{if(e.target.id!=='phs-file')return;const f=e.target.files&&e.target.files[0];e.target.value='';if(!f)return;photoFrom(f)});
 c.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.id==='phs-reset'){if(!started){toast('Open this on a phone-size screen to reset it');return}if(confirm('Put the home screen back to the default layout?')){defaultPages();cur=0;$('#pgs').innerHTML='';render();refresh();drawLib();persist();window.toast&&window.toast('Home screen reset')}return}
  if(b.id==='phs-pick'){c.querySelector('#phs-file').click();return}
  if(b.id==='phs-clear'){lsSet(LS_PHOTO,'');if(prefs.wp==='photo')prefs.wp='dusk';savePrefs();if(started)applyLook();paint();return}
  const g=b.closest('.phs-seg');if(!g||!g.dataset.g)return;const k=g.dataset.g,v=b.dataset.v;
  if(k==='on'){enabled=v==='1';lsSet(LS_ON,enabled?'1':'0');apply()}else{if(k==='wp'&&v==='photo'&&!lsGet(LS_PHOTO,'')){c.querySelector('#phs-file').click();return}prefs[k]=(k==='lbl'||k==='par')?v==='true':v;savePrefs();if(started)applyLook()}paint()});
 function photoFrom(f){const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{const m=1170,sc=Math.min(1,m/Math.max(im.width,im.height));const cv=document.createElement('canvas');cv.width=Math.round(im.width*sc);cv.height=Math.round(im.height*sc);cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);let u='';try{u=cv.toDataURL('image/jpeg',.82)}catch(e){}
   try{localStorage.setItem(LS_PHOTO,u)}catch(e){u=''}if(!u){window.toast&&window.toast('That photo is too large to save on this device');return}prefs.wp='photo';if(!prefs.dim)prefs.dim=20;savePrefs();if(started)applyLook();paint()};im.onerror=()=>{window.toast&&window.toast('Could not read that photo')};im.src=r.result};r.readAsDataURL(f)}})();
if(window.visualViewport){const kb=()=>{const v=window.visualViewport;const h=Math.max(0,Math.round(innerHeight-v.height-v.offsetTop));$('#ph').style.setProperty('--kb',h+'px')};visualViewport.addEventListener('resize',kb);visualViewport.addEventListener('scroll',kb)}
// ---- sheet: drag the handle down to close ----
(function(){let g=null;const sh=()=>$('#shi');document.addEventListener('pointerdown',e=>{const h=e.target.closest('#shi .grab');if(!h)return;g={y:e.clientY,dy:0};sh().style.transition='none'});document.addEventListener('pointermove',e=>{if(!g)return;g.dy=Math.max(0,e.clientY-g.y);sh().style.transform='translateY('+g.dy+'px)'});const end=()=>{if(!g)return;const d=g.dy;g=null;const s=sh();s.style.transition='';s.style.transform='';if(d>90){suppress=true;$('#sheet').classList.remove('on')}};document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end)})();
window.__ph={ap:()=>Object.keys(AP),dock:()=>dock,pages:()=>pages,cur:()=>cur,editing:()=>editing,view:()=>view,go:i=>go(i),draw:()=>drawPages(),setEdit:o=>setEdit(o),serialize:()=>serialize(),rows:()=>ROWS};

})();

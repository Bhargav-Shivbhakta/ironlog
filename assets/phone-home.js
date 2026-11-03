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
function wClick(b){const wd=b.closest('.w');if(b.dataset.tk&&typeof completeTask==='function'){const row=b.closest('.tk');if(row)row.classList.add('dn2');setTimeout(()=>{completeTask(b.dataset.tk);setTimeout(()=>{refresh()},60)},160);return}if(!wd||!WS())return;
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
 next:{n:'Next up',d:'What is coming next on your schedule',ic:'schedule',c:'Planner',open:'schedule',html:(z,it)=>nextHtml(z,it)}};
const WKEYS=['water','tasks','next'];
const curW=it=>it.ws[Math.min(it.si,it.ws.length-1)]||'water';
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const t12=t=>{const m=/^(\d{1,2}):(\d{2})/.exec(t||'');if(!m)return'';let h=+m[1];const ap=h>=12?'PM':'AM';h=h%12||12;return h+':'+m[2]+' '+ap};
const hasTasks=()=>typeof state!=='undefined'&&Array.isArray(state.personalTasks)&&typeof dueTasks==='function';
function taskList(all){try{if(!hasTasks())return null;if(!all)return dueTasks();return state.personalTasks.map(t=>({...t,_shared:false})).concat(state.sharedTasks||[]).filter(t=>!t.done).sort((a,b)=>(b.priority||0)-(a.priority||0)||String(a.due||'9999').localeCompare(String(b.due||'9999')))}catch(e){return[]}}
function tasksHtml(z,it){const all=it&&it.o&&it.o.tm==='all';const L=taskList(all);const ttl=all?'To-Do':'To-Do · today';
 if(!L)return`<div class="t"><span>To-Do</span></div><div class="shim"></div><div class="shim s2"></div>`;
 const n=L.length;
 if(z==='xs')return`<div class="t"><span>To-Do</span></div><div class="fx" style="gap:8px"><div class="big" style="font-size:28px">${n}</div><div class="mu" style="line-height:1.15">${all?'open':'due today'}</div></div>`;
 const rows=(k)=>L.slice(0,k).map(t=>`<div class="tk"><button class="ck" data-tk="${esc(t.id)}" aria-label="Mark done"></button><span>${esc(t.title)}</span>${t.dueTime?`<small>${t12(t.dueTime)}</small>`:''}</div>`).join('');
 const k=z==='s'?2:z==='m'?3:7;
 if(!n)return`<div class="t"><span>${ttl}</span></div><div class="emp"><b>All clear</b><span class="mu">Nothing ${all?'open':'due today'}</span></div>`;
 return`<div class="t"><span>${ttl}</span><span>${n}</span></div><div class="tks">${rows(k)}</div>${n>k?`<div class="mu mor">+${n-k} more</div>`:''}`}
function nextList(it){try{const rb=!(it&&it.o&&it.o.rb===false);const nowM=wNow();let tl=todaysTimeline().filter(x=>x.time&&(rb||x.kind==='event'));let up=tl.filter(x=>minutes(x.time)>=nowM);let tom=false;
 if(!up.length){tom=true;up=timelineForDate(addDays(today(),1)).filter(x=>x.time&&(rb||x.kind==='event'))}return{up,tom,nowM}}catch(e){return null}}
function nextHtml(z,it){const r=nextList(it);if(!r)return`<div class="t"><span>Next up</span></div><div class="shim"></div><div class="shim s2"></div>`;
 const{up,tom,nowM}=r;if(!up.length)return`<div class="t"><span>Next up</span></div><div class="emp"><b>Nothing planned</b><span class="mu">Your schedule is clear</span></div>`;
 const f=up[0];const d=minutes(f.time)-nowM;const when=tom?'tomorrow '+t12(f.time):d<=0?'now':d<60?'in '+d+' min':'in '+Math.floor(d/60)+'h'+(d%60?' '+d%60+'m':'');
 if(z==='xs')return`<div class="t"><span>Next up</span></div><div class="nx1">${esc(f.title)}</div><div class="mu">${when}</div>`;
 if(z==='s')return`<div class="t"><span>Next up</span></div><div class="nx1" style="font-size:17px">${esc(f.title)}</div><div class="nxt">${t12(f.time)}</div><div class="mu">${when}</div>`;
 const k=z==='m'?3:7;return`<div class="t"><span>Next up</span><span>${tom?'tomorrow':when}</span></div><div class="evs">${up.slice(0,k).map((x,i)=>`<div class="ev${i?'':' f'}"><b>${t12(x.time)}</b><span>${esc(x.title)}</span></div>`).join('')}</div>`}
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
 else h+=`<div class="lbl">INCLUDE</div><div class="chips"><button data-rb="1" class="${it.o.rb===false?'':'on'}">Routine blocks and events</button><button data-rb="0" class="${it.o.rb===false?'on':''}">Events only</button></div><div class="mu" style="margin-top:8px">Tap the widget to open Schedule.</div>`;
 h+=`<button class="dn" id="dn">Done</button>`;$('#shi').innerHTML=h;$('#sheet').classList.add('on')}
// ---- sheet clicks: close, open from sheet, add widget, water settings ----
$('#shi').addEventListener('click',e=>{if(e.target.id==='dn'){$('#sheet').classList.remove('on');return}
 const dkp=e.target.closest('[data-dk]');if(dkp){const k=dkp.dataset.dk;if(dock.length>=4){toast('The Dock is full');return}const sn=snap();dock.push(k);$('#sheet').classList.remove('on');drawDock();persist();toast(AP[k][0]+' added to the Dock',()=>restore(sn));return}
 const ap=e.target.closest('.app[data-k]');if(ap){$('#sheet').classList.remove('on');openApp(ap.dataset.k,null);return}
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.pm){pageOp(b.dataset.pm);return}
 if(b.dataset.gk){gk=b.dataset.gk;galleryDraw(true);return}
 if(b.dataset.gadd){const z=b.dataset.gadd;const it=W(z,gk==='stack'?WKEYS:[gk]);const pi=addItem(it,cur);$('#sheet').classList.remove('on');render();refresh();go(pi);persist();toast((gk==='stack'?'Widget stack':WG[gk].n+' widget')+' added · drag to move it');return}
 const it=findItem(setId);
 if(b.dataset.sk&&it){const k=b.dataset.sk,i=it.ws.indexOf(k);if(i>=0){if(it.ws.length<2){toast('A widget needs at least one');return}const was=curW(it);it.ws.splice(i,1);it.si=Math.max(0,it.ws.indexOf(was));if(it.si<0)it.si=0}else{it.ws.push(k);it.si=it.ws.length-1}refreshOne(it);persist();openSet(it.id);return}
 if(b.dataset.tm&&it){it.o.tm=b.dataset.tm;refreshOne(it);persist();openSet(it.id);return}
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
const GTYPES=[['water','Water'],['tasks','To-Do'],['next','Next up'],['stack','Stack']];
function galleryDraw(keep){const old=gz;const info=gk==='stack'?{n:'Widget stack',d:'Water, To-Do and Next up in one widget. Swipe up or down on it to flip.',ic:'_',c:'Tools'}:WG[gk];const wk=gk==='stack'?'water':gk;
 const prev=z=>{const fake={ws:gk==='stack'?WKEYS:[gk],si:0,z,o:{}};return `<div class="w${gk==='stack'?' stk':''}">${WG[wk].html(z,fake)}</div>${gk==='stack'?'<div class="sdt"><i class="on"></i><i></i><i></i></div>':''}`};
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
 const seed=[W('m',['water','tasks','next'])];['Planner','Health','Home'].forEach(c=>{const ks=grp(c);if(ks.length>1)seed.push(F(c,ks));else if(ks.length)seed.push(A(ks[0]))});seed.push(A('insights'),A('clock'));
 seed.forEach(it=>putIn(0,it));const p1=pages.length;putIn(p1,W('l'));putIn(p1,W('xs',['water','tasks']));putIn(pages.length-1,W('s',['water','next']))}
function serialize(){return{v:2,ts:Date.now(),dock:dock.slice(),hid:pages.map((p,i)=>p.hid?i:-1).filter(x=>x>=0),pages:pages.map(p=>p.map(i=>i.t==='a'?{t:'a',k:i.k,c:i.c,r:i.r}:i.t==='f'?{t:'f',name:i.name,apps:i.apps.slice(),c:i.c,r:i.r}:{t:'w',ws:i.ws.slice(),si:i.si,o:i.o||{},z:i.z,c:i.c,r:i.r}))}}
function persist(){if(!profileNow)return;const data=serialize();lsSet('hub-phone-home-'+profileNow,JSON.stringify(data));clearTimeout(saveT);const prof=profileNow;
 saveT=setTimeout(()=>{try{if(typeof state!=='undefined'&&state.user&&state.profile===prof)profileRef('hub-profiles','phonehome').set({json:JSON.stringify(data)}).catch(()=>{})}catch(e){}},500)}
function hydrate(d){uid=1;const seen=new Set();const out=[];
 (d.pages||[]).forEach(p=>{const items=[];(p||[]).forEach(o=>{let it=null;
  if(o.t==='a'&&AP[o.k]&&!seen.has(o.k)){it=A(o.k);seen.add(o.k)}
  else if(o.t==='f'){const ks=(o.apps||[]).filter(k=>AP[k]&&!seen.has(k));ks.forEach(k=>seen.add(k));if(ks.length>1)it=F(String(o.name||'Folder').slice(0,22),ks);else if(ks.length===1)it=A(ks[0])}
  else if(o.t==='w'&&SZ[o.z]){const ws=(Array.isArray(o.ws)?o.ws:[o.w||'water']).filter(k=>WG[k]);if(ws.length){it=W(o.z,ws);it.si=Math.max(0,Math.min(ws.length-1,+o.si||0));it.o=(o.o&&typeof o.o==='object')?o.o:{}}}
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
 if(drag||document.hidden||view==='switch')return;const ae=document.activeElement;if(ae&&/^cu-/.test(ae.id||''))return;
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

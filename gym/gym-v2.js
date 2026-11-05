/* Training app: dark gym look, stage 1 (phones only). It re-arranges the existing screens and keeps every original element, id and handler, so nothing the app does is removed. */
(function(){
'use strict';
var mq=window.matchMedia('(max-width:700px)');
var classic=false;try{classic=localStorage.getItem('gym-look')==='classic'}catch(e){}
if(!mq.matches||classic) return;                       // laptop or Classic look: leave the page exactly as it was
var $=function(id){return document.getElementById(id)};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var toast=function(m){try{window.showHistToast&&window.showHistToast(m)}catch(e){}};
document.body.classList.add('gv2');
// rotating across the 700px line: reload once so the right look is used
mq.addEventListener&&mq.addEventListener('change',function(){location.reload()});

function el(tag,cls,html){var e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e}

/* ---------- top bar with the ⋯ menu ---------- */
var root=$('app-root'),navWrap=document.querySelector('.nav-wrap');
var top=el('div','gv-top','<b>Training</b><button type="button" class="gv-more" id="gv-more" aria-label="More options">⋯</button>');
root.insertBefore(top,root.firstChild);
var menu=el('div','gv-menu');menu.id='gv-menu';
function mi(label,fn,cls){var b=el('button',cls||'',label);b.type='button';b.addEventListener('click',function(){menu.classList.remove('on');fn()});menu.appendChild(b)}
document.body.appendChild(menu);
$('gv-more').addEventListener('click',function(e){e.stopPropagation();menu.classList.toggle('on')});
document.addEventListener('click',function(e){if(!menu.contains(e.target))menu.classList.remove('on')});

/* ---------- sheets ---------- */
function sheet(id,title){
  var s=el('div','gv-sheet');s.id=id;
  s.innerHTML='<div class="gv-sheet-card"><div class="gv-sheet-head"><b>'+title+'</b><button type="button" class="gv-x" aria-label="Close">✕</button></div><div class="gv-sheet-body"></div></div>';
  s.addEventListener('click',function(e){if(e.target===s)close(s)});
  s.querySelector('.gv-x').addEventListener('click',function(){close(s)});
  document.body.appendChild(s);return s}
function open_(s){s.classList.add('on')}
function close(s){s.classList.remove('on')}

/* ---------- merged Progress tab: Body | Training | Food ---------- */
var viewP=$('view-progress'),viewD=$('view-diet');
var gBody=el('div'),gTrain=el('div'),gFood=el('div');gBody.id='pg-body';gTrain.id='pg-training';gFood.id='pg-food';
var kids=$$('#view-progress > *').filter(function(n){return !n.classList.contains('page-lead')});
var weightCard=$('chart-weight')&&$('chart-weight').closest('.chart-card');
kids.forEach(function(n){
  var h=n.innerHTML||'';
  if(n.contains($('bs-height'))||n.contains($('trophy-shelf'))) gBody.appendChild(n);
  else if(n.contains($('an-nutrition-wrap'))||n.id==='an-nutrition-wrap'||n.id==='an-nutrition-note') gFood.appendChild(n);
  else gTrain.appendChild(n);
});
if(weightCard){gBody.insertBefore(weightCard,gBody.firstChild)}
['an-nutrition-wrap','an-nutrition-note'].forEach(function(id){var n=$(id);if(n)gFood.appendChild(n)});
// the old Today energy ring lives with Food now (calorie burn and net calories)
var energyWrap=el('div','energy-wrap');var heroNext=document.querySelector('.hero-next');if(heroNext)energyWrap.appendChild(heroNext);
gFood.insertBefore(energyWrap,gFood.firstChild);
$$('#view-diet > *').filter(function(n){return !n.classList.contains('page-lead')}).forEach(function(n){gFood.appendChild(n)});
var pseg=el('div','gv-pseg','<button type="button" data-pg="body">Body</button><button type="button" data-pg="training">Training</button><button type="button" data-pg="food">Food</button>');
viewP.appendChild(pseg);viewP.appendChild(gBody);viewP.appendChild(gTrain);viewP.appendChild(gFood);
var curSeg='body';
function setSeg(s){
  curSeg=s;['body','training','food'].forEach(function(k){document.body.classList.toggle('pg-'+k,k===s)});
  $$('button',pseg).forEach(function(b){b.classList.toggle('on',b.dataset.pg===s)});
  if(s==='food'&&window.loadLiveDietData&&window.renderDiet){loadLiveDietData().then(renderDiet).catch(function(){})}
  setTimeout(function(){try{window.dispatchEvent(new Event('resize'))}catch(e){}},60);
}
pseg.addEventListener('click',function(e){var b=e.target.closest('button[data-pg]');if(b)setSeg(b.dataset.pg)});
var origOpen=window.openView;
window.openView=function(v){
  if(v==='diet'){origOpen('progress');setSeg('food');return}
  origOpen(v);
  if(v==='progress')setSeg(curSeg);
};
setSeg('body');

/* ---------- Today ---------- */
// couple streak: one small line, only while either of you has a streak
var hero=$('today-hero');var heroLeft=hero&&hero.firstElementChild;
var streak=el('div','gv-streak');streak.style.display='none';
var heroTime=$('hero-time');if(heroTime&&heroTime.parentNode)heroTime.parentNode.insertBefore(streak,heroTime.nextSibling);
function syncStreak(){
  var t=($('stat-couple')||{}).textContent||'';var m=t.match(/(\d+)\s*d\D+(\d+)\s*d/);
  if(!m){streak.style.display='none';return}
  var a=+m[1],b=+m[2];
  if(a>0||b>0){streak.style.display='';streak.textContent='Streak '+a+' day'+(a===1?'':'s')+' · Anusha '+b+' day'+(b===1?'':'s')}
  else streak.style.display='none';
}
if($('stat-couple'))new MutationObserver(syncStreak).observe($('stat-couple'),{childList:true,characterData:true,subtree:true});
syncStreak();

// goals rings, filled from the targets the app already tracks (diet diary, workouts, steps)
var goals=el('div','gv-goals','<div class="gh"><b>Today\'s goals</b><span>auto-tracked</span></div><div class="gv-rings" id="gv-rings"></div>');
var metrics=document.querySelector('.today-metrics.dash');
if(metrics)metrics.parentNode.insertBefore(goals,metrics);
var GOAL_MAP=[['Calories','Calories'],['Protein','Protein'],['Steps','Steps'],['Lifting','Workouts'],['Cardio','Cardio']];
function renderGoals(){
  var rows=$$('#today-target-bars .target-row'),box=$('gv-rings');if(!box)return;
  var by={};rows.forEach(function(r){by[r.dataset.label]=r});
  var html='';
  GOAL_MAP.forEach(function(g){
    var r=by[g[0]];if(!r)return;var v=r.querySelector('.tg-val');if(!v)return;
    var cur=parseFloat(v.textContent),tg=parseFloat((r.querySelector('.tg-target')||{}).textContent);if(!tg)return;
    var p=Math.max(0,Math.min(100,Math.round(100*cur/tg)));
    var show=cur>=1000?(Math.round(cur/100)/10)+'k':(Math.round(cur*10)/10);
    html+='<button type="button" class="gv-ring'+(p>=100?' full':'')+'" style="--p:'+p+'" data-goal="'+g[0]+'"><i>'+(p>=100?'✓':show)+'</i>'+g[1]+'</button>';
  });
  box.innerHTML=html||'<span class="panel-subtitle">Goals appear once your plan has daily targets.</span>';
}
if($('today-target-bars'))new MutationObserver(renderGoals).observe($('today-target-bars'),{childList:true,subtree:true,characterData:true});
goals.addEventListener('click',function(e){if(e.target.closest('.gv-ring')){var d=$('gv-targets');if(d){d.open=true;d.scrollIntoView({behavior:'smooth',block:'start'})}}});

// targets panel folded under "Targets" (the pencil edit still works inside)
var tp=$('today-targets-panel');
if(tp){var det=el('details','gv-det');det.id='gv-targets';var sm=el('summary','','Targets and edit');det.appendChild(sm);tp.parentNode.insertBefore(det,tp);det.appendChild(tp)}

/* check-in sheet: Morning | Night. The original form and every field stay; knee, energy and the habit list are hidden (habits now track themselves). */
var ci=sheet('ci-sheet','Check-in');var ciBody=$('ci-sheet').querySelector('.gv-sheet-body');
var ciSeg=el('div','gv-seg','<button type="button" data-m="morning" class="on">Morning</button><button type="button" data-m="night">Night</button>');
ciBody.appendChild(ciSeg);
var cbar=document.querySelector('.control-bar.mini');if(cbar)ciBody.appendChild(cbar);
var cp=$('checkin-panel');ciBody.appendChild(cp);
function fieldOf(id){var i=$(id);return i&&(i.closest('.field')||i.parentNode)}
['f-knee','f-energy'].forEach(function(id){var f=fieldOf(id);if(f)f.classList.add('gv-hide')});
var habit=$('habit-list');if(habit&&habit.parentNode)habit.parentNode.classList.add('gv-hide');
['f-weight','f-sleep','f-waist'].forEach(function(id){var f=fieldOf(id);if(f)f.classList.add('ci-morning')});
['f-steps','f-hunger','f-notes'].forEach(function(id){var f=fieldOf(id);if(f)f.classList.add('ci-night')});
var per=$('period-field');if(per)per.classList.add('ci-night');
var wf=$('water-label')&&$('water-label').closest('.field');
// waist is a weekly number: shown on Sundays, otherwise one tap away
var waistF=fieldOf('f-waist');var isSunday=new Date().getDay()===0;
var waistLink=el('button','gv-link ci-morning','+ Add waist (weekly)');waistLink.type='button';
if(waistF&&!isSunday){waistF.classList.add('gv-hide');waistF.parentNode.parentNode.insertBefore(waistLink,waistF.parentNode.nextSibling);waistLink.addEventListener('click',function(){waistF.classList.remove('gv-hide');waistLink.style.display='none'})}
ciSeg.addEventListener('click',function(e){var b=e.target.closest('button[data-m]');if(!b)return;setCi(b.dataset.m)});
function setCi(m){ci.classList.remove('morning','night');ci.classList.add(m);$$('button',ciSeg).forEach(function(b){b.classList.toggle('on',b.dataset.m===m)})}
setCi('morning');
function openCheckin(){
  try{if($('log-date').value!==todayStr())stepDateInput('log-date',0)}catch(e){}
  var h=new Date().getHours();setCi(h>=17?'night':'morning');open_(ci)}
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('#command-checkin');if(b){e.stopImmediatePropagation();e.preventDefault();openCheckin()}},true);
var sm2=$('save-msg-today');
if(sm2)new MutationObserver(function(){if(/saved|✓/i.test(sm2.textContent)){setTimeout(function(){close(ci)},700)}}).observe(sm2,{childList:true,characterData:true,subtree:true});

/* water: its own sheet with a pace line; the Today card has a one-tap +250 */
var ws=sheet('wt-sheet','Water');var wsBody=ws.querySelector('.gv-sheet-body');
var wbig=el('div','gv-wbig','<div class="r" id="gv-wr" style="--p:0"><b id="gv-wr-n">0</b></div><div><div class="panel-subtitle">Today</div><div style="font-weight:700;font-size:16px" id="gv-w-left"></div><div class="gv-pace-t" id="gv-w-pace" style="font-size:12px;font-weight:600"></div></div>');
var pace=el('div','gv-pace','<i id="gv-pace-fill"></i><u id="gv-pace-now"></u>');
var paceLab=el('div','panel-subtitle','The line is where you should be by now. Edit single drinks in the Hub Water widget.');
wsBody.appendChild(wbig);wsBody.appendChild(pace);wsBody.appendChild(paceLab);
if(wf){wf.querySelector('.field-label')&&(wf.querySelector('.field-label').style.display='none');wsBody.appendChild(wf)}
function waterGoal(){var t=(($('water-label')||{}).textContent||'');var m=t.match(/(\d+(?:\.\d+)?)\s*L\b/g);if(m&&m.length){var n=parseFloat(m[m.length-1]);if(n>0)return n}return 3.5}
function paceInfo(){
  var goal=waterGoal(),cur=parseFloat(($('water-value')||{}).textContent)||0;
  var now=new Date(),h=now.getHours()+now.getMinutes()/60,start=7,end=22;
  var frac=Math.max(0,Math.min(1,(h-start)/(end-start)));var want=goal*frac;
  return{goal:goal,cur:cur,want:want,frac:frac,diff:Math.round((want-cur)*1000)}
}
function renderWater(){
  var p=paceInfo();var pct=Math.min(100,Math.round(100*p.cur/p.goal));
  if($('gv-wr')){$('gv-wr').style.setProperty('--p',pct);$('gv-wr-n').textContent=pct+'%'}
  if($('gv-w-left'))$('gv-w-left').textContent=p.cur.toFixed(1)+' of '+p.goal+' L';
  var msg=p.diff>50?p.diff+' ml behind pace':p.diff<-50?(-p.diff)+' ml ahead of pace':'On pace';
  var ok=p.diff<=50;
  if($('gv-w-pace')){$('gv-w-pace').textContent=msg;$('gv-w-pace').style.color=ok?'var(--success)':'#F0A84E'}
  if($('gv-pace-fill'))$('gv-pace-fill').style.width=pct+'%';
  if($('gv-pace-now'))$('gv-pace-now').style.left=Math.round(100*p.want/p.goal)+'%';
  var card=$('gv-watercard');if(card){card.querySelector('.v').innerHTML=p.cur.toFixed(1)+'<small>/ '+p.goal+' L</small>';var pp=card.querySelector('.p');pp.textContent=msg;pp.className='p'+(ok?' ok':'')}
}
var wcard=el('div','gv-watercard','<div><div class="l">Water</div><div class="v"></div><div class="p"></div></div><button type="button" class="btn primary" id="gv-w-add" style="padding:12px 18px">+250</button>');
wcard.id='gv-watercard';
var wt=$('week-grid')&&$('week-grid').closest('.panel');
var lay=document.querySelector('#view-today .layout-2');
if(metrics)metrics.parentNode.insertBefore(wcard,metrics.nextSibling);
wcard.addEventListener('click',function(e){if(e.target.closest('#gv-w-add')){var b=document.querySelector('.water-add[data-add="0.25"]');if(b)b.click();return}openWater()});
function openWater(){renderWater();open_(ws)}
if($('water-value'))new MutationObserver(renderWater).observe($('water-value'),{childList:true,characterData:true,subtree:true});
setInterval(renderWater,60000);renderWater();

/* ---------- History: Daily | Workouts | Cardio ---------- */
(function(){
  var panels=[['hist-daily-sub','hist-daily'],['hist-lift-sub','hist-lift'],['hist-cardio-sub','hist-cardio']];
  panels.forEach(function(p){var n=$(p[0]);var pn=n&&n.closest('.panel');if(pn)pn.classList.add(p[1])});
  var view=$('view-history');var filt=$('hist-clear-filters')&&$('hist-clear-filters').closest('.panel');
  var seg=el('div','gv-pseg','<button type="button" data-h="daily" class="on">Daily</button><button type="button" data-h="lift">Workouts</button><button type="button" data-h="cardio">Cardio</button>');
  if(filt){filt.parentNode.insertBefore(seg,filt);
    var d=el('details','gv-det');d.appendChild(el('summary','','Filters, jump to date, search'));filt.parentNode.insertBefore(d,filt);d.appendChild(filt)}
  else view.insertBefore(seg,view.firstChild);
  function setH(h){['daily','lift','cardio'].forEach(function(k){document.body.classList.toggle('hs-'+k,k===h)});$$('button',seg).forEach(function(b){b.classList.toggle('on',b.dataset.h===h)})}
  seg.addEventListener('click',function(e){var b=e.target.closest('button[data-h]');if(b)setH(b.dataset.h)});
  setH('daily');
})();

/* ---------- the ⋯ menu ---------- */
mi('Backup and restore',function(){var b=$('backup-open');if(b)b.click()});
mi('Export history (CSV)',function(){window.openView('history');['daily','lift','cardio'].forEach(function(t){try{window.histExportCsv(t)}catch(e){}})});
mi('Trash',function(){window.openView('history');var t=$('hist-trash-panel');setTimeout(function(){if(t&&t.style.display!=='none')t.scrollIntoView({behavior:'smooth'});else toast('Trash is empty')},300)});
mi('Plate calculator',function(){try{window.openPlateCalc(60,'kg','')}catch(e){toast('Open an exercise to use plates')}});
mi('Start date',function(){window.openView('today');var b=document.querySelector('.edit-start-btn');if(b)b.click();else toast('The start date is fixed by your plan')});
mi('Switch profile',function(){try{window.showProfilePicker()}catch(e){}});
mi('Classic look',function(){try{localStorage.setItem('gym-look','classic')}catch(e){}location.reload()});
mi('Sign out',function(){var b=$('signout-btn');if(b)b.click()},'red');

/* charts follow the dark look */
if(window.Chart&&Chart.defaults){try{Chart.defaults.color='#9AA0AE';Chart.defaults.borderColor='rgba(255,255,255,.08)'}catch(e){}}
renderGoals();
})();

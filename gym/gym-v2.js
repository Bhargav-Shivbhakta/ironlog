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


/* this week's schedule: folded away, opens on tap */
(function(){var g=$('week-grid'),pn=g&&g.closest('.panel');if(!pn)return;
 var d=el('details','gv-det');d.id='gv-week';d.appendChild(el('summary','',"This week's schedule"));pn.parentNode.insertBefore(d,pn);d.appendChild(pn);
 var h=pn.querySelector('.panel-head');if(h)h.style.display='none';
 var sub=el('div','panel-subtitle','Tap a day for a full preview of its workout.');pn.insertBefore(sub,g)})();


/* ---------- Train tab: compact exercise cards ---------- */
(function(){
  var list=$('exercise-list');if(!list)return;
  var open={},busy=false;
  var simple=true;try{simple=localStorage.getItem('gym-simple')!=='0'}catch(e){}
  function setSimple(v){simple=v;document.body.classList.toggle('gv-simple',v);try{localStorage.setItem('gym-simple',v?'1':'0')}catch(e){}
    var b=$('gv-mode');if(b)b.textContent=v?'View: Simple · switch':'View: Detailed · switch'}
  document.body.classList.toggle('gv-simple',simple);
  var lb=$('live-start');if(lb)lb.textContent='Start guided workout';
  var cb=document.querySelector('#view-train .control-bar');
  if(cb){var mb=el('button','gv-modebtn','');mb.type='button';mb.id='gv-mode';
    mb.addEventListener('click',function(){setSimple(!simple)});cb.appendChild(mb);setSimple(simple)}
  mi(simple?'Detailed view (more numbers)':'Simple view',function(){setSimple(!simple)});
  var EFF=[['3','Easy'],['6','Good'],['9','Hard']];
  function done(tr){var w=tr.querySelector('.inp-weight'),r=tr.querySelector('.inp-reps');return !!(w&&r&&w.value!==''&&r.value!=='')}
  function dots(card){
    var rows=$$('tbody tr',card),d=card.querySelector('.gv-dots');if(!d){d=el('div','gv-dots');var m=card.querySelector('.ex-meta');if(m)m.parentNode.insertBefore(d,m.nextSibling)}
    var n=rows.filter(done).length;
    d.innerHTML=rows.map(function(r){return '<i class="'+(done(r)?'on':'')+'"></i>'}).join('')+'<span>'+n+'/'+rows.length+' sets</span>';
    card.classList.toggle('gv-done',rows.length>0&&n===rows.length);
  }
  function effort(tr){
    var sel=tr.querySelector('.inp-effort');if(!sel||tr.querySelector('.gv-eff'))return;
    var g=el('div','gv-eff');
    g.innerHTML=EFF.map(function(e){return '<button type="button" data-v="'+e[0]+'">'+e[1]+'</button>'}).join('');
    function sync(){$$('button',g).forEach(function(b){b.classList.toggle('on',sel.value===b.dataset.v)})}
    g.addEventListener('click',function(ev){var b=ev.target.closest('button');if(!b)return;sel.value=sel.value===b.dataset.v?'':b.dataset.v;sel.dispatchEvent(new Event('change',{bubbles:true}));sync()});
    sel.addEventListener('change',sync);sel.parentNode.appendChild(g);sync();
  }
  function enhance(){
    if(busy)return;busy=true;
    try{
      var cards=$$('.ex-card',list),first=true;
      if(cards.length&&!window.__gvReady)window.__gvReady=Math.round(performance.now());
      cards.forEach(function(c){
        $$('tbody tr',c).forEach(effort);dots(c);
        $$('.last-time-cell',c).forEach(function(t){t.classList.toggle('gv-empty',/^\s*[—-]?\s*$/.test(t.textContent))});
        var tw=c.querySelector('.table-wrap');if(tw&&!tw.querySelector('.gv-colh')){var u=(c.dataset.unit||'lb')==='kg'?'kg':'lb';tw.insertBefore(el('div','gv-colh','<span></span><span>Weight ('+u+')</span><span>Reps</span><span></span>'),tw.firstChild)}
        var id=c.dataset.exid;
        if(!(id in open)){open[id]=first&&!c.classList.contains('gv-done');}
        if(!c.classList.contains('gv-done'))first=false;
        c.classList.toggle('gv-open',!!open[id]);
        if(!c.dataset.gv){c.dataset.gv='1';
          c.querySelector('.ex-head').addEventListener('click',function(e){
            if(e.target.closest('.drag-handle,.ex-unit-toggle,button,input,select'))return;
            open[id]=!c.classList.contains('gv-open');c.classList.toggle('gv-open',open[id])});
        }
      });
    }finally{busy=false}
  }
  new MutationObserver(function(){enhance()}).observe(list,{childList:true});
  list.addEventListener('input',function(e){var c=e.target.closest('.ex-card');if(c)dots(c)});
  list.addEventListener('change',function(e){var c=e.target.closest('.ex-card');if(c)dots(c)});
  list.addEventListener('click',function(e){
    var c=e.target.closest('.ex-card');if(!c)return;
    if(e.target.closest('.btn-add-set,.del-set-btn')){setTimeout(function(){$$('tbody tr',c).forEach(effort);dots(c)},60)}
    if(e.target.closest('.btn-log-exercise')){setTimeout(function(){
      if(!/logged|saved|✓/i.test((c.querySelector('.ex-save-msg')||{}).textContent||''))return;
      open[c.dataset.exid]=false;c.classList.remove('gv-open');
      var n=c.nextElementSibling;while(n&&!(n.classList.contains('ex-card')&&!n.classList.contains('gv-done')))n=n.nextElementSibling;
      if(n&&n.dataset.exid){open[n.dataset.exid]=true;n.classList.add('gv-open');n.scrollIntoView({behavior:'smooth',block:'start'})}},900)}
  });
  enhance();
  var wuSeen={};function foldWu(){var w=$('warmup-card');if(w&&!wuSeen[w.dataset.date]){wuSeen[w.dataset.date]=1;w.removeAttribute('open')}}
  new MutationObserver(foldWu).observe($('view-train'),{childList:true,subtree:true});foldWu();
})();


/* ---------- Train tab: the other cards, folded and tidied ---------- */
(function(){
  function fold(node,title,id,openIt){if(!node||!node.parentNode)return;var d=el('details','gv-det');if(id)d.id=id;if(openIt)d.open=true;d.appendChild(el('summary','',title));node.parentNode.insertBefore(d,node);d.appendChild(node);return d}
  var ac=$('add-exercise-card');if(ac){var h=ac.querySelector('.ex-head');if(h)h.style.display='none';fold(ac,'+ Add an exercise','gv-add')}
  var cc=$('cardio-card');if(cc)fold(cc,'Cardio','gv-cardio',true);
  var ss=$('steps-summary-card');if(ss)fold(ss,'Steps breakdown','gv-steps');
  var tr=$('training-rules');var trp=tr&&tr.closest('.panel');if(trp){var th=trp.querySelector('.panel-head');if(th)th.style.display='none';fold(trp,'Training rules','gv-rules')}
})();

/* ---------- rest timer: stays on screen while you move around, buzzes and notifies when done ---------- */
(function(){
  var pill=el('div','gv-rest');pill.id='gv-rest';
  pill.innerHTML='<b id="gv-rest-t">0:00</b><span>Rest</span><button type="button" id="gv-rest-plus">+15s</button><button type="button" id="gv-rest-skip">Skip</button>';
  document.body.appendChild(pill);
  function active(){
    var b=null;$$('.rest-btn').forEach(function(x){if(x._endAt&&x.disabled)b=x});return b}
  var alerted={};
  function notify(){
    try{
      if(!('Notification' in window)||Notification.permission!=='granted')return;
      var opts={body:'Time for your next set.',tag:'gym-rest',vibrate:[300,120,300],requireInteraction:false};
      if(navigator.serviceWorker&&navigator.serviceWorker.getRegistration){navigator.serviceWorker.getRegistration().then(function(r){if(r)r.showNotification('Rest is over',opts);else new Notification('Rest is over',opts)})}
      else new Notification('Rest is over',opts);
    }catch(e){}
  }
  function tick(){
    var b=active(),map=(window.readRestTimers&&readRestTimers())||{};
    if(b){
      var rem=Math.max(0,Math.round((b._endAt-Date.now())/1000));
      $('gv-rest-t').textContent=Math.floor(rem/60)+':'+String(rem%60).padStart(2,'0');
      pill.classList.add('on');
      if(rem<=0&&!alerted[b._endAt]){alerted[b._endAt]=1;if(document.hidden)notify()}
    }else pill.classList.remove('on');
  }
  setInterval(tick,500);document.addEventListener('visibilitychange',tick);
  $('gv-rest-skip').addEventListener('click',function(){var b=active();if(b)stopRestTimer(b)});
  $('gv-rest-plus').addEventListener('click',function(){var b=active();if(b)startRestTimer(b,(b._total||60)+15,b._endAt+15000)});
  // first time a rest starts, ask for notification permission (needs a tap, and works best from the Home Screen app)
  var asked=false;
  document.addEventListener('click',function(e){
    if(asked||!e.target.closest('.rest-btn,#live-start,#command-primary'))return;asked=true;
    try{if('Notification' in window&&Notification.permission==='default')Notification.requestPermission()}catch(x){}
  },true);
  // when the app has been in the background, a timer that ran out shows its alert on return
  document.addEventListener('visibilitychange',function(){if(!document.hidden)setTimeout(tick,50)});
})();

/* ---------- saving status: Offline notice (writes queue on the phone and send when you are back online) ---------- */
(function(){
  var chip=el('div','gv-net','Offline · your logs are kept on this phone and sync when you are back online');
  document.body.appendChild(chip);
  function u(){chip.classList.toggle('on',navigator.onLine===false)}
  window.addEventListener('online',function(){u();toast('Back online · synced')});window.addEventListener('offline',u);u();
})();

/* ---------- finish summary with next-time suggestions ---------- */
(function(){
  var summ=sheet('fin-sheet','Workout finished');var body=summ.querySelector('.gv-sheet-body');
  function num(x){var n=parseFloat(x);return isNaN(n)?0:n}
  function collect(){
    var out={sets:0,vol:0,prs:0,ex:[]};
    $$('#exercise-list .ex-card').forEach(function(c){
      var unit=(c.dataset.unit==='kg'?'kg':'lb'),name=(c.querySelector('.ex-name')||{}).textContent||'';
      var mm=((c.querySelector('.ex-meta')||{}).textContent||'').match(/(\d+)\s*[–-]\s*(\d+)/);
      var lo=mm?+mm[1]:8,hi=mm?+mm[2]:12,rows=[];
      $$('tbody tr',c).forEach(function(r){var w=num((r.querySelector('.inp-weight')||{}).value),n=num((r.querySelector('.inp-reps')||{}).value);if(w>0&&n>0){rows.push([w,n]);out.sets++;out.vol+=w*n}if(r.querySelector('.pr-cell')&&r.querySelector('.pr-cell').textContent.trim())out.prs++});
      if(!rows.length)return;
      var top=Math.max.apply(null,rows.map(function(r){return r[0]}));
      var hitTop=rows.every(function(r){return r[0]>=top*0.999&&r[1]>=hi});
      var step=unit==='kg'?2.5:5;
      var tip=hitTop?('Try '+(top+step)+' '+unit+' next time'):('Keep '+top+' '+unit+' and aim for one more rep');
      out.ex.push({name:name,unit:unit,summary:rows.length+' sets · top '+top+' '+unit,tip:tip,up:hitTop});
    });
    return out}
  function show(durationSec){
    var d=collect(),mins=Math.max(1,Math.round((durationSec||0)/60));
    var vol=Math.round(d.vol).toLocaleString();
    body.innerHTML='<div class="gv-fin-stats"><div><b>'+mins+'</b><span>min</span></div><div><b>'+d.sets+'</b><span>sets</span></div><div><b>'+vol+'</b><span>total lifted</span></div></div>'
      +(d.prs?'<div class="gv-pr">🏆 '+d.prs+' new personal record'+(d.prs>1?'s':'')+' today</div>':'')
      +'<div class="panel-subtitle" style="margin:12px 0 6px">Next time (a suggestion, not a rule)</div>'
      +(d.ex.length?d.ex.map(function(e){return '<div class="gv-sug"><div><b>'+e.name+'</b><small>'+e.summary+'</small></div><span class="'+(e.up?'up':'')+'">'+e.tip+'</span></div>'}).join(''):'<div class="panel-subtitle">Log some sets to get suggestions.</div>')
      +'<button type="button" class="btn primary" id="gv-fin-ok" style="width:100%;margin-top:14px;min-height:50px">Done</button>';
    $('gv-fin-ok').addEventListener('click',function(){close(summ)});
    open_(summ);try{navigator.vibrate&&navigator.vibrate([60,40,120])}catch(e){}
  }
  var orig=window.endLiveSession;
  if(typeof orig==='function'){window.endLiveSession=function(skip,dur){var snap=dur!=null?collect():null;var r=orig.apply(this,arguments);if(dur!=null)show(dur);return r}}
})();

/* ---------- first-time help ---------- */
(function(){
  var hs=sheet('help-sheet','How this works');var hb=hs.querySelector('.gv-sheet-body');
  hb.innerHTML='<div class="gv-help"><div><b>1 · Start</b><p>Tap <i>Start guided workout</i> on Today. It walks you through each exercise.</p></div>'
   +'<div><b>2 · Log</b><p>Type weight and reps for each set. Tap <i>Log this exercise</i> and the next one opens by itself.</p></div>'
   +'<div><b>3 · Rest</b><p>Tap <i>Start rest</i>. A timer stays on screen and buzzes when it is over.</p></div>'
   +'<div class="g"><b>Words</b><p><i>Easy / Good / Hard</i> = how the set felt. <i>PR</i> = your best ever. <i>Simple view</i> hides the extra numbers; switch to Detailed any time.</p></div>'
   +'<button type="button" class="btn primary" id="gv-help-ok" style="width:100%;min-height:50px">Got it</button></div>';
  $('gv-help-ok').addEventListener('click',function(){close(hs);try{localStorage.setItem('gym-help-seen','1')}catch(e){}});
  mi('How this works',function(){open_(hs)});
  var seen=false;try{seen=localStorage.getItem('gym-help-seen')==='1'}catch(e){}
  if(!seen)setTimeout(function(){open_(hs)},1500);
})();

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
mi('Open Diet app (meals, food search)',function(){location.href='../apps/diet.html'+(window.activeProfile&&activeProfile.id==='anusha'?'?profile=Anusha':'?profile=Bhargav')});
mi('Open Skin app',function(){location.href='../apps/skin.html'});
if(!document.body.classList.contains('embedded'))mi('All apps (Hub)',function(){location.href='../index.html'});
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

(function(){
 if(window.__dv2)return;window.__dv2=1;
 var I={dashboard:'<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',mealplan:'<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>',cook:'<path d="M7 3v8a2 2 0 004 0V3M9 11v10M17 3c-2 2-3 5-3 8h3v10"/>',pantry:'<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 016 0v2"/>',progress:'<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',history:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',settings:'<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',more:'<path d="M5 12h.01M12 12h.01M19 12h.01"/>',link:'<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6"/>'};
 var svg=function(k){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+(I[k]||I.link)+'</svg>'};
 var MAIN=['dashboard','mealplan','cook','progress'];I.habits='<path d="M5 12l5 5L20 7"/>';
 var mq=window.matchMedia('(max-width:700px)');
 function strip(t){return (t||'').replace(/^[^A-Za-z]+/,'').trim()}
 function build(){
  document.body.classList.add('dv2');
  var nav=document.getElementById('nav');if(!nav)return;
  var btns=[].slice.call(nav.querySelectorAll('button[data-page]'));
  var bar=document.createElement('div');bar.id='dv-nav';
  var label={dashboard:'Today',mealplan:'Meals',cook:'Cook',progress:'Progress',pantry:'Pantry',history:'History',settings:'Goals & settings',habits:'Habits'};
  bar.innerHTML=MAIN.map(function(p){return '<button data-p="'+p+'">'+svg(p)+label[p]+'</button>'}).join('')+'<button data-p="__more">'+svg('more')+'More</button>';
  document.body.appendChild(bar);
  var sh=document.createElement('div');sh.id='dv-sheet';
  function profile(){var b=document.body.dataset.profile||'';return b}
  function sheetHtml(){
   var rest=btns.filter(function(b){return MAIN.indexOf(b.dataset.page)<0});
   var h='<div class="in"><div class="gr"></div><h3>More in Diet</h3>'+rest.map(function(b){return '<button class="row" data-go="'+b.dataset.page+'">'+svg(b.dataset.page)+(label[b.dataset.page]||strip(b.textContent))+'</button>'}).join('');
   h+='<h3>Profile</h3><div class="seg"><button data-pf="bhargav" class="'+(profile()==='bhargav'?'on':'')+'">Bhargav</button><button data-pf="anusha" class="'+(profile()==='anusha'?'on':'')+'">Anusha</button></div>';
   h+='<h3>Related apps</h3><a class="row" href="grocery.html">'+svg('pantry')+'Grocery</a><a class="row" id="dv-skin" href="skin.html">'+svg('user')+'Skin</a><a class="row" href="../gym/index.html">'+svg('link')+'Training (Gym)</a></div>';
   return h}
  document.body.appendChild(sh);
  function openSheet(){sh.innerHTML=sheetHtml();sh.classList.add('on');var s=document.getElementById('dv-skin');if(s)s.onclick=function(){try{var p=(typeof state!=='undefined'&&state.activeProfile)||'';this.href='skin.html?profile='+encodeURIComponent(p.charAt(0).toUpperCase()+p.slice(1))}catch(e){}}}
  sh.addEventListener('click',function(e){
   if(e.target===sh){sh.classList.remove('on');return}
   var g=e.target.closest('[data-go]');if(g){var o=nav.querySelector('button[data-page="'+g.dataset.go+'"]');if(o)o.click();sh.classList.remove('on');return}
   var f=e.target.closest('[data-pf]');if(f){var id=f.dataset.pf==='bhargav'?'profileBhargav':'profileAnusha';var pb=document.getElementById(id);if(pb)pb.click();sh.classList.remove('on')}});
  bar.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;if(b.dataset.p==='__more'){openSheet();return}var o=nav.querySelector('button[data-page="'+b.dataset.p+'"]');if(o)o.click();sync()});
  function sync(){var act=nav.querySelector('button.active');var p=act?act.dataset.page:'dashboard';[].forEach.call(bar.querySelectorAll('button'),function(b){var on=b.dataset.p===p||(b.dataset.p==='__more'&&MAIN.indexOf(p)<0);b.classList.toggle('on',on)})}
  new MutationObserver(sync).observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});sync();
  window.addEventListener('message',function(e){if(e.data&&e.data.type==='hub-back'&&sh.classList.contains('on')){sh.classList.remove('on');try{parent.postMessage({type:'hub-back-handled'},'*')}catch(x){}}});
 }
 function tabsScroll(){[].forEach.call(document.querySelectorAll('.subtabs'),function(s){var a=s.querySelector('button.active');if(a&&s.scrollWidth>s.clientWidth+2){try{s.scrollTo({left:a.offsetLeft-(s.clientWidth-a.offsetWidth)/2})}catch(e){}}})}
 new MutationObserver(function(){setTimeout(tabsScroll,30)}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
 function navIcons(){var nav=document.getElementById('nav');if(!nav)return;[].forEach.call(nav.querySelectorAll('button[data-page]'),function(b){if(b.querySelector('.dv-ic'))return;var k=b.dataset.page;var t=strip(b.textContent);b.innerHTML='<span class="dv-ic">'+svg(k)+'</span><span>'+t+'</span>'})}
 function start(){document.body.classList.add('dv2');navIcons();if(mq.matches)build();else mq.addEventListener&&mq.addEventListener('change',function(){if(mq.matches&&!document.getElementById('dv-nav'))build()})}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();

/* ---- Big-pot recipes: cooked once (e.g. khichdi for 3 days); Cook together shows grams of cooked food per plate ---- */
(function(){
 if(window.__dvPot)return;window.__dvPot=1;
 var G=new WeakSet();
 function isPot(r){return !!(r&&r.batch&&r.batch.on)}
 function ids(){return Object.keys((typeof state!=='undefined'&&state.profiles)||{})}
 function cal(p){var g=((state.profiles[p]||{}).goals||{});return +g.calories||2000}
 function share(r,pid){var b=r.batch||{},all=ids();if(all.indexOf(pid)<0)return 0;if(b.split&&b.split[pid]!=null&&!isNaN(+b.split[pid]))return Math.max(0,Math.min(100,+b.split[pid]))/100;var t=all.reduce(function(a,p){return a+cal(p)},0);return t?cal(pid)/t:1/all.length}
 function meals(r){var b=r.batch||{};return Math.max(1,(+b.days||1)*(+b.perDay||1))}
 function srv(r,pid){var s=share(r,pid);return s>0?meals(r)/s:1e9}
 function plateG(r,pid){return (+(r.batch&&r.batch.cookedG)||0)*share(r,pid)/meals(r)}
 function nm(p){return (state.profiles[p]&&state.profiles[p].name)||p}
 function e(s){return typeof esc==='function'?esc(s):String(s)}
 function R(n){return Math.round(n)}
 window.dvPot={isPot:isPot,share:share,meals:meals,plateG:plateG,srv:srv};
 function install(){if(typeof state==='undefined'||!state.recipes)return;state.recipes.forEach(function(r){
  if(isPot(r)){if(G.has(r))return;var b=r.batch;if(b.baseServings==null)b.baseServings=(typeof r.servings==='number'&&r.servings>0&&r.servings<1000)?r.servings:1;
   Object.defineProperty(r,'servings',{configurable:true,enumerable:true,get:function(){return srv(this,window.__dvPid||state.activeProfile)},set:function(v){}});G.add(r)}
  else if(G.has(r)){var base=(r.batch&&r.batch.baseServings)||1;Object.defineProperty(r,'servings',{configurable:true,enumerable:true,writable:true,value:base});G.delete(r)}})}
 function tagDiary(){if(!state.diary)return;var pots=state.recipes.filter(isPot);if(!pots.length)return;state.diary.forEach(function(x){if(x.dvPot||!x.detail)return;var own=pots.find(function(r){return r.name===x.name&&+r.batch.cookedG>0});if(own&&x.detail.indexOf(' g cooked')<0){x.detail=x.detail+' · '+R(plateG(own,x.profileId))+' g cooked';x.dvPot=1;return}var d=x.detail,hit=false;pots.forEach(function(r){if(d.split(' + ').indexOf(r.name)>=0&&r.batch.cookedG){d=d.split(' + ').map(function(s){return s===r.name?s+' ('+R(plateG(r,x.profileId))+' g)':s}).join(' + ');hit=true}});if(hit){x.detail=d;x.dvPot=1}})}
 function wrap(name,before,after){var o=window[name];if(typeof o!=='function'||o.__dvp)return;var f=function(){if(before)before.apply(this,arguments);var r=o.apply(this,arguments);if(after)after.apply(this,arguments);return r};f.__dvp=1;window[name]=f}
 /* ---- Cook together card for a pot recipe ---- */
 function potCard(r,m,pid){
  var g=plateG(r,pid),n=recipeServingN(r),b=r.batch,has=+b.cookedG>0;
  var ing=(r.items||[]).map(function(it){var f=food(it.foodId);return '<span><b>'+e(f?f.name:it.foodId)+'</b> '+cookQty(it.qty)+' '+e(it.unit||'')+'</span>'}).join(' · ');
  return '<div class="cook-rec dv-pot"><header><b>'+e(r.name)+' <span class="dv-pot-tag">From the pot</span></b><button class="icon-btn" title="Take out of this meal" onclick="cookRemove(\''+m.id+'\',\''+r.id+'\')">×</button></header>'+
   (has?'<div class="dv-serve"><span class="t">Serve '+e(nm(pid))+'</span><div class="big">'+R(g)+'<small> g cooked</small></div><div class="m">≈ '+R(n.calories)+' kcal · P '+R(n.protein)+' g · '+R(share(r,pid)*100)+'% of the pot ÷ '+meals(r)+' meal'+(meals(r)===1?'':'s')+'</div></div>'
       :'<div class="dv-serve none"><b>Weigh the pot after cooking</b><div class="m">Add the cooked weight to this recipe to see how much to serve.</div><button class="btn secondary small" onclick="editRecipe(\''+r.id+'\')">Add cooked weight</button></div>')+
   '<details class="dv-pot-in"><summary>Pot '+(has?Number(b.cookedG).toLocaleString()+' g · ':'')+'lasts '+(+b.days||1)+' day'+((+b.days||1)===1?'':'s')+' · What went in</summary><div>'+ing+'</div>'+(r.method?'<div class="cook-method">'+e(r.method)+'</div>':'')+'</details></div>'}
 /* ---- recipe editor ---- */
 function potUI(){
  if(document.getElementById('dv-potbox'))return;var meth=document.querySelector('#recipeFormCard .field.method');if(!meth)return;
  var box=document.createElement('div');box.id='dv-potbox';box.className='dv-potbox';
  box.innerHTML='<h3>How it shows in Cook together</h3><p class="subtle">Pick how this recipe is made, so Cook together and the Hub widget show the right thing.</p>'+
  '<label class="dv-opt" data-o="fresh"><input type="radio" name="dvpot" value="fresh"><span class="rd"></span><span><b>Made fresh for each plate</b><span>Shows each ingredient and amount, per person. Oats, eggs, shakes.</span></span></label>'+
  '<label class="dv-opt" data-o="pot"><input type="radio" name="dvpot" value="pot"><span class="rd"></span><span><b>Cooked once in a big pot</b><span>Shows how many grams of the cooked food to serve each person. Khichdi, dal, curry. Both of you can use it.</span></span></label>'+
  '<div class="dv-potf"><div class="field"><label for="dvCooked">Cooked weight of the whole pot (weigh it once after cooking)</label><div class="dv-unit"><input class="input" id="dvCooked" type="number" inputmode="decimal" min="0" step="1" placeholder="e.g. 2600"><b>g</b></div></div>'+
  '<div class="dv-two"><div class="field"><label for="dvDays">Lasts</label><div class="dv-unit"><input class="input" id="dvDays" type="number" inputmode="numeric" min="1" step="1"><b>days</b></div></div><div class="field"><label for="dvPer">Meals from it per day</label><div class="dv-unit"><input class="input" id="dvPer" type="number" inputmode="numeric" min="1" step="1"><b>each</b></div></div></div>'+
  '<div class="field"><label for="dvSplit">How the pot is shared</label><div class="dv-splitbar"><i id="dvSb1"></i><i id="dvSb2"></i></div><input id="dvSplit" type="range" min="0" max="100" step="1" aria-label="Share of the pot"><div class="dv-sl"><span id="dvS1"></span><span id="dvS2"></span></div><div class="dv-hint"><span id="dvSrc"></span> <button type="button" class="dv-link" id="dvReset">Use calorie targets</button></div></div>'+
  '<div class="dv-prev" id="dvPrev"></div></div>';
  meth.parentNode.insertBefore(box,meth.nextSibling);
  box.addEventListener('change',function(ev){if(ev.target.name==='dvpot'){var on=ev.target.value==='pot';if(on){draft.batch=Object.assign({days:3,perDay:1,cookedG:''},draft.batch||{},{on:true});if(draft.batch.baseServings==null)draft.batch.baseServings=+draft.servings||1}else if(draft.batch){draft.batch.on=false;draft.servings=draft.batch.baseServings||1;var sv=document.getElementById('servings');if(sv)sv.value=draft.servings}sync()}});
  box.addEventListener('input',function(ev){var t=ev.target,b=draft.batch;if(!b)return;if(t.id==='dvCooked')b.cookedG=t.value===''?'':+t.value;if(t.id==='dvDays')b.days=Math.max(1,+t.value||1);if(t.id==='dvPer')b.perDay=Math.max(1,+t.value||1);if(t.id==='dvSplit'){var p=ids();b.split={};b.split[p[0]]=+t.value;if(p[1])b.split[p[1]]=100-(+t.value)}sync(true)});
  box.querySelector('#dvReset').addEventListener('click',function(){if(draft.batch){delete draft.batch.split;sync()}});
 }
 function sync(soft){var box=document.getElementById('dv-potbox');if(!box||typeof draft==='undefined'||!draft)return;var b=draft.batch,on=isPot(draft),p=ids();
  box.classList.toggle('on',on);var card=document.getElementById('recipeFormCard');card&&card.classList.toggle('dv-isPot',on);
  box.querySelectorAll('input[name=dvpot]').forEach(function(x){x.checked=(x.value==='pot')===on});box.querySelectorAll('.dv-opt').forEach(function(l){l.classList.toggle('sel',(l.dataset.o==='pot')===on)});
  if(!on)return;var s1=share(draft,p[0]),s2=p[1]?share(draft,p[1]):0;
  if(!soft){box.querySelector('#dvCooked').value=b.cookedG||'';box.querySelector('#dvDays').value=b.days||1;box.querySelector('#dvPer').value=b.perDay||1}
  var sl=box.querySelector('#dvSplit');if(document.activeElement!==sl)sl.value=R(s1*100);
  box.querySelector('#dvSb1').style.width=(s1*100)+'%';box.querySelector('#dvSb2').style.width=(s2*100)+'%';
  box.querySelector('#dvS1').innerHTML='<span class="d b"></span>'+e(nm(p[0]))+' <b>'+R(s1*100)+'%</b>';box.querySelector('#dvS2').innerHTML=p[1]?e(nm(p[1]))+' <b>'+R(s2*100)+'%</b><span class="d a"></span>':'';
  box.querySelector('#dvSrc').textContent=b.split?'You set this split.':'From your calorie targets.';box.querySelector('#dvReset').style.display=b.split?'':'none';
  var pv=box.querySelector('#dvPrev');pv.innerHTML=+b.cookedG>0?'Each meal: '+p.map(function(x){return e(nm(x))+' <b>'+R(plateG(draft,x))+' g</b>'}).join(' · '):'Add the cooked weight to see each plate.'}
 function recipeTags(){var list=document.getElementById('recipeList');if(!list)return;state.recipes.filter(isPot).forEach(function(r){var btn=list.querySelector('[onclick="editRecipe(\''+r.id+'\')"]');var card=btn&&btn.closest('.saved-recipe');if(!card||card.querySelector('.dv-pot-tag'))return;var h=card.querySelector('h4');h&&h.insertAdjacentHTML('beforeend',' <span class="dv-pot-tag">Big pot · shared</span>');var sub=card.querySelector('.subtle');if(sub&&+r.batch.cookedG>0)sub.insertAdjacentHTML('beforeend','<br>Each meal: '+ids().map(function(p){return e(nm(p))+' '+R(plateG(r,p))+' g'}).join(' · '))})}
 function potBoth(){var el=document.getElementById('cookBoth');if(!el||typeof cookSlot==='undefined')return;var seen={},out=[];state.meals.filter(function(m){return m.slot===cookSlot}).forEach(function(m){(m.recipeIds||[]).forEach(function(id){var r=state.recipes.find(function(x){return x.id===id});if(isPot(r)&&!seen[r.id]){seen[r.id]=1;out.push(r)}})});if(!out.length)return;
  el.insertAdjacentHTML('beforeend','<div class="dv-potnote"><b>Big pot:</b> '+out.map(function(r){return e(r.name)+(+r.batch.cookedG>0?' ('+Number(r.batch.cookedG).toLocaleString()+' g, lasts '+(+r.batch.days||1)+' day'+((+r.batch.days||1)===1?'':'s')+')':' (add cooked weight)')}).join(' · ')+'. Serve each plate by weight below.</div>')}
 function boot(){
  install();
  wrap('persist',function(){install();tagDiary()});
  wrap('renderAll',install);
  wrap('recipeServingN',install);
  var oc=window.cookRecipeHtml;if(typeof oc==='function'&&!oc.__dvp){window.cookRecipeHtml=function(r,m,pid){if(isPot(r)){var keep=window.__dvPid;window.__dvPid=pid;try{return potCard(r,m,pid)}finally{window.__dvPid=keep}}return oc.apply(this,arguments)};window.cookRecipeHtml.__dvp=1}
  wrap('renderCook',install,potBoth);
  wrap('renderRecipes',install,recipeTags);
  potUI();wrap('renderBuilder',null,function(){potUI();sync()});wrap('clearRecipe',null,sync);
  sync();try{if(document.getElementById('cook')&&document.getElementById('cook').classList.contains('active'))renderCook();renderRecipes()}catch(x){}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,0)});else setTimeout(boot,0);
})();

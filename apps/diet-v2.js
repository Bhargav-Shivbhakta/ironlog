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
  function openSheet(){sh.innerHTML=sheetHtml();sh.classList.add('on');var s=document.getElementById('dv-skin');if(s)s.onclick=function(){try{var p=(window.state&&state.activeProfile)||'';this.href='skin.html?profile='+encodeURIComponent(p.charAt(0).toUpperCase()+p.slice(1))}catch(e){}}}
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

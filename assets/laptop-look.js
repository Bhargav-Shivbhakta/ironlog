/* Laptop "new look" switch. Classic = old Hub, New = Mac feel with Windows controls.
   Stored per device in localStorage key hub-lap-look ('new' default on wide screens, 'classic'). */
(function(){
  var KEY='hub-lap-look',d=document.documentElement;
  function get(){try{return localStorage.getItem(KEY)||'new'}catch(e){return 'new'}}
  function set(v){try{localStorage.setItem(KEY,v)}catch(e){}}
  function apply(){var wide=Math.min(window.innerWidth||9999,screen.width||9999)>700;d.classList.toggle('lap-look',wide&&get()==='new');paint()}
  function paint(){var m=get();document.querySelectorAll('#lap-look-toggle button').forEach(function(b){b.classList.toggle('on',b.dataset.look===m)})}
  window.addEventListener('resize',apply);
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('#lap-look-toggle button');
    if(b){set(b.dataset.look);apply();return}
    var w=e.target.closest&&e.target.closest('.lap-titlebar .lt-wc');
    if(!w)return;
    if(w.dataset.act==='max'){try{document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()}catch(x){}}
    else if(w.dataset.act==='close'){try{window.close()}catch(x){}}
  });
  document.addEventListener('keydown',function(e){
    if(!d.classList.contains('lap-look'))return;
    if((e.ctrlKey||e.metaKey)&&e.shiftKey&&(e.key==='N'||e.key==='n')){var q=document.querySelector('.lap-titlebar .lt-add');if(q){e.preventDefault();q.click()}}
  });
  /* ---- logo toggles sidebar ---- */
  document.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('#lap-logo')){var t=document.getElementById('sidebar-toggle');if(t)t.click()}});
  /* ---- app cards: vivid icon colours + one-line descriptions ---- */
  var COL={'to-do':['#5aa2ff','#1c6cf0'],schedule:['#8ea2ff','#4457e6'],calendar:['#ff8a7a','#e5483a'],pledge:['#ff7aa8','#db2a66'],chores:['#b58cff','#6a3bd6'],checklists:['#ffd25a','#f2960b'],clock:['#b4bcc9','#6a7385']};
  var PAL=[['#5ad1a0','#14966a'],['#ffa95a','#e8660b'],['#5ac8ff','#1f8fd1'],['#c58cff','#8a3bd6'],['#ff7aa8','#db2a66'],['#8ea2ff','#4457e6']];
  var DESC={'to-do':'Tasks, lists, repeats, dependency map and sticky notes',schedule:'Your daily routine, events, chores and free-time finder',calendar:'Month, week, day and agenda, with reminders and birthdays',pledge:'Make a promise, tick it daily, earn the prize',chores:'Whose turn, room health, plan my time',checklists:'Reusable lists, templates and archive',clock:'Alarms, timers, focus, world time and stopwatch',gym:'Log sets, track progress and rest timers',training:'Log sets, track progress and rest timers',grocery:'This week\u2019s list, pantry and restock',budget:'Spending vs your category budgets',diet:'Meals, protein and the week\u2019s plan',skin:'Morning and night routine, products and tracking',water:'Plan drinks and track your day'};
  function hash(t){var n=0;for(var i=0;i<t.length;i++)n=(n*31+t.charCodeAt(i))>>>0;return n}
  function decorate(){
    if(!d.classList.contains('lap-look'))return;
    document.querySelectorAll('.app-grid .app-card').forEach(function(c){
      if(c.dataset.lap)return;var st=c.querySelector('strong');if(!st)return;
      var k=st.textContent.trim().toLowerCase();c.dataset.lap='1';
      var col=COL[k]||PAL[hash(k)%PAL.length];c.style.setProperty('--c1',col[0]);c.style.setProperty('--c2',col[1]);
      var t=DESC[k];if(t){var s=document.createElement('span');s.className='lap-d';s.textContent=t;st.insertAdjacentElement('afterend',s)}
    });
  }
  new MutationObserver(function(){decorate()}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  /* ---- Ctrl K: search pages and apps ---- */
  var pal=null,items=[],sel=0;
  function build(){
    if(pal)return;pal=document.createElement('div');pal.className='lap-pal';
    pal.innerHTML='<div class="pw"><input id="lap-pq" placeholder="Search pages and apps" autocomplete="off"><div class="pl" id="lap-pl"></div></div>';
    document.body.appendChild(pal);
    pal.addEventListener('mousedown',function(e){if(e.target===pal)closeP()});
    var q=pal.querySelector('input');q.addEventListener('input',function(){sel=0;list()});
    q.addEventListener('keydown',function(e){
      if(e.key==='Escape'){closeP();return}
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();var n=items.length;if(n){sel=(sel+(e.key==='ArrowDown'?1:n-1))%n;mark()}return}
      if(e.key==='Enter'){e.preventDefault();go(items[sel])}
    });
    pal.querySelector('#lap-pl').addEventListener('click',function(e){var r=e.target.closest('.pi');if(r)go(items[+r.dataset.i])});
  }
  function all(){
    var out=[];
    document.querySelectorAll('.main-nav button').forEach(function(b){out.push({n:b.textContent.trim(),t:'Page',el:b})});
    document.querySelectorAll('.app-grid .app-card:not(.hidden-card)').forEach(function(c){var s=c.querySelector('strong');if(s)out.push({n:s.textContent.trim(),t:'App',el:c})});
    return out;
  }
  function list(){
    var q=(document.getElementById('lap-pq').value||'').trim().toLowerCase();
    items=all().filter(function(x){return !q||x.n.toLowerCase().indexOf(q)>-1});
    var box=document.getElementById('lap-pl');
    box.innerHTML=items.length?items.map(function(x,i){return '<div class="pi'+(i===sel?' on':'')+'" data-i="'+i+'"><span>'+x.n.replace(/</g,'&lt;')+'</span><small>'+x.t+'</small></div>'}).join(''):'<div class="pe">Nothing matches.</div>';
  }
  function mark(){document.querySelectorAll('#lap-pl .pi').forEach(function(e,i){e.classList.toggle('on',i===sel);if(i===sel)e.scrollIntoView({block:'nearest'})})}
  function openP(){build();pal.classList.add('on');var q=document.getElementById('lap-pq');q.value='';sel=0;list();q.focus()}
  function closeP(){if(pal)pal.classList.remove('on')}
  function go(x){if(!x)return;closeP();x.el.click()}
  document.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('#lap-search'))openP()});
  document.addEventListener('keydown',function(e){if(d.classList.contains('lap-look')&&(e.ctrlKey||e.metaKey)&&!e.shiftKey&&(e.key==='k'||e.key==='K')){e.preventDefault();openP()}});

  /* ---- Schedule: fold what sits under blocks that are not running (opens on tap, remembered while the page is open) ---- */
  var opened={};
  function foldSched(){
    if(!d.classList.contains('lap-look'))return;
    document.querySelectorAll('.widget-card[data-widget-type="schedule"] .sc-row').forEach(function(r){
      var u=r.querySelector('.sc-under');if(!u||r.dataset.lapF)return;r.dataset.lapF='1';
      var bk=r.querySelector('[data-sc-block]');var key=bk?bk.dataset.scBlock:'';
      if(r.classList.contains('sc-cur')){return}
      var n=u.querySelectorAll('.sc-u').length;if(!n)return;
      r.classList.add('lap-fold');if(opened['b'+key])r.classList.add('lap-open');
      var b=document.createElement('button');b.type='button';b.className='lap-kids';b.dataset.lapKey='b'+key;
      b.textContent=(r.classList.contains('lap-open')?'Hide ':'')+n+(n===1?' item':' items');
      u.parentNode.insertBefore(b,u);
    });
    document.querySelectorAll('.widget-card[data-widget-type="schedule"] .sc-any').forEach(function(a){
      if(a.dataset.lapF)return;a.dataset.lapF='1';var h=a.querySelector('h5');if(!h)return;
      var n=a.querySelectorAll('.sc-u').length;a.classList.add('lap-fold');if(opened.any)a.classList.add('lap-open');
      h.dataset.lapKey='any';h.innerHTML=h.textContent+'<b>'+n+'</b>';
    });
  }
  document.addEventListener('click',function(e){
    var k=e.target.closest&&e.target.closest('.lap-kids,.sc-any.lap-fold h5');if(!k)return;
    var key=k.dataset.lapKey,host=k.closest('.sc-row,.sc-any');if(!host)return;
    var on=host.classList.toggle('lap-open');opened[key]=on;
    if(k.classList.contains('lap-kids')){var n=host.querySelectorAll('.sc-under .sc-u').length;k.textContent=(on?'Hide ':'')+n+(n===1?' item':' items')}
  });
  new MutationObserver(function(){foldSched()}).observe(document.documentElement,{childList:true,subtree:true});
  window.__lapFold=foldSched;

  /* ---- Every other widget: secondary parts sit behind one "More" bar per card (nothing removed; choice remembered) ---- */
  var MORE={
    water:{sel:'[data-blk="plan"],[data-blk="week"],[data-blk="pattern"],.wt-colB',label:'Plan & history'},
    skin:{sel:'[data-blk="coming"],[data-blk="heat"],[data-blk="cab"],[data-blk="trk"],[data-blk="rev"]',label:'Next nights, stock & review'},
    diet:{sel:'[data-blk="micro"],[data-blk="week"],[data-blk="flex"],[data-blk="streak"],[data-blk="energy"],[data-blk="weight"],.dt-micro,.dt-week,.dt-flex',label:'Nutrients & week'},
    training:{sel:'.pt-week',label:'This week'},
    agenda:{sel:'.cw-fest,[data-blk="upcoming"]',label:'Festivals & next 7 days'},
    notes:{sel:'.nw-top',label:'Arrange'}
  };
  var moreState={};try{moreState=JSON.parse(localStorage.getItem('hub-lap-more')||'{}')||{}}catch(e){}
  function foldMore(){
    if(!d.classList.contains('lap-look'))return;
    document.querySelectorAll('.widget-card').forEach(function(c){
      var t=c.dataset.widgetType,m=MORE[t];if(!m)return;
      var n=0;try{n=c.querySelectorAll(m.sel.split(',').filter(function(x){return x.indexOf('.wt-colB')<0}).join(',')).length}catch(e){}
      var b=c.querySelector(':scope>.lap-morebtn');
      if(!n){if(b)b.remove();return}
      if(!b){b=document.createElement('button');b.type='button';b.className='lap-morebtn';c.appendChild(b);
        if(moreState[t])c.classList.add('lap-more')}
      var on=c.classList.contains('lap-more');
      var txt=(on?'Show less':'More · '+m.label);if(b.textContent!==txt)b.textContent=txt;
    });
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('.lap-morebtn');if(!b)return;
    var c=b.closest('.widget-card'),t=c.dataset.widgetType;
    var on=c.classList.toggle('lap-more');moreState[t]=on;
    try{localStorage.setItem('hub-lap-more',JSON.stringify(moreState))}catch(x){}
    foldMore();
  });
  new MutationObserver(function(){foldMore()}).observe(document.documentElement,{childList:true,subtree:true});
  window.__lapMore=foldMore;
  apply();if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',paint);
})();

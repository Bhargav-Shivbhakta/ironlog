/* To-Do phone layer: header buttons, Tools sheet, grouped list, banner toggle. Every original control and handler stays; the new buttons just click the originals. */
(function(){
'use strict';
var mq=window.matchMedia('(max-width:700px)');
var $=function(id){return document.getElementById(id)};
function el(t,c,h){var e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e}

/* ---------- icon set (line icons, replaces emojis everywhere in the app's own UI) ---------- */
var P={
x:'<path d="M18 6 6 18M6 6l12 12"/>',
link:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
check:'<path d="M20 6 9 17l-5-5"/>',
down:'<path d="m6 9 6 6 6-6"/>',
right:'<path d="m9 18 6-6-6-6"/>',
play:'<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
pause:'<path d="M8 5v14M16 5v14"/>',
flame:'<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
left:'<path d="m12 19-7-7 7-7M19 12H5"/>',
arrow:'<path d="M5 12h14m-7-7 7 7-7 7"/>',
search:'<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
clip:'<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 12h6M9 16h6"/>',
tag:'<path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.41l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".6" fill="currentColor"/>',
spark:'<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/>',
timer:'<path d="M10 2h4M12 14l3-3"/><circle cx="12" cy="14" r="8"/>',
lock:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
pin:'<path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
chart:'<path d="M18 20V10M12 20V4M6 20v-6"/>',
checksq:'<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/>',
sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
week:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
checkc:'<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
leaf:'<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
user:'<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
cal:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
circle:'<circle cx="12" cy="12" r="9"/>',
dot:'<circle cx="12" cy="12" r="3" fill="currentColor"/>',
alert:'<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
alarm:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3 2 6M22 6l-3-3"/>',
down2:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
more:'<circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="19" cy="12" r="1.2" fill="currentColor"/><circle cx="5" cy="12" r="1.2" fill="currentColor"/>',
swap:'<path d="m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3"/>',
note:'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8"/>',
plus:'<path d="M5 12h14M12 5v14"/>'
};
function svg(n){return '<svg class="ico" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(P[n]||'')+'</svg>'}
var MAP={'✕':'x','🔗':'link','✓':'check','▾':'down','▸':'right','▶':'play','⏸':'pause','🔥':'flame','←':'left','→':'arrow','🔍':'search','📋':'clip','🏷':'tag','🎉':'spark','✨':'spark','🙌':'spark','💪':'spark','⏱':'timer','🔒':'lock','📌':'pin','📊':'chart','☑':'checksq','🗺':'map','☀':'sun','▦':'week','☷':'list','✅':'checkc','🌿':'leaf','👤':'user','📆':'cal','○':'circle','▪':'dot','🚨':'alert','⏰':'alarm','⤓':'down2','⤒':'down2','⋯':'more'};
var RE=new RegExp('('+Object.keys(MAP).map(function(k){return k}).join('|')+')\\uFE0F?','g');
var SKIP='[contenteditable],textarea,input,select,script,style,.task-text,.note-text,.note-body,.list-chips,.subtask-row span,.command-task,.ico';
var ALLOW='#task-map-hint,button,.meta-chip,.nav-label,.ring-streak,.ring-msg,.notif-banner,.celebrate-toast,.inapp-alert,.undo-toast,.mobile-task-nav,summary,h2,h3,label,.link-chip,.command-lane-head,.progress-ring-card,.empty,.command-empty,.parse-preview,.task-map-hint,#task-view-subtitle,.focus-bar,#focus-bar-wrap,.badge,.chip';
function swapIn(root){
  if(!root||root.nodeType!==1&&root.nodeType!==3)return;
  var host=root.nodeType===3?root.parentNode:root;if(!host||!host.closest)return;
  var w=document.createTreeWalker(root.nodeType===3?root.parentNode:root,NodeFilter.SHOW_TEXT,null);var nodes=[],n;
  while((n=w.nextNode())){if(RE.test(n.nodeValue)){RE.lastIndex=0;var p=n.parentNode;if(p&&p.closest&&p.closest(ALLOW)&&!p.closest(SKIP))nodes.push(n)}RE.lastIndex=0}
  nodes.forEach(function(t){
    var frag=document.createDocumentFragment(),str=t.nodeValue,last=0,m;RE.lastIndex=0;
    while((m=RE.exec(str))){if(m.index>last)frag.appendChild(document.createTextNode(str.slice(last,m.index)));var s=document.createElement('span');s.className='ico-w';s.innerHTML=svg(MAP[m[1]]);frag.appendChild(s);last=m.index+m[0].length}
    if(last<str.length)frag.appendChild(document.createTextNode(str.slice(last)));
    t.parentNode.replaceChild(frag,t)})
}
function ready(fn){if(document.getElementById('app-head')&&document.getElementById('task-list'))fn();else setTimeout(function(){ready(fn)},200)}
ready(function(){
  var head=$('app-head');
  /* ---- Tools sheet ---- */
  var sheet=el('div','');sheet.id='tv-sheet';
  var inn=el('div','in');sheet.appendChild(inn);document.body.appendChild(sheet);
  function close(){sheet.classList.remove('on')}
  sheet.addEventListener('click',function(e){if(e.target===sheet)close()});
  function trig(fn){return function(){close();setTimeout(fn,60)}}
  function clickId(id,scroll){return trig(function(){var b=$(id);if(b)b.click();if(scroll!==false){var t=$('task-split');if(t&&t.scrollIntoView)t.scrollIntoView({block:'start'})}})}
  function btn(parent,icon,label,fn){var b=el('button','',(icon?'<span class="tile">'+svg(icon)+'</span>':'')+'<span>'+label+'</span>');b.type='button';b.addEventListener('click',fn);parent.appendChild(b);return b}
  /* ---- Notes sheet (phone): same lane as the laptop column ---- */
  var ns=el('div','');ns.id='tv-nsheet';var nin=el('div','in');ns.appendChild(nin);nin.appendChild(el('div','gr'));var nbody=el('div','nb');nin.appendChild(nbody);document.body.appendChild(ns);
  function openNS(){if(window.tvNotesRender)window.tvNotesRender(nbody,40);ns.classList.add('on')}
  function closeNS(){ns.classList.remove('on')}
  ns.addEventListener('click',function(e){if(e.target===ns)closeNS()});
  window.tvNotesSheetClose=closeNS;
  window.tvNotesSheetRefresh=function(){if(ns.classList.contains('on')&&window.tvNotesRender)window.tvNotesRender(nbody,40)};
  inn.appendChild(el('div','gr'));
  inn.appendChild(el('h3','','Tools'));
  var g=el('div','g');inn.appendChild(g);
  btn(g,'search','Search',clickId('search-toggle-btn'));
  btn(g,'chart','Stats',clickId('stats-toggle-btn'));
  btn(g,'clip','Templates',clickId('templates-toggle-btn'));
  btn(g,'checksq','Select',clickId('bulk-toggle-btn'));
  btn(g,'tag','Tags',clickId('manage-tags-btn'));
  btn(g,'map','Order map',clickId('map-toggle-btn',false));
  btn(g,'note','Notes',trig(function(){openNS()}));
  btn(g,'down2','Backup',clickId('backup-button',false));
  btn(g,'swap','Switch profile',clickId('who-badge',false));
  inn.appendChild(el('h3','','Notes'));
  var r=el('div','row');inn.appendChild(r);
  btn(r,'','New note',trig(function(){try{openNotesModal();addStickyNote()}catch(e){}}));
  btn(r,'','View all',trig(function(){try{openNotesModal()}catch(e){}}));
  btn(r,'','Recently deleted',trig(function(){try{openNotesModal();setTimeout(function(){var b=$('notes-trash-btn');if(b)b.click()},120)}catch(e){}}));
  inn.appendChild(el('h3','','Quick add tips'));
  inn.appendChild(el('div','tip','Type a task, then add <b>tomorrow</b> or <b>friday</b> for a date, <b>3pm</b> for a time, <b>!1</b> to <b>!3</b> for priority, or <b>#listname</b> to file it in a list.'));
  /* ---- header buttons ---- */
  var s=el('button','tv-ic',svg('search'));s.type='button';s.id='tv-search';s.setAttribute('aria-label','Search');
  s.addEventListener('click',function(){var b=$('search-toggle-btn');if(b)b.click();var t=$('task-split');if(t&&t.scrollIntoView)t.scrollIntoView({block:'start'});setTimeout(function(){var i=$('search-input');if(i&&i.offsetParent)i.focus()},150)});
  var m=el('button','tv-ic',svg('more'));m.type='button';m.id='tv-more';m.setAttribute('aria-label','Tools and more');
  m.addEventListener('click',function(){sheet.classList.add('on')});
  head.appendChild(s);head.appendChild(m);
  /* dock: replace the text dots with an icon, keep the same button */
  var dt=$('detailed-add-toggle-btn');if(dt)dt.setAttribute('aria-label','Add with all details');
  /* ---- banner: tap text to read it all ---- */
  var bw=$('notif-banner-wrap');
  if(bw)bw.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('.notif-banner');if(b&&!e.target.closest('button'))b.classList.toggle('tv-open')});
  /* ---- grouped list: Overdue / Today / Later (visual only: CSS order, original rows untouched) ---- */
  var list=$('task-list'),busy=false;
  function activeView(){if(!mq.matches){var t=document.querySelector('#smart-tabs button.active');return t?t.getAttribute('data-view'):'today'}var b=document.querySelector('.mobile-task-nav button.active');return b?b.getAttribute('data-mobile-view'):'today'}
  function group(){
    if(busy)return;busy=true;obs.disconnect();
    try{
      [].forEach.call(list.querySelectorAll('.tv-h'),function(h){h.remove()});
      var rows=[].filter.call(list.children,function(c){return c.classList&&c.classList.contains('task-row')});
      var cls={od:[],td:[],lt:[]};
      rows.forEach(function(r){
        var k=r.classList.contains('overdue-row')?'od':(r.querySelector('.meta-chip.today')?'td':'lt');
        r.classList.remove('tv-od','tv-td','tv-lt','tv-first','tv-last');r.classList.add('tv-'+k);r.style.order='';cls[k].push(r)});
      var grouped=activeView()==='today'&&rows.length;
      if(grouped){
        var names={od:'Overdue',td:'Today',lt:'Later'},base={od:0,td:1000,lt:2000};
        ['od','td','lt'].forEach(function(k){
          if(!cls[k].length)return;
          var h=el('div','tv-h '+k,'<span>'+names[k]+'</span><b>'+cls[k].length+'</b>');h.style.order=base[k];list.appendChild(h);
          cls[k].forEach(function(r,i){r.style.order=base[k]+i+1;if(i===0)r.classList.add('tv-first');if(i===cls[k].length-1)r.classList.add('tv-last')})})
      }else if(rows.length){var by=[];[].forEach.call(list.querySelectorAll('.task-row'),function(r){var p=r.parentNode,k=by.indexOf(p);if(k<0){by.push(p);k=by.length-1;p.__rows=[]}p.__rows.push(r)});by.forEach(function(p){var a=p.__rows;a[0].classList.add('tv-first');a[a.length-1].classList.add('tv-last')})}
    }catch(e){}
    obs.observe(list,{childList:true});busy=false}
  var obs=new MutationObserver(group);obs.observe(list,{childList:true});group();
  document.addEventListener('click',function(){setTimeout(group,60)});
  mq.addEventListener&&mq.addEventListener('change',group);
  function navH(){var n=document.querySelector('.mobile-task-nav');if(n&&n.offsetHeight)document.documentElement.style.setProperty('--tv-nav',n.offsetHeight+'px')}
  navH();window.addEventListener('resize',navH);setTimeout(navH,400);setTimeout(navH,1500);
  /* ---- laptop: rearrange the ORIGINAL nodes into top bar + right column (ids/handlers untouched) ---- */
  var LM=null;
  function lapOn(){
    if(LM)return;var w=$('app-wrap');if(!w)return;LM=[];
    function mv(n,to,before){if(!n||!to)return;LM.push({n:n,p:n.parentNode,s:n.nextSibling});to.insertBefore(n,before||null)}
    var top=el('div','');top.id='tv-top';var side=el('div','');side.id='tv-side';
    w.insertBefore(top,$('notif-banner-wrap'));w.appendChild(side);
    mv($('app-head'),top);
    var st=$('smart-tabs'),vg=st&&st.closest('.control-group');mv(vg,top);
    var tg=document.querySelector('.control-group-tools');mv(tg,top);
    var bb=$('backup-button'),tr=tg&&tg.querySelector('.toolbar-row');if(bb&&tr)mv(bb,tr);[].forEach.call(top.querySelectorAll('.tool-btn,.backup-button'),function(b){b.setAttribute('title',(b.textContent||'').replace(/[^A-Za-z ]/g,'').replace(/\s+/g,' ').trim())});
    var dt=el('span','');dt.id='tv-date';dt.textContent=new Date().toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'});
    var hd=$('app-head');if(hd)hd.appendChild(dt);LM.push({n:dt,p:null});
    mv($('task-detail-panel'),side);
    var em=el('div','','<b>Select a task</b>Click the &hellip; on any task to see and edit all its details here.');em.id='tv-empty';side.appendChild(em);LM.push({n:em,p:null});
    mv($('progress-ring-wrap'),top,tg);mv($('command-center'),side);
    w.classList.add('tv-lap');
    document.documentElement.classList.add('tv-lapmode');
    sweep();group();
  }
  function lapOff(){
    if(!LM)return;var w=$('app-wrap');
    for(var i=LM.length-1;i>=0;i--){var m=LM[i];if(!m.p){if(m.n.parentNode)m.n.parentNode.removeChild(m.n)}else m.p.insertBefore(m.n,m.s&&m.s.parentNode===m.p?m.s:null)}
    LM=null;var t=$('tv-top'),s=$('tv-side');if(t)t.remove();if(s)s.remove();
    if(w)w.classList.remove('tv-lap');document.documentElement.classList.remove('tv-lapmode');group()}
  function ringPhone(){var w=$('progress-ring-wrap'),a=$('tv-search');if(w&&a&&a.parentNode&&w.parentNode!==a.parentNode)a.parentNode.insertBefore(w,a)}
  function ringN(){var r=document.querySelector('#progress-ring-wrap .ring-streak');if(r){var m=(r.textContent||'').match(/(\d+)/);if(m&&r.getAttribute('data-n')!==m[1])r.setAttribute('data-n',m[1])}}
  var rw=$('progress-ring-wrap');if(rw){new MutationObserver(ringN).observe(rw,{childList:true,subtree:true,characterData:true});ringN()}
  function lapSync(){if(mq.matches){lapOff();ringPhone()}else lapOn()}
  lapSync();mq.addEventListener&&mq.addEventListener('change',lapSync);
  /* ---- collapsible bottom bar: scroll down / swipe down hides, scroll up / swipe up / tap handle shows ---- */
  var navEl=document.querySelector('.mobile-task-nav'),hid=false,lastY=0,hnd=el('button','tv-handle','');hnd.type='button';hnd.setAttribute('aria-label','Show bottom bar');document.body.appendChild(hnd);
  function navSet(h){if(!mq.matches)h=false;if(h===hid)return;hid=h;document.documentElement.classList.toggle('tv-navhide',h);document.documentElement.style.setProperty('--tv-nav',h?'0px':(navEl?navEl.offsetHeight:60)+'px')}
  function modalOpen(){return document.querySelector('.task-detail-panel:not([hidden]),.task-map-panel:not([hidden]),#tv-sheet.open,.tv-sheet.open')}
  function sy(){return window.pageYOffset||document.documentElement.scrollTop||0}
  window.addEventListener('scroll',function(){var y=sy(),d=y-lastY;if(Math.abs(d)<10)return;lastY=y;if(modalOpen())return;if(d>0&&y>80)navSet(true);else if(d<0)navSet(false)},{passive:true});
  hnd.addEventListener('click',function(){navSet(false)});
  var ty=null;
  document.addEventListener('touchstart',function(e){var t=e.target;ty=(navEl&&navEl.contains(t))||(hnd===t)?e.touches[0].clientY:null},{passive:true});
  document.addEventListener('touchend',function(e){if(ty===null)return;var d=e.changedTouches[0].clientY-ty;ty=null;if(d>24)navSet(true);else if(d<-24)navSet(false)},{passive:true});
  mq.addEventListener&&mq.addEventListener('change',function(){navSet(false)});
  document.addEventListener('click',function(e){if(navEl&&navEl.contains(e.target))setTimeout(function(){navSet(false)},0)});
  /* ---- emojis -> line icons, wherever the app draws its own UI ---- */
  var wrap=$('app-wrap')||document.body,pend=false;
  function sweep(){pend=false;swapIn(document.body);[].forEach.call(document.querySelectorAll('input[placeholder]'),function(i){var v=i.getAttribute('placeholder');var c=v.replace(RE,'').replace(/^\s+/,'');if(c!==v)i.setAttribute('placeholder',c)});[].forEach.call(document.querySelectorAll('[data-expand]'),function(b){if(!b.querySelector('.ico'))b.innerHTML='<span class="ico-w">'+svg('more')+'</span>'})}
  new MutationObserver(function(){if(!pend){pend=true;setTimeout(sweep,30)}}).observe(document.body,{childList:true,subtree:true,characterData:true});
  sweep();
});
})();

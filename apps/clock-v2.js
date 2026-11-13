/* Clock phone layer: icons on the bottom tab bar, a "More" sheet (World time / Stopwatch / History), header date.
   Every original control stays; the new buttons just click the originals. */
(function(){
  var mq=window.matchMedia('(max-width:700px)');
  var P={now:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',alarms:'<circle cx="12" cy="13" r="7"/><path d="M12 9v4l2 1M5 4L3 6M19 4l2 2"/>',timers:'<circle cx="12" cy="14" r="7"/><path d="M12 14l3-3M10 3h4"/>',focus:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',more:'<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',world:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',stopwatch:'<circle cx="12" cy="14" r="7"/><path d="M12 14V10M10 3h4M18 7l1.5-1.5"/>',history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 8v4l3 2"/>'};
  function svg(n){return '<span class="ico"><svg viewBox="0 0 24 24">'+P[n]+'</svg></span>'}
  function el(t,c,h){var e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e}
  function ready(){
    var bar=document.getElementById('ck-tabbar');if(!bar)return;
    var map={dashboard:'now',alarms:'alarms',timers:'timers',focus:'focus'};
    [].forEach.call(bar.querySelectorAll('button[data-tab]'),function(b){var k=map[b.dataset.tab];if(k&&!b.querySelector('.ico')){var t=b.textContent;b.innerHTML=svg(k)+'<span>'+t+'</span>'}});
    /* More button + sheet */
    var more=el('div','','');more.id='ck-more';more.setAttribute('role','button');more.setAttribute('tabindex','0');more.setAttribute('aria-label','More: World time, Stopwatch, History');more.innerHTML=svg('more')+'<span>More</span>';bar.appendChild(more);
    var sh=el('div','');sh.id='tv-more-sheet';
    sh.innerHTML='<div class="mm-back"></div><div class="mm-card"><div class="mm-grab"></div><h3>More</h3>'+
      [['world','World time','Cities and the map'],['stopwatch','Stopwatch','Laps and splits'],['history','History','Focus sessions and timers']].map(function(r){return '<button type="button" data-go="'+r[0]+'"><span class="mm-ic">'+svg(r[0])+'</span><span><b>'+r[1]+'</b><small>'+r[2]+'</small></span><i>&rsaquo;</i></button>'}).join('')+'</div>';
    document.body.appendChild(sh);
    var st=document.createElement('style');st.textContent='@media(max-width:700px){#tv-more-sheet{display:none;position:fixed;inset:0;z-index:300}#tv-more-sheet.open{display:block}#tv-more-sheet .mm-back{position:absolute;inset:0;background:rgba(0,0,0,.55)}#tv-more-sheet .mm-card{position:absolute;left:0;right:0;bottom:0;background:#0E1A1F;border-radius:24px 24px 0 0;padding:10px 16px calc(24px + env(safe-area-inset-bottom,0px));box-shadow:0 -20px 50px rgba(0,0,0,.5)}#tv-more-sheet .mm-grab{width:40px;height:4px;border-radius:4px;background:#2a4a56;margin:2px auto 12px}#tv-more-sheet h3{margin:0 4px 8px;font-size:20px}#tv-more-sheet button{display:flex;align-items:center;gap:14px;width:100%;text-align:left;background:#15272E;border:0;border-radius:16px;padding:14px;margin-bottom:8px;color:#F2F6F8}#tv-more-sheet .mm-ic{width:42px;height:42px;border-radius:12px;background:rgba(56,208,240,.16);color:#38D0F0;display:grid;place-items:center}#tv-more-sheet .mm-ic .ico{width:22px;height:22px}#tv-more-sheet b{display:block;font-size:16px}#tv-more-sheet small{color:#9FB3BA;font-size:13px}#tv-more-sheet i{margin-left:auto;font-style:normal;font-size:24px;color:#9FB3BA}}';document.head.appendChild(st);
    function open(o){sh.classList.toggle('open',!!o)}
    more.addEventListener('click',function(){open(true)});more.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();open(true)}});
    sh.querySelector('.mm-back').addEventListener('click',function(){open(false)});
    sh.addEventListener('click',function(e){var b=e.target.closest('[data-go]');if(!b)return;var orig=bar.querySelector('button[data-tab="'+b.dataset.go+'"]');if(orig)orig.click();open(false)});
    /* header date */
    var h=document.querySelector('.page-header');var d=el('span','');d.id='ck-date';h&&h.insertBefore(d,h.querySelector('#notif-btn'));
    function sync(){
      var a=bar.querySelector('button.active'),t=a?a.dataset.tab:'dashboard';
      document.body.setAttribute('data-ck-tab',t);
      more.classList.toggle('active',/^(world|stopwatch|history)$/.test(t));
      if(d)d.textContent=new Date().toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
    }
    new MutationObserver(sync).observe(bar,{subtree:true,attributes:true,attributeFilter:['class']});
    sync();setInterval(function(){if(d)d.textContent=new Date().toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})},60000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();

/* New-look upgrades for the simple laptop widgets. Additive only: it reads what each widget already painted and adds a summary strip,
   a meter or group labels next to it. Nothing is removed or rewired, and it does nothing in the Classic look.
   Repainting a widget replaces its content, so the additions are rebuilt each time. */
(function(){
'use strict';
var d=document;
function H(t,c,x){var e=d.createElement(t);e.className=c;if(x!=null)e.innerHTML=x;return e}
function has(b){return b.querySelector('.lw-add')}
function chip(t,cls){return '<span class="lw-chip'+(cls?' '+cls:'')+'">'+t+'</span>'}
var ENH={
  grocery:function(b){
    var big=b.querySelector(':scope>strong');if(!big||b.querySelector('.lw-add'))return;
    var n=parseInt(big.textContent,10);big.parentNode.insertBefore(H('div','lw-add lw-strip',n===0?chip('All bought','ok'):chip(n+' to buy')),big);
  },
  pledge:function(b){
    var big=b.querySelector(':scope>strong');if(!big)return;
    var m=big.textContent.match(/(\d+)\s*\/\s*(\d+)/);if(!m)return;
    var a=+m[1],t=+m[2];
    big.parentNode.insertBefore(H('div','lw-add lw-meter ok','<i style="width:'+Math.round(a/t*100)+'%"></i>'),big.nextElementSibling&&big.nextElementSibling.nextSibling||null);
    [].slice.call(b.querySelectorAll(':scope>div')).forEach(function(r){if(/^[✓○]/.test(r.textContent.trim())){r.classList.add('lw-prow');if(/^✓/.test(r.textContent.trim()))r.classList.add('done')}});
  },
  activity:function(b){
    var rows=[].slice.call(b.querySelectorAll('.act-row'));if(!rows.length)return;
    var bh=rows.filter(function(r){return r.querySelector('.act-b')}).length,an=rows.filter(function(r){return r.querySelector('.act-a')}).length;
    var s=H('div','lw-add lw-strip',(bh?chip('Bhargav '+bh):'')+(an?chip('Anusha '+an):''));
    var f=rows[0];f.parentNode.insertBefore(s,f);
  },
  quicklinks:function(b){
    [].slice.call(b.querySelectorAll('.qlinks-row>a')).forEach(function(a,i){a.setAttribute('data-lw-i',String(i%6))});
  },
  cook:function(b){var c=b.querySelector('.pck-cols');if(c)c.classList.add('lw-cards')},
  photos:function(b){}
};
function run(){
  if(!d.documentElement.classList.contains('lap-look'))return;
  d.querySelectorAll('.widget-card').forEach(function(c){
    var t=c.dataset.widgetType,f=ENH[t];if(!f)return;
    var b=c.querySelector('.widget-card-body');if(!b||has(b)||b.dataset.lwBusy)return;
    try{f(b)}catch(e){}
  });
}
window.__lw=run;
var q=0;new MutationObserver(function(){cancelAnimationFrame(q);q=requestAnimationFrame(run)}).observe(d.documentElement,{childList:true,subtree:true});
})();

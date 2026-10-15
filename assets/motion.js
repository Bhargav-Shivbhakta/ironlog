/* Shared motion behaviour for the Hub and every app. It watches for things that
   appear — a tab/page being shown, a modal opening, a toast, a single new row —
   and gives them a short, smooth entrance. Nothing here touches app logic or data,
   and it does nothing at all when the device asks for reduced motion. */
(function(){
  if(window.__hubMotion) return; window.__hubMotion=true;
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if(!Element.prototype.animate) return;
  var EASE='cubic-bezier(.22,1,.36,1)', SPRING='cubic-bezier(.34,1.56,.64,1)';
  var CAND=/(^|[\s_-])(page|view|tab|pane|panel|screen|overlay|modal|sheet|drawer|dialog|backdrop|wrap|frame|popover|menu)([\s_-]|$)/i;
  var known=new WeakMap();
  function shown(el){ return !el.hidden && el.getClientRects().length>0; }
  function cand(el){ var c=(typeof el.className==='string'?el.className:'')+' '+(el.id||''); return CAND.test(c); }
  function seed(root){ try{ root.querySelectorAll('[class],[id]').forEach(function(el){ if(cand(el)) known.set(el,shown(el)); }); }catch(e){} }
  function anim(el,frames,opts){ try{ return el.animate(frames,opts); }catch(e){} }
  function pageEnter(el){
    var kids=[].slice.call(el.children).filter(function(k){ return k.getClientRects().length>0 && k.offsetHeight>0; }).slice(0,10);
    if(!kids.length) kids=[el];
    kids.forEach(function(k,i){
      anim(k,[{opacity:0,translate:'0 12px'},{opacity:1,translate:'0 0'}],{duration:420,delay:i*45,easing:EASE,fill:'backwards'});
    });
  }
  function overlayEnter(el){
    var id=(el.id||'')+' '+(typeof el.className==='string'?el.className:'');
    if(/frame/i.test(id)){ anim(el,[{opacity:0,translate:'0 26px'},{opacity:1,translate:'0 0'}],{duration:340,easing:EASE}); return; }
    anim(el,[{opacity:0},{opacity:1}],{duration:200,easing:'ease-out'});
    var m=[].slice.call(el.children).filter(function(k){ return k.getClientRects().length>0; })[0];
    if(m) anim(m,[{opacity:0,scale:.95,translate:'0 12px'},{opacity:1,scale:1,translate:'0 0'}],{duration:320,easing:SPRING});
  }
  function enter(el){
    var cs=getComputedStyle(el), r=el.getBoundingClientRect();
    if(cs.position==='fixed' && r.width>=innerWidth*.8 && r.height>=innerHeight*.8) return overlayEnter(el);
    if(cs.position==='fixed' && r.width>=240 && r.height>=120) return overlayEnter(el);
    if(r.width>=200 && r.height>=60) return pageEnter(el);
    anim(el,[{opacity:0,scale:.97,translate:'0 -4px'},{opacity:1,scale:1,translate:'0 0'}],{duration:170,easing:EASE});
  }
  var mo=new MutationObserver(function(list){
    var adds=0;
    list.forEach(function(m){
      var t=m.target;
      if(m.type==='attributes'){
        if(t.classList && t.classList.contains('toast') && t.classList.contains('show')){
          anim(t,[{scale:.9},{scale:1}],{duration:280,easing:SPRING}); return;
        }
        if(!cand(t)) return;
        var was=known.get(t), now=shown(t); known.set(t,now);
        if(now && was===false) enter(t);
      }else if(m.type==='childList'){
        var n=m.addedNodes;
        for(var i=0;i<n.length;i++){ if(n[i].nodeType===1){ adds++; if(cand(n[i])) known.set(n[i],shown(n[i])); } }
        // one new row appended to an existing list: let it ease in (full re-renders stay still)
        if(n.length===1 && n[0].nodeType===1 && m.removedNodes.length===0 && t.children.length>2 && t.getClientRects().length>0){
          var el=n[0], cn=typeof el.className==='string'?el.className:'';
          if(/row|item|card|entry|chip|note|task|event|txn|line/i.test(cn)) anim(el,[{opacity:0,translate:'0 10px',scale:.985},{opacity:1,translate:'0 0',scale:1}],{duration:300,easing:EASE});
        }
      }
    });
  });
  function start(){
    seed(document.body);
    mo.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','style']});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();

/* Shared, deliberately minimal motion: when a page/tab, popup or app window becomes
   visible it fades in (popups also settle up a few pixels). No stagger, springs or bounces.
   Does nothing when the device asks for reduced motion. */
(function(){
  if(window.__hubMotion) return; window.__hubMotion=true;
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if(!Element.prototype.animate) return;
  var EASE='cubic-bezier(.2,0,0,1)';
  var CAND=/(^|[\s_-])(page|view|tab|pane|screen|overlay|modal|sheet|drawer|dialog|backdrop|frame|popover)([\s_-]|$)/i;
  var known=new WeakMap();
  function shown(el){ return !el.hidden && el.getClientRects().length>0; }
  function cand(el){ var c=(typeof el.className==='string'?el.className:'')+' '+(el.id||''); return CAND.test(c); }
  function seed(root){ try{ root.querySelectorAll('[class],[id]').forEach(function(el){ if(cand(el)) known.set(el,shown(el)); }); }catch(e){} }
  function anim(el,frames,opts){ try{ return el.animate(frames,opts); }catch(e){} }
  function enter(el){
    var cs=getComputedStyle(el), r=el.getBoundingClientRect(), id=(el.id||'')+' '+(typeof el.className==='string'?el.className:'');
    if(cs.position==='fixed' && r.width>=240 && r.height>=120){
      if(/frame/i.test(id)){ anim(el,[{opacity:0,translate:'0 10px'},{opacity:1,translate:'0 0'}],{duration:200,easing:EASE}); return; }
      anim(el,[{opacity:0},{opacity:1}],{duration:140,easing:'ease-out'});
      var m=[].slice.call(el.children).filter(function(k){ return k.getClientRects().length>0; })[0];
      if(m) anim(m,[{opacity:0,translate:'0 8px'},{opacity:1,translate:'0 0'}],{duration:180,easing:EASE});
      return;
    }
    if(r.width>=200 && r.height>=60) anim(el,[{opacity:0},{opacity:1}],{duration:150,easing:'ease-out'});
  }
  var mo=new MutationObserver(function(list){
    list.forEach(function(m){
      var t=m.target;
      if(m.type==='attributes'){
        if(!cand(t)) return;
        var was=known.get(t), now=shown(t); known.set(t,now);
        if(now && was===false) enter(t);
      }else{
        var n=m.addedNodes;
        for(var i=0;i<n.length;i++){ if(n[i].nodeType===1 && cand(n[i])) known.set(n[i],shown(n[i])); }
      }
    });
  });
  function start(){ seed(document.body); mo.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','style']}); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();

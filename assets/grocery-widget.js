/* Grocery widget: do the whole shop from the Hub without opening Grocery.
   Same documents and same rules as apps/grocery.html:
     users/{uid}/apps/grocery-v4/data/modernState  {json}   (weeks, products, inventory, purchaseLog, history...)
     users/{uid}/apps/grocery-v4/data/inventory    {json}
   Does here: items grouped by store, tick bought / step bought qty, edit price or planned qty, add an item (catalog or new),
   remove (Undo), move leftovers to next week or drop them, finish the trip (Undo). Pantry stock and the purchase log
   are updated exactly like the app. Catalog editing, history and the weekly plan stay in the Grocery app. */
(function(){
'use strict';
if(typeof WIDGET_TYPES==='undefined'||!WIDGET_TYPES.grocery)return;
const GW={st:null,ui:{cat:'all',edit:null,finish:false,adding:false},busy:false};
const esc2=s=>esc(String(s==null?'':s));
const num=v=>{const n=parseFloat(v);return isFinite(n)&&n>0?n:0};
const round=(v,d)=>{const m=Math.pow(10,d==null?0:d);return Math.round(v*m)/m};
const money=n=>'$'+(Number(n)||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const money0=n=>'$'+(Number(n)||0).toLocaleString(undefined,{maximumFractionDigits:0});
const dref=k=>db.collection('users').doc(state.user.uid).collection('apps').doc('grocery-v4').collection('data').doc(k);
/* ---- same rules as the Grocery app ---- */
const openQty=x=>Math.max(0,x.plannedQty-(x.carriedQty||0)-(x.dismissedQty||0));
const remaining=x=>Math.max(0,openQty(x)-(x.purchasedQty||0));
const isDone=x=>openQty(x)>0&&(x.purchasedQty||0)>=openQty(x);
const prod=(S,id)=>(S.products||[]).find(p=>p.id===id);
const nameOf=(S,x)=>(x.productId&&prod(S,x.productId)&&prod(S,x.productId).name)||x.name||'Removed product';
const storeOf=(S,x)=>(x.productId&&prod(S,x.productId)&&prod(S,x.productId).store)||x.store||'Other';
const catOf=(S,x)=>{const p=x.productId?prod(S,x.productId):null;return p?(p.category||'food'):(x.category||'food')};
const price=x=>x.actualPrice!=null?x.actualPrice:(x.unitPrice||0);
const cost=(w)=>(w.items||[]).reduce((s,x)=>s+(x.purchasedQty||0)*(x.actualPrice!=null?x.actualPrice:(x.unitPrice||0)),0);
function pantryStatus(onHand,full){const r=full>0?Math.max(0,onHand||0)/full:0;if(r<=0)return'finished';if(r<=.15)return'low';if(r<=.4)return'25';if(r<=.65)return'half';if(r<=.9)return'75';return'full'}
function pantryFull(onHand,pkg){pkg=pkg||1;return Math.max(pkg,Math.ceil(Math.max(0,onHand||0)/pkg)*pkg)}
const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const addDays=(s,n)=>{const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return iso(d)};
const cycleWeek=w=>((w-1)%8)+1,cycleOf=w=>Math.floor((w-1)/8)+1;
const weekLabel=w=>'Cycle '+cycleOf(w)+' · Week '+cycleWeek(w);
function weekRange(S,w){const a=addDays(S.startDate,(w-1)*7),b=addDays(a,6),f=x=>new Date(x+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'});return f(a)+' – '+f(b)}
function ensureLogs(S){S.purchaseLog=S.purchaseLog||[];S.inventory=S.inventory||{};S.history=S.history||[];S.weeks=S.weeks||{}}
function logPurchase(S,w,x){
  ensureLogs(S);
  const key=w+':'+x.id,ex=S.purchaseLog.find(l=>l.key===key),old=ex?ex.qty||0:0;
  const data={key,week:w,name:nameOf(S,x),qty:x.purchasedQty,unitPrice:price(x),date:today()};
  if(x.purchasedQty>0){if(ex)Object.assign(ex,data);else S.purchaseLog.push(data)}else S.purchaseLog=S.purchaseLog.filter(l=>l.key!==key);
  if(x.productId){
    const p=prod(S,x.productId),inv=S.inventory[x.productId]||{},per=p?p.purchaseQty||1:1,on=Math.max(0,(inv.onHand||0)+(x.purchasedQty-old)*per);
    S.inventory[x.productId]=Object.assign(inv,{status:pantryStatus(on,pantryFull(on,per)),lastPurchased:x.purchasedQty>0?today():inv.lastPurchased,onHand:round(on,2)});
  }
}
function unbuy(S,w,x){
  ensureLogs(S);
  if((x.purchasedQty||0)>0&&x.productId){const p=prod(S,x.productId),inv=S.inventory[x.productId];
    if(inv){const per=p?p.purchaseQty||1:1,on=Math.max(0,(inv.onHand||0)-x.purchasedQty*per);inv.onHand=round(on,2);inv.status=pantryStatus(on,pantryFull(on,per))}}
  S.purchaseLog=S.purchaseLog.filter(l=>l.key!==w+':'+x.id);
}
/* ---- load / save ---- */
const parse=s=>{try{return s&&s.exists&&s.data().json?JSON.parse(s.data().json):null}catch(e){return null}};
async function load(){const S=parse(await dref('modernState').get());GW.st=S&&typeof S==='object'&&S.startDate?S:null;return GW.st}
/* Re-read the cloud copy, apply one small change to it, write it back (so another device's edits are not overwritten). */
async function mutate(fn){
  if(GW.busy)return null;GW.busy=true;
  try{
    let S=null;try{S=parse(await dref('modernState').get())}catch(e){}
    if(!S||!S.startDate)S=GW.st;
    if(!S)throw new Error('no data');
    ensureLogs(S);
    const undo=fn(S);
    if(undo===false){GW.st=S;return null}
    await Promise.all([dref('modernState').set({json:JSON.stringify(S),updatedAt:firebase.firestore.FieldValue.serverTimestamp()}),dref('inventory').set({json:JSON.stringify(S.inventory)})]);
    GW.st=S;
    try{HubSync.emit(['grocery'],0)}catch(e){}
    return undo||true;
  }catch(e){console.warn('grocery widget',e);toast('Could not save that');return null}
  finally{GW.busy=false}
}
const weekNo=S=>S.activeWeek;
const curWeek=S=>(S.weeks||{})[weekNo(S)];
const findItem=(S,id)=>((curWeek(S)||{}).items||[]).find(x=>x.id===id);
function nextOpenWeek(S){const w=weekNo(S);for(let n=w+1;n<=w+12;n++){if(S.weeks[n]&&!S.weeks[n].completed)return n}return null}
/* ---- paint ---- */
function figures(S){
  const wn=weekNo(S),W=curWeek(S);if(!W)return null;
  const items=(W.items||[]).filter(x=>openQty(x)>0||(x.carriedQty||0)>0||(x.purchasedQty||0)>0);
  const live=(W.items||[]).filter(x=>openQty(x)>0);
  const left=live.filter(x=>remaining(x)>0).length,spent=cost(W);
  return {wn,W,live,left,bought:live.length-left,spent,target:S.budget||0,items};
}
function rowHtml(S,x,u,S0){
  const done=isDone(x),open=openQty(x),ed=u.edit===x.id;
  const p=price(x);
  let h='<div class="gw-row'+(done?' done':'')+'" data-id="'+esc2(x.id)+'"><button type="button" class="gw-check'+(done?' on':'')+'" data-gw="tick" aria-label="'+(done?'Mark not bought':'Mark bought')+'">'+(done?'✓':'')+'</button>'+
   '<span class="gw-what"><b>'+esc2(nameOf(S,x))+'</b><small>'+(x.purchasedQty>0&&!done?(x.purchasedQty+' of '+open+' bought'):open>1?('Need '+open):'')+(x.substituteName?(' · bought '+esc2(x.substituteName)):'')+'</small></span>'+
   '<span class="gw-qty"><button type="button" data-gw="dec" aria-label="One fewer bought">−</button><i>'+(x.purchasedQty||0)+'/'+open+'</i><button type="button" data-gw="inc" aria-label="One more bought">+</button></span>'+
   '<button type="button" class="gw-price" data-gw="edit" title="Edit price, quantity or remove">'+money(p)+'</button></div>';
  if(ed)h+='<div class="gw-edit" data-id="'+esc2(x.id)+'"><label>Planned<input class="gw-e-plan" inputmode="numeric" value="'+x.plannedQty+'" aria-label="Planned quantity"></label><label>Price each<input class="gw-e-price" inputmode="decimal" value="'+p+'" aria-label="Unit price"></label><button type="button" class="bw-go" data-gw="save-edit">Save</button><button type="button" data-gw="cancel-edit">Cancel</button><button type="button" class="gw-rm" data-gw="remove">Remove</button></div>';
  return h;
}
function listHtml(S,F,u,hideBought){
  let rows=F.live.filter(x=>u.cat==='all'||catOf(S,x)===u.cat);
  if(hideBought)rows=rows.filter(x=>!isDone(x));
  if(!rows.length)return '<div class="bw-empty">'+(F.live.length&&F.left===0&&hideBought?'Everything is bought. Finish the trip below.':F.live.length?'Nothing in this view.':'The list is empty. Add what you need below.')+'</div>';
  const stores=[];rows.forEach(x=>{const s=storeOf(S,x);if(stores.indexOf(s)<0)stores.push(s)});
  return stores.map(s=>{
    const list=rows.filter(x=>storeOf(S,x)===s).sort((a,b)=>(isDone(a)?1:0)-(isDone(b)?1:0));
    const left=list.filter(x=>!isDone(x)).length;
    return '<div class="gw-store"><div class="gw-sh"><b>'+esc2(s)+'</b><span>'+(left?left+' left':'done')+'</span></div>'+list.map(x=>rowHtml(S,x,u)).join('')+'</div>';
  }).join('');
}
function addForm(S){
  const names=(S.products||[]).map(p=>'<option value="'+esc2(p.name)+'"></option>').join('');
  return '<div class="gw-add"><div class="bw-row"><input class="gw-n" list="gw-cat" maxlength="60" placeholder="Add an item (pick from your catalog or type a new one)" aria-label="Item name"><datalist id="gw-cat">'+names+'</datalist></div>'+
    '<div class="bw-row"><input class="gw-q" inputmode="numeric" placeholder="Qty" value="1" aria-label="Quantity"><input class="gw-p" inputmode="decimal" placeholder="Price (optional)" aria-label="Unit price"><input class="gw-s" maxlength="30" placeholder="Store (new items)" aria-label="Store"><button type="button" class="bw-go" data-gw="add">Add</button></div></div>';
}
function finishBlock(S,F,u){
  const W=F.W;
  if(W.completed)return '<div class="gw-fin"><span class="ok">Trip finished · '+money(F.spent)+' spent</span></div>';
  if(!F.live.length)return '';
  const left=F.live.filter(x=>remaining(x)>0);
  if(!u.finish){
    return '<div class="gw-fin"><span>'+(left.length?left.length+' item'+(left.length===1?'':'s')+' not bought yet':'Everything is bought')+'</span><button type="button" class="'+(left.length?'':'bw-go')+'" data-gw="finish">Finish trip</button></div>';
  }
  const nx=nextOpenWeek(S);
  if(!left.length)return '<div class="gw-fin"><span>Save this trip to History?</span><button type="button" class="bw-go" data-gw="finish-go" data-mode="none">Finish trip</button><button type="button" data-gw="finish-cancel">Cancel</button></div>';
  return '<div class="gw-fin col"><span>'+left.length+' item'+(left.length===1?'':'s')+' not bought: '+esc2(left.slice(0,3).map(x=>nameOf(S,x)).join(', '))+(left.length>3?' +'+(left.length-3)+' more':'')+'</span><div class="bw-row">'+
    (nx?'<button type="button" class="bw-go" data-gw="finish-go" data-mode="move">Move to next week</button>':'')+
    '<button type="button" data-gw="finish-go" data-mode="drop">Drop them</button><button type="button" data-gw="finish-cancel">Cancel</button></div>'+(nx?'':'<small>Next week is not on the list yet; open Grocery once to start it, then you can move items.</small>')+'</div>';
}
function head(S,F){
  const pct=F.target>0?Math.min(100,F.spent/F.target*100):0,bad=F.target>0&&F.spent>F.target;
  return '<div class="gw-head"><div class="bw-big"><strong>'+F.left+'</strong><span>item'+(F.left===1?'':'s')+' left · '+F.bought+' of '+F.live.length+' bought</span></div>'+
    '<div class="bw-bar'+(bad?' bad':'')+' gw-meter"><i style="width:'+pct+'%"></i></div>'+
    '<div class="bw-line gw-sub"><span>'+weekLabel(F.wn)+' · '+weekRange(S,F.wn)+'</span><span>'+money(F.spent)+(F.target?' of '+money0(F.target):'')+' spent</span></div></div>';
}
function catChips(S,F,u){
  const have={};F.live.forEach(x=>{have[catOf(S,x)]=1});const ks=Object.keys(have);if(ks.length<2)return '';
  const L={food:'Food',household:'Household',skin:'Skin'};
  return '<div class="bw-seg gw-cats">'+[['all','All']].concat(ks.map(k=>[k,L[k]||k])).map(([k,l])=>'<button type="button" data-gw="cat" data-v="'+esc2(k)+'" class="'+(u.cat===k?'on':'')+'">'+esc2(l)+'</button>').join('')+'</div>';
}
function paint(el){
  const S=GW.st,u=GW.ui;
  if(!S){el.innerHTML='<div class="empty-state"><strong>Grocery not started</strong>Open Grocery once to set up your list, then it shows here.<a class="widget-card-link" href="apps/grocery.html" data-profile-link>Open Grocery <i data-lucide="arrow-up-right"></i></a></div>';try{updateProfileLinks();window.lucide&&lucide.createIcons()}catch(e){}return}
  const F=figures(S);
  if(!F){el.innerHTML='<div class="empty-state"><strong>This week is not set up</strong>Open Grocery once and the week is created for you.<a class="widget-card-link" href="apps/grocery.html" data-profile-link>Open Grocery <i data-lucide="arrow-up-right"></i></a></div>';try{updateProfileLinks();window.lucide&&lucide.createIcons()}catch(e){}return}
  let hide=false;try{hide=!!wsAll(state.widgets.find(w=>w.type==='grocery'),WIDGET_TYPES.grocery).hide}catch(e){}
  const keep={n:(el.querySelector('.gw-n')||{}).value,q:(el.querySelector('.gw-q')||{}).value,p:(el.querySelector('.gw-p')||{}).value,s:(el.querySelector('.gw-s')||{}).value};
  el.innerHTML='<div class="bw gw">'+head(S,F)+catChips(S,F,u)+'<div class="gw-list">'+listHtml(S,F,u,hide)+'</div>'+(F.W.completed?'':addForm(S))+finishBlock(S,F,u)+
    '<a class="widget-card-link" href="apps/grocery.html" data-profile-link>Open Grocery <i data-lucide="arrow-up-right"></i></a></div>';
  [['.gw-n','n'],['.gw-q','q'],['.gw-p','p'],['.gw-s','s']].forEach(([s,k])=>{const i=el.querySelector(s);if(i&&keep[k]!=null&&keep[k]!=='')i.value=keep[k]});
  try{updateProfileLinks();window.lucide&&lucide.createIcons()}catch(e){}
}
/* ---- actions ---- */
function setBought(S,w,x,v){
  v=Math.max(0,Math.min(round(v,2),openQty(x)));
  x.purchasedQty=v;if(v>0&&x.actualPrice==null)x.actualPrice=x.unitPrice;
  logPurchase(S,w,x);
}
async function setBoughtUndo(el,id,target){
  const r=await mutate(S=>{const x=findItem(S,id);if(!x)return false;const w=weekNo(S),prev={q:x.purchasedQty||0,ap:x.actualPrice};
    const v=typeof target==='function'?target(x):target;if(v===(x.purchasedQty||0))return false;setBought(S,w,x,v);return {id,prev}});
  paint(el);return r;
}
async function tick(el,id){
  const r=await setBoughtUndo(el,id,x=>isDone(x)?0:openQty(x));
  if(r&&r.id)toast('Updated','Undo',async()=>{await mutate(S=>{const x=findItem(S,r.id);if(!x)return false;x.purchasedQty=r.prev.q;x.actualPrice=r.prev.ap;logPurchase(S,weekNo(S),x)});paint(el)});
}
async function step(el,id,d){await setBoughtUndo(el,id,x=>(x.purchasedQty||0)+d)}
async function saveEdit(el,row){
  const id=row.dataset.id,plan=num(row.querySelector('.gw-e-plan').value),pr=parseFloat(row.querySelector('.gw-e-price').value);
  if(!plan)return toast('Planned quantity must be at least 1');
  const r=await mutate(S=>{const x=findItem(S,id);if(!x)return false;const w=weekNo(S);
    const prev={plan:x.plannedQty,bought:x.purchasedQty,unit:x.unitPrice,ap:x.actualPrice};
    x.plannedQty=plan;x.purchasedQty=Math.min(x.purchasedQty||0,plan);
    if(isFinite(pr)&&pr>=0){if((x.purchasedQty||0)>0)x.actualPrice=pr;else{x.unitPrice=pr;x.actualPrice=null}}
    if((x.purchasedQty||0)>0||prev.bought>0)logPurchase(S,w,x);
    return {id,prev}});
  GW.ui.edit=null;paint(el);
  if(r&&r.id)toast('Saved','Undo',async()=>{await mutate(S=>{const x=findItem(S,r.id);if(!x)return false;x.plannedQty=r.prev.plan;x.purchasedQty=r.prev.bought;x.unitPrice=r.prev.unit;x.actualPrice=r.prev.ap;logPurchase(S,weekNo(S),x)});paint(el)});
}
async function removeItem(el,id){
  const r=await mutate(S=>{const W=curWeek(S),i=W.items.findIndex(x=>x.id===id);if(i<0)return false;const x=W.items[i],copy=JSON.parse(JSON.stringify(x));unbuy(S,weekNo(S),x);W.items.splice(i,1);return {copy,i}});
  GW.ui.edit=null;paint(el);
  if(r&&r.copy)toast('Item removed','Undo',async()=>{await mutate(S=>{const W=curWeek(S);W.items.splice(Math.min(r.i,W.items.length),0,r.copy);if((r.copy.purchasedQty||0)>0)logPurchase(S,weekNo(S),r.copy)});paint(el)});
}
async function addItem(el){
  const nm=(el.querySelector('.gw-n').value||'').trim();if(!nm)return toast('Type what you need');
  const qty=num(el.querySelector('.gw-q').value)||1,pr=parseFloat(el.querySelector('.gw-p').value),store=(el.querySelector('.gw-s').value||'').trim()||'Other';
  const r=await mutate(S=>{
    const W=curWeek(S);if(!W)return false;
    const p=(S.products||[]).find(x=>(x.name||'').trim().toLowerCase()===nm.toLowerCase());
    const unit=isFinite(pr)&&pr>=0?pr:(p?p.price||0:0);
    const dup=p&&W.items.find(x=>x.productId===p.id&&remaining(x)>0&&!(x.substituteName));
    if(dup){const prev=dup.plannedQty;dup.plannedQty+=qty;return {bump:dup.id,prev}}
    const id='custom-'+Date.now()+'-'+Math.random().toString(36).slice(2,6);
    const it={id,productId:p?p.id:null,name:p?p.name:nm,store:p?p.store:store,plannedQty:qty,purchasedQty:0,unitPrice:unit,actualPrice:null,carriedQty:0,dismissedQty:0,source:'custom'};
    if(!p)it.category=GW.ui.cat!=='all'?GW.ui.cat:'food';
    W.items.push(it);return {added:id};
  });
  if(!r)return;
  ['.gw-n','.gw-p','.gw-s'].forEach(s=>{const i=el.querySelector(s);if(i)i.value=''});el.querySelector('.gw-q').value='1';
  paint(el);
  toast(r.bump?'Added to the one already on your list':'Added to the list','Undo',async()=>{await mutate(S=>{const W=curWeek(S);if(r.added)W.items=W.items.filter(x=>x.id!==r.added);else{const x=findItem(S,r.bump);if(x)x.plannedQty=r.prev}});paint(el)});
  const n=el.querySelector('.gw-n');n&&n.focus();
}
async function finishTrip(el,mode){
  const r=await mutate(S=>{
    const wn=weekNo(S),W=curWeek(S);if(!W||W.completed)return false;
    const snap={wn,week:JSON.parse(JSON.stringify(W)),active:S.activeWeek,hist:JSON.parse(JSON.stringify(S.history)),nextWeekNo:null,nextWeek:null};
    const moved=[],nx=nextOpenWeek(S);
    (W.items||[]).forEach(x=>{const rem=remaining(x);if(rem<=0)return;
      if(mode==='move'&&nx){x.carriedQty=(x.carriedQty||0)+rem;
        const T=S.weeks[nx];if(!snap.nextWeek){snap.nextWeekNo=nx;snap.nextWeek=JSON.parse(JSON.stringify(T))}
        const m=T.items.find(i=>i.productId&&i.productId===x.productId&&i.source==='rollover');
        if(m)m.plannedQty+=rem;else T.items.push({id:'roll-'+nx+'-'+Date.now()+'-'+Math.random(),productId:x.productId,name:nameOf(S,x),store:storeOf(S,x),plannedQty:rem,purchasedQty:0,unitPrice:x.unitPrice,actualPrice:null,carriedQty:0,dismissedQty:0,source:'rollover',note:'From '+weekLabel(wn)});
        moved.push({name:nameOf(S,x),qty:rem,to:nx})}
      else x.dismissedQty=(x.dismissedQty||0)+rem});
    const rec={week:wn,completed:true,date:today(),planned:W.items.reduce((s,x)=>s+x.plannedQty*(x.unitPrice||0),0),actual:cost(W),
      lines:W.items.map(x=>({name:nameOf(S,x),planned:x.plannedQty,purchased:x.purchasedQty,moved:x.carriedQty||0,notCarried:x.dismissedQty||0,sub:x.substituteName||null})),moved};
    W.completed=true;const ex=S.history.find(h=>h.week===wn);if(ex)Object.assign(ex,rec);else S.history.push(rec);
    const nxt=nextOpenWeek(S);if(nxt)S.activeWeek=nxt;
    return snap;
  });
  GW.ui.finish=false;paint(el);
  if(r&&r.week)toast('Trip finished and saved to History','Undo',async()=>{await mutate(S=>{
    S.weeks[r.wn]=r.week;
    if(r.nextWeekNo&&r.nextWeek)S.weeks[r.nextWeekNo]=r.nextWeek;
    S.history=r.hist;S.activeWeek=r.active});paint(el)});
}
/* ---- wiring ---- */
function wire(el){
  if(el.__gw)return;el.__gw=1;
  el.addEventListener('click',e=>{
    const b=e.target.closest('[data-gw]');if(!b||!el.contains(b))return;
    const k=b.dataset.gw,row=b.closest('[data-id]'),id=row&&row.dataset.id,u=GW.ui;
    if(k==='tick')tick(el,id);
    else if(k==='inc')step(el,id,1);
    else if(k==='dec')step(el,id,-1);
    else if(k==='edit'){u.edit=u.edit===id?null:id;paint(el)}
    else if(k==='cancel-edit'){u.edit=null;paint(el)}
    else if(k==='save-edit')saveEdit(el,row);
    else if(k==='remove')removeItem(el,id);
    else if(k==='add')addItem(el);
    else if(k==='cat'){u.cat=b.dataset.v;paint(el)}
    else if(k==='finish'){u.finish=true;paint(el)}
    else if(k==='finish-cancel'){u.finish=false;paint(el)}
    else if(k==='finish-go')finishTrip(el,b.dataset.mode);
  });
  el.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&e.target.matches('.gw-n,.gw-q,.gw-p,.gw-s')){e.preventDefault();addItem(el)}
    if(e.key==='Enter'&&e.target.matches('.gw-e-plan,.gw-e-price')){e.preventDefault();saveEdit(el,e.target.closest('[data-id]'))}
  });
}
const base=WIDGET_TYPES.grocery;
Object.assign(base,{
  desc:"Shop from here: items by store, tick bought, change price or quantity, add or remove items, move leftovers to next week and finish the trip. Pantry and purchase log stay in step with the Grocery app.",
  defaultSize:'lg',
  async render(el){
    wire(el);
    if(!GW.st)el.innerHTML='<div class="empty-state">Loading your list…</div>';
    try{await load()}catch(e){if(!GW.st){el.innerHTML='<div class="empty-state"><strong>Unavailable</strong>Could not load the grocery list.</div>';return}}
    paint(el);
  }
});
if(typeof WIDGET_NO_CACHE==='object')WIDGET_NO_CACHE.grocery=1;
window.__gw={GW,paint,load,figures};
})();

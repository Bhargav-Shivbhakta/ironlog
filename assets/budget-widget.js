/* Budget widget: run the month from the Hub without opening Budget.
   Same documents, same record shapes and the same merge-before-save as apps/budget.html:
     personal  users/{uid}/budget-profiles/{profile}/data/{transactions|categories|bills|incomeCats|recurring}
     shared    users/{uid}/budget-shared/{same keys}
   Does here: pace and left-per-day, category bars, add expense/income (Mine or Shared, half or exact split, repeat),
   edit and delete recent entries (with Undo), pay or mark bills paid, settle up. Everything else stays in the Budget app. */
(function(){
'use strict';
if(typeof WIDGET_TYPES==='undefined'||!WIDGET_TYPES.budget)return;
const INCOME_CATS=[{id:'inc-paycheck',name:'Paycheck',color:'#2E7D5B'},{id:'inc-freelance',name:'Freelance',color:'#3F6FA3'},{id:'inc-interest',name:'Interest & dividends',color:'#7C5C9E'},{id:'inc-refund',name:'Refund',color:'#B07D1E'},{id:'inc-gift',name:'Gift',color:'#A8517A'},{id:'inc-other',name:'Other income',color:'#7A7A72'}];
const CAT_COLORS=['#AD7B20','#2A78D6','#A8517A','#2F7C5A','#B8493F','#7A5817','#5C8A6E','#4A5ED6','#C9922E','#B25C78'];
const BILL_MONTHS={monthly:1,quarterly:3,semiannual:6,yearly:12};
const FREQ=[['none','Does not repeat'],['weekly','Every week'],['biweekly','Every 2 weeks'],['monthly','Every month'],['yearly','Every year']];
const BW={d:null,ids:{},ui:{tab:'add',scope:'personal',type:'expense',split:'half',repeat:'none',edit:null,confirmSettle:false},busy:false};
const uid2=()=>'id-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
const pad=n=>String(n).padStart(2,'0');
const fmt=n=>'$'+(Number(n)||0).toLocaleString(undefined,{maximumFractionDigits:0});
const fmt2=n=>'$'+(Number(n)||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const ref=(scope,key)=>scope==='shared'?db.collection('users').doc(state.user.uid).collection('budget-shared').doc(key):db.collection('users').doc(state.user.uid).collection('budget-profiles').doc(state.profile).collection('data').doc(key);
const KEYS=['transactions','categories','bills','incomeCats','recurring'];
async function load(){
  const out={};
  const snaps=await Promise.all(['personal','shared'].flatMap(sc=>KEYS.map(k=>ref(sc,k).get().then(s=>[sc,k,s]).catch(()=>[sc,k,null]))));
  snaps.forEach(([sc,k,s])=>{
    let v=null;try{v=(s&&s.exists&&s.data().json)?JSON.parse(s.data().json):null}catch(e){}
    out[sc+':'+k]=Array.isArray(v)?v:(k==='incomeCats'?null:[]);
    if(Array.isArray(v))BW.ids[sc+':'+k]=new Set(v.map(x=>x&&x.id));
  });
  BW.d=out;return out;
}
const L=(sc,k)=>BW.d[sc+':'+k]||[];
async function save(scope,key){
  const sk=scope+':'+key,arr=BW.d[sk],r=ref(scope,key),base=BW.ids[sk];
  if(base&&Array.isArray(arr)){
    try{const sn=await r.get();const cloud=(sn&&sn.exists&&sn.data().json)?JSON.parse(sn.data().json):null;
      if(Array.isArray(cloud)){const have=new Set(arr.map(x=>x&&x.id));cloud.forEach(x=>{if(x&&x.id&&!have.has(x.id)&&!base.has(x.id))arr.push(x)})}}catch(e){}
  }
  await r.set({json:JSON.stringify(arr)});BW.ids[sk]=new Set(arr.map(x=>x&&x.id));
}
const catOf=(sc,id)=>L(sc,'categories').find(c=>c.id===id)||(L(sc,'incomeCats').length?L(sc,'incomeCats'):INCOME_CATS).find(c=>c.id===id)||INCOME_CATS.find(c=>c.id===id)||L(sc==='shared'?'personal':'shared','categories').find(c=>c.id===id);
const catName=(sc,id)=>{const c=catOf(sc,id);return c?c.name:'Uncategorized'};
const expCats=sc=>L(sc,'categories');
const incCats=sc=>(L(sc,'incomeCats').length?L(sc,'incomeCats'):INCOME_CATS);
/* ---- bills (same rules as the Budget app) ---- */
const monthKey=()=>today().slice(0,7);
const billMonthly=b=>!b.freq||b.freq==='monthly'||!b.nextDue;
function dueDay(b){const now=new Date(),last=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();return Math.min(Number(b.dueDay)||1,last)}
function stepDate(s,months,day){const m=/^(\d{4})-(\d{2})-/.exec(s),tm=(+m[2]-1)+months,y=+m[1]+Math.floor(tm/12),mo=((tm%12)+12)%12;return y+'-'+pad(mo+1)+'-'+pad(Math.min(day,new Date(y,mo+1,0).getDate()))}
const billDate=b=>billMonthly(b)?today().slice(0,8)+pad(dueDay(b)):b.nextDue;
const daysAway=b=>Math.round((new Date(billDate(b)+'T00:00:00')-new Date(today()+'T00:00:00'))/86400000);
function billStatus(b){
  if(!billMonthly(b)){const n=daysAway(b);return n<0?'overdue':n===0?'today':'upcoming'}
  const day=new Date().getDate(),due=dueDay(b);
  if(b.lastLoggedMonth===monthKey())return 'paid';
  return day>due?'overdue':day===due?'today':'upcoming';
}
function markPaid(b){
  const prev={lastLoggedMonth:b.lastLoggedMonth,nextDue:b.nextDue};
  if(billMonthly(b))b.lastLoggedMonth=monthKey();
  else{const step=BILL_MONTHS[b.freq]||12,day=Number(b.dueDay)||+b.nextDue.slice(8),t=today();b.nextDue=stepDate(b.nextDue,step,day);for(let g=0;g<40&&b.nextDue<=t;g++)b.nextDue=stepDate(b.nextDue,step,day)}
  return prev;
}
/* ---- repeat (series template, same shape as the Budget app) ---- */
function recurDate(start,freq,k){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(start||'');if(!m)return null;const y=+m[1],mo=+m[2]-1,d=+m[3];
  if(freq==='weekly'||freq==='biweekly'){const dt=new Date(y,mo,d+k*(freq==='weekly'?7:14));return dt.getFullYear()+'-'+pad(dt.getMonth()+1)+'-'+pad(dt.getDate())}
  const add=k*(freq==='yearly'?12:1),tm=mo+add,ty=y+Math.floor(tm/12),tmo=((tm%12)+12)%12;
  return ty+'-'+pad(tmo+1)+'-'+pad(Math.min(d,new Date(ty,tmo+1,0).getDate()));
}
/* ---- numbers ---- */
function figures(){
  const mk=monthKey(),all=['personal','shared'].flatMap(sc=>L(sc,'transactions').map(t=>Object.assign({_sc:sc},t)));
  const exp=all.filter(t=>t.type==='expense'&&(t.date||'').slice(0,7)===mk);
  const spent=exp.reduce((s,t)=>s+(Number(t.amount)||0),0);
  const cats=['personal','shared'].flatMap(sc=>L(sc,'categories').map(c=>Object.assign({_sc:sc},c)));
  const budget=cats.reduce((s,c)=>s+(Number(c.budget)||0),0);
  const byCat={};exp.forEach(t=>{const c=cats.find(x=>x.id===t.categoryId);const k=c?c.id:'none';(byCat[k]=byCat[k]||{name:c?c.name:'Uncategorized',spent:0,limit:c?Number(c.budget)||0:0}).spent+=Number(t.amount)||0});
  const top=Object.values(byCat).sort((a,b)=>b.spent-a.spent).slice(0,3);
  const now=new Date(),dim=new Date(now.getFullYear(),now.getMonth()+1,0).getDate(),day=now.getDate();
  const expected=budget*day/dim,daysLeft=dim-day+1;
  const me=state.profile,other=me==='Bhargav'?'Anusha':'Bhargav';
  const owedOf=t=>t.owedAmount!=null&&t.owedAmount!==''?Number(t.owedAmount):(Number(t.amount)||0)/2;
  const net=L('shared','transactions').filter(t=>t.type==='expense'&&!t.settled&&t.who&&owedOf(t)>0).reduce((a,t)=>a+(t.who===me?1:-1)*owedOf(t),0);
  return {spent,budget,top,expected,left:budget-spent,perDay:daysLeft>0?(budget-spent)/daysLeft:0,daysLeft,net:Math.round(net*100)/100,other};
}
const esc2=s=>esc(String(s==null?'':s));
function opt(list,sel,withNew){return (list.map(c=>'<option value="'+esc2(c.id)+'"'+(c.id===sel?' selected':'')+'>'+esc2(c.name)+'</option>').join('')||'<option value="">No categories yet</option>')+(withNew?'<option value="__new">+ New category…</option>':'')}
function head(F){
  let h='<div class="bw-hero"><div class="bw-big"><strong>'+fmt(F.spent)+'</strong><span>'+(F.budget>0?'of '+fmt(F.budget)+' budget':'spent this month')+'</span></div>';
  if(F.budget>0){
    const pct=Math.min(100,F.spent/F.budget*100),mark=Math.min(100,F.expected/F.budget*100),over=F.spent>F.budget,diff=F.spent-F.expected;
    h+='<div class="bw-pace"><div class="bw-bar'+(over?' bad':'')+'"><i style="width:'+pct.toFixed(1)+'%"></i><b style="left:'+mark.toFixed(1)+'%" title="Where you would be by today"></b></div>'+
      '<div class="bw-line">'+(over?'<span class="bad">'+fmt(F.spent-F.budget)+' over budget</span>':Math.abs(diff)<1?'<span class="ok">On pace</span>':diff>0?'<span class="warn">'+fmt(diff)+' ahead of pace</span>':'<span class="ok">'+fmt(-diff)+' under pace</span>')+
      (F.left>0&&F.daysLeft>0?'<span>'+fmt(F.perDay)+' a day for '+F.daysLeft+' more day'+(F.daysLeft===1?'':'s')+'</span>':'')+'</div></div>';
  }
  h+='</div>';
  h+='<div class="bw-owe">'+(F.net===0?'<span class="ok">All settled</span>':'<span>'+(F.net>0?esc2(F.other)+' owes you '+fmt2(F.net):'You owe '+esc2(F.other)+' '+fmt2(-F.net))+'</span><button type="button" data-bw="settle">'+(BW.ui.confirmSettle?'Tap again to settle all':'Settle all')+'</button>')+'</div>';
  if(F.top.length)h+='<div class="bw-cats">'+F.top.map(c=>{const p=c.limit?Math.min(100,c.spent/c.limit*100):0,bad=c.limit&&c.spent>c.limit;return '<div class="bw-cat"><span>'+esc2(c.name)+'</span><div class="bw-bar sm'+(bad?' bad':'')+'"><i style="width:'+(c.limit?p.toFixed(0):0)+'%"></i></div><b>'+fmt(c.spent)+(c.limit?' / '+fmt(c.limit):'')+'</b></div>'}).join('')+'</div>';
  return h;
}
function addPanel(){
  const u=BW.ui,sc=u.scope,cats=u.type==='income'?incCats(sc):expCats(sc),shared=sc==='shared'&&u.type==='expense';
  return '<div class="bw-form"><div class="bw-row"><div class="bw-seg" data-g="type">'+[['expense','Expense'],['income','Income']].map(([k,l])=>'<button type="button" data-bw="type" data-v="'+k+'" class="'+(u.type===k?'on':'')+'">'+l+'</button>').join('')+'</div>'+
    '<div class="bw-seg" data-g="scope">'+[['personal','Mine'],['shared','Shared']].map(([k,l])=>'<button type="button" data-bw="scope" data-v="'+k+'" class="'+(sc===k?'on':'')+'">'+l+'</button>').join('')+'</div></div>'+
    '<div class="bw-row"><input class="bw-amt" inputmode="decimal" placeholder="$ amount" aria-label="Amount"><select class="bw-sel" aria-label="Category">'+opt(cats,'',true)+'</select></div>'+
    '<div class="bw-row bw-newcat" hidden><input class="bw-newname" type="text" maxlength="40" placeholder="New category name" aria-label="New category name">'+(u.type==='income'?'':'<input class="bw-newlimit" inputmode="decimal" placeholder="Monthly budget (optional)" aria-label="Monthly budget for the new category">')+'</div>'+
    '<div class="bw-row"><input class="bw-note" type="text" placeholder="Note (optional)" aria-label="Note"><input class="bw-date" type="date" value="'+today()+'" aria-label="Date"></div>'+
    (shared?'<div class="bw-row"><div class="bw-seg">'+[['half','Split 50/50'],['exact','Exact amount owed']].map(([k,l])=>'<button type="button" data-bw="split" data-v="'+k+'" class="'+(u.split===k?'on':'')+'">'+l+'</button>').join('')+'</div>'+(u.split==='exact'?'<input class="bw-owed" inputmode="decimal" placeholder="Owed to you" aria-label="Amount the other person owes">':'')+'</div>':'')+
    '<div class="bw-row"><select class="bw-rep" aria-label="Repeat">'+FREQ.map(([k,l])=>'<option value="'+k+'"'+(u.repeat===k?' selected':'')+'>'+l+'</option>').join('')+'</select><button type="button" class="bw-go" data-bw="add">Add</button></div></div>';
}
function recent(){
  const all=['personal','shared'].flatMap(sc=>L(sc,'transactions').map(t=>({sc,t}))).sort((a,b)=>(b.t.date||'').localeCompare(a.t.date||'')||(Number(b.t.createdAt)||0)-(Number(a.t.createdAt)||0)).slice(0,5);
  if(!all.length)return '<div class="bw-empty">No transactions yet. Add one in the Add tab.</div>';
  return '<div class="bw-list">'+all.map(({sc,t})=>{
    if(BW.ui.edit===sc+':'+t.id){const cats=t.type==='income'?incCats(sc):expCats(sc);
      return '<div class="bw-item editing" data-sc="'+sc+'" data-id="'+esc2(t.id)+'"><input class="bw-e-amt" inputmode="decimal" value="'+esc2(t.amount)+'" aria-label="Amount"><select class="bw-e-cat">'+opt(cats,t.categoryId)+'</select><input class="bw-e-date" type="date" value="'+esc2(t.date)+'"><input class="bw-e-note" type="text" value="'+esc2(t.note||'')+'" placeholder="Note"><button type="button" class="bw-go" data-bw="save-edit">Save</button><button type="button" data-bw="cancel-edit">Cancel</button></div>'}
    return '<div class="bw-item" data-sc="'+sc+'" data-id="'+esc2(t.id)+'"><span class="bw-amount '+t.type+'">'+(t.type==='income'?'+':'−')+fmt2(t.amount)+'</span><span class="bw-what"><b>'+esc2(t.note||catName(sc,t.categoryId))+'</b><small>'+esc2(catName(sc,t.categoryId))+' · '+esc2(t.date)+(sc==='shared'?' · Shared':'')+(t.settled?' · settled':'')+'</small></span><button type="button" data-bw="edit" aria-label="Edit" title="Edit">✎</button><button type="button" data-bw="del" aria-label="Delete" title="Delete">🗑</button></div>'}).join('')+'</div>';
}
function bills(){
  const b=['personal','shared'].flatMap(sc=>L(sc,'bills').map(x=>({sc,b:x,st:billStatus(x)}))).filter(x=>x.st!=='paid').sort((a,c)=>daysAway(a.b)-daysAway(c.b)).slice(0,4);
  if(!b.length)return '<div class="bw-empty">No bills waiting. Everything is paid.</div>';
  return '<div class="bw-list">'+b.map(({sc,b:x,st})=>{const n=daysAway(x);const lab=st==='overdue'?'Overdue':st==='today'?'Due today':'Due in '+n+' day'+(n===1?'':'s');
    return '<div class="bw-item" data-sc="'+sc+'" data-id="'+esc2(x.id)+'"><span class="bw-amount expense">'+fmt2(x.amount)+'</span><span class="bw-what"><b>'+esc2(x.name)+'</b><small class="'+(st==='overdue'?'bad':'')+'">'+lab+(sc==='shared'?' · Shared':'')+'</small></span><button type="button" class="bw-go" data-bw="pay" title="Log the payment and mark it paid">Pay</button><button type="button" data-bw="paid" title="Already paid elsewhere: just mark it paid">Mark paid</button></div>'}).join('')+'</div>';
}
function paint(el){
  if(!BW.d){el.innerHTML='<div class="empty-state"><strong>Unavailable</strong>Could not load your budget.</div>';return}
  const F=figures(),u=BW.ui,keep={amt:(el.querySelector('.bw-amt')||{}).value,note:(el.querySelector('.bw-note')||{}).value,date:(el.querySelector('.bw-date')||{}).value,owed:(el.querySelector('.bw-owed')||{}).value};
  el.innerHTML='<div class="bw">'+head(F)+'<div class="bw-tabs" role="tablist">'+[['add','Add'],['recent','Recent'],['bills','Bills']].map(([k,l])=>'<button type="button" role="tab" data-bw="tab" data-v="'+k+'" class="'+(u.tab===k?'on':'')+'">'+l+'</button>').join('')+'</div><div class="bw-panel">'+(u.tab==='add'?addPanel():u.tab==='recent'?recent():bills())+'</div></div>'+
    '<a class="widget-card-link" href="apps/budget.html" data-profile-link>Open Budget <i data-lucide="arrow-up-right"></i></a>';
  if(u.tab==='add'){const q=s=>el.querySelector(s);if(keep.amt&&q('.bw-amt'))q('.bw-amt').value=keep.amt;if(keep.note&&q('.bw-note'))q('.bw-note').value=keep.note;if(keep.date&&q('.bw-date'))q('.bw-date').value=keep.date;if(keep.owed&&q('.bw-owed'))q('.bw-owed').value=keep.owed}
  if(typeof updateProfileLinks==='function')updateProfileLinks();if(window.lucide)lucide.createIcons();
}
async function guard(el,fn){
  if(BW.busy)return;BW.busy=true;
  try{await fn()}catch(e){console.warn(e);toast("Couldn't save, try again");try{await load()}catch(x){}}
  BW.busy=false;paint(el);
}
async function addEntry(el){
  const u=BW.ui,q=s=>el.querySelector(s),amount=parseFloat(q('.bw-amt').value);
  if(!(amount>0)){toast('Enter an amount');return}
  const sc=u.scope,type=u.type;let cat=q('.bw-sel').value,newCat=null;
  if(cat==='__new'){const nm=(q('.bw-newname').value||'').trim();if(!nm){toast('Name the new category');return}
    const key=type==='income'?'incomeCats':'categories',list=type==='income'?incCats(sc):expCats(sc),dupe=list.find(c=>c.name.toLowerCase()===nm.toLowerCase());
    if(dupe)cat=dupe.id;else{newCat={id:uid2(),name:nm,color:CAT_COLORS[list.length%CAT_COLORS.length]};if(type!=='income')newCat.budget=parseFloat((q('.bw-newlimit')||{}).value)||0;cat=newCat.id}}
  if(!cat){toast('Pick or create a category');return}
  const date=q('.bw-date').value||today(),note=(q('.bw-note').value||'').trim(),sharedExp=sc==='shared'&&type==='expense';
  const split=sharedExp?u.split:null,owed=sharedExp?(split==='exact'?(parseFloat((q('.bw-owed')||{}).value)||0):Math.round(amount/2*100)/100):null;
  if(sharedExp&&split==='exact'&&!(owed>0)){toast('Enter what the other person owes');return}
  const rep=q('.bw-rep').value,mk=()=>({id:uid2(),amount,type,categoryId:cat,who:sc==='shared'?state.profile:null,date,note,createdAt:Date.now(),splitMethod:split,owedAmount:owed,settled:sharedExp?false:undefined});
  const t=mk();let series=null;
  await guard(el,async()=>{
    if(newCat){const key=type==='income'?'incomeCats':'categories';if(type==='income'&&!L(sc,'incomeCats').length)BW.d[sc+':incomeCats']=INCOME_CATS.map(c=>Object.assign({},c));L(sc,key).push(newCat);await save(sc,key)}
    const arr=L(sc,'transactions');
    if(rep!=='none'){
      const logNow=date<=today();
      series={id:uid2(),amount,type,categoryId:cat,who:sc==='shared'?state.profile:null,note,splitMethod:split,owedAmount:owed,freq:rep,startDate:date,endDate:'',nextIndex:logNow?1:0,paused:false,createdAt:Date.now()};
      L(sc,'recurring').push(series);await save(sc,'recurring');
      if(logNow){arr.unshift(t);await save(sc,'transactions')}
    }else{arr.unshift(t);await save(sc,'transactions')}
    HubSync.emit(['budget'],0);
    toast('Added '+fmt2(amount)+(sc==='shared'?' (shared)':'')+(series?' · repeats '+FREQ.find(f=>f[0]===rep)[1].toLowerCase():''),'Undo',async()=>{await guard(el,async()=>{
      const a=L(sc,'transactions'),i=a.findIndex(x=>x.id===t.id);if(i>=0)a.splice(i,1);await save(sc,'transactions');
      if(newCat){const key=type==='income'?'incomeCats':'categories',cl=L(sc,key),ci=cl.findIndex(x=>x.id===newCat.id);if(ci>=0&&!L(sc,'transactions').some(x=>x.categoryId===newCat.id)){cl.splice(ci,1);await save(sc,key)}}
      if(series){const r=L(sc,'recurring'),j=r.findIndex(x=>x.id===series.id);if(j>=0)r.splice(j,1);await save(sc,'recurring')}
    })});
    ['.bw-amt','.bw-note','.bw-owed','.bw-newname','.bw-newlimit'].forEach(s=>{const e=q(s);if(e)e.value=''});
  });
}
async function saveEdit(el,row){
  const sc=row.dataset.sc,id=row.dataset.id,t=L(sc,'transactions').find(x=>x.id===id);if(!t)return;
  const amount=parseFloat(row.querySelector('.bw-e-amt').value);if(!(amount>0)){toast('Enter an amount');return}
  const before=JSON.stringify(t);
  await guard(el,async()=>{
    t.amount=amount;t.categoryId=row.querySelector('.bw-e-cat').value;t.date=row.querySelector('.bw-e-date').value||t.date;t.note=row.querySelector('.bw-e-note').value.trim();
    if(sc==='shared'&&t.type==='expense'&&(t.splitMethod||'half')==='half')t.owedAmount=Math.round(amount/2*100)/100;
    BW.ui.edit=null;await save(sc,'transactions');HubSync.emit(['budget'],0);
    toast('Saved','Undo',async()=>{await guard(el,async()=>{const a=L(sc,'transactions'),i=a.findIndex(x=>x.id===id);if(i>=0)a[i]=JSON.parse(before);await save(sc,'transactions')})});
  });
}
async function delEntry(el,row){
  const sc=row.dataset.sc,id=row.dataset.id,a=L(sc,'transactions'),i=a.findIndex(x=>x.id===id);if(i<0)return;const t=a[i];
  await guard(el,async()=>{
    a.splice(i,1);await save(sc,'transactions');HubSync.emit(['budget'],0);
    toast('Deleted '+fmt2(t.amount),'Undo',async()=>{await guard(el,async()=>{L(sc,'transactions').unshift(t);await save(sc,'transactions')})});
  });
}
async function payBill(el,row,log){
  const sc=row.dataset.sc,id=row.dataset.id,b=L(sc,'bills').find(x=>x.id===id);if(!b)return;
  let tx=null,prev=null;
  await guard(el,async()=>{
    if(log){const sharedExp=sc==='shared';tx={id:uid2(),amount:Number(b.amount)||0,type:'expense',categoryId:b.categoryId,who:sharedExp?state.profile:null,date:today(),note:b.name,createdAt:Date.now(),splitMethod:sharedExp?'half':null,owedAmount:sharedExp?Math.round((Number(b.amount)||0)/2*100)/100:null,settled:sharedExp?false:undefined};
      L(sc,'transactions').unshift(tx);await save(sc,'transactions')}
    prev=markPaid(b);await save(sc,'bills');HubSync.emit(['budget'],0);
    toast((log?'Paid ':'Marked paid: ')+b.name,'Undo',async()=>{await guard(el,async()=>{
      b.lastLoggedMonth=prev.lastLoggedMonth;b.nextDue=prev.nextDue;if(prev.lastLoggedMonth===undefined)delete b.lastLoggedMonth;if(prev.nextDue===undefined)delete b.nextDue;await save(sc,'bills');
      if(tx){const a=L(sc,'transactions'),i=a.findIndex(x=>x.id===tx.id);if(i>=0)a.splice(i,1);await save(sc,'transactions')}
    })});
  });
}
async function settleAll(el){
  const owedOf=t=>t.owedAmount!=null&&t.owedAmount!==''?Number(t.owedAmount):(Number(t.amount)||0)/2;
  const open=L('shared','transactions').filter(t=>t.type==='expense'&&t.who&&owedOf(t)>0&&!t.settled);
  if(!open.length)return;
  if(!BW.ui.confirmSettle){BW.ui.confirmSettle=true;paint(el);setTimeout(()=>{if(BW.ui.confirmSettle){BW.ui.confirmSettle=false;if(el.isConnected)paint(el)}},4000);return}
  BW.ui.confirmSettle=false;
  await guard(el,async()=>{
    open.forEach(t=>{t.settled=true});await save('shared','transactions');HubSync.emit(['budget'],0);
    toast('All settled up','Undo',async()=>{await guard(el,async()=>{open.forEach(t=>{t.settled=false});await save('shared','transactions')})});
  });
}
function wire(el){
  if(el._bwWired)return;el._bwWired=true;
  el.addEventListener('click',e=>{
    const b=e.target.closest('[data-bw]');if(!b||!el.contains(b))return;const k=b.dataset.bw,u=BW.ui,row=b.closest('.bw-item');
    if(k==='tab'){u.tab=b.dataset.v;u.edit=null;paint(el)}
    else if(k==='type'){u.type=b.dataset.v;paint(el)}
    else if(k==='scope'){u.scope=b.dataset.v;paint(el)}
    else if(k==='split'){u.split=b.dataset.v;paint(el)}
    else if(k==='add')addEntry(el);
    else if(k==='edit'){u.edit=row.dataset.sc+':'+row.dataset.id;paint(el)}
    else if(k==='cancel-edit'){u.edit=null;paint(el)}
    else if(k==='save-edit')saveEdit(el,row);
    else if(k==='del')delEntry(el,row);
    else if(k==='pay')payBill(el,row,true);
    else if(k==='paid')payBill(el,row,false);
    else if(k==='settle')settleAll(el);
  });
  el.addEventListener('change',e=>{if(e.target.matches('.bw-rep'))BW.ui.repeat=e.target.value;if(e.target.matches('.bw-sel')){const r=el.querySelector('.bw-newcat');if(r){r.hidden=e.target.value!=='__new';if(!r.hidden){const n=r.querySelector('.bw-newname');n&&n.focus()}}}});
  el.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('.bw-amt,.bw-note,.bw-owed')){e.preventDefault();addEntry(el)}});
}
Object.assign(WIDGET_TYPES.budget,{
  desc:"Run your month from here: pace and left per day, category bars, add an expense or income (Mine or Shared, split, repeat), edit or delete recent entries, pay or mark bills paid, settle up. Same data as the Budget app.",
  defaultSize:'lg',
  async render(el){
    wire(el);
    if(!BW.tabSet){BW.tabSet=1;try{const S=wsAll(state.widgets.find(w=>w.type==='budget'),WIDGET_TYPES.budget);if(S.tab)BW.ui.tab=S.tab}catch(e){}}
    if(!BW.d)el.innerHTML='<div class="empty-state">Loading your budget…</div>';
    try{await load()}catch(e){if(!BW.d){el.innerHTML='<div class="empty-state"><strong>Unavailable</strong>Could not load your budget.</div>';return}}
    paint(el);
  }
});
if(typeof WIDGET_NO_CACHE==='object')WIDGET_NO_CACHE.budget=1;
window.__bw={BW,paint,load,figures};
})();

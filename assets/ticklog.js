/* =====================================================================
   CENTRAL TICK LOG
   Every tick and untick, from any app, widget or voice command, adds one
   line to a single log:  users/{uid}/hub-profiles/{Profile}/data/tickLog
   ( {json:'{"v":1,"entries":[{t,p,s,k,d,dt,l,x}, ...]}'} ).

   Nothing in any app has to call this. It is loaded once by
   firebase-config.js (which every page already loads), watches the few
   Firestore documents where ticks are kept, compares each save with what
   was there before, and writes the difference to the log. Each app keeps
   its own data exactly as it did; the log is a history on the side.

   Entry:  t  time (ms)        p  who (Bhargav | Anusha)
           s  source           k  item key (stable per item and day)
           d  1 = ticked, 0 = unticked
           dt the day it counts for (YYYY-MM-DD)
           l  label            x  extra (list name, section)
   Kept: 90 days, at most 4000 lines per person.

   Read it with  TickLog.read('Bhargav')  ->  Promise<entries, newest last>
===================================================================== */
(function(){
  if(window.TickLog)return;
  var KEEP_DAYS=90,MAX=4000,EMPTY='\u0000EMPTY';
  var CACHE={};            // path -> last known JSON string of a watched doc
  var Q=[],timer=null,busy=false;

  function p2(n){return String(n).padStart(2,'0')}
  function today(){var d=new Date();return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate())}
  function ok(v){return v==='Bhargav'||v==='Anusha'}
  function rel(path){var m=/^users\/[^/]+\/(.+)$/.exec(String(path||''));return m?m[1]:null}
  function parse(s){if(s==null||s===EMPTY)return null;try{return JSON.parse(s)}catch(e){return null}}
  var DAYN=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  /* ---------- how each watched document is compared ---------- */
  function diffMap(prev,next,src,labelFn){          // { 'key': true }  (schedule, skin)
    var a=(prev&&typeof prev==='object'&&!Array.isArray(prev))?prev:{},b=(next&&typeof next==='object'&&!Array.isArray(next))?next:{},out=[];
    Object.keys(b).forEach(function(k){if(b[k]&&!a[k])out.push(entry(src,k,1,k.slice(0,10),labelFn&&labelFn(k)))});
    Object.keys(a).forEach(function(k){if(a[k]&&!b[k])out.push(entry(src,k,0,k.slice(0,10),labelFn&&labelFn(k)))});
    return out;
  }
  function entry(s,k,d,dt,l,x){var e={s:s,k:k,d:d,dt:dt};if(l)e.l=String(l).slice(0,90);if(x)e.x=String(x).slice(0,60);return e}
  function byId(arr){var m={};(Array.isArray(arr)?arr:[]).forEach(function(i){if(i&&i.id!=null)m[i.id]=i});return m}

  function diffTasks(prev,next){
    var a=byId(prev),out=[];
    (Array.isArray(next)?next:[]).forEach(function(t){
      if(!t||t.id==null)return;var o=a[t.id];if(!o)return;
      var nd=!!t.done,od=!!o.done;
      if(nd!==od)out.push(entry('todo',String(t.id),nd?1:0,(nd&&t.completedOn)||today(),t.title));
      var ns=Array.isArray(t.subtasks)?t.subtasks:[],os=Array.isArray(o.subtasks)?o.subtasks:[];
      ns.forEach(function(s,i){var q=os[i];if(!q||!s)return;if(!!s.done!==!!q.done)out.push(entry('todo',t.id+'#'+(s.id!=null?s.id:i),s.done?1:0,today(),s.title||s.text,t.title))});
    });
    return out;
  }
  function diffChores(prev,next){
    var a=byId(prev),out=[];
    (Array.isArray(next)?next:[]).forEach(function(c){
      if(!c||c.id==null)return;var o=a[c.id];if(!o)return;
      var nl=c.lastCompleted||null,ol=o.lastCompleted||null;
      if(nl===ol)return;
      if(nl&&(!ol||nl>ol))out.push(entry('chores',c.id+':'+nl,1,nl,c.name));
      else if(ol)out.push(entry('chores',c.id+':'+ol,0,ol,c.name));
    });
    return out;
  }
  function diffChecklist(prev,next){
    var A=byId(prev&&prev.lists),out=[];
    ((next&&next.lists)||[]).forEach(function(l){
      if(!l||l.deleted||l.gone||l.template)return;var ol=A[l.id];if(!ol)return;
      var oi=byId(ol.items);
      (l.items||[]).forEach(function(it){var o=oi[it.id];if(!o)return;if(!!it.done!==!!o.done)out.push(entry('checklist',l.id+':'+it.id,it.done?1:0,today(),it.t,l.title))});
    });
    return out;
  }
  function diffPledges(prev,next){
    var A=byId(prev&&prev.pledges),out=[];
    ((next&&next.pledges)||[]).forEach(function(p){
      if(!p||p.deleted)return;var o=A[p.id];if(!o)return;
      var a=o.log||{},b=p.log||{};
      Object.keys(b).forEach(function(d){if(b[d]&&!a[d])out.push(entry('pledge',p.id+':'+d,1,d,p.title))});
      Object.keys(a).forEach(function(d){if(a[d]&&!b[d])out.push(entry('pledge',p.id+':'+d,0,d,p.title))});
    });
    return out;
  }
  function eaten(e){return !!e&&!e.replaced&&(e.status||'eaten')==='eaten'}
  function diffDiet(prev,next){
    var A=byId(prev&&prev.diary),out=[],seen={};
    ((next&&next.diary)||[]).forEach(function(e){
      if(!e||e.id==null)return;seen[e.id]=1;var o=A[e.id],was=eaten(o),now=eaten(e);
      if(now&&!was)out.push(entry('diet',String(e.id),1,e.date||today(),e.name));
      else if(!now&&was)out.push(entry('diet',String(e.id),0,e.date||today(),e.name));
    });
    Object.keys(A).forEach(function(id){if(!seen[id]&&eaten(A[id]))out.push(entry('diet',String(id),0,A[id].date||today(),A[id].name))});
    return out;
  }
  function diffWater(prev,next){
    var A=byId(flat(prev&&prev.sips)),B=byId(flat(next&&next.sips)),out=[];
    Object.keys(B).forEach(function(id){if(!A[id]){var s=B[id];if(s.src==='gym'||s.src==='old')return;out.push(entry('water',id,1,dayOf(next,id),'Water +'+s.ml+' ml'))}});
    Object.keys(A).forEach(function(id){if(!B[id]){var s=A[id];if(s.src==='gym'||s.src==='old')return;out.push(entry('water',id,0,dayOf(prev,id),'Water \u2212'+s.ml+' ml'))}});
    return out;
  }
  function flat(m){var a=[];if(m&&typeof m==='object')Object.keys(m).forEach(function(d){(Array.isArray(m[d])?m[d]:[]).forEach(function(s){if(s&&s.id!=null){s.__d=d;a.push(s)}})});return a}
  function dayOf(doc,id){var m=doc&&doc.sips,r=today();if(m)Object.keys(m).forEach(function(d){(Array.isArray(m[d])?m[d]:[]).forEach(function(s){if(s&&s.id===id)r=d})});return r}
  function schedLabel(path){
    return function(k){
      var m=/^(\d{4}-\d{2}-\d{2}):(\d+)$/.exec(k);if(!m)return '';
      var tp=parse(CACHE[path.replace('templateLog','dayTemplates')]);
      var day=DAYN[new Date(m[1]+'T12:00:00').getDay()],b=tp&&tp[day]&&tp[day][Number(m[2])];
      return b?(b.activity||b.title||''):'';
    };
  }
  var RULES=[
    {re:/^schedule-profiles\/([^/]+)\/data\/templateLog$/,fn:function(a,b,p){return diffMap(a,b,'schedule',schedLabel(p))}},
    {re:/^skin-profiles\/([^/]+)\/data\/stepLog$/,fn:function(a,b){return diffMap(a,b,'skin',function(k){var q=k.split(':');return 'Skin '+(q[1]||'routine')+' step'})}},
    {re:/^todo-profiles\/([^/]+)\/data\/tasks$/,fn:diffTasks},
    {re:/^todo-shared\/tasks$/,fn:diffTasks},
    {re:/^apps\/chores\/data\/chores$/,fn:diffChores},
    {re:/^apps\/checklist\/data\/state$/,fn:diffChecklist},
    {re:/^apps\/pledge-v3\/data\/state$/,fn:diffPledges},
    {re:/^apps\/nourish-diet-v2\/data\/state$/,fn:diffDiet},
    {re:/^hub-profiles\/([^/]+)\/data\/water$/,fn:diffWater},
    {re:/^schedule-profiles\/([^/]+)\/data\/dayTemplates$/,aux:true}   // only remembered, to name blocks
  ];
  function rule(path){var r=rel(path);if(!r)return null;for(var i=0;i<RULES.length;i++)if(RULES[i].re.test(r))return {r:RULES[i],rel:r};return null}

  function actor(relPath){
    var m=/-profiles\/([^/]+)\//.exec(relPath||'');if(m&&ok(m[1]))return m[1];
    var qp=null,st=null;try{qp=new URLSearchParams(location.search).get('profile')}catch(e){}
    try{st=localStorage.getItem('hub-active-profile')}catch(e){}
    return ok(qp)?qp:ok(st)?st:'Bhargav';
  }

  /* ---------- what a save changed ---------- */
  function jsonOf(data){return data&&typeof data.json==='string'?data.json:null}
  function onWrite(path,data){
    var hit=rule(path);if(!hit)return;
    var next=jsonOf(data);if(next==null)return;
    var prev=CACHE[path];CACHE[path]=next;
    if(hit.r.aux||prev===undefined||prev===next)return;     // never saw the old value: can't tell what changed
    var list=hit.r.fn(parse(prev),parse(next),path)||[];
    if(!list.length)return;
    var who=actor(hit.rel),now=Date.now();
    list.forEach(function(e){e.t=now;e.p=who});
    Q.push.apply(Q,list);schedule();
  }
  function primeSnap(sn){
    try{
      if(!sn||!sn.ref)return;var path=sn.ref.path;if(!rule(path))return;
      if(sn.exists){var d=sn.data();if(d&&typeof d.json==='string')CACHE[path]=d.json}else CACHE[path]=EMPTY;
    }catch(e){}
  }

  /* ---------- writing the log ---------- */
  function schedule(){clearTimeout(timer);timer=setTimeout(flush,900)}
  async function flush(){
    timer=null;if(busy||!Q.length)return;
    var user=null;try{user=firebase.auth().currentUser}catch(e){}
    if(!user){timer=setTimeout(flush,3000);return}
    busy=true;var batch=Q.splice(0),by={};
    batch.forEach(function(e){(by[e.p]=by[e.p]||[]).push(e)});
    try{
      var db=firebase.firestore();
      for(var who in by){
        var ref=db.collection('users').doc(user.uid).collection('hub-profiles').doc(who).collection('data').doc('tickLog');
        await db.runTransaction(async function(tx){
          var sn=await tx.get(ref),o=null;
          try{o=sn.exists?JSON.parse(sn.data().json):null}catch(e){}
          var arr=(o&&Array.isArray(o.entries))?o.entries:[],last={};
          arr.forEach(function(e){last[e.s+'|'+e.k]=e.d});           // latest known state of each item
          by[who].forEach(function(e){
            var key=e.s+'|'+e.k;
            if(last[key]===e.d)return;                                // already logged in that state
            arr.push(e);last[key]=e.d;
          });
          var cut=Date.now()-KEEP_DAYS*864e5;
          arr=arr.filter(function(e){return e.t>=cut});
          if(arr.length>MAX)arr=arr.slice(arr.length-MAX);
          tx.set(ref,{json:JSON.stringify({v:1,entries:arr}),updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
        });
      }
    }catch(e){Q.unshift.apply(Q,batch);timer=setTimeout(flush,8000)}
    busy=false;if(Q.length&&!timer)schedule();
  }
  window.addEventListener('pagehide',function(){if(Q.length)flush()});
  document.addEventListener('visibilitychange',function(){if(document.hidden&&Q.length)flush()});

  /* ---------- listening to Firestore ---------- */
  function wrap(obj,name,hook){
    var orig=obj&&obj[name];if(typeof orig!=='function'||orig.__tl)return;
    var w=function(){var out=orig.apply(this,arguments);try{hook.call(this,arguments,out)}catch(e){}return out};
    w.__tl=1;obj[name]=w;
  }
  function dataOfUpdate(a0,a1){
    if(a0&&typeof a0==='object')return a0;
    if(a0==='json')return {json:a1};
    return null;
  }
  function wrapSnapArgs(args){
    var cb=function(f){return function(sn){primeSnap(sn);return f.apply(this,arguments)}};
    return Array.prototype.map.call(args,function(a){
      if(typeof a==='function')return cb(a);
      if(a&&typeof a==='object'&&typeof a.next==='function')return Object.assign({},a,{next:cb(a.next)});
      return a;
    });
  }
  function install(){
    var F=window.firebase&&firebase.firestore;
    if(!F||!F.DocumentReference||!F.DocumentReference.prototype)return false;
    var DR=F.DocumentReference.prototype,TX=F.Transaction&&F.Transaction.prototype,WB=F.WriteBatch&&F.WriteBatch.prototype;
    wrap(DR,'set',function(a){onWrite(this.path,a[0])});
    wrap(DR,'update',function(a){onWrite(this.path,dataOfUpdate(a[0],a[1]))});
    wrap(DR,'get',function(a,out){Promise.resolve(out).then(primeSnap,function(){})});
    var origSnap=DR.onSnapshot;
    if(typeof origSnap==='function'&&!origSnap.__tl){
      DR.onSnapshot=function(){return origSnap.apply(this,wrapSnapArgs(arguments))};DR.onSnapshot.__tl=1;
    }
    if(TX){
      wrap(TX,'set',function(a){onWrite(a[0]&&a[0].path,a[1])});
      wrap(TX,'update',function(a){onWrite(a[0]&&a[0].path,dataOfUpdate(a[1],a[2]))});
      wrap(TX,'get',function(a,out){Promise.resolve(out).then(primeSnap,function(){})});
    }
    if(WB){
      wrap(WB,'set',function(a){onWrite(a[0]&&a[0].path,a[1])});
      wrap(WB,'update',function(a){onWrite(a[0]&&a[0].path,dataOfUpdate(a[1],a[2]))});
    }
    return true;
  }
  if(!install()){
    var tries=0,iv=setInterval(function(){if(install()||++tries>400)clearInterval(iv)},40);
  }

  /* ---------- reading it back ---------- */
  window.TickLog={
    read:async function(who){
      try{
        var u=firebase.auth().currentUser;if(!u)return[];
        var sn=await firebase.firestore().collection('users').doc(u.uid).collection('hub-profiles').doc(who).collection('data').doc('tickLog').get();
        var o=sn.exists?JSON.parse(sn.data().json):null;return(o&&Array.isArray(o.entries))?o.entries:[];
      }catch(e){return[]}
    },
    flush:flush,
    _q:Q,
    _cache:CACHE
  };
})();

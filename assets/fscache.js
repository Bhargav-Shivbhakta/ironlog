/* Cheap history reads.
   Gym, Diet and the Hub's Insights read whole log collections (dailyLogs, workoutLogs, cardioLogs). Firestore bills one
   read per DOCUMENT, so every open cost "days of history" reads and grew every day.
   FsCache.get(collectionRef) reads the full collection once, keeps it in this browser, and afterwards only fetches the
   last ~14 days (documents are named by date). A full re-read happens weekly as a safety net.
   Returns a snapshot-like object ({docs, forEach, size, empty}) so callers don't change. */
(function(){
  var DAY=86400000, OVERLAP_DAYS=14, FULL_EVERY_DAYS=7;
  function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function key(path){return 'fscache:'+path}
  function load(path){try{var c=JSON.parse(localStorage.getItem(key(path)));return c&&c.docs&&c.syncedTo?c:null}catch(e){return null}}
  function save(path,c){try{localStorage.setItem(key(path),JSON.stringify(c));return true}catch(e){try{localStorage.removeItem(key(path))}catch(_){}return false}}
  function clone(v){return v===undefined?v:JSON.parse(JSON.stringify(v))}
  function snapshot(map){
    var docs=Object.keys(map).map(function(id){return{id:id,exists:true,data:function(){return clone(map[id])}}});
    return{docs:docs,size:docs.length,empty:!docs.length,forEach:function(cb){docs.forEach(cb)},__map:map};
  }
  async function fullRead(colRef){var snap=await colRef.get(),docs={};snap.forEach(function(d){docs[d.id]=d.data()});return docs}
  var memo={},MEMO_MS=20000; // several parts of one page ask for the same collection within seconds: answer once
  function get(colRef){
    var path=colRef.path,m=memo[path];
    if(m&&Date.now()-m.t<MEMO_MS)return m.p.then(function(snap){return snapshot(snap.__map)});
    var p=doGet(colRef).then(function(snap){return snap},function(e){delete memo[path];throw e});
    memo[path]={t:Date.now(),p:p};return p.then(function(snap){return snapshot(snap.__map)});
  }
  async function doGet(colRef){
    var path=colRef.path,c=load(path),today=iso(new Date());
    try{
      if(!c||Date.now()-(c.fullAt||0)>FULL_EVERY_DAYS*DAY){
        c={docs:await fullRead(colRef),syncedTo:today,fullAt:Date.now()};save(path,c);return snapshot(c.docs);
      }
      var since=iso(new Date(new Date(c.syncedTo+'T12:00:00').getTime()-OVERLAP_DAYS*DAY));
      var snap=await colRef.where(firebase.firestore.FieldPath.documentId(),'>=',since).get(),seen={};
      snap.forEach(function(d){seen[d.id]=1;c.docs[d.id]=d.data()});
      Object.keys(c.docs).forEach(function(id){if(id>=since&&!seen[id])delete c.docs[id]}); // deleted elsewhere
      c.syncedTo=today;save(path,c);return snapshot(c.docs);
    }catch(e){ // any trouble: fall back to a plain full read, never break the page
      var docs=await fullRead(colRef);return snapshot(docs);
    }
  }
  /* keep the cache in step with our own writes (opts.merge for merge-writes; data===null deletes) */
  function patch(colPath,id,data,opts){
    delete memo[colPath];
    var c=load(colPath);if(!c)return;
    if(data===null)delete c.docs[id];
    else if(opts&&opts.merge&&c.docs[id])c.docs[id]=Object.assign({},c.docs[id],clone(data));
    else c.docs[id]=clone(data);
    save(colPath,c);
  }
  /* bulk edits (History edits/deletes, restore, import): next read does a full refresh */
  function invalidate(colPath){delete memo[colPath];try{localStorage.removeItem(key(colPath))}catch(e){}}
  function invalidateAll(){memo={};try{Object.keys(localStorage).filter(function(k){return k.indexOf('fscache:')===0}).forEach(function(k){localStorage.removeItem(k)})}catch(e){}}
  window.FsCache={get:get,patch:patch,invalidate:invalidate,invalidateAll:invalidateAll};
})();

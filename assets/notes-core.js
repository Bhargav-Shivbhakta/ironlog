/* NotesCore — the logic behind the Hub's "Notes & lists" widget.
   KEEP IN SYNC with:
     - apps/checklist.html  (list model: items, parent, done, owner private|shared, hide, due, hist, u)
     - apps/todo.html       (sticky notes: {id,text,color,pin,u,del,from})
   Pure functions on plain objects, no Firestore in here. */
(function(){
  if(window.NotesCore)return;
  var N={};
  N.COLORS=['#F6E7A6','#F1D7DE','#D9E8D3','#DCE6EE','#E6DCF0','#F2DFC7'];
  N.FONTS=[{value:'',label:'Font'},{value:'Georgia, serif',label:'Serif'},{value:"'Courier New', monospace",label:'Mono'},{value:"'Caveat', cursive",label:'Handwritten'},{value:"'Comic Sans MS', cursive",label:'Casual'}];
  N.LIST_STYLES=[{value:'',label:'List style'},{value:'decimal',label:'1, 2, 3'},{value:'lower-alpha',label:'a, b, c'},{value:'upper-roman',label:'I, II, III'},{value:'disc',label:'• Bullet'},{value:'circle',label:'○ Circle'},{value:'square',label:'▪ Square'}];
  N.LIM={notes:100,noteChars:20000,items:150,lists:60,docChars:700000,title:80,item:200,trashDays:30};
  var uid8=function(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6)};
  N.uid=uid8;
  var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})};
  N.esc=esc;

  /* ---------- rich text safety ---------- */
  var KEEP={B:1,STRONG:1,I:1,EM:1,U:1,S:1,STRIKE:1,UL:1,OL:1,LI:1,BR:1,DIV:1,P:1,FONT:1,SPAN:1};
  var LS=/^(decimal|lower-alpha|upper-roman|disc|circle|square)$/;
  N.sanitize=function(html){
    var d=new DOMParser().parseFromString('<body>'+String(html||'')+'</body>','text/html').body;
    (function walk(n){
      Array.prototype.slice.call(n.childNodes).forEach(function(c){
        if(c.nodeType===3)return;
        if(c.nodeType!==1){n.removeChild(c);return}
        if(c.tagName==='SCRIPT'||c.tagName==='STYLE'||c.tagName==='IFRAME'||c.tagName==='OBJECT'){n.removeChild(c);return}
        walk(c);
        if(!KEEP[c.tagName]){while(c.firstChild)n.insertBefore(c.firstChild,c);n.removeChild(c);return}
        var face=c.tagName==='FONT'?c.getAttribute('face'):null,ls=(c.tagName==='UL'||c.tagName==='OL')?(c.style&&c.style.listStyleType):null,ff=c.tagName==='SPAN'?(c.style&&c.style.fontFamily):null;
        Array.prototype.slice.call(c.attributes).forEach(function(a){c.removeAttribute(a.name)});
        if(face&&/^[\w ,'"-]{1,60}$/.test(face))c.setAttribute('face',face);
        if(ls&&LS.test(ls))c.style.listStyleType=ls;
        if(ff&&/^[\w ,'"-]{1,60}$/.test(ff))c.style.fontFamily=ff;
      });
    })(d);
    return d.innerHTML;
  };
  var TAGS=/<\/?(b|strong|i|em|u|s|font|span|ul|ol|li|div|p|br)[ \/>]/i;
  N.display=function(text){if(!text)return'';return TAGS.test(text)?N.sanitize(text):esc(text).replace(/\n/g,'<br>')};
  N.plain=function(html){var d=document.createElement('div');d.innerHTML=N.display(html).replace(/<\/(li|div|p)>|<br\s*\/?>/gi,' $&');return(d.textContent||'').replace(/\s+/g,' ').trim()};

  /* ---------- notes (todo-profiles/{P}/data/stickyNotes) ---------- */
  N.parseNotes=function(raw){try{var a=typeof raw==='string'?JSON.parse(raw):raw;return Array.isArray(a)?a.filter(function(n){return n&&n.id}):[]}catch(e){return[]}};
  N.live=function(list){return list.filter(function(n){return !n.del})};
  N.trashed=function(list,now){now=now||Date.now();return list.filter(function(n){return n.del&&now-(n.u||0)<N.LIM.trashDays*864e5}).sort(function(a,b){return(b.u||0)-(a.u||0)})};
  N.purge=function(list,now){now=now||Date.now();return list.filter(function(n){return !n.del||now-(n.u||0)<N.LIM.trashDays*864e5})};
  N.created=function(n){var m=/^note-(\d+)/.exec(n.id);return m?+m[1]:0};
  N.sort=function(items,how,pinFirst,pinOf,createdOf,editedOf){
    var a=items.slice();
    a.sort(function(x,y){
      if(pinFirst){var p=(pinOf(y)?1:0)-(pinOf(x)?1:0);if(p)return p}
      if(how==='old')return createdOf(x)-createdOf(y);
      if(how==='edit')return editedOf(y)-editedOf(x);
      return createdOf(y)-createdOf(x);
    });
    return a;
  };
  N.newNote=function(text,color,from){var n={id:'note-'+Date.now()+Math.random().toString(36).slice(2,5),text:text||'',color:color||N.COLORS[Math.floor(Math.random()*N.COLORS.length)],u:Date.now()};if(from)n.from=from;return n};
  N.patchNote=function(list,id,patch){var n=list.find(function(x){return x.id===id});if(!n)return null;Object.keys(patch).forEach(function(k){if(patch[k]===null||patch[k]===false)delete n[k];else n[k]=patch[k]});n.u=Date.now();return n};
  N.softDelete=function(list,id){var n=list.find(function(x){return x.id===id});if(!n)return null;n.del=true;n.u=Date.now();return n};
  N.restore=function(list,id){var n=list.find(function(x){return x.id===id});if(!n)return null;delete n.del;n.u=Date.now();return n};
  N.docSize=function(list){try{return JSON.stringify(list).length}catch(e){return 0}};
  N.firstLine=function(html){var t=N.plain(html);return t.slice(0,80)};

  /* ---------- checklists (apps/checklist/data/state) — same model as the Checklists app ---------- */
  N.parseLists=function(raw){try{var o=typeof raw==='string'?JSON.parse(raw):raw;return Array.isArray(o&&o.lists)?o.lists:[]}catch(e){return[]}};
  N.mergeLists=function(remote,local){var by={};remote.forEach(function(l){by[l.id]=l});local.forEach(function(l){if(!by[l.id]||(l.u||0)>=(by[l.id].u||0))by[l.id]=l});return Object.keys(by).map(function(k){return by[k]})};
  N.mine=function(l,profile){return !l.deleted&&!l.gone&&(l.owner==='shared'||l.owner===profile)};
  N.active=function(lists,profile){return lists.filter(function(l){return N.mine(l,profile)&&!l.archived&&!l.template})};
  N.trashedLists=function(lists,profile,now){now=now||Date.now();return lists.filter(function(l){return l.deleted&&!l.gone&&!l.template&&(l.owner==='shared'||l.owner===profile)&&now-(l.u||0)<N.LIM.trashDays*864e5}).sort(function(a,b){return(b.u||0)-(a.u||0)})};
  N.kids=function(l,id){return l.items.filter(function(i){return i.parent===id})};
  N.tops=function(l){return l.items.filter(function(i){return !i.parent||!l.items.some(function(x){return x.id===i.parent})})};
  N.units=function(l){var u=[];N.tops(l).forEach(function(t){var k=N.kids(l,t.id);if(k.length)k.forEach(function(x){u.push(x)});else u.push(t)});return u};
  N.prog=function(l){var u=N.units(l),d=u.filter(function(x){return x.done}).length;return{d:d,n:u.length,pct:u.length?Math.round(d/u.length*100):0}};
  N.resync=function(l){N.tops(l).forEach(function(t){var k=N.kids(l,t.id);if(k.length)t.done=k.every(function(x){return x.done})})};
  N.regroup=function(l){var ord=[];N.tops(l).forEach(function(t){ord.push(t);l.items.filter(function(c){return c.parent===t.id}).forEach(function(c){ord.push(c)})});l.items=ord};
  N.hist=function(l,by,k,t){l.hist=l.hist||[];l.hist.push({at:Date.now(),by:by,k:k,t:String(t||'').slice(0,80)});if(l.hist.length>150)l.hist=l.hist.slice(-150)};
  N.touch=function(l){N.resync(l);l.u=Date.now()};
  N.dueInfo=function(l,today){
    if(!l.due)return null;
    var n=Math.round((new Date(l.due+'T12:00:00')-new Date(today+'T12:00:00'))/864e5);
    if(n<0)return{t:'Overdue '+(-n)+'d',c:'over',n:n};if(n===0)return{t:'Due today',c:'warn',n:n};if(n===1)return{t:'Due tomorrow',c:'warn',n:n};
    if(n<=3)return{t:'Due in '+n+' days',c:'warn',n:n};
    return{t:'Due '+new Date(l.due+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'}),c:'',n:n};
  };
  var LINE_RE=/^\s*(?:[-*•▪◦☐☑✔✓]|\d+[.)]|\[[ xX]?\])\s*/;
  N.parseLines=function(txt){
    var out=[],lastTop=null;
    String(txt).split(/\r?\n/).forEach(function(raw){
      if(!raw.trim())return;var indent=/^(\s{2,}|\t)/.test(raw);
      var t=raw.replace(LINE_RE,'').trim().slice(0,N.LIM.item);if(!t)return;
      var it={id:'i-'+uid8()+out.length,t:t,done:false,parent:null};
      if(indent&&lastTop)it.parent=lastTop.id;else lastTop=it;out.push(it);
    });
    return out;
  };
  N.newList=function(title,owner,items,hide){
    return{id:'cl-'+uid8(),title:String(title||'New checklist').trim().slice(0,N.LIM.title)||'New checklist',owner:owner,items:items||[],due:null,archived:false,template:false,hide:hide||'sink',createdAt:Date.now(),u:Date.now(),hist:[]};
  };
  N.canAdd=function(l,n){return l.items.length+n<=N.LIM.items};
  N.addItems=function(l,txt,parent){
    var add=N.parseLines(txt).slice(0,Math.max(0,N.LIM.items-l.items.length));
    add.forEach(function(a){if(parent&&!a.parent)a.parent=parent;l.items.push(a)});N.regroup(l);return add;
  };
  N.insertAfter=function(l,iid,text){
    if(l.items.length>=N.LIM.items)return null;
    var i=l.items.findIndex(function(x){return x.id===iid});if(i<0)return null;
    var it=l.items[i],isSub=!!(it.parent&&l.items.some(function(x){return x.id===it.parent}));
    var n={id:'i-'+uid8()+l.items.length,t:String(text||'').slice(0,N.LIM.item),done:false,parent:isSub?it.parent:null};
    var at=i+1;if(!isSub){while(l.items[at]&&l.items[at].parent===it.id)at++}
    l.items.splice(at,0,n);return n;
  };
  N.toggle=function(l,iid,by){
    var before=N.prog(l).pct,it=l.items.find(function(x){return x.id===iid});if(!it)return null;
    var v=!it.done;it.done=v;it.at=v?Date.now():null;
    N.kids(l,it.id).forEach(function(c){c.done=v;c.at=v?Date.now():null});
    N.hist(l,by,v?'tick':'untick',it.t);N.resync(l);
    return{done:v,finished:v&&N.prog(l).pct===100&&before<100};
  };
  N.editText=function(l,iid,v,by){var it=l.items.find(function(x){return x.id===iid});v=String(v||'').trim().slice(0,N.LIM.item);if(!it||!v||v===it.t)return false;it.t=v;N.hist(l,by,'edit',v);return true};
  N.delItem=function(l,iid,by){var it=l.items.find(function(x){return x.id===iid});if(!it)return false;l.items=l.items.filter(function(y){return y.id!==iid&&y.parent!==iid});N.hist(l,by,'del',it.t);return true};
  N.indent=function(l,iid){var i=l.items.findIndex(function(x){return x.id===iid}),it=l.items[i];if(!it||it.parent)return false;var prev=l.items.slice(0,i).reverse().find(function(x){return !x.parent});if(!prev)return false;N.kids(l,it.id).forEach(function(c){c.parent=prev.id});it.parent=prev.id;N.regroup(l);return true};
  N.outdent=function(l,iid){
    var it=l.items.find(function(x){return x.id===iid});if(!it||!it.parent)return false;var p=it.parent;it.parent=null;N.regroup(l);
    var i=l.items.findIndex(function(x){return x.id===iid});l.items.splice(i,1);var pi=l.items.findIndex(function(x){return x.id===p}),end=pi;
    while(l.items[end+1]&&l.items[end+1].parent===p)end++;l.items.splice(end+1,0,it);return true;
  };
  N.dropOn=function(l,fromId,toId){
    if(fromId===toId)return false;var a=l.items.find(function(x){return x.id===fromId}),b=l.items.find(function(x){return x.id===toId});if(!a||!b)return false;
    if(!a.parent&&!b.parent){var tp=N.tops(l),blocks=tp.map(function(t){return[t].concat(N.kids(l,t.id))}),i=tp.findIndex(function(x){return x.id===fromId}),j=tp.findIndex(function(x){return x.id===toId});var m=blocks.splice(i,1)[0];blocks.splice(j,0,m);l.items=[].concat.apply([],blocks);return true}
    if(a.parent&&a.parent===b.parent){var k=l.items.indexOf(a);l.items.splice(k,1);l.items.splice(l.items.indexOf(b)+(k<l.items.indexOf(b)+1?1:0),0,a);return true}
    return false;
  };
  N.move=function(l,iid,dir){
    var it=l.items.find(function(x){return x.id===iid});if(!it)return false;
    if(it.parent){var sib=N.kids(l,it.parent),j=sib.findIndex(function(x){return x.id===iid}),o=sib[j+dir];if(!o)return false;var a=l.items.indexOf(it),b=l.items.indexOf(o);l.items[a]=o;l.items[b]=it;return true}
    var tp=N.tops(l),k=tp.findIndex(function(x){return x.id===iid}),o2=tp[k+dir];if(!o2)return false;
    var blocks=tp.map(function(t){return[t].concat(N.kids(l,t.id))});var tmp=blocks[k];blocks[k]=blocks[k+dir];blocks[k+dir]=tmp;l.items=[].concat.apply([],blocks);return true;
  };
  N.clearTicked=function(l,by){var n=l.items.filter(function(i){return i.done}).length;if(!n)return 0;var gone={};l.items.forEach(function(i){if(i.done)gone[i.id]=1});l.items=l.items.filter(function(i){return !gone[i.id]});l.items.forEach(function(i){if(i.parent&&gone[i.parent])i.parent=null});N.hist(l,by,'del',n+' ticked items cleared');N.regroup(l);return n};
  N.reset=function(l,by){l.items.forEach(function(i){i.done=false;i.at=null});N.hist(l,by,'reset','Unticked everything')};
  N.setDue=function(l,v,by){l.due=v||null;N.hist(l,by,'due',v||'removed')};
  N.setOwner=function(l,shared,profile,by){l.owner=shared?'shared':profile;N.hist(l,by,'share',shared?'Shared with both':'Made private');if(!shared)l.items.forEach(function(i){delete i.a})};
  N.assign=function(l,iid,who){var it=l.items.find(function(x){return x.id===iid});if(!it)return false;if(who)it.a=who;else delete it.a;return true};
  N.nextAssignee=function(cur){return cur==='Bhargav'?'Anusha':cur==='Anusha'?null:'Bhargav'};
  N.rows=function(l){
    var mode=l.hide||'keep',rows=[];
    var order=function(a){return mode==='sink'?a.map(function(x,i){return[x,i]}).sort(function(p,q){return((p[0].done?1:0)-(q[0].done?1:0))||(p[1]-q[1])}).map(function(p){return p[0]}):a};
    order(N.tops(l)).forEach(function(t){
      if(mode==='hide'&&t.done)return;rows.push({it:t,sub:false});
      order(N.kids(l,t.id)).forEach(function(c){if(mode==='hide'&&c.done)return;rows.push({it:c,sub:true})});
    });
    return rows;
  };
  N.hiddenCount=function(l){return(l.hide==='hide')?N.units(l).filter(function(x){return x.done}).length:0};
  /* what is still open for a person: items assigned to them, or to nobody */
  N.openFor=function(l,profile){return N.units(l).filter(function(x){return !x.done&&(!x.a||x.a===profile)})};

  /* ---------- note <-> checklist ---------- */
  N.noteToList=function(html,owner,profile){
    var d=document.createElement('div');d.innerHTML=N.display(html);
    var lines=[];
    (function walk(n,depth){
      n.childNodes.forEach(function(x){
        if(x.nodeType===3){x.textContent.split(/\n/).forEach(function(part){var s=part.replace(/\s+/g,' ').trim();if(s)lines.push({t:s,depth:depth,li:false})});return}
        if(x.nodeType!==1)return;
        if(x.tagName==='UL'||x.tagName==='OL'){walk(x,depth+1);return}
        if(x.tagName==='LI'){
          var c=x.cloneNode(true);Array.prototype.slice.call(c.querySelectorAll('ul,ol')).forEach(function(e){e.parentNode.removeChild(e)});
          var s2=c.textContent.replace(/\s+/g,' ').trim();if(s2)lines.push({t:s2,depth:depth,li:true});
          Array.prototype.slice.call(x.children).filter(function(e){return e.tagName==='UL'||e.tagName==='OL'}).forEach(function(e){walk(e,depth+1)});return;
        }
        if(x.tagName==='BR')return;
        var hasBlock=x.querySelector&&x.querySelector('ul,ol,li,div,p');
        if(hasBlock){walk(x,depth)}else{var s3=x.textContent.replace(/\s+/g,' ').trim();if(s3)lines.push({t:s3,depth:depth,li:false})}
      });
    })(d,0);
    var title='Checklist';
    if(lines.length&&!lines[0].li&&lines.length>1){title=lines.shift().t}
    var items=[],lastTop=null;
    lines.slice(0,N.LIM.items).forEach(function(ln,i){
      var it={id:'i-'+uid8()+i,t:ln.t.slice(0,N.LIM.item),done:false,parent:null};
      if(ln.li&&ln.depth>=2&&lastTop)it.parent=lastTop.id;else lastTop=it;items.push(it);
    });
    var l=N.newList(title,owner,items,'sink');N.hist(l,profile,'new','From a note');return l;
  };
  N.listToNoteHtml=function(l){
    var h='<b>'+esc(l.title)+'</b><ul>';
    N.tops(l).forEach(function(t){
      var k=N.kids(l,t.id),txt=t.done?'<s>'+esc(t.t)+'</s>':esc(t.t);
      h+='<li>'+txt;if(k.length)h+='<ul>'+k.map(function(c){return'<li>'+(c.done?'<s>'+esc(c.t)+'</s>':esc(c.t))+'</li>'}).join('')+'</ul>';h+='</li>';
    });
    return h+'</ul>';
  };
  N.ago=function(t){var s=(Date.now()-t)/1000;if(s<60)return'just now';if(s<3600)return Math.floor(s/60)+' min ago';if(s<86400)return Math.floor(s/3600)+'h ago';var d=Math.floor(s/86400);return d===1?'yesterday':d<7?d+'d ago':new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric'})};
  window.NotesCore=N;
})();

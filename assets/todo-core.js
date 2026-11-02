/* TodoCore — everything the Hub To-Do widget needs to understand and change tasks.
   Pure functions: no Firebase, no page. Reads and writes the same task fields as apps/todo.html.
   KEEP IN SYNC with apps/todo.html:  nextRepeatDate() · toggleTask() · parseQuickAdd() (this parser understands the same
   #list @tag !1-!3 today/tomorrow/friday/11/20 3pm "start friday", plus the extra words listed in parse()).
   Task fields used:  id title done completedOn priority(0-3) startDate due dueTime repeat freqDays notes tags subtasks listId
                      dependsOn  spawnedId  createdBy order createdAt
   Added by the widget (all optional, old tasks without them work as before):
      a        who should do it ('Bhargav' | 'Anusha') — only meaningful on tasks in the shared document
      by       who handed it over
      est      minutes it takes
      mp       {x,y} position of the block on the order map
      doneBy   who ticked it     completedAt  ISO time it was ticked
*/
(function(g){
  'use strict';
  var DAYN=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var MON3=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var MONTHS={january:0,jan:0,february:1,feb:1,march:2,mar:2,april:3,apr:3,may:4,june:5,jun:5,july:6,jul:6,august:7,aug:7,september:8,sep:8,sept:8,october:9,oct:9,november:10,nov:10,december:11,dec:11};
  var WD={sunday:0,sun:0,monday:1,mon:1,tuesday:2,tues:2,tue:2,wednesday:3,weds:3,wed:3,thursday:4,thurs:4,thur:4,thu:4,friday:5,fri:5,saturday:6,sat:6};
  var NUMW={a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,couple:2,few:3};
  var NAMES={Anusha:['anusha','anu','anushaa'],Bhargav:['bhargav','bhargu','bharg','bhar']};
  var pad=function(n){return String(n).padStart(2,'0')};
  var ymd=function(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
  var parseYmd=function(s){return new Date(s+'T00:00:00')};
  var addDays=function(s,n){var d=parseYmd(s);d.setDate(d.getDate()+n);return ymd(d)};
  var addMonths=function(s,n){var d=parseYmd(s),day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+n);var last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));return ymd(d)};
  var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
  function f12(h,m){return ((h+11)%12+1)+':'+pad(m)+' '+(h<12?'AM':'PM')}
  function time12(t){if(!t)return'';var p=String(t).split(':');return f12(+p[0],+p[1]||0)}
  function dayLabel(date,today){
    if(!date)return'';var diff=Math.round((parseYmd(date)-parseYmd(today))/86400000);
    if(diff===0)return'Today';if(diff===1)return'Tomorrow';if(diff===-1)return'Yesterday';
    var d=parseYmd(date);if(diff>1&&diff<7)return DAYN[d.getDay()];
    return DAYN[d.getDay()].slice(0,3)+', '+MON3[d.getMonth()]+' '+d.getDate();
  }
  function nextRepeat(due,repeat,freq){
    if(repeat==='daily')return addDays(due,1);
    if(repeat==='everyNDays')return addDays(due,Math.max(1,Number(freq)||1));
    if(repeat==='weekly')return addDays(due,7);
    if(repeat==='weekdays'){var d=addDays(due,1);while([0,6].indexOf(parseYmd(d).getDay())!==-1)d=addDays(d,1);return d}
    if(repeat==='monthly')return addMonths(due,1);
    return null;
  }

  /* =====================================================================
     TEXT -> TASK.   "Pay rent for anusha at 4.00pm tomorrow! dont forget! it is urgent"
     ctx: {now:Date, me:'Bhargav', lists:[{id,name}], tasks:[{id,title,done}], ignore:Set}
     Understands (any order, any mix; unknown words just stay in the title):
       when      today tonight tomorrow(+typos) "day after tomorrow" weekdays (mon..sunday, next/this/on) weekend, next week, next month,
                 end of week/month (eow/eom), "in 3 days/2 weeks/a month", "in 2 hours/30 min", 15th, "on the 15th", nov 15, 15 nov, 11/15, 11-15-2026
       time      at/by/before/after/till/until/around/@ + 4pm, 4.00pm, 4:30 pm, 16:00, "at 4"; noon, midnight, morning/afternoon/evening/night,
                 eod/cob/"end of day"; ranges "from 3 to 5pm", "3-5pm", "between 3 and 5pm" (also sets how long it takes)
                 by/before/till/until/due/eod = a deadline; after = not before
       who       for/to/by/with-job words + a name:  "for anusha" "assign to anusha" "give/hand/send/pass/delegate it to anusha" "ask anusha to .."
                 "tell/remind anusha to .." "anusha should/will/needs to .." "done by anusha" "to be done by anusha" "by anusha" "@anusha"
                 "for me/myself"; shared: "shared" "together" "both of us" "for us" "for both"
       priority  !1 !2 !3 · urgent/asap/critical/emergency/immediately/"right away"/"high priority" = 3 · important/"don't forget"/must/"very important" = 2
                 low priority/whenever/"no rush"/someday = 0 (and no date)
       how long  ~30m · "for 2 hours" · "takes 20 min" · "30 minutes"(after for/takes/about)
       repeat    every day/week/month/weekday/N days/N weeks/monday · daily weekly monthly weekdays biweekly fortnightly "every other day/week"
       start     "start friday" "starting tomorrow" "begin 11/20" · "from monday"
       order     "after <task name>" "once <task name> is done" "following ..." -> waits for it · "before <task name>" -> it waits for this
       list/tag  #list (a list you have) · "in the home list" · @tag
     ===================================================================== */
  function parse(text,ctx){
    ctx=ctx||{};var now=ctx.now||new Date(),ignore=ctx.ignore||new Set(),lists=ctx.lists||[],tasks=(ctx.tasks||[]).filter(function(t){return t&&!t.done&&t.title});
    var todayD=new Date(now.getFullYear(),now.getMonth(),now.getDate()),today=ymd(todayD);
    var s=' '+String(text||'').replace(/\s+/g,' ')+' ';
    var o={title:'',due:null,time:null,deadline:false,after:false,start:null,pri:0,who:null,shared:false,listId:null,tags:[],est:0,repeat:'none',freqDays:0,deps:[],blocks:[],low:false,chips:[]};
    var priSrc=[];
    // exclamation marks are emphasis, not codes (only !1 !2 !3 are codes)
    s=s.replace(/!+(?!\d)/g,' ').replace(/\s+/g,' ');
    function chip(k,label,key,cls){o.chips.push({k:k,label:label,key:String(key||'').trim().toLowerCase(),cls:cls||''})}
    function eat(re,fn){var m=re.exec(s);if(!m)return false;var key=m[0].trim().toLowerCase();if(ignore.has(key))return false;s=s.slice(0,m.index)+' '+s.slice(m.index+m[0].length);fn(m);return true}
    function eatAt(m,len,key,fn){var k=String(key).trim().toLowerCase();if(ignore.has(k))return false;s=s.slice(0,m)+' '+s.slice(m+len);fn();return true}
    function nameOf(w){w=String(w).toLowerCase();for(var n in NAMES)if(NAMES[n].indexOf(w)!==-1)return n;return null}
    var NM='(anusha|anushaa|anu|bhargav|bhargu|bharg|bhar)';

    // ---- explicit codes first
    eat(/\s#(\w[\w-]*)/,function(m){var l=lists.filter(function(x){return String(x.name).toLowerCase()===m[1].toLowerCase()||x.id===m[1].toLowerCase()})[0];
      if(m[1].toLowerCase()==='shared'){o.shared=true;chip('shared','👥 Shared',m[0],'sh')}
      else if(l){o.listId=l.id;chip('list','▤ '+l.name,m[0],'list')}else{o.tags.push(m[1].toLowerCase());chip('tag','#'+m[1],m[0],'tag')}});
    var guard=0;while(guard++<5&&eat(new RegExp('\\s@'+NM+'\\b','i'),function(m){o.who=nameOf(m[1]);chip('who','👤 '+o.who,m[0],'who')}));
    guard=0;while(guard++<8&&eat(/\s@(\w[\w-]*)/,function(m){o.tags.push(m[1].toLowerCase());chip('tag','@'+m[1],m[0],'tag')}));
    eat(/\s!([1-3])\b/,function(m){o.pri=Math.max(o.pri,+m[1]);priSrc.push(m[0].trim())});
    eat(/\s~\s*(\d+(?:\.\d+)?)\s*(m|min|mins|h|hr|hrs)\b/i,function(m){o.est=Math.round(+m[1]*(/^h/i.test(m[2])?60:1));chip('est','⏱ '+fmtEst(o.est),m[0],'est')});

    // ---- people
    // "ask/tell/remind/get/have NAME to ..."
    eat(new RegExp('\\s(?:ask|tell|remind|get|have|let|request|nudge)\\s+'+NM+'\\s+(?:to\\s+|about\\s+)?','i'),function(m){o.who=nameOf(m[1]);chip('who','👤 '+o.who,m[0],'who')});
    // "assign(ed) to / give / hand / send / pass / delegate / forward (it/this) (over) to NAME"
    eat(new RegExp('\\s(?:assign(?:ed)?|give|hand|send|pass|delegate|forward|route|move|reassign)(?:\\s+(?:it|this|that))?(?:\\s+(?:over|across))?\\s+(?:to|onto)\\s+'+NM+'\\b','i'),function(m){o.who=nameOf(m[1]);chip('who','👤 '+o.who,m[0],'who')});
    // "done by / to be done by / handled by / taken care of by / owner NAME" , "for NAME", "by NAME", "NAME to ..." at start
    eat(new RegExp('\\s(?:(?:to\\s+be\\s+|should\\s+be\\s+|needs?\\s+to\\s+be\\s+|must\\s+be\\s+)?(?:done|handled|taken\\s+care\\s+of|managed|covered|finished|completed|sorted|picked\\s+up|booked)\\s+by|owner|owned\\s+by|assignee|responsible|for|by|via)\\s*[:\\-]?\\s*'+NM+'\\b','i'),function(m){o.who=nameOf(m[1]);chip('who','👤 '+o.who,m[0],'who')});
    eat(new RegExp('^\\s*'+NM+'\\s+(?:should|will|shall|must|needs?\\s+to|has\\s+to|can|could|to|please)\\s+','i'),function(m){o.who=nameOf(m[1]);chip('who','👤 '+o.who,m[0],'who')});
    eat(/\s(?:for|by|assign(?:ed)?\s+to|to)\s+(?:me|myself|i)\b(?!\s*(?:am|will))/i,function(m){o.who='me';chip('who','👤 Me',m[0],'who')});
    eat(/\s(?:shared|together|both\s+of\s+us|for\s+us(?:\s+both|\s+two)?|for\s+both(?:\s+of\s+us)?|us\s+two|for\s+everyone|everyone)\b/i,function(m){o.shared=true;chip('shared','👥 Shared',m[0],'sh')});
    // "in the home list" / "to the home list"
    lists.forEach(function(l){if(o.listId)return;var nm=String(l.name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');eat(new RegExp('\\s(?:in|to|on|under|into)\\s+(?:the\\s+|my\\s+|our\\s+)?'+nm+'\\s+list\\b','i'),function(m){o.listId=l.id;chip('list','▤ '+l.name,m[0],'list')})});

    // ---- priority words
    eat(/\s(?:it'?s|it\s+is|this\s+is|that'?s|is)\s+(?=(?:very\s+|really\s+|super\s+|extremely\s+|quite\s+)?(?:urg\w*|important|critical|asap))/i,function(){});
    var HI3=/\s(?:(?:very|really|super|extremely|highly)\s+)?(?:urg\w*|asap|a\.s\.a\.p|critical|emergency|immediately|right\s+away|right\s+now|top\s+priority|highest\s+priority|high\s+priority|first\s+priority|priority\s+1|p1\b|!!!)\b/i;
    eat(HI3,function(m){o.pri=3;priSrc.push(m[0].trim())});
    eat(/\s(?:don'?t|dont|do\s+not|never)\s+forget\b/i,function(m){o.pri=Math.max(o.pri,2);priSrc.push(m[0].trim())});
    eat(/\s(?:(?:very|really|super|extremely)\s+)?important\b|\s(?:medium|mid)\s+priority\b|\s(?:must|mandatory|compulsory)\b/i,function(m){o.pri=Math.max(o.pri,2);priSrc.push(m[0].trim())});
    eat(/\s(?:low\s+priority|whenever|no\s+rush|not\s+urgent|someday|some\s+day|when\s+i\s+can|if\s+time|eventually)\b/i,function(m){o.low=true;chip('pri','Low priority · no date',m[0],'p0')});
    if(o.pri)chip('pri','P'+o.pri+(o.pri===3?' Urgent':o.pri===2?' Important':''),priSrc[0],'p'+o.pri);

    // ---- how long
    eat(/\s(?:for|takes?|about|around|~|roughly|approx\w*)\s+(?:an?\s+|one\s+)?(\d+(?:\.\d+)?)?\s*(hours?|hrs?|h|minutes?|mins?|min)\b(?!\s*(?:from\s+now|later))/i,function(m){var n=m[1]?+m[1]:1;o.est=Math.round(n*(/^h/i.test(m[2])?60:1));chip('est','⏱ '+fmtEst(o.est),m[0],'est')});

    // ---- repeat
    eat(/\severy\s+other\s+(day|week|month)\b/i,function(m){o.repeat='everyNDays';o.freqDays=m[1]==='day'?2:m[1]==='week'?14:60;chip('rep','↻ every other '+m[1],m[0],'rep')})||
    eat(/\severy\s+(\d+)\s*(days?|weeks?|months?)\b/i,function(m){var n=+m[1],u=m[2][0];if(u==='d'){o.repeat=n===1?'daily':'everyNDays';o.freqDays=n}else if(u==='w'){o.repeat=n===1?'weekly':'everyNDays';o.freqDays=7*n}else{o.repeat=n===1?'monthly':'everyNDays';o.freqDays=30*n}chip('rep','↻ every '+(n>1?n+' ':'')+m[2],m[0],'rep')})||
    eat(/\severy\s*(?:other\s+)?(?:week\s*day|weekday)s?\b|\sweekdays\b|\smon(?:day)?\s*(?:-|to|through)\s*fri(?:day)?\b/i,function(m){o.repeat='weekdays';chip('rep','↻ weekdays',m[0],'rep')})||
    eat(/\s(?:every\s+day|daily|each\s+day|everyday)\b/i,function(m){o.repeat='daily';chip('rep','↻ daily',m[0],'rep')})||
    eat(/\s(?:every\s+week|weekly|each\s+week)\b/i,function(m){o.repeat='weekly';chip('rep','↻ weekly',m[0],'rep')})||
    eat(/\s(?:every\s+month|monthly|each\s+month)\b/i,function(m){o.repeat='monthly';chip('rep','↻ monthly',m[0],'rep')})||
    eat(/\s(?:biweekly|bi-weekly|fortnightly|every\s+fortnight)\b/i,function(m){o.repeat='everyNDays';o.freqDays=14;chip('rep','↻ every 2 weeks',m[0],'rep')})||
    eat(new RegExp('\\severy\\s+('+Object.keys(WD).join('|')+')s?\\b','i'),function(m){o.repeat='weekly';o.repWd=WD[m[1].toLowerCase()];chip('rep','↻ every '+DAYN[o.repWd],m[0],'rep')});

    // ---- time ranges and single times
    var deadline=false,after=false,timeSet=null,dateFromTime=null;
    function setTime(h,mi,pre){if(timeSet){if(timeSet[0]===h%24&&timeSet[1]===mi&&/by|before|till|until|til|due|latest/i.test(pre||''))deadline=true;return}timeSet=[h%24,mi];if(/by|before|till|until|til|due|latest|eod|cob|end/i.test(pre||''))deadline=true;if(/^after$/i.test(pre||''))after=true}
    function mer(h,ap){h=h%12;return /p/i.test(ap)?h+12:h}
    // 3pm-5pm / from 3 to 5pm / between 3 and 5pm
    eat(/\s(?:from\s+|between\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:to|-|–|—|and|until|till)\s+(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?![a-z])/i,function(m){
      var ap2=m[6],ap1=m[3]||ap2,h1=mer(+m[1],ap1),h2=mer(+m[4],ap2);if(!m[3]&&h1>h2)h1=mer(+m[1],/p/i.test(ap2)?'am':'pm');
      var a=h1*60+(+m[2]||0),b=h2*60+(+m[5]||0);if(b<=a)b+=12*60;timeSet=[h1,+m[2]||0];if(!o.est)o.est=b-a;chip('time','🕒 '+f12(h1,+m[2]||0)+' – '+f12(Math.floor(b/60)%24,b%60),m[0],'time');timeSet.done=true});
    var PRE='(?:(at|by|before|after|till|until|til|around|about|@|from|for|due(?:\\s+(?:at|by))?|no\\s+later\\s+than|not\\s+later\\s+than|latest(?:\\s+by)?|on)\\s*)?';
    guard=0;while(guard++<4&&(
      eat(new RegExp('\\s'+PRE+'(\\d{1,2})(?:[:.](\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?)(?![a-z])','i'),function(m){setTime(mer(+m[2],m[4]),+m[3]||0,m[1])})||
      eat(new RegExp('\\s(at|by|before|after|till|until|til|around|about|@|from|due(?:\\s+(?:at|by))?|no\\s+later\\s+than)\\s*([01]?\\d|2[0-3])[:.]([0-5]\\d)(?!\\s*(?:am|pm|a\\.m|p\\.m))\\b','i'),function(m){setTime(+m[2],+m[3],m[1])})||
      eat(/\s([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*(?:am|pm))/i,function(m){setTime(+m[1],+m[2],'')})||
      eat(/\s(at|by|before|around|till|until|til|@|after)\s*(\d{1,2})(?![\d:.\/\-]|\s*(?:days?|weeks?|months?|hours?|hrs?|mins?|minutes?|st|nd|rd|th|%|\/|-))\b/i,function(m){var h=+m[2];if(h>24||h<1)return;var hh=h===12?12:h<=6?h+12:h;setTime(hh,0,m[1])})||
      eat(/\s(?:(by|before|till|until|til|at|around|after)\s+)?(?:12\s*)?(noon|midday)\b/i,function(m){setTime(12,0,m[1])})||
      eat(/\s(?:(by|before|till|until|til|at|around)\s+)?midnight\b/i,function(m){setTime(23,59,m[1]||'by')})||
      eat(/\s(?:tonight|tonite)\b/i,function(m){setTime(20,0,'');dateFromTime=today})||
      eat(/\s(?:this\s+|in\s+the\s+)?(morning)\b/i,function(m){setTime(9,0,'')})||
      eat(/\s(?:this\s+|in\s+the\s+)?(afternoon)\b/i,function(m){setTime(14,0,'')})||
      eat(/\s(?:this\s+|in\s+the\s+)?(evening)\b/i,function(m){setTime(18,0,'')})||
      eat(/\s(?:(?:by|before|till|until|til)\s+)?(?:eod|cob|end\s+of\s+(?:the\s+)?(?:work\s*)?day|close\s+of\s+business)\b/i,function(m){setTime(17,0,'by')})
    ));
    // "in 2 hours / in 30 minutes"
    eat(/\sin\s+(an?|one|two|three|four|five|six|\d+)\s*(hours?|hrs?|minutes?|mins?)\b/i,function(m){var n=NUMW[m[1].toLowerCase()]||+m[1],mins=n*(/^h/i.test(m[2])?60:1),t=new Date(now.getTime()+mins*60000);timeSet=[t.getHours(),t.getMinutes()];dateFromTime=ymd(t);chip('time','🕒 in '+n+' '+m[2],m[0],'time');timeSet.done=true});

    // ---- dates
    var due=null,start=null;
    function nextWd(wd,force){var diff=(wd-todayD.getDay()+7)%7;if(diff===0&&force)diff=7;return addDays(today,diff)}
    function lastDay(y,mo){return new Date(y,mo+1,0).getDate()}
    function monthDay(mo,d){var y=todayD.getFullYear();if(d<1||d>lastDay(y,mo))return null;var dt=new Date(y,mo,d);if(dt<todayD)dt=new Date(y+1,mo,d);return ymd(dt)}
    function dateScan(){
      var m,r;
      if((m=/\s(?:the\s+)?day\s+after\s+(?:tomorrow|tmrw)\b/i.exec(s)))return{m:m,v:addDays(today,2)};
      if((m=/\s(tom+or+ow|tomm?or+ow|tmr+w?|2mor+ow?|tomo)\b/i.exec(s)))return{m:m,v:addDays(today,1)};
      if((m=/\s(today|2day|tdy|2dy)\b/i.exec(s)))return{m:m,v:today};
      if((m=/\snext\s+week\b/i.exec(s)))return{m:m,v:nextWd(1,true)};
      if((m=/\snext\s+month\b/i.exec(s)))return{m:m,v:addMonths(today,1)};
      if((m=/\s(?:by\s+)?(?:the\s+)?(?:end\s+of\s+(?:the\s+)?week|eow)\b/i.exec(s)))return{m:m,v:nextWd(5,false)};
      if((m=/\s(?:by\s+)?(?:the\s+)?(?:end\s+of\s+(?:the\s+)?month|eom)\b/i.exec(s)))return{m:m,v:ymd(new Date(todayD.getFullYear(),todayD.getMonth(),lastDay(todayD.getFullYear(),todayD.getMonth())))};
      if((m=/\s(next\s+|this\s+|coming\s+)?weekend\b/i.exec(s))){var sat=nextWd(6,false);return{m:m,v:/next/i.test(m[1]||'')?addDays(sat,7):sat}}
      if((m=/\sthis\s+week\b/i.exec(s)))return{m:m,v:nextWd(5,false)};
      if((m=/\sin\s+(an?|one|two|three|four|five|six|seven|eight|nine|ten|a\s+couple\s+of|a\s+few|\d+)\s*(day|week|month)s?\b/i.exec(s))){var w1=m[1].toLowerCase().replace(/\s+of$/,'').replace(/^a\s+/,function(x){return/couple|few/.test(m[1])?'':x});var n=NUMW[w1.trim()]||NUMW[m[1].toLowerCase()]||(/couple/i.test(m[1])?2:/few/i.test(m[1])?3:+m[1])||1;var u=m[2].toLowerCase();return{m:m,v:u==='day'?addDays(today,n):u==='week'?addDays(today,7*n):addMonths(today,n)}}
      r=new RegExp('\\s(?:(next|this|coming|upcoming|on)\\s+)?('+Object.keys(WD).sort(function(a,b){return b.length-a.length}).join('|')+')(?=\\s|$|[,.;])','i');
      if((m=r.exec(s))){var force=/next/i.test(m[1]||'');var dv=nextWd(WD[m[2].toLowerCase()],true);if(!force&&WD[m[2].toLowerCase()]===todayD.getDay())dv=today;if(force&&(WD[m[2].toLowerCase()]-todayD.getDay()+7)%7!==0){dv=nextWd(WD[m[2].toLowerCase()],false);if(WD[m[2].toLowerCase()]>todayD.getDay()&&todayD.getDay()!==0)dv=addDays(dv,7)}return{m:m,v:dv}}
      var MN=Object.keys(MONTHS).sort(function(a,b){return b.length-a.length}).join('|');
      if((m=new RegExp('\\s(?:on\\s+)?(?:the\\s+)?('+MN+')\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?!\\s*(?:am|pm|:))','i').exec(s))){var v=monthDay(MONTHS[m[1].toLowerCase()],+m[2]);if(v)return{m:m,v:v}}
      if((m=new RegExp('\\s(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?('+MN+')\\b','i').exec(s))){var v2=monthDay(MONTHS[m[2].toLowerCase()],+m[1]);if(v2)return{m:m,v:v2}}
      if((m=/\s(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?(?![\d:]|\s*(?:am|pm))/i.exec(s))){var mo=+m[1]-1,dd=+m[2];if(mo>=0&&mo<12){var yy=m[3]?(+m[3]<100?2000+(+m[3]):+m[3]):null;if(yy){var dt=new Date(yy,mo,dd);if(dt.getMonth()===mo)return{m:m,v:ymd(dt)}}else{var v3=monthDay(mo,dd);if(v3)return{m:m,v:v3}}}}
      if((m=/\s(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/i.exec(s))){var d3=+m[1];if(d3>=1&&d3<=31){var y=todayD.getFullYear(),mo2=todayD.getMonth();var cand=new Date(y,mo2,d3);if(cand.getMonth()!==mo2||cand<todayD){cand=new Date(y,mo2+1,d3)}if(cand.getDate()===d3)return{m:m,v:ymd(cand)}}}
      return null;
    }
    function takeDate(forStart){
      var hit=dateScan();if(!hit)return false;
      var idx=hit.m.index,len=hit.m[0].length,key=hit.m[0].trim().toLowerCase();if(ignore.has(key))return false;
      // swallow a preceding preposition (on / by / before / until / due / for)
      var before=s.slice(0,idx),pm=/\s(on|by|before|until|till|til|due(?:\s+(?:on|by))?|for|this|coming|next|from|starting|start|begin(?:ning)?|no\s+later\s+than)$/i.exec(before);
      var pre=pm?pm[1].toLowerCase():'';
      if(pm&&(pre==='next'||pre==='this'||pre==='coming')&&/(next|this|coming)\s/i.test(hit.m[0]))pm=null; // already inside the match
      var isStart=forStart||/^(start|starting|begin|beginning|from)$/.test(pre);
      if(pm&&pre!=='next'&&pre!=='this'&&pre!=='coming'){idx=pm.index;len=hit.m.index+hit.m[0].length-idx}
      s=s.slice(0,idx)+' '+s.slice(idx+len);
      if(isStart){start=hit.v;chip('start','▶ starts '+dayLabel(hit.v,today),key,'date')}else{due=hit.v;chip('date','📅 '+dayLabel(hit.v,today),key,hit.v===today?'date':'date later')}
      return true;
    }
    takeDate(false);
    if(!start){var s2=/\s(?:start|starting|begin|beginning|from)\s/i.test(s);if(s2)takeDate(true)}
    if(!due&&o.repWd!=null){due=nextWd(o.repWd,false);chip('date','📅 '+dayLabel(due,today),'every '+DAYN[o.repWd].toLowerCase(),'date later')}
    if(!due&&dateFromTime)due=dateFromTime;
    if(timeSet){
      if(!timeSet.done){var lab=f12(timeSet[0],timeSet[1]);chip('time','🕒 '+(deadline?'by ':after?'after ':'')+lab,(o.chips.length?'at ':'at ')+lab.toLowerCase(),'time')}
      o.time=pad(timeSet[0])+':'+pad(timeSet[1]);o.deadline=deadline;o.after=after;
      if(!due){due=dateFromTime||today;chip('date','📅 '+dayLabel(due,today),'today','date')}
    }
    o.due=due;o.start=start;
    // low priority / someday: no date unless one was typed
    if(o.low&&!o.due){o.nodate=true}

    // ---- order: "after <task>" / "once <task> is done" / "before <task>"
    function titleTok(t){return String(t).toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean)}
    function findTask(rest){
      var rt=titleTok(rest),best=null,bestN=0;
      tasks.forEach(function(t){var tt=titleTok(t.title);if(!tt.length)return;var n=0;while(n<tt.length&&n<rt.length&&tt[n]===rt[n])n++;
        var need=tt.length<=2?tt.length:Math.max(2,Math.ceil(tt.length*.6));if(n>=need&&n>bestN){best=t;bestN=n}});
      return best?{t:best,n:bestN}:null;
    }
    function depScan(kw,store,sym){
      var re=new RegExp('\\s('+kw+')\\s+(?:the\\s+|my\\s+|that\\s+)?','ig'),m;
      while((m=re.exec(s))){
        var rest=s.slice(m.index+m[0].length),hit=findTask(rest);if(!hit)continue;
        var key=(m[1]+' '+hit.t.title).toLowerCase();if(ignore.has(key))continue;
        // consume the keyword and the words that matched, plus "is/are done/finished/complete(d)"
        var words=rest.replace(/^\s+/,'').split(/\s+/),take=words.slice(0,hit.n).join(' ');
        var tail=/^\s*(?:(?:is|are|has|have|gets?|was|been)\s+)?(?:done|finished|complete|completed|sorted|booked|paid|ready)\b/i.exec(rest.replace(take,'').replace(/^\s*/,' '));
        var endAt=m.index+m[0].length+rest.indexOf(take.split(' ')[0])+take.length;
        var rest2=s.slice(endAt);var t2=/^\s*(?:(?:is|are|has|have|gets?|was|been)\s+)?(?:done|finished|complete|completed|sorted|booked|paid|ready)\b/i.exec(rest2);if(t2)endAt+=t2[0].length;
        s=s.slice(0,m.index)+' '+s.slice(endAt);store.push(hit.t.id);chip(sym,(sym==='dep'?'⛓ after ':'⛓ before ')+hit.t.title,key,'dep');re.lastIndex=0;
      }
    }
    depScan('after|once|when|following|then\\s+after|as\\s+soon\\s+as',o.deps,'dep');
    depScan('before|ahead\\s+of|prior\\s+to',o.blocks,'blk');

    // ---- title: drop filler words
    s=s.replace(/\s(?:it'?s|it\s+is|this\s+is|that'?s)\s*(?=\s|$)/ig,' ');
    var w=s.replace(/[.,;:!?\-–—()]+(?=\s|$)|(?:^|\s)[.,;:\-–—]+/g,' ').split(/\s+/).filter(Boolean);
    var STOP={or:1,and:1,to:1,be:1,it:1,is:1,the:1,at:1,by:1,on:1,till:1,until:1,til:1,before:1,after:1,that:1,then:1,please:1,pls:1,plz:1,dont:1,"don't":1,forget:1,in:1,also:1,just:1,so:1,of:1,for:1,from:1,with:1,with:1,thanks:1,thank:1,you:1,i:1,my:1,a:1,an:1,as:1,due:1,done:1,should:1,will:1,remember:1,need:1,needs:1,have:1,has:1,got:1,gotta:1,want:1,must:1,this:1,these:1,time:0};
    var LEAD={please:1,pls:1,plz:1,remember:1,to:1,and:1,or:1,then:1,also:1,just:1,need:1,needs:1,have:1,got:1,gotta:1,want:1,i:1,we:1,must:1,should:1,todo:1,task:1,add:1,create:1,new:1,remind:1,me:1,the:0};
    // leading phrases like "remember to", "i need to", "remind me to", "don't forget to"
    var lead=/^(?:(?:please|pls|plz|kindly)\s+)?(?:(?:remember|remind\s+me|don'?t\s+forget|i\s+(?:need|have|want|must|should|gotta|got)|we\s+(?:need|have|must|should)|need|needs|have|got|gotta|want|must|should|todo|task|add|create|new\s+task|note\s+to\s+self)\s*(?:to|:)?\s+)+/i;
    var text2=w.join(' ').replace(lead,'').replace(/^(?:to|and|or|then|also|just)\s+/i,'');
    w=text2.split(/\s+/).filter(Boolean);
    while(w.length>1&&STOP[w[w.length-1].toLowerCase().replace(/[^a-z']/g,'')]===1)w.pop();
    while(w.length>1&&LEAD[w[0].toLowerCase().replace(/[^a-z']/g,'')]===1)w.shift();
    o.title=w.join(' ').replace(/^./,function(c){return c.toUpperCase()}).slice(0,200);
    if(!o.title&&text){o.title=String(text).trim().replace(/^./,function(c){return c.toUpperCase()}).slice(0,200)}
    if(o.who==='me'&&ctx.me)o.who=ctx.me;
    return o;
  }
  function fmtEst(m){if(!m)return'';if(m<60)return m+'m';var h=Math.floor(m/60),r=m%60;return h+'h'+(r?' '+r+'m':'')}

  /* =====================================================================
     TASK LOGIC
     ===================================================================== */
  function byId(all,id){for(var i=0;i<all.length;i++)if(all[i].id===id)return all[i];return null}
  function openDeps(t,all){return (t.dependsOn||[]).map(function(d){return byId(all,d)}).filter(function(d){return d&&!d.done})}
  function isBlocked(t,all){return openDeps(t,all).length>0}
  function unlocks(t,all){var n=0;all.forEach(function(x){if(!x.done&&(x.dependsOn||[]).indexOf(t.id)!==-1)n++});return n}
  function reaches(all,from,target,seen){seen=seen||{};if(from===target)return true;if(seen[from])return false;seen[from]=1;var t=byId(all,from);return !!t&&(t.dependsOn||[]).some(function(d){return reaches(all,d,target,seen)})}
  /* would "task waits on needs" make a loop? */
  function wouldLoop(all,task,needs){return task===needs||reaches(all,needs,task)}
  function level(all,id,memo,seen){memo=memo||{};seen=seen||{};if(memo[id]!=null)return memo[id];if(seen[id])return 0;seen[id]=1;var t=byId(all,id),l=0;if(t)(t.dependsOn||[]).forEach(function(d){if(byId(all,d))l=Math.max(l,level(all,d,memo,seen)+1)});memo[id]=l;return l}

  /* a combined list: [{t, sh}] where sh = lives in the shared document */
  function view(personal,shared){var out=[];(personal||[]).forEach(function(t){out.push({t:t,sh:false})});(shared||[]).forEach(function(t){out.push({t:t,sh:true})});return out}
  /* whose it is, from my side: 'mine' | 'theirs' (handed to the other person) | 'shared' */
  function owner(item,me){var t=item.t;if(!item.sh)return'mine';if(t.a&&t.a!==me)return'theirs';if(t.a&&t.a===me)return'mine';return'shared'}

  function showDue(t,today,S){
    if(t.done)return false;
    if(t.startDate&&t.startDate>today&&!S.future)return false;
    if(t.due){return t.due<=today||(S.range==='week'&&t.due<=addDays(today,7))}
    if(t.startDate===today)return true;
    if((t.priority||0)>0&&S.hp)return true;
    return !!S.nodate&&!t.startDate||(!!S.nodate&&t.startDate<=today);
  }
  /* "smart" order: late and urgent first, then what unlocks others, then sooner */
  function score(item,all,today){
    var t=item.t,s=0;
    if(t.due&&t.due<today)s+=60+Math.min(30,Math.round((parseYmd(today)-parseYmd(t.due))/86400000)*3);
    else if(t.due===today)s+=40;else if(t.due)s+=Math.max(0,20-Math.round((parseYmd(t.due)-parseYmd(today))/86400000)*3);
    s+=(t.priority||0)*14;s+=unlocks(t,all)*9;
    if(t.dueTime&&t.due===today)s+=Math.max(0,8-Math.floor((parseInt(t.dueTime,10)||12)/3));
    return s;
  }
  function sortItems(list,mode,all,today){
    var a=list.slice();
    if(mode==='time')a.sort(function(x,y){return (x.t.due||'9999').localeCompare(y.t.due||'9999')||(x.t.dueTime||'99:99').localeCompare(y.t.dueTime||'99:99')||(y.t.priority||0)-(x.t.priority||0)});
    else if(mode==='priority')a.sort(function(x,y){return (y.t.priority||0)-(x.t.priority||0)||(x.t.due||'9999').localeCompare(y.t.due||'9999')||(x.t.dueTime||'99:99').localeCompare(y.t.dueTime||'99:99')});
    else a.sort(function(x,y){return score(y,all,today)-score(x,all,today)||(x.t.dueTime||'99:99').localeCompare(y.t.dueTime||'99:99')});
    return a;
  }

  /* tick: same as the To-Do app (repeat spawns the next one; un-tick takes it back) */
  function complete(arr,id,who,today){
    var t=byId(arr,id);if(!t)return null;
    t.done=true;t.completedOn=today;t.doneBy=who;t.completedAt=new Date().toISOString();var spawned=null;
    if(t.repeat&&t.repeat!=='none'&&t.due){
      var nd=nextRepeat(t.due,t.repeat,t.freqDays);
      if(nd){var nid='task-'+Date.now()+'-'+Math.floor(Math.random()*1000);var c=Object.assign({},t,{id:nid,spawnedId:null,done:false,due:nd,completedOn:null,doneBy:null,completedAt:null,subtasks:(t.subtasks||[]).map(function(s){return Object.assign({},s,{done:false})}),order:Date.now(),createdAt:new Date().toISOString()});arr.push(c);t.spawnedId=nid;spawned=nid}
    }
    return {task:t,spawned:spawned};
  }
  function reopen(arr,id){
    var t=byId(arr,id);if(!t)return null;
    t.done=false;t.completedOn=null;t.doneBy=null;t.completedAt=null;
    if(t.spawnedId){var i=arr.findIndex(function(x){return x.id===t.spawnedId&&!x.done});if(i>=0)arr.splice(i,1);t.spawnedId=null}
    return t;
  }
  /* a new task from parse() output */
  function newTask(p,o){
    o=o||{};var today=o.today;
    var due=p.due||null;
    if(!due&&!p.nodate&&!p.start&&o.defaultToday)due=today;
    var t={id:'task-'+Date.now()+'-'+Math.floor(Math.random()*1000),title:p.title,done:false,priority:p.pri||0,
      startDate:p.start||today,due:due,dueTime:p.time||null,repeat:p.repeat||'none',notes:'',link:'',tags:p.tags||[],subtasks:[],
      listId:o.listId||'personal',createdBy:o.me,order:Date.now(),createdAt:new Date().toISOString()};
    if(p.repeat==='everyNDays')t.freqDays=p.freqDays||1;
    if(p.est)t.est=p.est;if(p.deps&&p.deps.length)t.dependsOn=p.deps.slice();
    if(o.assignee){t.a=o.assignee;t.by=o.me}
    return t;
  }
  /* the tasks you add most, with the day you usually pick — for the "Often" chips */
  function often(all,today,n){
    var by={};
    all.forEach(function(it){var t=it.t;if(!t.title)return;var k=t.title.trim().toLowerCase();if(k.length<3)return;(by[k]=by[k]||{title:t.title.trim(),n:0,wd:{},a:{},sh:0,nod:0,pri:{}}).n++;
      var b=by[k];if(t.due){var d=parseYmd(t.due).getDay();b.wd[d]=(b.wd[d]||0)+1}else b.nod++;if(t.a)b.a[t.a]=(b.a[t.a]||0)+1;if(it.sh)b.sh++;b.pri[t.priority||0]=(b.pri[t.priority||0]||0)+1});
    return Object.keys(by).map(function(k){return by[k]}).filter(function(b){return b.n>=2}).sort(function(x,y){return y.n-x.n}).slice(0,n||6).map(function(b){
      var wd=null,mx=0;Object.keys(b.wd).forEach(function(d){if(b.wd[d]>mx){mx=b.wd[d];wd=+d}});
      var consistent=wd!=null&&mx/b.n>=.6;var a=null,ma=0;Object.keys(b.a).forEach(function(k){if(b.a[k]>ma){ma=b.a[k];a=k}});
      var pri=0,mp=0;Object.keys(b.pri).forEach(function(k){if(b.pri[k]>mp){mp=b.pri[k];pri=+k}});
      return {title:b.title,n:b.n,wd:consistent?wd:null,who:ma/b.n>=.6?a:null,shared:b.sh/b.n>=.6,pri:pri,nodate:b.nod/b.n>=.6&&!consistent};
    });
  }
  /* open tasks due on each of the next 7 days (for the load strip) */
  function load(all,today,days){var out=[];for(var i=0;i<days;i++){var d=addDays(today,i);out.push({date:d,n:all.filter(function(it){return !it.t.done&&(i===0?(it.t.due&&it.t.due<=d):it.t.due===d)}).length})}return out}
  /* longest chain of open tasks (ids), for the map */
  function longest(all){var best={};function L(id,seen){seen=seen||{};if(best[id])return best[id];if(seen[id])return 1;seen[id]=1;var t=byId(all,id),m=0;if(t)(t.dependsOn||[]).forEach(function(d){var x=byId(all,d);if(x&&!x.done)m=Math.max(m,L(d,seen))});return best[id]=m+1}
    var ids=all.filter(function(t){return !t.done}),end=null,mx=0;ids.forEach(function(t){var v=L(t.id);if(v>mx){mx=v;end=t.id}});var p=[],cur=end;while(cur){p.unshift(cur);var t=byId(all,cur),c=null,cm=0;((t&&t.dependsOn)||[]).forEach(function(d){var x=byId(all,d);if(x&&!x.done&&(best[d]||0)>cm){cm=best[d];c=d}});cur=c}return mx>=2?p:[]}

  g.TodoCore={parse:parse,fmtEst:fmtEst,f12:f12,time12:time12,dayLabel:dayLabel,ymd:ymd,addDays:addDays,addMonths:addMonths,nextRepeat:nextRepeat,esc:esc,
    byId:byId,openDeps:openDeps,isBlocked:isBlocked,unlocks:unlocks,wouldLoop:wouldLoop,level:level,view:view,owner:owner,showDue:showDue,score:score,sortItems:sortItems,
    complete:complete,reopen:reopen,newTask:newTask,often:often,load:load,longest:longest,NAMES:NAMES,DAYN:DAYN};
})(typeof window!=='undefined'?window:globalThis);

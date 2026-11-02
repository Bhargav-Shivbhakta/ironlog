/* =====================================================================
   SKIN CORE — the Skin app's routine, product stock and program calendar,
   usable from the Hub (widget, reminders, voice) without opening Skin.

   KEEP IN SYNC with apps/skin.html. The block between the BEGIN/END
   markers is copied from it character for character (SKIN_QTY,
   SKIN_AM_ROUTINE, SKIN_TREATMENTS, skinBodyStepsFor, the month and date
   plan, tracking fields, review dates, Anusha's routine, the product
   lists). The logic below it mirrors recordProductUse/restoreProductUse,
   ensureProductStateSeeded, routineCompletion, calculateStreak and
   sendItemToGrocery. Unlike assets/skin-plan.js (which the Schedule
   widget uses and which assumes the Oct 1 start), this follows the
   program start date you set in Skin.
===================================================================== */
(function(){
  if(window.SkinCore)return;
  var pad2=function(n){return String(n).padStart(2,'0')};
  function addDays(d,n){var x=new Date(d+'T00:00:00');x.setDate(x.getDate()+n);return x.getFullYear()+'-'+pad2(x.getMonth()+1)+'-'+pad2(x.getDate())}
  function weekdayOf(d){return new Date(d+'T00:00:00').getDay()}
  function daysBetween(a,b){return Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/86400000)}
  function todayStr(){var d=new Date();return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())}
  /* ---- BEGIN copied from apps/skin.html ---- */
const SKIN_QTY = {
  cleanser: '1 pump',
  faceMoisturizer: '2 pea-sized amounts — face & neck',
  faceSunscreen: '2 full finger-lengths — face, ears, neck',
  bodySunscreen: '~1 shot-glass — exposed areas, if leaving home',
  nizoral: '1–2 teaspoons — scalp',
  eucerinArms: '2 tsp — both arms',
  eucerinLegs: '4 tsp — both legs',
  eucerinChest: '2 tsp — chest & stomach',
  eucerinBack: '2–3 tsp — back',
  differin: '1 pea-sized amount — entire face (not per area)',
  azelaic: '1 pea-sized amount — uneven/pigmented areas',
  ceraveSAArms: '~2 tsp — both arms',
  ceraveSALegs: '~4 tsp — both legs',
  bha: '4–6 drops — nose, forehead, blackhead-prone areas'
};
const SKIN_AM_ROUTINE = [
  {text:'Cleanser', qty:SKIN_QTY.cleanser, product:'cleanser'},
  {text:'Moisturizer — face & neck', qty:SKIN_QTY.faceMoisturizer, product:'moisturizer'},
  {text:'Sunscreen — face, ears, neck', qty:SKIN_QTY.faceSunscreen, product:'spf'},
  {text:'Body sunscreen on exposed areas (if leaving home)', qty:SKIN_QTY.bodySunscreen, product:'spf', optional:true}
];
const SKIN_TREATMENTS = {
  regular: {
    label: 'Regular face routine',
    steps: [
      {text:'Cleanser', qty:SKIN_QTY.cleanser, product:'cleanser'},
      {text:'Moisturizer — face & neck', qty:SKIN_QTY.faceMoisturizer, product:'moisturizer'}
    ]
  },
  differin: {
    label: 'Differin night',
    steps: [
      {text:'Cleanser', qty:SKIN_QTY.cleanser, product:'cleanser'},
      {text:'Let face dry 15–20 minutes', timerMinutes:15},
      {text:'Thin layer of moisturizer', product:'moisturizer', weight:0.5},
      {text:'Differin — entire face', qty:SKIN_QTY.differin, product:'differin'},
      {text:'Another thin layer of moisturizer', product:'moisturizer', weight:0.5}
    ]
  },
  azelaic: {
    label: 'Azelaic acid night',
    steps: [
      {text:'Cleanser', qty:SKIN_QTY.cleanser, product:'cleanser'},
      {text:'Let skin dry completely'},
      {text:'Azelaic acid on uneven/pigmented areas', qty:SKIN_QTY.azelaic, product:'azelaic'},
      {text:'Moisturizer after it absorbs', qty:SKIN_QTY.faceMoisturizer, product:'moisturizer'}
    ]
  },
  bha: {
    label: 'BHA night',
    steps: [
      {text:'Cleanser', qty:SKIN_QTY.cleanser, product:'cleanser'},
      {text:'Paula’s Choice 2% BHA — nose, forehead, blackhead-prone areas', qty:SKIN_QTY.bha, product:'bha'},
      {text:'Wait 5–10 minutes', timerMinutes:5},
      {text:'Moisturizer', qty:SKIN_QTY.faceMoisturizer, product:'moisturizer'}
    ]
  }
};
function skinBodyStepsFor(entry){
  if(entry.ceraveSA){
    return [
      {text:'Shower, lukewarm, 5–10 min; pat partially dry'},
      {text:'CeraVe SA on rough/bumpy arms', qty:SKIN_QTY.ceraveSAArms, product:'sa', weight:0.5},
      {text:'CeraVe SA on rough/bumpy legs', qty:SKIN_QTY.ceraveSALegs, product:'sa', weight:0.5},
      {text:'Eucerin on the rest of the body — within 3 minutes of showering', product:'eucerin', weight:0.5}
    ];
  }
  return [
    {text:'Shower, lukewarm, 5–10 min; pat partially dry'},
    {text:'Eucerin — both arms', qty:SKIN_QTY.eucerinArms, product:'eucerin', weight:0.25},
    {text:'Eucerin — both legs', qty:SKIN_QTY.eucerinLegs, product:'eucerin', weight:0.25},
    {text:'Eucerin — chest & stomach', qty:SKIN_QTY.eucerinChest, product:'eucerin', weight:0.25},
    {text:'Eucerin — back', qty:SKIN_QTY.eucerinBack, product:'eucerin', weight:0.25},
    {text:'Apply within 3 minutes of showering'}
  ];
}
const SKIN_TEMPLATE_START = '2026-10-01';
const SKIN_MONTHS_TEMPLATE = [
  {key:'m1', name:'Month 1 — Hydration & Repair', range:['2026-10-01','2026-10-31'],
   objective:'Hydrate the face and body, reduce dandruff and scaling, improve roughness, protect against further tanning, and prepare skin for blackhead and pigmentation treatments in Month 2.'},
  {key:'m2', name:'Month 2 — Blackheads, Pigmentation & Body Bumps', range:['2026-11-01','2026-11-30'],
   objective:'Reduce blackheads and clogged pores, improve uneven facial texture, begin fading pigmentation, smooth body bumps, maintain dandruff control.'},
  {key:'m3', name:'Month 3 — Stronger Blackhead, Pigmentation & Texture Treatment', range:['2026-12-01','2026-12-31'],
   objective:'Reduce visible blackheads, improve uneven pigmentation, smooth facial texture, improve body bumps, maintain dandruff control, build a healthier natural glow.'},
  {key:'m4', name:'Month 4 — Maintenance, Glow & Modeling Prep', range:['2027-01-01','2027-01-31'],
   objective:'Maintain fewer blackheads, continue improving uneven pigmentation, improve facial smoothness, maintain smoother body texture, keep dandruff controlled, build a hydrated, camera-ready appearance.'},
  {key:'m5', name:'Month 5 — Maintenance & Pore-Focused Refinement', range:['2027-02-01','2027-02-28'],
   objective:'Maintain progress while adding a controlled pore-clearing step for remaining blackheads.'}
];
function buildSkinDatePlan(){
  const plan = {};
  const nizoralOct = ['2026-10-01','2026-10-03','2026-10-06','2026-10-08','2026-10-10','2026-10-13','2026-10-15','2026-10-17','2026-10-20','2026-10-22','2026-10-24','2026-10-27','2026-10-29','2026-10-31'];
  for(let d=1; d<=31; d++){
    const ds = '2026-10-'+pad2(d);
    plan[ds] = {face:'regular', nizoral: nizoralOct.indexOf(ds)!==-1, ceraveSA:false};
  }
  const nov = {
    1:{face:'regular'}, 2:{face:'regular'}, 3:{face:'regular',nizoral:true,ceraveSA:true}, 4:{face:'differin'},
    5:{face:'regular'}, 6:{face:'regular'}, 7:{face:'regular',nizoral:true,ceraveSA:true},
    8:{face:'differin'}, 9:{face:'regular'}, 10:{face:'regular',nizoral:true,ceraveSA:true}, 11:{face:'regular'},
    12:{face:'regular'}, 13:{face:'differin'}, 14:{face:'regular',nizoral:true,ceraveSA:true},
    15:{face:'regular'}, 16:{face:'differin'}, 17:{face:'regular',nizoral:true,ceraveSA:true}, 18:{face:'azelaic'},
    19:{face:'regular'}, 20:{face:'differin'}, 21:{face:'regular',nizoral:true,ceraveSA:true},
    22:{face:'regular'}, 23:{face:'differin'}, 24:{face:'regular',nizoral:true,ceraveSA:true}, 25:{face:'azelaic'},
    26:{face:'regular'}, 27:{face:'differin'}, 28:{face:'azelaic',nizoral:true,ceraveSA:true},
    29:{face:'regular'}, 30:{face:'differin'}
  };
  Object.keys(nov).forEach(function(d){ plan['2026-11-'+pad2(d)] = Object.assign({face:'regular',nizoral:false,ceraveSA:false}, nov[d]); });

  // getDay(): Sun=0 Mon=1 Tue=2 Wed=3 Thu=4 Fri=5 Sat=6
  const decByWeekday = {2:{face:'azelaic',ceraveSA:true}, 3:{face:'differin'}, 4:{face:'regular',ceraveSA:true}, 5:{face:'azelaic'}, 6:{face:'differin',nizoral:true,ceraveSA:true}, 0:{face:'regular'}, 1:{face:'differin'}};
  for(let d=1; d<=31; d++){
    const ds = '2026-12-'+pad2(d);
    plan[ds] = Object.assign({face:'regular',nizoral:false,ceraveSA:false}, decByWeekday[weekdayOf(ds)]);
  }
  const janByWeekday = {1:{face:'differin',ceraveSA:true}, 2:{face:'azelaic'}, 3:{face:'differin',ceraveSA:true}, 4:{face:'regular'}, 5:{face:'azelaic',ceraveSA:true}, 6:{face:'differin',nizoral:true}, 0:{face:'regular',note:'Optional: 5-minute gentle facial massage using moisturizer.'}};
  for(let d=1; d<=31; d++){
    const ds = '2027-01-'+pad2(d);
    plan[ds] = Object.assign({face:'regular',nizoral:false,ceraveSA:false}, janByWeekday[weekdayOf(ds)]);
  }
  const feb = {
    1:{face:'differin',ceraveSA:true}, 2:{face:'azelaic'}, 3:{face:'regular'}, 4:{face:'bha',ceraveSA:true}, 5:{face:'differin'},
    6:{face:'differin',nizoral:true,ceraveSA:true}, 7:{face:'azelaic'},
    8:{face:'differin',ceraveSA:true}, 9:{face:'azelaic'}, 10:{face:'regular'}, 11:{face:'bha',ceraveSA:true}, 12:{face:'differin'},
    13:{face:'differin',nizoral:true,ceraveSA:true}, 14:{face:'azelaic'},
    15:{face:'differin',ceraveSA:true}, 16:{face:'azelaic'}, 17:{face:'regular'}, 18:{face:'bha',ceraveSA:true}, 19:{face:'differin'},
    20:{face:'differin',nizoral:true,ceraveSA:true}, 21:{face:'azelaic'},
    22:{face:'differin',ceraveSA:true}, 23:{face:'azelaic'}, 24:{face:'regular'}, 25:{face:'bha',ceraveSA:true}, 26:{face:'differin'},
    27:{face:'differin',nizoral:true,ceraveSA:true}, 28:{face:'azelaic'}
  };
  Object.keys(feb).forEach(function(d){ plan['2027-02-'+pad2(d)] = Object.assign({face:'regular',nizoral:false,ceraveSA:false}, feb[d]); });
  return plan;
}
const SKIN_DATE_PLAN_TEMPLATE = buildSkinDatePlan();
const SKIN_TRACKING_FIELDS = {
  m1: [ {key:'dryness',label:'Facial dryness',type:'scale'}, {key:'comfort',label:'Facial comfort',type:'scale'}, {key:'dandruff',label:'Scalp dandruff',type:'scale'}, {key:'itchiness',label:'Scalp itchiness',type:'scale'}, {key:'roughness',label:'Body roughness',type:'scale'}, {key:'bumps',label:'New facial bumps',type:'text'} ],
  m2: [ {key:'dryness',label:'Facial dryness',type:'scale'}, {key:'comfort',label:'Facial comfort',type:'scale'}, {key:'blackheads',label:'Blackhead congestion',type:'scale'}, {key:'pigmentation',label:'Pigmentation visibility',type:'scale'}, {key:'roughness',label:'Body roughness',type:'scale'}, {key:'dandruff',label:'Scalp dandruff',type:'scale'}, {key:'bumps',label:'New facial bumps',type:'text'} ],
  m3: [ {key:'blackheads',label:'Blackhead congestion',type:'scale'}, {key:'pigmentation',label:'Pigmentation visibility',type:'scale'}, {key:'texture',label:'Facial texture',type:'scale'}, {key:'comfort',label:'Facial comfort',type:'scale'}, {key:'roughness',label:'Body roughness',type:'scale'}, {key:'dandruff',label:'Scalp dandruff',type:'scale'}, {key:'bumps',label:'New facial bumps',type:'text'} ],
  m4: [ {key:'blackheads',label:'Blackhead visibility',type:'scale'}, {key:'pigmentation',label:'Pigmentation visibility',type:'scale'}, {key:'smoothness',label:'Facial smoothness',type:'scale'}, {key:'glow',label:'Glow/hydration',type:'scale'}, {key:'roughness',label:'Body roughness',type:'scale'}, {key:'dandruff',label:'Scalp dandruff',type:'scale'} ],
  m5: [ {key:'blackheads',label:'Blackhead visibility',type:'scale'}, {key:'pores',label:'Pore visibility',type:'scale'}, {key:'pigmentation',label:'Pigmentation visibility',type:'scale'}, {key:'smoothness',label:'Facial smoothness',type:'scale'}, {key:'roughness',label:'Body roughness',type:'scale'}, {key:'glow',label:'Overall glow',type:'scale'} ]
};
const SKIN_REVIEW_DATES_TEMPLATE = ['2026-10-31','2026-11-30','2026-12-31','2027-01-31','2027-02-28'];
const ANUSHA_MORNING = [
  {text:'Rinse with water — INKEY List Salicylic Acid Cleanser only if face is oily', product:'cleanser'},
  {text:'Tone: Anua Heartleaf 77 + Hyaluron Soothing Toner', product:'toner'},
  {text:'Brighten: INKEY List 15% Vitamin C + EGF Serum — 1–2 pumps', product:'vitc'},
  {text:'Hydrate: Atomy Hydra Brightening Capsule Essence — 1–2 pumps', product:'essence'},
  {text:'Moisturize: Atomy Hydra Brightening Cream', product:'amCream'},
  {text:'Broad-spectrum sunscreen SPF 30–50', product:'spf'}
];
const ANUSHA_NIGHT = [
  {text:'Cleanse: INKEY List Salicylic Acid Cleanser', product:'cleanser'},
  {text:'Tone: Anua Heartleaf 77 + Hyaluron Soothing Toner', product:'toner'},
  {text:'Treat: Anua Azelaic Acid 10% Serum — 2–3 drops', product:'azelaicSerum'},
  {text:'Hydrate: Atomy Hydra Brightening Capsule Essence — 1–2 pumps', product:'essence'},
  {text:'Moisturize: Anua Ceramide 3 + Panthenol Barrier Cream', product:'pmCream'}
];
const SKIN_PRODUCTS_BHARGAV = [
  {id:'cleanser', name:'Vanicream Gentle Facial Cleanser', capacity:120},
  {id:'moisturizer', name:'Vanicream Daily Facial Moisturizer', capacity:100},
  {id:'spf', name:'La Roche-Posay Anthelios Melt-In Milk SPF 60', capacity:50},
  {id:'nizoral', name:'Nizoral A-D Anti-Dandruff Shampoo 1%', capacity:25},
  {id:'eucerin', name:'Eucerin Advanced Repair Lotion', capacity:30},
  {id:'differin', name:'Differin Gel 0.1% (adapalene)', capacity:90},
  {id:'azelaic', name:'The Ordinary Azelaic Acid Suspension 10%', capacity:90},
  {id:'sa', name:'CeraVe SA Lotion', capacity:35},
  {id:'bha', name:'Paula’s Choice Skin Perfecting 2% BHA Liquid Exfoliant', capacity:120}
];
const SKIN_PRODUCTS_ANUSHA = [
  {id:'cleanser', name:'INKEY List Salicylic Acid Cleanser', capacity:90},
  {id:'toner', name:'Anua Heartleaf 77 + Hyaluron Soothing Toner', capacity:90},
  {id:'vitc', name:'INKEY List 15% Vitamin C + EGF Serum', capacity:60},
  {id:'essence', name:'Atomy Hydra Brightening Capsule Essence', capacity:60},
  {id:'amCream', name:'Atomy Hydra Brightening Cream', capacity:60},
  {id:'spf', name:'Broad-spectrum sunscreen SPF 30–50', capacity:50},
  {id:'azelaicSerum', name:'Anua Azelaic Acid 10% Serum', capacity:60},
  {id:'pmCream', name:'Anua Ceramide 3 + Panthenol Barrier Cream', capacity:60}
];
  /* ---- END copied from apps/skin.html ---- */
  var C={QTY:SKIN_QTY,TREATMENTS:SKIN_TREATMENTS,TEMPLATE_START:SKIN_TEMPLATE_START,REACTIONS:['No reaction','Mild dryness','Redness','Peeling','Burning','Increased bumps','Scalp irritation','Other'],CONCERNING:['Burning','Redness','Peeling','Other']};
  C.addDays=addDays;C.daysBetween=daysBetween;C.today=todayStr;
  /* ---- program calendar for a start date (same shifting as rebuildProgramCalendar) ---- */
  var cache={};
  C.calendar=function(start){
    start=start||SKIN_TEMPLATE_START;if(cache[start])return cache[start];
    var off=daysBetween(SKIN_TEMPLATE_START,start),plan={};
    Object.keys(SKIN_DATE_PLAN_TEMPLATE).forEach(function(k){plan[addDays(k,off)]=SKIN_DATE_PLAN_TEMPLATE[k]});
    var c={start:start,months:SKIN_MONTHS_TEMPLATE.map(function(m){return{key:m.key,name:m.name,objective:m.objective,range:[addDays(m.range[0],off),addDays(m.range[1],off)]}}),plan:plan,reviews:SKIN_REVIEW_DATES_TEMPLATE.map(function(d){return addDays(d,off)})};
    cache[start]=c;return c;
  };
  C.monthFor=function(start,date){var c=C.calendar(start);return c.months.find(function(m){return date>=m.range[0]&&date<=m.range[1]})||null};
  C.products=function(profile){return profile==='Anusha'?SKIN_PRODUCTS_ANUSHA:SKIN_PRODUCTS_BHARGAV};
  C.trackFields=function(monthKey){return SKIN_TRACKING_FIELDS[monthKey]||[]};
  /* ---- the day's routine: sections of steps, each with product / weight / optional / timer ---- */
  var TIME={am:'7:00 AM',body:'7:30 PM',nizoral:'',face:'9:30 PM',pm:''};
  C.sections=function(profile,date,start){
    if(profile==='Anusha'){
      return[{key:'am',label:'Morning',icon:'☀️',sub:'Brighten and protect',steps:ANUSHA_MORNING},{key:'pm',label:'Night',icon:'🌙',sub:'Repair',steps:ANUSHA_NIGHT}];
    }
    var entry=C.calendar(start).plan[date];if(!entry)return null;
    var tr=SKIN_TREATMENTS[entry.face]||SKIN_TREATMENTS.regular,out=[];
    out.push({key:'am',label:'Morning',icon:'☀️',sub:'Cleanse, moisturize, protect',time:TIME.am,steps:SKIN_AM_ROUTINE});
    out.push({key:'body',label:'Shower & body',icon:'🚿',sub:entry.ceraveSA?'CeraVe SA night':'Eucerin within 3 minutes',time:TIME.body,steps:skinBodyStepsFor(entry)});
    if(entry.nizoral)out.push({key:'nizoral',label:'Nizoral',icon:'🧴',sub:'Scalp night',steps:[{text:'Wet the scalp completely'},{text:'Apply '+SKIN_QTY.nizoral,product:'nizoral'},{text:'Massage gently for 30 seconds'},{text:'Leave on for the time on the bottle'},{text:'Rinse thoroughly'}]});
    out.push({key:'face',label:'Night — face',icon:'🌙',sub:tr.label,treat:tr.label,face:entry.face,time:TIME.face,note:entry.note||'',steps:tr.steps});
    return out;
  };
  C.stepKey=function(date,section,i){return date+':'+section+':'+i};
  C.requiredKeys=function(profile,date,start){
    var secs=C.sections(profile,date,start);if(!secs)return null;var keys=[];
    secs.forEach(function(s){s.steps.forEach(function(st,i){if(!st.optional)keys.push(C.stepKey(date,s.key,i))})});
    return keys;
  };
  C.completion=function(profile,date,start,log){
    var keys=C.requiredKeys(profile,date,start);if(!keys||!keys.length)return{done:0,total:0,pct:0};
    var d=keys.filter(function(k){return!!log[k]}).length;return{done:d,total:keys.length,pct:Math.round(d/keys.length*100)};
  };
  C.streak=function(profile,start,log,today){
    var n=0,d=today||todayStr();
    for(var i=0;i<365;i++){var c=C.completion(profile,d,start,log);if(c.total>0&&c.pct===100){n++;d=addDays(d,-1)}else break}
    return n;
  };
  C.scanRange=function(profile,start,today){
    if(profile==='Anusha')return[addDays(today,-90),today];
    var c=C.calendar(start),last=c.months[c.months.length-1].range[1];return[c.months[0].range[0],today<last?today:last];
  };
  C.bestStreak=function(profile,start,log,today){
    var r=C.scanRange(profile,start,today),best=0,run=0,d=r[0];
    while(d<=r[1]){var c=C.completion(profile,d,start,log);if(c.total>0&&c.pct===100){run++;if(run>best)best=run}else run=0;d=addDays(d,1)}
    return best;
  };
  C.completeDays=function(profile,start,log,today){
    var r=C.scanRange(profile,start,today),n=0,d=r[0];if(r[1]<r[0])return 0;
    while(d<=r[1]){var c=C.completion(profile,d,start,log);if(c.total>0&&c.pct===100)n++;d=addDays(d,1)}return n;
  };
  /* last N days, oldest first: 0 none planned/started, 1..4 by completion quarter */
  C.heat=function(profile,start,log,today,n){
    var out=[];for(var i=n-1;i>=0;i--){var d=addDays(today,-i),c=C.completion(profile,d,start,log),lv=0;
      if(c.total>0){lv=c.pct>=100?4:c.pct>=67?3:c.pct>=34?2:c.pct>0?1:0}
      out.push({date:d,pct:c.pct,total:c.total,lv:lv,future:d>today})}
    return out;
  };
  C.upcoming=function(profile,start,today,n){
    var out=[];if(profile==='Anusha')return out;
    var c=C.calendar(start);
    for(var i=1;i<=n;i++){var d=addDays(today,i),e=c.plan[d];if(!e){out.push({date:d,none:true});continue}
      var tr=SKIN_TREATMENTS[e.face]||SKIN_TREATMENTS.regular;out.push({date:d,face:e.face,label:tr.label,nizoral:!!e.nizoral,ceraveSA:!!e.ceraveSA})}
    return out;
  };
  /* ---- product stock (mirrors ensureProductStateSeeded / recordProductUse / restoreProductUse) ---- */
  C.seedState=function(ps,profile){
    ps=ps&&typeof ps==='object'?ps:{};
    C.products(profile).forEach(function(p){
      if(!ps[p.id])ps[p.id]={capacity:p.capacity,remaining:p.capacity,refills:0};
      else{ps[p.id].capacity=Number(ps[p.id].capacity)||p.capacity;ps[p.id].remaining=Math.max(0,Number(ps[p.id].remaining)||0);ps[p.id].refills=Number(ps[p.id].refills)||0}
    });
    return ps;
  };
  C.use=function(ps,ledger,key,pid,weight){var p=ps[pid];if(!p||ledger[key])return false;p.remaining=Math.max(0,p.remaining-weight);ledger[key]={productId:pid,weight:weight};return true};
  C.restore=function(ps,ledger,key){var e=ledger[key];if(!e)return false;var p=ps[e.productId];if(p)p.remaining=Math.min(p.capacity,p.remaining+Number(e.weight||1));delete ledger[key];return true};
  C.pct=function(ps,id){var p=ps[id];return(p&&p.capacity)?Math.max(0,Math.min(100,Math.round(p.remaining/p.capacity*100))):0};
  C.statusLabel=function(pct){return pct<=15?'Buy soon':pct<=30?'Running low':'Healthy'};
  C.low=function(ps,profile){return C.products(profile).filter(function(p){return C.pct(ps,p.id)<=30}).map(function(p){return{id:p.id,name:p.name,pct:C.pct(ps,p.id)}})};
  /* tick or untick one step; returns what changed (the caller saves stepLog, productState, usageLedger) */
  C.setStep=function(st,key,step,on){
    var had=!!st.stepLog[key],pid=step.product||'',w=step.weight!=null?step.weight:1;
    if(on&&!had){st.stepLog[key]=true;if(pid)C.use(st.productState,st.usageLedger,key,pid,w);return{changed:true,stock:!!pid}}
    if(!on&&had){delete st.stepLog[key];if(pid)C.restore(st.productState,st.usageLedger,key);return{changed:true,stock:!!pid}}
    return{changed:false,stock:false};
  };
  /* the product name to show under a step, unless the step text already names it (same rule as stepRowHtml) */
  C.productName=function(profile,step){
    if(!step.product)return'';var pr=C.products(profile).find(function(p){return p.id===step.product});if(!pr)return'';
    var norm=step.text.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ');
    var keys=pr.name.split(/[\s—-]+/).slice(0,2).map(function(w){return w.replace(/[^A-Za-z0-9]/g,'').toLowerCase()}).filter(Boolean);
    return(!keys.length||!keys.every(function(k){return norm.indexOf(k)!==-1}))?pr.name:'';
  };
  /* ---- nightly tracking ---- */
  C.trackSave=function(log,date,vals,overall,reactions,observation){
    var rec=log[date]||{};
    Object.keys(vals).forEach(function(k){rec[k]=String(vals[k])});
    if(overall)rec.overall=overall;
    if(observation!=null)rec.observation=observation;
    rec.reactions=reactions||[];rec.savedAt=new Date().toISOString();log[date]=rec;return rec;
  };
  C.concerning=function(reactions){return(reactions||[]).some(function(r){return SKIN_CONCERNING_REACTIONS_LIST.indexOf(r)!==-1})};
  var SKIN_CONCERNING_REACTIONS_LIST=C.CONCERNING;
  /* ---- Anusha check-ins ---- */
  C.dueIn=function(arr,interval,today){var last=(arr||[]).length?arr[arr.length-1]:null;if(!last)return{never:true,due:true,since:null,left:0};var since=daysBetween(last.date,today);return{never:false,due:since>=interval,since:since,left:Math.max(0,interval-since)}};
  /* ---- send a product to Grocery (port of sendItemToGrocery; gdoc is the modernState document reference) ---- */
  var norm=function(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'')};
  C.sendToGrocery=async function(gdoc,item){
    if(typeof item==='string')item={name:item};
    try{
      var doc=await gdoc.get();if(!doc.exists||!doc.data().json)return{added:false,error:true,reason:'no-provision-state'};
      var st=JSON.parse(doc.data().json);st.products=st.products||[];
      var product=st.products.find(function(p){return norm(p.name)===norm(item.name)});
      if(!product){
        var priceNum=Number(String(item.price||'0').replace(/[^0-9.]/g,''))||0;
        product={id:'skin-custom-'+Date.now()+'-'+Math.floor(Math.random()*1000),name:item.name,store:item.retailer||'Skin plan',note:item.sub||'',price:priceNum,link:item.url||'',category:'skin',purchaseUnit:'piece',purchaseQty:1,servingUnit:'piece',servingSize:1,macros:{}};
        st.products.push(product);
      }
      var week=st.weeks&&st.activeWeek?st.weeks[st.activeWeek]:null;
      if(!week)return{added:false,error:true,reason:'no-active-week'};
      week.items=week.items||[];
      var already=week.items.some(function(x){return x.productId===product.id&&!(x.plannedQty>0&&x.purchasedQty>=x.plannedQty)});
      if(!already)week.items.push({id:'skin-'+Date.now()+'-'+Math.floor(Math.random()*1000),productId:product.id,plannedQty:1,purchasedQty:0,unitPrice:product.price||0,actualPrice:null,carriedQty:0,dismissedQty:0,source:'skin-plan'});
      await gdoc.set({json:JSON.stringify(st)});
      return{added:!already};
    }catch(e){return{added:false,error:true}}
  };
  window.SkinCore=C;
})();

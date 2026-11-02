/* =====================================================================
   DIET CORE — what the Diet app does when you eat, skip or add a meal,
   usable from the Hub (widget, voice, engine) without opening Diet.

   KEEP IN SYNC with apps/diet.html: zero / toBasisQty / nutrients / sum,
   defaultRecipesForMeal / mealNutrition, consumptionFor / applyConsumption,
   seedPlanForDate, updateDiary (eaten <-> planned), the choice-meal log
   (confirmBundle) and trackPantryConsumption (Grocery stock).

   Everything here works on the Diet state object (the same JSON document
   Diet keeps at users/{uid}/apps/nourish-diet-v2/data/state) and never
   touches the page. Functions take that state as `S`.
===================================================================== */
(function(){
  if(window.DietCore)return;
  var C={};
  var NUM=['calories','protein','carbs','fat','fiber','satFat','sugar','sodium','calcium','iron','potassium','vitaminD'];
  var p2=function(n){return String(n).padStart(2,'0')};
  var round=function(n,d){d=d==null?1:d;return Number(Number(n).toFixed(d))};
  C.zero=function(){var o={};NUM.forEach(function(k){o[k]=0});return o};
  C.localToday=function(){var d=new Date();return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate())};
  C.addDays=function(iso,n){var x=new Date(iso+'T12:00:00');x.setDate(x.getDate()+n);return x.getFullYear()+'-'+p2(x.getMonth()+1)+'-'+p2(x.getDate())};
  C.food=function(S,id){return (S.foods||[]).find(function(f){return f.id===id})};
  C.toBasisQty=function(f,qty,unit){
    qty=Number(qty)||0;if(unit===f.unit)return qty;
    var mass={g:1,oz:28.3495},liquid={ml:1,cup:236.588,tbsp:14.787,tsp:4.929},counts=['piece','serving','scoop'],grams=null,ml=null;
    if(mass[unit])grams=qty*mass[unit];if(liquid[unit])ml=qty*liquid[unit];
    if(counts.includes(unit)&&f.pieceG)grams=qty*f.pieceG;
    if(grams===null&&ml!==null&&f.density)grams=ml*f.density;
    if(ml===null&&grams!==null&&f.density)ml=grams/f.density;
    if(mass[f.unit]&&grams!==null)return grams/mass[f.unit];
    if(liquid[f.unit]&&ml!==null)return ml/liquid[f.unit];
    if(counts.includes(f.unit)&&grams!==null&&f.pieceG)return grams/f.pieceG;
    return 0;
  };
  C.nutrients=function(S,it){var f=C.food(S,it.foodId);if(!f)return C.zero();var factor=C.toBasisQty(f,it.qty,it.unit)/f.basis,n=C.zero();NUM.forEach(function(k){n[k]=(f[k]||0)*factor});return n};
  C.sum=function(S,items){return (items||[]).reduce(function(a,x){var n=C.nutrients(S,x);NUM.forEach(function(k){a[k]+=n[k]});return a},C.zero())};
  C.scaled=function(n,f){var o={};Object.keys(n||{}).forEach(function(k){o[k]=n[k]*f});return o};
  C.add=function(list){return list.reduce(function(a,n){NUM.forEach(function(k){a[k]+=(n&&n[k])||0});return a},C.zero())};
  C.recipeServingN=function(S,r){return C.scaled(C.sum(S,r.items),1/(r.servings||1))};
  C.recipesForMeal=function(S,m){var seen={};return (m.recipeIds||[]).map(function(id){return (S.recipes||[]).find(function(r){return r.id===id})}).filter(Boolean).filter(function(r){if(!r.group)return true;if(seen[r.group])return false;seen[r.group]=true;return true})};
  C.mealNutrition=function(S,m){return C.add(C.recipesForMeal(S,m).map(function(r){return C.recipeServingN(S,r)}))};
  C.hasChoice=function(S,m){var c={};(m.recipeIds||[]).forEach(function(id){var r=(S.recipes||[]).find(function(x){return x.id===id});if(r&&r.group)c[r.group]=(c[r.group]||0)+1});return Object.keys(c).some(function(k){return c[k]>=2})};
  /* the fixed recipes of a choice meal and, per group, the options you can pick from */
  C.choices=function(S,m){
    var fixed=[],groups={};
    (m.recipeIds||[]).forEach(function(id){var r=(S.recipes||[]).find(function(x){return x.id===id});if(!r)return;if(r.group)(groups[r.group]=groups[r.group]||[]).push(r);else fixed.push(r)});
    return{fixed:fixed,groups:groups};
  };
  C.consumptionFor=function(S,items,factor){
    factor=factor==null?1:factor;var map={};
    (items||[]).forEach(function(it){var f=C.food(S,it.foodId);if(!f)return;map[f.id]=(map[f.id]||0)+C.toBasisQty(f,it.qty,it.unit)*factor});
    return Object.keys(map).map(function(k){return{foodId:k,qty:map[k]}});
  };
  C.mergeConsumption=function(groups){var m={};groups.reduce(function(a,b){return a.concat(b)},[]).forEach(function(x){m[x.foodId]=(m[x.foodId]||0)+x.qty});return Object.keys(m).map(function(k){return{foodId:k,qty:m[k]}})};
  C.consumptionOfRecipes=function(S,rs){return C.mergeConsumption(rs.map(function(r){return C.consumptionFor(S,r.items,1/(r.servings||1))}))};
  C.applyConsumption=function(S,list,dir){(list||[]).forEach(function(c){var f=C.food(S,c.foodId);if(f&&f.groceryProductId)return;var p=(S.pantry||[]).find(function(x){return x.foodId===c.foodId});if(p)p.qty=Math.max(0,p.qty+dir*c.qty)})};

  /* ---- plan for a day (same rule as Diet's seedPlanForDate) ---- */
  C.seedPlan=function(S,pid,date){
    if(!S.meals||!S.diary||!date||date<C.localToday())return false;
    S.planSeeded=S.planSeeded||{};var k=pid+'|'+date;if(S.planSeeded[k])return false;S.planSeeded[k]=true;
    var old=C.addDays(C.localToday(),-14);Object.keys(S.planSeeded).forEach(function(x){if(x.split('|')[1]<old)delete S.planSeeded[x]});
    var names={};S.diary.filter(function(x){return x.date===date&&x.profileId===pid}).forEach(function(x){names[x.name]=1});
    S.meals.filter(function(m){return m.profileId===pid&&!names[m.name]}).forEach(function(m,i){
      var rs=C.recipesForMeal(S,m);if(!rs.length)return;
      S.diary.push({id:'d-plan-'+Date.now()+'-'+i+'-'+Math.random().toString(36).slice(2,6),date:date,profileId:pid,mealId:m.id,name:m.name,detail:rs.map(function(r){return r.name}).join(' + '),icon:m.icon,servings:1,recipeServings:1,nutrition:C.mealNutrition(S,m),status:'planned',note:'',consumption:C.consumptionOfRecipes(S,rs),quick:true});
    });
    return true;
  };
  C.entryN=function(e){return C.scaled(e.nutrition||{},(e.servings||1)/(e.recipeServings||1))};
  C.statusOf=function(e){return e.status||'eaten'};
  C.parseTime=function(s){var m=/^\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i.exec(String(s||''));if(!m)return null;var h=+m[1]%12;if(/pm/i.test(m[3]))h+=12;return h*60+ +m[2]};

  /* ---- rows for one person and day: planned meals (even before Diet created them), then anything else you ate ---- */
  C.dayRows=function(S,pid,date){
    var meals=(S.meals||[]).filter(function(m){return m.profileId===pid}),entries=(S.diary||[]).filter(function(e){return e.date===date&&e.profileId===pid&&!e.replaced});
    var rows=[],used={};
    meals.forEach(function(m,i){
      var es=entries.filter(function(e){return e.mealId===m.id});
      if(!es.length){
        if(date<C.localToday())return;
        var rs=C.recipesForMeal(S,m);if(!rs.length)return;
        rows.push({key:'v:'+m.id,virtual:true,meal:m,idx:i,id:null,name:m.name,slot:m.slot,icon:m.icon,time:m.time,t:C.parseTime(m.time),status:'planned',n:C.mealNutrition(S,m),detail:rs.map(function(r){return r.name}).join(' + '),choice:C.hasChoice(S,m)});
        return;
      }
      es.forEach(function(e){used[e.id]=1;rows.push({key:e.id,virtual:false,meal:m,idx:i,id:e.id,name:e.name||m.name,slot:m.slot,icon:e.icon||m.icon,time:m.time,t:C.parseTime(m.time),status:C.statusOf(e),n:C.entryN(e),detail:e.detail||'',note:e.note||'',choice:C.hasChoice(S,m)&&C.statusOf(e)==='planned'})});
    });
    var extras=entries.filter(function(e){return !used[e.id]&&C.statusOf(e)==='eaten'}).map(function(e){return{key:e.id,id:e.id,extra:true,name:e.name,icon:e.icon||'🍽️',detail:e.detail||'',status:'eaten',n:C.entryN(e),quick:e.detail==='Quick add'}});
    return{rows:rows,extras:extras};
  };
  C.totals=function(S,pid,date){
    var d=C.dayRows(S,pid,date),t=C.zero();
    d.rows.forEach(function(r){if(r.status==='eaten')NUM.forEach(function(k){t[k]+=r.n[k]||0})});
    d.extras.forEach(function(r){NUM.forEach(function(k){t[k]+=r.n[k]||0})});
    return t;
  };
  C.goals=function(S,pid){var p=(S.profiles||{})[pid]||{};return{goals:p.goals||{calories:2000,protein:120,carbs:220,fat:65},micro:p.microGoals||{satFat:20,sugar:50}}};

  /* ---- changes. Each takes the FRESH state and returns {jobs:[...]} for the Grocery stock step ---- */
  C.setStatus=function(S,pid,date,rowKey,val){
    var out={jobs:[],changed:false,id:null,was:null};
    C.seedPlan(S,pid,date);
    var e=null;
    if(rowKey.indexOf('v:')===0){var mid=rowKey.slice(2);e=(S.diary||[]).find(function(x){return x.date===date&&x.profileId===pid&&x.mealId===mid&&!x.replaced})}
    else e=(S.diary||[]).find(function(x){return x.id===rowKey});
    if(!e)return out;
    var was=C.statusOf(e);out.id=e.id;out.was=was;
    if(was===val)return out;
    if(was==='eaten'&&val!=='eaten')C.applyConsumption(S,e.consumption||[],1);
    if(was!=='eaten'&&val==='eaten'){C.applyConsumption(S,e.consumption||[],-1);if((e.consumption||[]).length)out.jobs.push({items:e.consumption.map(function(c){return{foodId:c.foodId,qty:c.qty,unit:(C.food(S,c.foodId)||{}).unit||'g'}})})}
    e.status=val;out.changed=true;return out;
  };
  /* a choice meal (whey + one fruit...): the planned row is replaced by what you actually had, as Diet's own "Review & log meal" does */
  C.logMealWith=function(S,pid,date,mealId,recipes){
    var m=(S.meals||[]).find(function(x){return x.id===mealId});if(!m||!recipes.length)return{jobs:[],changed:false};
    C.seedPlan(S,pid,date);
    var n=C.add(recipes.map(function(r){return C.recipeServingN(S,r)})),c=C.consumptionOfRecipes(S,recipes);
    C.applyConsumption(S,c,-1);
    (S.diary||[]).filter(function(x){return x.date===date&&x.profileId===pid&&x.name===m.name&&x.status==='planned'&&!x.replaced}).forEach(function(x){x.replaced=true});
    var id='d-'+Date.now()+'-'+Math.random().toString(36).slice(2,5);
    S.diary.push({id:id,date:date,profileId:pid,mealId:m.id,name:m.name,detail:recipes.map(function(r){return r.name}).join(' + '),icon:m.icon,servings:1,recipeServings:1,nutrition:n,status:'eaten',note:'',consumption:c});
    return{jobs:recipes.map(function(r){return{items:r.items}}),changed:true,id:id};
  };
  C.undoLogMealWith=function(S,pid,date,mealId,id){
    var e=(S.diary||[]).find(function(x){return x.id===id});if(!e)return;
    C.applyConsumption(S,e.consumption||[],1);S.diary=S.diary.filter(function(x){return x.id!==id});
    var m=(S.meals||[]).find(function(x){return x.id===mealId});
    (S.diary||[]).filter(function(x){return x.date===date&&x.profileId===pid&&m&&x.name===m.name&&x.replaced}).forEach(function(x){delete x.replaced});
  };
  C.quickAdd=function(S,pid,date,o){
    var n=C.zero();n.calories=+o.kcal||0;n.protein=+o.protein||0;n.carbs=+o.carbs||0;n.fat=+o.fat||0;n.sugar=+o.sugar||0;n.satFat=+o.satFat||0;
    var id='d-q-'+Date.now()+'-'+Math.random().toString(36).slice(2,5);
    S.diary.push({id:id,date:date,profileId:pid,name:String(o.name||'Food').slice(0,60),detail:'Quick add',icon:o.icon||'➕',servings:1,recipeServings:1,nutrition:n,status:'eaten',note:'',consumption:[]});
    return{id:id,jobs:[],changed:true};
  };
  /* one food straight from the food list (the protein rescue's whey scoop) */
  C.logFood=function(S,pid,date,f,qty,unit,label){
    var items=[{foodId:f.id,qty:qty,unit:unit}],n=C.sum(S,items),c=C.consumptionFor(S,items,1);
    C.applyConsumption(S,c,-1);
    var id='d-f-'+Date.now()+'-'+Math.random().toString(36).slice(2,5);
    S.diary.push({id:id,date:date,profileId:pid,name:label||f.name,detail:qty+' '+unit,icon:'🥤',servings:1,recipeServings:1,nutrition:n,status:'eaten',note:'',consumption:c});
    return{id:id,jobs:[{items:items}],changed:true,n:n};
  };
  C.removeEntry=function(S,id){var e=(S.diary||[]).find(function(x){return x.id===id});if(!e)return false;if(C.statusOf(e)==='eaten')C.applyConsumption(S,e.consumption||[],1);S.diary=S.diary.filter(function(x){return x.id!==id});return true};
  C.setNote=function(S,id,note){var e=(S.diary||[]).find(function(x){return x.id===id});if(!e)return false;e.note=String(note||'').slice(0,200);return true};

  /* ---- Grocery stock (port of Diet's trackPantryConsumption) ---- */
  var UNIT_BASE={g:1,kg:1000,oz:28.3495,lb:453.592,ml:1,l:1000,gallon:3785.41,piece:1};
  var KIND={g:'g',kg:'g',oz:'g',lb:'g',ml:'ml',l:'ml',gallon:'ml',piece:'piece'};
  function pStatus(onHand,full){var r=full>0?Math.max(0,onHand||0)/full:0;if(r<=0)return'finished';if(r<=.15)return'low';if(r<=.4)return'25';if(r<=.65)return'half';if(r<=.9)return'75';return'full'}
  function pFull(onHand,pkg){pkg=pkg||1;return Math.max(pkg,Math.ceil(Math.max(0,onHand||0)/pkg)*pkg)}
  function toPurchase(unit,qty,p){
    if(!p)return null;var kind=KIND[p.purchaseUnit],base=null;
    if(p.servingUnit===unit)base=qty*(p.servingSize||1);else if(UNIT_BASE[unit]!=null&&KIND[unit]===kind)base=qty*UNIT_BASE[unit];
    if(base==null)return null;var per=UNIT_BASE[p.purchaseUnit];if(per==null)return null;return base/per;
  }
  /* counts how often each Grocery-linked food is used (Diet's "pantryUsage") — call on the state you are about to save */
  C.trackUsage=function(S,jobs){
    S.pantryUsage=S.pantryUsage||{};
    (jobs||[]).forEach(function(r){(r.items||[]).forEach(function(it){var f=C.food(S,it.foodId);if(f&&f.groceryProductId&&it.qty>0)S.pantryUsage[f.groceryProductId]=(S.pantryUsage[f.groceryProductId]||0)+1})});
  };
  /* writes Grocery's stock; pass its two document refs. Returns the products that just ran low */
  C.trackGrocery=async function(S,jobs,gref,date){
    var touched={};
    (jobs||[]).forEach(function(r){(r.items||[]).forEach(function(it){var f=C.food(S,it.foodId);if(!f||!f.groceryProductId)return;(touched[f.groceryProductId]=touched[f.groceryProductId]||[]).push({unit:it.unit,qty:it.qty})})});
    var ids=Object.keys(touched);if(!ids.length)return{low:[]};
    var snap=await gref('modernState').get();if(!snap.exists||!snap.data().json)return{low:[],skipped:true};
    var g=JSON.parse(snap.data().json);g.inventory=g.inventory||{};var low=[];
    ids.forEach(function(pid){
      var p=(g.products||[]).find(function(x){return x.id===pid});if(!p||!g.inventory[pid])return;
      var inv=g.inventory[pid],used=0,unk=false;
      touched[pid].forEach(function(it){var c=toPurchase(it.unit,it.qty,p);if(c==null){unk=true;return}used+=c});
      if(unk&&!used)used=(p.purchaseQty||1)*0.15;
      inv.onHand=Math.max(0,(inv.onHand||0)-used);inv.status=pStatus(inv.onHand,pFull(inv.onHand,p.purchaseQty||1));
      if(used>0){g.stockLog=g.stockLog||[];g.stockLog.push({pid:pid,date:date,delta:Math.round(used*1000)/1000});var cut=C.addDays(date,-60);g.stockLog=g.stockLog.filter(function(e){return e.date>=cut})}
      if(inv.status==='low'||inv.status==='finished')low.push({id:pid,name:p.name});
    });
    await gref('modernState').set({json:JSON.stringify(g)},{merge:true});
    await gref('inventory').set({json:JSON.stringify(g.inventory)},{merge:true});
    return{low:low};
  };

  /* ---- is something the next meal needs running out? (reads Grocery's pantry) ---- */
  C.pantryCheck=function(S,rows,groc){
    var out={};
    if(!groc||!groc.inventory)return out;
    rows.forEach(function(r){
      if(r.status!=='planned'||!r.meal)return;
      var rs=C.recipesForMeal(S,r.meal),bad=[];
      rs.forEach(function(rc){(rc.items||[]).forEach(function(it){
        var f=C.food(S,it.foodId);if(!f||!f.groceryProductId)return;
        var inv=groc.inventory[f.groceryProductId];if(!inv)return;
        var st=inv.status;if(st==='finished'||st==='low'){var p=(groc.products||[]).find(function(x){return x.id===f.groceryProductId});var nm=(p&&p.name)||f.name;if(!bad.some(function(b){return b.name===nm}))bad.push({name:nm,status:st})}
      })});
      if(bad.length)out[r.key]=bad;
    });
    return out;
  };

  /* ---- week, streak, flex bank ---- */
  C.dayStat=function(S,pid,date){
    var d=C.dayRows(S,pid,date),eaten=d.rows.filter(function(r){return r.status==='eaten'}).length+d.extras.length;
    var t=C.totals(S,pid,date),g=C.goals(S,pid).goals;
    var state=!eaten?'none':(t.calories<g.calories*0.88)?'under':(t.calories>g.calories*1.06)?'over':'ok';
    return{kcal:t.calories,protein:t.protein,eaten:eaten,state:state,proteinOk:eaten>0&&t.protein>=g.protein*0.9,t:t};
  };
  C.week=function(S,pid,date){var out=[];for(var i=6;i>=0;i--){var d=C.addDays(date,-i);out.push(Object.assign({date:d},C.dayStat(S,pid,d)))}return out};
  C.streak=function(S,pid,today){
    var n=0,d=today,st=C.dayStat(S,pid,d);
    if(!(st.eaten>0&&st.proteinOk))d=C.addDays(d,-1);      // today still open: do not break the streak yet
    for(var i=0;i<120;i++){var s=C.dayStat(S,pid,d);if(s.eaten>0&&s.proteinOk){n++;d=C.addDays(d,-1)}else break}
    return n;
  };
  C.monday=function(date){var d=new Date(date+'T12:00:00'),wd=(d.getDay()+6)%7;return C.addDays(date,-wd)};
  /* weekly calories: Monday to Sunday. Days with nothing logged count as on plan, so a forgotten day never inflates the bank. */
  C.flex=function(S,pid,today){
    var g=C.goals(S,pid).goals,mon=C.monday(today),days=[],spent=0,planned=0;
    for(var i=0;i<7;i++){var d=C.addDays(mon,i);days.push(d)}
    var done=days.filter(function(d){return d<today}),left=7-done.length,bank=0;
    done.forEach(function(d){var s=C.dayStat(S,pid,d);bank+=s.eaten>0?g.calories-s.kcal:0;spent+=s.eaten>0?s.kcal:g.calories});
    var todayKcal=C.dayStat(S,pid,today).kcal,budget=g.calories*7-spent;
    return{bank:Math.round(bank),weekGoal:g.calories*7,doneDays:done.length,todayCap:Math.round(budget/left),eatenToday:Math.round(todayKcal),leftDays:left};
  };

  /* ---- energy: burned (baseline + Gym workouts) vs eaten ---- */
  var ACT={desk:1.2,onfeet:1.35,active:1.5};
  C.ageFrom=function(b){if(!b)return null;var d=new Date(b+'T12:00:00'),n=new Date(),a=n.getFullYear()-d.getFullYear();if(n.getMonth()<d.getMonth()||(n.getMonth()===d.getMonth()&&n.getDate()<d.getDate()))a--;return a>0&&a<120?a:null};
  C.bmr=function(st,kg){var age=C.ageFrom(st&&st.birthdate);if(!st||!st.heightCm||!age||!st.sex||!kg)return null;var base=10*kg+6.25*st.heightCm-5*age;return Math.round(st.sex==='female'?base-161:base+5)};
  C.liftKcal=function(sec,kg){return(!sec||!kg)?0:Math.round(4*kg*(sec/3600))};
  var METS={run:10,cycle:7,elliptical:5,stairmaster:8,rowing:7,'jump rope':11,swimming:7,sports:6,treadmill:6};
  C.cardioKcal=function(entries,kg){
    var total=0;
    (entries||[]).forEach(function(e){
      var segs=Array.isArray(e.segments)&&e.segments.length?e.segments:[{machine:e.machine,duration:e.duration}];
      segs.forEach(function(s){
        if(e.activeCal){total+=e.activeCal/segs.length;return}
        var m=(s.machine||'').toLowerCase(),mets=5;Object.keys(METS).forEach(function(k){if(m.indexOf(k)!==-1)mets=METS[k]});
        total+=(mets-1)*kg*((s.duration||0)/60);
      });
    });
    return Math.round(total);
  };
  C.energy=function(stats,kg,cardioEntries,liftSec,eaten){
    var bmr=C.bmr(stats,kg);if(!bmr)return null;
    var neat=Math.round(bmr*(ACT[stats.activityLevel]||ACT.onfeet)),ex=C.cardioKcal(cardioEntries,kg)+C.liftKcal(liftSec,kg);
    return{neat:neat,exercise:ex,burned:neat+ex,eaten:Math.round(eaten),net:Math.round(eaten)-(neat+ex)};
  };
  window.DietCore=C;
})();

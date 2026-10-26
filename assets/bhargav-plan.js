/* Bhargav's five-phase plan (26 Oct 2026 -> 15 Apr 2027).
   ONE shared source for Gym (workouts, warm-ups, phases, targets) and Diet (menus, goals).
   Dates before EFFECTIVE keep using the original plan, so nothing logged earlier changes.
   Exercise NAMES are kept identical to the original plan wherever the machine is the same, because
   Gym matches "last time", records and the strength chart by name. */
(function(){
  var EFFECTIVE='2026-10-26', END='2027-04-15';
  var DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

  /* ---------------- phases ---------------- */
  var PHASES=[
    {n:1,name:'Foundation',short:'Foundation and calibration',start:'2026-10-26',end:'2026-11-22',cal:1720,protein:154,carbs:165,fat:49,
      weight:'91.5–92.5 kg',loss:'about 2.5–3.5 kg',purpose:'Technique, joint tolerance and starting-weight calibration',
      effort:'About 3 reps in reserve in week 1, 2 by week 4',cardio:'25 min',steps:'9,000 rising to 12,000 (week 1: 9–10k, week 2: 10–11k, weeks 3–4: 11–12k)',
      training:'3 reps in reserve to start, no sets to failure; add reps first, load only after the top of the range is hit twice'},
    {n:2,name:'Hypertrophy',short:'Hypertrophy and progressive overload',start:'2026-11-23',end:'2027-01-03',cal:1700,protein:154,carbs:160,fat:49,
      weight:'86.5–88.5 kg',loss:'about 4–5 kg',purpose:'Build muscle through greater productive volume',
      effort:'Usually 1–2 reps in reserve',cardio:'20–25 min',steps:'11,000–13,000',
      training:'More working sets; 1–2 reps in reserve',keepNote:'Keep Phase 1 calories if you are already losing more than 0.9 kg a week.'},
    {n:3,name:'Strength',short:'Strength and muscle density',start:'2027-01-04',end:'2027-02-14',cal:1680,protein:155,carbs:150,fat:51,
      weight:'82–84.5 kg',loss:'',purpose:'Preserve/build strength and create denser-looking muscle',
      effort:'Top sets at 1–2 reps in reserve',cardio:'20–25 min',steps:'12,000–14,000',
      training:'One top set then back-off sets on the big lifts'},
    {n:4,name:'Definition',short:'Definition and muscle retention',start:'2027-02-15',end:'2027-03-21',cal:1650,protein:155,carbs:145,fat:50,
      weight:'78–80.5 kg',loss:'',purpose:'Retain muscle while waist and lower abdominal fat decrease',
      effort:'Heavy enough to preserve strength, with less total volume',cardio:'25 min',steps:'12,000–15,000 if recovery permits',
      training:'Top sets stay, total volume comes down'},
    {n:5,name:'Final cut',short:'Final cut and taper',start:'2027-03-22',end:'2027-04-15',cal:1650,protein:155,carbs:145,fat:50,
      weight:'75–77.5 kg',loss:'',purpose:'Complete fat loss while retaining muscle fullness and strength',
      effort:'Top sets at 1–2 reps in reserve until the taper',cardio:'25 min',steps:'12,000–15,000, easing off in the taper',
      training:'No new exercises or extreme techniques'}
  ];
  /* deload weeks (half the sets, load -10-15%, 4+ reps in reserve) and the final taper */
  var DELOADS=[
    {start:'2026-12-28',end:'2027-01-03',label:'Phase 2 deload',taper:false},
    {start:'2027-02-08',end:'2027-02-14',label:'Phase 3 deload',taper:false},
    {start:'2027-03-15',end:'2027-03-21',label:'Phase 4 deload',taper:false},
    {start:'2027-04-12',end:'2027-04-15',label:'Final taper',taper:true}
  ];

  /* ---------------- exercise catalogue ---------------- */
  var CAT={
    chest:['Converging chest press','Chest press','Shoulders down; controlled press'],
    incl:['Incline chest press','Incline press','Smooth full range; shoulders down'],
    fly:['Pec fly','Rear delt / pec fly','Do not overstretch shoulders'],
    shp:['Converging shoulder press','Shoulder press','Ribs down; no back arch'],
    lat:['Lateral raise','Lateral raise','Lead with elbows'],
    dip:['Seated dip','Seated dip','Elbows track back'],
    tri:['Cable triceps extension','Cable column','Upper arms remain still'],
    abs:['Abdominal crunch','Ab crunch','Curl ribs toward pelvis'],
    pallof:['Pallof press','Cable column','Resist rotation; each side'],
    pull:['Diverging lat pulldown','Lat pulldown','Pull elbows toward hips'],
    row:['Diverging low row','Low row','Pause with shoulder blades back'],
    straight:['Straight-arm pulldown','Cable column','Keep arms nearly straight'],
    rear:['Rear-delt fly','Rear delt / pec fly','Move from rear shoulders'],
    curl:['Biceps curl','Biceps curl','Do not lift elbows'],
    hammer:['Hammer curl','Dumbbells','Neutral grip; no swinging'],
    bext:['Back extension','Back extension','Stop at neutral spine'],
    shrug:['Shrug','Machine or dumbbells','Lift straight up; no rolling'],
    lp:['Leg press','Leg press','Pain-free depth; start only if the knee feels comfortable; stop above 2/10 discomfort'],
    lext:['Leg extension','Leg extension','Controlled range; no kicking'],
    lcurl:['Seated leg curl','Leg curl','Keep hips down'],
    glute:['Glute extension','Glute extension','Each leg; squeeze glute'],
    inner:['Inner thigh','Inner thigh','Slow return'],
    outer:['Outer thigh','Outer thigh','No bouncing'],
    scalf:['Seated calf extension','Calf extension','Full stretch and pause'],
    stcalf:['Standing calf raise','Standing calf raise','Full stretch; pause at the top'],
    prone:['Prone leg curl','Prone leg curl','Keep hips against pad']
  };
  var DSHORT={Monday:'mon',Wednesday:'wed',Thursday:'thu',Friday:'fri',Sunday:'sun'};
  /* X(key, sets, repMin, repMax, restSec [, {top:[a,b], back:[sets,a,b], drop:'5-10%'}]) */
  function X(key,sets,a,b,rest,extra){return Object.assign({key:key,sets:sets,a:a,b:b,rest:rest},extra||{})}
  function TOP(key,t1,t2,backSets,b1,b2,rest,drop){return X(key,1+backSets,t1,t2,rest,{top:[t1,t2],back:[backSets,b1,b2],drop:drop})}

  /* Per phase, per day. Rests are the midpoints of the plan's ranges. */
  var W={
   1:{
    Monday:[X('chest',3,8,12,90),X('fly',3,10,15,70),X('shp',3,8,12,90),X('lat',3,12,15,60),X('dip',2,8,12,75),X('tri',2,10,15,60),X('abs',3,10,15,60)],
    Wednesday:[X('pull',3,8,12,90),X('row',3,8,12,90),X('straight',2,10,15,60),X('rear',3,12,15,60),X('curl',3,10,15,70),X('bext',2,10,15,60)],
    Thursday:[X('lp',3,8,12,105),X('lext',3,10,15,75),X('lcurl',3,8,12,75),X('glute',3,10,15,60),X('inner',2,12,20,60),X('outer',2,12,20,60),X('scalf',3,10,15,60)],
    Friday:[X('incl',3,8,12,90),X('row',3,8,12,90),X('pull',2,8,12,90),X('lat',3,12,15,60),X('rear',2,12,15,60),X('tri',2,10,15,60),X('abs',3,10,15,60),X('pallof',2,10,12,50)],
    Sunday:[X('prone',4,8,12,75),X('lp',3,10,15,90),X('lext',2,10,15,75),X('glute',2,10,15,60),X('stcalf',3,12,20,60),X('curl',3,8,12,70)]
   },
   2:{
    Monday:[X('chest',4,6,10,105),X('fly',3,10,15,70),X('shp',3,8,12,90),X('lat',4,12,15,60),X('dip',3,8,12,80),X('tri',2,10,15,60),X('abs',3,10,15,60)],
    Wednesday:[X('pull',4,6,10,105),X('row',4,8,12,90),X('straight',3,10,15,70),X('rear',3,12,15,60),X('curl',3,8,12,70),X('bext',3,10,15,70)],
    Thursday:[X('lp',4,8,12,105),X('lext',3,10,15,75),X('lcurl',4,8,12,80),X('glute',3,10,15,60),X('inner',2,12,20,60),X('outer',2,12,20,60),X('scalf',4,10,15,70)],
    Friday:[X('incl',3,8,12,90),X('row',3,8,12,90),X('pull',3,8,12,90),X('lat',3,12,15,60),X('rear',3,12,15,60),X('tri',2,10,15,60),X('abs',3,10,15,60),X('pallof',2,10,12,50)],
    Sunday:[X('prone',4,8,12,75),X('lp',3,10,15,90),X('lext',3,10,15,75),X('glute',3,10,15,60),X('stcalf',4,10,15,60),X('curl',3,8,12,70)]
   },
   3:{
    Monday:[TOP('chest',6,8,3,8,10,105,'5–10%'),X('fly',3,10,15,70),X('shp',3,6,10,90),X('lat',4,12,15,60),X('dip',3,8,12,80),X('tri',2,10,15,60),X('abs',3,10,15,60)],
    Wednesday:[TOP('pull',6,8,3,8,10,105,'5–10%'),X('row',4,6,10,90),X('straight',3,10,15,70),X('rear',3,12,15,60),X('shrug',3,10,15,60),X('curl',3,8,12,70),X('bext',2,10,15,60)],
    Thursday:[TOP('lp',8,10,3,10,12,105,'10–15%'),X('lext',3,10,15,75),X('lcurl',4,8,12,80),X('glute',3,10,15,60),X('inner',2,12,20,60),X('outer',2,12,20,60),X('scalf',4,10,15,70)],
    Friday:[X('incl',3,6,10,90),X('row',3,6,10,90),X('pull',3,8,12,90),X('lat',3,12,15,60),X('rear',3,12,15,60),X('tri',2,10,15,60),X('abs',3,10,15,60),X('pallof',2,10,12,50)],
    Sunday:[X('prone',4,8,12,75),X('lp',3,10,15,90),X('lext',3,10,15,75),X('glute',3,10,15,60),X('stcalf',4,10,15,60),X('curl',3,8,12,70),X('hammer',2,10,15,60)]
   },
   4:{
    Monday:[TOP('chest',6,8,2,8,10,105,'5–10%'),X('fly',2,10,15,70),X('shp',3,8,12,90),X('lat',3,12,15,60),X('dip',2,8,12,80),X('tri',2,10,15,60),X('abs',3,10,15,60)],
    Wednesday:[TOP('pull',6,8,2,8,10,105,'5–10%'),X('row',3,8,12,90),X('straight',2,10,15,70),X('rear',3,12,15,60),X('shrug',2,10,15,60),X('curl',3,8,12,70),X('bext',2,10,15,60)],
    Thursday:[TOP('lp',8,10,2,10,12,105,'10–15%'),X('lext',3,10,15,75),X('lcurl',4,8,12,80),X('glute',3,10,15,60),X('inner',2,12,20,60),X('outer',2,12,20,60),X('scalf',3,10,15,70)],
    Friday:[X('incl',3,8,12,90),X('row',3,8,12,90),X('pull',2,8,12,90),X('lat',3,12,15,60),X('rear',2,12,15,60),X('tri',2,10,15,60),X('abs',3,10,15,60),X('pallof',2,10,12,50)],
    Sunday:[X('prone',3,8,12,75),X('lp',3,10,15,90),X('lext',2,10,15,75),X('glute',2,10,15,60),X('stcalf',3,10,15,60),X('curl',3,8,12,70),X('hammer',2,10,15,60)]
   },
   5:{
    Monday:[TOP('chest',6,8,2,8,10,105,'5–10%'),X('fly',2,10,15,70),X('shp',2,8,12,90),X('lat',3,12,15,60),X('dip',2,8,12,80),X('tri',2,10,15,60),X('abs',3,10,15,60)],
    Wednesday:[TOP('pull',6,8,2,8,10,105,'5–10%'),X('row',3,8,12,90),X('straight',2,10,15,70),X('rear',2,12,15,60),X('shrug',2,10,15,60),X('curl',2,8,12,70),X('bext',2,10,15,60)],
    Thursday:[TOP('lp',8,10,2,10,12,105,'10–15%'),X('lext',2,10,15,75),X('lcurl',3,8,12,80),X('glute',2,10,15,60),X('inner',2,12,20,60),X('outer',2,12,20,60),X('scalf',3,10,15,70)],
    Friday:[X('incl',2,8,12,90),X('row',2,8,12,90),X('pull',2,8,12,90),X('lat',3,12,15,60),X('rear',2,12,15,60),X('tri',2,10,15,60),X('abs',3,10,15,60),X('pallof',2,10,12,50)],
    Sunday:[X('prone',3,8,12,75),X('lp',2,10,15,90),X('lext',2,10,15,75),X('glute',2,10,15,60),X('stcalf',3,10,15,60),X('curl',3,8,12,70),X('hammer',2,10,15,60)]
   }
  };

  /* ---------------- week shape per phase ---------------- */
  function cardioText(day,ph,deload){
    var m=deload?'15–20 min easy':ph.cardio;
    var kind={Monday:'Incline treadmill',Wednesday:'Moderate cardio',Thursday:'Bicycle / low-incline treadmill',Friday:'Cardio',Sunday:'Cardio'}[day];
    return kind+' · '+m;
  }
  function weekSchedule(ph,deload){
    var legsB=ph.n<=2?'Legs B + Biceps':'Legs B + Arms';
    return {
      Monday:{main:'Push + Abs',cardio:cardioText('Monday',ph,deload),purpose:'Chest, shoulders, triceps, abs',status:'Train'},
      Tuesday:{main:'Rest',cardio:'No compulsory cardio',purpose:'Complete recovery',status:'Holiday'},
      Wednesday:{main:'Pull',cardio:cardioText('Wednesday',ph,deload),purpose:'Back, rear delts, biceps',status:'Train'},
      Thursday:{main:'Legs A',cardio:cardioText('Thursday',ph,deload),purpose:'Quads, hamstrings, glutes, calves',status:'Train'},
      Friday:{main:'Upper + Core',cardio:cardioText('Friday',ph,deload),purpose:'Upper-body specialization + core',status:'Train'},
      Saturday:{main:'Active recovery',cardio:'30–40 min easy walking or cycling + mobility',purpose:'Circulation and mobility',status:'No lifting'},
      Sunday:{main:legsB,cardio:cardioText('Sunday',ph,deload),purpose:'Second leg exposure + '+(ph.n<=2?'biceps':'arms'),status:'Train'}
    };
  }

  /* ---------------- warm-ups ---------------- */
  var WARM={
    Monday:['Arm swings: 15 forward/backward','Shoulder circles: 10 each direction','Scapular push-ups: 10','Wall slides: 10','Incline push-ups: 8–10','Light dumbbell lateral raises: 10','Chest-press preparation: very light x12, moderate x6–8, near working weight x3–5 if needed, then rest 60 sec'],
    Wednesday:['Cat-cow: 8','Thoracic rotations: 8 each side','Shoulder-blade squeezes: 12','Light one-arm dumbbell rows: 10 each side','Light reverse fly: 10','Bird dog: 6 each side','Pulldown preparation: very light x12, moderate x6–8, near working weight x3–5 (Phases 3–5)'],
    Thursday:['Ankle rocks: 10 each ankle','Hip circles: 8 each direction','Chair squats: 10','Glute bridges: 12','Bodyweight good mornings: 10','Standing calf raises: 15','Straight-leg raises: 8 each leg','Leg-press preparation: empty/light carriage x12–15, about 50% of working load x8, about 70% x4–5. Start working sets only if the knee feels comfortable'],
    Friday:['Arm swings: 15','Wall slides: 10','Scapular push-ups: 8','Light dumbbell row: 10 each side','Reverse fly: 10','Lateral raise: 10','Incline push-ups: 8','Incline-press preparation: 12 light reps and 6–8 moderate reps'],
    Sunday:['Ankle rocks: 10 each','Hamstring sweeps: 8 each side','Bodyweight good mornings: 12','Glute bridges: 12','Chair squats: 10','Calf raises: 15','Very light dumbbell curls: 8–10','Leg-curl preparation: 12 light reps and 6–8 moderate reps']
  };
  var COOL={
    Monday:'Chest doorway stretch, shoulder stretch, triceps stretch',
    Wednesday:'Lat stretch, upper-back stretch, biceps stretch',
    Thursday:'Quadriceps, hamstring, calf and hip-flexor stretches',
    Friday:'Chest, lats, shoulders and thoracic rotation',
    Sunday:'Hamstrings, quadriceps, glutes, calves and biceps'
  };

  /* ---------------- helpers ---------------- */
  function pad(n){return (n<10?'0':'')+n}
  function addDays(d,k){var t=new Date(d+'T00:00:00');t.setDate(t.getDate()+k);return t.getFullYear()+'-'+pad(t.getMonth()+1)+'-'+pad(t.getDate())}
  function phaseFor(date){
    if(!date||date<EFFECTIVE) return null;
    for(var i=0;i<PHASES.length;i++) if(date>=PHASES[i].start&&date<=PHASES[i].end) return PHASES[i];
    return date>END?PHASES[PHASES.length-1]:null;
  }
  function deloadFor(date){for(var i=0;i<DELOADS.length;i++) if(date>=DELOADS[i].start&&date<=DELOADS[i].end) return DELOADS[i];return null}
  function active(date){return !!date&&date>=EFFECTIVE}

  function buildExercise(day,spec,deload){
    var c=CAT[spec.key],ex={id:'n-'+DSHORT[day]+'-'+spec.key,name:c[0],equip:c[1],cue:c[2],rest:spec.rest,repUnit:'reps'};
    var sets=spec.sets,a=spec.a,b=spec.b,planText=null,topSet=false;
    if(spec.top){
      if(deload){
        sets=Math.max(1,Math.ceil(sets/2));a=spec.back[1];b=spec.back[2];
      }else{
        topSet=true;
        planText='1 top set of '+spec.top[0]+'–'+spec.top[1]+', then '+spec.back[0]+' back-off sets of '+spec.back[1]+'–'+spec.back[2]+' (drop the weight '+spec.drop+')';
      }
    }else if(deload){sets=Math.max(1,Math.ceil(sets/2))}
    ex.sets=sets;ex.repMin=a;ex.repMax=b;
    if(topSet){ex.topSet=true;ex.planText=planText;ex.backSets=spec.back[0];ex.topReps=spec.top.join('–');ex.backReps=spec.back[1]+'–'+spec.back[2]}
    if(deload){
      ex.rest=Math.min(ex.rest,75);
      ex.planText=sets+' sets × '+a+'–'+b+' reps · '+(deload.taper?'taper: weights 10–15% lighter, 3–4 reps in reserve':'deload: weights 10–15% lighter, 4+ reps in reserve');
    }
    return ex;
  }
  var cache={};
  function resolve(date){
    var ph=phaseFor(date);if(!ph) return null;
    var dl=deloadFor(date),key=ph.n+'|'+(dl?dl.start:'-');
    if(cache[key]) return cache[key];
    var workouts={};
    DAYS.forEach(function(d){
      workouts[d]=(W[ph.n][d]||[]).map(function(s){return buildExercise(d,s,dl)});
    });
    cache[key]={phase:ph,deload:dl,workouts:workouts,weekSchedule:weekSchedule(ph,!!dl),restDayNotes:{Tuesday:'Complete rest day',Saturday:'Active recovery day'}};
    return cache[key];
  }
  /* every exercise ever programmed (all phases) - used for lists that span the whole plan */
  function allWorkouts(){
    var out={};DAYS.forEach(function(d){out[d]=[]});
    [1,2,3,4,5].forEach(function(n){var r=resolve(PHASES[n-1].start);DAYS.forEach(function(d){r.workouts[d].forEach(function(e){if(!out[d].some(function(x){return x.name===e.name}))out[d].push(e)})})});
    return out;
  }

  /* ---------------- Surya Namaskar + warm-up for a date ----------------
     sessionIndex = which lifting session this is since 26 Oct (1-based). Tuesday and Saturday do not count. */
  function suryaFor(date,sessionIndex){
    var ph=phaseFor(date);if(!ph) return null;
    var dl=deloadFor(date);
    if(dl&&dl.taper) return {rounds:'2–3',note:'relaxed rounds'};
    if(dl) return {rounds:'4',note:'relaxed rounds (deload)'};
    if(ph.n===1){
      var n=Math.max(1,sessionIndex||1),r=n<=2?2:n<=4?3:n<=6?4:n<=8?5:6;
      return {rounds:String(r),note:'session '+n+' of the build-up to 6 rounds'};
    }
    if(ph.n===5&&date>='2027-04-05'&&date<='2027-04-11') return {rounds:'4',note:'reduced rounds'};
    return {rounds:'6',note:''};
  }
  function prepNote(date){
    var ph=phaseFor(date),dl=deloadFor(date);if(!ph) return '';
    if(dl&&dl.taper) return 'Short activation sequence. No top sets, no strenuous conditioning.';
    if(dl) return 'Deload: light preparation sets only; nothing close to failure.';
    if(ph.n===1) return 'Preparation sets before the first exercise: very light, then moderate, then near working weight when needed.';
    if(ph.n===2) return 'Two preparation sets before most first exercises; three before a heavy leg press. Warm-ups never approach failure.';
    if(ph.n===3) return 'Three preparation sets before every top set: light x10–12, moderate x5–6, near working load x2–3.';
    if(ph.n===4) return 'Three preparation sets for top-set lifts; one light preparation set for straight-set lifts if needed. Do not stretch the warm-up into an extra workout.';
    if(date>='2027-04-05'&&date<='2027-04-11') return 'Two preparation sets before the main exercise. Activation exercises: one set each.';
    return 'Three preparation sets for the main top-set exercise.';
  }
  function warmupFor(date,day,sessionIndex){
    var ph=phaseFor(date);if(!ph||!WARM[day]) return null;
    var dl=deloadFor(date),sn=suryaFor(date,sessionIndex),items=WARM[day].slice();
    if(dl&&dl.taper) items=items.slice(0,4);
    return {rounds:sn.rounds,roundsNote:sn.note,items:items,prep:prepNote(date),cool:COOL[day]||'',coolNote:'Hold each stretch about 20–30 seconds without bouncing, then finish with 2–3 minutes of slow breathing.'};
  }

  /* ---------------- decision rule shown in the roadmap ---------------- */
  var RULES=[
    {step:'Losing 0.5–0.9 kg/week, strength stable',def:'Review the 7-day average weight every Sunday (look at the previous 14 days)',cal:'Keep calories unchanged',hold:'—',reason:'On track'},
    {step:'Losing more than 0.9 kg/week for two weeks',def:'Too fast for your liver and for muscle',cal:'Add 100–150 kcal, mainly carbohydrates',hold:'14 days',reason:'Protect muscle'},
    {step:'Under 0.3 kg/week, adherence under 85%',def:'The plan has not really been followed yet',cal:'Fix adherence; do not reduce calories',hold:'14 days',reason:'Cutting further solves nothing'},
    {step:'Under 0.3 kg/week, adherence 85% or more',def:'Real plateau',cal:'Reduce by about 75–100 kcal',hold:'14 days',reason:'Smallest useful change'},
    {step:'Strength, sleep and energy falling together',def:'Recovery is the limit',cal:'Add 100 kcal or cut cardio for a while',hold:'7–14 days',reason:'Muscle comes first'},
    {step:'Dizziness, persistent exhaustion or unusual symptoms',def:'Stop the aggressive cut',cal:'Contact a clinician',hold:'—',reason:'Never go below about 1,600 kcal without a physician or dietitian'}
  ];

  /* ---------------- diet menus (solved against the Diet app's own food values) ---------------- */
  var MENUS={"1":{"oats":[{"foodId":"oats","qty":45,"unit":"g"},{"foodId":"milk","qty":50,"unit":"ml"},{"foodId":"flax","qty":5,"unit":"g"}],"eggs":[{"foodId":"egg","qty":2,"unit":"piece"},{"foodId":"eggwhite","qty":4,"unit":"piece"},{"foodId":"salt","qty":1,"unit":"g"},{"foodId":"chili","qty":0.5,"unit":"g"},{"foodId":"chatmasala","qty":1,"unit":"g"}],"riceyog":[{"foodId":"rice","qty":170,"unit":"g"},{"foodId":"yogurt","qty":200,"unit":"g"}],"lsalad":[{"foodId":"salad","qty":50,"unit":"g"},{"foodId":"lemon","qty":0.5,"unit":"piece"},{"foodId":"salt","qty":1,"unit":"g"},{"foodId":"chili","qty":0.5,"unit":"g"}],"paneer":[{"foodId":"paneer","qty":50,"unit":"g"},{"foodId":"eggwhite","qty":4,"unit":"piece"}],"dal":[{"foodId":"lentils","qty":100,"unit":"g"},{"foodId":"rice","qty":60,"unit":"g"}],"dsalad":[{"foodId":"salad","qty":75,"unit":"g"}],"tot":{"cal":1720,"p":154,"f":49}},"2":{"oats":[{"foodId":"oats","qty":40,"unit":"g"},{"foodId":"milk","qty":150,"unit":"ml"},{"foodId":"flax","qty":5,"unit":"g"},{"foodId":"whey","qty":0.5,"unit":"scoop"}],"eggs":[{"foodId":"egg","qty":1,"unit":"piece"},{"foodId":"eggwhite","qty":2,"unit":"piece"},{"foodId":"salt","qty":1,"unit":"g"},{"foodId":"chili","qty":0.5,"unit":"g"},{"foodId":"chatmasala","qty":1,"unit":"g"}],"riceyog":[{"foodId":"rice","qty":130,"unit":"g"},{"foodId":"yogurt","qty":200,"unit":"g"},{"foodId":"milk","qty":20,"unit":"ml"}],"lsalad":[{"foodId":"salad","qty":71,"unit":"g"},{"foodId":"lemon","qty":0.5,"unit":"piece"},{"foodId":"salt","qty":1,"unit":"g"},{"foodId":"chili","qty":0.5,"unit":"g"}],"paneer":[{"foodId":"paneer","qty":60,"unit":"g"},{"foodId":"eggwhite","qty":2,"unit":"piece"}],"dal":[{"foodId":"lentils","qty":150,"unit":"g"},{"foodId":"rice","qty":50,"unit":"g"}],"dsalad":[{"foodId":"salad","qty":50,"unit":"g"}],"tot":{"cal":1700,"p":154,"f":49}},"3":{"oats":[{"foodId":"oats","qty":35,"unit":"g"},{"foodId":"milk","qty":150,"unit":"ml"}],"eggs":[{"foodId":"egg","qty":2,"unit":"piece"},{"foodId":"eggwhite","qty":4,"unit":"piece"},{"foodId":"salt","qty":1,"unit":"g"},{"foodId":"chili","qty":0.5,"unit":"g"},{"foodId":"chatmasala","qty":1,"unit":"g"}],"riceyog":[{"foodId":"rice","qty":180,"unit":"g"},{"foodId":"yogurt","qty":200,"unit":"g"}],"lsalad":[{"foodId":"salad","qty":50,"unit":"g"},{"foodId":"lemon","qty":0.5,"unit":"piece"},{"foodId":"salt","qty":1,"unit":"g"},{"foodId":"chili","qty":0.5,"unit":"g"}],"paneer":[{"foodId":"paneer","qty":50,"unit":"g"},{"foodId":"eggwhite","qty":4,"unit":"piece"}],"dal":[{"foodId":"lentils","qty":100,"unit":"g"}],"dsalad":[{"foodId":"salad","qty":100,"unit":"g"}],"tot":{"cal":1680,"p":155,"f":51}},"4":{"oats":[{"foodId":"oats","qty":35,"unit":"g"},{"foodId":"milk","qty":50,"unit":"ml"},{"foodId":"whey","qty":0.5,"unit":"scoop"},{"foodId":"banana","qty":55,"unit":"g"}],"eggs":[{"foodId":"egg","qty":1,"unit":"piece"},{"foodId":"eggwhite","qty":4,"unit":"piece"},{"foodId":"salt","qty":1,"unit":"g"},{"foodId":"chili","qty":0.5,"unit":"g"},{"foodId":"chatmasala","qty":1,"unit":"g"}],"riceyog":[{"foodId":"rice","qty":120,"unit":"g"},{"foodId":"yogurt","qty":200,"unit":"g"}],"lsalad":[{"foodId":"salad","qty":71,"unit":"g"},{"foodId":"lemon","qty":0.5,"unit":"piece"},{"foodId":"salt","qty":1,"unit":"g"},{"foodId":"chili","qty":0.5,"unit":"g"}],"paneer":[{"foodId":"paneer","qty":60,"unit":"g"},{"foodId":"eggwhite","qty":2,"unit":"piece"}],"dal":[{"foodId":"lentils","qty":125,"unit":"g"}],"dsalad":[{"foodId":"salad","qty":100,"unit":"g"}],"tot":{"cal":1650,"p":155,"f":50}},"5":{"oats":[{"foodId":"oats","qty":35,"unit":"g"},{"foodId":"milk","qty":50,"unit":"ml"},{"foodId":"whey","qty":0.5,"unit":"scoop"},{"foodId":"banana","qty":55,"unit":"g"}],"eggs":[{"foodId":"egg","qty":1,"unit":"piece"},{"foodId":"eggwhite","qty":4,"unit":"piece"},{"foodId":"salt","qty":1,"unit":"g"},{"foodId":"chili","qty":0.5,"unit":"g"},{"foodId":"chatmasala","qty":1,"unit":"g"}],"riceyog":[{"foodId":"rice","qty":120,"unit":"g"},{"foodId":"yogurt","qty":200,"unit":"g"}],"lsalad":[{"foodId":"salad","qty":71,"unit":"g"},{"foodId":"lemon","qty":0.5,"unit":"piece"},{"foodId":"salt","qty":1,"unit":"g"},{"foodId":"chili","qty":0.5,"unit":"g"}],"paneer":[{"foodId":"paneer","qty":60,"unit":"g"},{"foodId":"eggwhite","qty":2,"unit":"piece"}],"dal":[{"foodId":"lentils","qty":125,"unit":"g"}],"dsalad":[{"foodId":"salad","qty":100,"unit":"g"}],"tot":{"cal":1650,"p":155,"f":50}}};
  var MEAL_SPLIT=[
    {slot:'Post-workout',kcal:'60–120',protein:'12–24 g'},{slot:'Breakfast',kcal:'400–450',protein:'35–40 g'},
    {slot:'Lunch',kcal:'400–450',protein:'25–30 g'},{slot:'Snack',kcal:'150–200',protein:'12–24 g'},{slot:'Dinner',kcal:'500–550',protein:'40–50 g'}
  ];
  var RECIPE_FOR={'b-oats':'oats','b-eggs':'eggs','b-riceyog':'riceyog','b-lsalad':'lsalad','b-paneer':'paneer','b-dal':'dal','b-dsalad':'dsalad'};
  var RECIPE_TEXT={
    'b-paneer':{name:'Paneer and egg whites',method:'Cook the paneer and the boiled egg whites in a nonstick pan with calorie-free spices. No oil or ghee.'},
    'b-dal':{name:'Dal and rice bowl',method:'Heat the dal (and rice, when listed) with spices. No ghee or oil. Weigh rice and dal cooked.'},
    'b-oats':{method:'Microwave oats and milk for 90 seconds, then in 20–30 second bursts. Cool briefly, stir in the other items.'}
  };
  function clone(o){return JSON.parse(JSON.stringify(o))}

  /* OPT-IN ONLY. Nothing here runs by itself any more: Diet's "Phase menu" card calls these when you press a button.
     applyDietPhase swaps Bhargav's goals and his default recipes' amounts to the phase menu and first saves exactly
     what was there (state.bMenuBackup) so restoreDietMenu can put it back. Eaten/skipped/replaced entries and past days
     are never touched; only his unlogged auto-planned entries from today on are rebuilt. */
  var DEFAULT_RECIPES=Object.keys(RECIPE_FOR);
  function applyDietPhase(state,today){
    var ph=phaseFor(today)||PHASES[0];
    if(!state||!state.recipes||!state.meals) return false;
    var m=MENUS[ph.n];if(!m) return false;
    if(state.bPhaseApplied==null){ // back up only before the FIRST apply, so repeated applies never overwrite the original
      state.bMenuBackup={
        goals:clone((state.profiles&&state.profiles.bhargav&&state.profiles.bhargav.goals)||{}),
        recipes:state.recipes.filter(function(r){return DEFAULT_RECIPES.indexOf(r.id)!==-1}).map(clone),
        dinnerRule:(state.meals.find(function(x){return x.id==='b-dinner'})||{}).rule||''
      };
    }
    state.profiles=state.profiles||{};state.profiles.bhargav=state.profiles.bhargav||{name:'Bhargav'};
    state.profiles.bhargav.goals={calories:ph.cal,protein:ph.protein,carbs:ph.carbs,fat:ph.fat};
    DEFAULT_RECIPES.forEach(function(rid){
      var r=state.recipes.find(function(x){return x.id===rid});if(!r) return;
      r.items=clone(m[RECIPE_FOR[rid]]);
      var t=RECIPE_TEXT[rid];if(t){if(t.name)r.name=t.name;if(t.method)r.method=t.method}
    });
    var dinner=state.meals.find(function(x){return x.id==='b-dinner'});
    if(dinner) dinner.rule='Phase '+ph.n+' menu: '+ph.cal+' kcal and '+ph.protein+' g protein a day. Weigh rice, dal and yogurt as eaten.';
    rebuildPlanned(state,today);
    state.bPhaseApplied=ph.n;
    return true;
  }
  function rebuildPlanned(state,today){
    if(Array.isArray(state.diary)){
      state.diary=state.diary.filter(function(e){
        return !(e.profileId==='bhargav'&&e.date>=today&&e.status==='planned'&&!e.replaced&&e.mealId&&String(e.id).indexOf('d-plan-')===0);
      });
    }
    if(state.planSeeded){Object.keys(state.planSeeded).forEach(function(k){var p=k.split('|');if(p[0]==='bhargav'&&p[1]>=today) delete state.planSeeded[k]})}
  }
  /* Puts back what applyDietPhase replaced. If there is no backup (the menu was applied by the first version of this
     feature, which did not keep one), falls back to the app's original starting recipes/goals passed in as `seed`
     ({recipes:[...], goals:{...}, dinnerRule:'...'}). Returns 'backup' | 'seed' | false. */
  function restoreDietMenu(state,today,seed){
    if(!state||!state.recipes) return false;
    var src=null,how=false;
    if(state.bMenuBackup&&state.bMenuBackup.recipes&&state.bMenuBackup.recipes.length){src=state.bMenuBackup;how='backup'}
    else if(seed&&seed.recipes){src=seed;how='seed'}
    if(!src) return false;
    src.recipes.forEach(function(br){
      var r=state.recipes.find(function(x){return x.id===br.id});
      if(r){Object.keys(r).forEach(function(k){delete r[k]});Object.assign(r,clone(br))}
    });
    if(src.goals&&Object.keys(src.goals).length){state.profiles=state.profiles||{};state.profiles.bhargav=state.profiles.bhargav||{name:'Bhargav'};state.profiles.bhargav.goals=clone(src.goals)}
    var dinner=state.meals.find(function(x){return x.id==='b-dinner'});if(dinner&&src.dinnerRule!=null) dinner.rule=src.dinnerRule;
    rebuildPlanned(state,today);
    delete state.bPhaseApplied;delete state.bMenuBackup;
    return how;
  }
  function menuTotals(n,nut){ /* optional helper for tests: nut(items)->{cal,p,f,c} */
    var m=MENUS[n];if(!m||!nut) return null;
    var all=[].concat(m.oats,m.eggs,m.riceyog,m.lsalad,m.paneer,m.dal,m.dsalad,[{foodId:'whey',qty:2,unit:'scoop'},{foodId:'mandarin',qty:1,unit:'piece'}]);
    return nut(all);
  }

  window.BHARGAV_PLAN={
    effective:EFFECTIVE,end:END,startWeight:94.885,heightCm:173,targetLow:75,targetHigh:77,targetCentral:76,
    phases:PHASES,deloads:DELOADS,days:DAYS,rules:RULES,mealSplit:MEAL_SPLIT,menus:MENUS,
    active:active,phaseFor:phaseFor,deloadFor:deloadFor,resolve:resolve,allWorkouts:allWorkouts,
    suryaFor:suryaFor,warmupFor:warmupFor,applyDietPhase:applyDietPhase,restoreDietMenu:restoreDietMenu,menuTotals:menuTotals,addDays:addDays
  };
})();

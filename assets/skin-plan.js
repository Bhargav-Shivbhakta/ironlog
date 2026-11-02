/* Skin routine plan, shared so the Hub's Schedule widget shows the same steps as apps/schedule.html.
   KEEP IN SYNC with apps/schedule.html (SKIN_QTY ... skinStepDetails) and skin.html. */
(function(){
const pad2=n=>String(n).padStart(2,'0');
const weekdayOf=ds=>new Date(ds+'T12:00:00').getDay();
const todayStr=()=>{const d=new Date();return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())};
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
  {text:'Cleanser', qty:SKIN_QTY.cleanser},
  {text:'Moisturizer — face & neck', qty:SKIN_QTY.faceMoisturizer},
  {text:'Sunscreen — face, ears, neck', qty:SKIN_QTY.faceSunscreen},
  {text:'Body sunscreen on exposed areas (if leaving home)', qty:SKIN_QTY.bodySunscreen}
];
const SKIN_TREATMENTS = {
  regular: { label: 'Regular face routine', steps: [
    {text:'Cleanser', qty:SKIN_QTY.cleanser},
    {text:'Moisturizer — face & neck', qty:SKIN_QTY.faceMoisturizer}
  ]},
  differin: { label: 'Differin night', steps: [
    {text:'Cleanser', qty:SKIN_QTY.cleanser},
    {text:'Let face dry 15–20 minutes'},
    {text:'Thin layer of moisturizer'},
    {text:'Differin — entire face', qty:SKIN_QTY.differin},
    {text:'Another thin layer of moisturizer'}
  ]},
  azelaic: { label: 'Azelaic acid night', steps: [
    {text:'Cleanser', qty:SKIN_QTY.cleanser},
    {text:'Let skin dry completely'},
    {text:'Azelaic acid on uneven/pigmented areas', qty:SKIN_QTY.azelaic},
    {text:'Moisturizer after it absorbs', qty:SKIN_QTY.faceMoisturizer}
  ]},
  bha: { label: 'BHA night', steps: [
    {text:'Cleanser', qty:SKIN_QTY.cleanser},
    {text:'Paula’s Choice 2% BHA — nose, forehead, blackhead-prone areas', qty:SKIN_QTY.bha},
    {text:'Wait 5–10 minutes'},
    {text:'Moisturizer', qty:SKIN_QTY.faceMoisturizer}
  ]}
};
function skinBodyStepsFor(entry){
  if(entry.ceraveSA){
    return [
      {text:'Shower, lukewarm, 5–10 min; pat partially dry'},
      {text:'CeraVe SA on rough/bumpy arms', qty:SKIN_QTY.ceraveSAArms},
      {text:'CeraVe SA on rough/bumpy legs', qty:SKIN_QTY.ceraveSALegs},
      {text:'Eucerin on the rest of the body — within 3 minutes of showering'}
    ];
  }
  return [
    {text:'Shower, lukewarm, 5–10 min; pat partially dry'},
    {text:'Eucerin — both arms', qty:SKIN_QTY.eucerinArms},
    {text:'Eucerin — both legs', qty:SKIN_QTY.eucerinLegs},
    {text:'Eucerin — chest & stomach', qty:SKIN_QTY.eucerinChest},
    {text:'Eucerin — back', qty:SKIN_QTY.eucerinBack},
    {text:'Apply within 3 minutes of showering'}
  ];
}
function skinBuildDatePlan(){
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
const SKIN_DATE_PLAN = skinBuildDatePlan();
/* The plan is authored for an Oct 1 start. If the program start was moved in Skin, every date shifts by the same number of days (same rule as skin.html's rebuildProgramCalendar). */
let SKIN_OFFSET = 0;
const addDaysIso=function(ds,n){const d=new Date(ds+'T12:00:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())};
const planFor=function(ds){return SKIN_DATE_PLAN[SKIN_OFFSET?addDaysIso(ds,-SKIN_OFFSET):ds]};
function skinSetStart(start){const o=start?Math.round((new Date(start+'T12:00:00')-new Date('2026-10-01T12:00:00'))/86400000):0;const ch=o!==SKIN_OFFSET;SKIN_OFFSET=isFinite(o)?o:0;return ch}
const SKIN_ANUSHA_MORNING = [
  'Rinse with water — INKEY List Salicylic Acid Cleanser only if face is oily',
  'Tone: Anua Heartleaf 77 + Hyaluron Soothing Toner',
  'Brighten: INKEY List 15% Vitamin C + EGF Serum — 1–2 pumps',
  'Hydrate: Atomy Hydra Brightening Capsule Essence — 1–2 pumps',
  'Moisturize: Atomy Hydra Brightening Cream',
  'Broad-spectrum sunscreen SPF 30–50'
];
const SKIN_ANUSHA_NIGHT = [
  'Cleanse: INKEY List Salicylic Acid Cleanser',
  'Tone: Anua Heartleaf 77 + Hyaluron Soothing Toner',
  'Treat: Anua Azelaic Acid 10% Serum — 2–3 drops',
  'Hydrate: Atomy Hydra Brightening Capsule Essence — 1–2 pumps',
  'Moisturize: Anua Ceramide 3 + Panthenol Barrier Cream'
];
// Every valid section key per profile, for the link-picker checkboxes.
function skinSectionsForProfile(profile, dateStr){
  if(profile==='Bhargav'){
    const entry = planFor(dateStr || todayStr());
    const sections = [{key:'am',label:'Morning'},{key:'body',label:'Shower & body'}];
    if(entry && entry.nizoral) sections.push({key:'nizoral',label:'Nizoral'});
    sections.push({key:'face',label:'Night — face'});
    return sections;
  }
  return [{key:'am',label:'Morning'},{key:'pm',label:'Night'}];
}
function skinStepsForSection(profile, dateStr, section){
  if(profile==='Bhargav'){
    const entry = planFor(dateStr);
    if(!entry) return [];
    if(section==='am') return SKIN_AM_ROUTINE.map(function(s){ return s.text; });
    if(section==='body') return skinBodyStepsFor(entry).map(function(s){ return s.text; });
    if(section==='nizoral') return entry.nizoral ? ['Wet the scalp completely','Apply '+SKIN_QTY.nizoral,'Massage gently for 30 seconds','Leave on for the time on the bottle','Rinse thoroughly'] : [];
    if(section==='face'){
      const treatment = SKIN_TREATMENTS[entry.face] || SKIN_TREATMENTS.regular;
      return treatment.steps.map(function(s){ return s.text; });
    }
    return [];
  }
  if(section==='am') return SKIN_ANUSHA_MORNING;
  if(section==='pm') return SKIN_ANUSHA_NIGHT;
  return [];
}
/* Which product each skincare step uses (ids/names mirror skin.html's Product Cabinet) so the day's checklist can say what to reach for. */
const SKIN_TEXT_PRODUCT = {"Cleanser": "cleanser", "Moisturizer — face & neck": "moisturizer", "Sunscreen — face, ears, neck": "spf", "Body sunscreen on exposed areas (if leaving home)": "spf", "Thin layer of moisturizer": "moisturizer", "Differin — entire face": "differin", "Another thin layer of moisturizer": "moisturizer", "Azelaic acid on uneven/pigmented areas": "azelaic", "Moisturizer after it absorbs": "moisturizer", "Paula’s Choice 2% BHA — nose, forehead, blackhead-prone areas": "bha", "Moisturizer": "moisturizer", "CeraVe SA on rough/bumpy arms": "sa", "CeraVe SA on rough/bumpy legs": "sa", "Eucerin on the rest of the body — within 3 minutes of showering": "eucerin", "Eucerin — both arms": "eucerin", "Eucerin — both legs": "eucerin", "Eucerin — chest & stomach": "eucerin", "Eucerin — back": "eucerin", "Rinse with water — INKEY List Salicylic Acid Cleanser only if face is oily": "cleanser", "Tone: Anua Heartleaf 77 + Hyaluron Soothing Toner": "toner", "Brighten: INKEY List 15% Vitamin C + EGF Serum — 1–2 pumps": "vitc", "Hydrate: Atomy Hydra Brightening Capsule Essence — 1–2 pumps": "essence", "Moisturize: Atomy Hydra Brightening Cream": "amCream", "Broad-spectrum sunscreen SPF 30–50": "spf", "Cleanse: INKEY List Salicylic Acid Cleanser": "cleanser", "Treat: Anua Azelaic Acid 10% Serum — 2–3 drops": "azelaicSerum", "Moisturize: Anua Ceramide 3 + Panthenol Barrier Cream": "pmCream"};
const SKIN_PRODUCT_NAMES = {"Bhargav": {"cleanser": "Vanicream Gentle Facial Cleanser", "moisturizer": "Vanicream Daily Facial Moisturizer", "spf": "La Roche-Posay Anthelios Melt-In Milk SPF 60", "nizoral": "Nizoral A-D Anti-Dandruff Shampoo 1%", "eucerin": "Eucerin Advanced Repair Lotion", "differin": "Differin Gel 0.1% (adapalene)", "azelaic": "The Ordinary Azelaic Acid Suspension 10%", "sa": "CeraVe SA Lotion", "bha": "Paula’s Choice Skin Perfecting 2% BHA Liquid Exfoliant"}, "Anusha": {"cleanser": "INKEY List Salicylic Acid Cleanser", "toner": "Anua Heartleaf 77 + Hyaluron Soothing Toner", "vitc": "INKEY List 15% Vitamin C + EGF Serum", "essence": "Atomy Hydra Brightening Capsule Essence", "amCream": "Atomy Hydra Brightening Cream", "spf": "Broad-spectrum sunscreen SPF 30–50", "azelaicSerum": "Anua Azelaic Acid 10% Serum", "pmCream": "Anua Ceramide 3 + Panthenol Barrier Cream"}};
function skinStepDetails(profile, dateStr, section){
  const texts = skinStepsForSection(profile, dateStr, section);
  let objs = null;
  if(profile==='Bhargav'){
    const entry = planFor(dateStr);
    if(entry){
      if(section==='am') objs = SKIN_AM_ROUTINE;
      else if(section==='body') objs = skinBodyStepsFor(entry);
      else if(section==='face') objs = (SKIN_TREATMENTS[entry.face] || SKIN_TREATMENTS.regular).steps;
    }
  }
  return texts.map(function(text, i){
    const o = (objs && objs[i] && objs[i].text===text) ? objs[i] : {};
    let pid = SKIN_TEXT_PRODUCT[text] || '';
    if(!pid && section==='nizoral' && /^Apply /.test(text)) pid = 'nizoral';
    let name = (SKIN_PRODUCT_NAMES[profile]||{})[pid] || '';
    if(name){
      const norm = text.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ');
      const keys = name.split(/[\s—-]+/).slice(0,2).map(function(w){ return w.replace(/[^A-Za-z0-9]/g,'').toLowerCase(); }).filter(Boolean);
      if(keys.length && keys.every(function(k){ return norm.indexOf(k)!==-1; })) name = '';
    }
    return {text:text, qty:o.qty||'', product:name};
  });
}

window.SkinPlan={sectionsFor:skinSectionsForProfile,details:skinStepDetails,setStart:skinSetStart};
})();

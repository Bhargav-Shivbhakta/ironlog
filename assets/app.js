const FIREBASE_CONFIG=window.IRONLOG_FIREBASE;
firebase.initializeApp(FIREBASE_CONFIG);
const auth=firebase.auth(),db=firebase.firestore();
try{db.enablePersistence({synchronizeTabs:true}).catch(()=>{});}catch(e){}

const state={user:null,profile:null,templates:{},events:[],personalTasks:[],sharedTasks:[],chores:[],choreHistory:[],dailyLog:null,apps:[],categories:{},order:[],hidden:[],insights:null,theme:null,widgets:[],appIcons:{},photos:[]};
const PROFILE_KEY='hub-active-profile',DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const $=id=>document.getElementById(id);
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const safeJson=(value,fallback)=>{try{return value?JSON.parse(value):fallback}catch(e){return fallback}};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time12=value=>{if(!value)return'Anytime';const [h,m]=value.split(':').map(Number),p=h>=12?'PM':'AM',hh=h%12||12;return hh+(m?':'+String(m).padStart(2,'0'):'')+' '+p};
const minutes=value=>{if(!value)return 9999;const [h,m]=value.split(':').map(Number);return h*60+m};
const addDays=(date,n)=>{const d=new Date(date+'T00:00:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const daysBetween=(fromStr,toStr)=>Math.round((new Date(toStr+'T00:00:00')-new Date(fromStr+'T00:00:00'))/86400000);

function profileRef(group,key){return db.collection('users').doc(state.user.uid).collection(group).doc(state.profile).collection('data').doc(key)}
function appRef(app,key){return db.collection('users').doc(state.user.uid).collection('apps').doc(app).collection('data').doc(key)}
function sharedTodoRef(){return db.collection('users').doc(state.user.uid).collection('todo-shared').doc('tasks')}
function hubRef(key){return db.collection('users').doc(state.user.uid).collection('apps').doc('hub').collection('data').doc(key)}
function skinDataRef(profile,key){return db.collection('users').doc(state.user.uid).collection('skin-profiles').doc(profile).collection('data').doc(key)}
function gymDailyLogsCol(profile){return db.collection('users').doc(state.user.uid).collection('profiles').doc(profile.toLowerCase()).collection('dailyLogs')}
async function readJson(ref,fallback=[]){try{const snap=await ref.get();return snap.exists?safeJson(snap.data().json,fallback):fallback}catch(e){console.warn(e);return fallback}}

/* =====================================================================
   THEME — two editable "base colors" (one per profile), each expanded
   into a deep/soft pair via HSL math so every app that already uses the
   accent/accent-deep/accent-soft (or green/green2, etc.) variable
   convention can be recolored from a single hex pick. Shared with every
   other app file in this suite (each reads the same hub/theme doc and
   runs the same derivation — see the "hub theme" block near the top of
   each app's own script) so choosing a color here reskins the whole
   suite, not just this page. Stored at apps/hub/data/theme so it's one
   shared setting, same as categories/order/hidden above.
===================================================================== */
const DEFAULT_THEME={accents:{Bhargav:'#ad7b20',Anusha:'#b25c78'},wallpaper:{id:'none',css:''},mode:'light'};
// One app-wide look, layered on top of the per-profile accent color above.
// Adding a new one later is just a new entry here plus a matching
// :root[data-theme="..."] block in app.css — nothing else has to change.
const THEME_MODES=[
  {id:'light',name:'Light',desc:'The original look',rail:'#171714',body:'#f4f4f0',chip:'#ad7b20',line:'#e3e3dc'},
  {id:'dark',name:'Dark',desc:'Easy on the eyes',rail:'#0a0a09',body:'#1b1b1a',chip:'#42e6a4',line:'#323230'},
  {id:'midnight',name:'Midnight',desc:'Deep blue-black',rail:'#060811',body:'#131829',chip:'#7fa2ff',line:'#262e4a'},
  {id:'sepia',name:'Sepia',desc:'Warm paper tone',rail:'#2c2413',body:'#fbf5e8',chip:'#a8672e',line:'#e1cfa8'}
];
// A big gallery of extra themes, generated from a curated list of hues
// rather than hand-written one by one — each hue gets a light and a dark
// variant, built from the same contrast-safe formula, so the whole
// gallery can grow just by adding a name to THEME_HUES instead of
// authoring a new :root[data-theme=...] CSS block every time. Applied at
// runtime as inline custom properties (see applyTheme) rather than CSS,
// which is what lets there be dozens of these without bloating app.css.
const THEME_HUES=[
  {h:0,name:'Crimson'},{h:15,name:'Coral'},{h:30,name:'Amber'},{h:45,name:'Gold'},
  {h:60,name:'Olive'},{h:75,name:'Lime'},{h:90,name:'Sage'},{h:105,name:'Fern'},
  {h:120,name:'Emerald'},{h:135,name:'Jade'},{h:150,name:'Mint'},{h:165,name:'Teal'},
  {h:180,name:'Cyan'},{h:195,name:'Sky'},{h:210,name:'Azure'},{h:225,name:'Cobalt'},
  {h:240,name:'Indigo'},{h:255,name:'Violet'},{h:270,name:'Purple'},{h:285,name:'Orchid'},
  {h:300,name:'Magenta'},{h:315,name:'Rose'},{h:330,name:'Blush'},{h:345,name:'Ruby'},
  {h:0,name:'Mono',mono:true}
];
function hslCss(h,s,l){return'hsl('+Math.round(h)+' '+Math.max(0,Math.round(s))+'% '+Math.max(0,Math.round(l))+'%)'}
function buildThemePalette(hue,mono,mode,name,id){
  const s=mono?0:1;
  const vars=mode==='dark'?{
    bg:hslCss(hue,18*s,8),surface:hslCss(hue,16*s,12),surfaceSoft:hslCss(hue,15*s,16),
    line:hslCss(hue,15*s,22),text:hslCss(hue,14*s,94),muted:hslCss(hue,10*s,66),
    faint:hslCss(hue,8*s,46),ink:hslCss(hue,24*s,6),shadow:'0 18px 50px rgba(0,0,0,.4)'
  }:{
    bg:hslCss(hue,26*s,95),surface:hslCss(hue,32*s,99),surfaceSoft:hslCss(hue,24*s,96),
    line:hslCss(hue,18*s,88),text:hslCss(hue,20*s,15),muted:hslCss(hue,10*s,43),
    faint:hslCss(hue,8*s,60),ink:hslCss(hue,24*s,9),shadow:'0 18px 50px hsla('+Math.round(hue)+',30%,25%,.12)'
  };
  return{id,name,mode,vars};
}
const THEME_PALETTES=[];
THEME_HUES.forEach(hs=>{
  ['light','dark'].forEach(mode=>{
    const label=mode==='light'?hs.name:hs.name+' Night';
    const id='palette-'+hs.name.toLowerCase()+'-'+mode;
    THEME_PALETTES.push(buildThemePalette(hs.h,!!hs.mono,mode,label,id));
  });
});
/* =====================================================================
   APP ICONS — every app tile used to be a fixed PNG (tile-icons/*.png),
   baked with its own colors, so it never matched any theme. The default
   is now a Lucide glyph drawn with currentColor inside the tile's own
   themed circle (.app-icon already paints that circle with --accent-soft/
   --accent-ink, so switching the PNG for an <i data-lucide> icon is all
   it takes for the icon to follow the active theme automatically). A
   person can still override any app's icon — either pick a different
   glyph from the curated library below, or upload their own image (which,
   being a raster image, keeps its own fixed colors, same tradeoff as the
   wallpaper photo). Saved at users/{uid}/apps/hub/data/icons as
   {[file]: {type:'icon',icon:'dumbbell'} | {type:'image',src:'data:...'}}.
===================================================================== */
const DEFAULT_APP_ICON={
  'grocery.html':'shopping-cart','schedule.html':'calendar-clock','todo.html':'list-checks',
  'skin.html':'sparkles','chores.html':'spray-can','diet.html':'utensils',
  'calendar.html':'calendar-days','gym.html':'dumbbell','budget.html':'piggy-bank','pledge.html':'flag','checklist.html':'square-check-big'
};
const ICON_LIBRARY=[
  'house','shopping-cart','shopping-bag','utensils','coffee','pizza','apple','carrot','salad','cake','soup',
  'calendar','calendar-days','calendar-clock','calendar-check','clock','alarm-clock','watch','timer',
  'list-checks','list-todo','circle-check','square-check','clipboard-list','clipboard-check',
  'dumbbell','heart-pulse','activity','bike','footprints','flame','trophy','medal','target',
  'sparkles','star','droplet','droplets','sun','moon','cloud-sun','umbrella',
  'spray-can','brush','paintbrush','wrench','hammer','scissors','shirt',
  'book','book-open','graduation-cap','pencil','briefcase','laptop','monitor',
  'music','headphones','camera','film','gamepad-2','palette','gift','party-popper',
  'plane','car','map','map-pin','compass','globe',
  'leaf','tree-pine','flower-2','paw-print','dog','cat','fish','bird',
  'piggy-bank','wallet','credit-card','receipt',
  'lightbulb','key','lock','shield','bell','mail','phone','message-circle',
  'baby','users','user','smile','thermometer','pill','stethoscope',
  'layout-grid','folder','bookmark','tag','package','box'
];
function appIconInfo(file){
  return state.appIcons[file]||{type:'icon',icon:DEFAULT_APP_ICON[file]||'layout-grid'};
}
function appIconHtml(file){
  const info=appIconInfo(file);
  return info.type==='image'&&info.src?'<img src="'+info.src+'" alt="">':'<i data-lucide="'+esc(info.icon||'layout-grid')+'"></i>';
}
async function saveHubIcons(){try{await profileRef('hub-profiles','icons').set({json:JSON.stringify(state.appIcons)})}catch(e){}}
function hexToRgb(hex){hex=(hex||'').replace('#','');if(hex.length===3)hex=hex.split('').map(c=>c+c).join('');const n=parseInt(hex,16)||0;return[n>>16&255,n>>8&255,n&255]}
function rgbToHsl(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b);let h,s,l=(mx+mn)/2;if(mx===mn){h=s=0}else{const d=mx-mn;s=l>0.5?d/(2-mx-mn):d/(mx+mn);if(mx===r)h=(g-b)/d+(g<b?6:0);else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;h/=6}return[h*360,s*100,l*100]}
function hslToHex(h,s,l){h=((h%360)+360)%360/360;s=Math.max(0,Math.min(100,s))/100;l=Math.max(0,Math.min(100,l))/100;let r,g,b;if(s===0){r=g=b=l}else{const q=l<0.5?l*(1+s):l+s-l*s,p=2*l-q;const hue2rgb=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p};r=hue2rgb(p,q,h+1/3);g=hue2rgb(p,q,h);b=hue2rgb(p,q,h-1/3)}const toHex=x=>Math.round(x*255).toString(16).padStart(2,'0');return'#'+toHex(r)+toHex(g)+toHex(b)}
function deriveShades(base){const[h,s,l]=rgbToHsl(...hexToRgb(base));const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));return{accent:base,deep:hslToHex(h,clamp(s*1.08,40,96),clamp(l*0.6,16,42)),soft:hslToHex(h,clamp(s*0.5,18,55),92)}}
const PALETTE_PRESETS=[
  {name:'Original',Bhargav:'#ad7b20',Anusha:'#b25c78'},
  {name:'Ocean & Coral',Bhargav:'#2a78d6',Anusha:'#eb6834'},
  {name:'Forest & Berry',Bhargav:'#2f7c5a',Anusha:'#a8517a'},
  {name:'Slate & Gold',Bhargav:'#3a3d52',Anusha:'#e8b84b'},
  {name:'Teal & Rose',Bhargav:'#16a37a',Anusha:'#b25c78'},
  {name:'Plum & Amber',Bhargav:'#7a2c49',Anusha:'#c9922e'},
  {name:'Indigo & Coral',Bhargav:'#4a5ed6',Anusha:'#eb6834'},
  {name:'Clay & Sage',Bhargav:'#b8563a',Anusha:'#5c8a6e'}
];
const WALLPAPER_PRESETS=[
  {id:'none',name:'Plain',css:''},
  {id:'sunrise',name:'Sunrise',css:'linear-gradient(135deg,#fdf6e3 0%,#fbead1 45%,#f7dcc4 100%)'},
  {id:'dawn',name:'Dawn Rose',css:'linear-gradient(135deg,#fbeff3 0%,#f6e1e8 50%,#f0d9e6 100%)'},
  {id:'meadow',name:'Meadow',css:'linear-gradient(135deg,#eef6ee 0%,#e3f1e6 50%,#dceee0 100%)'},
  {id:'sky',name:'Sky',css:'linear-gradient(135deg,#eaf2fb 0%,#e2eefa 50%,#dce9f7 100%)'},
  {id:'dusk',name:'Dusk',css:'linear-gradient(135deg,#f3eef7 0%,#ece4f2 50%,#e5dcec 100%)'},
  {id:'sand',name:'Sand',css:'linear-gradient(135deg,#f7f3ea 0%,#f1e9d8 50%,#ebdfc4 100%)'},
  // "Live" wallpapers — same idea, but a bigger multi-stop gradient that
  // slowly drifts (background-position animated in app.css under
  // html.wallpaper-live) instead of sitting static. Kept subtle/slow on
  // purpose since this sits behind a whole workday, not a splash screen.
  {id:'aurora',name:'Aurora',live:true,css:'linear-gradient(120deg,#e7f6ef 0%,#dcf0f5 25%,#e8ecf8 50%,#f3e9f6 75%,#f7ecdf 100%)'},
  {id:'ember',name:'Ember Drift',live:true,css:'linear-gradient(120deg,#fdf1e3 0%,#fbe3d6 25%,#f8d9d9 50%,#fbe6e0 75%,#fdf1e3 100%)'},
  {id:'tide',name:'Tide',live:true,css:'linear-gradient(120deg,#e3f1fb 0%,#dbeef4 25%,#e2f4ec 50%,#eaf6e5 75%,#e3f1fb 100%)'}
];
function applyTheme(){
  const t=state.theme||DEFAULT_THEME;
  const hex=(t.accents&&t.accents[state.profile])||DEFAULT_THEME.accents[state.profile];
  const sh=deriveShades(hex);
  document.documentElement.style.setProperty('--accent',sh.accent);
  document.documentElement.style.setProperty('--accent-soft',sh.soft);
  document.documentElement.style.setProperty('--accent-ink',sh.deep);
  // Always-on per-person colors (not just "whoever's active right now") —
  // used anywhere someone's avatar/initials need to stay recognizably
  // *theirs* regardless of whose session is currently active, e.g. a
  // shared chore attributed to either person.
  document.documentElement.style.setProperty('--accent-bhargav',(t.accents&&t.accents.Bhargav)||DEFAULT_THEME.accents.Bhargav);
  document.documentElement.style.setProperty('--accent-anusha',(t.accents&&t.accents.Anusha)||DEFAULT_THEME.accents.Anusha);
  // Mode: either one of the 4 classic modes (their colors live entirely in
  // :root[data-theme="..."] blocks in app.css) or one of the generated
  // gallery palettes above, whose colors are set here instead — so
  // data-theme is set to whichever of "light"/"dark" the palette's own
  // mode is (to inherit the right structural rules, e.g. color-scheme and
  // the Insights dark palette), and its actual hues are layered on top as
  // inline custom properties, which win over the CSS block by specificity.
  const pal=(t.mode&&t.mode.indexOf('palette-')===0)?THEME_PALETTES.find(p=>p.id===t.mode):null;
  const SURFACE_PROPS=['--bg','--surface','--surface-soft','--line','--text','--muted','--faint','--ink','--shadow'];
  if(pal){
    document.documentElement.dataset.theme=pal.mode==='dark'?'dark':'light';
    document.documentElement.style.setProperty('--bg',pal.vars.bg);
    document.documentElement.style.setProperty('--surface',pal.vars.surface);
    document.documentElement.style.setProperty('--surface-soft',pal.vars.surfaceSoft);
    document.documentElement.style.setProperty('--line',pal.vars.line);
    document.documentElement.style.setProperty('--text',pal.vars.text);
    document.documentElement.style.setProperty('--muted',pal.vars.muted);
    document.documentElement.style.setProperty('--faint',pal.vars.faint);
    document.documentElement.style.setProperty('--ink',pal.vars.ink);
    document.documentElement.style.setProperty('--shadow',pal.vars.shadow);
  }else{
    document.documentElement.dataset.theme=(t.mode&&THEME_MODES.some(m=>m.id===t.mode))?t.mode:'light';
    SURFACE_PROPS.forEach(p=>document.documentElement.style.removeProperty(p));
  }
  // Wallpaper always wins over whatever --bg the mode/palette set, same
  // priority as before.
  const wpCss=t.wallpaper&&t.wallpaper.css;
  if(wpCss)document.documentElement.style.setProperty('--bg',wpCss);
  const wpPreset=WALLPAPER_PRESETS.find(w=>w.id===((t.wallpaper&&t.wallpaper.id)||'none'));
  document.documentElement.classList.toggle('wallpaper-live',!!(wpPreset&&wpPreset.live));
  // Remember the resolved look so every app can paint it instantly (no light flash) and follow it.
  try{
    const cs=getComputedStyle(document.documentElement), g=k=>cs.getPropertyValue('--'+k).trim();
    const dk=document.documentElement.dataset.theme;
    const v={bg:g('bg'),surface:g('surface'),soft:g('surface-soft'),line:g('line'),text:g('text'),muted:g('muted'),faint:g('faint'),ink:g('ink'),shadow:g('shadow'),dark:dk==='dark'||dk==='midnight'};
    if(v.surface&&state.profile){ const j=JSON.stringify(v); localStorage.setItem('hub-appearance:'+state.profile,j); localStorage.setItem('hub-appearance:last',j); }
  }catch(e){}
}
// Accent colors stay shared (Bhargav's gold / Anusha's pink need to be
// recognizable to both of you no matter who's active — e.g. a shared
// chore attributed to either person). Everything about *how the Hub
// looks* beyond that — mode, wallpaper, app icons, the photo widget's own
// photos — is personal, saved per profile so switching to the other
// person's session shows their own picks, not a shared, overwritten one.
async function saveHubAccents(){try{await hubRef('theme-accents').set({json:JSON.stringify({accents:state.theme.accents})})}catch(e){}}
async function saveProfileAppearance(){try{await profileRef('hub-profiles','appearance').set({json:JSON.stringify({mode:state.theme.mode,wallpaper:state.theme.wallpaper})})}catch(e){}}

function setGate(name){['loading','auth','profile'].forEach(x=>$(x+'-gate').hidden=x!==name);$('app-shell').hidden=!!name}
function setProfile(name){state.profile=name;localStorage.setItem(PROFILE_KEY,name);document.body.dataset.profile=name;$('sidebar-profile').textContent=name;$('sidebar-avatar').textContent=name[0];$('sidebar-avatar').className='avatar '+name.toLowerCase();$('mobile-profile').textContent=name[0];$('mobile-profile').className='avatar '+name.toLowerCase();updateAppFrameProfile();updateProfileLinks();startHubAlarmWatch();startHubNotesWatch();applyTheme()}
// Keeps the profile capsule in the app viewer's own top bar in sync with
// the hub-wide active profile — it's shown there instead of repeated
// inside every embedded app (see openAppFrame / app-frame-profile below).
function updateAppFrameProfile(){
  if(!state.profile || !$('app-frame-profile-name')) return;
  $('app-frame-profile-name').textContent=state.profile;
  $('app-frame-profile-avatar').textContent=state.profile[0];
  $('app-frame-profile-avatar').className='avatar '+state.profile.toLowerCase();
}
function updateProfileLinks(){document.querySelectorAll('[data-profile-link]').forEach(link=>{const raw=link.getAttribute('href'),base=raw.split('?')[0],lm=/[?&]list=([^&]+)/.exec(raw);link.href=base+'?profile='+encodeURIComponent(state.profile)+(lm?'&list='+lm[1]:'')})}

/* =====================================================================
   APP DISCOVERY — same GitHub-contents approach as the original hub, so
   dropping a new file into apps/ still makes it show up automatically.
   New apps land in an "uncategorized" bucket until assigned a category,
   rather than being hidden or dumped somewhere arbitrary.
===================================================================== */
const GITHUB_REPO = "Bhargav-Shivbhakta/ironlog";
const FALLBACK_APPS = [
  { file: 'grocery.html', title: 'Grocery Tracker' },
  { file: 'schedule.html', title: 'Schedule' },
  { file: 'todo.html', title: 'To-Do' },
  { file: 'skin.html', title: 'Skin Plan' },
  { file: 'chores.html', title: 'Household Chores' },
  { file: 'diet.html', title: 'Diet Tracker' },
  { file: 'calendar.html', title: 'Calendar' },
  { file: 'budget.html', title: 'Budget' },
  { file: 'pledge.html', title: 'Pledge' }
];
const ICONS = {
  'grocery.html': 'tile-icons/grocery.png', 'schedule.html': 'tile-icons/schedule.png',
  'todo.html': 'tile-icons/todo.png', 'skin.html': 'tile-icons/skin.png',
  'chores.html': 'tile-icons/chores.png',
  'diet.html': 'tile-icons/diet.png', 'calendar.html': 'tile-icons/calendar.png'
};
// Sensible defaults for the apps that already exist — anything genuinely
// new (not in this list) has no default and lands in "uncategorized"
// until a category is picked for it.
const DEFAULT_CATEGORY = {
  'gym.html':'health',
  'schedule.html':'planner', 'todo.html':'planner', 'calendar.html':'planner', 'clock.html':'planner',
  'diet.html':'health', 'skin.html':'health',
  'grocery.html':'home', 'chores.html':'home', 'budget.html':'home',
  'pledge.html':'planner', 'checklist.html':'planner'
};
const HIDDEN_APPS = new Set(['clock.html','checklist.html']); // reached only via its own widget/link, never a tile
function titleFromFilename(name){ return name.replace(/\.html?$/i,'').replace(/[-_]+/g,' ').replace(/\b\w/g, c=>c.toUpperCase()); }

async function discoverApps(){
  if(GITHUB_REPO === "YOUR_USERNAME/YOUR_REPO") return FALLBACK_APPS.filter(a=>!HIDDEN_APPS.has(a.file)).map(a=>({...a, icon: ICONS[a.file]||null}));
  try{
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/apps`);
    if(!res.ok) throw new Error('bad response');
    const files = await res.json();
    const htmlFiles = files.filter(f => f.type==='file' && /\.html?$/i.test(f.name) && !HIDDEN_APPS.has(f.name));
    if(!htmlFiles.length) return FALLBACK_APPS.filter(a=>!HIDDEN_APPS.has(a.file)).map(a=>({...a, icon: ICONS[a.file]||null}));
    return htmlFiles.map(f => ({ file:f.name, title: titleFromFilename(f.name), icon: ICONS[f.name]||null }));
  }catch(e){ return FALLBACK_APPS.filter(a=>!HIDDEN_APPS.has(a.file)).map(a=>({...a, icon: ICONS[a.file]||null})); }
}

async function loadHubMeta(){
  const [categories,order,hidden,widgets,
    legacyTheme,accentsDoc,appearanceDoc,
    legacyIcons,profileIcons,
    legacyPhotos,profilePhotos] = await Promise.all([
    readJson(hubRef('categories'), {}), readJson(hubRef('order'), []), readJson(hubRef('hidden'), []),
    readJson(hubRef('widgets'), null),
    // theme: accents stay shared (hubRef); mode/wallpaper are personal
    // (profileRef). The plain hubRef('theme') read is only a one-time
    // migration fallback, for whichever of you opens the Hub first after
    // this change — it seeds your own starting look from what the shared
    // look used to be, instead of resetting you to the defaults.
    readJson(hubRef('theme'), null), readJson(hubRef('theme-accents'), null), readJson(profileRef('hub-profiles','appearance'), null),
    readJson(hubRef('icons'), {}), readJson(profileRef('hub-profiles','icons'), null),
    readJson(hubRef('photos'), []), readJson(profileRef('hub-profiles','photos'), null)
  ]);
  state.categories = categories; state.order = order; state.hidden = hidden;
  const accents=(accentsDoc&&accentsDoc.accents)?accentsDoc.accents:(legacyTheme&&legacyTheme.accents)?legacyTheme.accents:JSON.parse(JSON.stringify(DEFAULT_THEME.accents));
  const appearance=appearanceDoc||(legacyTheme?{mode:legacyTheme.mode,wallpaper:legacyTheme.wallpaper}:null)||{mode:DEFAULT_THEME.mode,wallpaper:JSON.parse(JSON.stringify(DEFAULT_THEME.wallpaper))};
  state.theme={accents,mode:appearance.mode||'light',wallpaper:appearance.wallpaper||DEFAULT_THEME.wallpaper};
  state.widgets = (widgets && widgets[state.profile] && widgets[state.profile].length) ? widgets[state.profile].filter(w=>WIDGET_TYPES[w.type]) : widgetDefaultLayout();
  // One-time: put the Calendar widget onto layouts saved before it existed.
  try{
    const k='hub-agenda-seeded-'+state.profile;
    if(!localStorage.getItem(k)){
      localStorage.setItem(k,'1');
      if(!state.widgets.some(w=>w.type==='agenda')){state.widgets.splice(Math.min(2,state.widgets.length),0,{id:'w-agenda',type:'agenda',colSpan:12,rowSpan:16});saveWidgetLayout()}
    }
  }catch(e){}
  state.appIcons = profileIcons || legacyIcons || {};
  // photos: now one library per photo-widget instance ({byWidget:{id:[]}})
  // since the widget can be added more than once. profilePhotos is either
  // that new shape, or — for anyone who saved before this change — a flat
  // array, which gets adopted by the first (now only) photos widget on
  // the board rather than silently discarded.
  if(profilePhotos && !Array.isArray(profilePhotos) && profilePhotos.byWidget){
    state.photosByWidget = profilePhotos.byWidget;
  }else{
    const legacyFlat = Array.isArray(profilePhotos) ? profilePhotos : (Array.isArray(legacyPhotos) ? legacyPhotos : []);
    state.photosByWidget = {};
    if(legacyFlat.length){
      const firstPhotoWidget = state.widgets.find(w=>w.type==='photos');
      if(firstPhotoWidget) state.photosByWidget[firstPhotoWidget.id] = legacyFlat;
    }
  }
  photoWidgetRuntime={}; // this profile's photos just (re)loaded — force fresh shuffle/sequence/play state for every instance
  applyTheme();
}
async function saveHubCategories(){ try{ await hubRef('categories').set({json: JSON.stringify(state.categories)}); }catch(e){} }
async function saveHubOrder(){ try{ await hubRef('order').set({json: JSON.stringify(state.order)}); }catch(e){} }
async function saveHubHidden(){ try{ await hubRef('hidden').set({json: JSON.stringify(state.hidden)}); }catch(e){} }

function categoryFor(file){ return state.categories[file] || DEFAULT_CATEGORY[file] || null; }
function appsInCategory(cat){
  const inCat = state.apps.filter(a => categoryFor(a.file) === cat);
  const order = state.order.filter(f => inCat.some(a=>a.file===f));
  const ordered = order.map(f => inCat.find(a=>a.file===f)).filter(Boolean);
  inCat.forEach(a => { if(!order.includes(a.file)) ordered.push(a); });
  return ordered;
}
function uncategorizedApps(){ return state.apps.filter(a => !categoryFor(a.file)); }

/* =====================================================================
   CATEGORY PAGES — app grid per category, drag-reorder in edit mode,
   and a banner for any newly-discovered app with no category yet.
===================================================================== */
const editMode = {planner:false, health:false, home:false};
function renderUncategorizedBanner(cat){
  const el = $('uncat-banner-'+cat), extra = uncategorizedApps();
  if(cat!=='planner' || !extra.length){ if(el){ el.hidden = true; } return; } // show the prompt once, on Planner, regardless of where it'll land
  el.hidden = false;
  el.innerHTML = '<b>New app'+(extra.length===1?'':'s')+' found</b>'+
    extra.map(a => '<div class="uncat-row"><span>'+esc(a.title)+'</span><select data-assign="'+esc(a.file)+'"><option value="">Choose a category…</option><option value="planner">Planner</option><option value="health">Health</option><option value="home">Home</option></select></div>').join('');
  el.querySelectorAll('[data-assign]').forEach(sel => {
    sel.addEventListener('change', async () => {
      if(!sel.value) return;
      state.categories[sel.dataset.assign] = sel.value;
      await saveHubCategories();
      renderAllCategoryPages();
      toast(esc(sel.options[sel.selectedIndex].text)+' — added to '+sel.value);
    });
  });
}
function renderCategoryGrid(cat){
  const grid = $('grid-'+cat);
  const apps = appsInCategory(cat);
  grid.classList.toggle('edit-mode', editMode[cat]);
  grid.innerHTML = '';
  let cardIdx = 0;
  apps.forEach(a => {
    const isHidden = state.hidden.includes(a.file);
    if(isHidden && !editMode[cat]) return;
    const card = document.createElement('a');
    card.className = 'app-card' + (isHidden ? ' hidden-card' : '');
    card.href = a.path + (state.profile ? '?profile='+encodeURIComponent(state.profile) : '');
    card.draggable = editMode[cat];
    card.dataset.file = a.file;
    // Stagger the entrance animation (assets/app.css's card-in keyframe)
    // so tiles cascade in left-to-right/top-to-bottom instead of all
    // popping in at once — capped so a big grid doesn't feel sluggish.
    card.style.animationDelay = Math.min(cardIdx * 35, 350) + 'ms';
    cardIdx++;
    card.innerHTML = '<span class="app-icon">'+appIconHtml(a.file)+'</span><strong>'+esc(a.title)+'</strong>'+
      (editMode[cat] ? '<button type="button" class="app-hide-btn" data-hidetoggle="'+esc(a.file)+'" title="'+(isHidden?'Show':'Hide')+'">'+(isHidden?'+':'−')+'</button>' : '');
    if(editMode[cat]){
      card.addEventListener('click', e => e.preventDefault());
      card.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', a.file); card.classList.add('dragging'); });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      card.addEventListener('dragover', e => e.preventDefault());
      card.addEventListener('drop', async e => {
        e.preventDefault();
        const draggedFile = e.dataTransfer.getData('text/plain');
        if(draggedFile === a.file) return;
        const current = apps.map(x=>x.file);
        const from = current.indexOf(draggedFile), to = current.indexOf(a.file);
        current.splice(from,1); current.splice(to,0,draggedFile);
        // merge this category's new order back into the global order list
        state.order = state.order.filter(f => !current.includes(f)).concat(current);
        await saveHubOrder();
        renderCategoryGrid(cat);
      });
    }
    grid.appendChild(card);
  });
  grid.querySelectorAll('[data-hidetoggle]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.preventDefault(); e.stopPropagation();
      const f = btn.dataset.hidetoggle;
      state.hidden = state.hidden.includes(f) ? state.hidden.filter(x=>x!==f) : state.hidden.concat([f]);
      await saveHubHidden();
      renderCategoryGrid(cat);
    });
  });
  lucide.createIcons();
}
function renderAllCategoryPages(){
  ['planner','health','home'].forEach(cat => { renderUncategorizedBanner(cat); renderCategoryGrid(cat); });
}
document.querySelectorAll('[data-edit-toggle]').forEach(btn => {
  btn.addEventListener('click', () => {
    const cat = btn.dataset.editToggle;
    editMode[cat] = !editMode[cat];
    btn.innerHTML = editMode[cat] ? '<i data-lucide="check"></i><span>Done</span>' : '<i data-lucide="pencil"></i><span>Rearrange</span>';
    renderCategoryGrid(cat);
    lucide.createIcons();
  });
});

/* =====================================================================
   TODAY PAGE
===================================================================== */
async function loadDashboard(){
  setGate('loading');const date=today(),profileLower=state.profile.toLowerCase();
  const [templates,events,personal,shared,chores,choreHistory,dailyLog,apps,reminders,reminderCats]=await Promise.all([
    readJson(profileRef('schedule-profiles','dayTemplates'),{}),readJson(profileRef('schedule-profiles','events'),[]),
    readJson(profileRef('todo-profiles','tasks'),[]),readJson(sharedTodoRef(),[]),
    readJson(appRef('chores','chores'),[]),readJson(appRef('chores','history'),[]),
    db.collection('users').doc(state.user.uid).collection('profiles').doc(profileLower).collection('dailyLogs').doc(date).get().then(s=>s.exists?s.data():null).catch(()=>null),
    discoverApps(),
    readJson(appRef('calendar','reminders'),[]),readJson(appRef('calendar','reminderCategories'),[])
  ]);
  await loadHubMeta();
  // Gym lives in its own top-level gym/ folder, not inside apps/ like
  // every other tool — GitHub discovery only scans apps/, so it can
  // never find Gym on its own. It's added here as a fixed entry, the
  // same way the original hub always special-cased it.
  const appsWithGym = [{ file:'gym.html', path:'gym/index.html', title:'Gym', icon:'tile-icons/gym.png' }].concat(apps.map(a => ({...a, path:'apps/'+a.file})));
  Object.assign(state,{reminders:Array.isArray(reminders)?reminders:[],reminderCats:Array.isArray(reminderCats)?reminderCats:[],templates,events,personalTasks:personal,sharedTasks:shared,chores,choreHistory,dailyLog,apps:appsWithGym});
  renderDashboard();renderAllCategoryPages();startHubClock();initHubWeather();startTimelineAutoAdvance();wireWidgetModal();initTodayBanner();wireBannerGallery();setGate(null);
  // A reload used to always drop you back at the Hub even if you had an
  // app open in the viewer, because nothing recorded "which app" anywhere
  // durable — the iframe's contents live only in memory. openAppFrame now
  // stamps the open app into the URL hash (#app=<url>), so a refresh (or
  // reopening a bookmarked/shared link) can restore it here instead of
  // just falling back to a bare route.
  if(!restoreAppFromHash()) showRoute(location.hash.replace('#','')||'today');
}

/* Quiet re-sync of the Today data. Runs when you close an app, and when you come back to the tab after a
   while, so what you just did in To-Do / Chores / Calendar shows up on the Hub without a manual refresh. */
let hubLastSoft=Date.now(),hubSoftBusy=false;
let hubSoftAgain=false;
async function hubSoftRefresh(force){
  if(hubSoftBusy){ if(force)hubSoftAgain=true; return; }
  if(!state.user||!state.profile||$('app-shell').hidden)return;
  if(!force&&Date.now()-hubLastSoft<45000)return;
  if($('app-frame-overlay')&&!$('app-frame-overlay').hidden)return;
  hubSoftBusy=true;
  try{
    const date=today(),pl=state.profile.toLowerCase();
    const [templates,events,personal,shared,chores,choreHistory,dailyLog,reminders,reminderCats]=await Promise.all([
      readJson(profileRef('schedule-profiles','dayTemplates'),{}),readJson(profileRef('schedule-profiles','events'),[]),
      readJson(profileRef('todo-profiles','tasks'),[]),readJson(sharedTodoRef(),[]),
      readJson(appRef('chores','chores'),[]),readJson(appRef('chores','history'),[]),
      db.collection('users').doc(state.user.uid).collection('profiles').doc(pl).collection('dailyLogs').doc(date).get().then(x=>x.exists?x.data():null).catch(()=>null),
      readJson(appRef('calendar','reminders'),[]),readJson(appRef('calendar','reminderCategories'),[])
    ]);
    Object.assign(state,{reminders:Array.isArray(reminders)?reminders:[],reminderCats:Array.isArray(reminderCats)?reminderCats:[],templates,events,personalTasks:personal,sharedTasks:shared,chores,choreHistory,dailyLog});
    insightsLoadedAt=0;
    renderDashboard();
    const act=document.querySelector('[data-page].active');
    if(act&&act.dataset.page==='insights')renderInsightsPage().catch(()=>{});
  }catch(e){}
  hubSoftBusy=false;hubLastSoft=Date.now();
  if(hubSoftAgain){hubSoftAgain=false;hubSoftRefresh(true)}
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)hubSoftRefresh(false)});

// Same recurrence rules as Calendar and Schedule (daily / weekly / monthly /
// yearly, with an optional end date), so an event shows up on the Hub on exactly
// the days it shows up everywhere else.
function eventOccursOnHub(ev,date){
  if(!ev.recurring)return ev.date===date;
  const d=new Date(date+'T00:00:00');
  if(!ev.startDate)return ev.weekday===d.getDay();
  if(date<ev.startDate)return false;
  const rp=ev.repeat||{type:'weekly',until:null};
  if(rp.until&&date>rp.until)return false;
  const s=new Date(ev.startDate+'T00:00:00');
  if(rp.type==='daily')return true;
  const dim=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
  if(rp.type==='monthly')return d.getDate()===Math.min(s.getDate(),dim);
  if(rp.type==='yearly')return d.getMonth()===s.getMonth()&&d.getDate()===Math.min(s.getDate(),dim);
  return d.getDay()===(ev.weekday!=null?ev.weekday:s.getDay());
}
function timelineForDate(date){
  const weekday=new Date(date+'T00:00:00').getDay(),dayName=DAYS[weekday];
  const blocks=(state.templates[dayName]||[]).map((x,i)=>({id:'block-'+i,title:x.activity||x.title||'Scheduled block',time:x.start||'',end:x.end||'',kind:'routine'}));
  const events=state.events.filter(e=>eventOccursOnHub(e,date)).map(e=>({id:e.id,title:e.title,time:e.time||'',notes:e.notes||'',kind:'event'}));
  return blocks.concat(events).sort((a,b)=>minutes(a.time)-minutes(b.time));
}
function todaysTimeline(){ return timelineForDate(today()); }
// The "Next event" stat used to only look at today's own timeline, so once
// the last thing on today's schedule had already started (a Sleep block
// that runs past midnight, say), it fell through to "Clear" even though
// tomorrow's schedule clearly has something next (Wake up, etc). This
// looks ahead into tomorrow's timeline too, so there's always a real next
// thing shown as long as something is actually on the calendar.
function nextUpcoming(timeline){
  const nowM=new Date().getHours()*60+new Date().getMinutes();
  const todayMatch=timeline.find(x=>minutes(x.time)>=nowM);
  if(todayMatch) return todayMatch;
  const tomorrow=timelineForDate(addDays(today(),1));
  return tomorrow.length ? Object.assign({},tomorrow[0],{_tomorrow:true}) : null;
}
function dueTasks(){
  const date=today();
  return state.personalTasks.map(t=>({...t,_shared:false})).concat(state.sharedTasks.map(t=>({...t,_shared:true}))).filter(t=>!t.done&&(!t.startDate||t.startDate<=date)&&(t.due?t.due<=date:t.startDate===date||(t.priority||0)>0)).sort((a,b)=>(b.priority||0)-(a.priority||0)||(a.dueTime||'99:99').localeCompare(b.dueTime||'99:99'));
}
function formatDate(){return new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric'}).format(new Date())}
function greeting(){const h=new Date().getHours();return h<12?'Good morning':h<17?'Good afternoon':'Good evening'}
function plannedHours(items){let total=0;items.filter(x=>x.kind==='routine'&&x.time&&x.end).forEach(x=>{const duration=minutes(x.end)-minutes(x.time);if(duration>0&&duration<720)total+=duration});return total<60?total+'m':(total/60).toFixed(total%60?1:0)+'h'}

// Mirrors chores.html's own weekParity() and isDueTodayByScheduleSync()
// exactly — including handling scheduleSync.keyword as an array (as it
// is for Laundry/Deep Clean/Restocking/Grocery Ordering). A naive
// String(array) turns ['laundry','deep clean'] into the literal text
// "laundry,deep clean", which real schedule text will never contain, so
// keywords must be checked individually. Alternating chores (Laundry vs
// Deep Clean on the same Saturday slot) also need the parity check, or
// both would show as due on the same day instead of alternating.
function weekParity(dateStr){
  const ref = new Date('2026-01-03T00:00:00');
  const d = new Date(dateStr+'T00:00:00');
  const weeksSince = Math.floor(Math.round((d - ref) / 86400000) / 7);
  return ((weeksSince % 2)+2)%2;
}
function scheduleHasKeywordOn(blocks, keyword){
  const kws = (Array.isArray(keyword) ? keyword : [keyword]).map(k => String(k).toLowerCase());
  return blocks.some(b => { const a = String(b.activity||'').toLowerCase(); return kws.some(kw => a.indexOf(kw)!==-1); });
}
function nextChoreDue(chore){
  const date=today();
  if(chore.freqType==='asNeeded') return null;
  if(!chore.lastCompleted && chore.dueOverride) return chore.dueOverride;
  if(chore.freqType==='daily') return chore.lastCompleted?addDays(chore.lastCompleted,1):date;
  if(chore.freqType==='everyNDays') return chore.lastCompleted?addDays(chore.lastCompleted,Number(chore.freqDays)||1):date;
  if(chore.freqType==='specificDays'){
    const days=chore.days||[];
    if(!days.length) return null; // no weekdays chosen: treated as "as needed"
    const cursor=chore.lastCompleted?addDays(chore.lastCompleted,1):date;
    for(let i=0;i<21;i++){
      const candidate=addDays(cursor,i);
      if(!days.includes(new Date(candidate+'T00:00:00').getDay())) continue;
      // done the day before a scheduled day counts for that day (same rule as the Chores page)
      if(i===0&&chore.lastCompleted&&!days.includes(new Date(chore.lastCompleted+'T00:00:00').getDay())) continue;
      return candidate;
    }
  }
  return date;
}
function choresDueToday(){
  const date=today(), weekday=DAYS[new Date().getDay()], blocks=state.templates[weekday]||[];
  return state.chores.filter(c => {
    if(c.active===false) return false;
    if(Array.isArray(c.assignedTo) && !c.assignedTo.includes(state.profile)) return false;
    if(c.snoozedUntil && c.snoozedUntil>date) return false; // moved to later on the Chores page
    if(c.lastCompleted===date) return false; // already done today
    const next = nextChoreDue(c);
    if(!next || next>date) return false;
    if(c.scheduleSync && c.scheduleSync.profile===state.profile){
      if(!scheduleHasKeywordOn(blocks, c.scheduleSync.keyword)) return false;
      if(c.scheduleSync.requireWeekParity!=null && weekParity(date)!==c.scheduleSync.requireWeekParity) return false;
    }
    return true;
  }).map(c => ({...c, overdue: nextChoreDue(c) < date}));
}

function renderDashboard(){
  const timeline=todaysTimeline(),tasks=dueTasks(),chores=choresDueToday();
  $('today-date').textContent=formatDate();$('today-greeting').textContent=greeting()+', '+state.profile;
  $('today-summary').textContent=tasks.length?tasks.length+' task'+(tasks.length===1?'':'s')+' need your attention today.':'Your priority list is clear.';
  const next=nextUpcoming(timeline);
  const nextEl=$('stat-next');
  if(next){
    nextEl.textContent=(next.title||'Scheduled')+(next._tomorrow?' · Tmrw':'');
    nextEl.title=(next.title||'Scheduled')+(next.time?' at '+time12(next.time):'')+(next._tomorrow?' (tomorrow)':' (today)');
  }else{
    nextEl.textContent='Clear';
    nextEl.removeAttribute('title');
  }
  $('stat-tasks').textContent=tasks.length;$('stat-focus').textContent=plannedHours(timeline);
  renderWidgetBoard();
}
// The item "now" falls into: the last one whose start time has already
// passed. Items are pre-sorted by start time (todaysTimeline()), so the
// last match as we walk forward is the current one.
function currentTimelineIndex(items){
  const nowM=new Date().getHours()*60+new Date().getMinutes();
  let idx=-1;
  items.forEach((x,i)=>{ const m=minutes(x.time); if(!isNaN(m)&&m<=nowM) idx=i; });
  return idx;
}
// Whether past blocks are currently expanded — module-level so it
// survives the 30s auto-refresh re-render instead of resetting closed
// every time.
let timelineShowPast=false;
// Was unconditional before: every 30s re-render (see startTimelineAutoAdvance
// below) called scrollIntoView on the "current" row, and because this widget
// card has no scrollable wrapper of its own, the browser had nowhere closer
// to scroll than the whole page — so the dashboard would periodically jerk
// itself down to wherever the schedule widget happened to sit, which is
// exactly what felt like being "taken to the schedule tab" out of nowhere.
// Now it's opt-in via Settings (see TIMELINE_AUTOSCROLL_KEY), off by default.
const TIMELINE_AUTOSCROLL_KEY='hub-timeline-autoscroll';
let timelineAutoScroll=(()=>{try{return localStorage.getItem(TIMELINE_AUTOSCROLL_KEY)==='on'}catch(e){return false}})();
function updateTimelineAutoScrollUI(){
  const btn=$('timeline-autoscroll-toggle'),status=$('timeline-autoscroll-status');
  if(btn)btn.textContent=timelineAutoScroll?'Turn off auto-scroll':'Turn on auto-scroll';
  if(status)status.textContent=timelineAutoScroll?'On':'Off';
}
function renderTimelineInto(el,items){
  if(!el)return;
  if(!items.length){el.innerHTML='<div class="empty-state"><strong>No scheduled blocks</strong>Your day is open. Add plans from the schedule.</div>';return}
  const curIdx=currentTimelineIndex(items);
  const pastCount=curIdx>=0?curIdx:0;
  const toggleHtml=pastCount>0?('<div class="timeline-toggle-row" id="timeline-toggle-row"><span class="timeline-time"></span><span></span><span class="timeline-content"><button type="button" class="timeline-toggle-link" id="timeline-toggle-btn">'+(timelineShowPast?'Hide earlier':pastCount+' earlier today · Show')+'</button></span></div>'):'';
  el.innerHTML=toggleHtml+items.map((x,i)=>'<div class="timeline-row '+(x.kind==='event'?'':'muted')+(i===curIdx?' current':i<curIdx?' past':'')+'" data-tl-row="'+i+'"><span class="timeline-time">'+esc(time12(x.time))+'</span><span class="timeline-dot"></span><span class="timeline-content"><strong>'+esc(x.title)+'</strong><small>'+(x.end?esc(time12(x.time)+' – '+time12(x.end)):(x.notes?esc(x.notes):x.kind==='event'?'Event':'Routine'))+'</small></span></div>').join('');
  // .timeline is the base class the row/toggle CSS above is actually
  // written against (the connecting line, the .show-past reveal rule) —
  // el is just the widget card's generic body div, so without this the
  // "Show" toggle had nothing to hook into and silently did nothing.
  el.classList.add('timeline');
  el.classList.toggle('show-past', timelineShowPast);
  const toggleBtn=$('timeline-toggle-btn');
  if(toggleBtn) toggleBtn.addEventListener('click', ()=>{ timelineShowPast=!timelineShowPast; renderTimelineInto(el,items); });
  // Keep "now" in view inside the timeline's own scroll area as the day's
  // list grows — only when the person has turned this on in Settings.
  if(curIdx>=0&&timelineAutoScroll){
    const curEl=el.querySelector('[data-tl-row="'+curIdx+'"]');
    if(curEl) curEl.scrollIntoView({block:'center', behavior:'smooth'});
  }
}
// Re-checks which block is "current" every 30s so the highlight (and
// auto-scroll) advances through the day on its own, without a refresh —
// only matters while the schedule widget is actually on the board.
let timelineRefreshTimer=null;
function startTimelineAutoAdvance(){
  if(timelineRefreshTimer) clearInterval(timelineRefreshTimer);
  timelineRefreshTimer=setInterval(()=>{
    const el=document.querySelector('.widget-card[data-widget-type="schedule"] .widget-card-body');
    if(state.templates&&el) renderTimelineInto(el,todaysTimeline());
  }, 30000);
}
function renderTasksInto(el,items){
  if(!el)return;
  const openLink='<a class="widget-card-link" href="apps/todo.html" data-profile-link>Open Priorities <i data-lucide="arrow-up-right"></i></a>';
  if(!items.length){el.innerHTML='<div class="empty-state"><strong>You are caught up</strong>No open tasks are due today.</div>'+openLink;updateProfileLinks();if(window.lucide)lucide.createIcons();return}
  el.innerHTML=items.map(t=>'<div class="task-row" data-task-id="'+esc(t.id)+'"><button class="task-check" type="button" aria-label="Complete '+esc(t.title)+'"><i data-lucide="check"></i></button><span class="task-copy"><strong>'+esc(t.title)+'</strong><small>'+(t._shared?'Shared':esc(t.listId||'Personal'))+(t.dueTime?' · '+esc(time12(t.dueTime)):'')+'</small></span>'+(t.priority?'<span class="priority-mark">'+(t.priority>1?'Urgent':'Important')+'</span>':'')+'</div>').join('')+openLink;
  updateProfileLinks();lucide.createIcons();el.querySelectorAll('.task-check').forEach(btn=>btn.addEventListener('click',()=>completeTask(btn.closest('.task-row').dataset.taskId)));
}
async function completeChoreFromWidget(choreId,el,after){
  const chore=state.chores.find(c=>c.id===choreId);
  if(!chore)return;
  const date=today();
  if(chore.lastCompleted===date){toast('"'+chore.name+'" is already done today');if(after)after();else renderChoresListInto(el,choresDueToday());return}
  // A lighter version of what apps/chores.html's own completeChore() does
  // — marks it done and logs it to the exact same history doc the Chores
  // app reads, so it shows up there too. Rotation is handled the same way.
  // What it still skips is writing the completion back into the Schedule
  // for chores linked to a routine block, which needs the full Chores app.
  chore.undo={lastCompleted:chore.lastCompleted||null,snoozedUntil:chore.snoozedUntil||null,assignedTo:(chore.assignedTo||[]).slice(),rotationIndex:chore.rotationIndex||0,passedBy:chore.passedBy||null,logId:'log-'+Date.now(),date};
  chore.lastCompleted=date;
  chore.snoozedUntil=null;
  chore.passedBy=null;
  // rotation, same as the Chores page
  if(chore.rotationEnabled&&chore.rotationMembers&&chore.rotationMembers.length>1){
    const cur=Math.max(0,chore.rotationMembers.indexOf((chore.assignedTo||[])[0]));
    chore.rotationIndex=(cur+1)%chore.rotationMembers.length;
    chore.assignedTo=[chore.rotationMembers[chore.rotationIndex]];
  }
  state.choreHistory.unshift({id:chore.undo.logId,choreId:chore.id,date,task:chore.name,by:state.profile,rating:null,notes:null,recordedBy:state.profile});
  try{
    // Re-read both docs right before writing, so an edit made in the Chores app since the Hub last loaded
    // isn't overwritten; only this chore's completion fields and one history entry are applied on top.
    const [latestC,latestH]=await Promise.all([readJson(appRef('chores','chores'),null),readJson(appRef('chores','history'),null)]);
    const list=Array.isArray(latestC)?latestC:state.chores, hist=Array.isArray(latestH)?latestH:state.choreHistory;
    const i=list.findIndex(c=>c.id===chore.id);
    if(i>=0&&list[i].lastCompleted===date&&i>=0&&list[i]!==chore&&Array.isArray(latestC)){
      Object.assign(chore,{lastCompleted:list[i].lastCompleted}); // already marked done elsewhere
    }else{
      if(i>=0)['lastCompleted','snoozedUntil','passedBy','rotationIndex','assignedTo','undo'].forEach(k=>{list[i][k]=chore[k]});
      else list.push(chore);
      hist.unshift(state.choreHistory[0]);
      await appRef('chores','chores').set({json:JSON.stringify(list)});
      await appRef('chores','history').set({json:JSON.stringify(hist)});
      // tick the linked block in Schedule, exactly like the Chores app does
      for(const link of (chore.links||[])){
        try{
          const ref=db.collection('users').doc(state.user.uid).collection('schedule-profiles').doc(link.profile).collection('data').doc('choreLog');
          const d=await ref.get(); const log=(d.exists&&d.data().json)?safeJson(d.data().json,{}):{};
          log[link.scheduleChoreId+':'+date]={done:true,by:state.profile,at:new Date().toISOString()};
          await ref.set({json:JSON.stringify(log)});
        }catch(e){console.warn('schedule sync failed',e)}
      }
    }
    state.chores=list; state.choreHistory=hist;
  }catch(e){console.warn(e)}
  toast('Marked "'+chore.name+'" done');
  if(after)after();else renderChoresListInto(el,choresDueToday());
}
function renderChoresListInto(el,chores){
  if(!el)return;
  const openLink='<a class="widget-card-link" href="apps/chores.html" data-profile-link>Open Chores <i data-lucide="arrow-up-right"></i></a>';
  if(!chores.length){ el.innerHTML='<div class="empty-state"><strong>Nothing due</strong>No chores need attention today.</div>'+openLink; updateProfileLinks(); if(window.lucide)lucide.createIcons(); return; }
  el.innerHTML = '<div class="chores-mini-list">'+chores.map(c =>
    '<div class="chores-mini-row'+(c.overdue?' overdue':'')+'" data-chore-id="'+esc(c.id)+'">'+
      '<button type="button" class="task-check chores-mini-check" aria-label="Mark '+esc(c.name)+' done" title="Mark done"><i data-lucide="check"></i></button>'+
      '<span class="chores-mini-copy"><strong>'+esc(c.name)+'</strong><small>'+(c.overdue?'Overdue':'Due today')+'</small></span>'+
    '</div>'
  ).join('')+'</div>'+openLink;
  updateProfileLinks();
  if(window.lucide)lucide.createIcons();
  el.querySelectorAll('.chores-mini-check').forEach(btn=>btn.addEventListener('click',()=>completeChoreFromWidget(btn.closest('[data-chore-id]').dataset.choreId,el)));
}

/* =====================================================================
   WIDGET BOARD — the customizable Today page. Each entry in
   state.widgets is {id, type, size}; `type` maps into WIDGET_TYPES
   below for its title/icon/render(). Layout is saved per-profile at
   apps/hub/data/widgets under a key named after the profile, same
   storage pattern as theme/categories/order above.
===================================================================== */
// Free-form sizing on a fine 12-column grid (22px row unit) instead of a
// handful of named buckets — drag the corner handle and the card follows
// your pointer continuously (rounded to the nearest column/row unit, not
// a preset), so "resize to any size" is actually true rather than
// snapping between ~7 shapes. Other widgets reflow around it automatically
// via CSS Grid's dense auto-placement (see .widget-board in app.css) —
// no manual collision/rearrange logic needed on this end.
// SIZE_TO_SPAN is only a starting-point lookup now (used for a widget's
// first-ever placement, or to read an old saved {size:'xl'} layout from
// before this system existed) — once a widget is resized it's stored as
// its own exact {colSpan,rowSpan} and this table is never consulted again
// for it.
const WIDGET_ROW_PX=22, WIDGET_GAP_PX=14;
const WIDGET_MIN_COL=3, WIDGET_MIN_ROW=5, WIDGET_MAX_ROW=42;
const SIZE_TO_SPAN={sm:[3,6],md:[6,6],tall:[3,12],lg:[6,12],wide:[12,6],xl:[6,20],full:[12,13]};
function widgetSpanFor(w,def){
  if(w.colSpan&&w.rowSpan) return [Math.max(WIDGET_MIN_COL,w.colSpan),Math.max(WIDGET_MIN_ROW,w.rowSpan)];
  return SIZE_TO_SPAN[w.size||(def&&def.defaultSize)]||SIZE_TO_SPAN.md;
}
// Reproduces the original, pre-widget Today page almost exactly (big
// side-by-side schedule+priorities, full-width chores, a short full-width
// link row) — widgets are an option to rearrange from here, not a smaller
// starting point.
function widgetDefaultLayout(){
  return [
    {id:'w-schedule',type:'schedule',colSpan:6,rowSpan:20},
    {id:'w-priorities',type:'priorities',colSpan:6,rowSpan:20},
    {id:'w-agenda',type:'agenda',colSpan:12,rowSpan:16},
    {id:'w-chores',type:'chores',colSpan:12,rowSpan:13},
    {id:'w-quicklinks',type:'quicklinks',colSpan:12,rowSpan:6}
  ];
}

/* ---- Calendar widget: today's events, reminders (birthdays etc.), tasks and
   chores with tick boxes, plus the next 7 days — everything Calendar knows
   about, on the front page. ---- */
function agFmtTime(t){if(!t)return'';const[h,m]=t.split(':').map(Number);return((h%12)||12)+(m?':'+String(m).padStart(2,'0'):'')+(h>=12?' pm':' am')}
function agCatName(id){const c=(state.reminderCats||[]).find(x=>x.id===id);return c?c.name:(id==='cat-birthday'?'Birthday':id==='cat-anniversary'?'Anniversary':'Reminder')}
// Feb 29 reminders fall on Feb 28 in non-leap years (same rule as the Calendar app).
function reminderHitsDateHub(r,date){
  const mm=date.slice(5,7),dd=date.slice(8,10);
  if(r.month===mm&&r.day===dd)return true;
  if(r.month==='02'&&r.day==='29'&&mm==='02'&&dd==='28'){const y=Number(date.slice(0,4));return !((y%4===0&&y%100!==0)||y%400===0)}
  return false;
}
function agendaItemsFor(date,isToday){
  const items=[],t=today();
  (state.reminders||[]).filter(r=>reminderHitsDateHub(r,date)).forEach(r=>{
    const cat=agCatName(r.categoryId);
    items.push({kind:'reminder',sort:-2,title:r.name+(cat==='Birthday'?"'s birthday":cat==='Anniversary'?' anniversary':' · '+cat),icon:cat==='Birthday'?'cake':cat==='Anniversary'?'heart':'bell'});
  });
  (state.events||[]).filter(e=>eventOccursOnHub(e,date)&&(isToday||!(e.recurring&&e.repeat&&e.repeat.type==='daily'))).forEach(e=>{
    items.push({kind:'event',sort:minutes(e.time),time:e.time||'',end:e.endTime||'',title:e.title||'Event',icon:e.kind==='task'?'check-square':'calendar',sub:e.location||''});
  });
  const tasks=(state.personalTasks||[]).map(x=>({...x,_shared:false})).concat((state.sharedTasks||[]).map(x=>({...x,_shared:true})));
  tasks.filter(x=>!x.done&&x.due&&(isToday?x.due<=date:x.due===date)&&(!x.startDate||x.startDate<=date)).forEach(x=>{
    const overdue=x.due<t;
    items.push({kind:'task',id:x.id,sort:overdue?-1:minutes(x.dueTime),time:x.dueTime||'',title:x.title,icon:'list-checks',tick:isToday,overdue,sub:overdue?'Overdue since '+new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(new Date(x.due+'T00:00:00')):(x._shared?'Shared':'')});
  });
  if(isToday)choresDueToday().forEach(c=>items.push({kind:'chore',id:c.id,sort:9000,title:c.name,icon:'sparkles',tick:true,overdue:c.overdue,sub:c.overdue?'Overdue':'Chore'}));
  return items.sort((a,b)=>a.sort-b.sort);
}
function agRowHtml(it){
  const lead=it.tick
    ?'<button type="button" class="task-check ag-tick" data-ag-kind="'+it.kind+'" data-ag-id="'+esc(it.id)+'" aria-label="Mark '+esc(it.title)+' done"><i data-lucide="check"></i></button>'
    :'<span class="ag-ico ag-'+it.kind+'"><i data-lucide="'+it.icon+'"></i></span>';
  const time=it.time?agFmtTime(it.time)+(it.end?' – '+agFmtTime(it.end):''):(it.kind==='reminder'?'All day':'');
  return '<div class="ag-row'+(it.overdue?' overdue':'')+'">'+lead+'<span class="ag-copy"><strong>'+esc(it.title)+'</strong>'+((time||it.sub)?'<small>'+esc([time,it.sub].filter(Boolean).join(' · '))+'</small>':'')+'</span></div>';
}
function renderAgendaInto(el){
  if(!el)return;
  const t=today(),todayItems=agendaItemsFor(t,true),fmtDay=d=>new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric'}).format(new Date(d+'T00:00:00'));
  let html='<div class="ag-box"><div class="ag-wrap"><div class="ag-col"><div class="ag-sec">Today · '+fmtDay(t)+'</div>'+(todayItems.length?todayItems.map(agRowHtml).join(''):'<div class="ag-empty">Nothing on the calendar today.</div>')+'</div>';
  let upcoming='',n=0;
  for(let i=1;i<=7;i++){
    const d=addDays(t,i),it=agendaItemsFor(d,false);if(!it.length)continue;
    n+=it.length;
    upcoming+='<div class="ag-day">'+(i===1?'Tomorrow':fmtDay(d))+'</div>'+it.map(agRowHtml).join('');
  }
  html+='<div class="ag-col"><div class="ag-sec">Next 7 days</div>'+(n?upcoming:'<div class="ag-empty">Nothing coming up this week.</div>')+'</div></div></div>';
  html+='<a class="widget-card-link" href="apps/calendar.html" data-profile-link>Open Calendar <i data-lucide="arrow-up-right"></i></a>';
  el.innerHTML=html;
  updateProfileLinks();if(window.lucide)lucide.createIcons();
  el.querySelectorAll('.ag-tick').forEach(b=>b.addEventListener('click',()=>{
    if(b.dataset.agKind==='task')completeTask(b.dataset.agId);
    else completeChoreFromWidget(b.dataset.agId,el,()=>renderAgendaInto(el));
  }));
}
const WIDGET_TYPES={
  schedule:{title:"Today's schedule",icon:'calendar-clock',desc:"Your planned blocks for today, same list as the Planner.",defaultSize:'lg',
    render(el){renderTimelineInto(el,todaysTimeline())}},
  priorities:{title:'Priorities',icon:'list-checks',desc:'Tasks due today — check them off right from the board.',defaultSize:'lg',
    headerAction:true, // shows the "+" quick-add button in this widget's own title bar — see renderWidgetBoard()
    render(el){renderTasksInto(el,dueTasks().slice(0,8))}},
  chores:{title:'Chores due today',icon:'sparkles',desc:'Household chores due or overdue today.',defaultSize:'md',
    render(el){renderChoresListInto(el,choresDueToday())}},
  training:{title:'Training',icon:'dumbbell',desc:"Whether today's workout check-in has been started.",defaultSize:'sm',
    render(el){el.innerHTML='<p style="margin:0 0 10px">'+(state.dailyLog?"Today's check-in is started.":'No check-in yet today.')+'</p><a class="widget-card-link" href="gym/index.html" data-profile-link>Open Gym <i data-lucide="arrow-up-right"></i></a>';updateProfileLinks();if(window.lucide)lucide.createIcons()}},
  quicklinks:{title:'Quick links',icon:'grid-2x2',desc:'Shortcuts to Training, Nutrition, and Household.',defaultSize:'wide',
    render(el){
      const chores=choresDueToday();
      const choresStatus=chores.length?chores.length+' chore'+(chores.length===1?'':'s')+' due today':'No chores due';
      const trainingStatus=state.dailyLog?"Today's check-in is started":"Open today's workout";
      el.innerHTML='<div class="qlinks-row">'+
        '<a href="gym/index.html" data-profile-link><span class="area-icon"><i data-lucide="dumbbell"></i></span><span><strong>Training</strong><small>'+esc(trainingStatus)+'</small></span><i data-lucide="chevron-right"></i></a>'+
        '<a href="apps/diet.html" data-profile-link><span class="area-icon"><i data-lucide="utensils"></i></span><span><strong>Nutrition</strong><small>Meals and daily targets</small></span><i data-lucide="chevron-right"></i></a>'+
        '<a href="apps/chores.html" data-profile-link><span class="area-icon"><i data-lucide="sparkles"></i></span><span><strong>Household</strong><small>'+esc(choresStatus)+'</small></span><i data-lucide="chevron-right"></i></a>'+
        '</div>';updateProfileLinks();if(window.lucide)lucide.createIcons()}},
  agenda:{title:'Calendar & reminders',icon:'calendar-days',desc:"Today's events, birthdays and reminders, tasks and chores to tick off, plus the next 7 days.",defaultSize:'lg',
    render(el){renderAgendaInto(el)}},
  focus:{title:'Focus today',icon:'timer',desc:"Minutes logged in Clock's focus timer today.",defaultSize:'sm',
    async render(el){
      wLoading(el);
      try{
        const ref=db.collection('users').doc(state.user.uid).collection('clock-profiles').doc(state.profile).collection('data').doc('focusSessions');
        const snap=await ref.get();
        const sessions=snap.exists?safeJson(snap.data().json,[]):[];
        const todayStr=new Date().toDateString();
        const mins=sessions.filter(s=>new Date(s.date).toDateString()===todayStr).reduce((s,x)=>s+(x.minutes||0),0);
        el.innerHTML='<strong style="display:block;font-size:26px;font-weight:700;letter-spacing:-.02em">'+mins+'<small style="font-size:13px;font-weight:600;color:var(--muted)"> min</small></strong><p style="margin:4px 0 10px;color:var(--muted)">focused today</p><a class="widget-card-link" href="apps/clock.html" data-profile-link>Open Clock <i data-lucide="arrow-up-right"></i></a>';
        updateProfileLinks();if(window.lucide)lucide.createIcons();
      }catch(e){el.innerHTML='<div class="empty-state"><strong>Unavailable</strong>Could not load focus time.</div>'}
    }},
  skin:{title:'Skin program',icon:'sparkle',desc:'Which day of your current skin program you’re on.',defaultSize:'sm',
    async render(el){
      wLoading(el);
      try{
        const ref=db.collection('users').doc(state.user.uid).collection('skin-profiles').doc(state.profile).collection('data').doc('programStart');
        const snap=await ref.get();
        const startDate=(snap.exists&&snap.data().startDate)||null;
        if(!startDate){el.innerHTML='<div class="empty-state"><strong>Not started</strong>No active skin program yet.</div>';return}
        const dayNum=Math.max(1,daysBetween(startDate,today())+1);
        el.innerHTML='<strong style="display:block;font-size:26px;font-weight:700;letter-spacing:-.02em">Day '+dayNum+'</strong><p style="margin:4px 0 10px;color:var(--muted)">of your skin program</p><a class="widget-card-link" href="apps/skin.html" data-profile-link>Open Skin <i data-lucide="arrow-up-right"></i></a>';
        updateProfileLinks();if(window.lucide)lucide.createIcons();
      }catch(e){el.innerHTML='<div class="empty-state"><strong>Unavailable</strong>Could not load skin program.</div>'}
    }},
  grocery:{title:'Grocery list',icon:'shopping-cart',desc:"How many items are still left to buy this week.",defaultSize:'sm',
    async render(el){
      wLoading(el);
      try{
        const ref=db.collection('users').doc(state.user.uid).collection('apps').doc('grocery-v4').collection('data').doc('modernState');
        const snap=await ref.get();
        const gState=snap.exists&&snap.data().json?safeJson(snap.data().json,null):null;
        const wk=gState&&gState.weeks&&gState.weeks[gState.activeWeek];
        const remaining=wk?wk.items.filter(i=>(i.purchasedQty||0)<(i.plannedQty||0)).length:0;
        el.innerHTML='<strong style="display:block;font-size:26px;font-weight:700;letter-spacing:-.02em">'+remaining+'</strong><p style="margin:4px 0 10px;color:var(--muted)">item'+(remaining===1?'':'s')+' still to buy</p><a class="widget-card-link" href="apps/grocery.html" data-profile-link>Open Grocery <i data-lucide="arrow-up-right"></i></a>';
        updateProfileLinks();if(window.lucide)lucide.createIcons();
      }catch(e){el.innerHTML='<div class="empty-state"><strong>Unavailable</strong>Could not load the grocery list.</div>'}
    }},
  budget:{title:'Budget',icon:'piggy-bank',desc:"This month's spending vs. your category budgets, personal + shared combined.",defaultSize:'md',
    async render(el){
      wLoading(el);
      try{
        const uid=state.user.uid;
        const [pt,st,pc,sc]=await Promise.all([
          db.collection('users').doc(uid).collection('budget-profiles').doc(state.profile).collection('data').doc('transactions').get().catch(()=>null),
          db.collection('users').doc(uid).collection('budget-shared').doc('transactions').get().catch(()=>null),
          db.collection('users').doc(uid).collection('budget-profiles').doc(state.profile).collection('data').doc('categories').get().catch(()=>null),
          db.collection('users').doc(uid).collection('budget-shared').doc('categories').get().catch(()=>null)
        ]);
        const personalTxns=(pt&&pt.exists&&pt.data().json)?safeJson(pt.data().json,[]):[];
        const sharedTxns=(st&&st.exists&&st.data().json)?safeJson(st.data().json,[]):[];
        const personalCats=(pc&&pc.exists&&pc.data().json)?safeJson(pc.data().json,[]):[];
        const sharedCats=(sc&&sc.exists&&sc.data().json)?safeJson(sc.data().json,[]):[];
        const monthKey=today().slice(0,7);
        const spentIn=txns=>txns.filter(t=>t.type==='expense'&&(t.date||'').slice(0,7)===monthKey).reduce((s,t)=>s+(Number(t.amount)||0),0);
        const spent=spentIn(personalTxns)+spentIn(sharedTxns);
        const budget=personalCats.concat(sharedCats).reduce((s,c)=>s+(Number(c.budget)||0),0);
        const remaining=budget-spent;
        const fmt=n=>'$'+(Number(n)||0).toLocaleString(undefined,{maximumFractionDigits:0});
        // Top categories this month, personal + shared combined, for a quick
        // "where did it go" glance without opening the full app.
        const byCat={};
        [{list:personalTxns,cats:personalCats},{list:sharedTxns,cats:sharedCats}].forEach(({list,cats})=>{
          list.filter(t=>t.type==='expense'&&(t.date||'').slice(0,7)===monthKey).forEach(t=>{
            const cat=cats.find(c=>c.id===t.categoryId);
            const name=cat?cat.name:'Uncategorized';
            byCat[name]=(byCat[name]||0)+(Number(t.amount)||0);
          });
        });
        const topCats=Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,3);
        el.innerHTML='<strong style="display:block;font-size:26px;font-weight:700;letter-spacing:-.02em">'+fmt(spent)+'</strong>'+
          '<p style="margin:4px 0 10px;color:var(--muted)">spent this month'+(budget>0?(remaining<0?' · '+fmt(-remaining)+' over budget':' · '+fmt(remaining)+' left'):'')+'</p>'+
          (topCats.length?'<div style="display:flex;flex-direction:column;gap:4px;margin-bottom:10px">'+topCats.map(([name,amt])=>'<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted)"><span>'+esc(name)+'</span><strong style="color:var(--text)">'+fmt(amt)+'</strong></div>').join('')+'</div>':'')+
          '<a class="widget-card-link" href="apps/budget.html" data-profile-link>Open Budget <i data-lucide="arrow-up-right"></i></a>';
        updateProfileLinks();if(window.lucide)lucide.createIcons();
      }catch(e){el.innerHTML='<div class="empty-state"><strong>Unavailable</strong>Could not load your budget.</div>'}
    }},
  pledge:{title:'Pledge',icon:'flag',desc:"Today's pledges, ticked automatically from your apps, and the prizes riding on them.",defaultSize:'md',
    async render(el){
      wLoading(el);
      try{
        const snap=await db.collection('users').doc(state.user.uid).collection('apps').doc('pledge-v3').collection('data').doc('state').get();
        const ps=(snap.exists&&snap.data().json)?safeJson(snap.data().json,null):null;
        const t=(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})();
        const due=((ps&&ps.pledges)||[]).filter(p=>!p.deleted&&!p.claimed&&p.owner===state.profile&&p.start&&t>=p.start&&t<=addDays(p.start,(p.length||(p.weeks||4)*7)-1)&&p.mode!=='milestone'&&(p.mode==='perweek'||(p.days||[]).includes(new Date(t+'T12:00:00').getDay())));
        if(!due.length){el.innerHTML='<div class="empty-state"><strong>Nothing pledged for today</strong>Make a pledge, or enjoy the rest day.</div><a class="widget-card-link" href="apps/pledge.html" data-profile-link>Open Pledge <i data-lucide="arrow-up-right"></i></a>';updateProfileLinks();if(window.lucide)lucide.createIcons();return}
        const done=due.filter(p=>p.log&&p.log[t]).length;
        el.innerHTML='<strong style="display:block;font-size:26px;font-weight:700;letter-spacing:-.02em">'+done+' / '+due.length+'</strong>'+
          '<p style="margin:4px 0 10px;color:var(--muted)">pledges kept today</p>'+
          due.slice(0,4).map(p=>'<div style="font-size:13px;margin-bottom:4px">'+((p.log&&p.log[t])?'✓ ':'○ ')+esc(p.title)+'</div>').join('')+
          '<a class="widget-card-link" href="apps/pledge.html" data-profile-link style="margin-top:8px">Open Pledge <i data-lucide="arrow-up-right"></i></a>';
        updateProfileLinks();if(window.lucide)lucide.createIcons();
      }catch(e){el.innerHTML='<div class="empty-state"><strong>Unavailable</strong>Could not load Pledge.</div>'}
    }},
  checklist:{title:'Checklists',icon:'square-check-big',desc:"Make and tick checklists right here: sub-items, undo, history, templates, shared with Anusha, due dates.",defaultSize:'lg',
    render(el){
      const src='apps/checklist.html?widget=1&profile='+encodeURIComponent(state.profile);
      const cur=el.querySelector('iframe.cl-frame');
      if(cur&&cur.getAttribute('src')===src)return; // keep what you were doing; the page syncs itself
      el.innerHTML='<iframe class="cl-frame" title="Checklists" src="'+src+'" style="width:100%;height:100%;min-height:420px;border:0;display:block;background:transparent"></iframe>';
    }},
  taskmap:{title:'Task order map',icon:'git-branch',desc:"The same level-by-level order map from the To-Do app's Map view — see what's next and what's still waiting on something else, right from Today.",defaultSize:'lg',
    async render(el){
      wLoading(el);
      try{
        const uid=state.user.uid;
        const [pt,st]=await Promise.all([
          db.collection('users').doc(uid).collection('todo-profiles').doc(state.profile).collection('data').doc('tasks').get().catch(()=>null),
          db.collection('users').doc(uid).collection('todo-shared').doc('tasks').get().catch(()=>null)
        ]);
        const personalTasks=(pt&&pt.exists&&pt.data().json)?safeJson(pt.data().json,[]):[];
        const sharedTasks=(st&&st.exists&&st.data().json)?safeJson(st.data().json,[]):[];
        const all=personalTasks.concat(sharedTasks);
        const findById=id=>all.find(t=>t.id===id);
        const isBlocked=t=>(t.dependsOn||[]).some(depId=>{const d=findById(depId);return d&&!d.done});
        const blockerNames=t=>(t.dependsOn||[]).map(depId=>findById(depId)).filter(d=>d&&!d.done).map(d=>d.title);
        const levelMemo={};
        const level=(id,visiting)=>{
          visiting=visiting||{};
          if(levelMemo.hasOwnProperty(id))return levelMemo[id];
          if(visiting[id])return 0;
          visiting[id]=true;
          const found=findById(id);
          const deps=(found&&found.dependsOn)||[];
          let lvl=0;
          deps.forEach(depId=>{if(findById(depId))lvl=Math.max(lvl,level(depId,visiting)+1)});
          levelMemo[id]=lvl;
          return lvl;
        };
        // Only not-yet-done tasks — this is a glanceable "what's next" view,
        // not the full editable map (that's still the To-Do app's own Map
        // view, which this widget links out to).
        const active=all.filter(t=>!t.done);
        if(!active.length){
          el.innerHTML='<div class="empty-state"><strong>All clear</strong>No open tasks to map right now.</div>';
          return;
        }
        const byLevel={};
        active.forEach(t=>{(byLevel[level(t.id)]=byLevel[level(t.id)]||[]).push(t)});
        const levels=Object.keys(byLevel).map(Number).sort((a,b)=>a-b);
        el.innerHTML='<div class="taskmap-widget-scroll"><div class="taskmap-widget-cols">'+
          levels.map(lvl=>'<div class="taskmap-widget-col"><div class="taskmap-widget-col-label">Level '+(lvl+1)+'</div>'+
            byLevel[lvl].map(t=>{
              const blocked=isBlocked(t);
              return '<div class="taskmap-widget-node'+(blocked?' blocked':'')+'">'+
                '<div class="taskmap-widget-node-title">'+esc(t.title)+'</div>'+
                (blocked?'<div class="taskmap-widget-node-lock">🔒 '+esc(blockerNames(t).join(', '))+'</div>':'')+
              '</div>';
            }).join('')+
          '</div>').join('')+
        '</div></div>'+
        '<a class="widget-card-link" href="apps/todo.html" data-profile-link>Open full Map <i data-lucide="arrow-up-right"></i></a>';
        updateProfileLinks();if(window.lucide)lucide.createIcons();
      }catch(e){el.innerHTML='<div class="empty-state"><strong>Unavailable</strong>Could not load the task map.</div>'}
    }},
  photos:{title:'Photo widget',icon:'image',desc:'Your own little rotating gallery — add a batch of photos, shuffle them, or let it play on its own. Add as many of these as you like.',defaultSize:'lg',bare:true,multiple:true,
    render(el,w){renderPhotoWidgetInto(el,w.id)}},
  notes:{title:'Sticky notes',icon:'sticky-note',desc:'The same sticky notes as your To-Do app — write one here or there and it stays in sync both ways.',defaultSize:'md',
    render(el){renderNotesWidgetInto(el)}},
  water:{title:'Water',icon:'droplets',desc:'Tap to log a cup or a bottle, see how close you are to your daily goal, and keep a streak going.',defaultSize:'md',
    render(el){renderWaterInto(el)}}
};
/* ---- Water tracker: log is {date:[amountsInMl]} so the last tap can be undone; goal + unit are per profile.
   Stored at users/{uid}/hub-profiles/{profile}/data/water. ---- */
const OZ_ML=29.5735;
async function ensureWater(){
  if(state.water && state.waterProfile===state.profile) return;
  let v=null;
  try{ const snap=await profileRef('hub-profiles','water').get(); v=snap.exists?safeJson(snap.data().json,null):null; }catch(e){}
  if(!v||typeof v!=='object') v={};
  v.goal=Number(v.goal)>0?Number(v.goal):(/anusha/i.test(state.profile||'')?3000:3500); v.unit=v.unit==='oz'?'oz':'ml'; v.log=(v.log&&typeof v.log==='object')?v.log:{};
  state.water=v; state.waterProfile=state.profile;
}
let waterSaveTimer=null;
function saveWater(){
  clearTimeout(waterSaveTimer);
  const prof=state.profile, data=state.water;
  waterSaveTimer=setTimeout(async()=>{
    const keep=Object.keys(data.log).sort().slice(-90); const log={}; keep.forEach(k=>log[k]=data.log[k]); data.log=log;
    try{ await db.collection('users').doc(state.user.uid).collection('hub-profiles').doc(prof).collection('data').doc('water').set({json:JSON.stringify(data)}); }catch(e){}
  },400);
}
/* ---- Water <-> Gym sync. The Gym check-in keeps water in litres at profiles/{p}/dailyLogs/{date}.water.
   That is the shared record: the widget reads it, adopts any change made in Gym, and writes every tap back.
   w.sync[date] remembers the total (ml) both sides last agreed on, so we can tell who changed. ---- */
function gymWaterDoc(prof,d){ return gymDailyLogsCol(prof).doc(d); }
async function reconcileWater(days){
  const w=state.water, prof=state.profile; if(!w||!prof) return;
  w.sync=(w.sync&&typeof w.sync==='object')?w.sync:{};
  let changed=false;
  await Promise.all(days.map(async d=>{
    let gymMl=0, exists=false;
    try{ const s=await gymWaterDoc(prof,d).get(); exists=s.exists; gymMl=exists?Math.round((Number(s.data().water)||0)*1000):0; }catch(e){ return; }
    const hubMl=waterTotal(d), base=w.sync[d];
    if(base===undefined){
      if(gymMl===hubMl){ w.sync[d]=gymMl; changed=true; return; }
      if(gymMl>0){ w.log[d]=[gymMl]; w.sync[d]=gymMl; changed=true; return; }
      await pushWaterToGym(prof,d,hubMl); w.sync[d]=hubMl; changed=true; return;
    }
    if(gymMl!==base){ w.log[d]=gymMl>0?[gymMl]:[]; w.sync[d]=gymMl; changed=true; }
    else if(hubMl!==base){ await pushWaterToGym(prof,d,hubMl); w.sync[d]=hubMl; changed=true; }
  }));
  if(changed) saveWater();
}
async function pushWaterToGym(prof,d,ml){
  try{ await gymWaterDoc(prof,d).set({date:d,water:Math.round(ml/10)/100},{merge:true}); FsCache.patch(gymDailyLogsCol(prof).path,d,{date:d,water:Math.round(ml/10)/100},{merge:true}); }catch(e){}
}
function pantryWater(d){ if(window.WaterPantry&&state.user&&state.profile) WaterPantry.sync(db,state.user.uid,state.profile,d,waterTotal(d)); }
function waterTotal(date){ const a=state.water.log[date]; return Array.isArray(a)?a.reduce((s,x)=>s+(Number(x)||0),0):0; }
function waterFmt(ml){ return state.water.unit==='oz'?Math.round(ml/OZ_ML)+' oz':Math.round(ml).toLocaleString()+' ml'; }
let waterPastDoneFor='';
async function renderWaterInto(el){
  if(!el)return;
  await ensureWater();
  { const dd=today(); /* today every time (1 read); the six days before it only once per day per session, they rarely change */ const full=waterPastDoneFor!==dd; waterPastDoneFor=dd; await reconcileWater(full?Array.from({length:7},(_,i)=>addDays(dd,i-6)):[dd]); pantryWater(dd); }
  const w=state.water, d=today(), total=waterTotal(d), pct=Math.min(100,Math.round(total/w.goal*100));
  let streak=0, cur=total>=w.goal?d:addDays(d,-1);
  while(waterTotal(cur)>=w.goal&&streak<400){streak++;cur=addDays(cur,-1)}
  const days=Array.from({length:7},(_,i)=>addDays(d,i-6));
  const bars=days.map(x=>{const t=waterTotal(x);const h=Math.max(4,Math.min(100,Math.round(t/w.goal*100)));return '<span class="water-bar'+(t>=w.goal?' hit':'')+(x===d?' today':'')+'" style="height:'+h+'%" title="'+esc(x)+': '+esc(waterFmt(t))+'"></span>'}).join('');
  const cup=w.unit==='oz'?Math.round(8*OZ_ML):250, bottle=w.unit==='oz'?Math.round(17*OZ_ML):500;
  el.innerHTML='<div class="water-top"><strong class="water-num">'+esc(waterFmt(total))+'</strong><span class="water-goal">of '+esc(waterFmt(w.goal))+(pct>=100?' · goal hit':'')+'</span></div>'+
    '<div class="water-track"><i style="width:'+pct+'%"></i></div>'+
    '<div class="water-btns"><button type="button" data-water-add="'+cup+'">+ Cup<small>'+(w.unit==='oz'?'8 oz':'250 ml')+'</small></button><button type="button" data-water-add="'+bottle+'">+ Bottle<small>'+(w.unit==='oz'?'17 oz':'500 ml')+'</small></button><button type="button" data-water-custom>+ Custom</button></div>'+
    '<div class="water-foot"><div class="water-week">'+bars+'</div><div class="water-meta">'+(streak?'<b>'+streak+'</b> day streak':'No streak yet')+'<br><button type="button" data-water-undo>Undo</button> · <button type="button" data-water-settings>Goal</button></div></div>';
  const syncToday=()=>{ w.sync=w.sync||{}; const t=waterTotal(d); w.sync[d]=t; pantryWater(d); return pushWaterToGym(state.profile,d,t); };
  const add=async ml=>{ (w.log[d]=Array.isArray(w.log[d])?w.log[d]:[]).push(Math.round(ml)); await syncToday(); saveWater(); renderWaterInto(el); };
  el.onclick=e=>{
    const a=e.target.closest('[data-water-add]'); if(a){ add(Number(a.dataset.waterAdd)); return; }
    if(e.target.closest('[data-water-custom]')){
      const v=parseFloat(prompt('How much did you drink ('+w.unit+')?',''));
      if(v>0&&v<5000) add(w.unit==='oz'?v*OZ_ML:v); return;
    }
    if(e.target.closest('[data-water-undo]')){ const arr=w.log[d]; if(Array.isArray(arr)&&arr.length){ arr.pop(); syncToday().then(()=>{ saveWater(); renderWaterInto(el); }); } return; }
    if(e.target.closest('[data-water-settings]')){
      const unit=(prompt('Units: type ml or oz',w.unit)||'').trim().toLowerCase();
      if(unit==='ml'||unit==='oz') w.unit=unit; else if(unit) toast('Use ml or oz');
      const cur=w.unit==='oz'?Math.round(w.goal/OZ_ML):w.goal;
      const g=parseFloat(prompt('Daily goal ('+w.unit+')',String(cur)));
      if(g>0&&g<20000){ w.goal=Math.round(w.unit==='oz'?g*OZ_ML:g); w.goalSet=true; }
      saveWater(); renderWaterInto(el);
    }
  };
  if(window.lucide)lucide.createIcons();
}
/* ---- Photo widget: a small self-contained gallery, its own upload +
   shuffle + slideshow logic rather than a generic "widget data" blob,
   since photos are genuinely different from every other widget (a list of
   images the person keeps adding to, not a read-only view of another
   app's data). Unlike every other widget type, this one can be added to
   the board more than once (WIDGET_TYPES.photos.multiple — see
   renderWidgetCatalog) — each instance keeps its own separate library,
   order, shuffle and play state, keyed by that widget's own id. All
   instances' photos still live together in one Firestore doc
   (users/{uid}/hub-profiles/{profile}/data/photos, as {byWidget:{[id]:
   photos[]}}) since they're small and share the per-profile scoping, so
   the size budget below is a combined total across every instance, not
   per widget. ---- */
const PHOTO_MAX_COUNT=24; // per widget instance
const PHOTO_MAX_BASE64_TOTAL=900000; // combined across every photo widget instance — keeps the shared doc under Firestore's ~1MiB cap
let photoWidgetRuntime={}; // { [widgetId]: {order,pos,shuffle,playing,timer} } — browsing/playback state, not persisted
function pwRuntime(widgetId){
  return photoWidgetRuntime[widgetId] || (photoWidgetRuntime[widgetId]={order:[],pos:0,shuffle:false,playing:false,timer:null});
}
function photoWidgetPhotos(widgetId){
  return state.photosByWidget[widgetId] || (state.photosByWidget[widgetId]=[]);
}
function photoWidgetBuildOrder(widgetId){
  const rt=pwRuntime(widgetId);
  const idx=photoWidgetPhotos(widgetId).map((_,i)=>i);
  if(rt.shuffle){
    for(let i=idx.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[idx[i],idx[j]]=[idx[j],idx[i]];}
  }
  rt.order=idx;
  rt.pos=0;
}
async function savePhotoWidgets(){try{await profileRef('hub-profiles','photos').set({json:JSON.stringify({byWidget:state.photosByWidget})})}catch(e){}}
function renderPhotoWidgetInto(el,widgetId){
  if(!el)return;
  const rt=pwRuntime(widgetId);
  if(rt.timer){clearInterval(rt.timer);rt.timer=null}
  const photos=photoWidgetPhotos(widgetId);
  if(!photos.length){
    el.innerHTML='<div class="photo-widget"><div class="empty-state"><strong>No photos yet</strong>Add a few to start a little slideshow right here.'+
      '<button type="button" class="button secondary photo-widget-add-empty" data-photo-add><i data-lucide="plus"></i><span>Add photos</span></button></div>'+
      '<input type="file" accept="image/*" multiple hidden data-photo-file></div>';
    if(window.lucide)lucide.createIcons();
    el.querySelector('[data-photo-add]').addEventListener('click',()=>el.querySelector('[data-photo-file]').click());
    el.querySelector('[data-photo-file]').addEventListener('change',e=>{handlePhotoWidgetUpload(e.target.files,el,widgetId);e.target.value=''});
    return;
  }
  if(rt.order.length!==photos.length)photoWidgetBuildOrder(widgetId);
  rt.pos=((rt.pos%rt.order.length)+rt.order.length)%rt.order.length;
  const currentIdx=rt.order[rt.pos];
  const photo=photos[currentIdx];
  el.innerHTML='<div class="photo-widget">'+
    '<div class="photo-widget-frame"><img src="'+photo.src+'" alt=""></div>'+
    '<div class="photo-widget-controls">'+
      '<button type="button" class="icon-button" data-photo-prev title="Previous photo"'+(photos.length<2?' disabled':'')+'><i data-lucide="chevron-left"></i></button>'+
      '<button type="button" class="icon-button" data-photo-play title="'+(rt.playing?'Pause slideshow':'Play slideshow')+'"'+(photos.length<2?' disabled':'')+'><i data-lucide="'+(rt.playing?'pause':'play')+'"></i></button>'+
      '<button type="button" class="icon-button" data-photo-next title="Next photo"'+(photos.length<2?' disabled':'')+'><i data-lucide="chevron-right"></i></button>'+
      '<button type="button" class="icon-button'+(rt.shuffle?' active':'')+'" data-photo-shuffle title="Shuffle"'+(photos.length<2?' disabled':'')+'><i data-lucide="shuffle"></i></button>'+
      '<span class="photo-widget-count">'+(rt.pos+1)+' / '+photos.length+'</span>'+
      '<button type="button" class="icon-button" data-photo-add title="Add photos"><i data-lucide="plus"></i></button>'+
      '<button type="button" class="icon-button" data-photo-remove title="Remove this photo"><i data-lucide="trash-2"></i></button>'+
    '</div>'+
    '<input type="file" accept="image/*" multiple hidden data-photo-file>'+
  '</div>';
  if(window.lucide)lucide.createIcons();
  const advance=dir=>{ rt.pos+=dir; renderPhotoWidgetInto(el,widgetId); };
  el.querySelector('[data-photo-prev]').addEventListener('click',()=>advance(-1));
  el.querySelector('[data-photo-next]').addEventListener('click',()=>advance(1));
  el.querySelector('[data-photo-shuffle]').addEventListener('click',()=>{ rt.shuffle=!rt.shuffle; photoWidgetBuildOrder(widgetId); renderPhotoWidgetInto(el,widgetId); });
  el.querySelector('[data-photo-play]').addEventListener('click',()=>{ rt.playing=!rt.playing; renderPhotoWidgetInto(el,widgetId); });
  el.querySelector('[data-photo-add]').addEventListener('click',()=>el.querySelector('[data-photo-file]').click());
  el.querySelector('[data-photo-file]').addEventListener('change',e=>{handlePhotoWidgetUpload(e.target.files,el,widgetId);e.target.value=''});
  el.querySelector('[data-photo-remove]').addEventListener('click',()=>{
    photos.splice(currentIdx,1);
    rt.order=[];
    savePhotoWidgets();
    renderPhotoWidgetInto(el,widgetId);
  });
  if(rt.playing&&photos.length>1){
    rt.timer=setInterval(()=>advance(1),4500);
  }
}
function allPhotoWidgetsTotalLength(){
  return Object.values(state.photosByWidget).reduce((sum,photos)=>sum+photos.reduce((s,p)=>s+p.src.length,0),0);
}
async function handlePhotoWidgetUpload(fileList,el,widgetId){
  const files=Array.from(fileList||[]).filter(f=>/^image\//.test(f.type));
  if(!files.length)return;
  const photos=photoWidgetPhotos(widgetId);
  if(photos.length>=PHOTO_MAX_COUNT){toast('Your photo widget is full — remove a few first');return}
  let added=0,skippedForSize=false;
  for(const file of files){
    if(photos.length>=PHOTO_MAX_COUNT)break;
    try{
      const img=await fileToImage(file);
      const dataUrl=compressImageToDataUrl(img,900,160000);
      if(!dataUrl)continue;
      const totalLen=allPhotoWidgetsTotalLength()+dataUrl.length;
      if(totalLen>PHOTO_MAX_BASE64_TOTAL){skippedForSize=true;break}
      photos.push({id:'ph-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),src:dataUrl});
      added++;
    }catch(e){console.warn(e)}
  }
  if(added){ pwRuntime(widgetId).order=[]; await savePhotoWidgets(); }
  if(skippedForSize)toast(added?added+' photo'+(added===1?'':'s')+' added — your library is getting full, so the rest were skipped':'Your photo library is full — remove a few or try smaller photos');
  renderPhotoWidgetInto(el,widgetId);
}
/* ---- Sticky notes widget: shows the exact same notes as the To-Do app's
   Sticky Notes (apps/todo.html), not a separate copy. Both read/write the
   one Firestore doc at todo-profiles/{profile}/data/stickyNotes — here via
   profileRef('todo-profiles','stickyNotes'), there via todo.html's own
   profileDoc(activeProfile,'stickyNotes'), which resolves to the identical
   path. A live onSnapshot listener (same pattern as startHubAlarmWatch
   below) means a note added/edited in one place shows up in the other
   without needing a reload — genuinely synced, not just "same data on next
   visit". ---- */
const HUB_NOTE_COLORS=['#F6E7A6','#F1D7DE','#D9E8D3','#DCE6EE','#E6DCF0','#F2DFC7'];
const HUB_NOTE_FONTS=[{value:'',label:'Font…'},{value:'Georgia, serif',label:'Serif'},{value:"'Courier New', monospace",label:'Mono'},{value:"'Caveat', cursive",label:'Handwritten'},{value:"'Comic Sans MS', cursive",label:'Casual'}];
const HUB_NOTE_LIST_STYLES=[{value:'',label:'Style…'},{value:'decimal',label:'1, 2, 3'},{value:'lower-alpha',label:'a, b, c'},{value:'upper-roman',label:'I, II, III'},{value:'disc',label:'• Bullet'},{value:'circle',label:'○ Circle'},{value:'square',label:'▪ Square'}];
// Notes were plain text (a <textarea>) before rich formatting existed. A
// note already saved as plain text has no HTML tags in it at all, so it's
// escaped for safe display; a note that's been through the new toolbar has
// real <b>/<i>/<u>/<ul>/<ol>/<font>/<span> tags in it and is trusted as-is.
// This one check is how old notes keep displaying correctly without a
// one-time migration step.
function hubNoteDisplayHtml(text){
  if(!text)return'';
  return /<\/?(b|i|u|font|span|ul|ol|li)[ \/>]/i.test(text)?text:esc(text);
}
let hubStickyNotes=[];
let hubStickyNotesUnsub=null;
// Tracks the json we most recently wrote ourselves. onSnapshot fires again
// the instant that write lands (even just the local-cache echo of our own
// set()), and re-rendering on every single one of those was wiping out and
// rebuilding the whole widget's DOM mid-keystroke — destroying the textarea
// you were actively focused in/typing into, which is what looked like the
// cursor "exiting" the widget. If the incoming data is exactly what we just
// saved, there's nothing new to show, so skip the rebuild entirely; a
// genuine change (from another device/tab) always has different json and
// still re-renders normally.
let hubStickyNotesLastSyncedJson=null;
function startHubNotesWatch(){
  if(hubStickyNotesUnsub){ try{hubStickyNotesUnsub();}catch(e){} hubStickyNotesUnsub=null; }
  hubStickyNotes=[];
  hubStickyNotesLastSyncedJson=null;
  if(!state.user||!state.profile) return;
  try{
    hubStickyNotesUnsub=profileRef('todo-profiles','stickyNotes').onSnapshot(doc=>{
      const json=(doc.exists&&doc.data().json)?doc.data().json:'[]';
      if(json===hubStickyNotesLastSyncedJson) return;
      hubStickyNotesLastSyncedJson=json;
      hubStickyNotes=safeJson(json,[]);
      document.querySelectorAll('[data-widget-type="notes"] .widget-card-body').forEach(el=>renderNotesWidgetInto(el));
    },()=>{});
  }catch(e){}
}
async function saveHubStickyNotes(){
  const json=JSON.stringify(hubStickyNotes);
  hubStickyNotesLastSyncedJson=json;
  try{await profileRef('todo-profiles','stickyNotes').set({json});}catch(e){toast('Could not save note — try again')}
}
function renderNotesWidgetInto(el){
  if(!el)return;
  el.innerHTML='<div class="hub-notes-widget">'+
    '<button type="button" class="hub-note-add-btn" data-hubnote-add><i data-lucide="plus"></i><span>New note</span></button>'+
    '<div class="hub-notes-list">'+
      (hubStickyNotes.length?hubStickyNotes.map(n=>
        '<div class="hub-note-card" style="background:'+esc(n.color)+';" data-hubnote="'+esc(n.id)+'">'+
          '<div class="hub-note-toolbar">'+
            '<button type="button" data-notecmd="bold" title="Bold (Ctrl+B)"><i data-lucide="bold"></i></button>'+
            '<button type="button" data-notecmd="italic" title="Italic (Ctrl+I)"><i data-lucide="italic"></i></button>'+
            '<button type="button" data-notecmd="underline" title="Underline (Ctrl+U)"><i data-lucide="underline"></i></button>'+
            '<span class="hub-note-sep"></span>'+
            '<button type="button" data-notecmd="insertUnorderedList" title="Bullet list"><i data-lucide="list"></i></button>'+
            '<button type="button" data-notecmd="insertOrderedList" title="Numbered list"><i data-lucide="list-ordered"></i></button>'+
            '<select data-noteliststyle title="Numbering / bullet style">'+HUB_NOTE_LIST_STYLES.map(f=>'<option value="'+f.value+'">'+f.label+'</option>').join('')+'</select>'+
            '<select data-notefont title="Font">'+HUB_NOTE_FONTS.map(f=>'<option value="'+esc(f.value)+'">'+f.label+'</option>').join('')+'</select>'+
          '</div>'+
          '<div class="hub-note-text" contenteditable="true" data-hubnotetext="'+esc(n.id)+'" data-placeholder="Write anything…">'+hubNoteDisplayHtml(n.text)+'</div>'+
          '<div class="hub-note-footer"><div class="hub-note-colors">'+HUB_NOTE_COLORS.map(c=>
            '<span class="hub-note-dot'+(n.color===c?' selected':'')+'" style="background:'+c+';" data-hubnotecolor="'+esc(n.id)+'" data-color="'+c+'"></span>'
          ).join('')+'</div><button type="button" class="hub-note-del-btn" data-hubnotedel="'+esc(n.id)+'" title="Delete note"><i data-lucide="x"></i></button></div>'+
        '</div>'
      ).join(''):'<div class="empty-state"><strong>No notes yet</strong>Jot anything down — it shows up in your To-Do app too.</div>')+
    '</div>'+
  '</div>';
  if(window.lucide)lucide.createIcons();
  el.querySelector('[data-hubnote-add]').addEventListener('click',async()=>{
    hubStickyNotes.unshift({id:'note-'+Date.now(),text:'',color:HUB_NOTE_COLORS[Math.floor(Math.random()*HUB_NOTE_COLORS.length)]});
    await saveHubStickyNotes();
    renderNotesWidgetInto(el);
    const first=el.querySelector('[data-hubnotetext]');
    if(first)first.focus();
  });
  el.querySelectorAll('.hub-note-card').forEach(card=>{
    const id=card.dataset.hubnote;
    const textEl=card.querySelector('[data-hubnotetext]');
    let debounce;
    const commit=()=>{
      clearTimeout(debounce);
      debounce=setTimeout(async()=>{
        const n=hubStickyNotes.find(x=>x.id===id);
        if(n){n.text=textEl.innerHTML;await saveHubStickyNotes();}
      },400);
    };
    // Toolbar buttons show whether bold/italic/underline is "on" at the
    // cursor — without this there was no way to tell a format had taken
    // until you looked at the text itself, which read as the toolbar just
    // not working.
    const updateToolbarState=()=>{
      try{
        const b=card.querySelector('[data-notecmd="bold"]'),i=card.querySelector('[data-notecmd="italic"]'),u=card.querySelector('[data-notecmd="underline"]');
        if(b)b.classList.toggle('active',document.queryCommandState('bold'));
        if(i)i.classList.toggle('active',document.queryCommandState('italic'));
        if(u)u.classList.toggle('active',document.queryCommandState('underline'));
      }catch(e){}
    };
    textEl.addEventListener('input',commit);
    textEl.addEventListener('keyup',updateToolbarState);
    textEl.addEventListener('mouseup',updateToolbarState);
    textEl.addEventListener('focus',updateToolbarState);
    // Pasting from anywhere else (an email, a webpage, another app) used to
    // drag in that source's own fonts, colors and sizes along with the
    // text — a note could suddenly have five different fonts in it and
    // look broken. This strips all of that and keeps only the plain text,
    // which then picks up this note's own formatting normally.
    textEl.addEventListener('paste',e=>{
      e.preventDefault();
      const text=(e.clipboardData||window.clipboardData).getData('text/plain');
      document.execCommand('insertText',false,text);
      commit();
    });
    textEl.addEventListener('keydown',e=>{
      const mod=e.ctrlKey||e.metaKey;
      if(!mod)return;
      const k=e.key.toLowerCase();
      if(k==='b'||k==='i'||k==='u'){
        e.preventDefault();
        document.execCommand(k==='b'?'bold':k==='i'?'italic':'underline');
        commit();
        updateToolbarState();
      }
    });
    card.querySelectorAll('[data-notecmd]').forEach(btn=>{
      btn.addEventListener('mousedown',e=>e.preventDefault());
      btn.addEventListener('click',()=>{
        textEl.focus();
        document.execCommand(btn.dataset.notecmd);
        commit();
        updateToolbarState();
      });
    });
    const listStyleSel=card.querySelector('[data-noteliststyle]');
    if(listStyleSel)listStyleSel.addEventListener('change',()=>{
      const style=listStyleSel.value;
      listStyleSel.value='';
      if(!style)return;
      textEl.focus();
      const sel=window.getSelection();
      let node=sel&&sel.rangeCount?sel.getRangeAt(0).startContainer:null;
      while(node&&node!==textEl&&node.nodeName!=='OL'&&node.nodeName!=='UL')node=node.parentNode;
      if(node&&(node.nodeName==='OL'||node.nodeName==='UL'))node.style.listStyleType=style;
      commit();
    });
    const fontSel=card.querySelector('[data-notefont]');
    if(fontSel)fontSel.addEventListener('change',()=>{
      const font=fontSel.value;
      fontSel.value='';
      if(!font)return;
      textEl.focus();
      document.execCommand('fontName',false,font);
      commit();
    });
  });
  el.querySelectorAll('[data-hubnotecolor]').forEach(dot=>{
    dot.addEventListener('click',async()=>{
      const n=hubStickyNotes.find(x=>x.id===dot.dataset.hubnotecolor);
      if(n){n.color=dot.dataset.color;await saveHubStickyNotes();renderNotesWidgetInto(el);}
    });
  });
  el.querySelectorAll('[data-hubnotedel]').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      hubStickyNotes=hubStickyNotes.filter(x=>x.id!==btn.dataset.hubnotedel);
      await saveHubStickyNotes();
      renderNotesWidgetInto(el);
    });
  });
}
let saveWidgetsTimer=null;
function saveWidgetLayout(){
  clearTimeout(saveWidgetsTimer);
  saveWidgetsTimer=setTimeout(async ()=>{
    try{
      const snap=await hubRef('widgets').get();
      const raw=snap.exists?safeJson(snap.data().json,{}):{};
      raw[state.profile]=state.widgets;
      await hubRef('widgets').set({json:JSON.stringify(raw)});
    }catch(e){}
  },250);
}
let widgetDragId=null;
let widgetEditMode=false;
// True for the duration of any drag/resize gesture, plus a short tail
// after pointerup — a drag that ends over the bare board background (not
// over a card) still makes the browser fire a synthetic "click" on the
// board itself, which would otherwise be mistaken for an intentional tap
// on empty space to exit edit mode.
let widgetGestureActive=false;
// "Jiggle mode" — nothing on a widget (drag handle, remove badge, resize
// handle) is visible or interactive until you press and hold, same as
// rearranging icons on an iPhone home screen. Exited via the Done button
// (or tapping empty board space), not by a second press.
function widgetSetEditMode(on){
  widgetEditMode=on;
  const board=$('widget-board');if(board)board.classList.toggle('editing',on);
  const doneBtn=$('widget-edit-done');if(doneBtn)doneBtn.hidden=!on;
}
/* Widgets that fetch their own data used to blank out to "Loading…" on every refresh. The last drawn
   content is now kept and shown straight away while fresh data loads, so refreshes are invisible. */
const widgetHtmlCache=new Map();
const WIDGET_NO_CACHE={notes:1,photos:1,checklist:1};
function wLoading(el){ if(!el.firstChild) el.innerHTML='<div class="empty-state"><strong>Loading…</strong></div>'; }
function renderWidgetBoard(){
  const board=$('widget-board');if(!board||!state.widgets)return;
  if(!state.widgets.length){board.innerHTML='<div class="widget-board-empty">No widgets yet — use <strong>+ Add widget</strong> above to put something here.</div>';return}
  board.innerHTML=state.widgets.map(w=>{
    const def=WIDGET_TYPES[w.type];if(!def)return'';
    const [cs,rs]=widgetSpanFor(w,def);
    // "Bare" widgets (currently just the photo widget) skip the usual
    // card chrome — no title bar, no border/background/padding — so the
    // content can fill the whole tile edge to edge. The drag handle still
    // has to exist somewhere (wireWidgetCard binds to it unconditionally),
    // so it becomes a small floating pill instead of living in a title bar.
    const bare=!!def.bare;
    return '<div class="widget-card'+(bare?' widget-card-bare':'')+'" data-widget-id="'+esc(w.id)+'" data-widget-type="'+esc(w.type)+'" style="--cs:'+cs+';--rs:'+rs+'">'+
      '<button type="button" class="widget-remove-badge" data-widget-remove title="Remove widget" tabindex="-1"><i data-lucide="minus"></i></button>'+
      (bare
        ?'<span class="widget-drag-handle widget-drag-handle-bare" data-widget-drag title="Drag to move"><i data-lucide="grip-vertical"></i></span>'
        :'<div class="widget-card-head"><div class="widget-card-title"><span class="widget-drag-handle" data-widget-drag title="Drag to move"><i data-lucide="grip-vertical"></i></span><strong>'+esc(def.title)+'</strong></div>'
          +(def.headerAction?'<button type="button" class="widget-card-quick-add" data-widget-quick-add title="Add task" aria-label="Add task"><i data-lucide="plus"></i></button>':'')
          +'</div>')+
      '<div class="widget-card-body"></div>'+
      '<span class="widget-resize-handle" data-widget-resize title="Drag to resize" tabindex="-1"><i data-lucide="move-diagonal-2"></i></span>'+
    '</div>';
  }).join('');
  if(window.lucide)lucide.createIcons();
  board.querySelectorAll('.widget-card').forEach(card=>{
    const type=card.dataset.widgetType,def=WIDGET_TYPES[type];
    const w=state.widgets.find(x=>x.id===card.dataset.widgetId);
    if(def){
      const body=card.querySelector('.widget-card-body'),ck=(w&&w.id)+'|'+state.profile;
      if(!WIDGET_NO_CACHE[type]&&widgetHtmlCache.has(ck)) body.innerHTML=widgetHtmlCache.get(ck);
      let r; try{ r=def.render(body,w); }catch(e){ console.warn(e); }
      if(!WIDGET_NO_CACHE[type]) Promise.resolve(r).then(()=>{ if(body.isConnected&&body.innerHTML&&!/Loading…|Unavailable/.test(body.innerHTML)) widgetHtmlCache.set(ck,body.innerHTML); }).catch(()=>{});
    }
    wireWidgetCard(card);
    const qaBtn=card.querySelector('[data-widget-quick-add]');
    if(qaBtn) qaBtn.addEventListener('click',e=>{e.stopPropagation();openQuickAdd()});
  });
}
// Pointer Events (not HTML5 dragstart/dragover) so reordering actually
// works on iPhone/touch — native HTML5 drag-and-drop has no touch
// equivalent in iOS Safari, so the old dragstart-based version silently
// did nothing on a phone.
// Shared drag-to-reorder, used both by a direct grab on the handle and by
// a long-press anywhere else on the card (see wireWidgetCard below). Uses
// Pointer Events + elementFromPoint rather than HTML5 dragstart/dragover,
// which has no touch equivalent on iOS.
function startWidgetDrag(card,pointerId,startClientX,startClientY){
  widgetDragId=card.dataset.widgetId;
  widgetGestureActive=true;
  card.classList.add('dragging');
  const onMove=ev=>{
    if(ev.pointerId!==pointerId)return;
    ev.preventDefault();
    document.querySelectorAll('.widget-card.drag-over').forEach(c=>c.classList.remove('drag-over'));
    const el=document.elementFromPoint(ev.clientX,ev.clientY);
    const over=el&&el.closest('.widget-card');
    if(over && over!==card && over.closest('#widget-board')) over.classList.add('drag-over');
  };
  const onUp=ev=>{
    if(ev.pointerId!==pointerId)return;
    document.removeEventListener('pointermove',onMove);
    document.removeEventListener('pointerup',onUp);
    document.removeEventListener('pointercancel',onUp);
    card.classList.remove('dragging');
    const overEl=document.querySelector('.widget-card.drag-over');
    document.querySelectorAll('.widget-card.drag-over').forEach(c=>c.classList.remove('drag-over'));
    const fromId=widgetDragId,toId=overEl&&overEl.dataset.widgetId;
    widgetDragId=null;
    setTimeout(()=>{widgetGestureActive=false;},60);
    if(!overEl||!fromId||fromId===toId)return;
    const ids=state.widgets.map(w=>w.id),from=ids.indexOf(fromId),to=ids.indexOf(toId);
    if(from<0||to<0)return;
    const [moved]=state.widgets.splice(from,1);state.widgets.splice(to,0,moved);
    saveWidgetLayout();renderWidgetBoard();
  };
  document.addEventListener('pointermove',onMove);
  document.addEventListener('pointerup',onUp);
  document.addEventListener('pointercancel',onUp);
}
// Drag the corner handle to resize to literally any size, not a preset —
// the card's width/height follow your pointer continuously (rounded only
// to the nearest column/row unit, ~1/12th of the board's width and 22px
// tall, fine enough to feel free-form). Every other widget reflows around
// it live as you drag, for free, because they're just ordinary CSS Grid
// siblings with "dense" auto-placement — nothing here has to compute or
// animate their new positions itself.
function startWidgetResize(card,pointerId,startClientX,startClientY){
  const w=state.widgets.find(x=>x.id===card.dataset.widgetId);if(!w)return;
  const def=WIDGET_TYPES[w.type];
  const [startCol,startRow]=widgetSpanFor(w,def);
  const board=$('widget-board');
  const boardCols=board?getComputedStyle(board).gridTemplateColumns.split(' ').filter(Boolean).length:12;
  const boardRect=board.getBoundingClientRect();
  const colUnitPx=Math.max(20,(boardRect.width-(boardCols-1)*WIDGET_GAP_PX)/boardCols);
  let moved=false,curCol=startCol,curRow=startRow;
  widgetGestureActive=true;
  card.classList.add('resizing');
  const onMove=ev=>{
    if(ev.pointerId!==pointerId)return;
    ev.preventDefault();
    const dx=ev.clientX-startClientX,dy=ev.clientY-startClientY;
    if(Math.hypot(dx,dy)>6)moved=true;
    curCol=Math.max(WIDGET_MIN_COL,Math.min(boardCols,Math.round(startCol+dx/colUnitPx)));
    curRow=Math.max(WIDGET_MIN_ROW,Math.min(WIDGET_MAX_ROW,Math.round(startRow+dy/WIDGET_ROW_PX)));
    card.style.setProperty('--cs',curCol);
    card.style.setProperty('--rs',curRow);
  };
  const onUp=ev=>{
    if(ev.pointerId!==pointerId)return;
    document.removeEventListener('pointermove',onMove);
    document.removeEventListener('pointerup',onUp);
    document.removeEventListener('pointercancel',onUp);
    card.classList.remove('resizing');
    if(moved){
      w.colSpan=curCol;w.rowSpan=curRow;delete w.size;
      saveWidgetLayout();
    }
    setTimeout(()=>{widgetGestureActive=false;},60);
  };
  document.addEventListener('pointermove',onMove);
  document.addEventListener('pointerup',onUp);
  document.addEventListener('pointercancel',onUp);
}
// "Press and hold" like an iPhone home screen: holding anywhere on a
// widget that isn't one of its interactive bits (a link, a task
// checkbox…) jiggles the whole board and starts dragging that widget as
// soon as the hold fires, without needing to lift and grab again. Once
// jiggling, a fresh press on any widget drags immediately — no second
// hold needed, same as iOS.
function wireWidgetCard(card){
  const isInteractive=el=>!!el.closest('a,button,input,textarea,select,[data-task-id]');
  const LONG_PRESS_MS=450;
  card.addEventListener('pointerdown',e=>{
    if(e.button!==undefined && e.button!==0)return;
    if(isInteractive(e.target))return;
    const startX=e.clientX,startY=e.clientY,pointerId=e.pointerId;
    if(widgetEditMode){ startWidgetDrag(card,pointerId,startX,startY); return; }
    let fired=false;
    const timer=setTimeout(()=>{
      fired=true;
      if(navigator.vibrate){ try{navigator.vibrate(12);}catch(err){} }
      widgetSetEditMode(true);
      startWidgetDrag(card,pointerId,startX,startY);
    },LONG_PRESS_MS);
    const cleanup=()=>{
      clearTimeout(timer);
      card.removeEventListener('pointerup',cleanup);
      card.removeEventListener('pointerleave',cleanup);
      card.removeEventListener('pointermove',moveCheck);
    };
    const moveCheck=ev=>{ if(!fired && Math.hypot(ev.clientX-startX,ev.clientY-startY)>10)cleanup(); };
    card.addEventListener('pointerup',cleanup);
    card.addEventListener('pointerleave',cleanup);
    card.addEventListener('pointermove',moveCheck);
  });
  const handle=card.querySelector('[data-widget-drag]');
  handle.addEventListener('pointerdown',e=>{
    e.preventDefault();e.stopPropagation();
    widgetSetEditMode(true);
    startWidgetDrag(card,e.pointerId,e.clientX,e.clientY);
  });
  card.querySelector('[data-widget-resize]').addEventListener('pointerdown',e=>{
    e.preventDefault();e.stopPropagation();
    if(!widgetEditMode)return;
    startWidgetResize(card,e.pointerId,e.clientX,e.clientY);
  });
  card.querySelector('[data-widget-remove]').addEventListener('click',e=>{
    e.stopPropagation();
    if(!widgetEditMode)return;
    const removedId=card.dataset.widgetId;
    const photoCount=(state.photosByWidget&&state.photosByWidget[removedId]||[]).length;
    if(photoCount&&!confirm('Remove this photo widget? Its '+photoCount+' photo'+(photoCount===1?'':'s')+' will be deleted too.'))return;
    state.widgets=state.widgets.filter(w=>w.id!==removedId);
    // A removed photo widget takes its photos with it — otherwise they'd keep using up the shared photo space with no way to free it.
    if(state.photosByWidget&&state.photosByWidget[removedId]){
      const rt=photoWidgetRuntime[removedId]; if(rt&&rt.timer){clearInterval(rt.timer)}
      delete photoWidgetRuntime[removedId]; delete state.photosByWidget[removedId]; savePhotoWidgets();
    }
    saveWidgetLayout();renderWidgetBoard();
  });
}
function renderWidgetCatalog(){
  const addedTypes=new Set(state.widgets.map(w=>w.type));
  $('widget-catalog').innerHTML=Object.keys(WIDGET_TYPES).map(type=>{
    const def=WIDGET_TYPES[type];
    // Every widget type is one-per-board, except ones marked `multiple`
    // (currently just the photo widget) — those stay addable indefinitely
    // since each instance is its own separate gallery.
    const added=!def.multiple&&addedTypes.has(type);
    const count=def.multiple?state.widgets.filter(w=>w.type===type).length:0;
    const sub=added?'Already on your board':(count?'On your board ×'+count+' — add another':esc(def.desc));
    return '<button type="button" class="widget-catalog-item'+(added?' added':'')+'" data-widget-type-add="'+type+'">'+
      '<span class="widget-catalog-icon"><i data-lucide="'+def.icon+'"></i></span>'+
      '<span class="widget-catalog-copy"><strong>'+esc(def.title)+'</strong><span>'+sub+'</span></span>'+
    '</button>';
  }).join('');
  if(window.lucide)lucide.createIcons();
}
let widgetModalWired=false;
function wireWidgetModal(){
  if(widgetModalWired)return;widgetModalWired=true;
  $('widget-edit-done').addEventListener('click',()=>widgetSetEditMode(false));
  $('widget-board').addEventListener('click',e=>{ if(e.target.id==='widget-board' && widgetEditMode && !widgetGestureActive)widgetSetEditMode(false); });
  $('widget-add-open').addEventListener('click',()=>{widgetSetEditMode(false);renderWidgetCatalog();$('widget-add-modal').hidden=false});
  $('widget-add-close').addEventListener('click',()=>$('widget-add-modal').hidden=true);
  $('widget-add-modal').addEventListener('click',e=>{if(e.target.id==='widget-add-modal')$('widget-add-modal').hidden=true});
  $('widget-catalog').addEventListener('click',e=>{
    const btn=e.target.closest('[data-widget-type-add]');if(!btn||btn.classList.contains('added'))return;
    const type=btn.dataset.widgetTypeAdd,def=WIDGET_TYPES[type];
    state.widgets.push({id:'w-'+type+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),type,size:def.defaultSize});
    saveWidgetLayout();renderWidgetBoard();$('widget-add-modal').hidden=true;toast(def.title+' added to your Today page');
  });
}
/* Hub edits write whole lists, so just before writing we re-read the stored copy and keep anything that was
   added/changed elsewhere (e.g. in the To-Do app) since the Hub last loaded; only the ids we touched come from here. */
async function mergeBeforeWrite(ref,list,touched){
  const remote=await readJson(ref,null);
  if(!Array.isArray(remote)) return list;
  const ids=new Set(touched), byId=new Map(list.map(t=>[t.id,t]));
  const out=remote.map(t=>ids.has(t.id)&&byId.has(t.id)?byId.get(t.id):t);
  const have=new Set(out.map(t=>t.id));
  touched.forEach(id=>{ if(byId.has(id)&&!have.has(id)) out.push(byId.get(id)); });
  list.splice(0,list.length,...out);
  return list;
}
async function completeTask(id){
  let list=state.personalTasks,task=list.find(t=>t.id===id),ref=profileRef('todo-profiles','tasks');
  if(!task){list=state.sharedTasks;task=list.find(t=>t.id===id);ref=sharedTodoRef()}if(!task)return;
  const originalLength=list.length;
  task.done=true;task.completedOn=today();
  if(task.repeat&&task.repeat!=='none'&&task.due){
    let nextDue=null;
    if(task.repeat==='daily')nextDue=addDays(task.due,1);
    if(task.repeat==='everyNDays')nextDue=addDays(task.due,Math.max(1,Number(task.freqDays)||1));
    if(task.repeat==='weekly')nextDue=addDays(task.due,7);
    if(task.repeat==='weekdays'){nextDue=addDays(task.due,1);while([0,6].includes(new Date(nextDue+'T00:00:00').getDay()))nextDue=addDays(nextDue,1)}
    if(task.repeat==='monthly'){const d=new Date(task.due+'T00:00:00');const last=new Date(d.getFullYear(),d.getMonth()+2,0).getDate();const n=new Date(d.getFullYear(),d.getMonth()+1,Math.min(d.getDate(),last));nextDue=n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0')}
    if(nextDue){const nid='task-'+Date.now()+'-'+Math.floor(Math.random()*1000);list.push({...task,id:nid,spawnedId:null,done:false,due:nextDue,completedOn:null,subtasks:(task.subtasks||[]).map(s=>({...s,done:false})),order:Date.now(),createdAt:new Date().toISOString()});task.spawnedId=nid}
  }
  renderDashboard();toast('Task completed');
  try{await mergeBeforeWrite(ref,list,[task.id,task.spawnedId].filter(Boolean));await ref.set({json:JSON.stringify(list),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true})}catch(e){list.splice(originalLength);task.done=false;task.completedOn=null;renderDashboard();toast('Could not save. Try again.')}
}

/* =====================================================================
   INSIGHTS — the workshop.
   Zero input on this page. Every app feeds it by itself:
     Schedule  -> routine blocks ticked per day (templateLog) of the blocks planned
     Gym       -> planned session done + weigh-in; weight vs. the plan line
     Diet      -> meals eaten of meals planned; calories + protein vs. goal
     Chores    -> chores done of chores due
     To-Do     -> tasks finished of tasks due
     Skin      -> routine steps ticked (vs. your fullest day)
     Water     -> litres vs. daily goal
     Pledge    -> daily check-in complete
   Each app can be switched on/off from the module bar; the choice is saved per
   profile. Nothing here is ever written back to any app — it only reads.
===================================================================== */
const SKIN_TEMPLATE_START='2026-10-01';
const INSIGHT_WEIGHT_GOALS={Bhargav:{start:94.885,target:76,startDate:'2026-10-26',endDate:'2027-04-15'},Anusha:{start:66,target:53,startDate:'2026-09-02',endDate:'2026-12-22',band:1}};
const INS_TRAIN_DOWS=[0,1,3,4,5]; // Sun, Mon, Wed, Thu, Fri: both plans lift on these days (Tue rest, Sat recovery)
const WS_MODS=[
  {id:'schedule',name:'Schedule',code:'SCHED',color:'#74b9cf',link:'apps/schedule.html',what:'routine blocks ticked'},
  {id:'gym',name:'Gym',code:'FORGE',color:'#d98474',link:'gym/index.html',what:'session + weigh-in'},
  {id:'diet',name:'Diet',code:'FUEL',color:'#97c283',link:'apps/diet.html',what:'meals eaten'},
  {id:'chores',name:'Chores',code:'HOME',color:'#d3ac66',link:'apps/chores.html',what:'chores done'},
  {id:'todo',name:'To-Do',code:'OPS',color:'#a898d2',link:'apps/todo.html',what:'tasks finished'},
  {id:'skin',name:'Skin',code:'DERM',color:'#cd96b4',link:'apps/skin.html',what:'routine steps'},
  {id:'water',name:'Water',code:'HYDRO',color:'#7aa6d6',link:'#',what:'litres vs goal'},
  {id:'pledge',name:'Pledge',code:'OATH',color:'#cdbb77',link:'apps/pledge.html',what:'pledges kept'}
];
let insightsLoadedForProfile=null,insightsLoadedAt=0,insCur=null;

const kgFmt=n=>(Math.round(n*10)/10).toFixed(1).replace(/\.0$/,'');
const insInt=n=>Math.round(n).toLocaleString();
const insPct=r=>r==null?'—':Math.round(r*100)+'%';
function insLabel(dt,o){return new Date(dt+'T00:00:00').toLocaleDateString(undefined,o||{month:'short',day:'numeric'})}
function insMonday(d){const dow=(new Date(d+'T00:00:00').getDay()+6)%7;return addDays(d,-dow)}
function insDow(d){return new Date(d+'T00:00:00').getDay()}
function insShortDay(d){return new Date(d+'T00:00:00').toLocaleDateString(undefined,{weekday:'short'})}
function insGymCol(profile,name){return db.collection('users').doc(state.user.uid).collection('profiles').doc(profile.toLowerCase()).collection(name)}
const insR=v=>v==null?null:(v.frac!=null?v.frac:(v.total?v.done/v.total:null));
function insStatus(r){return r==null?'offline':r>=0.85?'nominal':r>=0.6?'degraded':'critical'}
const INS_STATUS_WORD={nominal:'NOMINAL',degraded:'DEGRADED',critical:'CRITICAL',offline:'NO DATA'};

/* ---------- loading (all cached or single-document reads) ---------- */
async function ensureInsightsLoaded(force){
  if(!force&&insightsLoadedForProfile===state.profile&&state.insights&&Date.now()-insightsLoadedAt<60000)return;
  const uid=state.user.uid;
  const [dailySnap,liftSnap,cardioSnap,stepRes,trackRes,dietRes,tplRes,pledgeRes,prefRes]=await Promise.all([
    FsCache.get(insGymCol(state.profile,'dailyLogs')).catch(()=>null),
    FsCache.get(insGymCol(state.profile,'workoutLogs')).catch(()=>null),
    FsCache.get(insGymCol(state.profile,'cardioLogs')).catch(()=>null),
    skinDataRef(state.profile,'stepLog').get().catch(()=>null),
    skinDataRef(state.profile,'trackingLog').get().catch(()=>null),
    db.collection('users').doc(uid).collection('apps').doc('nourish-diet-v2').collection('data').doc('state').get().catch(()=>null),
    profileRef('schedule-profiles','templateLog').get().catch(()=>null),
    db.collection('users').doc(uid).collection('apps').doc('pledge-v3').collection('data').doc('state').get().catch(()=>null),
    profileRef('hub-profiles','insightPrefs').get().catch(()=>null)
  ]);
  const daily={},trained=new Set(),vol={},cardio=new Set();
  if(dailySnap)dailySnap.forEach(s=>{const v=s.data()||{},date=v.date||s.id,w=Number(v.weight),st=Number(v.steps);daily[date]={weight:w>0?w:null,steps:st>0?st:null};if(v.habits&&v.habits.workout)trained.add(date)});
  if(liftSnap)liftSnap.forEach(s=>{const v=s.data()||{},date=v.date||String(s.id).split(':')[0];let any=false;(Array.isArray(v.exercises)?v.exercises:[]).forEach(e=>(e.sets||[]).forEach(st=>{any=true;vol[date]=(vol[date]||0)+(Number(st.weight)||0)*(Number(st.reps)||0)}));if(any)trained.add(date)});
  if(cardioSnap)cardioSnap.forEach(s=>{const v=s.data()||{},date=v.date||s.id;if((Array.isArray(v.entries)&&v.entries.length)||v.machine)cardio.add(date)});
  const stepLog=safeJson(stepRes&&stepRes.exists?stepRes.data().json:null,{}),trackingLog=safeJson(trackRes&&trackRes.exists?trackRes.data().json:null,{});
  const skinCount={};
  Object.keys(stepLog).forEach(k=>{if(stepLog[k]){const d=k.split(':')[0];if(d)skinCount[d]=(skinCount[d]||0)+1}});
  Object.keys(trackingLog).forEach(d=>{if(trackingLog[d]&&trackingLog[d].savedAt&&!skinCount[d])skinCount[d]=skinCount[d]||0});
  let diet=null;const pid=state.profile.toLowerCase(),dState=(dietRes&&dietRes.exists&&dietRes.data().json)?safeJson(dietRes.data().json,null):null;
  if(dState&&Array.isArray(dState.diary)){
    const byDate={};
    dState.diary.forEach(x=>{
      if(x.profileId!==pid||x.replaced)return;
      const r=byDate[x.date]=byDate[x.date]||{kcal:0,protein:0,eaten:0,total:0};
      r.total++;
      if((x.status||'eaten')==='eaten'){const f=(x.servings||1)/(x.recipeServings||1),n=x.nutrition||{};r.eaten++;r.kcal+=(n.calories||0)*f;r.protein+=(n.protein||0)*f}
    });
    const g=(dState.profiles&&dState.profiles[pid]&&dState.profiles[pid].goals)||{};
    diet={byDate,goalKcal:g.calories||0,goalProtein:g.protein||0};
  }
  const tplLog=safeJson(tplRes&&tplRes.exists?tplRes.data().json:null,{});
  const pledge=(pledgeRes&&pledgeRes.exists&&pledgeRes.data().json)?safeJson(pledgeRes.data().json,null):null;
  let prefs=safeJson(prefRes&&prefRes.exists?prefRes.data().json:null,null);
  if(!prefs){try{prefs=JSON.parse(localStorage.getItem('ws-prefs:'+state.profile)||'null')}catch(e){prefs=null}}
  const keep=(insightsLoadedForProfile===state.profile&&state.insights)?state.insights.prefs:null;
  state.insights={daily,trained,vol,cardio,skinCount,diet,tplLog,pledge,prefs:keep||((prefs&&Array.isArray(prefs.off))?prefs:{off:[]})};
  insightsLoadedForProfile=state.profile;insightsLoadedAt=Date.now();
}
function insSavePrefs(){
  const p=state.insights.prefs;
  try{localStorage.setItem('ws-prefs:'+state.profile,JSON.stringify(p))}catch(e){}
  try{profileRef('hub-profiles','insightPrefs').set({json:JSON.stringify(p)}).catch(()=>{})}catch(e){}
}

/* ---------- the plan: where the line says you should be ---------- */
function insPlanPath(){
  const g=INSIGHT_WEIGHT_GOALS[state.profile];if(!g)return null;
  const pts=[{date:g.startDate,w:g.start,lo:g.start,hi:g.start,label:'Start'}];
  const BP=window.BHARGAV_PLAN;
  if(state.profile==='Bhargav'&&BP&&Array.isArray(BP.phases)){
    BP.phases.forEach(ph=>{const m=/([\d.]+)\s*[–-]\s*([\d.]+)/.exec(ph.weight||'');if(m)pts.push({date:ph.end,w:(+m[1]+ +m[2])/2,lo:+m[1],hi:+m[2],label:'P'+ph.n+' end'})});
    if(pts.length>1)pts[pts.length-1].w=g.target;
  }
  if(pts.length<2){const b=g.band||1;pts.push({date:g.endDate,w:g.target,lo:g.target-b,hi:g.target+b,label:'Goal'})}
  return pts;
}
function insExpected(pts,date){
  if(date<=pts[0].date)return{w:pts[0].w,lo:pts[0].lo,hi:pts[0].hi};
  for(let i=1;i<pts.length;i++){
    if(date<=pts[i].date){
      const a=pts[i-1],b=pts[i],span=daysBetween(a.date,b.date)||1,t=daysBetween(a.date,date)/span,L=(x,y)=>x+(y-x)*t;
      return{w:L(a.w,b.w),lo:L(a.lo,b.lo),hi:L(a.hi,b.hi)};
    }
  }
  const e=pts[pts.length-1];return{w:e.w,lo:e.lo,hi:e.hi};
}
function insTargets(d){
  const BP=window.BHARGAV_PLAN;
  if(state.profile==='Bhargav'&&BP&&BP.phaseFor){const ph=BP.phaseFor(d);if(ph)return{kcal:ph.cal,protein:ph.protein,phase:ph}}
  const df=state.insights&&state.insights.diet;return{kcal:(df&&df.goalKcal)||0,protein:(df&&df.goalProtein)||0,phase:null};
}
function insStepGoal(d){
  if(state.profile==='Bhargav'){
    const BP=window.BHARGAV_PLAN,ph=BP&&BP.phaseFor?BP.phaseFor(d):null;
    if(!ph)return 8000;
    if(ph.n===1){const wk=Math.floor(daysBetween(ph.start,d)/7);return wk<=0?9000:wk===1?10000:11000}
    return ph.n===2?11000:12000;
  }
  return 8000;
}

/* ---------- gym / diet facts for one day (also feed the Gym and Diet panels) ---------- */
function insFacts(d){
  const cache=insCur.facts;if(cache[d])return cache[d];
  const ins=state.insights,g=INSIGHT_WEIGHT_GOALS[state.profile],t=insTargets(d),day=ins.daily[d]||{},diet=ins.diet&&ins.diet.byDate[d];
  const eatenN=diet?diet.eaten:0;
  const f={d,inPlan:d>=g.startDate,planned:d>=g.startDate&&INS_TRAIN_DOWS.includes(insDow(d)),trained:ins.trained.has(d),
    logged:eatenN>0,kcal:eatenN>0?diet.kcal:null,protein:eatenN>0?diet.protein:null,goalK:t.kcal,goalP:t.protein,
    weight:day.weight||null,steps:day.steps||null,stepGoal:insStepGoal(d),vol:ins.vol[d]||0};
  f.kcalState=!f.logged?'none':(f.goalK&&f.kcal<f.goalK*0.88)?'under':(f.goalK&&f.kcal>f.goalK*1.06)?'over':'ok';
  f.kcalOk=f.kcalState==='ok';
  f.proteinOk=f.logged&&f.goalP>0&&f.protein>=f.goalP*0.9;
  f.stepsOk=f.steps!=null&&f.steps>=f.stepGoal*0.9;
  f.trainOk=!f.planned||f.trained;
  f.onPlan=f.kcalOk&&f.trainOk;
  cache[d]=f;return f;
}
function insStreaks(){
  const g=INSIGHT_WEIGHT_GOALS[state.profile],today=insCur.today;let run=0,best=0;
  for(let d=g.startDate;d<today;d=addDays(d,1)){if(insFacts(d).onPlan){run++;best=Math.max(best,run)}else run=0}
  let cur=run;if(insFacts(today).onPlan){cur++;best=Math.max(best,cur)}
  return{cur,best};
}

/* ---------- weight: trend, pace, projection ---------- */
function insWeight(pts){
  const g=INSIGHT_WEIGHT_GOALS[state.profile],today=insCur.today,ins=state.insights;
  const logs=Object.keys(ins.daily).filter(d=>ins.daily[d].weight&&d>=g.startDate&&d<=today).sort().map(d=>({date:d,weight:ins.daily[d].weight}));
  const dayN=daysBetween(g.startDate,today)+1,total=daysBetween(g.startDate,g.endDate)+1;
  const exp=insExpected(pts,today),half=Math.max(0.4,(exp.hi-exp.lo)/2);
  const w={goal:g,pts,logs,dayN,total,daysLeft:Math.max(0,daysBetween(today,g.endDate)),exp,half,pctTime:Math.max(0,Math.min(100,Math.round(dayN/total*100))),totalKg:g.start-g.target};
  const ph=state.profile==='Bhargav'&&window.BHARGAV_PLAN&&window.BHARGAV_PLAN.phaseFor?window.BHARGAV_PLAN.phaseFor(today):null;
  w.phase=ph;
  w.cp=pts.find(p=>p.date>=today&&p.label!=='Start')||pts[pts.length-1];
  if(!logs.length){w.status='nodata';return w}
  const last=logs[logs.length-1];w.last=last;w.staleDays=daysBetween(last.date,today);
  const recent=logs.filter(l=>l.date>=addDays(today,-6));
  w.trend=(recent.length?recent:[last]).reduce((s,l)=>s+l.weight,0)/(recent.length||1);
  w.lost=g.start-w.trend;w.pctLost=Math.max(0,Math.min(100,Math.round(w.lost/w.totalKg*100)));
  w.delta=w.trend-exp.w;
  w.status=w.delta<=-half?'ahead':w.delta<=half?'on':w.delta<=half*2.5?'off':'behind';
  if(w.trend<=g.target)w.status='done';
  const rec=logs.filter(l=>l.date>=addDays(today,-21));
  if(rec.length>=3&&daysBetween(rec[0].date,rec[rec.length-1].date)>=7){
    const x0=rec[0].date,P=rec.map(l=>({x:daysBetween(x0,l.date),y:l.weight})),n=P.length,mx=P.reduce((s,p)=>s+p.x,0)/n,my=P.reduce((s,p)=>s+p.y,0)/n;
    let nu=0,de=0;P.forEach(p=>{nu+=(p.x-mx)*(p.y-my);de+=(p.x-mx)*(p.x-mx)});
    const slope=de?nu/de:0,xt=daysBetween(x0,today),fitNow=my+slope*(xt-mx);
    w.pace=slope*7;w.fitNow=fitNow;w.projected=fitNow+slope*w.daysLeft;
  }
  w.needPace=w.daysLeft>0?-((w.trend-g.target)/(w.daysLeft/7)):0;
  return w;
}

/* ---------- modules: every app answers "what did you tick out of what was due on day d?" ---------- */
function insBuildMods(){
  const ins=state.insights,me=state.profile,g=INSIGHT_WEIGHT_GOALS[me],today=insCur.today,out=[];
  const minKey=obj=>{const k=Object.keys(obj).map(x=>x.split(':')[0]).filter(Boolean).sort();return k.length?k[0]:null};
  const def=id=>WS_MODS.find(m=>m.id===id);
  // schedule: routine blocks planned for that weekday vs ticks in templateLog
  {const m=Object.assign({},def('schedule'));m.since=minKey(ins.tplLog);
    m.get=d=>{const blocks=(state.templates&&state.templates[DAYS[insDow(d)]])||[],total=blocks.length;if(!total)return null;let done=0;for(let i=0;i<total;i++)if(ins.tplLog[d+':'+i])done++;return{done,total}};
    m.detail=(d,v)=>v?v.done+' of '+v.total+' blocks ticked':'No routine planned';out.push(m)}
  // gym: planned session + the daily weigh-in
  {const m=Object.assign({},def('gym'));m.since=g.startDate;
    // Rest days are not due: nothing counts against you. Anything you still logged counts as a bonus.
    m.get=d=>{const f=insFacts(d);if(!f.inPlan)return null;
      if(f.planned)return{done:(f.trained?1:0)+(f.weight!=null?1:0),total:2};
      const bonus=(f.trained?1:0)+(f.weight!=null?1:0);return bonus?{done:bonus,total:bonus}:null};
    m.detail=d=>{const f=insFacts(d);return (f.planned?(f.trained?'Session done ✓':'Session not done'):(f.trained?'Bonus session':'Rest day'))+' · '+(f.weight!=null?'weighed '+kgFmt(f.weight)+' kg':'no weigh-in')+(f.steps?' · '+insInt(f.steps)+' steps':'')};out.push(m)}
  // diet: meals eaten of meals planned that day
  {const m=Object.assign({},def('diet')),by=ins.diet?ins.diet.byDate:{};
    const eatenDates=Object.keys(by).filter(d=>by[d].eaten>0).sort();m.since=eatenDates.length?eatenDates[0]:null;
    m.get=d=>{const r=by[d];return r&&r.total?{done:r.eaten,total:r.total}:null};
    m.detail=(d,v)=>{if(!v)return 'No meals planned';const r=by[d];return v.done+' of '+v.total+' meals eaten'+(r.eaten?' · '+insInt(r.kcal)+' kcal · '+insInt(r.protein)+' g protein':'')};out.push(m)}
  // chores: assigned chores that were due that day vs done
  {const m=Object.assign({},def('chores')),mine=(state.chores||[]).filter(c=>c.active!==false&&(!Array.isArray(c.assignedTo)||c.assignedTo.includes(me)));
    const doneBy={};let first=null;
    (state.choreHistory||[]).forEach(h=>{if(h.kind)return;const key=h.choreId||('n:'+h.task);(doneBy[key]=doneBy[key]||new Set()).add(h.date);if(!first||h.date<first)first=h.date});
    m.since=first;
    m.get=d=>{let total=0,done=0;
      mine.forEach(c=>{const set=doneBy[c.id]||doneBy['n:'+c.name],did=!!(set&&set.has(d));let due=false;
        if(c.freqType==='daily')due=true;
        else if(c.freqType==='specificDays')due=(c.days||[]).includes(insDow(d));
        else if(c.freqType==='everyNDays'){if(did)due=true;else{let last=null;if(set)set.forEach(x=>{if(x<d&&(!last||x>last))last=x});due=last!=null&&daysBetween(last,d)>=(Number(c.freqDays)||1)}}
        if(due){total++;if(did)done++}else if(did){total++;done++}});
      return total?{done,total}:null};
    m.detail=(d,v)=>v?v.done+' of '+v.total+' chores done':'No chores due';out.push(m)}
  // to-do: each task belongs to its due day; finishing it late counts on the day it was finished
  {const m=Object.assign({},def('todo')),agg={};let first=null;
    const bump=(d,done)=>{const r=agg[d]=agg[d]||{done:0,total:0};r.total++;if(done)r.done++;if(!first||d<first)first=d};
    (state.personalTasks||[]).concat(state.sharedTasks||[]).forEach(t=>{
      const c=t.done&&t.completedOn?t.completedOn:null;
      if(t.due){bump(t.due,!!(c&&c<=t.due));if(c&&c>t.due)bump(c,true)}
      else if(c)bump(c,true)});
    m.since=first;m.get=d=>agg[d]?{done:agg[d].done,total:agg[d].total}:null;
    m.detail=(d,v)=>v?v.done+' of '+v.total+' tasks finished':'No tasks due';out.push(m)}
  // skin: routine steps ticked vs your fullest day
  {const m=Object.assign({},def('skin')),sc=ins.skinCount,days=Object.keys(sc).sort(),peak=Math.max(0,...days.map(d=>sc[d]));
    m.since=days.length?days[0]:null;m.get=d=>peak?{done:Math.min(peak,sc[d]||0),total:peak}:null;
    m.detail=(d,v)=>v?v.done+' of '+v.total+' routine steps (your fullest day = '+peak+')':'No data';out.push(m)}
  // water: litres vs goal (partial credit)
  {const m=Object.assign({},def('water')),w=state.water;
    if(w&&w.goal&&w.log){const ds=Object.keys(w.log).filter(d=>(w.log[d]||[]).length).sort();m.since=ds.length?ds[0]:null;
      const tot=d=>{const a=w.log[d];return Array.isArray(a)?a.reduce((s,x)=>s+(Number(x)||0),0):0};
      m.get=d=>{const f=Math.min(1,tot(d)/w.goal);return{done:f>=1?1:0,total:1,frac:f}};m.frac=true;
      m.detail=d=>(tot(d)/1000).toFixed(1)+' of '+(w.goal/1000).toFixed(1)+' L'}
    else{m.since=null;m.get=()=>null;m.detail=()=>'No data'}
    m.link='#';out.push(m)}
  // pledge: each pledge counts only on the weekdays you chose, inside its window
  {const m=Object.assign({},def('pledge')),P=ins.pledge,end=p=>addDays(p.start,(p.length||(p.weeks||4)*7)-1);
    const list=(P&&Array.isArray(P.pledges)?P.pledges:[]).filter(p=>!p.deleted&&p.owner===me&&p.start);
    // weekly-count and milestone pledges are due only on a day you actually ticked (extra effort, never a miss)
    const dueOn=d=>list.filter(p=>d>=p.start&&d<=end(p)&&((p.mode==='perweek'||p.mode==='milestone')?!!(p.log&&p.log[d]):(p.days||[]).includes(insDow(d))));
    m.since=list.length?list.map(p=>p.start).sort()[0]:null;
    m.get=d=>{const l=dueOn(d);return l.length?{done:l.filter(p=>p.log&&p.log[d]).length,total:l.length}:null};
    m.detail=(d,v)=>v?v.done+' of '+v.total+' pledges kept':'Nothing pledged for this day';out.push(m)}
  return out;
}
function insDayData(d){
  const c=insCur.dayCache;if(c[d])return c[d];
  const r={d,mods:{}};let s=0,n=0;
  insCur.enabled.forEach(m=>{const v=(m.since&&d>=m.since&&d<=insCur.today)?m.get(d):null;r.mods[m.id]=v;const x=insR(v);if(x!=null){s+=x;n++}});
  r.overall=n?s/n:null;c[d]=r;return r;
}
function insModPeriod(m,from,to){
  const last=addDays(insCur.today,-1);if(to>last)to=last;
  let done=0,total=0,fs=0,fn=0;const days=[];
  for(let d=from;d<=to;d=addDays(d,1)){
    const v=(m.since&&d>=m.since)?m.get(d):null;days.push({d,v});
    if(v){done+=v.done;total+=v.total;const r=insR(v);if(r!=null){fs+=r;fn++}}
  }
  return{from,to,days,done,total,n:fn,rate:fn?(m.frac?fs/fn:(total?done/total:null)):null};
}
function insMean(a){const x=a.filter(v=>v!=null);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null}
function insOverallStreaks(){
  let first=null;insCur.enabled.forEach(m=>{if(m.since&&(!first||m.since<first))first=m.since});
  if(!first)return{cur:0,best:0};
  let run=0,best=0;
  for(let d=first;d<insCur.today;d=addDays(d,1)){const o=insDayData(d).overall;if(o!=null&&o>=0.8){run++;best=Math.max(best,run)}else run=0}
  let cur=run;const o=insDayData(insCur.today).overall;if(o!=null&&o>=0.8){cur++;best=Math.max(best,cur)}
  return{cur,best};
}
function insWeakDay(m){
  const names=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],sum={},cnt={};
  const p=insModPeriod(m,addDays(insCur.today,-28),addDays(insCur.today,-1));
  p.days.forEach(x=>{const r=insR(x.v);if(r==null)return;const k=insDow(x.d);sum[k]=(sum[k]||0)+r;cnt[k]=(cnt[k]||0)+1});
  let worst=null,wr=2;Object.keys(sum).forEach(k=>{if(cnt[k]>=2){const r=sum[k]/cnt[k];if(r<wr){wr=r;worst=names[k]}}});
  return worst&&wr<0.9?{name:worst,rate:wr}:null;
}

/* ---------- small SVG pieces (no bar charts) ---------- */
function wsRing(frac,color,size,sw,title){
  const r=(size-sw)/2,c=size/2;
  return '<svg class="ws-mini" width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'"><title>'+esc(title||'')+'</title><circle cx="'+c+'" cy="'+c+'" r="'+r+'" class="trk" stroke-width="'+sw+'"/>'+
    (frac>0?'<circle cx="'+c+'" cy="'+c+'" r="'+r+'" pathLength="100" stroke="'+color+'" stroke-width="'+sw+'" stroke-dasharray="'+(Math.min(1,frac)*100)+' 100" stroke-linecap="round" transform="rotate(-90 '+c+' '+c+')" class="fil"/>':'')+'</svg>';
}
function wsPolar(cx,cy,r,deg){const a=deg*Math.PI/180;return[cx+r*Math.cos(a),cy+r*Math.sin(a)]}
function wsGauge(done,total,frac,color,label){
  const n=(frac==null&&total>0&&total<=24)?total:12,cx=80,cy=76,r=62,gap=n>12?2:3.2,step=180/n;
  const filled=frac!=null?Math.round(frac*n):Math.min(n,done);
  let s='<svg class="ws-gauge" viewBox="0 0 160 92" role="img" aria-label="'+esc(label||'')+'">';
  for(let i=0;i<n;i++){
    const a0=180+i*step+gap/2,a1=180+(i+1)*step-gap/2,p0=wsPolar(cx,cy,r,a0),p1=wsPolar(cx,cy,r,a1);
    s+='<path d="M'+p0[0].toFixed(2)+' '+p0[1].toFixed(2)+' A'+r+' '+r+' 0 0 1 '+p1[0].toFixed(2)+' '+p1[1].toFixed(2)+'" class="seg'+(i<filled?' on':'')+'" '+(i<filled?'style="stroke:'+color+';color:'+color+'"':'')+'/>';
  }
  s+='<text x="80" y="70" text-anchor="middle" class="g-big">'+(frac!=null?Math.round(frac*100)+'%':done+'/'+total)+'</text><text x="80" y="86" text-anchor="middle" class="g-lab">'+esc(label||'')+'</text></svg>';
  return s;
}
function wsTrace(days,color){
  const W=300,H=70,n=days.length;if(!n)return'';
  const X=i=>6+(n>1?i/(n-1):0)*(W-12),Y=r=>H-8-r*(H-18);
  let s='<svg class="ws-trace" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="'+W+'" y1="'+Y(0.8)+'" y2="'+Y(0.8)+'" class="tgt"/>';
  let run=[];const flush=()=>{if(run.length>1){const pts=run.map(p=>X(p[0]).toFixed(1)+','+Y(p[1]).toFixed(1));
      s+='<polygon points="'+X(run[0][0]).toFixed(1)+','+(H-8)+' '+pts.join(' ')+' '+X(run[run.length-1][0]).toFixed(1)+','+(H-8)+'" fill="'+color+'" class="area"/><polyline points="'+pts.join(' ')+'" stroke="'+color+'" class="ln"/>'}
    else if(run.length===1)s+='<circle cx="'+X(run[0][0])+'" cy="'+Y(run[0][1])+'" r="2.5" fill="'+color+'"/>';run=[]};
  days.forEach((x,i)=>{const r=insR(x.v);if(r==null)flush();else run.push([i,r])});flush();
  const li=(()=>{for(let i=n-1;i>=0;i--)if(insR(days[i].v)!=null)return i;return -1})();
  if(li>=0)s+='<circle cx="'+X(li)+'" cy="'+Y(insR(days[li].v))+'" r="3.4" fill="'+color+'" class="pt"/>';
  return s+'</svg>';
}

/* ---------- module bar (switch apps on / off) ---------- */
function renderWsBar(all){
  const off=state.insights.prefs.off;
  $('ws-modbar').innerHTML='<span class="ws-bar-label">Modules</span>'+all.map(m=>{const on=!off.includes(m.id),empty=!m.since;
    return'<button type="button" class="ws-chip'+(on?' on':'')+(empty?' empty':'')+'" data-mod="'+m.id+'" style="--c:'+m.color+'" aria-pressed="'+on+'" title="'+esc(m.name+' — '+m.what+(empty?' (nothing recorded yet)':''))+'"><i></i>'+esc(m.name)+'<em>'+(on?'ON':'OFF')+'</em></button>'}).join('')+
    '<button type="button" class="ws-chip-all" data-mod="__all">Show all</button>';
}

/* ---------- stage: the arc reactor + system list ---------- */
function renderWsStage(rows,overall,prevOverall,streak){
  const live=rows.filter(r=>r.p.rate!=null),n=Math.max(1,live.length),CX=190,CY=190,R0=148,R1=70,step=Math.min(15,(R0-R1)/n),sw=4;
  let s='<svg class="ws-reactor" viewBox="0 0 380 380" role="img" aria-label="Overall consistency">';
  for(let i=0;i<120;i++){const a=i*3,big=i%10===0,p0=wsPolar(CX,CY,174,a),p1=wsPolar(CX,CY,big?166:170,a);s+='<line x1="'+p0[0].toFixed(1)+'" y1="'+p0[1].toFixed(1)+'" x2="'+p1[0].toFixed(1)+'" y2="'+p1[1].toFixed(1)+'" class="tick'+(big?' big':'')+'"/>'}
  s+='<circle cx="'+CX+'" cy="'+CY+'" r="160" class="rim"/>';
  live.forEach((row,i)=>{const r=R0-step*i;
    s+='<circle cx="'+CX+'" cy="'+CY+'" r="'+r.toFixed(1)+'" class="trk" stroke-width="'+sw+'"/><circle cx="'+CX+'" cy="'+CY+'" r="'+r.toFixed(1)+'" pathLength="100" stroke="'+row.m.color+'" stroke-width="'+sw+'" stroke-dasharray="'+(row.p.rate*100).toFixed(2)+' 100" stroke-linecap="round" transform="rotate(-90 '+CX+' '+CY+')" class="fil"><title>'+esc(row.m.name+': '+insPct(row.p.rate))+'</title></circle><text x="'+(CX-7)+'" y="'+(CY-r+2.6).toFixed(1)+'" text-anchor="end" class="rl" fill="'+row.m.color+'">'+esc(row.m.code)+'</text>'});
  s+='<circle cx="'+CX+'" cy="'+CY+'" r="52" class="core"/>';
  s+='<text x="'+CX+'" y="'+(CY+13)+'" text-anchor="middle" class="r-big">'+(overall==null?'—':Math.round(overall*100))+'</text><text x="'+CX+'" y="'+(CY+34)+'" text-anchor="middle" class="r-lab">SYNC</text></svg>';
  const st=insStatus(overall),delta=overall!=null&&prevOverall!=null?Math.round((overall-prevOverall)*100):null;
  const list=rows.map(r=>{const stt=insStatus(r.p.rate),t=r.today;
    return'<div class="ws-sys '+stt+'" style="--c:'+r.m.color+'"><span class="dot"></span><div class="nm"><b>'+esc(r.m.name)+'</b><small>'+esc(r.m.code)+'</small></div><div class="bar"><i style="width:'+Math.round((r.p.rate||0)*100)+'%"></i></div><div class="pc">'+insPct(r.p.rate)+'</div><div class="td"><b>'+(t?t.done+'/'+t.total:'—')+'</b><small>today</small></div></div>'}).join('');
  $('ws-stage').innerHTML='<div class="ws-stage-core">'+s+'<div class="ws-stage-cap"><span class="ws-status '+st+'">'+INS_STATUS_WORD[st]+'</span>'+(delta!=null?'<span class="ws-delta '+(delta>=0?'up':'down')+'">'+(delta>=0?'+':'−')+Math.abs(delta)+' vs prior 7 days</span>':'')+'</div></div>'+
    '<div class="ws-stage-side"><div class="ws-stage-head"><h2>Life systems</h2><p>Share of ticks done over the last 7 finished days</p></div><div class="ws-syslist">'+(list||'<p class="ws-empty">No module is switched on.</p>')+'</div>'+
    '<div class="ws-streak"><div><b>'+streak.cur+'<small>days</small></b><span>current streak at 80%+</span></div><div><b>'+streak.best+'<small>days</small></b><span>best streak</span></div></div></div>';
}

/* ---------- mission: weight vs. the plan ---------- */
function renderWsMission(w){
  const g=w.goal,tone={ahead:'good',on:'good',off:'warn',behind:'bad',done:'good',nodata:''}[w.status];
  let kicker='Day '+w.dayN+' of '+w.total+(w.phase?' · Phase '+w.phase.n+' '+w.phase.name:'');if(w.dayN<1)kicker='Starts '+insLabel(g.startDate);
  let head,sub;
  if(w.status==='nodata'){
    if(w.dayN<=1){head='Day 1. Baseline '+kgFmt(g.start)+' kg.';sub='The line to '+kgFmt(g.target)+' kg by '+insLabel(g.endDate,{month:'short',day:'numeric',year:'numeric'})+' starts here. It fills in from Gym by itself.'}
    else{head='No weigh-in since the start.';sub='Without a number the line can’t be judged. Save a weight in Gym; trend, pace and projection appear here on their own.'}
  }else if(w.status==='done'){head='Goal weight reached.';sub='7-day average '+kgFmt(w.trend)+' kg against a target of '+kgFmt(g.target)+' kg.'}
  else{
    const d=Math.abs(w.delta);
    head=w.status==='on'?'On the line.':w.status==='ahead'?kgFmt(d)+' kg ahead of the line.':w.status==='off'?kgFmt(d)+' kg above the line.':kgFmt(d)+' kg behind the line.';
    sub='The plan says '+kgFmt(w.exp.w)+' kg today. Your 7-day average is '+kgFmt(w.trend)+' kg.';
    if(w.projected!=null){const gap=w.projected-g.target;sub+=' At the current pace you finish at '+kgFmt(w.projected)+' kg on '+insLabel(g.endDate)+(gap>0.3?' — '+kgFmt(gap)+' kg short.':'.')}
  }
  const chips=[];
  if(w.phase)chips.push('<span class="ws-tag">'+insInt(w.phase.cal)+' kcal · '+w.phase.protein+' g protein</span>');
  if(w.cp&&w.cp.label!=='Start'){const dl=Math.max(0,daysBetween(insCur.today,w.cp.date));chips.push('<span class="ws-tag">Next checkpoint '+kgFmt(w.cp.w)+' kg · '+esc(insLabel(w.cp.date))+' · '+dl+'d</span>')}
  if(w.staleDays>=3)chips.push('<span class="ws-tag warn">Last weigh-in '+w.staleDays+' days ago</span>');
  const lost=w.status==='nodata'?'—':(w.lost>=0?'−':'+')+kgFmt(Math.abs(w.lost));
  const raceTone=w.status==='nodata'?'':w.pctLost+5>=w.pctTime?'good':w.pctLost+15>=w.pctTime?'warn':'bad';
  const pts=w.pts,today=insCur.today,W=720,H=290,pl=40,pr=16,pt=28,pb=26,t0=g.startDate,t1=g.endDate,span=Math.max(1,daysBetween(t0,t1));
  const X=d=>pl+Math.max(0,Math.min(1,daysBetween(t0,d)/span))*(W-pl-pr);
  const vals=[];pts.forEach(p=>vals.push(p.lo,p.hi));w.logs.forEach(l=>vals.push(l.weight));if(w.projected!=null)vals.push(w.projected);vals.push(g.target);
  const lo=Math.min.apply(null,vals),hi=Math.max.apply(null,vals),stp=(hi-lo)>14?4:(hi-lo)>6?2:1,y0=Math.floor((lo-0.5)/stp)*stp,y1=Math.ceil((hi+0.5)/stp)*stp,Y=v=>pt+(1-(v-y0)/(y1-y0))*(H-pt-pb);
  let s='<svg class="ws-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Weight against the plan line">';
  for(let v=y0;v<=y1+1e-6;v+=stp)s+='<line class="c-grid" x1="'+pl+'" x2="'+(W-pr)+'" y1="'+Y(v)+'" y2="'+Y(v)+'"/><text class="c-axis" x="'+(pl-6)+'" y="'+(Y(v)+4)+'" text-anchor="end">'+v+'</text>';
  if(state.profile==='Bhargav'&&window.BHARGAV_PLAN&&window.BHARGAV_PLAN.phases)window.BHARGAV_PLAN.phases.forEach(ph=>{const xa=X(ph.start),xb=X(ph.end);s+='<line class="c-div" x1="'+xb+'" x2="'+xb+'" y1="'+pt+'" y2="'+(H-pb)+'"/><text class="c-phase'+(w.phase&&w.phase.n===ph.n?' on':'')+'" x="'+((xa+xb)/2)+'" y="'+(pt-12)+'" text-anchor="middle">P'+ph.n+'</text>'});
  s+='<polygon class="c-band" points="'+pts.map(p=>X(p.date)+','+Y(p.hi)).concat(pts.slice().reverse().map(p=>X(p.date)+','+Y(p.lo))).join(' ')+'"/><polyline class="c-plan" points="'+pts.map(p=>X(p.date)+','+Y(p.w)).join(' ')+'"/>';
  s+='<line class="c-target" x1="'+pl+'" x2="'+(W-pr)+'" y1="'+Y(g.target)+'" y2="'+Y(g.target)+'"/><text class="c-axis" x="'+(pl+8)+'" y="'+(Y(g.target)-6)+'">goal '+kgFmt(g.target)+' kg</text>';
  if(today>=t0&&today<=t1){const tx=X(today);s+='<line class="c-today" x1="'+tx+'" x2="'+tx+'" y1="'+pt+'" y2="'+(H-pb)+'"/>'+((tx-pl>60&&(W-pr)-tx>60)?'<text class="c-axis" x="'+tx+'" y="'+(H-8)+'" text-anchor="middle">today</text>':'')}
  if(w.projected!=null&&today<=t1)s+='<line class="c-proj" x1="'+X(today)+'" y1="'+Y(w.fitNow)+'" x2="'+X(t1)+'" y2="'+Y(w.projected)+'"/><text class="c-projt" x="'+(X(t1)-4)+'" y="'+(Y(w.projected)+(w.projected>g.target?16:-8))+'" text-anchor="end">'+kgFmt(w.projected)+' kg</text>';
  s+='<circle class="c-start" cx="'+X(t0)+'" cy="'+Y(g.start)+'" r="4.5"/>';
  const ma=w.logs.map(l=>{const win=w.logs.filter(m=>m.date<=l.date&&m.date>=addDays(l.date,-6));return{date:l.date,v:win.reduce((a,m)=>a+m.weight,0)/win.length}});
  if(ma.length>1)s+='<polyline class="c-avg" points="'+ma.map(m=>X(m.date)+','+Y(m.v)).join(' ')+'"/>';
  w.logs.forEach(l=>{s+='<circle class="c-dot" cx="'+X(l.date)+'" cy="'+Y(l.weight)+'" r="3"/>'});
  s+='<text class="c-axis" x="'+pl+'" y="'+(H-8)+'">'+esc(insLabel(t0))+'</text><text class="c-axis" x="'+(W-pr)+'" y="'+(H-8)+'" text-anchor="end">'+esc(insLabel(t1))+'</text></svg>';
  const facts=[];
  if(w.status!=='nodata'){
    if(w.pace!=null)facts.push('<span>Pace <b>'+(w.pace<=0?'−':'+')+kgFmt(Math.abs(w.pace))+' kg/week</b> · needed <b>'+kgFmt(Math.abs(w.needPace))+' kg/week</b></span>');
    else facts.push('<span>Pace appears after 3 weigh-ins across 7 days</span>');
    if(w.cp&&w.cp.label!=='Start')facts.push('<span>To reach '+kgFmt(w.cp.w)+' kg by '+esc(insLabel(w.cp.date))+': <b>'+kgFmt(Math.max(0,w.trend-w.cp.w))+' kg to go</b></span>');
  }else facts.push('<span>No weigh-ins yet. The plan line is drawn from your starting weight.</span>');
  const st=insStreaks();
  $('ws-mission').innerHTML='<div class="ws-ph"><span class="ws-code">MISSION</span><h3>'+kgFmt(g.start)+' → '+kgFmt(g.target)+' kg</h3><span class="ws-kick">'+esc(kicker)+'</span></div>'+
    '<div class="ws-mission-top"><div><h2 class="'+tone+'">'+esc(head)+'</h2><p>'+esc(sub)+'</p><div class="ws-tags">'+chips.join('')+'</div></div>'+
    '<div class="ws-tiles"><div><b>'+lost+'<small>kg</small></b><span>lost of '+kgFmt(w.totalKg)+'</span></div><div><b>'+st.cur+'<small>d</small></b><span>on-plan streak · best '+st.best+'</span></div></div></div>'+
    '<div class="ws-race"><div><span>Time used</span><div class="ws-meter"><i style="width:'+w.pctTime+'%"></i></div><b>'+w.pctTime+'%</b></div><div><span>Weight lost</span><div class="ws-meter"><i class="'+raceTone+'" style="width:'+(w.status==='nodata'?0:w.pctLost)+'%"></i></div><b>'+(w.status==='nodata'?'—':w.pctLost+'%')+'</b></div></div>'+
    '<div class="ws-chart">'+s+'</div><div class="ws-legend"><span><i class="k plan"></i>Plan line</span><span><i class="k band"></i>Allowed range</span><span><i class="k dot"></i>Weigh-in</span><span><i class="k avg"></i>7-day average</span><span><i class="k proj"></i>If nothing changes</span></div><div class="ws-facts">'+facts.join('')+'</div>';
}

/* ---------- 12-week honeycomb + day inspector ---------- */
function renderWsHex(){
  const today=insCur.today;let first=null;insCur.enabled.forEach(m=>{if(m.since&&(!first||m.since<first))first=m.since});
  const start=insMonday(addDays(today,-77)),last=addDays(insMonday(today),6);
  let cols='',col='',n=0;
  for(let d=start;d<=last;d=addDays(d,1)){
    let cls='na';
    if(d>today)cls='future';else{const o=insDayData(d).overall;cls=o==null?'na':o<0.34?'c1':o<0.67?'c2':o<0.9?'c3':'c4'}
    col+='<button type="button" class="ws-hx '+cls+(d===today?' today':'')+'" data-d="'+d+'" aria-label="'+esc(insLabel(d))+'"'+(d>today?' disabled':'')+'></button>';
    if(++n%7===0){cols+='<div class="ws-hxc">'+col+'</div>';col=''}
  }
  if(col)cols+='<div class="ws-hxc">'+col+'</div>';
  $('ws-hex').innerHTML='<div class="ws-ph"><span class="ws-code">LOG</span><h3>12-week map</h3><span class="ws-kick">One dot per day · tap to inspect</span></div><div class="ws-hex-scroll"><div class="ws-hex-grid"><div class="ws-hxl"><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span></span></div>'+cols+'</div></div><div class="ws-hex-leg"><span>Missed</span><i class="ws-hx c1"></i><i class="ws-hx c2"></i><i class="ws-hx c3"></i><i class="ws-hx c4"></i><span>Everything hit</span></div>';
  {const sc=$('ws-hex').querySelector('.ws-hex-scroll');if(sc)sc.scrollLeft=sc.scrollWidth}
  showWsDay(insCur.sel||today);
}
function showWsDay(d){
  insCur.sel=d;const dd=insDayData(d),today=insCur.today;
  document.querySelectorAll('#ws-hex .ws-hx[data-d]').forEach(b=>b.classList.toggle('sel',b.dataset.d===d));
  const rows=insCur.enabled.map(m=>{const v=dd.mods[m.id],r=insR(v);
    return'<div class="ws-drow" style="--c:'+m.color+'"><div class="rg">'+(r!=null?wsRing(r,m.color,32,3.5,m.name+' '+insPct(r)):'<span class="ws-nodata">–</span>')+'</div><div class="tx"><b>'+esc(m.name)+'</b><small>'+(v?esc(m.detail(d,v)):(m.since&&d<m.since?'Before this app had data':'Nothing due / recorded'))+'</small></div><div class="fr">'+(v?(v.frac!=null?Math.round(v.frac*100)+'%':v.done+'/'+v.total):'—')+'</div></div>'}).join('');
  $('ws-day').innerHTML='<div class="ws-ph"><span class="ws-code">'+(d===today?'LIVE':'DAY')+'</span><h3>'+esc(insLabel(d,{weekday:'long',month:'short',day:'numeric'}))+'</h3><span class="ws-kick">'+(dd.overall==null?'no data':Math.round(dd.overall*100)+'% overall')+'</span></div>'+(rows||'<p class="ws-empty">Switch on a module to see it here.</p>');
}

/* ---------- radar + alerts ---------- */
function renderWsRadar(rows,prevRates){
  const el=$('ws-radar'),live=rows.filter(r=>r.p.rate!=null);
  if(live.length<3){el.innerHTML='<div class="ws-ph"><span class="ws-code">RADAR</span><h3>Balance</h3></div><p class="ws-empty">The balance radar appears once three apps have data.</p>';return}
  const W=340,H=300,cx=170,cy=150,R=108,n=live.length,ang=i=>-90+i*360/n,pt=(i,f)=>wsPolar(cx,cy,R*f,ang(i)).map(v=>v.toFixed(1)).join(',');
  let s='<svg class="ws-radar" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Balance across apps">';
  [0.25,0.5,0.75,1].forEach(f=>{s+='<polygon points="'+live.map((_,i)=>pt(i,f)).join(' ')+'" class="ring"/>'});
  live.forEach((_,i)=>{s+='<line x1="'+cx+'" y1="'+cy+'" x2="'+pt(i,1).split(',')[0]+'" y2="'+pt(i,1).split(',')[1]+'" class="spoke"/>'});
  s+='<polygon points="'+live.map((r,i)=>pt(i,Math.max(0.02,prevRates[r.m.id]||0))).join(' ')+'" class="prev"/><polygon points="'+live.map((r,i)=>pt(i,Math.max(0.02,r.p.rate))).join(' ')+'" class="now"/>';
  live.forEach((r,i)=>{const p=wsPolar(cx,cy,R*Math.max(0.02,r.p.rate),ang(i)),l=wsPolar(cx,cy,R+22,ang(i));s+='<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="3.4" fill="'+r.m.color+'"/><text x="'+l[0].toFixed(1)+'" y="'+(l[1]+3).toFixed(1)+'" text-anchor="middle" class="lab" fill="'+r.m.color+'">'+esc(r.m.code)+'</text><text x="'+l[0].toFixed(1)+'" y="'+(l[1]+15).toFixed(1)+'" text-anchor="middle" class="val">'+insPct(r.p.rate)+'</text>'});
  el.innerHTML='<div class="ws-ph"><span class="ws-code">RADAR</span><h3>Balance</h3><span class="ws-kick">last 7 days vs the 7 before</span></div>'+s+'</svg><div class="ws-legend"><span><i class="k now"></i>Last 7 days</span><span><i class="k prev"></i>Prior 7 days</span></div>';
}
function renderWsAlerts(rows){
  const el=$('ws-alerts'),weak=rows.filter(r=>r.p.rate!=null&&r.p.rate<0.8).sort((a,b)=>a.p.rate-b.p.rate);
  if(!rows.some(r=>r.p.rate!=null)){el.innerHTML='<div class="ws-ph"><span class="ws-code">ALERTS</span><h3>Systems check</h3></div><p class="ws-empty">Nothing has been recorded yet. Ticks from your apps show up here by themselves.</p>';return}
  if(!weak.length){el.innerHTML='<div class="ws-ph"><span class="ws-code">ALERTS</span><h3>Systems check</h3></div><div class="ws-alert ok"><b>All systems at 80% or better.</b><span>Hold the same week again.</span></div>';return}
  el.innerHTML='<div class="ws-ph"><span class="ws-code">ALERTS</span><h3>Where it is leaking</h3><span class="ws-kick">below 80% over 7 days</span></div>'+weak.map(r=>{const wd=insWeakDay(r.m);
    return'<div class="ws-alert '+insStatus(r.p.rate)+'" style="--c:'+r.m.color+'"><div><b>'+esc(r.m.name)+' · '+insPct(r.p.rate)+'</b><span>'+r.p.done+' of '+r.p.total+(r.m.frac?' goal-days':' ticked')+' in 7 days'+(wd?' · weakest day '+wd.name+' ('+insPct(wd.rate)+')':'')+'</span></div>'+(r.m.link&&r.m.link!=='#'?'<a href="'+r.m.link+'" data-profile-link>Open</a>':'')+'</div>'}).join('');
}

/* ---------- one panel per app ---------- */
function insModExtras(m,p7,p28){
  const lines=[];
  if(m.id==='gym'){
    const days=p7.days.map(x=>insFacts(x.d)).filter(f=>f.inPlan),pl=days.filter(f=>f.planned);
    lines.push('Sessions '+pl.filter(f=>f.trained).length+' of '+pl.length+' · weigh-ins '+days.filter(f=>f.weight!=null).length+' of '+days.length);
    const lifted=Array.from({length:7},(_,k)=>insFacts(addDays(insCur.today,-k)).vol).reduce((a,b)=>a+b,0);
    if(lifted)lines.push('Lifted '+(lifted/1000).toFixed(1)+' t in 7 days');
  }
  if(m.id==='diet'){
    const days=p7.days.map(x=>insFacts(x.d)).filter(f=>f.logged);
    if(days.length)lines.push('Calories on target '+days.filter(f=>f.kcalOk).length+' of '+days.length+' · protein goal '+days.filter(f=>f.proteinOk).length+' of '+days.length);
    if(days.length)lines.push('Average '+insInt(days.reduce((s,f)=>s+f.kcal,0)/days.length)+' kcal · '+insInt(days.reduce((s,f)=>s+f.protein,0)/days.length)+' g protein');
  }
  const wd=insWeakDay(m);if(wd)lines.push('Weakest day: '+wd.name+' ('+insPct(wd.rate)+')');
  if(p28.rate!=null&&p28.days.length>=3)lines.push((p28.days.length>=28?'28-day':p28.days.length+'-day')+' average '+insPct(p28.rate));
  return lines;
}
function renderWsMods(rows,prevRates){
  const el=$('ws-mods');
  el.innerHTML=rows.map(r=>{
    const m=r.m,p=r.p,st=insStatus(p.rate),t=r.today,p14=insModPeriod(m,addDays(insCur.today,-14),addDays(insCur.today,-1)),p28=insModPeriod(m,(m.since&&m.since>addDays(insCur.today,-28))?m.since:addDays(insCur.today,-28),addDays(insCur.today,-1)),prev=prevRates[m.id];
    const delta=p.rate!=null&&prev!=null?Math.round((p.rate-prev)*100):null,ex=insModExtras(m,p,p28);
    const strip=p14.days.map(x=>{const rr=insR(x.v);return rr==null?'<span class="ws-mini na"></span>':wsRing(rr,m.color,18,2.6,insShortDay(x.d)+' '+(x.v.frac!=null?Math.round(x.v.frac*100)+'%':x.v.done+'/'+x.v.total))}).join('');
    const body=m.since?
      '<div class="ws-mbody"><div class="ws-gwrap">'+(t?wsGauge(t.done,t.total,t.frac,m.color,'TODAY'):'<div class="ws-none">Nothing due today</div>')+'</div><div class="ws-mstats"><div class="big">'+insPct(p.rate)+'<small>7 days</small></div><div class="sub">'+(m.frac?p.n+' days tracked':p.done+' of '+p.total+' ticks')+(delta!=null?' · <span class="'+(delta>=0?'up':'down')+'">'+(delta>=0?'▲ +':'▼ ')+delta+'</span>':'')+'</div>'+ex.map(l=>'<div class="ln">'+esc(l)+'</div>').join('')+'</div></div>'+
      '<div class="ws-strip" aria-label="Last 14 days">'+strip+'</div>'+wsTrace(p28.days,m.color)
      :'<p class="ws-empty">Nothing recorded yet. Ticks from '+esc(m.name)+' will show up here automatically.</p>';
    return'<article class="ws-mod '+st+'" style="--c:'+m.color+'"><div class="ws-ph"><span class="ws-code">'+esc(m.code)+'</span><h3>'+esc(m.name)+'</h3><span class="ws-status '+st+'">'+INS_STATUS_WORD[st]+'</span></div>'+body+
      (m.link&&m.link!=='#'?'<a class="ws-open" href="'+m.link+'" data-profile-link>Open '+esc(m.name)+' <i data-lucide="arrow-up-right"></i></a>':'')+'</article>';
  }).join('');
}

/* ---------- week by week ---------- */
function renderWsWeeks(){
  const today=insCur.today,thisMon=insMonday(today);let first=null;insCur.enabled.forEach(m=>{if(m.since&&(!first||m.since<first))first=m.since});
  if(!first||!insCur.enabled.length){$('ws-weeks').innerHTML='<div class="ws-ph"><span class="ws-code">WEEKS</span><h3>Week by week</h3></div><p class="ws-empty">Weekly history appears after the first finished day.</p>';return}
  const rows=[];
  for(let i=0;i<8;i++){
    const ws=addDays(thisMon,-7*i),we=addDays(ws,6);if(we<first)break;
    const per=insCur.enabled.map(m=>insModPeriod(m,ws<first?first:ws,we));
    const sc=insMean(per.map(p=>p.rate));
    rows.push({ws,i,per,sc});
  }
  if(!rows.some(r=>r.sc!=null)){$('ws-weeks').innerHTML='<div class="ws-ph"><span class="ws-code">WEEKS</span><h3>Week by week</h3></div><p class="ws-empty">Weekly history appears after the first finished day.</p>';return}
  const head='<tr><th>Week</th><th>Overall</th>'+insCur.enabled.map(m=>'<th style="--c:'+m.color+'">'+esc(m.code)+'</th>').join('')+'</tr>';
  const body=rows.map(r=>'<tr><th>'+(r.i===0?'This week':esc(insLabel(r.ws)))+'</th><td><span class="ws-sc '+insStatus(r.sc)+'">'+(r.sc==null?'—':Math.round(r.sc*100))+'</span></td>'+r.per.map((p,k)=>'<td class="'+insStatus(p.rate)+'">'+(p.rate==null?'—':(insCur.enabled[k].frac?insPct(p.rate):p.done+'/'+p.total))+'</td>').join('')+'</tr>').join('');
  $('ws-weeks').innerHTML='<div class="ws-ph"><span class="ws-code">WEEKS</span><h3>Week by week</h3><span class="ws-kick">ticks done / ticks due, per app</span></div><div class="ws-table-wrap"><table class="ws-table"><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div>';
}

function wireInsights(){
  if(wireInsights._wired)return;wireInsights._wired=true;
  $('page-insights').addEventListener('click',e=>{
    const hx=e.target.closest('.ws-hx[data-d]');if(hx&&insCur){showWsDay(hx.dataset.d);return}
    const chip=e.target.closest('[data-mod]');
    if(chip&&state.insights){
      const off=state.insights.prefs.off,id=chip.dataset.mod;
      if(id==='__all')state.insights.prefs.off=[];else{const i=off.indexOf(id);if(i>=0)off.splice(i,1);else off.push(id)}
      insSavePrefs();renderInsightsPage(false);
    }
  });
  $('ws-refresh').addEventListener('click',()=>{insightsLoadedAt=0;const b=$('ws-refresh');b.disabled=true;renderInsightsPage(true).finally(()=>{b.disabled=false})});
}
async function renderInsightsPage(force){
  if(!INSIGHT_WEIGHT_GOALS[state.profile])return;
  await ensureInsightsLoaded(force);
  const tdy=today();
  insCur={today:tdy,facts:{},dayCache:{},sel:insCur&&insCur.sel&&insCur.sel<=tdy?insCur.sel:null};
  const all=insBuildMods(),off=state.insights.prefs.off;
  insCur.enabled=all.filter(m=>!off.includes(m.id)&&m.since);
  wireInsights();
  // Pledge can link to this score: save each finished day's overall % (all apps, ignoring the on/off chips)
  try{
    const log={};
    for(let k=1;k<=60;k++){const d=addDays(tdy,-k);let sum=0,n=0;
      all.forEach(m=>{if(m.since&&d>=m.since){const v=m.get(d),r=v?insR(v):null;if(r!=null){sum+=r;n++}}});
      if(n)log[d]=Math.round(sum/n*100)}
    const js=JSON.stringify(log);
    if(state.insights._ovl!==js){state.insights._ovl=js;profileRef('hub-profiles','overallLog').set({json:js}).catch(()=>{})}
  }catch(e){}
  renderWsBar(all);
  const last7=[addDays(tdy,-7),addDays(tdy,-1)],prev7=[addDays(tdy,-14),addDays(tdy,-8)];
  const rows=insCur.enabled.map(m=>({m,p:insModPeriod(m,last7[0],last7[1]),today:m.get(tdy)}));
  const prevRates={};insCur.enabled.forEach(m=>{prevRates[m.id]=insModPeriod(m,prev7[0],prev7[1]).rate});
  const overall=insMean(rows.map(r=>r.p.rate)),prevOverall=insMean(Object.keys(prevRates).map(k=>prevRates[k]));
  renderWsStage(rows,overall,prevOverall,insOverallStreaks());
  const gymOn=!off.includes('gym');
  $('ws-mission').hidden=!gymOn;if(gymOn)renderWsMission(insWeight(insPlanPath()));
  renderWsHex();renderWsRadar(rows,prevRates);renderWsAlerts(rows);
  renderWsMods(all.filter(m=>!off.includes(m.id)).map(m=>({m,p:insModPeriod(m,last7[0],last7[1]),today:m.since?m.get(tdy):null})),prevRates);
  renderWsWeeks();
  const t=new Date();$('ws-foot').textContent='Read-only. Fed by Schedule, Gym, Diet, Chores, To-Do, Skin, Water and Pledge. Switch apps on or off with the module bar. Updated '+t.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+'.';
  if(window.lucide)lucide.createIcons();
  updateProfileLinks();
}


/* =====================================================================
   SETTINGS — the palette + wallpaper editor. Dragging a color swatch
   updates the live page instantly (and, if it's the color for whichever
   profile is currently active, the whole Hub's accent) without touching
   Firestore on every drag tick; the write only happens once you let go
   (a 'change' event) or type+blur a hex value, same debounce-by-event-type
   trick used nowhere else in this file but worth it here specifically
   because a native color input fires 'input' dozens of times a second.
===================================================================== */
function renderSettingsPage(){
  const t=state.theme||DEFAULT_THEME;
  const activeMode=t.mode||'light';
  const activePalette=(t.mode&&t.mode.indexOf('palette-')===0)?THEME_PALETTES.find(p=>p.id===t.mode):null;
  $('settings-theme-modes').innerHTML=THEME_MODES.map(m=>{
    return '<button type="button" class="theme-mode-swatch'+(activeMode===m.id?' active':'')+'" data-theme-mode="'+m.id+'" title="'+esc(m.name)+'"><div class="tm-preview" style="background:'+m.body+'"><span class="tm-rail" style="background:'+m.rail+'"></span><span class="tm-body"><span class="tm-chip" style="background:'+m.chip+'"></span><span class="tm-line" style="background:'+m.line+'"></span></span></div><strong>'+esc(m.name)+'</strong><small>'+esc(m.desc)+'</small></button>';
  }).join('')+
  '<button type="button" class="theme-mode-swatch theme-mode-more'+(activePalette?' active':'')+'" id="settings-theme-browse" title="Browse the full theme gallery">'+
    (activePalette
      ?'<div class="tm-preview" style="background:'+activePalette.vars.bg+'"><span class="tm-rail" style="background:'+activePalette.vars.ink+'"></span><span class="tm-body"><span class="tm-chip" style="background:var(--accent)"></span><span class="tm-line" style="background:'+activePalette.vars.line+'"></span></span></div>'
      :'<div class="tm-preview tm-preview-more"><i data-lucide="palette"></i></div>')+
    '<strong>'+(activePalette?esc(activePalette.name):'More themes')+'</strong><small>Browse '+THEME_PALETTES.length+' more</small></button>';
  $('settings-profile-pickers').innerHTML=['Bhargav','Anusha'].map(name=>{
    const hex=(t.accents&&t.accents[name])||DEFAULT_THEME.accents[name];
    return '<div class="settings-picker-row" data-profile="'+name+'"><span class="avatar settings-avatar-swatch '+name.toLowerCase()+'" style="background:'+hex+'">'+name[0]+'</span><div class="settings-picker-copy"><strong>'+name+'’s color</strong><small>Used across every app when '+name+' is active</small></div><input type="color" value="'+hex+'" data-profile-color="'+name+'" aria-label="'+name+'’s color"><input type="text" class="input settings-hex" value="'+hex+'" data-profile-hex="'+name+'" maxlength="7" spellcheck="false" aria-label="'+name+'’s color, as hex"></div>';
  }).join('');
  $('settings-palette-presets').innerHTML=PALETTE_PRESETS.map(p=>'<button type="button" class="palette-swatch" data-preset="'+esc(p.name)+'" title="'+esc(p.name)+'"><span class="ps-dot" style="background:'+p.Bhargav+'"></span><span class="ps-dot" style="background:'+p.Anusha+'"></span><small>'+esc(p.name)+'</small></button>').join('');
  const activeWallpaper=(t.wallpaper&&t.wallpaper.id)||'none';
  const customPhoto=t.wallpaper&&t.wallpaper.id==='custom'&&t.wallpaper.css;
  // A <button> can't contain nested <button>s (the browser silently
  // splits the markup apart, which was breaking this tile into stray
  // top-level grid cells) — so the "has a photo" state is a plain <div>
  // wrapping two real buttons instead of one button wrapping two more.
  const uploadTile=customPhoto
    ?'<div class="wallpaper-swatch wallpaper-upload-tile has-photo active" id="settings-wallpaper-upload-tile"><span class="ws-preview" style="background:'+t.wallpaper.css.replace(/"/g,'&quot;')+'"></span><small>Your photo</small><span class="wallpaper-photo-actions"><button type="button" id="settings-photo-change">Change</button><button type="button" id="settings-photo-remove">Remove</button></span></div>'
    :'<button type="button" class="wallpaper-swatch wallpaper-upload-tile" id="settings-wallpaper-upload-tile" title="Upload your own photo"><span class="ws-preview"><i data-lucide="upload"></i></span><small>Upload photo</small></button>';
  $('settings-wallpaper-presets').innerHTML=uploadTile+WALLPAPER_PRESETS.map(w=>'<button type="button" class="wallpaper-swatch'+(activeWallpaper===w.id?' active':'')+(w.live?' is-live':'')+'" data-wallpaper="'+w.id+'" title="'+esc(w.name)+(w.live?' (live, animated)':'')+'"><span class="ws-preview" style="background:'+(w.css||'var(--surface-soft)')+'">'+(w.live?'<span class="ws-live-badge"><i data-lucide="sparkles"></i>Live</span>':'')+'</span><small>'+esc(w.name)+'</small></button>').join('');
  if($('settings-app-icons')){
    const apps=(state.apps&&state.apps.length)?state.apps:Object.keys(DEFAULT_APP_ICON).map(file=>({file,title:titleFromFilename(file)}));
    $('settings-app-icons').innerHTML=apps.map(a=>{
      return '<button type="button" class="app-icon-swatch" data-icon-edit="'+esc(a.file)+'" title="Change '+esc(a.title)+'’s icon">'+
        '<span class="app-icon">'+appIconHtml(a.file)+'</span><strong>'+esc(a.title)+'</strong><small>Change</small></button>';
    }).join('');
  }
  renderBannerGallery();
  if(window.lucide)lucide.createIcons();
  wireSettingsEvents();
}
function setThemeMode(id){
  if(!THEME_MODES.some(m=>m.id===id)&&!THEME_PALETTES.some(p=>p.id===id))return;
  state.theme=state.theme||JSON.parse(JSON.stringify(DEFAULT_THEME));
  state.theme.mode=id;
  applyTheme();saveProfileAppearance();renderSettingsPage();
}
/* ---- Theme gallery modal: the other ~50 palettes, browsed separately
   from the 4 classic tiles so the main Settings page doesn't turn into a
   wall of swatches. ---- */
function renderThemeGallery(){
  const t=state.theme||DEFAULT_THEME;
  $('theme-gallery-grid').innerHTML=THEME_PALETTES.map(p=>{
    const active=t.mode===p.id;
    return '<button type="button" class="theme-mode-swatch'+(active?' active':'')+'" data-theme-mode="'+p.id+'" title="'+esc(p.name)+'">'+
      '<div class="tm-preview" style="background:'+p.vars.bg+'"><span class="tm-rail" style="background:'+p.vars.ink+'"></span><span class="tm-body"><span class="tm-chip" style="background:var(--accent)"></span><span class="tm-line" style="background:'+p.vars.line+'"></span></span></div>'+
      '<strong>'+esc(p.name)+'</strong></button>';
  }).join('');
  if(window.lucide)lucide.createIcons();
}
let themeGalleryWired=false;
function wireThemeGalleryModal(){
  if(themeGalleryWired)return;themeGalleryWired=true;
  $('theme-gallery-close').addEventListener('click',()=>$('theme-gallery-modal').hidden=true);
  $('theme-gallery-modal').addEventListener('click',e=>{
    if(e.target.id==='theme-gallery-modal'){$('theme-gallery-modal').hidden=true;return}
    const btn=e.target.closest('[data-theme-mode]');
    if(btn){setThemeMode(btn.dataset.themeMode);$('theme-gallery-modal').hidden=true;}
  });
}
/* ---- App icon picker: pick from the curated Lucide library or upload a
   custom image, scoped to whichever app tile was clicked. ---- */
let iconPickerFile=null;
function renderIconPicker(){
  if(!iconPickerFile)return;
  const info=appIconInfo(iconPickerFile);
  const app=(state.apps||[]).find(a=>a.file===iconPickerFile);
  $('icon-picker-title').textContent=(app?app.title:titleFromFilename(iconPickerFile))+'’s icon';
  const isCustomImage=info.type==='image';
  $('icon-picker-upload-tile').innerHTML=isCustomImage
    ?'<span class="ws-preview"><img src="'+info.src+'" alt=""></span><small>Your image</small>'
    :'<span class="ws-preview"><i data-lucide="upload"></i></span><small>Upload image</small>';
  $('icon-picker-upload-tile').classList.toggle('has-photo',isCustomImage);
  $('icon-picker-remove-row').hidden=!state.appIcons[iconPickerFile];
  $('icon-picker-grid').innerHTML=ICON_LIBRARY.map(name=>{
    const active=info.type==='icon'&&info.icon===name;
    return '<button type="button" class="icon-picker-item'+(active?' active':'')+'" data-icon-pick="'+name+'" title="'+name+'"><i data-lucide="'+name+'"></i></button>';
  }).join('');
  if(window.lucide)lucide.createIcons();
}
function openIconPicker(file){
  iconPickerFile=file;
  renderIconPicker();
  $('icon-picker-modal').hidden=false;
}
function setAppIconChoice(icon){
  if(!iconPickerFile)return;
  state.appIcons[iconPickerFile]={type:'icon',icon};
  saveHubIcons();renderAllCategoryPages();renderSettingsPage();renderIconPicker();
}
function resetAppIcon(){
  if(!iconPickerFile)return;
  delete state.appIcons[iconPickerFile];
  saveHubIcons();renderAllCategoryPages();renderSettingsPage();renderIconPicker();
}
async function handleAppIconUpload(file){
  if(!file||!/^image\//.test(file.type)||!iconPickerFile)return;
  const progress=$('icon-picker-progress');
  progress.hidden=false;progress.textContent='Preparing your image…';
  try{
    const img=await fileToImage(file);
    const dataUrl=compressIconPhoto(img);
    if(!dataUrl){progress.textContent="That image is too large even after compressing — try a smaller one.";setTimeout(()=>{progress.hidden=true},3500);return}
    state.appIcons[iconPickerFile]={type:'image',src:dataUrl};
    progress.hidden=true;
    await saveHubIcons();
    renderAllCategoryPages();renderSettingsPage();renderIconPicker();
  }catch(e){
    console.warn(e);progress.textContent="Couldn't read that image — try another one.";setTimeout(()=>{progress.hidden=true},3500);
  }
}
let iconPickerWired=false;
function wireIconPickerModal(){
  if(iconPickerWired)return;iconPickerWired=true;
  $('icon-picker-close').addEventListener('click',()=>$('icon-picker-modal').hidden=true);
  $('icon-picker-modal').addEventListener('click',e=>{
    if(e.target.id==='icon-picker-modal'){$('icon-picker-modal').hidden=true;return}
    const pick=e.target.closest('[data-icon-pick]'); if(pick){setAppIconChoice(pick.dataset.iconPick);return}
    if(e.target.closest('#icon-picker-remove')){resetAppIcon();return}
    const uploadTile=e.target.closest('#icon-picker-upload-tile'); if(uploadTile){$('icon-picker-file').click();return}
  });
  $('icon-picker-file').addEventListener('change',e=>{
    const file=e.target.files&&e.target.files[0];
    handleAppIconUpload(file);
    e.target.value='';
  });
}
// Firestore documents cap out around 1MiB; a raw photo can blow past that
// easily, so every upload is redrawn onto a canvas, shrunk to a sane max
// dimension, and re-encoded as JPEG — stepping the quality (and, if it's
// still too big, the dimension) down until the resulting data URL comfortably
// fits alongside the rest of the theme doc's JSON.
const WALLPAPER_MAX_BASE64=850000;
function fileToImage(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=reader.result;};
    reader.onerror=reject;
    reader.readAsDataURL(file);
  });
}
function compressImageToDataUrl(img,startMaxDim,maxBytes){
  let maxDim=startMaxDim;
  for(let attempt=0;attempt<6;attempt++){
    const scale=Math.min(1,maxDim/Math.max(img.width,img.height));
    const w=Math.round(img.width*scale),h=Math.round(img.height*scale);
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,w,h);
    for(let q=0.78;q>=0.35;q-=0.1){
      const dataUrl=canvas.toDataURL('image/jpeg',q);
      if(dataUrl.length<=maxBytes)return dataUrl;
    }
    maxDim=Math.round(maxDim*0.75); // still too big even at low quality — shrink further and retry
  }
  return null; // couldn't get under the limit even at the smallest size tried
}
function compressWallpaperPhoto(img){ return compressImageToDataUrl(img,1600,WALLPAPER_MAX_BASE64) }
// Icons are tiny on screen (a 44px circle), but several of them share one
// Firestore document (users/{uid}/apps/hub/data/icons), so each one gets a
// much smaller budget than the single full-bleed wallpaper photo does —
// 200px/45KB is already generous for how small these render.
const ICON_MAX_BASE64=45000;
function compressIconPhoto(img){ return compressImageToDataUrl(img,200,ICON_MAX_BASE64) }
async function handleWallpaperUpload(file){
  if(!file||!/^image\//.test(file.type))return;
  const progress=$('settings-upload-progress');
  progress.hidden=false;progress.textContent='Preparing your photo…';
  try{
    const img=await fileToImage(file);
    const dataUrl=compressWallpaperPhoto(img);
    if(!dataUrl){progress.textContent='That photo is too large even after compressing — try a smaller image.';setTimeout(()=>{progress.hidden=true},3500);return}
    state.theme=state.theme||JSON.parse(JSON.stringify(DEFAULT_THEME));
    state.theme.wallpaper={id:'custom',css:'url("'+dataUrl+'") center/cover no-repeat'};
    applyTheme();progress.hidden=true;
    await saveProfileAppearance();
    renderSettingsPage();
  }catch(e){
    console.warn(e);progress.textContent="Couldn't read that photo — try another one.";setTimeout(()=>{progress.hidden=true},3500);
  }
}
function applyProfileColorLive(name,hex){
  if(!/^#[0-9a-fA-F]{6}$/i.test(hex))return;
  const row=document.querySelector('.settings-picker-row[data-profile="'+name+'"]');
  if(row){const sw=row.querySelector('.settings-avatar-swatch');if(sw)sw.style.background=hex;const hx=row.querySelector('[data-profile-hex]');if(hx)hx.value=hex;}
  state.theme=state.theme||JSON.parse(JSON.stringify(DEFAULT_THEME));
  state.theme.accents=Object.assign({},DEFAULT_THEME.accents,state.theme.accents,{[name]:hex});
  // applyTheme() always refreshes both --accent-bhargav/--accent-anusha
  // (person-specific, independent of who's active) and, when it matches
  // the currently active profile, the main --accent/--accent-soft/
  // --accent-ink triplet the rest of the UI actually paints with.
  applyTheme();
}
function commitProfileColor(name,hex){
  if(!/^#[0-9a-fA-F]{6}$/i.test(hex)){renderSettingsPage();return} // bad/incomplete hex typed by hand — just redraw with the last good value
  applyProfileColorLive(name,hex);
  saveHubAccents();
}
function applyPalettePreset(name){
  const p=PALETTE_PRESETS.find(x=>x.name===name);if(!p)return;
  state.theme=state.theme||JSON.parse(JSON.stringify(DEFAULT_THEME));
  state.theme.accents={Bhargav:p.Bhargav,Anusha:p.Anusha};
  applyTheme();saveHubAccents();renderSettingsPage();
}
function setWallpaper(id){
  const w=WALLPAPER_PRESETS.find(x=>x.id===id);if(!w)return;
  state.theme=state.theme||JSON.parse(JSON.stringify(DEFAULT_THEME));
  state.theme.wallpaper={id:w.id,css:w.css};
  applyTheme();saveProfileAppearance();renderSettingsPage();
}
function resetTheme(){
  // Resets everything this Settings page controls — both the shared
  // accent colors and this profile's own mode/wallpaper — so both saves
  // fire together.
  state.theme=JSON.parse(JSON.stringify(DEFAULT_THEME));
  applyTheme();saveHubAccents();saveProfileAppearance();renderSettingsPage();
}
let settingsWired=false;
function wireSettingsEvents(){
  if(settingsWired)return;settingsWired=true;
  const page=$('page-settings');
  page.addEventListener('input',e=>{ if(e.target.dataset.profileColor)applyProfileColorLive(e.target.dataset.profileColor,e.target.value); });
  page.addEventListener('change',e=>{
    if(e.target.dataset.profileColor)commitProfileColor(e.target.dataset.profileColor,e.target.value);
    else if(e.target.dataset.profileHex)commitProfileColor(e.target.dataset.profileHex,e.target.value.trim());
    else if(e.target.id==='settings-wallpaper-file'){
      const file=e.target.files&&e.target.files[0];
      handleWallpaperUpload(file);
      e.target.value=''; // so picking the same file again still fires change
    }
  });
  page.addEventListener('click',e=>{
    const mode=e.target.closest('[data-theme-mode]'); if(mode){setThemeMode(mode.dataset.themeMode);return}
    const preset=e.target.closest('[data-preset]'); if(preset){applyPalettePreset(preset.dataset.preset);return}
    if(e.target.closest('#settings-photo-remove')){setWallpaper('none');return}
    if(e.target.closest('#settings-photo-change')){$('settings-wallpaper-file').click();return}
    const uploadTile=e.target.closest('#settings-wallpaper-upload-tile');
    if(uploadTile){ if(!uploadTile.classList.contains('has-photo'))$('settings-wallpaper-file').click(); return }
    const wp=e.target.closest('[data-wallpaper]'); if(wp){setWallpaper(wp.dataset.wallpaper);return}
    if(e.target.closest('#settings-theme-browse')){renderThemeGallery();$('theme-gallery-modal').hidden=false;return}
    const iconEdit=e.target.closest('[data-icon-edit]'); if(iconEdit){openIconPicker(iconEdit.dataset.iconEdit);return}
    if(e.target.closest('#settings-reset'))resetTheme();
  });
  wireThemeGalleryModal();
  wireIconPickerModal();
}

/* =====================================================================
   CLOCK WIDGET
===================================================================== */
let clockTimer = null;
function localTimezoneLabel(){
  try{
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; // e.g. "America/Los_Angeles"
    const parts = tz.split('/');
    return (parts[parts.length-1]||tz).replace(/_/g,' ');
  }catch(e){ return ''; }
}
function startHubClock(){
  if(clockTimer) clearInterval(clockTimer);
  const tzLabel = localTimezoneLabel();
  const tick = () => {
    const now = new Date();
    let h = now.getHours(); const period = h>=12?'PM':'AM'; h = h%12||12;
    const m = String(now.getMinutes()).padStart(2,'0'), s = String(now.getSeconds()).padStart(2,'0');
    const hubClockText = document.querySelector('.hub-clock-text');
    if(hubClockText) hubClockText.firstChild.textContent = h+':'+m+':'+s+' '+period+' ';
    $('hub-clock-date').textContent = now.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}) + (tzLabel ? ' · '+tzLabel : '');
  };
  tick(); clockTimer = setInterval(tick, 1000);
}

/* =====================================================================
   WEATHER — a small detailed widget in the sidebar, right under the
   clock. Uses Open-Meteo (no API key, CORS-friendly) with the browser's
   own geolocation when granted; falls back to a fixed default city
   otherwise so the widget is never empty. Cached in localStorage for 20
   minutes so switching pages/profiles doesn't refetch every time.
===================================================================== */
const WEATHER_CACHE_KEY='hub-weather-cache-v2';
const WEATHER_TTL_MS=20*60*1000;
const WEATHER_FALLBACK={lat:32.7157,lon:-117.1611,label:'San Diego, CA'}; // used only if geolocation is denied/unavailable
const WEATHER_GEOCODE_URL='https://geocoding-api.open-meteo.com/v1/search';
// Two independent "slots" — slot 0 is the main widget (defaults to
// wherever you are, same as before), slot 1 is an optional second city.
// null means "auto" for slot 0 (GPS, falling back to WEATHER_FALLBACK);
// for slot 1 it just means nothing's been added yet. Saved per profile so
// each of you can pin your own pair of cities.
let weatherSlots=[null,null];
let weatherEditingSlot=0;
function weatherCacheKey(slot){ return WEATHER_CACHE_KEY+(slot?'-2':''); }
const WEATHER_CODES={
  0:['sun','Clear sky'],1:['sun','Mostly clear'],2:['cloud-sun','Partly cloudy'],3:['cloud','Overcast'],
  45:['cloud-fog','Foggy'],48:['cloud-fog','Freezing fog'],
  51:['cloud-drizzle','Light drizzle'],53:['cloud-drizzle','Drizzle'],55:['cloud-drizzle','Heavy drizzle'],
  56:['cloud-drizzle','Freezing drizzle'],57:['cloud-drizzle','Freezing drizzle'],
  61:['cloud-rain','Light rain'],63:['cloud-rain','Rain'],65:['cloud-rain','Heavy rain'],
  66:['cloud-rain','Freezing rain'],67:['cloud-rain','Freezing rain'],
  71:['cloud-snow','Light snow'],73:['cloud-snow','Snow'],75:['cloud-snow','Heavy snow'],77:['cloud-snow','Snow grains'],
  80:['cloud-rain-wind','Rain showers'],81:['cloud-rain-wind','Rain showers'],82:['cloud-rain-wind','Violent showers'],
  85:['cloud-snow','Snow showers'],86:['cloud-snow','Snow showers'],
  95:['cloud-lightning','Thunderstorm'],96:['cloud-lightning','Thunderstorm, hail'],99:['cloud-lightning','Thunderstorm, hail']
};
function weatherIconFor(code){return (WEATHER_CODES[code]||['cloud','Unknown'])[0]}
function weatherLabelFor(code){return (WEATHER_CODES[code]||['cloud','Unknown'])[1]}
async function fetchWeather(lat,lon){
  const url='https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon+
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code'+
    '&hourly=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min'+
    '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=2';
  const res=await fetch(url);
  if(!res.ok)throw new Error('weather fetch failed');
  return res.json();
}
// Next five hours in the *place's own* clock (not this device's — a second city can be in another time zone),
// carrying on into tomorrow late at night instead of running out at midnight.
function weatherNextHours(data){
  const cur=(data.current&&data.current.time||'').slice(0,13);
  return data.hourly.time.map((t,i)=>({key:t.slice(0,13),hour:new Date(t).getHours(),temp:data.hourly.temperature_2m[i],code:data.hourly.weather_code[i]}))
    .filter(h=>!cur||h.key>=cur).slice(0,5);
}
function renderWeather(data,label){
  const icon=$('hub-weather-icon');
  icon.classList.remove('spin');
  icon.setAttribute('data-lucide',weatherIconFor(data.current.weather_code));
  $('hub-weather-temp').textContent=Math.round(data.current.temperature_2m)+'°';
  $('hub-weather-cond').textContent=weatherLabelFor(data.current.weather_code);
  $('hub-weather-hi').textContent='H '+Math.round(data.daily.temperature_2m_max[0])+'°';
  $('hub-weather-lo').textContent='L '+Math.round(data.daily.temperature_2m_min[0])+'°';
  $('hub-weather-humidity').textContent=Math.round(data.current.relative_humidity_2m)+'%';
  $('hub-weather-wind').textContent=Math.round(data.current.wind_speed_10m)+' mph';
  $('hub-weather-place').textContent=label;
  // Next few hours, starting from the current hour, skipping ones already past.
  const hourly=weatherNextHours(data);
  $('hub-weather-hours').innerHTML=hourly.map(h=>{
    const label=h.hour===0?'12A':h.hour===12?'12P':h.hour>12?(h.hour-12)+'P':h.hour+'A';
    return '<div class="hub-weather-hour"><span>'+label+'</span><i data-lucide="'+weatherIconFor(h.code)+'"></i><b>'+Math.round(h.temp)+'°</b></div>';
  }).join('');
  $('hub-weather-detail').hidden=false;
  if(window.lucide)lucide.createIcons();
}
function renderWeatherSecond(data,label){
  const icon=$('hub-weather-second-icon');if(!icon)return;
  icon.setAttribute('data-lucide',weatherIconFor(data.current.weather_code));
  $('hub-weather-second-temp').textContent=Math.round(data.current.temperature_2m)+'°';
  $('hub-weather-second-place').textContent=label;
  // Same hi/lo + humidity/wind + next-hours panel as the main widget,
  // now that there's actually a second city to show it for.
  $('hub-weather-second-hi').textContent='H '+Math.round(data.daily.temperature_2m_max[0])+'°';
  $('hub-weather-second-lo').textContent='L '+Math.round(data.daily.temperature_2m_min[0])+'°';
  $('hub-weather-second-humidity').textContent=Math.round(data.current.relative_humidity_2m)+'%';
  $('hub-weather-second-wind').textContent=Math.round(data.current.wind_speed_10m)+' mph';
  const hourly=weatherNextHours(data);
  $('hub-weather-second-hours').innerHTML=hourly.map(h=>{
    const label=h.hour===0?'12A':h.hour===12?'12P':h.hour>12?(h.hour-12)+'P':h.hour+'A';
    return '<div class="hub-weather-hour"><span>'+label+'</span><i data-lucide="'+weatherIconFor(h.code)+'"></i><b>'+Math.round(h.temp)+'°</b></div>';
  }).join('');
  $('hub-weather-second-toggle').setAttribute('aria-expanded', $('hub-weather-second').classList.contains('is-collapsed')?'false':'true');
  $('hub-weather-second-chevron').hidden=false;
  $('hub-weather-second-detail').hidden=false; // mirrors renderWeather()'s own hub-weather-detail.hidden=false — without this the panel's HTML "hidden" attribute never clears, so toggling the .is-collapsed class alone can never actually show it
  if(window.lucide)lucide.createIcons();
}
function weatherError(){
  const icon=$('hub-weather-icon');
  if(icon){icon.classList.remove('spin');icon.setAttribute('data-lucide','cloud-off');if(window.lucide)lucide.createIcons()}
  const cond=$('hub-weather-cond');if(cond)cond.textContent='Weather unavailable';
}
function weatherErrorSecond(){
  const place=$('hub-weather-second-place');if(place)place.textContent='Unavailable';
  const icon=$('hub-weather-second-icon');if(icon){icon.setAttribute('data-lucide','cloud-off');if(window.lucide)lucide.createIcons()}
}
// Same idea as hubWeatherSetCollapsed above, just for the second city's own
// panel — remembered separately since someone might want the main city
// expanded but the second one tucked away, or vice versa.
function hubWeatherSecondSetCollapsed(collapsed){
  const el=$('hub-weather-second'); if(!el) return;
  el.classList.toggle('is-collapsed',collapsed);
  const btn=$('hub-weather-second-toggle');
  if(btn) btn.setAttribute('aria-expanded', collapsed?'false':'true');
  try{ localStorage.setItem('hub-weather-second-collapsed', collapsed?'1':'0'); }catch(e){}
}
async function loadWeatherFor(lat,lon,label,skipCache,slot){
  slot=slot||0;
  try{
    const key=weatherCacheKey(slot);
    if(!skipCache){
      const cached=safeJson(localStorage.getItem(key),null);
      if(cached && cached.lat===lat && cached.lon===lon && (Date.now()-cached.at)<WEATHER_TTL_MS){(slot?renderWeatherSecond:renderWeather)(cached.data,label);return}
    }
    const data=await fetchWeather(lat,lon);
    localStorage.setItem(key,JSON.stringify({lat,lon,at:Date.now(),data}));
    (slot?renderWeatherSecond:renderWeather)(data,label);
  }catch(e){
    console.warn('weather',e);
    // Offline / API down: show the last good reading for this city rather than nothing.
    const old=safeJson(localStorage.getItem(weatherCacheKey(slot)),null);
    if(old&&old.data&&old.lat===lat&&old.lon===lon){ try{ (slot?renderWeatherSecond:renderWeather)(old.data,label); return; }catch(_){} }
    (slot?weatherErrorSecond:weatherError)();
  }
}
async function saveWeatherSlots(){ try{ await profileRef('hub-profiles','weather').set({json:JSON.stringify({slots:weatherSlots})}); }catch(e){} }
function openWeatherLocationEditor(slot){
  weatherEditingSlot=slot;
  $('hub-weather-location-editor').hidden=false;
  const rm=$('hub-weather-remove-slot'); if(rm) rm.hidden=!(slot===1&&weatherSlots[1]);
  $('hub-weather-search-input').value='';
  $('hub-weather-search-results').innerHTML='';
  $('hub-weather-search-input').focus();
}
function removeSecondCity(){
  weatherSlots[1]=null; saveWeatherSlots();
  try{ localStorage.removeItem(weatherCacheKey(1)); }catch(e){}
  $('hub-weather-second-place').textContent='Add a second city';
  $('hub-weather-second-temp').textContent='';
  $('hub-weather-second-icon').setAttribute('data-lucide','plus-circle');
  $('hub-weather-second-chevron').hidden=true;
  $('hub-weather-second-detail').hidden=true;
  hubWeatherSecondSetCollapsed(true);
  if(window.lucide)lucide.createIcons();
  closeWeatherLocationEditor();
}
function closeWeatherLocationEditor(){ $('hub-weather-location-editor').hidden=true; }
function useGpsForSlot(slot){
  if(!navigator.geolocation){closeWeatherLocationEditor();return}
  if(slot===0){const icon=$('hub-weather-icon');icon.setAttribute('data-lucide','loader-circle');icon.classList.add('spin');if(window.lucide)lucide.createIcons();}
  navigator.geolocation.getCurrentPosition(
    pos=>{
      const la=Number(pos.coords.latitude.toFixed(3)),lo=Number(pos.coords.longitude.toFixed(3));
      // Main slot: null = auto/GPS going forward. Second slot has no "auto" — pin the spot so it survives a reload.
      weatherSlots[slot]=slot===0?null:{lat:la,lon:lo,label:'Your location'};
      saveWeatherSlots();
      loadWeatherFor(la,lo,'Your location',true,slot);
      closeWeatherLocationEditor();
    },
    ()=>{ loadWeatherFor(WEATHER_FALLBACK.lat,WEATHER_FALLBACK.lon,WEATHER_FALLBACK.label,true,slot); closeWeatherLocationEditor(); },
    {timeout:8000,maximumAge:0}
  );
}
let weatherSearchTimer=null,weatherSearchSeq=0;
async function geocodeCitySearch(q){
  const seq=++weatherSearchSeq;
  const resultsEl=$('hub-weather-search-results');if(!resultsEl)return;
  if(!q||q.trim().length<2){resultsEl.innerHTML='';return}
  resultsEl.innerHTML='<p class="hub-weather-search-empty">Searching…</p>';
  try{
    const res=await fetch(WEATHER_GEOCODE_URL+'?name='+encodeURIComponent(q.trim())+'&count=6&language=en&format=json');
    if(!res.ok)throw new Error('geocode failed');
    const data=await res.json();
    if(seq!==weatherSearchSeq)return;
    const results=data.results||[];
    if(!results.length){resultsEl.innerHTML='<p class="hub-weather-search-empty">No matches</p>';return}
    resultsEl.innerHTML=results.map(r=>{
      const label=[r.name,r.admin1,r.country].filter(Boolean).join(', ');
      return '<button type="button" class="hub-weather-search-result" data-lat="'+r.latitude+'" data-lon="'+r.longitude+'" data-label="'+esc(label)+'">'+esc(label)+'</button>';
    }).join('');
  }catch(e){ if(seq===weatherSearchSeq) resultsEl.innerHTML='<p class="hub-weather-search-empty">Search unavailable right now</p>'; }
}
function setWeatherSlotLocation(slot,lat,lon,label){
  weatherSlots[slot]={lat,lon,label};
  saveWeatherSlots();
  loadWeatherFor(lat,lon,label,true,slot);
  closeWeatherLocationEditor();
}
// Collapsed by default (it was overwhelming the sidebar above the nav) —
// remembers the person's choice across visits via localStorage.
function hubWeatherSetCollapsed(collapsed){
  const el=$('hub-weather'); if(!el) return;
  el.classList.toggle('is-collapsed',collapsed);
  const btn=$('hub-weather-toggle');
  if(btn) btn.setAttribute('aria-expanded', collapsed?'false':'true');
  try{ localStorage.setItem('hub-weather-collapsed', collapsed?'1':'0'); }catch(e){}
}
let weatherWired=false,weatherIntervalStarted=false;
function wireHubWeatherOnce(){
  if(weatherWired)return;weatherWired=true;
  $('hub-weather-toggle').addEventListener('click',()=>{ hubWeatherSetCollapsed(!$('hub-weather').classList.contains('is-collapsed')); });
  $('hub-weather-place-btn').addEventListener('click',e=>{ e.stopPropagation(); openWeatherLocationEditor(0); });
  // Second city: no location set yet → clicking the row opens the editor
  // directly (nothing to expand). Once a city is set, the row instead
  // toggles its own detail panel, same as the main widget; "Change
  // location" inside that panel is what opens the editor from then on.
  $('hub-weather-second-toggle').addEventListener('click',()=>{
    if(!weatherSlots[1]){ openWeatherLocationEditor(1); return; }
    hubWeatherSecondSetCollapsed(!$('hub-weather-second').classList.contains('is-collapsed'));
  });
  $('hub-weather-second-place-btn').addEventListener('click',e=>{ e.stopPropagation(); openWeatherLocationEditor(1); });
  $('hub-weather-use-gps').addEventListener('click',e=>{ e.stopPropagation(); useGpsForSlot(weatherEditingSlot); });
  $('hub-weather-search-close').addEventListener('click',e=>{ e.stopPropagation(); closeWeatherLocationEditor(); });
  $('hub-weather-remove-slot').addEventListener('click',e=>{ e.stopPropagation(); removeSecondCity(); });
  $('hub-weather-search-input').addEventListener('click',e=>e.stopPropagation());
  $('hub-weather-search-input').addEventListener('input',e=>{
    clearTimeout(weatherSearchTimer);
    const q=e.target.value;
    weatherSearchTimer=setTimeout(()=>geocodeCitySearch(q),350);
  });
  $('hub-weather-search-results').addEventListener('click',e=>{
    e.stopPropagation();
    const btn=e.target.closest('[data-lat]');if(!btn)return;
    setWeatherSlotLocation(weatherEditingSlot,Number(btn.dataset.lat),Number(btn.dataset.lon),btn.dataset.label);
  });
}
async function initHubWeather(){
  if(!$('hub-weather'))return;
  const savedCollapsed=(function(){ try{ const v=localStorage.getItem('hub-weather-collapsed'); return v===null?true:v==='1'; }catch(e){ return true; } })();
  hubWeatherSetCollapsed(savedCollapsed);
  wireHubWeatherOnce();
  // Per-profile: each of you can pin your own pair of cities, same as the
  // theme/icons/photos personalization above.
  const saved=await readJson(profileRef('hub-profiles','weather'), null);
  weatherSlots=(saved&&Array.isArray(saved.slots))?[saved.slots[0]||null,saved.slots[1]||null]:[null,null];

  if(weatherSlots[0]){
    loadWeatherFor(weatherSlots[0].lat,weatherSlots[0].lon,weatherSlots[0].label,false,0);
  }else if(!navigator.geolocation){
    loadWeatherFor(WEATHER_FALLBACK.lat,WEATHER_FALLBACK.lon,WEATHER_FALLBACK.label,false,0);
  }else{
    navigator.geolocation.getCurrentPosition(
      pos=>loadWeatherFor(Number(pos.coords.latitude.toFixed(3)),Number(pos.coords.longitude.toFixed(3)),'Your location',false,0),
      ()=>loadWeatherFor(WEATHER_FALLBACK.lat,WEATHER_FALLBACK.lon,WEATHER_FALLBACK.label,false,0),
      {timeout:8000,maximumAge:600000}
    );
  }
  if(weatherSlots[1]){
    const savedSecondCollapsed=(function(){ try{ const v=localStorage.getItem('hub-weather-second-collapsed'); return v===null?true:v==='1'; }catch(e){ return true; } })();
    hubWeatherSecondSetCollapsed(savedSecondCollapsed);
    loadWeatherFor(weatherSlots[1].lat,weatherSlots[1].lon,weatherSlots[1].label,false,1);
  }else{
    $('hub-weather-second-place').textContent='Add a second city';
    $('hub-weather-second-temp').textContent='';
    $('hub-weather-second-icon').setAttribute('data-lucide','plus-circle');
    $('hub-weather-second-chevron').hidden=true;
    $('hub-weather-second-detail').hidden=true;
    hubWeatherSecondSetCollapsed(true);
    if(window.lucide)lucide.createIcons();
  }
  if(!weatherIntervalStarted){
    weatherIntervalStarted=true;
    setInterval(()=>{
      const c0=safeJson(localStorage.getItem(weatherCacheKey(0)),null);if(c0)loadWeatherFor(c0.lat,c0.lon,$('hub-weather-place').textContent,true,0);
      const c1=safeJson(localStorage.getItem(weatherCacheKey(1)),null);if(c1)loadWeatherFor(c1.lat,c1.lon,$('hub-weather-second-place').textContent,true,1);
    },WEATHER_TTL_MS);
  }
}

/* =====================================================================
   ROUTING
===================================================================== */
function showRoute(route){if(!['today','planner','health','home','insights','settings'].includes(route))route='today';document.querySelectorAll('[data-page]').forEach(p=>p.classList.toggle('active',p.dataset.page===route));document.querySelectorAll('[data-route]').forEach(b=>b.classList.toggle('active',b.dataset.route===route));if(location.hash!=='#'+route)history.replaceState(null,'','#'+route);window.scrollTo({top:0,behavior:'smooth'});if(route==='insights'&&state.user&&state.profile)renderInsightsPage().catch(e=>console.warn(e));if(route==='settings'&&state.user&&state.profile)renderSettingsPage()}
// Clicking Today/Planner/Health/Home/Insights while an app is open in the
// viewer used to just switch the (hidden) page behind the overlay — the
// screen still showed whatever app was open, so the click looked like it
// did nothing until you separately hit "Back to Hub". Closing the app
// viewer first makes the switch visible immediately, same as clicking
// Back to Hub yourself would.
document.querySelectorAll('[data-route]').forEach(el=>el.addEventListener('click',e=>{
  e.preventDefault();
  if($('app-frame-overlay') && !$('app-frame-overlay').hidden) closeAppFrame();
  showRoute(el.dataset.route);
}));
window.addEventListener('hashchange',()=>{
  const h=location.hash;
  if(h.indexOf('#app=')===0){ restoreAppFromHash(); return; }
  if($('app-frame-overlay') && !$('app-frame-overlay').hidden) closeAppFrame();
  showRoute(h.replace('#',''));
});

/* =====================================================================
   SIDEBAR COLLAPSE — toggled from the Home Hub brand button (top-left).
   Persisted so it stays how you left it across reloads.
===================================================================== */
const SIDEBAR_COLLAPSE_KEY='hub-sidebar-collapsed';
function setSidebarCollapsed(collapsed){
  $('app-shell').classList.toggle('sidebar-collapsed',collapsed);
  try{localStorage.setItem(SIDEBAR_COLLAPSE_KEY,collapsed?'1':'0')}catch(e){}
}
// Refreshes whatever's currently showing: the embedded app if one's open
// (same as its own Refresh button), otherwise the whole Hub page.
function hubRefreshCurrentView(){
  if($('app-frame-overlay') && !$('app-frame-overlay').hidden){ refreshAppFrame(); }
  else{ location.reload(); }
}
if($('sidebar-toggle')){
  // A single click still collapses/expands the sidebar, same as always. A
  // second click landing quickly after it is treated as a double-click and
  // refreshes the current view instead — the single-click action is held
  // for a beat so a fast second click can cancel it rather than firing
  // both the collapse AND the refresh.
  let sidebarToggleClickTimer=null;
  $('sidebar-toggle').addEventListener('click',()=>{
    if(sidebarToggleClickTimer){
      clearTimeout(sidebarToggleClickTimer);
      sidebarToggleClickTimer=null;
      hubRefreshCurrentView();
      return;
    }
    sidebarToggleClickTimer=setTimeout(()=>{
      sidebarToggleClickTimer=null;
      sidebarAutoCollapsed=false; // a manual click always overrides the auto-collapse-on-open behavior below
      setSidebarCollapsed(!$('app-shell').classList.contains('sidebar-collapsed'));
    },300);
  });
  try{ if(localStorage.getItem(SIDEBAR_COLLAPSE_KEY)==='1') setSidebarCollapsed(true); }catch(e){}
}
if($('timeline-autoscroll-toggle')){
  $('timeline-autoscroll-toggle').addEventListener('click',()=>{
    timelineAutoScroll=!timelineAutoScroll;
    try{localStorage.setItem(TIMELINE_AUTOSCROLL_KEY,timelineAutoScroll?'on':'off')}catch(e){}
    updateTimelineAutoScrollUI();
  });
  updateTimelineAutoScrollUI();
}

/* =====================================================================
   IN-PAGE APP VIEWER — apps/* and gym/* open inline on the right instead
   of navigating away from the Hub, so the sidebar stays put. Any link
   whose path lives under apps/ or gym/ is intercepted automatically, so
   new apps and new links to existing apps get this for free.
===================================================================== */
function titleForAppUrl(u){
  const path=u.pathname;
  if(/\/gym\/(index\.html)?$/.test(path)) return 'Gym';
  const file=path.split('/').pop();
  const found=state.apps.find(a=>a.file===file);
  if(found) return found.title;
  return titleFromFilename(file||'App');
}
// Opening an app auto-collapses the sidebar to give it more room (Diet,
// Grocery etc. feel cramped otherwise) — but only when the sidebar was
// actually expanded at the time, and only as a temporary state (not
// saved to the persisted preference). If you manually re-expand it while
// an app is open, that click clears this flag so closing the app won't
// fight you by collapsing it again.
let sidebarAutoCollapsed=false;
function syncMobileNavHeight(){ try{ const n=document.querySelector('.mobile-nav'); if(n&&n.offsetHeight>0) document.documentElement.style.setProperty('--mobile-nav-h', n.offsetHeight+'px'); }catch(e){} }
window.addEventListener('resize',syncMobileNavHeight); window.addEventListener('orientationchange',()=>setTimeout(syncMobileNavHeight,200)); window.addEventListener('load',syncMobileNavHeight);
function openAppFrame(url,title){
  if(!$('app-shell').classList.contains('sidebar-collapsed')){
    $('app-shell').classList.add('sidebar-collapsed');
    sidebarAutoCollapsed=true;
  }
  // On phone, the Hub's own fixed top bar (the "H" brand + avatar) sits at
  // the same spot as the app viewer's own back bar — without this it just
  // floats on top of "Back to Hub", hiding it and making it look like
  // there's no way out of the app. This hides the Hub's own bar while an
  // app is open; the bottom tab bar stays up so you can always jump away.
  $('app-shell').classList.add('app-open');
  syncMobileNavHeight(); setTimeout(syncMobileNavHeight,300);
  // Always force a genuinely fresh load of the app, even if it's the same
  // URL as what's already sitting in the iframe (re-opening Clock right
  // after it was already open). Setting .src to an unchanged value is a
  // no-op in browsers — it reuses whatever page/state was already there
  // instead of reloading — which meant a page that got into a bad state
  // (e.g. Clock going blank after an alarm fired) stayed broken until a
  // full sign-out forced everything to reload from scratch. Clearing to
  // about:blank first guarantees the next assignment is always a real
  // navigation.
  $('app-frame-iframe').src='about:blank';
  setTimeout(()=>{ $('app-frame-iframe').src=url; },0);
  $('app-frame-title').textContent=title;
  $('app-frame-open').href=url;
  $('app-frame-overlay').hidden=false;
  // Stamp which app is open into the URL hash so a browser refresh (or a
  // shared/bookmarked link) lands back inside the app instead of bouncing
  // to the bare Hub — see restoreAppFromHash, called on load.
  try{ history.replaceState(null,'','#app='+encodeURIComponent(url)); }catch(e){}
  updateAppFrameProfile();
  // Clock has its own real spot in the nav (below Insights), so opening
  // it highlights that tab instead of leaving whichever page-route tab
  // was last active looking "current".
  if(/apps\/clock\.html/.test(url)){
    document.querySelectorAll('[data-route]').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('[data-nav-clock]').forEach(b=>b.classList.add('active'));
  }
  lucide.createIcons();
}
function closeAppFrame(){
  $('app-shell').classList.remove('app-open');
  $('app-frame-overlay').hidden=true;
  // ask the app to push any save it is still holding back, then unload it a beat later
  const fr=$('app-frame-iframe');
  try{ if(fr.contentWindow) fr.contentWindow.postMessage({type:'hub-flush'},'*'); }catch(e){}
  setTimeout(()=>{ if($('app-frame-overlay').hidden) fr.src='about:blank'; },350);
  const activePage=document.querySelector('[data-page].active');
  const route=activePage?activePage.dataset.page:'today';
  if(document.querySelector('[data-nav-clock].active')){
    document.querySelectorAll('[data-nav-clock]').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('[data-route]').forEach(b=>b.classList.toggle('active',b.dataset.route===route));
  }
  // Leaving the app clears the #app=… hash left by openAppFrame so a
  // refresh from here lands back on whichever Hub page is showing, not
  // back inside the app you just closed.
  try{ history.replaceState(null,'','#'+route); }catch(e){}
  if(sidebarAutoCollapsed){
    $('app-shell').classList.remove('sidebar-collapsed');
    sidebarAutoCollapsed=false;
  }
  setTimeout(()=>hubSoftRefresh(true),120);setTimeout(()=>hubSoftRefresh(true),900);
}
// Reads a #app=<url> hash (set by openAppFrame) and reopens that app in
// the viewer — used on initial load so a refresh restores where you were,
// instead of always dropping back to the bare Hub. Returns true if it
// found and restored one.
function restoreAppFromHash(){
  const h=location.hash;
  if(h.indexOf('#app=')!==0) return false;
  let u;
  try{ u=new URL(decodeURIComponent(h.slice(5)),location.href); }catch(e){ return false; }
  // The hash is just a bookmark of "which app was open" — it can be stale
  // from a previous profile. Without this, reloading the Hub (or coming
  // back later) after switching profiles reopens the saved app with
  // whatever ?profile= was baked into the hash at the time it was
  // written, while the Hub's own chrome correctly shows the profile you
  // actually have active now — the two silently disagree and you land on
  // the other person's data without any indication anything's wrong.
  // Always re-stamp the current profile onto the restored URL so the two
  // can never drift apart.
  if(state.profile) u.searchParams.set('profile',state.profile);
  openAppFrame(u.href,titleForAppUrl(u));
  return true;
}
// Refresh button in the app viewer's top bar — forces the currently open
// app to reload from scratch (same about:blank trick openAppFrame uses),
// without leaving the viewer or losing the Hub state around it.
function refreshAppFrame(){
  const url=$('app-frame-open').href;
  if(!url) return;
  const btn=$('app-frame-refresh');
  if(btn){ btn.classList.remove('spinning'); void btn.offsetWidth; btn.classList.add('spinning'); }
  $('app-frame-iframe').src='about:blank';
  setTimeout(()=>{ $('app-frame-iframe').src=url; },0);
}
if($('app-frame-refresh')) $('app-frame-refresh').addEventListener('click',refreshAppFrame);
// The sidebar's own digital time display (#hub-clock, a plain <a href>)
// is the one real entry point into Clock — it's already caught by the
// generic /apps/ link interceptor below, so it only needs the active-
// highlight wiring above. The bottom mobile-nav's Clock icon is a plain
// <button> with no href, so it still needs its own click handler.
document.querySelectorAll('button[data-nav-clock]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const url='apps/clock.html'+(state.profile?('?profile='+encodeURIComponent(state.profile)):'');
    openAppFrame(url,'Clock');
  });
});
if($('app-frame-back')) $('app-frame-back').addEventListener('click',closeAppFrame);
// The profile capsule shown in the app viewer's own top bar (see
// app-frame-right in index.html) — clicking it switches the hub-wide
// active profile and re-opens whichever app is currently sitting in the
// iframe under the new profile's ?profile= param, so the app reloads
// fresh with the other person's data without having to back out to the
// Hub first.
if($('app-frame-profile')){
  $('app-frame-profile').addEventListener('click',()=>{
    const next=state.profile==='Bhargav'?'Anusha':'Bhargav';
    setProfile(next);
    const openUrl=$('app-frame-open').href;
    if(openUrl && !$('app-frame-overlay').hidden){
      let u;
      try{ u=new URL(openUrl); }catch(e){ u=null; }
      if(u){
        u.searchParams.set('profile',next);
        openAppFrame(u.href,$('app-frame-title').textContent);
      }
    }
  });
}
document.addEventListener('keydown',e=>{ if(e.key==='Escape' && $('app-frame-overlay') && !$('app-frame-overlay').hidden) closeAppFrame(); });
document.addEventListener('click',e=>{
  if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.defaultPrevented) return;
  const a=e.target.closest('a[href]');
  if(!a||a.closest('#app-frame-overlay')) return;
  let u;
  try{ u=new URL(a.href,location.href); }catch(err){ return; }
  if(u.origin!==location.origin) return;
  if(!/\/(apps|gym)\//.test(u.pathname)) return;
  e.preventDefault();
  openAppFrame(a.href,titleForAppUrl(u));
});

/* =====================================================================
   QUICK ADD
===================================================================== */
function openQuickAdd(){$('qa-date').value=today();$('quick-add-modal').hidden=false;setTimeout(()=>$('qa-title').focus(),0)}
function closeQuickAdd(){$('quick-add-modal').hidden=true;$('quick-add-form').reset()}
document.querySelectorAll('[data-open-quick-add]').forEach(x=>x.addEventListener('click',openQuickAdd));$('quick-add-close').addEventListener('click',closeQuickAdd);$('quick-add-cancel').addEventListener('click',closeQuickAdd);$('quick-add-modal').addEventListener('click',e=>{if(e.target===$('quick-add-modal'))closeQuickAdd()});
$('quick-add-form').addEventListener('submit',async e=>{e.preventDefault();const shared=$('qa-shared').value==='shared',task={id:'task-'+Date.now()+'-'+Math.floor(Math.random()*1000),title:$('qa-title').value.trim(),done:false,priority:Number($('qa-priority').value)||0,startDate:today(),due:$('qa-date').value||null,dueTime:$('qa-time').value||null,repeat:'none',notes:'',link:'',tags:[],subtasks:[],listId:shared?'shared':'personal',createdBy:state.profile,order:Date.now(),createdAt:new Date().toISOString()};if(!task.title)return;const list=shared?state.sharedTasks:state.personalTasks,ref=shared?sharedTodoRef():profileRef('todo-profiles','tasks');list.push(task);$('qa-save').disabled=true;try{await mergeBeforeWrite(ref,list,[task.id]);await ref.set({json:JSON.stringify(list),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});closeQuickAdd();renderDashboard();toast('Task added')}catch(err){list.pop();toast('Could not save. Try again.')}finally{$('qa-save').disabled=false}});

function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2200)}
function chooseProfile(){setGate('profile')}
document.querySelectorAll('[data-profile-choice]').forEach(btn=>btn.addEventListener('click',()=>{setProfile(btn.dataset.profileChoice);loadDashboard()}));
$('profile-switch').addEventListener('click',chooseProfile);$('mobile-profile').addEventListener('click',chooseProfile);$('signout').addEventListener('click',()=>{localStorage.removeItem(PROFILE_KEY);if(clockTimer)clearInterval(clockTimer);auth.signOut()});
$('auth-form').addEventListener('submit',async e=>{e.preventDefault();$('auth-error').textContent='';$('auth-submit').disabled=true;try{await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);await auth.signInWithEmailAndPassword($('auth-email').value.trim(),$('auth-password').value)}catch(err){$('auth-error').textContent=(err.message||'Sign in failed').replace('Firebase: ','')}finally{$('auth-submit').disabled=false}});

auth.onAuthStateChanged(user=>{state.user=user;if(!user){setGate('auth');return}const saved=localStorage.getItem(PROFILE_KEY);if(saved==='Bhargav'||saved==='Anusha'){setProfile(saved);loadDashboard()}else setGate('profile')});
lucide.createIcons();
if('serviceWorker'in navigator){
  const hadController=!!navigator.serviceWorker.controller;
  let reloaded=false;
  // A new deploy activates a new worker: pick it up right away (once), unless you are typing something.
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(!hadController||reloaded)return;
    const a=document.activeElement;
    if(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))return;
    reloaded=true;location.reload();
  });
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').then(r=>{r.update&&r.update();document.addEventListener('visibilitychange',()=>{if(!document.hidden&&r.update)r.update()})}).catch(()=>{}));
}

/* =====================================================================
   HUB ALARMS — reads the same alarm list Clock manages, but checks the
   time and rings from here, the persistent outer shell, instead of from
   inside Clock's own iframe. That way an alarm still fires while you're
   looking at Diet, Grocery, or anything else — the Clock app only has to
   be open at the moment you *set* an alarm, not at the moment it rings —
   and the ringing screen can cover the whole viewport instead of being
   boxed inside whatever iframe happened to be open.
===================================================================== */
let hubAudioCtx=null;
function hubEnsureAudio(){
  if(!hubAudioCtx) hubAudioCtx=new (window.AudioContext||window.webkitAudioContext)();
  if(hubAudioCtx.state==='suspended') hubAudioCtx.resume();
  return hubAudioCtx;
}
document.addEventListener('click',()=>{ try{ hubEnsureAudio(); }catch(e){} });
document.addEventListener('touchstart',()=>{ try{ hubEnsureAudio(); }catch(e){} });
function hubToneChime(){ const ctx=hubEnsureAudio(); [880,1108].forEach((freq,i)=>{const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.value=freq;osc.connect(gain);gain.connect(ctx.destination);const start=ctx.currentTime+i*0.22;gain.gain.setValueAtTime(0.0001,start);gain.gain.exponentialRampToValueAtTime(0.28,start+0.02);gain.gain.exponentialRampToValueAtTime(0.0001,start+0.5);osc.start(start);osc.stop(start+0.55);});}
function hubToneBells(){ const ctx=hubEnsureAudio(); [1320,990,660].forEach((freq,i)=>{const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='triangle';osc.frequency.value=freq;osc.connect(gain);gain.connect(ctx.destination);const start=ctx.currentTime+i*0.16;gain.gain.setValueAtTime(0.0001,start);gain.gain.exponentialRampToValueAtTime(0.22,start+0.015);gain.gain.exponentialRampToValueAtTime(0.0001,start+0.7);osc.start(start);osc.stop(start+0.75);});}
function hubToneBeep(){ const ctx=hubEnsureAudio(); [0,0.18,0.36].forEach(offset=>{const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='square';osc.frequency.value=1500;osc.connect(gain);gain.connect(ctx.destination);const start=ctx.currentTime+offset;gain.gain.setValueAtTime(0.0001,start);gain.gain.exponentialRampToValueAtTime(0.16,start+0.01);gain.gain.exponentialRampToValueAtTime(0.0001,start+0.13);osc.start(start);osc.stop(start+0.15);});}
function hubToneRising(){ const ctx=hubEnsureAudio(); const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sawtooth';osc.connect(gain);gain.connect(ctx.destination);const start=ctx.currentTime;osc.frequency.setValueAtTime(420,start);osc.frequency.exponentialRampToValueAtTime(920,start+0.8);gain.gain.setValueAtTime(0.0001,start);gain.gain.exponentialRampToValueAtTime(0.22,start+0.05);gain.gain.exponentialRampToValueAtTime(0.0001,start+0.85);osc.start(start);osc.stop(start+0.9);}
const HUB_ALARM_SOUNDS={chime:hubToneChime,bells:hubToneBells,beep:hubToneBeep,rising:hubToneRising};
function hubPlayAlarmSound(soundId){ try{ (HUB_ALARM_SOUNDS[soundId]||hubToneChime)(); }catch(e){} }
let hubRingInterval=null;
function hubStartRinging(soundId){
  hubStopRinging();
  hubPlayAlarmSound(soundId);
  hubRingInterval=setInterval(()=>hubPlayAlarmSound(soundId),1400);
}
function hubStopRinging(){ clearInterval(hubRingInterval); hubRingInterval=null; }

let hubAlarms=[];
let hubAlarmsUnsub=null;
// Which alarms have already rung, keyed by alarm+day+time. Kept in
// localStorage (not just memory) so refreshing the page mid-minute — e.g.
// right after dismissing one — doesn't make the same alarm ring again;
// only a genuinely new minute/day match will fire it.
const HUB_FIRED_KEY='hub-alarms-fired';
function loadHubFiredToday(){
  try{ return JSON.parse(localStorage.getItem(HUB_FIRED_KEY)||'{}'); }catch(e){ return {}; }
}
function saveHubFiredToday(){
  try{
    // Trim to today's entries only so this never grows without bound.
    const todayKey=new Date().toDateString();
    const trimmed={};
    Object.keys(hubFiredToday).forEach(k=>{ if(k.indexOf(':'+todayKey+':')!==-1) trimmed[k]=true; });
    hubFiredToday=trimmed;
    localStorage.setItem(HUB_FIRED_KEY, JSON.stringify(hubFiredToday));
  }catch(e){}
}
let hubFiredToday=loadHubFiredToday();
function startHubAlarmWatch(){
  if(hubAlarmsUnsub){ try{ hubAlarmsUnsub(); }catch(e){} hubAlarmsUnsub=null; }
  hubAlarms=[];
  if(!state.user||!state.profile) return;
  try{
    hubAlarmsUnsub = profileRef('clock-profiles','alarms').onSnapshot(doc=>{
      hubAlarms = (doc.exists && doc.data().json) ? JSON.parse(doc.data().json) : [];
    }, ()=>{});
  }catch(e){}
}
function hubPad2(n){ return (n<10?'0':'')+n; }
let hubLastAlarmCheck=Date.now();
// A one-time alarm (no repeat days) switches itself off once it has rung, instead of ringing again every day.
async function hubTurnOffOneTimeAlarm(id){
  try{
    const ref=profileRef('clock-profiles','alarms');
    const snap=await ref.get();
    const list=(snap.exists&&snap.data().json)?JSON.parse(snap.data().json):hubAlarms;
    const a=list.find(x=>x.id===id); if(!a) return;
    a.on=false;
    await ref.set({json:JSON.stringify(list)});
    hubAlarms=list;
  }catch(e){}
}
function hubCheckAlarms(){
  const nowMs=Date.now();
  // Browsers slow timers right down in background tabs (sometimes to one tick a minute), so look at every minute
  // since the last check — up to the last 10 — rather than only the current one, or an alarm can slip by silently.
  const fromMs=Math.max(hubLastAlarmCheck, nowMs-10*60000);
  if(!hubAlarms.length){ hubLastAlarmCheck=nowMs; return; }
  // Never stack a second full-screen ring on top of one already showing.
  if($('hub-alarm-overlay') && !$('hub-alarm-overlay').hidden) return;
  const startMin=Math.floor(fromMs/60000)*60000;
  for(let t=startMin;t<=nowMs;t+=60000){
    const when=new Date(t);
    const hhmm=hubPad2(when.getHours())+':'+hubPad2(when.getMinutes());
    const dow=when.getDay(), dayKey=when.toDateString();
    for(const a of hubAlarms){
      if(!a.on) continue;
      if(a.days && a.days.length && a.days.indexOf(dow)===-1) continue;
      if(a.time!==hhmm) continue;
      const fireKey=a.id+':'+dayKey+':'+hhmm;
      if(hubFiredToday[fireKey]) continue;
      hubFiredToday[fireKey]=true;
      saveHubFiredToday();
      hubFireAlarm(a);
      if(!(a.days&&a.days.length)) hubTurnOffOneTimeAlarm(a.id);
      hubLastAlarmCheck=t; // pick up from this minute next time, so another alarm in the window still rings once this one is dismissed
      return;
    }
  }
  hubLastAlarmCheck=nowMs;
}
function hubFireAlarm(a){
  hubStartRinging(a.sound||'chime');
  try{
    const parts=(a.time||'00:00').split(':'); const hh=parseInt(parts[0],10), mm=parseInt(parts[1],10);
    const ampm=hh>=12?'PM':'AM', h12=hh%12===0?12:hh%12;
    if($('hub-alarm-label')) $('hub-alarm-label').textContent = a.label || 'Alarm';
    if($('hub-alarm-time')) $('hub-alarm-time').textContent = h12+':'+hubPad2(mm)+' '+ampm;
    if($('hub-alarm-overlay')) $('hub-alarm-overlay').hidden=false;
  }catch(e){}
}
if($('hub-alarm-dismiss')) $('hub-alarm-dismiss').addEventListener('click',()=>{
  hubStopRinging();
  $('hub-alarm-overlay').hidden=true;
});
setInterval(hubCheckAlarms,1000);
// Dismissing in one tab should silence it everywhere — the "already
// rang" record lives in localStorage, which the browser broadcasts to
// every OTHER open tab of the same site as a 'storage' event (the tab
// that made the change never gets its own event, only siblings do). Any
// tab still ringing for that same alarm stops and hides the moment it
// hears about it.
window.addEventListener('storage',e=>{
  if(e.key!==HUB_FIRED_KEY) return;
  hubFiredToday=loadHubFiredToday();
  if($('hub-alarm-overlay') && !$('hub-alarm-overlay').hidden){
    hubStopRinging();
    $('hub-alarm-overlay').hidden=true;
  }
});

const FIREBASE_CONFIG={apiKey:"AIzaSyBe01eR2RZwSbU_aoJMeh_2MMJ5mqkVuKk",authDomain:"iron-log-bfc55.firebaseapp.com",projectId:"iron-log-bfc55",storageBucket:"iron-log-bfc55.firebasestorage.app",messagingSenderId:"106586808946",appId:"1:106586808946:web:f4736554ba9fc82c6fd8eb"};
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
  'calendar.html':'calendar-days','gym.html':'dumbbell'
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
function setProfile(name){state.profile=name;localStorage.setItem(PROFILE_KEY,name);document.body.dataset.profile=name;$('sidebar-profile').textContent=name;$('sidebar-avatar').textContent=name[0];$('sidebar-avatar').className='avatar '+name.toLowerCase();$('mobile-profile').textContent=name[0];$('mobile-profile').className='avatar '+name.toLowerCase();updateAppFrameProfile();updateProfileLinks();startHubAlarmWatch();applyTheme()}
// Keeps the profile capsule in the app viewer's own top bar in sync with
// the hub-wide active profile — it's shown there instead of repeated
// inside every embedded app (see openAppFrame / app-frame-profile below).
function updateAppFrameProfile(){
  if(!state.profile || !$('app-frame-profile-name')) return;
  $('app-frame-profile-name').textContent=state.profile;
  $('app-frame-profile-avatar').textContent=state.profile[0];
  $('app-frame-profile-avatar').className='avatar '+state.profile.toLowerCase();
}
function updateProfileLinks(){document.querySelectorAll('[data-profile-link]').forEach(link=>{const base=link.getAttribute('href').split('?')[0];link.href=base+'?profile='+encodeURIComponent(state.profile)})}

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
  { file: 'calendar.html', title: 'Calendar' }
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
  'grocery.html':'home', 'chores.html':'home'
};
const HIDDEN_APPS = new Set(['clock.html']); // reached only via its own widget/link, never a tile
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
  state.appIcons = profileIcons || legacyIcons || {};
  state.photos = Array.isArray(profilePhotos) ? profilePhotos : (Array.isArray(legacyPhotos) ? legacyPhotos : []);
  photoWidgetOrder=[]; // this profile's photos just (re)loaded — force a fresh shuffle/sequence order
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
  const [templates,events,personal,shared,chores,choreHistory,dailyLog,apps]=await Promise.all([
    readJson(profileRef('schedule-profiles','dayTemplates'),{}),readJson(profileRef('schedule-profiles','events'),[]),
    readJson(profileRef('todo-profiles','tasks'),[]),readJson(sharedTodoRef(),[]),
    readJson(appRef('chores','chores'),[]),readJson(appRef('chores','history'),[]),
    db.collection('users').doc(state.user.uid).collection('profiles').doc(profileLower).collection('dailyLogs').doc(date).get().then(s=>s.exists?s.data():null).catch(()=>null),
    discoverApps()
  ]);
  await loadHubMeta();
  // Gym lives in its own top-level gym/ folder, not inside apps/ like
  // every other tool — GitHub discovery only scans apps/, so it can
  // never find Gym on its own. It's added here as a fixed entry, the
  // same way the original hub always special-cased it.
  const appsWithGym = [{ file:'gym.html', path:'gym/index.html', title:'Gym', icon:'tile-icons/gym.png' }].concat(apps.map(a => ({...a, path:'apps/'+a.file})));
  Object.assign(state,{templates,events,personalTasks:personal,sharedTasks:shared,chores,choreHistory,dailyLog,apps:appsWithGym});
  renderDashboard();renderAllCategoryPages();startHubClock();initHubWeather();startTimelineAutoAdvance();wireWidgetModal();setGate(null);
  // A reload used to always drop you back at the Hub even if you had an
  // app open in the viewer, because nothing recorded "which app" anywhere
  // durable — the iframe's contents live only in memory. openAppFrame now
  // stamps the open app into the URL hash (#app=<url>), so a refresh (or
  // reopening a bookmarked/shared link) can restore it here instead of
  // just falling back to a bare route.
  if(!restoreAppFromHash()) showRoute(location.hash.replace('#','')||'today');
}

function todaysTimeline(){
  const date=today(),weekday=new Date(date+'T00:00:00').getDay(),dayName=DAYS[weekday];
  const blocks=(state.templates[dayName]||[]).map((x,i)=>({id:'block-'+i,title:x.activity||x.title||'Scheduled block',time:x.start||'',end:x.end||'',kind:'routine'}));
  const events=state.events.filter(e=>e.recurring?e.weekday===weekday&&(!e.startDate||e.startDate<=date):e.date===date).map(e=>({id:e.id,title:e.title,time:e.time||'',notes:e.notes||'',kind:'event'}));
  return blocks.concat(events).sort((a,b)=>minutes(a.time)-minutes(b.time));
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
  const weeksSince = Math.floor((d - ref) / (7*86400000));
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
    let cursor=chore.lastCompleted?addDays(chore.lastCompleted,1):date;
    for(let i=0;i<14;i++){ const candidate=addDays(cursor,i); if((chore.days||[]).includes(new Date(candidate+'T00:00:00').getDay())) return candidate; }
  }
  return date;
}
function choresDueToday(){
  const date=today(), weekday=DAYS[new Date().getDay()], blocks=state.templates[weekday]||[];
  return state.chores.filter(c => {
    if(c.active===false) return false;
    if(Array.isArray(c.assignedTo) && !c.assignedTo.includes(state.profile)) return false;
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
  const nowM=new Date().getHours()*60+new Date().getMinutes(),next=timeline.find(x=>minutes(x.time)>=nowM);
  $('stat-next').textContent=next?(next.time?time12(next.time):'Anytime'):'Clear';$('stat-tasks').textContent=tasks.length;$('stat-focus').textContent=plannedHours(timeline);
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
function renderTimelineInto(el,items){
  if(!el)return;
  if(!items.length){el.innerHTML='<div class="empty-state"><strong>No scheduled blocks</strong>Your day is open. Add plans from the schedule.</div>';return}
  const curIdx=currentTimelineIndex(items);
  const pastCount=curIdx>=0?curIdx:0;
  const toggleHtml=pastCount>0?('<div class="timeline-toggle-row" id="timeline-toggle-row"><span class="timeline-time"></span><span></span><span class="timeline-content"><button type="button" class="timeline-toggle-link" id="timeline-toggle-btn">'+(timelineShowPast?'Hide earlier':pastCount+' earlier today · Show')+'</button></span></div>'):'';
  el.innerHTML=toggleHtml+items.map((x,i)=>'<div class="timeline-row '+(x.kind==='event'?'':'muted')+(i===curIdx?' current':i<curIdx?' past':'')+'" data-tl-row="'+i+'"><span class="timeline-time">'+esc(time12(x.time))+'</span><span class="timeline-dot"></span><span class="timeline-content"><strong>'+esc(x.title)+'</strong><small>'+(x.end?esc(time12(x.time)+' – '+time12(x.end)):(x.notes?esc(x.notes):x.kind==='event'?'Event':'Routine'))+'</small></span></div>').join('');
  el.classList.toggle('show-past', timelineShowPast);
  const toggleBtn=$('timeline-toggle-btn');
  if(toggleBtn) toggleBtn.addEventListener('click', ()=>{ timelineShowPast=!timelineShowPast; renderTimelineInto(el,items); });
  // Keep "now" in view inside the timeline's own scroll area (not the
  // whole page) as the day's list grows — scrollIntoView with a nearest
  // ancestor scroll container does exactly that without jumping the page.
  if(curIdx>=0){
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
  if(!items.length){el.innerHTML='<div class="empty-state"><strong>You are caught up</strong>No open tasks are due today.</div>';return}
  el.innerHTML=items.map(t=>'<div class="task-row" data-task-id="'+esc(t.id)+'"><button class="task-check" type="button" aria-label="Complete '+esc(t.title)+'"><i data-lucide="check"></i></button><span class="task-copy"><strong>'+esc(t.title)+'</strong><small>'+(t._shared?'Shared':esc(t.listId||'Personal'))+(t.dueTime?' · '+esc(time12(t.dueTime)):'')+'</small></span>'+(t.priority?'<span class="priority-mark">'+(t.priority>1?'Urgent':'Important')+'</span>':'')+'</div>').join('');
  lucide.createIcons();el.querySelectorAll('.task-check').forEach(btn=>btn.addEventListener('click',()=>completeTask(btn.closest('.task-row').dataset.taskId)));
}
function renderChoresListInto(el,chores){
  if(!el)return;
  if(!chores.length){ el.innerHTML='<div class="empty-state"><strong>Nothing due</strong>No chores need attention today.</div>'; return; }
  el.innerHTML = chores.map(c => '<div class="chores-mini-row'+(c.overdue?' overdue':'')+'"><span>'+esc(c.name)+'</span><span>'+(c.overdue?'Overdue':'Due today')+'</span></div>').join('');
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
    {id:'w-chores',type:'chores',colSpan:12,rowSpan:13},
    {id:'w-quicklinks',type:'quicklinks',colSpan:12,rowSpan:6}
  ];
}
const WIDGET_TYPES={
  schedule:{title:"Today's schedule",icon:'calendar-clock',desc:"Your planned blocks for today, same list as the Planner.",defaultSize:'lg',
    render(el){renderTimelineInto(el,todaysTimeline())}},
  priorities:{title:'Priorities',icon:'list-checks',desc:'Tasks due today — check them off right from the board.',defaultSize:'lg',
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
  focus:{title:'Focus today',icon:'timer',desc:"Minutes logged in Clock's focus timer today.",defaultSize:'sm',
    async render(el){
      el.innerHTML='<div class="empty-state"><strong>Loading…</strong></div>';
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
      el.innerHTML='<div class="empty-state"><strong>Loading…</strong></div>';
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
      el.innerHTML='<div class="empty-state"><strong>Loading…</strong></div>';
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
  photos:{title:'Photo widget',icon:'image',desc:'Your own little rotating gallery — add a batch of photos, shuffle them, or let it play on its own.',defaultSize:'lg',
    render(el){renderPhotoWidgetInto(el)}}
};
/* ---- Photo widget: a small self-contained gallery, its own upload +
   shuffle + slideshow logic rather than a generic "widget data" blob,
   since photos are genuinely different from every other widget (a list of
   images the person keeps adding to, not a read-only view of another
   app's data). One shared photo library across however many times this
   widget shows up (today there's only ever one instance on the board, via
   the same single-instance-per-type system every other widget uses), kept
   at users/{uid}/apps/hub/data/photos. ---- */
const PHOTO_MAX_COUNT=24;
const PHOTO_MAX_BASE64_TOTAL=900000; // keeps the whole library under Firestore's ~1MiB document cap
let photoWidgetOrder=[]; // current browsing order — sequential, or shuffled
let photoWidgetPos=0;
let photoWidgetShuffle=false;
let photoWidgetPlaying=false;
let photoWidgetTimer=null;
function photoWidgetBuildOrder(){
  const idx=state.photos.map((_,i)=>i);
  if(photoWidgetShuffle){
    for(let i=idx.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[idx[i],idx[j]]=[idx[j],idx[i]];}
  }
  photoWidgetOrder=idx;
  photoWidgetPos=0;
}
async function savePhotoWidget(){try{await profileRef('hub-profiles','photos').set({json:JSON.stringify(state.photos)})}catch(e){}}
function renderPhotoWidgetInto(el){
  if(!el)return;
  if(photoWidgetTimer){clearInterval(photoWidgetTimer);photoWidgetTimer=null}
  if(!state.photos.length){
    el.innerHTML='<div class="photo-widget"><div class="empty-state"><strong>No photos yet</strong>Add a few to start a little slideshow right here.</div>'+
      '<button type="button" class="button secondary photo-widget-add-empty" data-photo-add><i data-lucide="plus"></i><span>Add photos</span></button>'+
      '<input type="file" accept="image/*" multiple hidden data-photo-file></div>';
    if(window.lucide)lucide.createIcons();
    el.querySelector('[data-photo-add]').addEventListener('click',()=>el.querySelector('[data-photo-file]').click());
    el.querySelector('[data-photo-file]').addEventListener('change',e=>{handlePhotoWidgetUpload(e.target.files,el);e.target.value=''});
    return;
  }
  if(photoWidgetOrder.length!==state.photos.length)photoWidgetBuildOrder();
  photoWidgetPos=((photoWidgetPos%photoWidgetOrder.length)+photoWidgetOrder.length)%photoWidgetOrder.length;
  const currentIdx=photoWidgetOrder[photoWidgetPos];
  const photo=state.photos[currentIdx];
  el.innerHTML='<div class="photo-widget">'+
    '<div class="photo-widget-frame"><img src="'+photo.src+'" alt=""></div>'+
    '<div class="photo-widget-controls">'+
      '<button type="button" class="icon-button" data-photo-prev title="Previous photo"'+(state.photos.length<2?' disabled':'')+'><i data-lucide="chevron-left"></i></button>'+
      '<button type="button" class="icon-button" data-photo-play title="'+(photoWidgetPlaying?'Pause slideshow':'Play slideshow')+'"'+(state.photos.length<2?' disabled':'')+'><i data-lucide="'+(photoWidgetPlaying?'pause':'play')+'"></i></button>'+
      '<button type="button" class="icon-button" data-photo-next title="Next photo"'+(state.photos.length<2?' disabled':'')+'><i data-lucide="chevron-right"></i></button>'+
      '<button type="button" class="icon-button'+(photoWidgetShuffle?' active':'')+'" data-photo-shuffle title="Shuffle"'+(state.photos.length<2?' disabled':'')+'><i data-lucide="shuffle"></i></button>'+
      '<span class="photo-widget-count">'+(photoWidgetPos+1)+' / '+state.photos.length+'</span>'+
      '<button type="button" class="icon-button" data-photo-add title="Add photos"><i data-lucide="plus"></i></button>'+
      '<button type="button" class="icon-button" data-photo-remove title="Remove this photo"><i data-lucide="trash-2"></i></button>'+
    '</div>'+
    '<input type="file" accept="image/*" multiple hidden data-photo-file>'+
  '</div>';
  if(window.lucide)lucide.createIcons();
  const advance=dir=>{ photoWidgetPos+=dir; renderPhotoWidgetInto(el); };
  el.querySelector('[data-photo-prev]').addEventListener('click',()=>advance(-1));
  el.querySelector('[data-photo-next]').addEventListener('click',()=>advance(1));
  el.querySelector('[data-photo-shuffle]').addEventListener('click',()=>{ photoWidgetShuffle=!photoWidgetShuffle; photoWidgetBuildOrder(); renderPhotoWidgetInto(el); });
  el.querySelector('[data-photo-play]').addEventListener('click',()=>{ photoWidgetPlaying=!photoWidgetPlaying; renderPhotoWidgetInto(el); });
  el.querySelector('[data-photo-add]').addEventListener('click',()=>el.querySelector('[data-photo-file]').click());
  el.querySelector('[data-photo-file]').addEventListener('change',e=>{handlePhotoWidgetUpload(e.target.files,el);e.target.value=''});
  el.querySelector('[data-photo-remove]').addEventListener('click',()=>{
    state.photos.splice(currentIdx,1);
    photoWidgetOrder=[];
    savePhotoWidget();
    renderPhotoWidgetInto(el);
  });
  if(photoWidgetPlaying&&state.photos.length>1){
    photoWidgetTimer=setInterval(()=>advance(1),4500);
  }
}
async function handlePhotoWidgetUpload(fileList,el){
  const files=Array.from(fileList||[]).filter(f=>/^image\//.test(f.type));
  if(!files.length)return;
  if(state.photos.length>=PHOTO_MAX_COUNT){toast('Your photo widget is full — remove a few first');return}
  let added=0,skippedForSize=false;
  for(const file of files){
    if(state.photos.length>=PHOTO_MAX_COUNT)break;
    try{
      const img=await fileToImage(file);
      const dataUrl=compressImageToDataUrl(img,900,160000);
      if(!dataUrl)continue;
      const totalLen=state.photos.reduce((s,p)=>s+p.src.length,0)+dataUrl.length;
      if(totalLen>PHOTO_MAX_BASE64_TOTAL){skippedForSize=true;break}
      state.photos.push({id:'ph-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),src:dataUrl});
      added++;
    }catch(e){console.warn(e)}
  }
  if(added){ photoWidgetOrder=[]; await savePhotoWidget(); }
  if(skippedForSize)toast(added?added+' photo'+(added===1?'':'s')+' added — your library is getting full, so the rest were skipped':'Your photo library is full — remove a few or try smaller photos');
  renderPhotoWidgetInto(el);
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
function renderWidgetBoard(){
  const board=$('widget-board');if(!board||!state.widgets)return;
  if(!state.widgets.length){board.innerHTML='<div class="widget-board-empty">No widgets yet — use <strong>+ Add widget</strong> above to put something here.</div>';return}
  board.innerHTML=state.widgets.map(w=>{
    const def=WIDGET_TYPES[w.type];if(!def)return'';
    const [cs,rs]=widgetSpanFor(w,def);
    return '<div class="widget-card" data-widget-id="'+esc(w.id)+'" data-widget-type="'+esc(w.type)+'" style="--cs:'+cs+';--rs:'+rs+'">'+
      '<button type="button" class="widget-remove-badge" data-widget-remove title="Remove widget" tabindex="-1"><i data-lucide="minus"></i></button>'+
      '<div class="widget-card-head">'+
        '<div class="widget-card-title"><span class="widget-drag-handle" data-widget-drag title="Drag to move"><i data-lucide="grip-vertical"></i></span><strong>'+esc(def.title)+'</strong></div>'+
      '</div>'+
      '<div class="widget-card-body"></div>'+
      '<span class="widget-resize-handle" data-widget-resize title="Drag to resize" tabindex="-1"><i data-lucide="move-diagonal-2"></i></span>'+
    '</div>';
  }).join('');
  if(window.lucide)lucide.createIcons();
  board.querySelectorAll('.widget-card').forEach(card=>{
    const type=card.dataset.widgetType,def=WIDGET_TYPES[type];
    if(def)def.render(card.querySelector('.widget-card-body'));
    wireWidgetCard(card);
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
    state.widgets=state.widgets.filter(w=>w.id!==card.dataset.widgetId);
    saveWidgetLayout();renderWidgetBoard();
  });
}
function renderWidgetCatalog(){
  const addedTypes=new Set(state.widgets.map(w=>w.type));
  $('widget-catalog').innerHTML=Object.keys(WIDGET_TYPES).map(type=>{
    const def=WIDGET_TYPES[type],added=addedTypes.has(type);
    return '<button type="button" class="widget-catalog-item'+(added?' added':'')+'" data-widget-type-add="'+type+'">'+
      '<span class="widget-catalog-icon"><i data-lucide="'+def.icon+'"></i></span>'+
      '<span class="widget-catalog-copy"><strong>'+esc(def.title)+'</strong><span>'+(added?'Already on your board':esc(def.desc))+'</span></span>'+
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
    state.widgets.push({id:'w-'+type+'-'+Date.now(),type,size:def.defaultSize});
    saveWidgetLayout();renderWidgetBoard();$('widget-add-modal').hidden=true;toast(def.title+' added to your Today page');
  });
}
async function completeTask(id){
  let list=state.personalTasks,task=list.find(t=>t.id===id),ref=profileRef('todo-profiles','tasks');
  if(!task){list=state.sharedTasks;task=list.find(t=>t.id===id);ref=sharedTodoRef()}if(!task)return;
  const originalLength=list.length;
  task.done=true;task.completedOn=today();
  if(task.repeat&&task.repeat!=='none'&&task.due){
    let nextDue=null;
    if(task.repeat==='daily')nextDue=addDays(task.due,1);
    if(task.repeat==='weekly')nextDue=addDays(task.due,7);
    if(task.repeat==='weekdays'){nextDue=addDays(task.due,1);while([0,6].includes(new Date(nextDue+'T00:00:00').getDay()))nextDue=addDays(nextDue,1)}
    if(task.repeat==='monthly'){const d=new Date(task.due+'T00:00:00');d.setMonth(d.getMonth()+1);nextDue=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
    if(nextDue)list.push({...task,id:'task-'+Date.now()+'-'+Math.floor(Math.random()*1000),done:false,due:nextDue,completedOn:null,subtasks:(task.subtasks||[]).map(s=>({...s,done:false})),order:Date.now(),createdAt:new Date().toISOString()});
  }
  renderDashboard();toast('Task completed');
  try{await ref.set({json:JSON.stringify(list),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true})}catch(e){list.splice(originalLength);task.done=false;task.completedOn=null;renderDashboard();toast('Could not save. Try again.')}
}

/* =====================================================================
   INSIGHTS — "momentum" tab. Pulls a thin, read-only slice from every
   app's own Firestore data (tasks/chores already in state; gym and skin
   fetched here specifically) and turns it into one motivational picture:
   a weekly recap, streaks, Skin's phase milestones, a handful of earned
   badges, and a rotating "surprise" highlight. Nothing here is written
   back anywhere — it only reads.

   Skin's milestone *dates* are recomputed here from the same small
   offset-shift rule skin.html itself uses (SKIN_TEMPLATE_START + however
   many days the person has moved programStart by), rather than importing
   skin.html's logic wholesale — see skin.html's own rebuildProgramCalendar
   for the source of truth if that ever changes.
===================================================================== */
const SKIN_TEMPLATE_START='2026-10-01';
const SKIN_REVIEW_DATES_TEMPLATE=['2026-10-31','2026-11-30','2026-12-31','2027-01-31','2027-02-28'];
let insightsLoadedForProfile=null;

async function ensureInsightsLoaded(){
  if(insightsLoadedForProfile===state.profile && state.insights) return;
  const [gymSnap,stepRes,trackRes,milestoneRes,startRes]=await Promise.all([
    gymDailyLogsCol(state.profile).get().catch(()=>null),
    skinDataRef(state.profile,'stepLog').get().catch(()=>null),
    skinDataRef(state.profile,'trackingLog').get().catch(()=>null),
    skinDataRef(state.profile,'milestoneLog').get().catch(()=>null),
    skinDataRef(state.profile,'programStart').get().catch(()=>null)
  ]);
  const gymDates=new Set();
  if(gymSnap) gymSnap.forEach(d=>{const v=d.data(); if(v&&v.date) gymDates.add(v.date);});
  const stepLog=safeJson(stepRes&&stepRes.exists?stepRes.data().json:null,{});
  const trackingLog=safeJson(trackRes&&trackRes.exists?trackRes.data().json:null,{});
  const milestoneLog=safeJson(milestoneRes&&milestoneRes.exists?milestoneRes.data().json:null,{});
  const programStartDate=(startRes&&startRes.exists&&startRes.data().startDate)?startRes.data().startDate:SKIN_TEMPLATE_START;
  const skinTouchedDates=new Set();
  Object.keys(stepLog).forEach(k=>{ if(stepLog[k]){ const d=k.split(':')[0]; if(d) skinTouchedDates.add(d); } });
  const skinCheckedDates=new Set();
  Object.keys(trackingLog).forEach(d=>{ if(trackingLog[d]&&trackingLog[d].savedAt) skinCheckedDates.add(d); });
  state.insights={gymDates,skinTouchedDates,skinCheckedDates,milestoneLog,programStartDate};
  insightsLoadedForProfile=state.profile;
}

function insightsMilestoneDates(){
  const offset=daysBetween(SKIN_TEMPLATE_START, state.insights.programStartDate||SKIN_TEMPLATE_START);
  return SKIN_REVIEW_DATES_TEMPLATE.map(d=>addDays(d,offset));
}
function milestoneHitOn(dateStr){
  const prefix=dateStr+':';
  return Object.keys(state.insights.milestoneLog).some(k=>k.indexOf(prefix)===0 && state.insights.milestoneLog[k]);
}

function computeInsights(){
  const d=today();
  const tasksAll=state.personalTasks.concat(state.sharedTasks);
  const tasksByDate={}; tasksAll.forEach(t=>{ if(t.done&&t.completedOn){ tasksByDate[t.completedOn]=(tasksByDate[t.completedOn]||0)+1; } });
  const choresMineByDate={}, choresAllByDate={}, choresTogetherByDate={};
  (state.choreHistory||[]).forEach(h=>{
    choresAllByDate[h.date]=(choresAllByDate[h.date]||0)+1;
    if((h.by||'').indexOf(state.profile)!==-1) choresMineByDate[h.date]=(choresMineByDate[h.date]||0)+1;
    if((h.by||'').indexOf('&')!==-1) choresTogetherByDate[h.date]=(choresTogetherByDate[h.date]||0)+1;
  });
  const ins=state.insights;
  function dayTotal(dateStr){
    const tasks=tasksByDate[dateStr]||0, chores=choresMineByDate[dateStr]||0;
    const gym=ins.gymDates.has(dateStr)?1:0, skin=(ins.skinTouchedDates.has(dateStr)||ins.skinCheckedDates.has(dateStr))?1:0;
    return {tasks,chores,gym,skin,total:tasks+chores+gym+skin};
  }
  // 60-day scan window for streaks / best-week comparisons.
  const window=[]; for(let i=59;i>=0;i--) window.push(addDays(d,-i));
  const totals=window.map(dayTotal);
  const todayIdx=totals.length-1;
  let streakThroughYesterday=0;
  for(let i=todayIdx-1;i>=0;i--){ if(totals[i].total>0) streakThroughYesterday++; else break; }
  const todayActive=totals[todayIdx].total>0;
  const currentStreak=todayActive?streakThroughYesterday+1:streakThroughYesterday;
  let longestStreak=0,run=0;
  totals.forEach(t=>{ if(t.total>0){ run++; longestStreak=Math.max(longestStreak,run); } else run=0; });
  const last7=totals.slice(-7), prev7=totals.slice(-14,-7);
  const thisWeekTotal=last7.reduce((s,t)=>s+t.total,0), prevWeekTotal=prev7.reduce((s,t)=>s+t.total,0);
  let bestWeekTotal=0;
  for(let i=0;i<=totals.length-14;i++){ const sum=totals.slice(i,i+7).reduce((s,t)=>s+t.total,0); bestWeekTotal=Math.max(bestWeekTotal,sum); }
  const thisWeekTasks=last7.reduce((s,t)=>s+t.tasks,0), thisWeekChores=last7.reduce((s,t)=>s+t.chores,0);
  const thisWeekGymDays=last7.reduce((s,t)=>s+t.gym,0), thisWeekSkinDays=last7.reduce((s,t)=>s+t.skin,0);
  const thisWeekTogether=window.slice(-7).reduce((s,dt)=>s+(choresTogetherByDate[dt]||0),0);
  const tasksAllTime=tasksAll.filter(t=>t.done).length;
  // Per-system "best week in the last 60 days" — used to turn each
  // system into an honest 0-100% ring (this week vs your own best week
  // for that same system), rather than an invented external target.
  const bestWeekFor=key=>{let best=0;for(let i=0;i<=totals.length-7;i++){const sum=totals.slice(i,i+7).reduce((s,t)=>s+t[key],0);best=Math.max(best,sum);}return best};
  const bestWeekTasks=Math.max(bestWeekFor('tasks'),thisWeekTasks,1);
  const bestWeekChores=Math.max(bestWeekFor('chores'),thisWeekChores,1);
  // Consistency score — the % of the last 7 days with *something* logged
  // across any system. This is the page's headline "score", and it's a
  // real, legible number rather than a composite index nobody could
  // reconstruct.
  const activeDaysThisWeek=last7.filter(t=>t.total>0).length;
  const activeDaysPrevWeek=prev7.filter(t=>t.total>0).length;
  const consistencyScore=Math.round(activeDaysThisWeek/7*100);
  const consistencyDelta=Math.round((activeDaysThisWeek-activeDaysPrevWeek)/7*100);
  return {
    d, tasksByDate, choresMineByDate, choresTogetherByDate,
    last7Dates:window.slice(-7), last28Dates:window.slice(-28), last60Dates:window, totals, todayActive, currentStreak, longestStreak,
    thisWeekTotal, prevWeekTotal, bestWeekTotal,
    thisWeekTasks, thisWeekChores, thisWeekGymDays, thisWeekSkinDays, thisWeekTogether,
    bestWeekTasks, bestWeekChores, activeDaysThisWeek, consistencyScore, consistencyDelta,
    tasksAllTime, gymDaysAllTime:ins.gymDates.size, skinNightsAllTime:ins.skinCheckedDates.size
  };
}

function insightsBadges(m){
  const badges=[
    {id:'streak3',icon:'🔥',label:'Streak Starter',need:3,have:m.currentStreak,copy:h=>h>=3?'3+ days running':'Reach a 3-day streak'},
    {id:'streak7',icon:'⚡',label:'Full Week',need:7,have:m.currentStreak,copy:h=>h>=7?'A full week straight':'Reach a 7-day streak'},
    {id:'streak14',icon:'🏔️',label:'Two Weeks Strong',need:14,have:m.currentStreak,copy:h=>h>=14?'14 days and counting':'Reach a 14-day streak'},
    {id:'record',icon:'🏆',label:'New Best Week',need:1,have:(m.thisWeekTotal>m.bestWeekTotal&&m.bestWeekTotal>=3)?1:0,copy:h=>h?'This week beat every week before it':'Beat your best week yet'},
    {id:'teamwork',icon:'🤝',label:'Team Effort',need:3,have:m.thisWeekTogether,copy:h=>h>=3?'Tackled it together this week':'Do 3 chores together in a week'},
    {id:'century',icon:'💯',label:'Century',need:100,have:m.tasksAllTime,copy:h=>h>=100?'100 tasks completed all-time':m.tasksAllTime+'/100 tasks completed'}
  ];
  return badges.map(b=>({...b,unlocked:b.have>=b.need,sub:b.copy(b.have)}));
}

// Deterministic-by-day so it doesn't reshuffle on every render, but still
// feels different day to day.
const MOMENTUM_QUOTES=[
  'Motivation gets you started. A streak is what keeps you going when motivation doesn’t show up.',
  'You don’t need a perfect week. You need today.',
  'Consistency beats intensity — the small thing done daily always wins.',
  'Nobody sees the days you almost didn’t. Those are the ones that count most.',
  'Progress isn’t a straight line. Showing back up after a gap is still progress.'
];
function dayOfYear(dateStr){ const dt=new Date(dateStr+'T00:00:00'); const start=new Date(dt.getFullYear(),0,0); return Math.floor((dt-start)/86400000); }

function pickSurprise(m){
  if(m.thisWeekTotal>m.bestWeekTotal && m.bestWeekTotal>=3){
    return {icon:'🏆',title:'New personal best',body:'This is your best week yet — '+m.thisWeekTotal+' things done, past your previous best week of '+m.bestWeekTotal+'.'};
  }
  if([3,7,14,21,30,60].includes(m.currentStreak)){
    return {icon:'🔥',title:m.currentStreak+'-day streak',body:'You’ve shown up '+m.currentStreak+' days in a row across tasks, chores, training and skin care. That’s not luck — that’s a habit now.'};
  }
  if(m.thisWeekTogether>=2){
    return {icon:'🤝',title:'Team effort',body:'You and your partner knocked out '+m.thisWeekTogether+' chores together this week. The shared list is lighter because of both of you.'};
  }
  if(m.longestStreak>=5 && m.currentStreak===0){
    return {icon:'💪',title:'You’ve done this before',body:'Your longest run in the last two months was '+m.longestStreak+' days. Whatever streak you build next, you’ve already proven you can do it again.'};
  }
  const facts=[
    {icon:'✅',title:'Lifetime tally',body:'You’ve completed '+m.tasksAllTime+' tasks and shown up for training or care on '+(m.gymDaysAllTime+m.skinNightsAllTime)+' logged days. That adds up to more than it feels like day to day.'},
    {icon:'✨',title:'A thought for today',body:MOMENTUM_QUOTES[dayOfYear(m.d)%MOMENTUM_QUOTES.length]}
  ];
  return facts[dayOfYear(m.d)%facts.length];
}

function heroMessage(m){
  if(m.thisWeekTotal===0 && m.prevWeekTotal===0){
    return {kicker:'No pressure',headline:'A quiet stretch — that’s alright',
      sub:'Nothing logged the last two weeks. That doesn’t erase what came before it. Pick one thing today — one task, one chore, one workout — and let that be enough.'};
  }
  if(m.thisWeekTotal>=m.bestWeekTotal && m.bestWeekTotal>0){
    return {kicker:'This week',headline:'Your best week yet',
      sub:m.thisWeekTotal+' things done across tasks, chores, training and care — more than any 7-day stretch in the last two months.'};
  }
  if(m.thisWeekTotal<m.prevWeekTotal*0.6 && m.prevWeekTotal>=3){
    return {kicker:'This week',headline:'A quieter week — still counts',
      sub:'You did '+m.thisWeekTotal+' things this week versus '+m.prevWeekTotal+' last week. Slower weeks happen. What matters is you’re still here, checking this tab.'};
  }
  if(m.currentStreak===0 && m.thisWeekTotal>0){
    return {kicker:'This week',headline:'Back at it',
      sub:'The streak reset, but you’ve already logged '+m.thisWeekTotal+' things this week. A new streak starts the moment you stop waiting for the old one back.'};
  }
  if(m.thisWeekTotal>m.prevWeekTotal && m.prevWeekTotal>0){
    return {kicker:'This week',headline:'Building real momentum',
      sub:'Up from '+m.prevWeekTotal+' last week to '+m.thisWeekTotal+' this week, on a '+m.currentStreak+'-day streak. Keep stacking days.'};
  }
  return {kicker:'This week',headline:'Steady and showing up',
    sub:m.thisWeekTotal+' things done this week, on a '+m.currentStreak+'-day streak. Consistency like this is what actually moves the needle.'};
}

/* ===== Insights — "mission control" render suite =====
   insightsRange controls the hero score/chart/foot window (7/28/60 days,
   all sliced from the same 60-day computeInsights() scan — no re-fetch).
   The activity grid and constellation always show the full 60-day/badge
   picture regardless of range, since they're meant as the "whole story"
   sections, not the headline metric. */
let insightsRange='week';
let insightsCurrentM=null;
let insightsConstellationRAF=null;
let insightsRevealedOnce=false;
let insightsPrevUnlocked=null;
const INSIGHTS_RANGE_DAYS={week:7,month:28,all:60};

function insightsRangeTotals(m){ return m.totals.slice(-INSIGHTS_RANGE_DAYS[insightsRange]); }
function insightsDateLabel(dt){ return new Date(dt+'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'}); }

function insightsScoreFor(m){
  const totals=insightsRangeTotals(m);
  const active=totals.filter(t=>t.total>0).length;
  return Math.round(active/totals.length*100);
}
function insightsScoreMessage(m){
  const totals=insightsRangeTotals(m);
  const days=totals.length, active=totals.filter(t=>t.total>0).length;
  return active+' of '+days+' day'+(days===1?'':'s')+' had something logged — tasks, chores, training or care.';
}
function insightsDeltaFor(m){
  const days=INSIGHTS_RANGE_DAYS[insightsRange];
  if(days*2>m.totals.length) return null;
  const cur=m.totals.slice(-days).filter(t=>t.total>0).length;
  const prev=m.totals.slice(-days*2,-days).filter(t=>t.total>0).length;
  return Math.round((cur-prev)/days*100);
}
function insightsActiveDaysThisWeek(m,key){
  return m.totals.slice(-7).filter(t=>t[key]>0).length;
}

function renderInsightsChart(m){
  const totals=insightsRangeTotals(m);
  const n=totals.length, w=760, h=190, padTop=10, padBottom=10;
  const max=Math.max(1,...totals.map(t=>t.total));
  const pts=totals.map((t,i)=>{
    const x=n===1?w/2:(i/(n-1))*w;
    const y=h-padBottom-(t.total/max)*(h-padTop-padBottom);
    return [Math.round(x*10)/10, Math.round(y*10)/10];
  });
  const line=pts.map((p,i)=>(i===0?'M':'L')+p[0]+','+p[1]).join(' ');
  const area=line+' L'+pts[pts.length-1][0]+','+h+' L'+pts[0][0]+','+h+' Z';
  const lineEl=$('insights-chart-line'), areaEl=$('insights-chart-area');
  lineEl.setAttribute('d',line); lineEl.setAttribute('pathLength','1');
  areaEl.setAttribute('d',area);
  lineEl.classList.remove('draw'); areaEl.classList.remove('draw');
  void lineEl.getBoundingClientRect();
  lineEl.classList.add('draw'); areaEl.classList.add('draw');
  const gridRows=4;
  let gridHtml='';
  for(let i=0;i<=gridRows;i++){ const y=Math.round((h/gridRows)*i); gridHtml+='<line x1="0" y1="'+y+'" x2="'+w+'" y2="'+y+'"/>'; }
  $('insights-chart-grid').innerHTML=gridHtml;
  const dates=m.last60Dates.slice(-n);
  $('insights-chart-start').textContent=insightsDateLabel(dates[0]);
  $('insights-chart-end').textContent='Today';
}
/* Odometer — a tumbling digit strip (streak counter, consistency score)
   instead of text just changing instantly. Each digit is its own
   overflow:hidden column holding '0'-'9' stacked; showing digit N is a
   translateY(-N*10%), and CSS transitions that move, so digits visibly
   roll into place with real weight rather than popping. */
function odometerHTML(value,minDigits){
  const str=String(Math.max(0,Math.round(value))).padStart(minDigits||1,'0');
  return '<span class="ico">'+str.split('').map(()=>'<span class="ico-digit"><span class="ico-strip">'+'0123456789'.split('').map(d=>'<span>'+d+'</span>').join('')+'</span></span>').join('')+'</span>';
}
function playOdometer(containerEl,value,minDigits){
  if(!containerEl)return;
  const str=String(Math.max(0,Math.round(value))).padStart(minDigits||1,'0');
  let digits=containerEl.querySelectorAll('.ico-digit');
  if(digits.length!==str.length){
    containerEl.innerHTML=odometerHTML(value,minDigits);
    digits=containerEl.querySelectorAll('.ico-digit');
  }
  requestAnimationFrame(()=>{
    digits.forEach((el,i)=>{
      const strip=el.querySelector('.ico-strip');
      if(strip)strip.style.transform='translateY(-'+(Number(str[i])*10)+'%)';
    });
  });
}
function renderInsightsHeroFoot(m){
  const totals=insightsRangeTotals(m);
  const sum=k=>totals.reduce((s,t)=>s+t[k],0);
  const tiles=[
    {label:'Tasks',value:sum('tasks')},
    {label:'Chores',value:sum('chores')},
    {label:'Training days',value:sum('gym')},
    {label:'Care nights',value:sum('skin')}
  ];
  $('insights-hero-foot').innerHTML=tiles.map(t=>'<div><b>'+t.value+'</b><span>'+esc(t.label)+'</span></div>').join('');
}
function renderInsightsHero(m){
  const score=insightsScoreFor(m);
  const scoreEl=$('insights-score');
  // Fixed at 3 digits (000-100) so the digit count never changes and the
  // '%' suffix never has to be torn down and rebuilt mid-transition.
  if(!scoreEl.querySelector('.ico')) scoreEl.innerHTML=odometerHTML(score,3)+'<span class="ico-suffix">%</span>';
  playOdometer(scoreEl,score,3);
  scoreEl.classList.remove('flash'); void scoreEl.offsetWidth; scoreEl.classList.add('flash');
  $('insights-score-message').textContent=insightsScoreMessage(m);
  const delta=insightsDeltaFor(m);
  const deltaEl=$('insights-delta');
  if(delta===null){ deltaEl.style.display='none'; }
  else{
    deltaEl.style.display='';
    deltaEl.classList.toggle('is-down',delta<0);
    deltaEl.innerHTML='<i data-lucide="'+(delta>=0?'trending-up':'trending-down')+'"></i> '+(delta>=0?'+':'')+delta+'% vs previous '+INSIGHTS_RANGE_DAYS[insightsRange]+' days';
    if(window.lucide)lucide.createIcons();
  }
  renderInsightsChart(m);
  renderInsightsHeroFoot(m);
}
function renderInsightsCommand(m){
  const msg=heroMessage(m);
  $('insights-headline').textContent=msg.headline;
  $('insights-subtext').textContent=msg.sub;
  const streakEl=$('insights-streak-num');
  if(!streakEl.querySelector('.ico')) streakEl.innerHTML=odometerHTML(m.currentStreak,2);
  playOdometer(streakEl,m.currentStreak,2);
  $('insights-streak-row').classList.toggle('active',m.currentStreak>0);
  const s=pickSurprise(m);
  $('insights-surprise-title').textContent=s.icon+' '+s.title;
  $('insights-surprise-body').textContent=s.body;
}
function igridLevel(val,kind){
  if(kind==='binary') return val>0?3:0;
  if(val<=0) return 0;
  if(val===1) return 1;
  if(val<=3) return 2;
  return 3;
}
function renderInsightsGrid(m){
  const rows=[
    {label:'Tasks',key:'tasks',kind:'count'},
    {label:'Chores',key:'chores',kind:'count'},
    {label:'Training',key:'gym',kind:'binary'},
    {label:'Care',key:'skin',kind:'binary'}
  ];
  const totals=m.totals, days=totals.length, todayIdxLocal=days-1;
  let html='';
  rows.forEach(r=>{
    html+='<span class="igrid-label">'+esc(r.label)+'</span>';
    for(let i=0;i<days;i++){
      const lvl=igridLevel(totals[i][r.key],r.kind);
      html+='<button type="button" class="igrid-dot pending l'+lvl+(i===todayIdxLocal?' is-today':'')+'" style="transition-delay:'+(i*4)+'ms" data-day-idx="'+i+'" aria-label="'+esc(r.label)+' — '+insightsDateLabel(m.last60Dates[i])+'"></button>';
    }
  });
  $('insights-grid').innerHTML=html;
  showInsightsDayDetail(m,todayIdxLocal);
}
function showInsightsDayDetail(m,idx){
  const t=m.totals[idx], dt=m.last60Dates[idx];
  const label=new Date(dt+'T00:00:00').toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'});
  const parts=[];
  if(t.tasks) parts.push(t.tasks+' task'+(t.tasks===1?'':'s')+' completed');
  if(t.chores) parts.push(t.chores+' chore'+(t.chores===1?'':'s')+' done');
  if(t.gym) parts.push('training logged');
  if(t.skin) parts.push('care routine logged');
  const body=parts.length?parts.join(' · '):'Nothing logged this day.';
  $('insights-day-detail').innerHTML='<b>'+esc(label)+'</b> — '+esc(body);
  $('insights-day-detail').classList.add('open');
}
function renderInsightsConstellation(m){
  const badges=insightsBadges(m);
  const unlockedCount=badges.filter(b=>b.unlocked).length;
  $('insights-constellation-note').textContent = unlockedCount===0
    ? 'No badges unlocked yet — the first one might be closer than you think.'
    : unlockedCount===badges.length
      ? 'Every badge on this page, earned.'
      : unlockedCount+' of '+badges.length+' earned. Each one required real days, not luck.';
  $('insights-badge-list').innerHTML=badges.map(b=>'<span class="insights-badge-chip'+(b.unlocked?' unlocked':'')+'">'+b.icon+' '+esc(b.label)+'</span>').join('');
  $('insights-constellation-status').innerHTML='<strong>'+unlockedCount+' / '+badges.length+'</strong><span>badges earned</span>';

  const canvas=$('insights-canvas');
  const wrap=canvas.parentElement;
  const rect=wrap.getBoundingClientRect();
  if(rect.width<10||rect.height<10) return;
  const dpr=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.max(1,Math.round(rect.width*dpr));
  canvas.height=Math.max(1,Math.round(rect.height*dpr));
  canvas.style.width=rect.width+'px';
  canvas.style.height=rect.height+'px';
  const ctx=canvas.getContext('2d');
  const cx=canvas.width/2, cy=canvas.height*0.46;
  const radius=Math.min(canvas.width,canvas.height)*0.32;
  const n=badges.length;
  const pts=badges.map((b,i)=>{
    const angle=(i/n)*Math.PI*2-Math.PI/2;
    return {x:cx+Math.cos(angle)*radius, y:cy+Math.sin(angle)*radius, badge:b};
  });
  if(insightsConstellationRAF) cancelAnimationFrame(insightsConstellationRAF);
  const reduceMotion=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let start=null;
  function frame(ts){
    if(!start) start=ts;
    const t=(ts-start)/1000;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle='rgba(66,230,164,.35)';
    ctx.lineWidth=1.5*dpr;
    ctx.beginPath();
    let prev=null;
    pts.forEach(p=>{ if(p.badge.unlocked){ if(prev) ctx.lineTo(p.x,p.y); else ctx.moveTo(p.x,p.y); prev=p; } });
    ctx.stroke();
    pts.forEach((p,i)=>{
      const pulse=reduceMotion?0:Math.sin(t*1.6+i)*1.4;
      const r=(p.badge.unlocked?5:3.4)*dpr+pulse*dpr;
      ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(1,r),0,Math.PI*2);
      ctx.fillStyle=p.badge.unlocked?'#42e6a4':'rgba(140,150,144,.35)';
      ctx.fill();
      if(p.badge.unlocked){
        ctx.beginPath(); ctx.arc(p.x,p.y,r+3*dpr,0,Math.PI*2);
        ctx.strokeStyle='rgba(66,230,164,.25)'; ctx.lineWidth=1*dpr; ctx.stroke();
      }
    });
    if(!reduceMotion) insightsConstellationRAF=requestAnimationFrame(frame);
  }
  frame(performance.now());
}
// Growth rings — the "tree rings" hero for Life systems. Each ring is one
// real past week (not a decorative arc): thickness and brightness scale
// with how many of that week's 7 days had *something* logged, oldest week
// innermost, this week outermost — the same way an actual tree adds a new
// ring outward each season. Rings start at r=0 and only grow to their real
// radius once this section is scrolled into view (see growInsightsRings),
// so the "growth" is something that happens as you get to it, not a
// timer-driven intro.
function insightsGrowthWeeks(m){
  const totals=m.totals, n=totals.length;
  const weeks=[];
  const start=n%7; // drop the oldest partial week so every ring is a real full week
  for(let i=start;i<n;i+=7){
    const chunk=totals.slice(i,i+7);
    const active=chunk.filter(t=>t.total>0).length;
    weeks.push({active,size:chunk.length,endDate:m.last60Dates[Math.min(i+chunk.length-1,n-1)]});
  }
  return weeks;
}
function renderInsightsRings(m){
  const weeks=insightsGrowthWeeks(m);
  const n=Math.max(1,weeks.length);
  const minR=24,maxR=138,gap=n>1?(maxR-minR)/(n-1):0;
  const ringsSvg=weeks.map((w,i)=>{
    const ratio=w.active/Math.max(1,w.size);
    const r=(minR+i*gap).toFixed(1);
    const sw=(2+ratio*7.5).toFixed(1);
    const op=(0.3+ratio*0.7).toFixed(2);
    const isCurrent=i===weeks.length-1;
    return '<circle class="igrow-ring'+(isCurrent?' is-current':'')+'" cx="150" cy="150" r="0" data-r="'+r+'" style="--sw:'+sw+';--op:'+op+';transition-delay:'+(i*80)+'ms"><title>Week of '+esc(insightsDateLabel(w.endDate))+' — '+w.active+'/'+w.size+' active days</title></circle>';
  }).join('');
  const latest=weeks.length?weeks[weeks.length-1]:{active:0,size:7};
  $('insights-rings').innerHTML='<div class="insights-growth-wrap">'+
    '<svg viewBox="0 0 300 300" class="insights-growth-svg" aria-label="Weekly consistency growth rings, oldest week at the center">'+ringsSvg+
    '<text x="150" y="148" text-anchor="middle" class="igrow-center-num">'+latest.active+'</text>'+
    '<text x="150" y="168" text-anchor="middle" class="igrow-center-sub">this week</text>'+
    '</svg>'+
    '<p class="insights-growth-caption">Each ring is one real week — thicker and brighter means more active. The outer ring is this week, still growing.</p>'+
    '</div>';
  if(document.querySelector('#insights-systems-row.in')) growInsightsRings();
}
function growInsightsRings(){
  document.querySelectorAll('#insights-rings .igrow-ring').forEach(c=>{ c.setAttribute('r',c.dataset.r||'0'); });
}
function renderInsightsRankList(m){
  const items=[
    {label:'Training',days:m.thisWeekGymDays},
    {label:'Care routine',days:m.thisWeekSkinDays},
    {label:'Tasks',days:insightsActiveDaysThisWeek(m,'tasks')},
    {label:'Chores',days:insightsActiveDaysThisWeek(m,'chores')}
  ];
  items.sort((a,b)=>b.days-a.days);
  $('insights-rank-list').innerHTML=items.map((it,i)=>{
    const pct=Math.round(it.days/7*100);
    return '<div class="insights-rank"><span class="insights-rank-num">'+(i+1)+'</span><div><b>'+esc(it.label)+'</b><div class="insights-rank-track"><span style="transform:scaleX('+(pct/100)+')"></span></div></div><strong>'+it.days+'/7</strong></div>';
  }).join('');
}
function renderInsightsMilestones(){
  const show=state.profile==='Bhargav';
  $('milestones-section-head').style.display=show?'':'none';
  $('milestones-card').style.display=show?'':'none';
  if(!show) return;
  const dates=insightsMilestoneDates();
  const d=today();
  const nextIdx=dates.findIndex(dt=>!milestoneHitOn(dt) && dt>=d);
  const rows=dates.map((dt,i)=>{
    const hit=milestoneHitOn(dt);
    const isNext=!hit && i===nextIdx;
    const isOverdue=!hit && !isNext && dt<d;
    const label='Month '+(i+1)+' review';
    const dLabel=new Date(dt+'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'});
    const daysAway=daysBetween(d,dt);
    const tag=hit?'Done':isOverdue?'Overdue':isNext?(daysAway>0?daysAway+'d away':'Today'):dLabel;
    const cls=hit?'hit':isOverdue?'overdue':isNext?'next':'';
    return '<div class="milestone-mini'+(cls?' '+cls:'')+'"><span class="mm-dot">'+(hit?'✓':(i+1))+'</span><span class="mm-copy"><strong>'+label+'</strong><small>'+dLabel+'</small></span><span class="mm-tag">'+esc(tag)+'</span></div>';
  }).join('');
  $('milestones-list').innerHTML=rows;
}
function renderInsightsStory(m){
  const msg=heroMessage(m);
  $('insights-story-title').textContent=msg.headline;
  $('insights-story-body').textContent=msg.sub;
  $('insights-thread-body').textContent = m.currentStreak>0
    ? 'You’re '+m.currentStreak+' day'+(m.currentStreak===1?'':'s')+' deep right now. On the days it feels pointless, you don’t need motivation — just one small thing before the day ends.'
    : 'No streak running right now, and that’s a fact, not a verdict. Every streak on this page started on a day that felt exactly like today. Do one small thing — that’s the whole job.';
}
function insightsFireCelebration(){
  const host=$('insights-celebration');
  const colors=['','gold'];
  const cx=window.innerWidth/2, cy=window.innerHeight*0.35;
  let html='';
  for(let i=0;i<26;i++){
    const angle=Math.random()*Math.PI*2, dist=60+Math.random()*180;
    const x=Math.cos(angle)*dist, y=Math.sin(angle)*dist;
    const cls=colors[Math.random()<0.3?1:0];
    html+='<span class="insights-spark'+(cls?' '+cls:'')+'" style="left:'+cx+'px;top:'+cy+'px;--x:'+x+'px;--y:'+y+'px;animation-delay:'+(Math.random()*0.2)+'s"></span>';
  }
  host.innerHTML=html;
  setTimeout(()=>{ if(host.innerHTML===html) host.innerHTML=''; },1600);
}
function wireInsightsInteractions(){
  if(wireInsightsInteractions._wired) return; wireInsightsInteractions._wired=true;
  $('insights-range').addEventListener('click',e=>{
    const btn=e.target.closest('button[data-range]'); if(!btn) return;
    insightsRange=btn.dataset.range;
    $('insights-range').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===btn));
    if(insightsCurrentM) renderInsightsHero(insightsCurrentM);
  });
  $('insights-grid').addEventListener('click',e=>{
    const dot=e.target.closest('.igrid-dot'); if(!dot||!insightsCurrentM) return;
    showInsightsDayDetail(insightsCurrentM,Number(dot.dataset.dayIdx));
  });
  $('insights-grid-jump').addEventListener('click',()=>{
    const sc=document.querySelector('.insights-grid-scroll'); if(sc) sc.scrollLeft=sc.scrollWidth;
  });
  $('insights-replay').addEventListener('click',()=>{ playInsightsReveal(); });
  $('insights-thread-btn').addEventListener('click',()=>{ $('insights-recovery').hidden=false; });
  $('insights-close-reset').addEventListener('click',()=>{ $('insights-recovery').hidden=true; });
  $('insights-begin-reset').addEventListener('click',()=>{
    $('insights-recovery').hidden=true;
    showRoute('today');
    setTimeout(()=>{
      const pr=document.querySelector('.widget-card[data-widget-type="priorities"]');
      if(pr) pr.scrollIntoView({behavior:'smooth',block:'center'});
    },80);
  });
  window.addEventListener('resize',()=>{
    if(insightsCurrentM && document.getElementById('page-insights').classList.contains('active')) renderInsightsConstellation(insightsCurrentM);
    updateInsightsSpine();
  });
  window.addEventListener('scroll',onInsightsScroll,{passive:true});
}
/* ===== Motion that reacts to the person, not a timer =====
   Every section below fades/settles in only once it's actually scrolled
   into view (IntersectionObserver), the growth rings only grow once
   their section is visible, and the activity grid's dots only drop into
   place the same way — so the page's motion is something that happens
   *as you look at it*, not an autoplay intro you watch once and then
   ignore. The spine (the vertical line running down the page) goes a
   step further and tracks scroll position continuously, redrawing on
   every scroll frame. Replay (the button) is the one deliberate
   exception — it resets and re-triggers everything on demand. */
let insightsIO=null;
function setupInsightsRevealObserver(){
  if(insightsIO) insightsIO.disconnect();
  insightsIO=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting) return;
      const el=entry.target;
      el.classList.add('in');
      if(el.id==='insights-grid-card') document.querySelectorAll('#insights-grid .igrid-dot.pending').forEach(d=>d.classList.remove('pending'));
      if(el.id==='insights-systems-row') growInsightsRings();
      insightsIO.unobserve(el);
    });
  },{threshold:0.2,rootMargin:'0px 0px -6% 0px'});
  document.querySelectorAll('#insights-cinema .reveal').forEach(el=>insightsIO.observe(el));
}
let insightsSpineRAF=null;
function updateInsightsSpine(){
  const cinema=$('insights-cinema'), line=$('insights-spine-line');
  if(!cinema||!line||!document.getElementById('page-insights').classList.contains('active'))return;
  const rect=cinema.getBoundingClientRect();
  const total=rect.height; if(total<=0)return;
  const triggerY=window.innerHeight*0.78;
  const scrolled=Math.max(0,Math.min(total,triggerY-rect.top));
  const progress=scrolled/total;
  line.setAttribute('stroke-dasharray',String(total));
  line.setAttribute('stroke-dashoffset',String(total*(1-progress)));
}
function onInsightsScroll(){
  if(insightsSpineRAF)return;
  insightsSpineRAF=requestAnimationFrame(()=>{ insightsSpineRAF=null; updateInsightsSpine(); });
}
function playInsightsReveal(){
  const cinema=$('insights-cinema');
  const scan=$('insights-scanline');
  scan.classList.remove('go'); void scan.offsetWidth; scan.classList.add('go');
  cinema.querySelectorAll('.reveal').forEach(c=>c.classList.remove('in'));
  document.querySelectorAll('#insights-rings .igrow-ring').forEach(c=>c.setAttribute('r','0'));
  document.querySelectorAll('#insights-grid .igrid-dot').forEach(d=>d.classList.add('pending'));
  cinema.scrollIntoView({behavior:'smooth',block:'start'});
  setupInsightsRevealObserver();
  updateInsightsSpine();
  if(insightsCurrentM) renderInsightsConstellation(insightsCurrentM);
}
async function renderInsightsPage(){
  await ensureInsightsLoaded();
  const m=computeInsights();
  insightsCurrentM=m;
  wireInsightsInteractions();
  renderInsightsHero(m);
  renderInsightsCommand(m);
  renderInsightsGrid(m);
  renderInsightsConstellation(m);
  renderInsightsRings(m);
  renderInsightsRankList(m);
  renderInsightsMilestones();
  renderInsightsStory(m);
  if(window.lucide)lucide.createIcons();
  setupInsightsRevealObserver();
  requestAnimationFrame(updateInsightsSpine);
  const nowUnlocked=insightsBadges(m).filter(b=>b.unlocked).map(b=>b.id);
  if(insightsPrevUnlocked && nowUnlocked.some(id=>!insightsPrevUnlocked.includes(id))) insightsFireCelebration();
  insightsPrevUnlocked=nowUnlocked;
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
const WEATHER_CACHE_KEY='hub-weather-cache-v1';
const WEATHER_TTL_MS=20*60*1000;
const WEATHER_FALLBACK={lat:32.7157,lon:-117.1611,label:'San Diego, CA'}; // used only if geolocation is denied/unavailable
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
    '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=1';
  const res=await fetch(url);
  if(!res.ok)throw new Error('weather fetch failed');
  return res.json();
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
  const nowHour=new Date().getHours();
  const hourly=data.hourly.time.map((t,i)=>({hour:new Date(t).getHours(),temp:data.hourly.temperature_2m[i],code:data.hourly.weather_code[i]}))
    .filter(h=>h.hour>=nowHour).slice(0,5);
  $('hub-weather-hours').innerHTML=hourly.map(h=>{
    const label=h.hour===0?'12A':h.hour===12?'12P':h.hour>12?(h.hour-12)+'P':h.hour+'A';
    return '<div class="hub-weather-hour"><span>'+label+'</span><i data-lucide="'+weatherIconFor(h.code)+'"></i><b>'+Math.round(h.temp)+'°</b></div>';
  }).join('');
  $('hub-weather-detail').hidden=false;
  if(window.lucide)lucide.createIcons();
}
function weatherError(){
  const icon=$('hub-weather-icon');
  if(icon){icon.classList.remove('spin');icon.setAttribute('data-lucide','cloud-off');if(window.lucide)lucide.createIcons()}
  const cond=$('hub-weather-cond');if(cond)cond.textContent='Weather unavailable';
}
async function loadWeatherFor(lat,lon,label,skipCache){
  try{
    if(!skipCache){
      const cached=safeJson(localStorage.getItem(WEATHER_CACHE_KEY),null);
      if(cached && cached.lat===lat && cached.lon===lon && (Date.now()-cached.at)<WEATHER_TTL_MS){renderWeather(cached.data,label);return}
    }
    const data=await fetchWeather(lat,lon);
    localStorage.setItem(WEATHER_CACHE_KEY,JSON.stringify({lat,lon,at:Date.now(),data}));
    renderWeather(data,label);
  }catch(e){console.warn('weather',e);weatherError()}
}
function requestPreciseWeather(){
  const icon=$('hub-weather-icon');if(icon){icon.setAttribute('data-lucide','loader-circle');icon.classList.add('spin');if(window.lucide)lucide.createIcons()}
  if(!navigator.geolocation){loadWeatherFor(WEATHER_FALLBACK.lat,WEATHER_FALLBACK.lon,WEATHER_FALLBACK.label,true);return}
  navigator.geolocation.getCurrentPosition(
    pos=>loadWeatherFor(Number(pos.coords.latitude.toFixed(3)),Number(pos.coords.longitude.toFixed(3)),'Your location',true),
    ()=>loadWeatherFor(WEATHER_FALLBACK.lat,WEATHER_FALLBACK.lon,WEATHER_FALLBACK.label,true),
    {timeout:8000,maximumAge:600000}
  );
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
function initHubWeather(){
  if(!$('hub-weather'))return;
  const savedCollapsed=(function(){ try{ const v=localStorage.getItem('hub-weather-collapsed'); return v===null?true:v==='1'; }catch(e){ return true; } })();
  hubWeatherSetCollapsed(savedCollapsed);
  $('hub-weather-toggle').addEventListener('click',()=>{ hubWeatherSetCollapsed(!$('hub-weather').classList.contains('is-collapsed')); });
  $('hub-weather-place-btn').addEventListener('click',e=>{ e.stopPropagation(); requestPreciseWeather(); });
  if(!navigator.geolocation){loadWeatherFor(WEATHER_FALLBACK.lat,WEATHER_FALLBACK.lon,WEATHER_FALLBACK.label);return}
  navigator.geolocation.getCurrentPosition(
    pos=>loadWeatherFor(Number(pos.coords.latitude.toFixed(3)),Number(pos.coords.longitude.toFixed(3)),'Your location'),
    ()=>loadWeatherFor(WEATHER_FALLBACK.lat,WEATHER_FALLBACK.lon,WEATHER_FALLBACK.label),
    {timeout:8000,maximumAge:600000}
  );
  setInterval(()=>{const cached=safeJson(localStorage.getItem(WEATHER_CACHE_KEY),null);if(cached)loadWeatherFor(cached.lat,cached.lon,$('hub-weather-place').textContent,true)},WEATHER_TTL_MS);
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
if($('sidebar-toggle')){
  $('sidebar-toggle').addEventListener('click',()=>{
    sidebarAutoCollapsed=false; // a manual click always overrides the auto-collapse-on-open behavior below
    setSidebarCollapsed(!$('app-shell').classList.contains('sidebar-collapsed'));
  });
  try{ if(localStorage.getItem(SIDEBAR_COLLAPSE_KEY)==='1') setSidebarCollapsed(true); }catch(e){}
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
  $('app-frame-iframe').src='about:blank';
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
$('quick-add-open').addEventListener('click',openQuickAdd);document.querySelectorAll('[data-open-quick-add]').forEach(x=>x.addEventListener('click',openQuickAdd));$('quick-add-close').addEventListener('click',closeQuickAdd);$('quick-add-cancel').addEventListener('click',closeQuickAdd);$('quick-add-modal').addEventListener('click',e=>{if(e.target===$('quick-add-modal'))closeQuickAdd()});
$('quick-add-form').addEventListener('submit',async e=>{e.preventDefault();const shared=$('qa-shared').value==='shared',task={id:'task-'+Date.now()+'-'+Math.floor(Math.random()*1000),title:$('qa-title').value.trim(),done:false,priority:Number($('qa-priority').value)||0,startDate:today(),due:$('qa-date').value||null,dueTime:$('qa-time').value||null,repeat:'none',notes:'',link:'',tags:[],subtasks:[],listId:shared?'shared':'personal',createdBy:state.profile,order:Date.now(),createdAt:new Date().toISOString()};if(!task.title)return;const list=shared?state.sharedTasks:state.personalTasks,ref=shared?sharedTodoRef():profileRef('todo-profiles','tasks');list.push(task);$('qa-save').disabled=true;try{await ref.set({json:JSON.stringify(list),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});closeQuickAdd();renderDashboard();toast('Task added')}catch(err){list.pop();toast('Could not save. Try again.')}finally{$('qa-save').disabled=false}});

function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2200)}
function chooseProfile(){setGate('profile')}
document.querySelectorAll('[data-profile-choice]').forEach(btn=>btn.addEventListener('click',()=>{setProfile(btn.dataset.profileChoice);loadDashboard()}));
$('profile-switch').addEventListener('click',chooseProfile);$('mobile-profile').addEventListener('click',chooseProfile);$('signout').addEventListener('click',()=>{localStorage.removeItem(PROFILE_KEY);if(clockTimer)clearInterval(clockTimer);auth.signOut()});
$('auth-form').addEventListener('submit',async e=>{e.preventDefault();$('auth-error').textContent='';$('auth-submit').disabled=true;try{await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);await auth.signInWithEmailAndPassword($('auth-email').value.trim(),$('auth-password').value)}catch(err){$('auth-error').textContent=(err.message||'Sign in failed').replace('Firebase: ','')}finally{$('auth-submit').disabled=false}});

auth.onAuthStateChanged(user=>{state.user=user;if(!user){setGate('auth');return}const saved=localStorage.getItem(PROFILE_KEY);if(saved==='Bhargav'||saved==='Anusha'){setProfile(saved);loadDashboard()}else setGate('profile')});
lucide.createIcons();
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));

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
function hubCheckAlarms(){
  if(!hubAlarms.length) return;
  // Never stack a second full-screen ring on top of one already showing.
  if($('hub-alarm-overlay') && !$('hub-alarm-overlay').hidden) return;
  const now=new Date();
  const hhmm=hubPad2(now.getHours())+':'+hubPad2(now.getMinutes());
  const dow=now.getDay(), todayKey=now.toDateString();
  hubAlarms.forEach(a=>{
    if(!a.on) return;
    if(a.days && a.days.length && a.days.indexOf(dow)===-1) return;
    if(a.time!==hhmm) return;
    const fireKey=a.id+':'+todayKey+':'+hhmm;
    if(hubFiredToday[fireKey]) return;
    hubFiredToday[fireKey]=true;
    saveHubFiredToday();
    hubFireAlarm(a);
  });
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

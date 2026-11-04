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
const GLASS_DEFAULT={c1:'#7a2b3a',c2:'#2c5d8f',base:'#1a1320',gold:'#e6b866',op:8,blur:28};
function glassCfg(){const g=(state.theme&&state.theme.glass)||{};return Object.assign({},GLASS_DEFAULT,g)}
function glassBg(g){return 'radial-gradient(900px 600px at 12% 8%,'+g.c1+' 0%,transparent 62%),radial-gradient(1100px 760px at 95% 100%,'+g.c2+' 0%,transparent 62%),'+g.base}
// One app-wide look, layered on top of the per-profile accent color above.
// Adding a new one later is just a new entry here plus a matching
// :root[data-theme="..."] block in app.css — nothing else has to change.
const THEME_MODES=[
  {id:'light',name:'Light',desc:'The original look',rail:'#171714',body:'#f4f4f0',chip:'#ad7b20',line:'#e3e3dc'},
  {id:'dark',name:'Dark',desc:'Easy on the eyes',rail:'#0a0a09',body:'#1b1b1a',chip:'#42e6a4',line:'#323230'},
  {id:'midnight',name:'Midnight',desc:'Deep blue-black',rail:'#060811',body:'#131829',chip:'#7fa2ff',line:'#262e4a'},
  {id:'sepia',name:'Sepia',desc:'Warm paper tone',rail:'#2c2413',body:'#fbf5e8',chip:'#a8672e',line:'#e1cfa8'},
  {id:'glass',name:'Glass',desc:'Frosted glass, like the phone',rail:'#3a2030',body:'#2a1a2c',chip:'#e6b866',line:'#5a4560'}
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
  // Glass look: user-tunable colours (Settings > Theme > Glass colours)
  const GLP=['--gl-gold','--gl-card','--gl-blur','--gl-card-hi'];
  if(!pal&&t.mode==='glass'){const g=glassCfg(),rs=document.documentElement.style;
    rs.setProperty('--bg',glassBg(g));rs.setProperty('--gl-gold',g.gold);rs.setProperty('--gl-card','rgba(255,255,255,'+(g.op/100)+')');rs.setProperty('--gl-card-hi','rgba(255,255,255,'+Math.min(.5,g.op/100+.05)+')');rs.setProperty('--gl-blur',g.blur+'px');
    rs.setProperty('--accent-soft',g.gold+'2e');rs.setProperty('--accent-ink',g.gold);
  }else GLP.forEach(p=>document.documentElement.style.removeProperty(p));
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
async function saveProfileAppearance(){try{await profileRef('hub-profiles','appearance').set({json:JSON.stringify({mode:state.theme.mode,wallpaper:state.theme.wallpaper,glass:state.theme.glass||null})})}catch(e){}}

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
  state.theme={accents,mode:appearance.mode||'light',wallpaper:appearance.wallpaper||DEFAULT_THEME.wallpaper,glass:appearance.glass||null};
  state.widgets = (widgets && widgets[state.profile] && widgets[state.profile].length) ? widgets[state.profile].map(w=>w&&w.type==='checklist'?Object.assign({},w,{type:'notes',id:'w-notes'}):w).map(w=>w&&(w.type==='priorities'||w.type==='taskmap')?Object.assign({},w,{type:'todo',id:'w-todo'}):w).filter(w=>w&&WIDGET_TYPES[w.type]).filter((w,i,a)=>(w.type!=='notes'&&w.type!=='todo')||a.findIndex(x=>x.type===w.type)===i) : widgetDefaultLayout();
  wlSnap=null;HubHist.undo=[];HubHist.redo=[];
  // One-time: put the Calendar widget onto layouts saved before it existed.
  try{
    const k='hub-agenda-seeded-'+state.profile;
    if(!localStorage.getItem(k)){
      localStorage.setItem(k,'1');
      if(!state.widgets.some(w=>w.type==='agenda')){state.widgets.splice(Math.min(2,state.widgets.length),0,{id:'w-agenda',type:'agenda',colSpan:6,rowSpan:15});saveWidgetLayout()}
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
function dayBlocksFor(date,profile){
  const dn=DAYS[new Date(date+'T12:00:00').getDay()];
  return window.resolveDayBlocks?window.resolveDayBlocks(profile||state.profile,dn,date,state.templates):((state.templates&&state.templates[dn])||[]);
}
function timelineForDate(date){
  const weekday=new Date(date+'T00:00:00').getDay(),dayName=DAYS[weekday];
  const blocks=dayBlocksFor(date).map((x,i)=>({id:'block-'+i,title:x.activity||x.title||'Scheduled block',time:x.start||'',end:x.end||'',kind:'routine'}));
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
  const date=today(), weekday=DAYS[new Date().getDay()], blocks=dayBlocksFor(date);
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
    if(state.templates&&el) renderScheduleWidget(el,state.widgets.find(x=>x.type==='schedule'));
  }, 30000);
}

/* =====================================================================
   TODAY'S SCHEDULE WIDGET — blocks you can tick, on a line that fills in
   with your theme colour as the day goes. Calendar events and due tasks
   sit under the block they fall inside; tasks with no time go in
   "Anytime today". Ticks are the same templateLog the Schedule app,
   voice, Insights and Pledge all read.
===================================================================== */
const SCHEDULE_SETTINGS=[
  {h:"While it's running"},
  {key:'count',label:'Countdown on the current block',hint:'Shows "ends in 25 min"',type:'bool',def:true},
  {key:'next',label:'"Up next" line',hint:'The next block at the bottom',type:'bool',def:true},
  {key:'miss',label:'Missed dot',hint:"A quiet dot on past blocks you didn't tick",type:'bool',def:false},
  {h:'What to show'},
  {key:'bar',label:'Progress bar',type:'bool',def:true},
  {key:'nest',label:'Show events and tasks under their block',hint:'If off, they sit between blocks in time order',type:'bool',def:true},
  {key:'skin',label:'Skin steps under their block',hint:'Routine steps you linked to a block in Skin. Off = use the Skin widget',type:'bool',def:true},
  {key:'diet',label:'Diet meals under their block',hint:'Meals you linked to a block in Diet. Off = use the Diet widget',type:'bool',def:true},
  {key:'anyt',label:'"Anytime today" tasks',hint:'Tasks with no time set',type:'bool',def:true},
  {key:'ev',label:'Calendar events',type:'bool',def:true},
  {key:'task',label:'Tasks due today',type:'bool',def:true},
  {key:'past',label:'Blocks whose time has passed',hint:'Hidden once over, with a button to look back',type:'seg',opts:[['hide','Hide'],['show','Show']],def:'hide'},
  {key:'done',label:'Ticked blocks',type:'seg',opts:[['stay','Stay'],['hide','Tuck away']],def:'stay'},
  {key:'fmt',label:'Time format',type:'seg',opts:[['12','12-hour'],['24','24-hour']],def:'12'}
];
function wsAll(w,def){const out={};(def.settings||[]).forEach(o=>{if(o.key)out[o.key]=(w&&w.settings&&o.key in w.settings)?w.settings[o.key]:o.def});return out}
/* ---- Water tracker v3.
   One doc per profile at users/{uid}/hub-profiles/{profile}/data/water:
     sips  {date:[{id,ml,at(min since midnight|null),plan,src}]}   <- the source of truth (timed drinks)
     log   {date:[ml]}   derived from sips on every save, so Pledge / Insights / older readers keep working
     plans {date:[{id,time,ml,remind,skipped}]}, template (the plan that repeats daily), goals {date:ml} (past days keep their goal),
     sync  {date:ml} (what Gym and the widget last agreed on), plus the person's own settings (units, buttons, day window, reminders).
   Gym still gets only the day's total (profiles/{p}/dailyLogs/{date}.water in litres). ---- */
const OZ_ML=29.5735;
const WATER_BASE={unit:'ml',ncup:'Cup',cup:250,nbottle:'Bottle',bottle:500,nthird:'Mine',third:0,start:'07:00',end:'22:00',rem:true,match:true,notif:false,snooze:10,every:2,repeat:true};
const wNow=()=>{const n=new Date();return n.getHours()*60+n.getMinutes()};
const wHm=m=>String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const wT=m=>m==null?'earlier':time12(wHm(m));
let wSeq=0;const wId=()=>'s'+Date.now().toString(36)+(wSeq++).toString(36)+Math.random().toString(36).slice(2,5);
const wDefGoal=()=>/anusha/i.test(state.profile||'')?3000:3500;
const wObj=v=>(v&&typeof v==='object'&&!Array.isArray(v))?v:{};
async function ensureWater(){
  if(state.water && state.waterProfile===state.profile) return;
  let v=null;
  try{ const snap=await profileRef('hub-profiles','water').get(); v=snap.exists?safeJson(snap.data().json,null):null; }catch(e){}
  v=wObj(v);
  const w=Object.assign({},WATER_BASE,v);
  w.goal=Number(v.goal)>0?Number(v.goal):wDefGoal(); w.unit=w.unit==='oz'?'oz':'ml';
  w.log=wObj(v.log); w.sips=wObj(v.sips); w.plans=wObj(v.plans); w.goals=wObj(v.goals); w.sync=wObj(v.sync);
  w.template=Array.isArray(v.template)?v.template:[];
  // days that only have the old plain list (or whose list was changed by an older copy of the app) become untimed drinks
  Object.keys(w.log).forEach(d=>{
    const a=Array.isArray(w.log[d])?w.log[d]:[],have=Array.isArray(w.sips[d])?w.sips[d]:null;
    const sum=a.reduce((s,x)=>s+(Number(x)||0),0),hs=have?have.reduce((s,x)=>s+(Number(x.ml)||0),0):-1;
    if(!have||hs!==sum)w.sips[d]=a.map((ml,i)=>({id:'o'+d+'-'+i,ml:Number(ml)||0,at:null,src:'old'}));
  });
  state.water=w; state.waterProfile=state.profile;
}
let waterSaveTimer=null;
function saveWater(){
  clearTimeout(waterSaveTimer);
  const prof=state.profile, data=state.water;
  waterSaveTimer=setTimeout(async()=>{
    const keep=new Set(Object.keys(data.sips).concat(Object.keys(data.log)).sort().slice(-120));
    ['log','sips','plans','goals','sync'].forEach(k=>{const o={};Object.keys(data[k]||{}).sort().forEach(d=>{if(keep.has(d))o[d]=data[k][d]});data[k]=o});
    try{ await db.collection('users').doc(state.user.uid).collection('hub-profiles').doc(prof).collection('data').doc('water').set({json:JSON.stringify(data)}); }catch(e){}
  },400);
}
const waterSips=d=>{const a=state.water&&state.water.sips[d];return Array.isArray(a)?a:[]};
function waterTotal(date){ return waterSips(date).reduce((s,x)=>s+(Number(x.ml)||0),0); }
const waterGoalFor=d=>d===today()?state.water.goal:(Number(state.water.goals[d])>0?Number(state.water.goals[d]):state.water.goal);
function waterFmt(ml){ return state.water.unit==='oz'?Math.round(ml/OZ_ML)+' oz':Math.round(ml).toLocaleString()+' ml'; }
const waterToUnit=ml=>state.water&&state.water.unit==='oz'?Math.round(ml/OZ_ML):Math.round(ml);
const waterFromUnit=v=>state.water&&state.water.unit==='oz'?Math.round(v*OZ_ML):Math.round(v);
/* ---- Water <-> Gym. The Gym check-in keeps water in litres at profiles/{p}/dailyLogs/{date}.water. That total is the shared record:
   the widget reads it, adopts any change made in Gym, and writes every change back. w.sync[date] remembers the total both sides last agreed on. ---- */
function gymWaterDoc(prof,d){ return gymDailyLogsCol(prof).doc(d); }
function waterSetTotal(d,target){      // Gym changed the day's total: keep the timed drinks, add or trim the difference
  const w=state.water,arr=w.sips[d]=Array.isArray(w.sips[d])?w.sips[d]:[];let t=waterTotal(d);
  if(target>t)arr.push({id:wId(),ml:target-t,at:null,src:'gym'});
  else while(t>target&&arr.length){const last=arr[arr.length-1],ex=t-target;if(last.ml<=ex){arr.pop();t-=last.ml}else{last.ml-=ex;t=target}}
  w.log[d]=arr.map(s=>s.ml);
}
async function reconcileWater(days){
  const w=state.water, prof=state.profile; if(!w||!prof) return;
  let changed=false;
  await Promise.all(days.map(async d=>{
    let gymMl=0, exists=false;
    try{ const s=await gymWaterDoc(prof,d).get(); exists=s.exists; gymMl=exists?Math.round((Number(s.data().water)||0)*1000):0; }catch(e){ return; }
    const hubMl=waterTotal(d), base=w.sync[d];
    if(base===undefined){
      if(gymMl===hubMl){ w.sync[d]=gymMl; changed=true; return; }
      if(gymMl>0){ waterSetTotal(d,gymMl); w.sync[d]=gymMl; changed=true; return; }
      await pushWaterToGym(prof,d,hubMl); w.sync[d]=hubMl; changed=true; return;
    }
    if(gymMl!==base){ waterSetTotal(d,gymMl); w.sync[d]=gymMl; changed=true; }
    else if(hubMl!==base){ await pushWaterToGym(prof,d,hubMl); w.sync[d]=hubMl; changed=true; }
  }));
  if(changed) saveWater();
}
async function pushWaterToGym(prof,d,ml){
  try{ await gymWaterDoc(prof,d).set({date:d,water:Math.round(ml/10)/100},{merge:true}); FsCache.patch(gymDailyLogsCol(prof).path,d,{date:d,water:Math.round(ml/10)/100},{merge:true}); }catch(e){}
}
function pantryWater(d){ if(window.WaterPantry&&state.user&&state.profile) WaterPantry.sync(db,state.user.uid,state.profile,d,waterTotal(d)); }
/* ---- the day's plan, matching drinks to it, and every change in one place ---- */
function waterPlan(d){
  const w=state.water;if(Array.isArray(w.plans[d]))return w.plans[d];
  if(d===today()&&w.repeat&&w.template.length)return w.plans[d]=w.template.map((t,i)=>({id:'t'+d+'-'+i,time:t.time,ml:t.ml,remind:t.remind!==false}));
  return null;
}
const waterPlanList=d=>waterPlan(d)||[];
const wFill=(p,d)=>waterSips(d).filter(s=>s.plan===p.id).reduce((a,s)=>a+s.ml,0);
function wStatus(p,d){
  const fill=wFill(p,d);
  if(fill>=p.ml-1){const l=waterSips(d).filter(s=>s.plan===p.id);return{s:'done',at:l.length?l[l.length-1].at:null,fill}}
  if(p.skipped)return{s:'skipped',fill};
  const n=d===today()?wNow():1440;
  if(n<p.time)return{s:'up',fill};if(n<p.time+15)return{s:'due',fill};return{s:'missed',fill};
}
function waterNearest(d,at){
  return waterPlanList(d).filter(p=>!p.skipped&&wFill(p,d)<p.ml-1)
    .sort((a,b)=>at==null?a.time-b.time:Math.abs(a.time-at)-Math.abs(b.time-at)||a.time-b.time)[0];
}
function waterCommit(d){            // after any change to a day's drinks
  const w=state.water;w.goals[today()]=w.goal;w.log[d]=waterSips(d).map(s=>s.ml);w.sync=w.sync||{};w.sync[d]=waterTotal(d);
  saveWater();
  if(d>=addDays(today(),-7))pantryWater(d);
  pushWaterToGym(state.profile,d,waterTotal(d));
}
function waterAddSip(d,ml,at,planId,src){
  const w=state.water;let matched=null;
  if(planId===undefined&&w.match){const o=waterNearest(d,at);if(o){planId=o.id;matched=o}}
  if(at==null)at=matched?matched.time:720;
  const s={id:wId(),ml:Math.round(ml),at,src:src||'btn'};if(planId)s.plan=planId;
  (w.sips[d]=Array.isArray(w.sips[d])?w.sips[d]:[]).push(s);waterCommit(d);
  return {s,matched};
}
function waterRemoveSips(d,ids){
  const w=state.water,set=new Set(ids),gone=waterSips(d).filter(s=>set.has(s.id));
  w.sips[d]=waterSips(d).filter(s=>!set.has(s.id));waterCommit(d);return gone;
}
function waterRestoreSips(d,list){const w=state.water;(w.sips[d]=Array.isArray(w.sips[d])?w.sips[d]:[]).push(...list);waterCommit(d)}
function waterPlanChanged(){          // today's plan was edited: remember it as the daily plan when it repeats
  const w=state.water,p=waterPlan(today());
  if(w.repeat&&p)w.template=p.map(x=>({time:x.time,ml:x.ml,remind:x.remind!==false}));
  saveWater();
}
function waterStreak(){
  const w=state.water,t=today();let n=0,d=waterTotal(t)>=waterGoalFor(t)?t:addDays(t,-1);
  while(n<400&&waterTotal(d)>=waterGoalFor(d)&&waterTotal(d)>0){n++;d=addDays(d,-1)}
  return n;
}
/* ---- reminders: a banner on the card, plus a browser notification while the Hub is open ---- */
const waterNotified={},waterSnooze={};
function waterDue(){
  const w=state.water;if(!w||!w.rem)return null;const d=today(),n=wNow();
  return waterPlanList(d).slice().sort((a,b)=>a.time-b.time).find(p=>p.remind!==false&&wStatus(p,d).s==='due'&&!(waterSnooze[p.id]>n))||null;
}
function waterNotify(){
  const w=state.water,p=waterDue();if(!p||!w.notif||waterNotified[p.id])return;
  if(window.Notification&&Notification.permission==='granted'){waterNotified[p.id]=1;try{new Notification('Time to drink water',{body:waterFmt(p.ml)+' planned for '+wT(p.time)})}catch(e){}}
}
/* ---- settings (the gear): data settings live in the water doc, the display switches live with the widget ---- */
const wSet=(k,v)=>{state.water[k]=v;saveWater()};
const WATER_SETTINGS=[
  {h:'Your goal'},
  {key:'goal',label:'Daily goal',hint:'Same every day. Past days keep the goal they had.',type:'num',min:1,get:()=>state.water?waterToUnit(state.water.goal):'',set:v=>{const n=parseFloat(v);if(n>0&&n<20000)wSet('goal',waterFromUnit(n))}},
  {key:'unit',label:'Units',type:'seg',opts:[['ml','ml'],['oz','oz']],get:()=>state.water?state.water.unit:'ml',set:v=>wSet('unit',v==='oz'?'oz':'ml')},
  {h:'Your buttons'},
  {key:'ncup',label:'First button name',type:'text',get:()=>state.water?state.water.ncup:'',set:v=>wSet('ncup',String(v).trim().slice(0,12)||WATER_BASE.ncup)},
  {key:'cup',label:'First button size',type:'num',min:1,get:()=>state.water?waterToUnit(state.water.cup):'',set:v=>{const n=parseFloat(v);if(n>0&&n<5000)wSet('cup',waterFromUnit(n))}},
  {key:'nbottle',label:'Second button name',type:'text',get:()=>state.water?state.water.nbottle:'',set:v=>wSet('nbottle',String(v).trim().slice(0,12)||WATER_BASE.nbottle)},
  {key:'bottle',label:'Second button size',type:'num',min:1,get:()=>state.water?waterToUnit(state.water.bottle):'',set:v=>{const n=parseFloat(v);if(n>0&&n<5000)wSet('bottle',waterFromUnit(n))}},
  {key:'nthird',label:'Third button name',type:'text',get:()=>state.water?state.water.nthird:'',set:v=>wSet('nthird',String(v).trim().slice(0,12)||WATER_BASE.nthird)},
  {key:'third',label:'Third button size',hint:'0 = off. Your own mug or flask.',type:'num',min:0,get:()=>state.water?waterToUnit(state.water.third):'',set:v=>{const n=parseFloat(v);if(n>=0&&n<5000)wSet('third',n?waterFromUnit(n):0)}},
  {h:'Your day'},
  {key:'start',label:'Start drinking',type:'time',get:()=>state.water?state.water.start:'07:00',set:v=>{if(v)wSet('start',v)}},
  {key:'end',label:'Aim to finish by',type:'time',get:()=>state.water?state.water.end:'22:00',set:v=>{if(v)wSet('end',v)}},
  {h:'Plan and reminders'},
  {key:'match',label:'Match drinks to my plan',hint:'A button press ticks the open planned drink closest to that time',type:'bool',get:()=>!!(state.water&&state.water.match),set:v=>wSet('match',!!v)},
  {key:'rem',label:'Reminders',hint:'A banner on the card when a planned drink is due',type:'bool',get:()=>!!(state.water&&state.water.rem),set:v=>wSet('rem',!!v)},
  {key:'notif',label:'Browser notifications',hint:'Only while the Hub is open in a tab. Not a phone push.',type:'bool',get:()=>!!(state.water&&state.water.notif),
    set:async v=>{if(!v){wSet('notif',false);return}if(!window.Notification){toast('This browser has no notifications');wSet('notif',false);return}
      const p=await Notification.requestPermission();wSet('notif',p==='granted');if(p!=='granted')toast('Notifications were blocked')}},
  {key:'snooze',label:'Snooze for (minutes)',type:'num',min:1,get:()=>state.water?state.water.snooze:10,set:v=>wSet('snooze',Math.max(1,Math.min(120,parseInt(v)||10)))},
  {key:'every',label:'Auto-plan every (hours)',type:'num',min:1,get:()=>state.water?state.water.every:2,set:v=>wSet('every',Math.max(1,Math.min(12,parseInt(v)||2)))},
  {key:'repeat',label:'Repeat the plan every day',type:'bool',get:()=>!!(state.water&&state.water.repeat),set:v=>{wSet('repeat',!!v);if(v)waterPlanChanged()}},
  {h:'What to show'},
  {key:'pace',label:'Pace line',hint:'"On pace" or "600 ml behind"',type:'bool',def:true},
  {key:'plan',label:'Plan for the day',type:'bool',def:true},
  {key:'week',label:'30-day chart',type:'bool',def:true},
  {key:'pat',label:'When you drink',hint:'The pattern Gym insights reads',type:'bool',def:true},
  {key:'streak',label:'Streak',type:'bool',def:true},
  {key:'anim',label:'Drinking animation',type:'bool',def:true}
];
function waterResetData(){const w=state.water;if(!w)return;Object.assign(w,WATER_BASE);w.goal=wDefGoal();saveWater()}

let schedLog={key:null,map:{},t:0},schedShowDone=false,schedShowPast=false;
let schedX={key:null,links:{},steps:{},diet:null,t:0};
const dietRef=()=>db.collection('users').doc(state.user.uid).collection('apps').doc('nourish-diet-v2').collection('data').doc('state');
async function schedLoadLog(force,S){
  const k=state.profile+'|'+today();
  if(schedLog.key!==k)schedLog={key:k,map:{},t:0};
  if(schedX.key!==k)schedX={key:k,links:{},steps:{},diet:null,t:0};
  if(!force&&Date.now()-schedLog.t<15000)return false;
  schedLog.t=Date.now();
  const [m,links,steps,diet,sstart]=await Promise.all([
    readJson(profileRef('schedule-profiles','templateLog'),null),
    (!S||S.skin)?readJson(profileRef('skin-profiles','blockLinks'),null):null,
    (!S||S.skin)?readJson(profileRef('skin-profiles','stepLog'),null):null,
    (!S||S.diet)?readJson(dietRef(),null):null,
    (!S||S.skin)?profileRef('skin-profiles','programStart').get().then(s=>(s.exists&&s.data().startDate)||null).catch(()=>undefined):undefined]);
  let changed=false;if(sstart!==undefined&&window.SkinPlan&&window.SkinPlan.setStart(sstart))changed=true;const set=(cur,v)=>{if(v&&typeof v==='object'&&!Array.isArray(v)&&JSON.stringify(v)!==JSON.stringify(cur))changed=true;return(v&&typeof v==='object'&&!Array.isArray(v))?v:cur};
  schedLog.map=set(schedLog.map,m);schedX.links=set(schedX.links,links);schedX.steps=set(schedX.steps,steps);
  if(diet&&Array.isArray(diet.meals)){if(JSON.stringify(diet)!==JSON.stringify(schedX.diet))changed=true;schedX.diet=diet}
  return changed;
}
function schedLinkedTasks(b,dn){
  const sbOf=t=>Array.isArray(t.scheduleBlocks)?t.scheduleBlocks:(t.scheduleBlock&&t.scheduleBlock.label?[{wd:t.scheduleBlock.weekday,label:t.scheduleBlock.label}]:[]);
  return (state.personalTasks||[]).map(t=>Object.assign({_shared:false},t)).concat((state.sharedTasks||[]).map(t=>Object.assign({_shared:true},t)))
    .filter(t=>!t.done&&sbOf(t).some(x=>x.wd===dn&&x.label===b.t));
}
function schedLinkedChores(b){            // same rule as Schedule's choresLinkedToBlock()
  const act=String(b.t||'').toLowerCase();
  return (state.chores||[]).filter(c=>{
    if(c.active===false||!c.scheduleSync||c.scheduleSync.profile!==state.profile)return false;
    const kws=(Array.isArray(c.scheduleSync.keyword)?c.scheduleSync.keyword:[c.scheduleSync.keyword]).map(k=>String(k||'').toLowerCase());
    return kws.some(k=>k&&act.indexOf(k)!==-1);
  });
}
function schedSkinFor(b,dn,date){
  if(!window.SkinPlan)return[];
  return window.SkinPlan.sectionsFor(state.profile,date).filter(sec=>{const a=schedX.links[sec.key];return Array.isArray(a)&&a.some(l=>l.wd===dn&&l.label===b.t)})
    .map(sec=>({key:sec.key,label:sec.label,steps:window.SkinPlan.details(state.profile,date,sec.key).map((st,i)=>({text:st.text,k:date+':'+sec.key+':'+i,done:!!schedX.steps[date+':'+sec.key+':'+i]}))})).filter(sec=>sec.steps.length);
}
function schedMealsFor(b,dn,date){
  const D=schedX.diet;if(!D||!Array.isArray(D.meals))return[];
  const pid=state.profile==='Bhargav'?'bhargav':'anusha';
  return D.meals.filter(m=>m.profileId===pid&&Array.isArray(m.scheduleBlocks)&&m.scheduleBlocks.some(x=>x.wd===dn&&x.label===b.t)).map(m=>({
    name:m.name||m.slot||'Meal',entries:(D.diary||[]).filter(e=>e.date===date&&e.profileId===pid&&e.mealId===m.id).map(e=>({id:e.id,name:e.name||m.name||m.slot||'Meal',eaten:e.status==='eaten'}))}));
}
function schedBuild(S){
  const date=today(),dn=DAYS[new Date().getDay()];
  const blocks=dayBlocksFor(date).map((x,i)=>({idx:i,t:x.activity||x.title||'Scheduled block',start:x.start||'',end:x.end||''})).filter(b=>b.start).sort((a,b)=>minutes(a.start)-minutes(b.start));
  blocks.forEach((b,i)=>{
    b.m=minutes(b.start);let e=b.end?minutes(b.end):(blocks[i+1]?minutes(blocks[i+1].start):b.m+30);
    if(e<=b.m)e+=1440;                        // runs past midnight (Sleep)
    b.e=e;b.k='block';
    b.linkedTasks=schedLinkedTasks(b,dn);b.linkedChores=schedLinkedChores(b);
    b.skin=S.skin?schedSkinFor(b,dn,date):[];b.meals=S.diet?schedMealsFor(b,dn,date):[];
  });
  const linkedIds=new Set();blocks.forEach(b=>b.linkedTasks.forEach(t=>linkedIds.add(t.id)));
  const extras=[];
  if(S.ev)(state.events||[]).filter(e=>eventOccursOnHub(e,date)).forEach(e=>extras.push({k:'event',t:e.title||'Event',time:e.time||'',m:e.time?minutes(e.time):null}));
  if(S.task)dueTasks().filter(t=>!linkedIds.has(t.id)).forEach(t=>extras.push({k:'task',id:t.id,t:t.title,time:t.dueTime||'',m:t.dueTime?minutes(t.dueTime):null,shared:!!t._shared}));
  return {blocks,extras};
}
function renderScheduleWidget(el,w){
  if(!el)return;
  const S=wsAll(w,WIDGET_TYPES.schedule),{blocks,extras}=schedBuild(S);
  let nowM=new Date().getHours()*60+new Date().getMinutes();
  if(nowM<270)nowM+=1440;                      // before 4:30am still belongs to the day's last block, like the Schedule app
  const date=today();
  const fm=v=>{if(!v)return'';return S.fmt==='24'?v:time12(v)};
  const doneB=b=>!!schedLog.map[date+':'+b.idx];
    if(!blocks.length&&!extras.length){el.classList.remove('sc-on');el.innerHTML='<div class="empty-state"><strong>No scheduled blocks</strong>Your day is open. Add plans from the schedule.</div><a class="widget-card-link" href="apps/schedule.html" data-profile-link>Open Schedule <i data-lucide="arrow-up-right"></i></a>';updateProfileLinks();if(window.lucide)lucide.createIcons();return}
  el.classList.add('sc-on');
  const timed=extras.filter(x=>x.m!=null),untimed=extras.filter(x=>x.m==null);
  const inBlock=(b,x)=>x.m>=b.m&&x.m<b.e;
  const owner=x=>blocks.find(b=>inBlock(b,x)); // each item belongs to the first block that holds it
  const kidsOf=b=>S.nest?timed.filter(x=>owner(x)===b):[];
  const gaps=S.nest?timed.filter(x=>!owner(x)):timed;
  const rows=blocks.map(b=>b).concat(gaps.map(x=>Object.assign({gap:true},x))).sort((a,b)=>a.m-b.m);
  let cur=null;blocks.forEach(b=>{if(b.m<=nowM)cur=b});   // the last block that has started (same as the Schedule app)
  const nDone=blocks.filter(doneB).length,pct=blocks.length?Math.round(nDone/blocks.length*100):0;
  const hide=S.done==='hide',hiddenN=hide?blocks.filter(doneB).length:0;
  const left=cur?cur.e-nowM:0;
  const leftTxt=left>=60?Math.floor(left/60)+'h '+(left%60)+'m':left+' min';
  const taskRow=x=>'<div class="sc-u"><button type="button" class="sc-sq" data-sc-task="'+esc(x.id)+'" aria-label="Complete '+esc(x.t)+'"></button><span class="sc-ut">'+esc(x.t)+(x.time?'<span class="sc-ts">'+esc(fm(x.time))+'</span>':'')+(x.shared||x._shared?'<span class="sc-tag">shared</span>':'')+'</span></div>';
  const linkedTaskRow=x=>taskRow({id:x.id,t:x.title,time:'',shared:x._shared});
  const choreRow=c=>{const d=c.lastCompleted===date;return '<div class="sc-u'+(d?' sc-udone':'')+'"><button type="button" class="sc-sq'+(d?' on':'')+'" data-sc-chore="'+esc(c.id)+'" aria-label="Mark '+esc(c.name)+' done">'+(d?'✓':'')+'</button><span class="sc-ut">'+esc(c.name)+'<span class="sc-tag">chore</span></span></div>'};
  const eventRow=x=>'<div class="sc-u sc-ev"><span class="sc-ico"></span><span class="sc-ut">'+esc(x.t)+(x.time?'<span class="sc-ts">'+esc(fm(x.time))+'</span>':'')+'<span class="sc-tag">event</span></span></div>';
  const uRow=x=>x.k==='event'?eventRow(x):taskRow(x);
  const skinRows=b=>b.skin.map(sec=>{const n=sec.steps.filter(z=>z.done).length;return '<div class="sc-sub"><span class="sc-subh">'+esc(sec.label)+' · '+n+'/'+sec.steps.length+'<span class="sc-tag">skin</span></span>'+sec.steps.map(z=>'<div class="sc-u'+(z.done?' sc-udone':'')+'"><button type="button" class="sc-sq'+(z.done?' on':'')+'" data-sc-skin="'+esc(z.k)+'" aria-label="'+(z.done?'Untick ':'Tick ')+esc(z.text)+'">'+(z.done?'✓':'')+'</button><span class="sc-ut">'+esc(z.text)+'</span></div>').join('')+'</div>'}).join('');
  const mealRows=b=>b.meals.map(m=>m.entries.length?m.entries.map(e=>'<div class="sc-u'+(e.eaten?' sc-udone':'')+'"><button type="button" class="sc-sq'+(e.eaten?' on':'')+'" data-sc-meal="'+esc(e.id)+'" aria-label="'+(e.eaten?'Mark not eaten: ':'Mark eaten: ')+esc(e.name)+'">'+(e.eaten?'✓':'')+'</button><span class="sc-ut">'+esc(e.name)+'<span class="sc-tag">meal</span></span></div>').join(''):'<div class="sc-u sc-ev"><span class="sc-ico"></span><span class="sc-ut">'+esc(m.name)+'<span class="sc-tag">meal · not logged yet</span></span></div>').join('');
  const hidePast=S.past==='hide';
  const isPastB=b=>b.e<=nowM&&!(cur&&cur.idx===b.idx);
  const pastN=hidePast?blocks.filter(b=>isPastB(b)&&!(hide&&doneB(b)&&!schedShowDone)).length+rows.filter(r=>r.gap&&r.m<nowM).length:0;
  let html='';
  if(pastN||(hidePast&&schedShowPast))html+='<button type="button" class="sc-showdone sc-showpast" data-sc-showpast>'+(schedShowPast?'Hide earlier blocks':pastN+' earlier today · Show')+'</button>';
  let progH='';
  if(S.bar&&blocks.length)progH+='<div class="sc-prog"><div class="sc-pt"><span><b>'+nDone+' / '+blocks.length+'</b> blocks done</span><span>'+pct+'%</span></div><div class="sc-bar"><i style="width:'+pct+'%"></i></div></div>';
  html+='<div class="sc-tl">';
  rows.forEach(x=>{
    if(x.gap){
      if(hidePast&&x.m<nowM&&!schedShowPast)return;
      html+='<div class="sc-row"><span class="sc-tm">'+esc(fm(x.time)).replace(' ','<br>')+'</span><span class="sc-rail">'+(x.k==='task'?'<button type="button" class="sc-sq sc-sqg" data-sc-task="'+esc(x.id)+'" aria-label="Complete '+esc(x.t)+'"></button>':'<span class="sc-c sc-mini"></span>')+'</span><span class="sc-bd"><strong class="sc-plain">'+esc(x.t)+'<span class="sc-tag">'+x.k+(x.shared?' · shared':'')+'</span></strong></span></div>';
      return;
    }
    const isDone=doneB(x);if(hide&&isDone&&!schedShowDone)return;
    if(hidePast&&isPastB(x)&&!schedShowPast)return;
    const isNow=!!cur&&cur.idx===x.idx&&!isDone,miss=S.miss&&!isDone&&!isNow&&x.e<nowM,kids=kidsOf(x);
    const under=x.linkedChores.map(choreRow).join('')+x.linkedTasks.map(linkedTaskRow).join('')+mealRows(x)+skinRows(x)+kids.map(uRow).join('');
    html+='<div class="sc-row'+(isNow?' sc-cur':'')+(isDone?' sc-done':'')+'"><span class="sc-tm">'+esc(fm(x.start)).replace(' ','<br>')+'</span><span class="sc-rail"><button type="button" class="sc-c" data-sc-block="'+x.idx+'" aria-label="'+(isDone?'Untick ':'Tick ')+esc(x.t)+'">'+(isDone?'✓':'')+'</button></span>'+
      '<span class="sc-bd"><strong>'+esc(x.t)+(isNow?'<span class="sc-now">Now</span>':'')+(miss?'<span class="sc-miss" title="Not ticked"></span>':'')+'</strong><small>'+esc(fm(x.start))+(x.end?' – '+esc(fm(x.end)):'')+(isNow&&S.count&&left>0?' · ends in '+leftTxt:'')+'</small>'+
      (under?'<div class="sc-under">'+under+'</div>':'')+'</span></div>';
  });
  html+='</div>';
  if(hiddenN)html+='<button type="button" class="sc-showdone" data-sc-showdone>'+(schedShowDone?'Hide done':'Show done ('+hiddenN+')')+'</button>';
  let anyH='',nxH='';
  if(S.anyt&&untimed.length)anyH+='<div class="sc-any"><h5>Anytime today</h5>'+untimed.map(uRow).join('')+'</div>';
  const nx=blocks.find(b=>b.m>nowM&&!doneB(b));
  if(S.next&&nx)nxH+='<div class="sc-next">Up next: <b>'+esc(nx.t)+'</b> at '+esc(fm(nx.start))+'</div>';
  el.innerHTML=BKW('progress',progH)+BKW('timeline',html)+BKW('anytime',anyH)+BKW('next',nxH);
  el.onclick=e=>{
    const b=e.target.closest('[data-sc-block]');if(b){schedToggleBlock(Number(b.dataset.scBlock),w);return}
    const t=e.target.closest('[data-sc-task]');if(t){t.classList.add('on');t.textContent='✓';setTimeout(()=>completeTask(t.dataset.scTask),180);return}
    const c=e.target.closest('[data-sc-chore]');if(c){c.classList.add('on');c.textContent='✓';completeChoreFromWidget(c.dataset.scChore,el,()=>renderScheduleWidget(el,w));return}
    const sk=e.target.closest('[data-sc-skin]');if(sk){schedToggleSkin(sk.dataset.scSkin,w);return}
    const ml=e.target.closest('[data-sc-meal]');if(ml){schedToggleMeal(ml.dataset.scMeal,w);return}
    if(e.target.closest('[data-sc-showpast]')){schedShowPast=!schedShowPast;renderScheduleWidget(el,w);return}
    if(e.target.closest('[data-sc-showdone]')){schedShowDone=!schedShowDone;renderScheduleWidget(el,w)}
  };
}
const schedRedraw=()=>{const body=document.querySelector('.widget-card[data-widget-type="schedule"] .widget-card-body');if(body)renderScheduleWidget(body,state.widgets.find(x=>x.type==='schedule'))};
async function schedToggleSkin(key,w){
  const ref=profileRef('skin-profiles','stepLog'),was=!!schedX.steps[key];
  if(was)delete schedX.steps[key];else schedX.steps[key]=true;schedRedraw();
  try{
    const latest=await readJson(ref,{});const m=(latest&&typeof latest==='object'&&!Array.isArray(latest))?latest:{};
    if(was)delete m[key];else m[key]=true;
    await ref.set({json:JSON.stringify(m),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    schedX.steps=m;schedX.t=Date.now();
    toast(was?'Unticked a skin step':'Ticked a skin step','Undo',()=>schedToggleSkin(key,w));
  }catch(e){if(was)schedX.steps[key]=true;else delete schedX.steps[key];schedRedraw();toast('Could not save that tick')}
}
async function schedToggleMeal(id,w){
  const ref=dietRef(),flip=(D,to)=>{const e=(D.diary||[]).find(x=>x.id===id);if(!e)return null;const was=e.status==='eaten';e.status=to===undefined?(was?'planned':'eaten'):to;return was};
  const local=schedX.diet;let was=null;if(local)was=flip(local);schedRedraw();
  try{
    const D=await readJson(ref,null);if(!D||!Array.isArray(D.diary))throw new Error('no diet');
    const e=D.diary.find(x=>x.id===id);if(!e)throw new Error('gone');
    const wasEaten=e.status==='eaten';e.status=wasEaten?'planned':'eaten';
    await ref.set({json:JSON.stringify(D)});
    schedX.diet=D;schedX.t=Date.now();
    toast((wasEaten?'Unmarked ':'Marked eaten: ')+(e.name||'meal'),'Undo',()=>schedToggleMeal(id,w));
  }catch(e){if(local&&was!==null)flip(local,was?'eaten':'planned');schedRedraw();toast('Could not save that')}
}
async function schedToggleBlock(idx,w){
  const date=today(),key=date+':'+idx,ref=profileRef('schedule-profiles','templateLog');
  const was=!!schedLog.map[key],tpl=dayBlocksFor(today()),name=(tpl[idx]&&(tpl[idx].activity||tpl[idx].title))||'block';
  const redraw=()=>{const body=document.querySelector('.widget-card[data-widget-type="schedule"] .widget-card-body');if(body)renderScheduleWidget(body,state.widgets.find(x=>x.type==='schedule'))};
  if(was)delete schedLog.map[key];else schedLog.map[key]=true;redraw();
  try{
    const latest=await readJson(ref,{});const m=(latest&&typeof latest==='object'&&!Array.isArray(latest))?latest:{};
    if(was)delete m[key];else m[key]=true;
    await ref.set({json:JSON.stringify(m),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    schedLog.map=m;schedLog.t=Date.now();
    if(state.insights&&state.insights.tplLog){if(was)delete state.insights.tplLog[key];else state.insights.tplLog[key]=true}
    toast((was?'Unticked ':'Ticked ')+name,'Undo',()=>schedToggleBlock(idx,w));
  }catch(e){if(was)schedLog.map[key]=true;else delete schedLog.map[key];redraw();toast('Could not save that tick')}
}
/* =====================================================================
   LINK ENGINE — apps tick each other's Schedule blocks automatically.
   Each rule watches one app and ticks the Schedule block it belongs to:
     gym     a workout (any logged set or cardio) -> blocks named Gym / Workout…
     meals   every meal linked to a block is eaten  -> that block
     skin    every skin step linked to a block done -> that block
     chores  every chore linked to a block done     -> that block
     tasks   every task linked to a block done      -> that block
     focus   enough focus minutes in Clock          -> blocks named Focus / Study…
   A block with several things under it is ticked only when ALL of them are done.
   Settings live at hub-profiles/{P}/data/linkState with a ledger of what the
   engine ticked ("auto") and what you unticked yourself ("off"): the engine
   never overrides your own untick, and never unticks something you ticked.
   ===================================================================== */
const LINK_GROUPS=[{id:'blocks',label:'Schedule blocks',hint:'Other apps tick the matching block on your Schedule.'},{id:'tasks',label:'Tasks and reminders',hint:'The engine adds tasks to your To-do list, with all the details, and reminds you.'},{id:'money',label:'Money and stock',hint:'Budget and Grocery stay in step with each other.'}];
const LINK_RULES=[
  {id:'gym',g:'blocks',label:'Workout logged',to:'Gym block',desc:'Log any set or cardio in Gym and the Gym / Workout block on your Schedule is ticked.',p:[{k:'kw',l:'Block names containing',t:'text',d:'gym,workout,training,lift,cardio'}]},
  {id:'meals',g:'blocks',label:'Meals eaten',to:'Meal block',desc:'When every meal linked to a block has been marked eaten in Diet, the block is ticked.'},
  {id:'skin',g:'blocks',label:'Skin steps done',to:'Skin block',desc:'When every skin step linked to a block is done, the block is ticked.'},
  {id:'chores',g:'blocks',label:'Chores done',to:'Chore block',desc:'When every chore linked to a block is done today, the block is ticked.'},
  {id:'tasks',g:'blocks',label:'Tasks done',to:'Task block',desc:'When every to-do linked to a block is done, the block is ticked.'},
  {id:'focus',g:'blocks',label:'Focus time',to:'Focus block',desc:'Reach your focus minutes in Clock and the Focus / Study block is ticked.',p:[{k:'kw',l:'Block names containing',t:'text',d:'focus,deep work,study'},{k:'min',l:'Minutes',t:'num',d:25,lo:1,hi:600}]},
  {id:'bills',g:'tasks',label:'Bills due',to:'Task + reminder',desc:'A "Pay …" task appears a few days before each Budget bill is due, with the amount and category. Paid in Budget? The task ticks itself.',p:[{k:'lead',l:'Days before',t:'num',d:3,lo:0,hi:14},{k:'time',l:'Reminder at',t:'time',d:'09:00'}]},
  {id:'billpay',g:'tasks',label:'Bill task ticked',to:'Paid in Budget',desc:'Tick a bill task and the bill is marked paid in Budget and the expense is logged (with Undo).'},
  {id:'grocery',g:'tasks',label:'Grocery trip',to:'Task + reminder',desc:'The next trip becomes a task with the items left, grouped by store. Finish the trip in Grocery and the task ticks itself.',p:[{k:'lead',l:'Days before',t:'num',d:1,lo:0,hi:7},{k:'time',l:'Reminder at',t:'time',d:'18:00'}]},
  {id:'birthdays',g:'tasks',label:'Birthdays and anniversaries',to:'Tasks + reminders',desc:'Close (C): a "Buy a gift" task a week ahead. Everyone: a reminder the night before, then a "Wish …" task and reminder on the day. Set C or O in Calendar.',p:[{k:'gift',l:'Gift task, days ahead',t:'num',d:7,lo:1,hi:30},{k:'eve',l:'Night-before reminder',t:'time',d:'21:00'},{k:'day',l:'Day-of reminder',t:'time',d:'08:00'}]},
  {id:'tripexp',g:'money',label:'Grocery trip finished',to:'Expense in Budget',desc:'When you complete a trip in Grocery, the amount spent is logged in Budget (shared, split half). Only trips finished from now on.',p:[{k:'scope',l:'Log in',t:'sel',d:'shared',o:[['shared','Shared money'],['personal','My money']]}]},
  {id:'restock',g:'money',label:'Running low',to:'Restock task',desc:'Pantry items that are low or finished are collected into one "Restock" task.'},
  {id:'mealrem',g:'tasks',label:'Meal reminders',to:'Reminders',desc:'"Lunch in 15 minutes" before each planned meal, and a nudge if it is still not eaten after a while. Today only; stops once you eat or skip it.',p:[{k:'lead',l:'Minutes before',t:'num',d:15,lo:0,hi:120},{k:'late',l:'Nudge if not eaten after (min)',t:'num',d:45,lo:10,hi:240}]},
  {id:'skinrem',g:'tasks',label:'Skin routine reminders',to:'Reminders',desc:'A reminder for the morning routine and one for the night routine (it names tonight\'s treatment), only while that routine is not done.',p:[{k:'am',l:'Morning at',t:'time',d:'07:00'},{k:'pm',l:'Night at',t:'time',d:'21:30'}]},
  {id:'skinstock',g:'money',label:'Skin product running low',to:'Reminder',desc:'A reminder when a skin product drops to 15% or less, so you can send it to Grocery.',p:[{k:'time',l:'Remind at',t:'time',d:'09:00'}]},
  {id:'listrem',g:'tasks',label:'Checklist due reminders',to:'Reminders',desc:'A reminder when a checklist is due and still has items left for you (items assigned to you, or to nobody). Tap it to open the list.',p:[{k:'time',l:'Remind at',t:'time',d:'09:00'},{k:'lead',l:'Days before (0 = that morning)',t:'num',d:0,lo:0,hi:7}]},
  {id:'nudges',g:'money',label:'Nudges',to:'What still needs you',desc:'Overdue bills always, and in the evening any task still open today and missed water drinks.',p:[{k:'time',l:'Evening check at',t:'time',d:'20:00'}]}
];
const LINK_BASE={v:1,enabled:true,rules:{},auto:{},off:{},log:[],last:0,made:{},billsPaid:{},trips:{},tripSince:null};
let linkS=null,linkBusy=false,linkTimer=null,linkKey=null;
const linkRef=()=>profileRef('hub-profiles','linkState');
function linkRule(id){const d=LINK_RULES.find(r=>r.id===id)||{},c=(linkS&&linkS.rules[id])||{},o={on:c.on!==false};(d.p||[]).forEach(q=>{o[q.k]=c[q.k]!=null?c[q.k]:q.d});return o}
async function linkEnsure(){
  const k=state.profile;if(linkS&&linkKey===k)return linkS;
  const v=await readJson(linkRef(),null);
  linkS=Object.assign(JSON.parse(JSON.stringify(LINK_BASE)),(v&&typeof v==='object'&&!Array.isArray(v))?v:{});linkKey=k;
  ['rules','auto','off','made','billsPaid','trips'].forEach(f=>{if(!linkS[f]||typeof linkS[f]!=='object'||Array.isArray(linkS[f]))linkS[f]={}});if(!Array.isArray(linkS.log))linkS.log=[];
  return linkS;
}
async function linkSave(){
  if(!linkS)return;
  const cut=new Date(Date.now()-14*864e5),ck=cut.getFullYear()+'-'+String(cut.getMonth()+1).padStart(2,'0')+'-'+String(cut.getDate()).padStart(2,'0');
  ['auto','off'].forEach(f=>Object.keys(linkS[f]).forEach(k=>{if(k.slice(0,10)<ck)delete linkS[f][k]}));
  const cut2=new Date(Date.now()-120*864e5),ck2=cut2.getFullYear()+'-'+String(cut2.getMonth()+1).padStart(2,'0')+'-'+String(cut2.getDate()).padStart(2,'0');
  ['made','billsPaid'].forEach(f=>Object.keys(linkS[f]).forEach(k=>{if(String(linkS[f][k])<ck2)delete linkS[f][k]}));
  linkS.log=linkS.log.slice(-80);
  try{await linkRef().set({json:JSON.stringify(linkS),updatedAt:firebase.firestore.FieldValue.serverTimestamp()})}catch(e){console.warn('linkState save failed',e)}
}
async function linkGymDone(date){
  try{
    const col=db.collection('users').doc(state.user.uid).collection('profiles').doc(state.profile.toLowerCase()),fp=firebase.firestore.FieldPath.documentId();
    const [l,c]=await Promise.all([col.collection('workoutLogs').where(fp,'>=',date+':').where(fp,'<',date+';').get().catch(()=>null),col.collection('cardioLogs').doc(date).get().catch(()=>null)]);
    let n=0;if(l)l.forEach(d=>{const x=d.data()||{};(x.exercises||[]).forEach(e=>{n+=(e.sets||[]).length})});
    if(c&&c.exists){const x=c.data()||{};n+=Array.isArray(x.entries)?x.entries.length:(x.machine?1:0)}
    return n>0;
  }catch(e){return false}
}
async function linkFocusMin(date){
  try{
    const snap=await db.collection('users').doc(state.user.uid).collection('clock-profiles').doc(state.profile).collection('data').doc('focusSessions').get();
    const arr=snap.exists?safeJson(snap.data().json,[]):[],ds=new Date(date+'T12:00:00').toDateString();
    return arr.filter(s=>new Date(s.date).toDateString()===ds).reduce((s,x)=>s+(x.minutes||0),0);
  }catch(e){return 0}
}
function linkKw(s){return String(s||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean)}
function linkTasksFor(b,dn){            // every task linked to the block, done or not
  const sbOf=t=>Array.isArray(t.scheduleBlocks)?t.scheduleBlocks:(t.scheduleBlock&&t.scheduleBlock.label?[{wd:t.scheduleBlock.weekday,label:t.scheduleBlock.label}]:[]);
  return (state.personalTasks||[]).concat(state.sharedTasks||[]).filter(t=>sbOf(t).some(x=>x.wd===dn&&x.label===b.t));
}
/* For one block: which rules apply, and is each satisfied?  -> [{id, ok, why}] */
function linkChecks(b,dn,date,facts){
  const out=[],act=String(b.t||'').toLowerCase();
  const R=id=>linkRule(id);
  if(R('gym').on&&linkKw(R('gym').kw).some(k=>act.indexOf(k)!==-1))out.push({id:'gym',ok:facts.gym,why:'a workout is logged'});
  if(R('focus').on&&linkKw(R('focus').kw).some(k=>act.indexOf(k)!==-1))out.push({id:'focus',ok:facts.focus>=Math.max(1,R('focus').min),why:facts.focus+' focus min'});
  if(R('meals').on){const ms=schedMealsFor(b,dn,date);if(ms.length)out.push({id:'meals',ok:ms.every(m=>m.entries.length&&m.entries.every(e=>e.eaten)),why:'all meals eaten'})}
  if(R('skin').on){const ss=schedSkinFor(b,dn,date);if(ss.length)out.push({id:'skin',ok:ss.every(s=>s.steps.every(z=>z.done)),why:'all skin steps done'})}
  if(R('chores').on){const cs=schedLinkedChores(b);if(cs.length)out.push({id:'chores',ok:cs.every(c=>c.lastCompleted===date),why:'all chores done'})}
  if(R('tasks').on){const ts=linkTasksFor(b,dn);if(ts.length)out.push({id:'tasks',ok:ts.every(t=>t.done),why:'all linked tasks done'})}
  return out;
}
/* =====================================================================
   LINK ENGINE, part 2 — automatic tasks, reminders and money links.
   Every automatic task carries  auto:{key,src}  so it is created once
   (linkS.made remembers keys, even if you delete the task). Shared things
   (shared bills, grocery trips, gifts) go to the Shared list so there is
   only one copy; personal things go to your own list.
     bills    Budget bills due soon       -> "Pay <bill>" task (+ reminder)
     billpay  ticking that task           -> bill marked paid + expense logged
              (and a bill paid in Budget  -> task ticked)
     grocery  next trip                   -> "Grocery trip" task with the list
              (trip completed in Grocery  -> task ticked)
     birthdays  Calendar reminders        -> C: gift task a week ahead; both:
              night-before reminder, "Wish <name>" task and morning reminder
     tripexp  completed grocery trip      -> expense in Budget
     restock  low / finished pantry items -> one "Restock" task
     nudges   evening check of what is still open
   Reminders are written to hub-profiles/{P}/data/reminders; the Hub shows
   them when they come due (a push service can read the same list later).
   ===================================================================== */
const P2=n=>String(n).padStart(2,'0');
const dISO=d=>d.getFullYear()+'-'+P2(d.getMonth()+1)+'-'+P2(d.getDate());
const dAdd=(iso,n)=>{const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+n);return dISO(d)};
const dDiff=(a,b)=>Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/864e5);
const atMs=(iso,hhmm)=>{const[h,m]=String(hhmm||'09:00').split(':').map(Number);const d=new Date(iso+'T00:00:00');d.setHours(h||0,m||0,0,0);return d.getTime()};
const budgetRef=(scope,key)=>scope==='shared'?db.collection('users').doc(state.user.uid).collection('budget-shared').doc(key):db.collection('users').doc(state.user.uid).collection('budget-profiles').doc(state.profile).collection('data').doc(key);
const groceryRef=()=>appRef('grocery-v4','modernState');
const remindersRef=()=>profileRef('hub-profiles','reminders');
function linkHash(s){let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))>>>0;return h.toString(36)}
const linkMoney=n=>'$'+(Number(n)||0).toFixed(2);

/* A read that says whether it worked. The engine only ever writes back something it read successfully,
   so a failed or half-loaded read can never turn your task list, bills or schedule ticks into an empty list. */
async function readSafe(ref,fallback){
  try{
    const snap=await ref.get();if(!snap.exists)return{ok:true,exists:false,val:fallback};
    const raw=snap.data().json;if(raw==null)return{ok:true,exists:false,val:fallback};
    return{ok:true,exists:true,val:typeof raw==='string'?JSON.parse(raw):raw};
  }catch(e){return{ok:false,exists:false,val:fallback}}
}
/* ---- tasks: create once, keep fields fresh, tick from the other side ---- */
async function linkApplyTasks(specs){
  if(!specs.length)return 0;
  let changed=0;
  for(const shared of [false,true]){
    const mine=specs.filter(s=>!!s.shared===shared);if(!mine.length)continue;
    const ref=shared?sharedTodoRef():profileRef('todo-profiles','tasks');
    const rd=await readSafe(ref,[]);if(!rd.ok||!Array.isArray(rd.val))continue;const arr=rd.val;let dirty=false;
    mine.forEach(s=>{
      const t=arr.find(x=>x.auto&&x.auto.key===s.key);
      if(!t){
        if(s.complete||linkS.made[s.key])return;
        arr.push({id:'task-auto-'+linkHash(s.key),title:s.title,done:false,priority:s.priority||0,startDate:s.startDate||today(),due:s.due||null,dueTime:s.dueTime||null,repeat:'none',notes:s.notes||'',link:s.link||'',tags:s.tags||[],subtasks:[],listId:shared?'shared':'personal',createdBy:state.profile,order:Date.now(),createdAt:new Date().toISOString(),auto:Object.assign({key:s.key,src:s.src},s.meta||{})});
        linkS.made[s.key]=today();dirty=true;changed++;return;
      }
      if(s.complete&&!t.done){t.done=true;t.completedOn=today();dirty=true;changed++;return}
      if(!t.done&&!s.complete){ // keep an untouched automatic task current (amount changed, items bought…)
        ['title','notes'].forEach(f=>{if(s[f]!==undefined&&s[f]!==null&&t[f]!==s[f]){t[f]=s[f];dirty=true}});
      }
    });
    if(dirty){
      await ref.set({json:JSON.stringify(arr),updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
      if(shared)state.sharedTasks=arr;else state.personalTasks=arr;
    }
  }
  return changed;
}
async function linkAllTasks(){
  const [a,b]=await Promise.all([readSafe(profileRef('todo-profiles','tasks'),[]),readSafe(sharedTodoRef(),[])]);
  if(a.ok&&a.exists&&Array.isArray(a.val))state.personalTasks=a.val;if(b.ok&&b.exists&&Array.isArray(b.val))state.sharedTasks=b.val;
  return(state.personalTasks||[]).concat(state.sharedTasks||[]);
}

/* ---- Budget ---- */
const monthOf=iso=>iso.slice(0,7);
function linkBillDue(b,date){const last=new Date(+date.slice(0,4),+date.slice(5,7),0).getDate(),day=Math.min(Number(b.dueDay)||1,last);return date.slice(0,7)+'-'+P2(day)}
async function linkBudget(){
  const [pb,sb,pc,sc]=await Promise.all([readJson(budgetRef('personal','bills'),[]),readJson(budgetRef('shared','bills'),[]),readJson(budgetRef('personal','categories'),[]),readJson(budgetRef('shared','categories'),[])]);
  return{personal:Array.isArray(pb)?pb:[],shared:Array.isArray(sb)?sb:[],cats:{personal:Array.isArray(pc)?pc:[],shared:Array.isArray(sc)?sc:[]}};
}
async function linkPayBill(scope,id,month,auto){
  const bref=budgetRef(scope,'bills'),tref=budgetRef(scope,'transactions');
  const rb=await readSafe(bref,[]);if(!rb.ok||!Array.isArray(rb.val))return null;const bills=rb.val,b=bills.find(x=>x.id===id);
  if(!b||b.lastLoggedMonth===month)return null;
  const prev=b.lastLoggedMonth||null;
  const rt=await readSafe(tref,[]);if(!rt.ok||!Array.isArray(rt.val)){console.warn('could not read transactions; bill left unpaid');return null}const arr=rt.val;
  const shared=scope==='shared',amt=Number(b.amount)||0;
  const txn={id:'id-auto-'+Date.now()+'-'+linkHash(id+month),amount:amt,type:'expense',categoryId:b.categoryId||'',who:shared?state.profile:null,date:today(),note:b.name,createdAt:Date.now(),splitMethod:shared?'half':null,owedAmount:shared?Math.round(amt/2*100)/100:null,settled:shared?false:undefined,auto:'bill'};
  if(amt>0){arr.unshift(txn);await tref.set({json:JSON.stringify(arr)})}
  b.lastLoggedMonth=month;await bref.set({json:JSON.stringify(bills)});
  return{bill:b,prev,txnId:amt>0?txn.id:null,scope,id,month};
}
async function linkUnpayBill(r){
  const bref=budgetRef(r.scope,'bills'),tref=budgetRef(r.scope,'transactions');
  const rb=await readSafe(bref,[]);if(!rb.ok||!Array.isArray(rb.val)){toast('Could not undo — try again');return}
  const b=rb.val.find(x=>x.id===r.id);
  if(b){b.lastLoggedMonth=r.prev;await bref.set({json:JSON.stringify(rb.val)})}
  if(r.txnId){const t=await readSafe(tref,[]);if(t.ok&&Array.isArray(t.val)){await tref.set({json:JSON.stringify(t.val.filter(x=>x.id!==r.txnId))})}}
  const tasks=await linkAllTasks(),key='bill:'+r.scope+':'+r.id+':'+r.month,t=tasks.find(x=>x.auto&&x.auto.key===key);
  if(t){t.done=false;t.completedOn=null;const shared=t.listId==='shared';await(shared?sharedTodoRef():profileRef('todo-profiles','tasks')).set({json:JSON.stringify(shared?state.sharedTasks:state.personalTasks)})}
  linkS.billsPaid=(linkS.billsPaid||{});delete linkS.billsPaid[key];linkS.off[key]=true;await linkSave();
  toast('Bill payment undone');
}

/* ---- gather what every rule needs, then build tasks / reminders ---- */
async function linkSyncTasks(manual){
  const date=today(),out={tasks:0,paid:0},specs=[],rem=[];
  const R=linkRule,add=(r)=>rem.push(r);
  const all=await linkAllTasks();
  // 1) bill tasks -> Budget (write-back), before anything else so the rest sees the result
  const bud=(R('bills').on||R('billpay').on)?await linkBudget():null;
  if(bud&&R('billpay').on){
    for(const t of all){
      if(!t.done||!t.auto||t.auto.src!=='bill'||linkS.billsPaid[t.auto.key])continue;
      if(t.completedOn&&t.completedOn<dAdd(date,-3))continue;       // old history: never pay it retroactively
      const bill=(bud[t.auto.scope]||[]).find(x=>x.id===t.auto.billId);
      if(!bill||bill.lastLoggedMonth===t.auto.month){linkS.billsPaid[t.auto.key]=date;continue}
      const r=await linkPayBill(t.auto.scope,t.auto.billId,t.auto.month,t.auto);
      if(r){linkS.billsPaid[t.auto.key]=date;out.paid++;linkS.log.push({t:Date.now(),r:'billpay',k:t.auto.key,l:'Paid '+r.bill.name+' ('+linkMoney(r.bill.amount)+')',a:1});
        if(!manual)toast('Marked '+r.bill.name+' paid in Budget','Undo',()=>linkUnpayBill(r));
        bill.lastLoggedMonth=t.auto.month}
    }
  }
  // 2) bills due -> tasks + reminders
  if(bud&&R('bills').on){
    const lead=Math.max(0,+R('bills').lead||0);
    ['personal','shared'].forEach(scope=>bud[scope].forEach(b=>{
      if(!b||!b.id||b.paused)return;
      const due=linkBillDue(b,date),month=monthOf(date),key='bill:'+scope+':'+b.id+':'+month,paid=b.lastLoggedMonth===month;
      const catName=((bud.cats[scope].find(c=>c.id===b.categoryId))||{}).name||'';
      if(paid){specs.push({key,shared:scope==='shared',complete:true,src:'bill'});return}
      if(date>=dAdd(due,-lead)){
        specs.push({key,src:'bill',shared:scope==='shared',title:'Pay '+b.name+' ('+linkMoney(b.amount)+')',due,dueTime:null,startDate:dAdd(due,-lead),priority:dDiff(date,due)<=0?1:0,tags:['bills'],
          notes:b.name+' · '+linkMoney(b.amount)+(catName?' · '+catName:'')+'\nDue '+due+(scope==='shared'?' · Shared bill':'')+'\nTick this task and the bill is marked paid in Budget with an expense logged.',
          link:'budget.html',meta:{scope,billId:b.id,month}});
      }
      if(date<=due)add({id:'bill:'+key+':due',at:atMs(dAdd(due,lead>0?-1:0),R('bills').time),title:'Bill due '+(due===date?'today':'on '+due.slice(5)),body:b.name+' · '+linkMoney(b.amount),src:'bills',link:'budget.html'});
    }));
  }
  // 3) grocery trip -> task (+ reminder); trip completed -> task ticked
  let gro=null;
  if(R('grocery').on||R('tripexp').on||R('restock').on){const raw=await readJson(groceryRef(),null);gro=raw&&typeof raw==='object'&&raw.startDate?raw:null}
  if(gro){
    const cur=Math.max(1,Math.floor(dDiff(gro.startDate,date)/7)+1);let w=cur;
    while(gro.weeks&&gro.weeks[w]&&gro.weeks[w].completed&&w<cur+60)w++;
    const wkStart=dAdd(gro.startDate,(w-1)*7),wk=(gro.weeks||{})[w],cyc=Math.floor((w-1)/8)+1,cw=((w-1)%8)+1,key='grocery:'+w;
    const prods=(gro.products||[]);const pn=id=>(prods.find(p=>p.id===id)||{}).name;
    const done=(gro.history||[]).some(h=>h.week===w)&&wk&&wk.completed;
    // earlier trips that finished while the task was still open
    (gro.history||[]).forEach(h=>{if(h.week!=null)specs.push({key:'grocery:'+h.week,complete:true,src:'grocery',shared:true})});
    if(R('grocery').on&&!done){
      const lead=Math.max(0,+R('grocery').lead||0);
      if(date>=dAdd(wkStart,-lead)){
        const left=wk?(wk.items||[]).map(x=>({n:(x.productId&&pn(x.productId))||x.name||'Item',store:(x.productId&&(prods.find(p=>p.id===x.productId)||{}).store)||x.store||'Other',q:Math.max(0,Math.max(0,x.plannedQty-(x.carriedQty||0)-(x.dismissedQty||0))-(x.purchasedQty||0))})).filter(x=>x.q>0):null;
        let notes='Cycle '+cyc+' · Week '+cw+'\n';
        if(left){const by={};left.forEach(x=>{(by[x.store]=by[x.store]||[]).push(x.n+' ×'+(Math.round(x.q*100)/100))});notes+=Object.keys(by).map(s=>s+': '+by[s].join(', ')).join('\n');notes+='\n'+left.length+' items left · open Grocery for prices and the budget.'}
        else notes+='Open Grocery to see this week\'s list.';
        specs.push({key,src:'grocery',shared:true,title:'Grocery trip — Cycle '+cyc+' · Week '+cw,due:wkStart,dueTime:null,startDate:dAdd(wkStart,-lead),tags:['grocery'],notes,link:'apps/grocery.html',meta:{week:w}});
        if(date<=wkStart)add({id:'grocery:'+w+':trip',at:atMs(dAdd(wkStart,-Math.min(lead,1)),R('grocery').time),title:'Grocery trip '+(wkStart===date?'today':'tomorrow'),body:left?left.length+' items on the list':'Cycle '+cyc+' · Week '+cw,src:'grocery',link:'apps/grocery.html'});
      }
    }
    // restock: one task for whatever is low or finished
    if(R('restock').on){
      const low=Object.keys(gro.inventory||{}).filter(id=>{const s=(gro.inventory[id]||{}).status;return(s==='low'||s==='finished')&&pn(id)}).map(id=>pn(id));
      const rk='restock:'+w;
      if(low.length&&!done)specs.push({key:rk,src:'restock',shared:true,title:'Restock: '+low.slice(0,4).join(', ')+(low.length>4?' +'+(low.length-4)+' more':''),due:date,startDate:date,tags:['grocery'],notes:'Running low or finished in the pantry:\n'+low.join(', '),link:'apps/grocery.html'});
      else specs.push({key:rk,complete:true,src:'restock',shared:true});
    }
    // trip completed -> Budget expense
    if(R('tripexp').on){
      if(!linkS.tripSince)linkS.tripSince=date;
      linkS.trips=linkS.trips||{};
      for(const h of (gro.history||[])){
        if(!h||h.week==null||!(h.actual>0)||!h.date||h.date<linkS.tripSince||linkS.trips['w'+h.week+':'+h.date])continue;
        linkS.trips['w'+h.week+':'+h.date]=1;
        const scope=R('tripexp').scope==='personal'?'personal':'shared',cats=(await readJson(budgetRef(scope,'categories'),[]))||[];
        const cat=cats.find(c=>/grocer/i.test(c.name||''))||cats.find(c=>/food|dining/i.test(c.name||''));
        const tref=budgetRef(scope,'transactions'),rt=await readSafe(tref,[]);if(!rt.ok||!Array.isArray(rt.val)){delete linkS.trips['w'+h.week+':'+h.date];continue}const arr=rt.val;
        const shared=scope==='shared',amt=Math.round(h.actual*100)/100,id='id-auto-trip-'+h.week+'-'+h.date;
        if(!arr.some(x=>x.id===id)){
          arr.unshift({id,amount:amt,type:'expense',categoryId:cat?cat.id:'',who:shared?state.profile:null,date:h.date,note:'Grocery trip — Cycle '+(Math.floor((h.week-1)/8)+1)+' · Week '+(((h.week-1)%8)+1),createdAt:Date.now(),splitMethod:shared?'half':null,owedAmount:shared?Math.round(amt/2*100)/100:null,settled:shared?false:undefined,auto:'trip'});
          await tref.set({json:JSON.stringify(arr)});
          linkS.log.push({t:Date.now(),r:'tripexp',k:id,l:'Logged grocery trip '+linkMoney(amt)+' in Budget',a:1});out.paid++;
          if(!manual)toast('Logged the grocery trip ('+linkMoney(amt)+') in Budget');
        }
      }
    }
  }
  // 4) birthdays / anniversaries (Calendar C and O)
  if(R('birthdays').on){
    const [rems,cats]=await Promise.all([readJson(appRef('calendar','reminders'),[]),readJson(appRef('calendar','reminderCategories'),[])]);
    state.reminders=Array.isArray(rems)?rems:[];state.reminderCats=Array.isArray(cats)?cats:[];
    const gift=Math.max(1,+R('birthdays').gift||7),eve=R('birthdays').eve,day=R('birthdays').day,yr=+date.slice(0,4);
    state.reminders.forEach(r=>{
      if(!r||!r.name||!r.month||!r.day)return;
      const cname=((state.reminderCats.find(c=>c.id===r.categoryId))||{}).name||'';
      const isB=/birthday/i.test(cname),isA=/anniversary/i.test(cname);
      let D=null;for(const y of [yr,yr+1]){const last=new Date(y,+r.month,0).getDate(),dd=y+'-'+P2(+r.month)+'-'+P2(Math.min(+r.day,last));if(dd>=date){D=dd;break}}
      if(!D)return;
      const days=dDiff(date,D),close=r.circle==='C',Y=D.slice(0,4),what=isB?"birthday":isA?'anniversary':cname.toLowerCase()||'reminder';
      if(isB||isA){
        if(close&&days<=gift)specs.push({key:'gift:'+r.id+':'+Y,src:'birthday',shared:true,title:'Buy a gift for '+r.name,due:dAdd(D,-gift)<date?date:dAdd(D,-gift),startDate:dAdd(D,-gift)<date?date:dAdd(D,-gift),tags:['birthday','gift'],notes:r.name+"'s "+what+' is on '+D+' ('+days+' day'+(days===1?'':'s')+' away).',link:'apps/calendar.html'});
        if(days<=1)specs.push({key:'wish:'+r.id+':'+Y,src:'birthday',shared:false,title:'Wish '+r.name+(isB?' a happy birthday':' a happy anniversary'),due:D,startDate:D,dueTime:day||null,tags:['birthday'],notes:(close?'Close · ':'Outside · ')+r.name+"'s "+what+' is today.',link:'apps/calendar.html'});
      }
      if(close&&(isB||isA)&&days<=gift&&days>=1)add({id:'bd:'+r.id+':'+Y+':gift',at:atMs(dAdd(D,-gift)<date?date:dAdd(D,-gift),day),title:'Buy a gift for '+r.name,body:r.name+"'s "+what+' is in '+days+' day'+(days===1?'':'s'),src:'birthday',link:'apps/calendar.html'});
      if(days>=1)add({id:'bd:'+r.id+':'+Y+':eve',at:atMs(dAdd(D,-1),eve),title:'Tomorrow: '+r.name+"'s "+what,body:close&&(isB||isA)?'Close · have the gift ready':'Outside · a message tomorrow morning',src:'birthday',link:'apps/calendar.html'});
      add({id:'bd:'+r.id+':'+Y+':day',at:atMs(D,day),title:(isB?'Wish '+r.name+' a happy birthday':isA?'Wish '+r.name+' a happy anniversary':r.name+' — '+(cname||'today')),body:(close?'Close · ':'Outside · ')+"it's today",src:'birthday',link:'apps/calendar.html'});
    });
  }
  if(R('mealrem').on&&window.DietCore){
    const rd=await readSafe(dietRef(),null);
    if(rd.ok&&rd.exists&&rd.val&&Array.isArray(rd.val.meals)&&Array.isArray(rd.val.diary)){
      const pid=state.profile.toLowerCase(),{rows}=DietCore.dayRows(rd.val,pid,date),lead=Number(R('mealrem').lead)||0,late=Number(R('mealrem').late)||45;
      const at0=new Date(date+'T00:00:00').getTime();
      rows.forEach(r=>{
        if(r.status!=='planned'||r.t==null)return;
        const kc=Math.round(r.n.calories),nowMs=Date.now();
        if(at0+(r.t-lead)*60000>nowMs-300000)add({id:'meal:'+date+':'+r.meal.id+':pre',at:at0+(r.t-lead)*60000,title:r.name+(lead?' in '+lead+' min':' now'),body:kc+' kcal · '+Math.round(r.n.protein)+' g protein',src:'meal',link:'index.html'});
        if(at0+(r.t+late)*60000>nowMs-3*3600e3)add({id:'meal:'+date+':'+r.meal.id+':late',at:at0+(r.t+late)*60000,title:r.name+' not logged yet',body:'Ate it? Tick it, or skip it.',src:'meal',link:'index.html'});
      });
    }
  }
  if((R('skinrem').on||R('skinstock').on)&&window.SkinCore){
    const names=['stepLog','productState'],rs=await Promise.all(names.map(n=>readSafe(profileRef('skin-profiles',n),null)));
    const sp=await profileRef('skin-profiles','programStart').get().then(s=>({ok:true,start:(s.exists&&s.data().startDate)||null})).catch(()=>({ok:false}));
    if(rs.every(r=>r.ok)&&sp.ok&&(rs[0].exists||sp.start)){
      const C=SkinCore,prof=state.profile,start=sp.start||C.TEMPLATE_START,log=(rs[0].exists&&rs[0].val&&typeof rs[0].val==='object')?rs[0].val:{},nowMs=Date.now();
      if(R('skinrem').on){
        const secs=C.sections(prof,date,start);
        if(secs){
          const left=s=>s.steps.some((x,i)=>!x.optional&&!log[C.stepKey(date,s.key,i)]);
          const am=secs.find(s=>s.key==='am'),pm=secs.find(s=>s.key==='face'||s.key==='pm'),nz=secs.find(s=>s.key==='nizoral');
          const night=secs.filter(s=>s.key!=='am');
          if(am&&left(am)){const at=atMs(date,R('skinrem').am);if(at>nowMs-3*3600e3)add({id:'skin:'+date+':am',at,title:'Morning skin routine',body:am.steps.filter(x=>!x.optional).map(x=>x.text.split(' — ')[0]).join(', '),src:'skin',link:'apps/skin.html'})}
          if(night.some(left)){const at=atMs(date,R('skinrem').pm);if(at>nowMs-3*3600e3)add({id:'skin:'+date+':pm',at,title:'Night skin routine'+(pm&&pm.treat?' · '+pm.treat:''),body:night.filter(left).map(s=>s.label).join(', ')+(nz?' (Nizoral tonight)':''),src:'skin',link:'apps/skin.html'})}
        }
      }
      if(R('skinstock').on){
        const ps=C.seedState((rs[1].exists&&rs[1].val&&typeof rs[1].val==='object')?rs[1].val:{},prof);
        C.low(ps,prof).filter(p=>p.pct<=15).forEach(p=>add({id:'skinlow:'+p.id+':'+date.slice(0,7),at:atMs(date,R('skinstock').time),title:p.name+' is almost out',body:p.pct+'% left. Send it to Grocery from the Skin widget.',src:'skin',link:'apps/skin.html'}));
      }
    }
  }
  if(R('listrem').on&&window.NotesCore){
    const rl=await readSafe(appRef('checklist','state'),null);
    if(rl.ok&&rl.exists&&rl.val&&Array.isArray(rl.val.lists)){
      const lead=Math.max(0,Math.min(7,Number(R('listrem').lead)||0)),nowMs=Date.now();
      NotesCore.active(rl.val.lists,state.profile).forEach(l=>{
        if(!l.due)return;
        const open=NotesCore.openFor(l,state.profile);if(!open.length)return;
        const at=atMs(dAdd(l.due,-lead),R('listrem').time),mine=open.filter(x=>x.a===state.profile).length;
        if(at>nowMs-3*3600e3)add({id:'list:'+l.id+':'+l.due+':'+lead,at,title:l.title+(lead?' is due '+(lead===1?'tomorrow':'in '+lead+' days'):' is due today'),body:open.length+' item'+(open.length>1?'s':'')+' left'+(mine?' · '+mine+' for you':''),src:'list',link:'apps/checklist.html?list='+encodeURIComponent(l.id)});
      });
    }
  }
  out.tasks=await linkApplyTasks(specs);
  if(out.tasks)linkS.log.push({t:Date.now(),r:'tasks',k:'t'+Date.now(),l:out.tasks+' task'+(out.tasks>1?'s':'')+' added or ticked automatically',a:1});
  await linkSaveReminders(rem);
  return out;
}

/* ---- reminders ---- */
async function linkSaveReminders(fresh){
  const cur=await readJson(remindersRef(),null),list=(cur&&Array.isArray(cur.list))?cur.list:[],byId={};list.forEach(r=>byId[r.id]=r);
  const now=Date.now(),next=[];
  fresh.forEach(r=>{const o=byId[r.id];if(r.at>now+14*864e5)return;next.push(Object.assign({state:'pending'},r,o?{state:o.state}:{}));delete byId[r.id]});
  Object.keys(byId).forEach(id=>{const r=byId[id];if(r.at>now-2*864e5&&!(r.src==='bills'||r.src==='grocery'||r.src==='birthday'||r.src==='meal'||r.src==='skin'||r.src==='list'))next.push(r);else if(r.at>now-864e5&&r.state!=='pending')next.push(r)}); // keep recent history only
  next.sort((a,b)=>a.at-b.at);
  const s=JSON.stringify({v:1,list:next});
  if(s!==JSON.stringify({v:1,list:list}))await remindersRef().set({json:s,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
  linkRem=next;
}
let linkRem=[];
async function linkDueReminders(){
  if(!linkRem.length||(linkS&&linkS.enabled===false))return;
  const now=Date.now();let dirty=false;
  const tEl=document.getElementById('toast');
  linkRem.forEach(r=>{
    if(r.state!=='pending'||r.at>now)return;
    if(now-r.at<3*3600e3&&tEl&&tEl.classList.contains('show')&&tEl.classList.contains('has-act'))return;   // never cover an Undo toast: try again next tick
    r.state=(now-r.at>3*3600e3)?'missed':'shown';dirty=true;
    if(r.state==='shown'){
      toast(r.title+(r.body?' — '+r.body:''));
      try{if('Notification'in window&&Notification.permission==='granted')new Notification(r.title,{body:r.body||'',icon:'icon-192.png',tag:r.id})}catch(e){}
    }
  });
  if(dirty)try{await remindersRef().set({json:JSON.stringify({v:1,list:linkRem}),updatedAt:firebase.firestore.FieldValue.serverTimestamp()})}catch(e){}
}

/* ---- nudges: what still needs you, right now ---- */
async function linkNudges(){
  const date=today(),out=[],R=linkRule;
  if(!R('nudges').on||(linkS&&linkS.enabled===false))return out;
  const nowM=new Date().getHours()*60+new Date().getMinutes(),[nh,nm]=String(R('nudges').time||'20:00').split(':').map(Number),late=nowM>=(nh*60+(nm||0));
  const tasks=(state.personalTasks||[]).concat(state.sharedTasks||[]);
  const overdue=tasks.filter(t=>!t.done&&t.auto&&t.auto.src==='bill'&&t.due&&t.due<date);
  overdue.forEach(t=>out.push({k:'bill:'+t.id,t:t.title.replace(/^Pay /,'')+' is overdue',s:'Due '+t.due,link:'budget.html'}));
  if(late){
    const open=tasks.filter(t=>!t.done&&t.due===date);
    if(open.length)out.push({k:'tasks',t:open.length+' task'+(open.length>1?'s':'')+' still open today',s:open.slice(0,3).map(t=>t.title).join(' · '),link:'apps/todo.html'});
    try{const miss=waterPlanList(date).filter(p=>wStatus(p,date).s==='missed').length;if(miss)out.push({k:'water',t:miss+' planned drink'+(miss>1?'s':'')+' missed',s:'Water plan',link:null})}catch(e){}
  }
  return out;
}

async function linkRun(manual){
  if(linkBusy||!state.user||!state.profile)return null;
  linkBusy=true;let changed=0,extra=0;
  try{
    await linkEnsure();
    if(linkS.enabled===false){linkBusy=false;if(document.getElementById('links-card'))renderLinksCard();return 0}
    const date=today(),dn=DAYS[new Date().getDay()],S={skin:true,diet:true,ev:false,task:false};
    // fresh copies of what the rules read from the To-Do and Chores apps
    const [chores,personal,shared]=await Promise.all([readJson(appRef('chores','chores'),null),readJson(profileRef('todo-profiles','tasks'),null),readJson(sharedTodoRef(),null)]);
    if(Array.isArray(chores))state.chores=chores;if(Array.isArray(personal))state.personalTasks=personal;if(Array.isArray(shared))state.sharedTasks=shared;
    let part2=null;try{part2=await linkSyncTasks(manual)}catch(e){console.warn('link engine tasks',e)}
    extra=part2?(part2.tasks||0)+(part2.paid||0):0;
    await schedLoadLog(true,S);
    const facts={gym:linkRule('gym').on?await linkGymDone(date):false,focus:linkRule('focus').on?await linkFocusMin(date):0};
    const {blocks}=schedBuild(S);
    const now=Date.now(),log=[],map=Object.assign({},schedLog.map);
    blocks.forEach(b=>{
      const key=date+':'+b.idx,checks=linkChecks(b,dn,date,facts),ticked=!!map[key],isAuto=!!linkS.auto[key];
      if(!checks.length){delete linkS.auto[key];return}      // rule switched off / no longer applies: the tick stays, the engine lets go of it
      const all=checks.every(c=>c.ok),names=checks.map(c=>c.id).join('+');
      if(ticked){
        if(isAuto&&!all){delete map[key];delete linkS.auto[key];changed++;log.push({t:now,r:names,k:key,l:b.t,a:0})}   // what made it true is gone again
      }else{
        if(isAuto){if(all){delete linkS.auto[key];linkS.off[key]=true}else delete linkS.auto[key];return}   // you unticked it yourself
        if(linkS.off[key]){if(!all)delete linkS.off[key];return}                                          // stay off until the condition drops
        if(all){map[key]=true;linkS.auto[key]=true;changed++;log.push({t:now,r:names,k:key,l:b.t,a:1})}
      }
    });
    if(changed){
      const ref=profileRef('schedule-profiles','templateLog'),rl=await readSafe(ref,{});if(!rl.ok)throw new Error('schedule log unreadable');const m=(rl.val&&typeof rl.val==='object'&&!Array.isArray(rl.val))?rl.val:{};
      log.forEach(e=>{if(e.a)m[e.k]=true;else delete m[e.k]});
      await ref.set({json:JSON.stringify(m),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
      schedLog.map=m;schedLog.t=Date.now();
      if(state.insights&&state.insights.tplLog){log.forEach(e=>{if(e.a)state.insights.tplLog[e.k]=true;else delete state.insights.tplLog[e.k]})}
      linkS.log=linkS.log.concat(log);
      schedRedraw();
      if(!manual)toast(log.length===1?(log[0].a?'Ticked ':'Unticked ')+log[0].l+' (auto)':'Auto-updated '+log.length+' blocks');
    }
    linkS.last=Date.now();await linkSave();
  }catch(e){console.warn('link engine',e)}
  linkBusy=false;
  if(extra)hubSoftRefresh(true);
  linkDueReminders();
  if(document.getElementById('links-card'))renderLinksCard();
  return changed+extra;
}
function linksStart(){
  if(linkTimer)clearInterval(linkTimer);
  linkS=null;linkKey=null;
  setTimeout(()=>linkRun(false),2500);
  if(window.linkRemTimer)clearInterval(window.linkRemTimer);window.linkRemTimer=setInterval(()=>{if(!document.hidden)linkDueReminders()},30000);
  linkTimer=setInterval(()=>{if(!document.hidden&&!(document.getElementById('app-frame-overlay')&&!document.getElementById('app-frame-overlay').hidden))linkRun(false)},90000);
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.user&&state.profile)setTimeout(()=>linkRun(false),1500)});
function linkTime(t){const d=new Date(t);return d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}
async function renderLinksCard(){
  const el=document.getElementById('links-card');if(!el||!state.profile)return;
  await linkEnsure();
  const body=el.querySelector('#links-body');if(!body)return;
  const pHtml=r=>(r.p||[]).length?'<div class="lk-in">'+r.p.map(q=>{
    const v=linkRule(r.id)[q.k],a='data-lk-p="'+r.id+':'+q.k+'"';
    if(q.t==='sel')return '<label>'+esc(q.l)+'<select class="ws-in" '+a+'>'+q.o.map(o=>'<option value="'+o[0]+'"'+(o[0]===v?' selected':'')+'>'+esc(o[1])+'</option>').join('')+'</select></label>';
    if(q.t==='num')return '<label>'+esc(q.l)+'<input class="ws-in" type="number" min="'+q.lo+'" max="'+q.hi+'" '+a+' value="'+v+'" style="width:76px"></label>';
    if(q.t==='time')return '<label>'+esc(q.l)+'<input class="ws-in" type="time" '+a+' value="'+esc(v)+'"></label>';
    return '<label>'+esc(q.l)+'<input class="ws-in lk-kw" '+a+' value="'+esc(v)+'"></label>';
  }).join('')+'</div>':'';
  const master=el.querySelector('#links-master');if(master)master.checked=linkS.enabled!==false;
  el.classList.toggle('lk-disabled',linkS.enabled===false);
  body.innerHTML=LINK_GROUPS.map(g=>'<h3 class="lk-h">'+esc(g.label)+'</h3><p class="settings-hint" style="margin:0 0 4px">'+esc(g.hint)+'</p>'+LINK_RULES.filter(r=>r.g===g.id).map(r=>{
    const c=linkRule(r.id);
    return '<div class="lk-rule"><label class="lk-sw"><input type="checkbox" data-lk-on="'+r.id+'"'+(c.on?' checked':'')+'><span></span></label><div class="lk-tx"><strong>'+esc(r.label)+' <em>→ '+esc(r.to)+'</em></strong><small>'+esc(r.desc)+'</small>'+pHtml(r)+'</div></div>';
  }).join('')).join('');
  const log=(linkS.log||[]).slice(-12).reverse();
  el.querySelector('#links-log').innerHTML=log.length?log.map(e=>'<div class="lk-ev"><span>'+(e.a?'✓':'↩')+'</span><b>'+esc(e.l)+'</b><small>'+esc(e.r)+' · '+esc(linkTime(e.t))+'</small></div>').join(''):'<p class="settings-hint">Nothing yet. Log a workout, eat a meal or finish a chore and the engine will do the rest.</p>';
  const up=(linkRem||[]).filter(r=>r.state==='pending').slice(0,8);
  const upEl=el.querySelector('#links-rem');
  if(upEl)upEl.innerHTML=up.length?up.map(r=>'<div class="lk-ev"><span>⏰</span><b>'+esc(r.title)+'</b><small>'+esc(new Date(r.at).toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))+'</small></div>').join(''):'<p class="settings-hint">No reminders coming up.</p>';
  const nd=await linkNudges();const ndEl=el.querySelector('#links-nudges');
  if(ndEl)ndEl.innerHTML=nd.length?nd.map(n=>'<div class="lk-ev"><span>!</span><b>'+esc(n.t)+'</b><small>'+esc(n.s||'')+'</small></div>').join(''):'<p class="settings-hint">Nothing needs you right now.</p>';
  el.querySelector('#links-status').textContent=linkS.last?'Last checked '+linkTime(linkS.last):'Not run yet';
  const rb=el.querySelector('#links-run');if(rb&&!rb.dataset.wired){rb.dataset.wired=1;rb.onclick=async()=>{if(linkS.enabled===false){toast('Automatic links are switched off — turn them on first');return}rb.disabled=true;rb.textContent='Checking…';const n=await linkRun(true);rb.disabled=false;rb.textContent='Check now';toast(n?('Updated '+n+' item'+(n>1?'s':'')):'Everything is already up to date')}}
  if(master&&!master.dataset.wired){master.dataset.wired=1;master.addEventListener('change',async()=>{linkS.enabled=master.checked;await linkSave();toast(master.checked?'Automatic links are on':'Automatic links are off for '+state.profile);if(master.checked)linkRun(true);else renderLinksCard()})}
  if(!body.dataset.wired){
    body.dataset.wired=1;
    body.addEventListener('change',async e=>{
      const t=e.target;let id;
      if((id=t.dataset.lkOn)){linkS.rules[id]=Object.assign(linkS.rules[id]||{},{on:t.checked})}
      else if(t.dataset.lkP){
        const[rid,k]=t.dataset.lkP.split(':'),q=(LINK_RULES.find(r=>r.id===rid).p||[]).find(x=>x.k===k);let v=t.value;
        if(q.t==='num')v=Math.max(q.lo,Math.min(q.hi,+v||q.d));if(q.t==='time'&&!/^\d\d:\d\d$/.test(v))v=q.d;
        linkS.rules[rid]=Object.assign(linkS.rules[rid]||{},{[k]:v});
      }else return;
      await linkSave();linkRun(true);
    });
  }
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
    {id:'w-todo',type:'todo',colSpan:6,rowSpan:24},
    {id:'w-agenda',type:'agenda',colSpan:6,rowSpan:15},
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
/* ---- Diet widget settings (gear). Goals, meals and recipes come from the Diet app. ---- */
const DIET_SETTINGS=[
  {h:'Show'},
  {key:'ring',label:'Calorie ring and protein bar',hint:'One arc per planned meal; it fills when you eat it',type:'bool',def:true},
  {key:'macros',label:'Carbs, fat and meal count',type:'bool',def:true},
  {key:'micro',label:'Sugar and saturated fat bars',hint:'Against the limits you set in Diet',type:'bool',def:true},
  {key:'next',label:'Next meal card',hint:'Ate it, Skip, and a chooser for meals with options',type:'bool',def:true},
  {key:'list',label:'Meal list',hint:'Tap a row for what is in it',type:'bool',def:true},
  {key:'rescue',label:'Protein rescue',hint:'Suggests whey when the plan will not reach your protein',type:'bool',def:true},
  {key:'pantry',label:'Pantry check on the next meal',hint:'Warns when an ingredient is low or finished in Grocery',type:'bool',def:true},
  {key:'add',label:'"Ate something else" quick add',type:'bool',def:true},
  {key:'week',label:'Last 7 days',hint:'Tap a bar to open that day',type:'bool',def:true},
  {key:'flex',label:'Weekly flex bank',hint:'Calories saved or borrowed this week, so one off day evens out',type:'bool',def:true},
  {key:'energy',label:'Eaten against burned',hint:'Uses your Gym height, weight and workouts',type:'bool',def:true},
  {key:'streak',label:'Streak and weekly score',type:'bool',def:true},
  {key:'feel',label:'"How did it sit" faces after a meal',type:'bool',def:true},
  {key:'weight',label:'Weight line',hint:'Latest weigh-in from Gym',type:'bool',def:false},
  {h:'Look'},
  {key:'center',label:'Ring centre',type:'seg',opts:[['left','kcal left'],['eaten','kcal eaten']],def:'left'},
  {key:'fmt',label:'Time format',type:'seg',opts:[['12','12 h'],['24','24 h']],def:'12'},
  {key:'hideplan',label:'Hide calories of meals not eaten yet',hint:'Less number-watching until you have eaten',type:'bool',def:false},
  {h:'Reminders'},
  {key:'rem',label:'Meal reminders',hint:'"Lunch in 15 minutes" and a late nudge. Times and lead are in Settings, Links.',type:'bool',get:()=>{try{return linkRule('mealrem').on&&!(linkS&&linkS.enabled===false)}catch(e){return false}},
    set:async v=>{await linkEnsure();linkS.rules.mealrem=Object.assign({},linkS.rules.mealrem,{on:!!v});await linkSave();if(v)linkRun(true).catch(()=>{})}}
];
/* ---- Skin widget settings (gear). The routine, products and program dates come from the Skin app. ---- */
const PHOTO_SETTINGS=[
  {h:'Slideshow'},
  {key:'speed',label:'Seconds per photo',type:'seg',opts:[['3','3'],['5','5'],['8','8'],['15','15']],def:'5'},
  {key:'auto',label:'Start playing on its own',type:'bool',def:false},
  {key:'shuf',label:'Shuffle',type:'bool',def:false},
  {key:'only',label:'Show',hint:'Favourites shows only the hearted photos (all of them until you heart one).',type:'seg',opts:[['all','All'],['fav','Favourites']],def:'all'},
  {h:'Look'},
  {key:'view',label:'Layout',hint:'One photo at a time, or all of them as tiles',type:'seg',opts:[['one','One photo'],['grid','All tiles']],def:'one'},
  {key:'fit',label:'Photo fit',hint:'Fill crops to the shape, Whole shows every edge, Stretch squeezes it to the shape',type:'seg',opts:[['fill','Fill'],['fit','Whole'],['stretch','Stretch']],def:'fill'},
  {key:'focus',label:'When filling, keep the',hint:'Which part stays in view when the photo is cropped',type:'seg',opts:[['top','Top'],['center','Middle'],['bottom','Bottom']],def:'center'},
  {key:'bar',label:'Buttons',type:'seg',opts:[['always','Always'],['hover','On touch/hover'],['hide','Hidden']],def:'always'},
  {key:'cap',label:'Show captions',type:'bool',def:true},
  {key:'zoom',label:'Tap a photo to enlarge',type:'bool',def:true}
];
const NOTES_SETTINGS=[
  {h:'Show'},
  {key:'kind',label:'Show',type:'seg',opts:[['all','Both'],['notes','Notes'],['lists','Lists']],def:'all'},
  {key:'sort',label:'Order',type:'seg',opts:[['new','Newest'],['edit','Edited'],['old','Oldest']],def:'new'},
  {key:'pinfirst',label:'Pinned first',type:'bool',def:true},
  {h:'Look'},
  {key:'size',label:'Text size',type:'seg',opts:[['s','S'],['m','M'],['l','L']],def:'m'},
  {key:'cols',label:'Columns',type:'seg',opts:[['auto','Auto'],['1','1'],['2','2'],['3','3']],def:'auto'},
  {key:'bar',label:'Formatting toolbar',type:'seg',opts:[['edit','When editing'],['always','Always']],def:'edit'}
];
const SKIN_SETTINGS=[
  {h:'Show'},
  {key:'prog',label:'Program progress',hint:'Month, day of the program and the month objective',type:'bool',def:true},
  {key:'streak',label:'Streak badge',type:'bool',def:true},
  {key:'prod',label:'Product under each step',type:'bool',def:true},
  {key:'qty',label:'How much to use',type:'bool',def:true},
  {key:'timers',label:'Wait timers',hint:'Differin dry time, BHA wait',type:'bool',def:true},
  {key:'hideDone',label:'Hide steps once done',type:'bool',def:false},
  {key:'coming',label:'Next 7 nights',hint:'Which treatment each night is',type:'bool',def:true},
  {key:'heat',label:'Last 28 days map',type:'bool',def:true},
  {key:'cab',label:'Product stock',hint:'Running low shows a Send to Grocery button',type:'bool',def:true},
  {key:'track',label:'Nightly tracking',hint:'Bhargav: sliders and reactions. Anusha: weekly check-in',type:'bool',def:true},
  {key:'review',label:'Next review countdown',type:'bool',def:true},
  {h:'Reminders'},
  {key:'rem',label:'Routine reminders',hint:'Morning and night, naming tonight’s treatment. Times are in Settings, Links.',type:'bool',get:()=>{try{return linkRule('skinrem').on&&!(linkS&&linkS.enabled===false)}catch(e){return false}},
    set:async v=>{await linkEnsure();linkS.rules.skinrem=Object.assign({},linkS.rules.skinrem,{on:!!v});await linkSave();if(v)linkRun(true).catch(()=>{})}},
  {key:'remstock',label:'Running-low nudge',hint:'When a product drops to 15% or less',type:'bool',get:()=>{try{return linkRule('skinstock').on&&!(linkS&&linkS.enabled===false)}catch(e){return false}},
    set:async v=>{await linkEnsure();linkS.rules.skinstock=Object.assign({},linkS.rules.skinstock,{on:!!v});await linkSave();if(v)linkRun(true).catch(()=>{})}},
  {h:'Look'},
  {key:'fmt',label:'Time format',type:'seg',opts:[['12','12 h'],['24','24 h']],def:'12'}
];
const WIDGET_TYPES={
  schedule:{title:"Today's schedule",icon:'calendar-clock',desc:"Your day as a line you fill in: tick blocks, see events and tasks under the block they fall in. Gear for settings.",defaultSize:'lg',
    settings:SCHEDULE_SETTINGS,
    render(el,w){renderScheduleWidget(el,w);schedLoadLog(false,wsAll(w,WIDGET_TYPES.schedule)).then(ch=>{if(ch&&el.isConnected)renderScheduleWidget(el,w)}).catch(()=>{})}},
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
  skin:{title:'Skin program',icon:'sparkle',desc:"Today's routine as tickable sections with the product and amount for each step, wait timers, tonight's treatment, product stock, nightly tracking and a 28-day map. Same data as the Skin app.",defaultSize:'lg',
    settings:SKIN_SETTINGS,ready:()=>skinLoad(true),
    render(el,w){return renderSkinInto(el,w)}},
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
  activity:{title:'Recent ticks',icon:'history',desc:"Everything ticked or unticked across your apps, newest first, from the central tick log.",defaultSize:'md',
    settings:[
      {h:'What to show'},
      {key:'who',label:'Whose ticks',type:'seg',opts:[['both','Both of us'],['mine','Just mine']],def:'both'},
      {key:'count',label:'How many',type:'seg',opts:[['10','10'],['20','20'],['40','40']],def:'10'},
      {key:'un',label:'Show unticks',hint:'Things you ticked then un-ticked',type:'bool',def:true}
    ],
    async render(el,w){
      wLoading(el);
      try{
        const S=wsAll(w,WIDGET_TYPES.activity);
        if(!window.TickLog){el.innerHTML='<div class="empty-state"><strong>Tick log not loaded</strong>Upload assets/ticklog.js and assets/firebase-config.js.</div>';return}
        const who=S.who==='mine'?[state.profile]:['Bhargav','Anusha'];
        let all=[];(await Promise.all(who.map(p=>window.TickLog.read(p)))).forEach(a=>all=all.concat(a));
        if(!S.un)all=all.filter(e=>e.d===1);
        all.sort((a,b)=>b.t-a.t);
        const SRC={schedule:'Schedule',skin:'Skin',todo:'To-do',chores:'Chores',checklist:'Checklist',pledge:'Pledge',diet:'Diet',water:'Water'};
        const td=today(),shown=all.slice(0,Number(S.count)||10);
        if(!shown.length){el.innerHTML='<div class="empty-state"><strong>Nothing ticked yet</strong>Tick a block, task or chore and it shows up here.</div>';return}
        const nToday=all.filter(e=>e.dt===td&&e.d===1).length;
        const fmtT=t=>{const d=new Date(t),tm=d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});return d.toDateString()===new Date().toDateString()?tm:d.toLocaleDateString([],{weekday:'short'})+' '+tm};
        const label=e=>{if(e.l)return e.l;if(e.s==='schedule'){const m=/^\d{4}-\d{2}-\d{2}:(\d+)$/.exec(e.k);const b=m&&dayBlocksFor(e.dt);const x=b&&b[Number(m[1])];if(x)return x.activity||x.title}return 'an item'};
        el.innerHTML='<div class="act-sum"><b>'+nToday+'</b> tick'+(nToday===1?'':'s')+' today'+(who.length>1?' between you':'')+'</div>'+
          shown.map(e=>'<div class="act-row'+(e.d?'':' act-un')+'"><span class="act-av act-'+(e.p==='Anusha'?'a':'b')+'" title="'+esc(e.p)+'">'+esc((e.p||'?')[0])+'</span><span class="act-tx"><span class="act-l">'+esc(label(e))+'</span><small>'+(e.d?'Ticked':'Unticked')+' · '+esc(SRC[e.s]||e.s)+(e.x?' · '+esc(e.x):'')+'</small></span><time>'+esc(fmtT(e.t))+'</time></div>').join('');
      }catch(err){el.innerHTML='<div class="empty-state"><strong>Unavailable</strong>Could not load the tick log.</div>'}
    }},
  photos:{title:'Photo widget',icon:'image',desc:'Your own little rotating gallery — add photos, caption and heart them, shuffle, play on its own, tap to enlarge. Add as many of these as you like.',defaultSize:'lg',bare:true,multiple:true,
    settings:PHOTO_SETTINGS,
    render(el,w){renderPhotoWidgetInto(el,w.id)}},
  notes:{title:'Notes & lists',icon:'sticky-note',desc:'Sticky notes and tick-box checklists in one place: pin, search, turn a note into a checklist, share lists with Anusha and assign items, due-date reminders, and a Recently deleted bin. In step with the To-Do and Checklists apps.',defaultSize:'lg',
    settings:NOTES_SETTINGS,
    render(el){return renderNotesWidgetInto(el)}},
  water:{title:'Water',icon:'droplets',desc:'A body that fills as you drink. Plan your drinks, get reminded, tick missed ones, and look back through the last 30 days.',defaultSize:'lg',
    settings:WATER_SETTINGS,resetData:waterResetData,ready:()=>ensureWater(),
    render(el,w){return renderWaterInto(el,w)}},
  diet:{title:'Diet',icon:'utensils',desc:'Your day as a plate: one arc per planned meal that fills when you eat it. Protein first, next meal, quick add, week, flex bank — all in step with the Diet app.',defaultSize:'lg',
    settings:DIET_SETTINGS,ready:()=>dietLoad(true),
    render(el,w){return renderDietInto(el,w)}}
};
/* ---- Water widget: the body fills to a 70% line at your goal. Today or any of the last 30 days; plan, reminders, drink matching. ---- */
const WT_BODY={
  m:'<rect x="14" y="30" width="12" height="52" rx="6"/><rect x="74" y="30" width="12" height="52" rx="6"/><rect x="28" y="28" width="44" height="58" rx="15"/><rect x="30" y="80" width="18" height="72" rx="8"/><rect x="52" y="80" width="18" height="72" rx="8"/><circle cx="50" cy="15" r="12"/>',
  f:'<rect x="18" y="31" width="10" height="50" rx="5"/><rect x="72" y="31" width="10" height="50" rx="5"/><path d="M34 28H66q5 0 5 6l-1 22q-1 8-5 14q8 6 9 20H26q1-14 9-20q-4-6-5-14L29 34q0-6 5-6z"/><rect x="31" y="86" width="16" height="66" rx="7.5"/><rect x="53" y="86" width="16" height="66" rx="7.5"/><circle cx="50" cy="15" r="11.5"/><path d="M38 12q0-12 12-12t12 12q-3-5-12-5t-12 5z"/><path d="M58 8q16-1 15 15q0 8-5 13q1-9-4-14q-4-4-6-14z"/><circle cx="59.5" cy="9" r="2.6"/>'
};
const WT_LINES=['Glug glug','Refreshing','Nice one','Hydrated','Sip sip'];
let waterView=null,waterPastDoneFor='',wtUi={custom:false,planAdd:false},wtTimer=null;
// Layout follows the WIDTH only (two columns when wide, one when narrow, compact under ~290px). Height never hides anything — a short card just scrolls, and “Fit height” sizes it to its content.
const wtSize=el=>{const w=el.clientWidth;return w>=620?'wide':w<290?'sm':'lg'};
const wtKeys=()=>Array.from({length:30},(_,i)=>addDays(today(),i-29));
const wtLabel=k=>{if(k===today())return'Today';const d=new Date(k+'T12:00:00');return d.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})};
function waterRepaintAll(anim){
  document.querySelectorAll('[data-widget-type="water"] .widget-card-body').forEach(el=>{try{waterPaint(el,state.widgets.find(x=>x.type==='water'),anim)}catch(e){console.warn(e)}});
}
async function renderWaterInto(el,wdg){
  if(!el)return;
  await ensureWater();
  { const dd=today(); /* today every time (1 read); the six days before it only once per day per session, they rarely change */ const full=waterPastDoneFor!==dd; waterPastDoneFor=dd; await reconcileWater(full?Array.from({length:7},(_,i)=>addDays(dd,i-6)):[dd]); }
  waterPaint(el,wdg||state.widgets.find(x=>x.type==='water'));
  waterStartTick();
}
function waterStartTick(){
  if(wtTimer)return;let n=0;
  wtTimer=setInterval(()=>{
    if(document.hidden||!state.water||!document.querySelector('[data-widget-type="water"] .widget-card-body'))return;
    n++;if(n%10===0)reconcileWater([today()]).then(()=>waterRepaintAll()).catch(()=>{});
    waterNotify();if(!wtUi.custom&&!wtUi.planAdd)waterRepaintAll();
  },30000);
}
function waterPaint(el,wdg,anim){
  if(!el||!state.water)return;
  const w=state.water,S=wsAll(wdg,WIDGET_TYPES.water),td=today(),nowM=wNow();
  if(waterView&&waterView>=td)waterView=null;
  const k=waterView||td,isT=k===td,past=!isT,G=waterGoalFor(k),t=waterTotal(k),pct=Math.min(100,t/G*100);
  const size=wtSize(el);el._wtSz=size;
  ['wt-sm','wt-md','wt-lg','wt-wide'].forEach(c=>el.classList.remove(c));el.classList.add('wt','wt-'+size);
  const fig=/anusha/i.test(state.profile||'')?'f':'m',shapes=WT_BODY[fig];
  const s0=minutes(w.start),e0=minutes(w.end),frac=Math.max(0,Math.min(1,(nowM-s0)/(e0-s0))),exp=G*frac,diff=t-exp;
  const keys=wtKeys(),ix=keys.indexOf(k);
  // pace pill
  let pace='',pcls='';
  if(t>=G){pcls=' hit';pace=isT?'Done for the day':'Goal hit'}
  else if(past){pcls=' behind';pace=waterFmt(G-t)+' short of goal'}
  else if(!S.pace){pace=''}
  else if(nowM<s0)pace='Day starts at '+time12(w.start);
  else if(nowM>=e0){pcls=' behind';pace=waterFmt(G-t)+' short of goal'}
  else if(diff>=-G*.03)pace='On pace'+(diff>G*.05?' · '+waterFmt(diff)+' ahead':'');
  else{pcls=' behind';pace=waterFmt(-diff)+' behind pace'}
  // plan rows
  const plan=waterPlanList(k).slice().sort((a,b)=>a.time-b.time),rows=plan.map(p=>({p,st:wStatus(p,k)}));
  const slotHtml=rows.length?rows.map(({p,st})=>{
    const part=(st.s!=='done'&&st.fill>0)?'<small>'+esc(waterFmt(st.fill))+' of '+esc(waterFmt(p.ml))+'</small>':'';
    const lab=part+(st.s==='done'?'<small>drank'+(st.at==null?'':' at '+esc(wT(st.at)))+'</small>':st.s==='missed'?'<small>missed</small>':st.s==='due'?'<small>due now</small>':st.s==='skipped'?'<small>skipped</small>':(w.rem&&p.remind!==false&&isT?'<small>reminder on</small>':''));
    const un=(st.fill>0&&st.s!=='done')?'<button type="button" data-wt-un="'+esc(p.id)+'">Untick</button>':'';
    const acts=un+(st.s==='missed'?'<button type="button" class="go" data-wt-do="'+esc(p.id)+'" data-w="plan">I drank it</button>'+(isT?'<button type="button" data-wt-do="'+esc(p.id)+'" data-w="now">Now</button>':'')+'<button type="button" data-wt-skip="'+esc(p.id)+'">Skip</button>'
      :st.s==='due'?'<button type="button" class="go" data-wt-do="'+esc(p.id)+'" data-w="now">Drank it</button><button type="button" data-wt-skip="'+esc(p.id)+'">Skip</button>'
      :st.s==='up'?(isT?'<button type="button" data-wt-bell="'+esc(p.id)+'" aria-label="Reminder on or off">'+(p.remind!==false?'🔔':'🔕')+'</button>':'')+'<button type="button" data-wt-del="'+esc(p.id)+'" aria-label="Remove from plan">×</button>'
      :st.s==='skipped'?'<button type="button" data-wt-skip="'+esc(p.id)+'">undo</button>':'<button type="button" data-wt-un="'+esc(p.id)+'">Untick</button>');
    const dot=st.s==='done'?' data-wt-un="'+esc(p.id)+'"':st.s==='missed'?' data-wt-do="'+esc(p.id)+'" data-w="plan"':st.s==='due'?' data-wt-do="'+esc(p.id)+'" data-w="now"':'';
    return '<div class="wt-slot s'+st.s+'"><span class="wt-tm">'+esc(time12(wHm(p.time))).replace(' ','<br>')+'</span><button type="button" class="wt-dot"'+dot+' aria-label="'+st.s+'">'+(st.s==='done'?'✓':'')+'</button><span class="wt-nm">'+esc(waterFmt(p.ml))+lab+'</span><span class="wt-acts">'+acts+'</span></div>';
  }).join(''):'<div class="wt-empty">Nothing planned'+(isT?'. Add a drink or tap Auto-plan.':' that day.')+'</div>';
  // next line + reminder banner (today only)
  const nx=isT&&(rows.find(r=>r.st.s==='due'||r.st.s==='missed')||rows.find(r=>r.st.s==='up'));
  const nextLine=nx?(nx.st.s==='up'?'Next: <b>'+esc(waterFmt(nx.p.ml))+'</b> at '+esc(wT(nx.p.time)):nx.st.s==='due'?'<b>Time to drink '+esc(waterFmt(nx.p.ml))+'</b>':'<b>Missed '+esc(waterFmt(nx.p.ml))+'</b> at '+esc(wT(nx.p.time))):'';
  const due=isT&&waterDue();
  const banner=due?'<div class="wt-remind"><b>Time to drink '+esc(waterFmt(due.ml))+'</b><small>Planned for '+esc(wT(due.time))+'</small><div class="wt-rb"><button type="button" class="pri" data-wt-do="'+esc(due.id)+'" data-w="now">Drank it</button><button type="button" data-wt-snz="'+esc(due.id)+'">Snooze '+w.snooze+' min</button><button type="button" data-wt-skip="'+esc(due.id)+'">Skip</button></div></div>':'';
  // buttons
  const btns=[[w.ncup,w.cup,''],[w.nbottle,w.bottle,'']];if(w.third>0)btns.push([w.nthird,w.third,'wt-hs']);
  const btnHtml=btns.map(([n,v,c])=>'<button type="button" class="'+c+'" data-wt-add="'+v+'">+ '+esc(n)+'<small>'+esc(waterFmt(v))+'</small></button>').join('')+'<button type="button" class="wt-cu" data-wt-custom aria-label="Custom amount or time">+ Custom<small>any amount</small></button>';
  const last=waterSips(k).length?waterSips(k)[waterSips(k).length-1]:null;
  // 30-day chart
  const weekHtml=keys.map(d=>{const v=waterTotal(d),g=waterGoalFor(d),dd=Number(d.slice(8)),mon=new Date(d+'T12:00:00').toLocaleDateString([],{month:'short'});
    return '<div class="wt-wc'+(d===td?' today':'')+(d===k?' sel':'')+'" data-wt-day="'+d+'" title="'+esc(wtLabel(d)+': '+waterFmt(v)+' of '+waterFmt(g))+'"><div class="wt-wbar"><em class="'+(v>=g?'hit':'')+'" style="height:'+Math.max(8,Math.min(100,v/g*100))+'%"></em></div><b>'+(d===td?'Today':new Date(d+'T12:00:00').toLocaleDateString([],{weekday:'narrow'}))+'</b><i>'+(dd===1?esc(mon)+' 1':dd)+'</i></div>'}).join('');
  const st=waterStreak();
  // when you drink (last 7 days, timed drinks only): the same data Gym insights reads
  const hr=new Array(17).fill(0);keys.slice(-7).forEach(d=>waterSips(d).forEach(x=>{if(x.at==null)return;const h=Math.floor(x.at/60);if(h>=6&&h<=22)hr[h-6]+=x.ml}));
  const mx=Math.max(1,...hr),top=hr.map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0]).slice(0,2).map(x=>x[1]),any=hr.some(v=>v>0);
  const patHtml='<div class="wt-sh"><span>When you drink</span><span>last 7 days</span></div>'+(any?'<div class="wt-pbars">'+hr.map((v,i)=>'<i class="'+(top.includes(i)&&v>0?'pk':'')+'" style="height:'+Math.max(3,v/mx*100)+'%" title="'+esc(wT((i+6)*60)+': '+waterFmt(v))+'"></i>').join('')+'</div><div class="wt-ax"><span>6 AM</span><span>12 PM</span><span>10 PM</span></div><small>Busiest around '+esc(wT((top[0]+6)*60).replace(':00',''))+'. Gym insights reads this.</small>':'<div class="wt-empty">Log a few drinks and your pattern shows here.</div>');
  const prevLvl=el._wtLv!=null?el._wtLv:152,prevW=el._wtW!=null?el._wtW:0;
  const lvl=152-Math.min(1,t/G)*0.70*148-8;
  const BK=(id,h)=>h?'<div data-blk="'+id+'">'+h+'</div>':'';
  const html=
   '<div class="wt-main"><div class="wt-colA">'+
   BK('alerts',(past?'<div class="wt-dayhead"><button type="button" data-wt-nav="-1" '+(ix<=0?'disabled':'')+' aria-label="Previous day">‹</button><b>'+esc(wtLabel(k))+'</b><button type="button" data-wt-nav="1" '+(ix>=29?'disabled':'')+' aria-label="Next day">›</button><button type="button" data-wt-today>Today</button></div>':'')+banner)+
   '<div class="wt-hero">'+BK('fig','<div class="wt-fig" title="Your body is about 70% water. Your goal fills it to the line."><div class="wt-say"></div><div class="wt-stream"></div>'+
   '<svg viewBox="0 0 110 160"><defs><clipPath id="wtgc">'+shapes+'</clipPath><linearGradient id="wtwg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--w1)"/><stop offset="1" stop-color="var(--w2)"/></linearGradient></defs>'+
   '<g class="wt-bodyw"><g fill="none" stroke="var(--faint)" stroke-width="5" stroke-linejoin="round">'+shapes+'</g><g fill="var(--wsoft)">'+shapes+'</g>'+
   '<g clip-path="url(#wtgc)"><g class="wt-lvl" style="transform:translateY('+prevLvl+'px)" data-to="'+lvl+'"><g class="wt-wave2"><path d="M-60 6q15-9 30 0t30 0 30 0 30 0 30 0 30 0 30 0V200H-60z" fill="var(--w1)"/></g><g class="wt-wave1"><path d="M-60 8q15-9 30 0t30 0 30 0 30 0 30 0 30 0 30 0V200H-60z" fill="url(#wtwg)"/></g></g></g></g>'+
   '<line x1="6" x2="94" y1="48.4" y2="48.4" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3" opacity=".7"/><text class="wt-lim" x="96" y="51">70%</text></svg></div>')+'<div class="wt-nums">'+BK('amt','<div class="wt-big">'+esc(waterFmt(t))+'</div><div class="wt-of">of '+esc(waterFmt(G))+(t>=G?' · goal hit':'')+'</div>'+(pace?'<span class="wt-pace'+pcls+'">'+esc(pace)+'</span>':''))+BK('btns','<div class="wt-btns">'+btnHtml+'</div>'+
   '<div class="wt-custom'+(wtUi.custom?' on':'')+'"><input type="number" inputmode="decimal" step="any" data-wt-cin placeholder="Amount in '+w.unit+'"><input type="time" data-wt-ctime value="'+wHm(isT?nowM:720)+'" title="When did you drink it?"><button type="button" data-wt-cgo>Add</button></div>')+'</div></div>'+
   BK('pace',(isT?'<div class="wt-trackw"><div class="wt-track"><i style="width:'+prevW+'%" data-to="'+pct+'"></i>'+(S.pace?'<s style="left:calc('+(exp/G*100)+'% - 1px)"></s>':'')+'</div>'+(S.pace?'<div class="wt-tl"><span>'+esc(time12(w.start))+'</span><span>'+esc(time12(w.end))+'</span></div>':'')+'</div>':'')+(nextLine&&!S.plan?'<div class="wt-next">'+nextLine+'</div>':''))+
   BK('undo',(last?'<button type="button" class="wt-undo" data-wt-undo>Undo last drink ('+esc(waterFmt(last.ml)+(past||last.at==null?'':' · '+wT(last.at)))+')</button>':''))+
   BK('plan',(S.plan?'<div class="wt-plan"><div class="wt-ph"><span>'+(isT?'Plan for today':'Plan for '+esc(wtLabel(k)))+'</span>'+(isT?'<div><button type="button" class="wt-mini" data-wt-auto>Auto-plan</button><button type="button" class="wt-mini" data-wt-addplan>+ Add</button></div>':'')+'</div>'+
     '<div class="wt-addrow'+(wtUi.planAdd&&isT?' on':'')+'"><input type="time" data-wt-pt value="'+wHm(Math.min(1380,Math.ceil((nowM+30)/30)*30))+'"><input type="number" inputmode="decimal" step="any" data-wt-pa placeholder="Amount" value="'+waterToUnit(w.bottle)+'"><button type="button" data-wt-pgo>Plan it</button></div>'+slotHtml+'</div>':''))+
   '</div><div class="wt-colB">'+
   BK('week',((S.week||S.streak)?'<div class="wt-foot">'+(S.week?'<div class="wt-week" data-wt-week>'+weekHtml+'</div>':'')+(S.streak?'<div class="wt-streak"><b>'+st+'</b>'+(st===1?'day':'days')+' streak</div>':'')+'</div>':''))+
   BK('pattern',(S.pat?'<div class="wt-pat">'+patHtml+'</div>':''))+
   '</div></div>';
  const keepScroll=el.querySelector('[data-wt-week]');const ws=keepScroll?keepScroll.scrollLeft:null,wasEnd=keepScroll?(keepScroll.scrollWidth-keepScroll.clientWidth-keepScroll.scrollLeft<4):true;
  el.innerHTML=html;el._wtLv=lvl;el._wtW=pct;
  requestAnimationFrame(()=>{const l=el.querySelector('.wt-lvl');if(l)l.style.transform='translateY('+lvl+'px)';const b=el.querySelector('.wt-track i');if(b)b.style.width=pct+'%';
    const wk=el.querySelector('[data-wt-week]');if(wk){if(ws==null||wasEnd)wk.scrollLeft=wk.scrollWidth;else wk.scrollLeft=ws}});
  if(!el._wtRO&&window.ResizeObserver){el._wtRO=new ResizeObserver(()=>{if(el.isConnected&&wtSize(el)!==el._wtSz)waterPaint(el,wdg)});el._wtRO.observe(el)}
  wtWire(el,wdg,S);
  if(anim)wtAnimate(el,S,anim);
}
function wtAnimate(el,S,kind){
  if(!S.anim)return;const f=el.querySelector('.wt-fig');if(!f)return;
  f.classList.add('pour','gulp');setTimeout(()=>f.classList.remove('pour','gulp'),1300);
  for(let i=0;i<5;i++){const d=document.createElement('i');d.className='wt-drop';d.style.left=(36+Math.random()*30)+'px';d.style.top='-6px';f.appendChild(d);
    d.animate([{opacity:.9,transform:'translateY(0)'},{opacity:0,transform:'translateY('+(18+Math.random()*26)+'px)'}],{duration:600+Math.random()*350,delay:i*70,easing:'ease-in'}).onfinish=()=>d.remove()}
  const say=f.querySelector('.wt-say');if(say){say.textContent=kind==='goal'?'Goal hit!':WT_LINES[Math.floor(Math.random()*WT_LINES.length)];say.classList.add('show');setTimeout(()=>say.classList.remove('show'),1300)}
  if(kind==='goal'){for(let i=0;i<14;i++){const p=document.createElement('i');p.style.cssText='position:absolute;left:50%;top:30%;width:6px;height:6px;border-radius:2px;background:'+['#5fb4e6','#3a95cf','#ffd166','#7bdca0','#ff8fab'][i%5]+';pointer-events:none';f.appendChild(p);
    const a=Math.random()*Math.PI*2,r=40+Math.random()*50;p.animate([{transform:'translate(0,0)',opacity:1},{transform:'translate('+Math.cos(a)*r+'px,'+(Math.sin(a)*r-20)+'px) rotate(300deg)',opacity:0}],{duration:900+Math.random()*500,easing:'cubic-bezier(.2,.7,.3,1)'}).onfinish=()=>p.remove()}}
}
function wtWire(el,wdg,S){
  const w=state.water;
  const cur=()=>waterView||today();
  const doAdd=(ml,at)=>{const k=cur(),was=waterTotal(k)<waterGoalFor(k),r=waterAddSip(k,ml,k===today()?(at==null?wNow():at):(at==null?null:at));
    waterRepaintAll(was&&waterTotal(k)>=waterGoalFor(k)?'goal':'pour');
    toast('+'+waterFmt(r.s.ml)+(k===today()?' at '+wT(r.s.at):' on '+wtLabel(k))+(r.matched?' · counted for your '+wT(r.matched.time)+' drink':''),'Undo',()=>{waterRemoveSips(k,[r.s.id]);waterRepaintAll()});};
  const undoToast=(msg,k,gone)=>toast(msg,'Undo',()=>{waterRestoreSips(k,gone);waterRepaintAll()});
  el.onclick=e=>{
    const q=s=>e.target.closest(s);let x;
    if(x=q('[data-wt-add]')){doAdd(Number(x.dataset.wtAdd));return}
    if(q('[data-wt-custom]')){wtUi.custom=!wtUi.custom;waterPaint(el,wdg);if(wtUi.custom){const i=el.querySelector('[data-wt-cin]');if(i)i.focus()}return}
    if(q('[data-wt-cgo]')){const v=parseFloat(el.querySelector('[data-wt-cin]').value);if(!(v>0&&v<5000)){toast('Enter an amount');return}
      const tv=el.querySelector('[data-wt-ctime]').value;wtUi.custom=false;doAdd(waterFromUnit(v),tv?minutes(tv):null);return}
    if(q('[data-wt-undo]')){const k=cur(),l=waterSips(k);if(!l.length)return;const gone=waterRemoveSips(k,[l[l.length-1].id]);waterRepaintAll();undoToast('Removed '+waterFmt(gone[0].ml),k,gone);return}
    if(x=q('[data-wt-do]')){const k=cur(),p=waterPlanList(k).find(z=>z.id===x.dataset.wtDo);if(!p)return;
      const at=(x.dataset.w==='now'&&k===today())?wNow():p.time,rest=Math.max(50,p.ml-wFill(p,k)),was=waterTotal(k)<waterGoalFor(k);
      const r=waterAddSip(k,rest,at,p.id,'plan');delete waterSnooze[p.id];waterRepaintAll(was&&waterTotal(k)>=waterGoalFor(k)?'goal':'pour');
      toast('Logged '+waterFmt(rest)+' at '+wT(at),'Undo',()=>{waterRemoveSips(k,[r.s.id]);waterRepaintAll()});return}
    if(x=q('[data-wt-un]')){const k=cur(),id=x.dataset.wtUn,ids=waterSips(k).filter(s=>s.plan===id).map(s=>s.id);if(!ids.length)return;
      const gone=waterRemoveSips(k,ids);waterRepaintAll();undoToast('Unticked: removed '+waterFmt(gone.reduce((a,s)=>a+s.ml,0)),k,gone);return}
    if(x=q('[data-wt-skip]')){const p=waterPlanList(cur()).find(z=>z.id===x.dataset.wtSkip);if(p){p.skipped=!p.skipped;saveWater();waterRepaintAll()}return}
    if(x=q('[data-wt-del]')){const pl=waterPlan(today()),i=pl.findIndex(z=>z.id===x.dataset.wtDel);if(i<0)return;const p=pl.splice(i,1)[0];waterPlanChanged();waterRepaintAll();
      toast('Removed from plan','Undo',()=>{pl.splice(i,0,p);waterPlanChanged();waterRepaintAll()});return}
    if(x=q('[data-wt-bell]')){const p=waterPlan(today()).find(z=>z.id===x.dataset.wtBell);if(p){p.remind=p.remind===false;waterPlanChanged();waterRepaintAll()}return}
    if(x=q('[data-wt-snz]')){waterSnooze[x.dataset.wtSnz]=wNow()+w.snooze;waterRepaintAll();toast('Snoozed '+w.snooze+' min');return}
    if(q('[data-wt-addplan]')){wtUi.planAdd=!wtUi.planAdd;waterPaint(el,wdg);return}
    if(q('[data-wt-pgo]')){const v=parseFloat(el.querySelector('[data-wt-pa]').value),tv=el.querySelector('[data-wt-pt]').value;
      if(!(v>0)||!tv){toast('Pick a time and amount');return}
      if(!waterPlan(today()))state.water.plans[today()]=[];waterPlan(today()).push({id:'p'+wId(),time:minutes(tv),ml:waterFromUnit(v),remind:true});wtUi.planAdd=false;waterPlanChanged();waterRepaintAll();return}
    if(q('[data-wt-auto]')){
      const d=today(),pl=waterPlanList(d),before=JSON.stringify(pl),s0=minutes(w.start),e0=minutes(w.end),step=w.every*60,nowM=wNow(),left=Math.max(0,waterGoalFor(d)-waterTotal(d));
      const kept=pl.filter(p=>wFill(p,d)>0||p.skipped),times=[];let tm=nowM<s0?s0:Math.max(s0,Math.ceil((nowM+1)/step)*step);
      for(;tm<=e0;tm+=step)times.push(tm);if(!times.length){toast('No time left in your day');return}
      const each=Math.max(100,Math.round(left/times.length/50)*50);
      state.water.plans[d]=kept.concat(times.map(m=>({id:'p'+wId(),time:m,ml:each,remind:true})));waterPlanChanged();waterRepaintAll();
      toast('Planned '+times.length+' drinks of '+waterFmt(each),'Undo',()=>{state.water.plans[d]=JSON.parse(before);waterPlanChanged();waterRepaintAll()});return}
    if(x=q('[data-wt-nav]')){const keys=wtKeys(),i=keys.indexOf(cur())+Number(x.dataset.wtNav);if(i>=0&&i<keys.length){waterView=keys[i]===today()?null:keys[i];waterRepaintAll()}return}
    if(q('[data-wt-today]')){waterView=null;waterRepaintAll();return}
    if(x=q('[data-wt-day]')){const d=x.dataset.wtDay;waterView=d===today()?null:d;waterRepaintAll();el.scrollTo({top:0,behavior:'smooth'});return}
    if(q('.wt-fig')){const f=q('.wt-fig');f.classList.remove('wig');void f.offsetWidth;f.classList.add('wig');setTimeout(()=>f.classList.remove('wig'),700)}   // a wiggle, nothing is logged
  };
  el.onkeydown=e=>{if(e.key==='Enter'){if(e.target.matches('[data-wt-cin],[data-wt-ctime]'))el.querySelector('[data-wt-cgo]').click();if(e.target.matches('[data-wt-pa],[data-wt-pt]'))el.querySelector('[data-wt-pgo]').click()}};
}

/* ---- Photo widget: a small self-contained gallery. Each widget instance
   (WIDGET_TYPES.photos.multiple) keeps its own library, keyed by the widget's
   id, in one Firestore doc per profile:
   users/{uid}/hub-profiles/{profile}/data/photos  ->  {byWidget:{[id]:[{id,src,cap?,fav?}]}}
   (old photos without cap/fav keep working). The shared doc has a combined
   size budget (PHOTO_MAX_BASE64_TOTAL) across every instance. Every change
   re-reads the doc first and only replaces THIS widget's list, so another
   device or another photo widget is never overwritten, and a failed save is
   rolled back and said out loud instead of silently lost. ---- */
const PHOTO_MAX_COUNT=24; // per widget instance
const PHOTO_MAX_BASE64_TOTAL=900000; // combined across every photo widget instance — keeps the shared doc under Firestore's ~1MiB cap
let photoWidgetRuntime={}; // { [widgetId]: {order(ids),pos,shuffle,playing,timer,sig,editing} } — browsing/playback state, not persisted
let photoQueue=Promise.resolve();
function pwRuntime(widgetId){
  return photoWidgetRuntime[widgetId] || (photoWidgetRuntime[widgetId]={order:[],pos:0,shuffle:false,playing:false,timer:null,sig:'',editing:false});
}
function photoWidgetPhotos(widgetId){
  return state.photosByWidget[widgetId] || (state.photosByWidget[widgetId]=[]);
}
function pwSettings(widgetId){return wsAll(state.widgets.find(x=>x.id===widgetId),WIDGET_TYPES.photos)}
function pwVisible(photos,S){
  const favs=photos.filter(p=>p.fav);
  return S.only==='fav'&&favs.length?favs:photos;
}
// Per-photo crop: fx/fy = the point of the picture you want centred (0-100 %), z = zoom (1-4×). Stored on the photo itself.
function pwImgStyle(p){
  const z=Math.max(1,Math.min(4,+p.z||1)),fx=p.fx==null?50:+p.fx,fy=p.fy==null?50:+p.fy;
  if(z===1&&fx===50&&fy===50)return'';
  return ' style="object-position:'+fx+'% '+fy+'%;transform:scale('+z+');transform-origin:'+fx+'% '+fy+'%"';
}
function pwSpace(){return Math.min(100,Math.round(allPhotoWidgetsTotalLength()/PHOTO_MAX_BASE64_TOTAL*100))}
function photoWidgetBuildOrder(widgetId){
  const rt=pwRuntime(widgetId),photos=photoWidgetPhotos(widgetId),cur=rt.order[rt.pos];
  const ids=pwVisible(photos,pwSettings(widgetId)).map(p=>p.id);
  if(rt.shuffle){for(let i=ids.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}}
  rt.order=ids;
  const k=(!rt.shuffle&&cur)?ids.indexOf(cur):-1; // keep your place when the list is rebuilt without shuffling
  rt.pos=k>=0?k:0;
}
function pwRepaint(widgetId,el){
  const b=document.querySelector('[data-widget-id="'+widgetId+'"] .widget-card-body')||el;
  if(b&&b.isConnected)renderPhotoWidgetInto(b,widgetId);
}
// Replace only this widget's list in the shared doc. Resolves true when saved.
async function photoSave(widgetId,opt){
  opt=opt||{};
  const r=await readSafe(profileRef('hub-profiles','photos'),null);
  if(!r.ok)return false;
  const remote=r.val&&!Array.isArray(r.val)&&r.val.byWidget?r.val.byWidget:null;
  let out;
  if(remote){
    out=Object.assign({},remote);
    if(opt.drop)delete out[widgetId];else out[widgetId]=photoWidgetPhotos(widgetId);
    const total=Object.values(out).reduce((s,l)=>s+(l||[]).reduce((a,p)=>a+((p&&p.src)||'').length,0),0);
    if(total>PHOTO_MAX_BASE64_TOTAL+20000)return false; // another device filled the shared space
  }else out=state.photosByWidget; // first save after the old flat format
  try{await profileRef('hub-profiles','photos').set({json:JSON.stringify({byWidget:out})})}catch(e){return false}
  if(remote)for(const k of Object.keys(out)){if(k!==widgetId)state.photosByWidget[k]=out[k]}
  return true;
}
// Change this widget's list, save, and roll back (with a message) if it can't be saved.
function photoCommit(widgetId,mutate){
  const run=async()=>{
    const snap=photoWidgetPhotos(widgetId).map(p=>Object.assign({},p));
    mutate(photoWidgetPhotos(widgetId));
    const ok=await photoSave(widgetId);
    if(!ok){state.photosByWidget[widgetId]=snap;toast('Couldn’t save — check your connection and try again')}
    return ok;
  };
  photoQueue=photoQueue.then(run,run);
  return photoQueue;
}
function renderPhotoWidgetInto(el,widgetId){
  if(!el)return;
  const rt=pwRuntime(widgetId);
  if(rt.timer){clearInterval(rt.timer);rt.timer=null}
  const photos=photoWidgetPhotos(widgetId),S=pwSettings(widgetId);
  if(!photos.length){
    el.innerHTML='<div class="photo-widget"><div class="empty-state"><strong>No photos yet</strong>Add a few to start a little slideshow right here.'+
      '<button type="button" class="button secondary photo-widget-add-empty" data-photo-add><i data-lucide="plus"></i><span>Add photos</span></button></div>'+
      '<input type="file" accept="image/*" multiple hidden data-photo-file></div>';
    if(window.lucide)lucide.createIcons();
    el.querySelector('[data-photo-add]').addEventListener('click',()=>el.querySelector('[data-photo-file]').click());
    el.querySelector('[data-photo-file]').addEventListener('change',e=>{handlePhotoWidgetUpload(e.target.files,el,widgetId);e.target.value=''});
    return;
  }
  const sig=[S.shuf,S.auto,S.only].join();
  if(rt.sig!==sig){rt.sig=sig;rt.shuffle=!!S.shuf;rt.playing=!!S.auto;rt.order=[]} // a changed setting restarts from that setting
  const vis=pwVisible(photos,S);
  if(rt.order.length!==vis.length||!vis.every(p=>rt.order.includes(p.id)))photoWidgetBuildOrder(widgetId);
  rt.pos=((rt.pos%rt.order.length)+rt.order.length)%rt.order.length;
  const photo=photos.find(p=>p.id===rt.order[rt.pos])||photos[0];
  const n=rt.order.length,many=n>1,space=pwSpace();
  if(S.view==='grid'){
    const tiles=rt.order.map((id,i)=>{const ph=photos.find(x=>x.id===id);return ph?'<button type="button" class="pw-tile" data-pw-tile="'+i+'" aria-label="Open photo '+(i+1)+'"><img src="'+ph.src+'" alt="'+esc(ph.cap||'Photo')+'"'+pwImgStyle(ph)+'>'+(S.cap&&ph.cap?'<span>'+esc(ph.cap)+'</span>':'')+'</button>':''}).join('');
    el.innerHTML='<div class="photo-widget pw-gridview'+(S.fit==='fit'?' pw-contain':S.fit==='stretch'?' pw-stretch':'')+' pw-f-'+(S.focus||'center')+'"><div class="pw-grid">'+tiles+'</div>'+
      '<button type="button" class="pw-gadd" data-photo-add title="Add photos ('+Math.max(0,100-space)+'% space left)"><i data-lucide="plus"></i></button><input type="file" accept="image/*" multiple hidden data-photo-file></div>';
    if(window.lucide)lucide.createIcons();
    el.querySelector('[data-photo-add]').addEventListener('click',()=>el.querySelector('[data-photo-file]').click());
    el.querySelector('[data-photo-file]').addEventListener('change',e=>{handlePhotoWidgetUpload(e.target.files,el,widgetId);e.target.value=''});
    el.querySelectorAll('[data-pw-tile]').forEach(b=>b.addEventListener('click',()=>{if(widgetEditMode)return;rt.pos=+b.dataset.pwTile;if(S.zoom)photoLightbox(widgetId,el)}));
    return;
  }
  el.innerHTML='<div class="photo-widget'+(S.fit==='fit'?' pw-contain':S.fit==='stretch'?' pw-stretch':'')+' pw-f-'+(S.focus||'center')+' pw-bar-'+(S.bar||'always')+(rt.crop===photo.id?' pw-cropping':'')+'">'+
    '<div class="photo-widget-frame'+(S.zoom&&rt.crop!==photo.id?' pw-zoomable':'')+'" data-photo-frame><img src="'+photo.src+'" alt="'+esc(photo.cap||'Photo')+'"'+pwImgStyle(photo)+' draggable="false"></div>'+
    (rt.crop===photo.id?'<div class="pw-cropbar"><span>Drag the photo to choose what shows</span><input type="range" min="1" max="4" step="0.05" value="'+(+photo.z||1)+'" data-pw-z aria-label="Zoom"><button type="button" data-pw-creset>Reset</button><button type="button" class="pri" data-pw-cdone>Done</button></div>':'')+
    '<button type="button" class="pw-heart'+(photo.fav?' on':'')+'" data-photo-fav title="'+(photo.fav?'Remove from favourites':'Favourite')+'" aria-pressed="'+(photo.fav?'true':'false')+'"><i data-lucide="heart"></i></button>'+
    (S.cap&&photo.cap&&!rt.editing?'<div class="pw-cap">'+esc(photo.cap)+'</div>':'')+
    (rt.editing?'<form class="pw-capform" data-photo-capform><input type="text" maxlength="80" placeholder="Add a caption" value="'+esc(photo.cap||'')+'" data-photo-capin><button type="submit" class="icon-button" title="Save caption"><i data-lucide="check"></i></button><button type="button" class="icon-button" data-photo-capcancel title="Cancel"><i data-lucide="x"></i></button></form>':'')+
    '<div class="photo-widget-controls">'+
      '<button type="button" class="icon-button" data-photo-prev title="Previous photo"'+(many?'':' disabled')+'><i data-lucide="chevron-left"></i></button>'+
      '<button type="button" class="icon-button" data-photo-play title="'+(rt.playing?'Pause slideshow':'Play slideshow')+'"'+(many?'':' disabled')+'><i data-lucide="'+(rt.playing?'pause':'play')+'"></i></button>'+
      '<button type="button" class="icon-button" data-photo-next title="Next photo"'+(many?'':' disabled')+'><i data-lucide="chevron-right"></i></button>'+
      '<button type="button" class="icon-button'+(rt.shuffle?' active':'')+'" data-photo-shuffle title="Shuffle"'+(many?'':' disabled')+'><i data-lucide="shuffle"></i></button>'+
      '<span class="photo-widget-count">'+(rt.pos+1)+' / '+n+(space>=70?' · '+space+'% full':'')+'</span>'+
      '<button type="button" class="icon-button'+(rt.crop===photo.id?' active':'')+'" data-photo-crop title="Move and zoom the photo inside the frame"><i data-lucide="crop"></i></button>'+
      '<button type="button" class="icon-button" data-photo-cap title="Caption"><i data-lucide="type"></i></button>'+
      '<button type="button" class="icon-button" data-photo-add title="Add photos ('+Math.max(0,100-space)+'% space left)"><i data-lucide="plus"></i></button>'+
      '<button type="button" class="icon-button" data-photo-remove title="Remove this photo"><i data-lucide="trash-2"></i></button>'+
    '</div>'+
    '<input type="file" accept="image/*" multiple hidden data-photo-file>'+
  '</div>';
  if(window.lucide)lucide.createIcons();
  const advance=dir=>{rt.pos+=dir;renderPhotoWidgetInto(el,widgetId)};
  const q=s=>el.querySelector(s);
  q('[data-photo-prev]').addEventListener('click',()=>advance(-1));
  q('[data-photo-next]').addEventListener('click',()=>advance(1));
  q('[data-photo-shuffle]').addEventListener('click',()=>{rt.shuffle=!rt.shuffle;photoWidgetBuildOrder(widgetId);renderPhotoWidgetInto(el,widgetId)});
  q('[data-photo-play]').addEventListener('click',()=>{rt.playing=!rt.playing;renderPhotoWidgetInto(el,widgetId)});
  q('[data-photo-add]').addEventListener('click',()=>q('[data-photo-file]').click());
  q('[data-photo-file]').addEventListener('change',e=>{handlePhotoWidgetUpload(e.target.files,el,widgetId);e.target.value=''});
  q('[data-photo-fav]').addEventListener('click',async()=>{
    const id=photo.id,was=!!photo.fav;
    await photoCommit(widgetId,l=>{const p=l.find(x=>x.id===id);if(p){if(was)delete p.fav;else p.fav=true}});
    if(!was&&S.only==='fav')toast('Added to favourites');
    pwRepaint(widgetId,el);
  });
  q('[data-photo-cap]').addEventListener('click',()=>{rt.editing=true;renderPhotoWidgetInto(el,widgetId);const i=el.querySelector('[data-photo-capin]');if(i){i.focus();i.select()}});
  const cf=q('[data-photo-capform]');
  if(cf){
    const done=()=>{rt.editing=false;pwRepaint(widgetId,el)};
    cf.addEventListener('submit',async e=>{
      e.preventDefault();const id=photo.id,v=cf.querySelector('input').value.trim().slice(0,80);
      await photoCommit(widgetId,l=>{const p=l.find(x=>x.id===id);if(p){if(v)p.cap=v;else delete p.cap}});
      done();
    });
    q('[data-photo-capcancel]').addEventListener('click',done);
    cf.querySelector('input').addEventListener('keydown',e=>{if(e.key==='Escape')done()});
  }
  q('[data-photo-remove]').addEventListener('click',async()=>{
    const id=photo.id,idx=photos.findIndex(p=>p.id===id),keep=Object.assign({},photo);
    if(idx<0)return;
    const ok=await photoCommit(widgetId,l=>{const i=l.findIndex(p=>p.id===id);if(i>=0)l.splice(i,1)});
    if(!ok)return;
    pwRepaint(widgetId,el);
    toast('Photo removed','Undo',async()=>{
      const back=await photoCommit(widgetId,l=>{if(!l.some(p=>p.id===id))l.splice(Math.min(idx,l.length),0,keep)});
      if(back){const r2=pwRuntime(widgetId);r2.order=[];}
      pwRepaint(widgetId,el);
    });
  });
  // swipe to move, tap to enlarge
  const fr=q('[data-photo-frame]');let sx=null,sy=0,swiped=false;
  const cropping=rt.crop===photo.id;
  q('[data-photo-crop]').addEventListener('click',()=>{rt.crop=cropping?null:photo.id;renderPhotoWidgetInto(el,widgetId)});
  if(cropping){
    const img=fr.querySelector('img');let cur={fx:photo.fx==null?50:+photo.fx,fy:photo.fy==null?50:+photo.fy,z:+photo.z||1},drag=null;
    const apply=()=>{img.style.objectPosition=cur.fx+'% '+cur.fy+'%';img.style.transformOrigin=cur.fx+'% '+cur.fy+'%';img.style.transform='scale('+cur.z+')'};
    const save=async()=>{const id=photo.id,c=Object.assign({},cur);await photoCommit(widgetId,l=>{const p=l.find(x=>x.id===id);if(!p)return;if(c.z<=1.001&&Math.abs(c.fx-50)<.5&&Math.abs(c.fy-50)<.5){delete p.fx;delete p.fy;delete p.z}else{p.fx=Math.round(c.fx*10)/10;p.fy=Math.round(c.fy*10)/10;p.z=Math.round(c.z*100)/100}})};
    fr.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,fx:cur.fx,fy:cur.fy};try{fr.setPointerCapture(e.pointerId)}catch(x){}e.stopPropagation()});
    fr.addEventListener('pointermove',e=>{if(!drag)return;const W=fr.clientWidth||1,H=fr.clientHeight||1,iw=img.naturalWidth||W,ih=img.naturalHeight||H,s0=Math.max(W/iw,H/ih),ovX=iw*s0-W+W*(cur.z-1),ovY=ih*s0-H+H*(cur.z-1);
      cur.fx=Math.max(0,Math.min(100,drag.fx-(e.clientX-drag.x)/Math.max(20,ovX)*100));cur.fy=Math.max(0,Math.min(100,drag.fy-(e.clientY-drag.y)/Math.max(20,ovY)*100));apply()});
    const end=()=>{if(drag){drag=null;save()}};fr.addEventListener('pointerup',end);fr.addEventListener('pointercancel',end);
    fr.addEventListener('wheel',e=>{e.preventDefault();cur.z=Math.max(1,Math.min(4,cur.z+(e.deltaY<0?.1:-.1)));q('[data-pw-z]').value=cur.z;apply();clearTimeout(fr._wt);fr._wt=setTimeout(save,300)},{passive:false});
    q('[data-pw-z]').addEventListener('input',e=>{cur.z=+e.target.value;apply()});
    q('[data-pw-z]').addEventListener('change',save);
    q('[data-pw-creset]').addEventListener('click',async()=>{cur={fx:50,fy:50,z:1};apply();q('[data-pw-z]').value=1;await save()});
    q('[data-pw-cdone]').addEventListener('click',async()=>{await save();rt.crop=null;renderPhotoWidgetInto(el,widgetId)});
    return;
  }
  fr.addEventListener('pointerdown',e=>{sx=e.clientX;sy=e.clientY;swiped=false});
  fr.addEventListener('pointerup',e=>{
    if(sx===null)return;const dx=e.clientX-sx,dy=e.clientY-sy;sx=null;
    if(many&&Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.5){swiped=true;advance(dx<0?1:-1)}
  });
  fr.addEventListener('pointercancel',()=>{sx=null});
  fr.addEventListener('click',()=>{if(swiped||widgetEditMode||!S.zoom)return;photoLightbox(widgetId,el)});
  if(rt.playing&&many){
    rt.timer=setInterval(()=>{
      if(!el.isConnected){clearInterval(rt.timer);rt.timer=null;return}
      if(document.hidden||rt.editing||document.querySelector('.pw-lb'))return;
      advance(1);
    },Math.max(2,parseInt(S.speed,10)||5)*1000);
  }
}
function photoLightbox(widgetId,wel){
  const rt=pwRuntime(widgetId),photos=photoWidgetPhotos(widgetId),S=pwSettings(widgetId);
  const ids=rt.order.slice();let pos=rt.pos;
  if(!ids.length||document.querySelector('.pw-lb'))return;
  const lb=document.createElement('div');lb.className='pw-lb';lb.setAttribute('role','dialog');lb.setAttribute('aria-label','Photo');
  const draw=()=>{
    const p=photos.find(x=>x.id===ids[pos]);if(!p){close();return}
    lb.innerHTML='<img src="'+p.src+'" alt="'+esc(p.cap||'Photo')+'">'+
      (S.cap&&p.cap?'<div class="pw-lb-cap">'+esc(p.cap)+'</div>':'')+
      '<button type="button" class="pw-lb-x" data-lb-x title="Close"><i data-lucide="x"></i></button>'+
      (ids.length>1?'<button type="button" class="pw-lb-nav pw-lb-prev" data-lb-prev title="Previous"><i data-lucide="chevron-left"></i></button><button type="button" class="pw-lb-nav pw-lb-next" data-lb-next title="Next"><i data-lucide="chevron-right"></i></button>':'')+
      '<div class="pw-lb-n">'+(pos+1)+' / '+ids.length+'</div>';
    if(window.lucide)lucide.createIcons();
  };
  const step=d=>{pos=(pos+d+ids.length)%ids.length;draw()};
  const close=()=>{document.removeEventListener('keydown',key);lb.remove();rt.pos=Math.max(0,Math.min(rt.order.length-1,rt.order.indexOf(ids[pos])));pwRepaint(widgetId,wel)};
  const key=e=>{if(e.key==='Escape')close();else if(e.key==='ArrowRight'&&ids.length>1)step(1);else if(e.key==='ArrowLeft'&&ids.length>1)step(-1)};
  let sx=null;
  lb.addEventListener('pointerdown',e=>{sx=e.clientX});
  lb.addEventListener('pointerup',e=>{if(sx===null)return;const dx=e.clientX-sx;sx=null;if(ids.length>1&&Math.abs(dx)>45){lb.dataset.sw='1';step(dx<0?1:-1);setTimeout(()=>{delete lb.dataset.sw},50)}});
  lb.addEventListener('click',e=>{
    if(lb.dataset.sw)return;
    if(e.target.closest('[data-lb-prev]'))step(-1);
    else if(e.target.closest('[data-lb-next]'))step(1);
    else if(!e.target.closest('img'))close();
  });
  document.addEventListener('keydown',key);
  document.body.appendChild(lb);draw();
}
function allPhotoWidgetsTotalLength(){
  return Object.values(state.photosByWidget).reduce((sum,photos)=>sum+photos.reduce((s,p)=>s+p.src.length,0),0);
}
async function handlePhotoWidgetUpload(fileList,el,widgetId){
  const files=Array.from(fileList||[]).filter(f=>/^image\//.test(f.type));
  if(!files.length){if(fileList&&fileList.length)toast('Only photos can be added here');return}
  const photos=photoWidgetPhotos(widgetId);
  if(photos.length>=PHOTO_MAX_COUNT){toast('This photo widget is full ('+PHOTO_MAX_COUNT+') — remove a few first');return}
  toast('Adding '+files.length+' photo'+(files.length===1?'':'s')+'…');
  const fresh=[];let unreadable=0,skippedForSize=false,skippedForCount=false,used=allPhotoWidgetsTotalLength();
  for(const file of files){
    if(photos.length+fresh.length>=PHOTO_MAX_COUNT){skippedForCount=true;break}
    try{
      const img=await fileToImage(file);
      const dataUrl=compressImageToDataUrl(img,900,160000);
      if(!dataUrl){unreadable++;continue}
      if(used+dataUrl.length>PHOTO_MAX_BASE64_TOTAL){skippedForSize=true;break}
      used+=dataUrl.length;
      fresh.push({id:'ph-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),src:dataUrl});
    }catch(e){unreadable++}
  }
  let added=0;
  if(fresh.length){
    const ok=await photoCommit(widgetId,l=>{l.push(...fresh)});
    if(ok){added=fresh.length;pwRuntime(widgetId).order=[]}
  }
  if(added||unreadable||skippedForSize||skippedForCount){
    const bits=[];
    if(added)bits.push(added+' photo'+(added===1?'':'s')+' added');
    if(skippedForSize)bits.push('the rest didn’t fit — your photo space is full, remove a few');
    if(skippedForCount)bits.push('this widget holds '+PHOTO_MAX_COUNT+' at most');
    if(unreadable)bits.push(unreadable+' couldn’t be read (try JPG or PNG)');
    if(added||!fresh.length)toast(bits.join(' · '));
  }
  pwRepaint(widgetId,el);
}
/* ---- Notes & lists widget ------------------------------------------------
   One widget, two kinds of card.
     notes   -> todo-profiles/{profile}/data/stickyNotes   (same doc as the To-Do app)
     lists   -> apps/checklist/data/state                  (same doc as the Checklists app:
                                                            owner 'shared' = both of you, otherwise private)
   Every change is a transaction: read the current document, change only the
   one note / list, write it back. A stale copy can never overwrite newer
   data, a failed save is said out loud and nothing half-saved stays on screen.
   Deleting never destroys: notes and lists go to "Recently deleted" for 30 days.
   Logic lives in assets/notes-core.js (NotesCore). ---------------------------- */
const nw={notes:[],lists:[],got:{n:false,l:false},err:false,unN:null,unL:null,view:'main',q:'',menu:false,help:false,focus:null,pending:false,down:false,q2:Promise.resolve(),undo:null,linkT:null,paintT:null};
const nwNoteRef=()=>profileRef('todo-profiles','stickyNotes');
const nwListRef=()=>appRef('checklist','state');
const nwOtherRef=p=>db.collection('users').doc(state.user.uid).collection('todo-profiles').doc(p).collection('data').doc('stickyNotes');
const nwTasksRef=()=>profileRef('todo-profiles','tasks');
const nwOther=()=>state.profile==='Bhargav'?'Anusha':'Bhargav';
const nwEls=()=>Array.from(document.querySelectorAll('[data-widget-type="notes"] .widget-card-body'));
function nwStatus(s){nw.saved=s;document.querySelectorAll('[data-widget-type="notes"] .nw-saved').forEach(e=>{e.textContent=s;e.classList.toggle('bad',/Couldn/.test(s))})}
function nwSettings(){return wsAll(state.widgets.find(x=>x.type==='notes'),WIDGET_TYPES.notes)}
function nwQueue(task){const p=nw.q2.then(task,task);nw.q2=p.catch(()=>{});return p}
function nwFail(e,what){nwStatus('Couldn’t save');toast(e&&e.full?'That is too big to save — trim it or delete something':'Couldn’t save '+(what||'that')+' — check your connection and try again')}
function nwLinkSoon(){clearTimeout(nw.linkT);nw.linkT=setTimeout(()=>{try{linkRun(false)}catch(e){}},2500)}
function nwSetUndo(label,fn){nw.undo={label,fn};toast(label,'Undo',async()=>{const u=nw.undo;nw.undo=null;if(u)await u.fn()})}

/* ---- storage (transactions) ---- */
function nwNotesTx(fn,other,quiet){
  return nwQueue(async()=>{
    nwStatus('Saving…');
    try{
      let out=null,skipped=false;
      await db.runTransaction(async tx=>{
        const ref=other?nwOtherRef(other):nwNoteRef(),sn=await tx.get(ref);
        let list=sn.exists&&sn.data().json?NotesCore.parseNotes(sn.data().json):[];
        skipped=false;if(fn(list)===false){skipped=true;return}
        list=NotesCore.purge(list);
        if(NotesCore.docSize(list)>NotesCore.LIM.docChars)throw Object.assign(new Error('full'),{full:true});
        tx.set(ref,{json:JSON.stringify(list)});out=list;
      });
      if(!skipped&&!other){nw.notes=out;if(!quiet)nwPaint(true)}
      nwStatus(skipped?'':'Saved ✓');return{ok:true,skipped,list:out};
    }catch(e){console.warn(e);nwFail(e,'the note');return{ok:false}}
  });
}
function nwListsTx(fn){
  return nwQueue(async()=>{
    nwStatus('Saving…');
    try{
      let out=null,skipped=false;
      await db.runTransaction(async tx=>{
        const ref=nwListRef(),sn=await tx.get(ref);
        const lists=sn.exists&&sn.data().json?NotesCore.parseLists(sn.data().json):[];
        skipped=false;if(fn(lists)===false){skipped=true;return}
        const s=JSON.stringify({version:1,lists});
        if(s.length>900000)throw Object.assign(new Error('full'),{full:true});
        tx.set(ref,{json:s,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});out=lists;
      });
      if(!skipped){nw.lists=out;nwPaint(true);nwLinkSoon()}
      nwStatus(skipped?'':'Saved ✓');return{ok:true,skipped};
    }catch(e){console.warn(e);nwFail(e,'the list');return{ok:false}}
  });
}

/* ---- note operations ---- */
async function notesAdd(text,opt){
  opt=opt||{};const n=NotesCore.newNote(text,opt.color,opt.from);let full=false;
  const r=await nwNotesTx(l=>{if(NotesCore.live(l).length>=NotesCore.LIM.notes){full=true;return false}l.unshift(n)});
  if(full){toast('You have '+NotesCore.LIM.notes+' notes — delete a few first');return{ok:false,full:true}}
  if(r.ok&&!opt.quiet)nwLinkSoon();
  return{ok:r.ok,id:n.id};
}
async function notesEdit(id,patch,quiet){return nwNotesTx(l=>{if(!NotesCore.patchNote(l,id,patch))return false},null,quiet)}
async function notesDelete(id){
  const r=await nwNotesTx(l=>{if(!NotesCore.softDelete(l,id))return false});
  if(r.ok&&!r.skipped)nwSetUndo('Note deleted',()=>notesRestore(id));
  return r;
}
async function notesRestore(id){return nwNotesTx(l=>{if(!NotesCore.restore(l,id))return false})}
async function notesForever(id){return nwNotesTx(l=>{const i=l.findIndex(n=>n.id===id);if(i<0)return false;l.splice(i,1)})}
async function nwSendNote(id){
  const n=nw.notes.find(x=>x.id===id);if(!n)return;const to=nwOther(),copy=NotesCore.newNote(n.text,n.color,state.profile);
  const r=await nwNotesTx(l=>{l.unshift(copy)},to);
  if(r.ok)nwSetUndo('Sent a copy to '+to,()=>nwNotesTx(l=>{const i=l.findIndex(x=>x.id===copy.id);if(i<0)return false;l.splice(i,1)},to));
}
async function nwNoteToTask(id){
  const n=nw.notes.find(x=>x.id===id);if(!n)return;
  const txt=NotesCore.plain(n.text);if(!txt){toast('Write something in the note first');return}
  const parts=NotesCore.display(n.text).replace(/<\/(li|div|p)>|<br\s*\/?>/gi,'\n');const d=document.createElement('div');d.innerHTML=parts;
  const lines=(d.textContent||'').split('\n').map(s=>s.trim()).filter(Boolean),first=lines[0].slice(0,200),rest=lines.slice(1).join('\n').slice(0,1000);
  const P=(window.TodoCore?TodoCore.parse(first,{now:new Date(),me:state.profile}):null)||{title:first,due:null,time:null,pri:0,who:null,shared:false};
  const other=nwOther(),t0=today();
  const f={title:(P.title||first).slice(0,120),notes:rest,due:P.due||undefined,time:P.time||'',pri:P.pri||0,who:P.shared?'shared':(P.who&&P.who!==state.profile?P.who:'me')};
  const got=await nwTaskDialog(f,other,t0);if(!got)return;
  const shared=got.who!=='me';
  const task={id:'task-'+Date.now()+'-'+Math.floor(Math.random()*1000),title:got.title,done:false,priority:got.pri,startDate:t0,due:got.due||null,dueTime:got.due?(got.time||null):null,repeat:'none',notes:got.notes,link:'',tags:[],subtasks:[],listId:shared?'shared':'personal',createdBy:state.profile,order:Date.now(),createdAt:new Date().toISOString()};
  if(got.who!=='me'&&got.who!=='shared'){task.a=got.who;task.by=state.profile}
  const ref=shared?sharedTodoRef():nwTasksRef();
  const rr=await readSafe(ref,[]);if(!rr.ok||!Array.isArray(rr.val)){toast('Couldn’t reach your tasks — try again');return}
  const setList=l=>{if(shared)state.sharedTasks=l;else state.personalTasks=l};
  try{
    await ref.set({json:JSON.stringify(rr.val.concat([task])),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    setList(rr.val.concat([task]));if(typeof renderDashboard==='function')renderDashboard();
    nwSetUndo('Task added to '+(shared?'the shared To-Do':'your To-Do'),async()=>{const r2=await readSafe(ref,[]);if(!r2.ok)return toast('Couldn’t undo — try again');const keep=r2.val.filter(t=>t.id!==task.id);await ref.set({json:JSON.stringify(keep),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});setList(keep);if(typeof renderDashboard==='function')renderDashboard()});
  }catch(e){toast('Couldn’t add the task — try again')}
}
/* asks for what a task needs (day, how important, whose it is) before anything is created */
function nwTaskDialog(f,other,t0){
  return new Promise(res=>{
    document.querySelectorAll('.nw-tdm').forEach(x=>x.remove());
    const st={title:f.title,notes:f.notes,due:f.due,time:f.time,pri:f.pri,who:f.who,pick:false};
    const tm=addDays(t0,1);
    const m=document.createElement('div');m.className='nw-tdm';m.setAttribute('role','dialog');m.setAttribute('aria-label','New task from note');
    const draw=()=>{
      const dChoice=st.due===null?'none':st.due===t0?'today':st.due===tm?'tom':st.due?'pick':'';
      const ask=st.due===undefined;
      m.innerHTML='<form class="nw-tdb"><h3>Make a task</h3>'+
        '<label>What<input type="text" data-f="title" maxlength="120" value="'+esc(st.title)+'"></label>'+
        '<div class="nw-tdr"><span>When'+(ask?'<em> · pick a day, or No date</em>':'')+'</span><div class="nw-tdsg'+(ask?' ask':'')+'">'+
          [['today','Today'],['tom','Tomorrow'],['pick','Pick…'],['none','No date']].map(([k,l])=>'<button type="button" data-d="'+k+'" class="'+(dChoice===k?'on':'')+'">'+l+'</button>').join('')+'</div>'+
          '<div class="nw-tdx'+(dChoice==='pick'||st.pick?' show':'')+'"><input type="date" data-f="due" value="'+(st.due&&dChoice==='pick'?st.due:'')+'" min="'+t0+'"><input type="time" data-f="time" value="'+esc(st.time||'')+'" title="Time (optional)"></div>'+
          (st.due&&dChoice!=='pick'&&dChoice!=='none'?'<div class="nw-tdx show"><input type="time" data-f="time" value="'+esc(st.time||'')+'" title="Time (optional)"><small>Time (optional)</small></div>':'')+'</div>'+
        '<div class="nw-tdr"><span>How important</span><div class="nw-tdsg">'+[[0,'Normal'],[1,'Low'],[2,'Important'],[3,'Urgent']].map(([v,l])=>'<button type="button" data-p="'+v+'" class="'+(st.pri===v?'on':'')+'">'+l+'</button>').join('')+'</div></div>'+
        '<div class="nw-tdr"><span>Whose</span><div class="nw-tdsg">'+[['me','Just me'],['shared','Both of us'],[other,'For '+other]].map(([v,l])=>'<button type="button" data-w="'+esc(v)+'" class="'+(st.who===v?'on':'')+'">'+esc(l)+'</button>').join('')+'</div></div>'+
        '<label>Notes<textarea data-f="notes" rows="2" maxlength="1000">'+esc(st.notes)+'</textarea></label>'+
        '<div class="nw-tda"><button type="button" data-x>Cancel</button><button type="submit" class="go"'+(ask||!st.title.trim()?' disabled':'')+'>Add task</button></div></form>';
    };
    const sync=()=>{const g=k=>{const e=m.querySelector('[data-f="'+k+'"]');return e?e.value:null};const t=g('title');if(t!==null)st.title=t;const nt=g('notes');if(nt!==null)st.notes=nt;const tt=g('time');if(tt!==null)st.time=tt;const dd=g('due');if(dd!==null&&dd)st.due=dd};
    const done=v=>{document.removeEventListener('keydown',onKey,true);m.remove();res(v)};
    const onKey=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();done(null)}};
    draw();document.body.appendChild(m);document.addEventListener('keydown',onKey,true);
    m.addEventListener('click',e=>{
      if(e.target===m){done(null);return}
      const b=e.target.closest('button');if(!b)return;
      if(b.hasAttribute('data-x')){done(null);return}
      sync();
      if(b.dataset.d){const k=b.dataset.d;if(k==='today')st.due=t0,st.pick=false;else if(k==='tom')st.due=tm,st.pick=false;else if(k==='none')st.due=null,st.pick=false,st.time='';else{st.pick=true;if(!st.due||st.due===t0||st.due===tm||st.due===null)st.due=st.due||undefined}draw();const di=m.querySelector('[data-f="due"]');if(di&&k==='pick')di.focus();return}
      if(b.dataset.p!==undefined){st.pri=+b.dataset.p;draw();return}
      if(b.dataset.w!==undefined){st.who=b.dataset.w;draw()}
    });
    m.addEventListener('input',e=>{if(e.target.matches('[data-f="due"]')&&e.target.value){st.due=e.target.value;st.pick=true;const sb=m.querySelector('.go');if(sb)sb.disabled=!st.title.trim();m.querySelectorAll('.nw-tdsg.ask').forEach(x=>x.classList.remove('ask'))}
      if(e.target.matches('[data-f="title"]')){const sb=m.querySelector('.go');if(sb)sb.disabled=st.due===undefined||!e.target.value.trim()}});
    m.addEventListener('submit',e=>{e.preventDefault();sync();if(st.due===undefined||!st.title.trim())return;done({title:st.title.trim().slice(0,120),notes:st.notes.trim(),due:st.due||null,time:st.time||'',pri:st.pri,who:st.who})});
    const ti=m.querySelector('[data-f="title"]');if(ti){ti.focus();ti.select()}
  });
}

/* ---- list operations ---- */
async function nwNewList(title,items,owner){
  const l=NotesCore.newList(title,owner||state.profile,items||[],'sink');NotesCore.hist(l,state.profile,'new','List created');let full=false;
  const r=await nwListsTx(ls=>{if(NotesCore.active(ls,state.profile).length>=NotesCore.LIM.lists){full=true;return false}ls.push(l)});
  if(full){toast('You have '+NotesCore.LIM.lists+' checklists — archive or delete a few first');return null}
  return r.ok?l:null;
}
async function nwListOp(id,fn,undoLabel){
  const before=nw.lists.find(l=>l.id===id),snap=before?JSON.parse(JSON.stringify(before)):null;let ret;
  const r=await nwListsTx(ls=>{const l=ls.find(x=>x.id===id);if(!l||l.gone)return false;ret=fn(l,ls);if(ret===false)return false;NotesCore.touch(l)});
  if(r.ok&&!r.skipped&&undoLabel&&snap)nwSetUndo(undoLabel,()=>nwListsTx(ls=>{const i=ls.findIndex(x=>x.id===snap.id),o=Object.assign({},snap,{u:Date.now()});if(i<0)ls.push(o);else ls[i]=o}));
  return{ok:r.ok&&!r.skipped,ret};
}
const nwBy=()=>state.profile;
async function nwTick(id,iid){
  let fin=false;const r=await nwListOp(id,l=>{const t=NotesCore.toggle(l,iid,nwBy());if(!t)return false;fin=t.finished});
  if(r.ok&&fin)toast('All done! 🎉');
}
async function nwListToNote(id){
  const l=nw.lists.find(x=>x.id===id);if(!l)return;const html=NotesCore.listToNoteHtml(l),n=NotesCore.newNote(html,l.color||undefined);let full=false;
  const r=await nwNotesTx(ns=>{if(NotesCore.live(ns).length>=NotesCore.LIM.notes){full=true;return false}ns.unshift(n)});
  if(full){toast('You have '+NotesCore.LIM.notes+' notes — delete a few first');return}if(!r.ok)return;
  const r2=await nwListOp(id,x=>{x.deleted=true;NotesCore.hist(x,nwBy(),'del','Turned into a note')});
  if(!r2.ok){await notesForever(n.id);return}
  nwSetUndo('Turned into a note',async()=>{await notesForever(n.id);await nwListsTx(ls=>{const x=ls.find(y=>y.id===id);if(!x)return false;x.deleted=false;x.u=Date.now()})});
}
async function nwNoteToList(id){
  const n=nw.notes.find(x=>x.id===id);if(!n)return;
  if(!NotesCore.plain(n.text)){toast('Write something in the note first');return}
  const l=NotesCore.noteToList(n.text,state.profile,state.profile);if(n.color)l.color=n.color;if(n.pin)l.pin=true;
  if(!l.items.length){toast('Nothing to turn into tick boxes yet');return}
  let full=false;const r=await nwListsTx(ls=>{if(NotesCore.active(ls,state.profile).length>=NotesCore.LIM.lists){full=true;return false}ls.push(l)});
  if(full){toast('You have '+NotesCore.LIM.lists+' checklists — archive or delete a few first');return}if(!r.ok)return;
  const r2=await nwNotesTx(ns=>{if(!NotesCore.softDelete(ns,id))return false});
  if(!r2.ok){await nwListsTx(ls=>{const x=ls.find(y=>y.id===l.id);if(!x)return false;x.deleted=true;x.gone=true;x.items=[]});return}
  nwSetUndo('Turned into a checklist · '+l.items.length+' items',async()=>{await notesRestore(id);await nwListsTx(ls=>{const x=ls.find(y=>y.id===l.id);if(!x)return false;x.deleted=true;x.gone=true;x.items=[];x.u=Date.now()})});
}

/* ---- watching both documents (live sync with the To-Do and Checklists apps, and with Anusha) ---- */
function startHubNotesWatch(){
  ['unN','unL'].forEach(k=>{if(nw[k]){try{nw[k]()}catch(e){}nw[k]=null}});
  nw.notes=[];nw.lists=[];nw.got={n:false,l:false};nw.err=false;nw.view='main';nw.q='';nw.undo=null;
  if(!state.user||!state.profile)return;
  const ok=()=>{nw.err=false;nwPaint()};
  try{
    nw.unN=nwNoteRef().onSnapshot(d=>{nw.notes=d.exists&&d.data().json?NotesCore.parseNotes(d.data().json):[];nw.got.n=true;ok()},()=>{nw.err=true;nw.got.n=true;nwPaint()});
    nw.unL=nwListRef().onSnapshot(d=>{nw.lists=d.exists&&d.data().json?NotesCore.parseLists(d.data().json):[];nw.got.l=true;ok()},()=>{nw.err=true;nw.got.l=true;nwPaint()});
  }catch(e){nw.err=true}
}

/* ---- painting ---- */
function nwPaint(force){
  clearTimeout(nw.paintT);
  if(force)nw.force=true; // a forced repaint must never be downgraded by a later gentle one
  nw.paintT=setTimeout(()=>{
    const force=nw.force;nw.force=false;
    nwEls().forEach(el=>{
      const a=document.activeElement;
      if(!force&&a&&el.contains(a)&&(a.isContentEditable||a.tagName==='INPUT'||a.tagName==='SELECT')){nw.pending=true;return}
      if(nw.down&&!force){nw.pending=true;return}
      try{renderNotesWidgetInto(el)}catch(e){console.warn(e)}
    });
  },force?0:30);
}
function nwSearchText(c){return(c.k==='n'?NotesCore.plain(c.o.text):c.o.title+' '+c.o.items.map(i=>i.t).join(' ')).toLowerCase()}
const NW_TIP={b:'Bold: make the selected text heavier (Ctrl+B)',i:'Italic: slant the selected text (Ctrl+I)',u:'Underline the selected text (Ctrl+U)',ul:'Bullet list: start a list with dots',ol:'Numbered list: start a list with 1, 2, 3',chk:'Turn this note into a checklist: every bullet or line becomes a tick box',ls:'List style: change the dots or numbers of the list you are in',f:'Font: change the typeface of the selected text'};
const nwSizeCss=o=>(o&&o.sw>=120?';width:'+Math.min(2000,Math.round(o.sw))+'px':'')+(o&&o.sh>=70?';height:'+Math.min(2400,Math.round(o.sh))+'px':'');
function nwNoteHtml(n){
  const o=nwOther(),sel=(arr,tip,att)=>'<select data-tip="'+tip+'" '+att+'>'+arr.map(f=>'<option value="'+esc(f.value)+'">'+f.label+'</option>').join('')+'</select>';
  return '<div class="nw-card nw-note'+(n.pin?' pinned':'')+(n.sw?' nw-sized':'')+'" style="background:'+esc(n.color||NotesCore.COLORS[0])+nwSizeCss(n)+'" data-id="'+esc(n.id)+'" data-kind="n">'+
    (n.pin?'<span class="nw-pin"><i data-lucide="pin"></i></span>':'')+
    '<div class="nw-tb">'+
      '<button type="button" data-tip="'+NW_TIP.b+'" data-cmd="bold"><i data-lucide="bold"></i></button>'+
      '<button type="button" data-tip="'+NW_TIP.i+'" data-cmd="italic"><i data-lucide="italic"></i></button>'+
      '<button type="button" data-tip="'+NW_TIP.u+'" data-cmd="underline"><i data-lucide="underline"></i></button><span class="nw-sep"></span>'+
      '<button type="button" data-tip="'+NW_TIP.ul+'" data-cmd="insertUnorderedList"><i data-lucide="list"></i></button>'+
      '<button type="button" data-tip="'+NW_TIP.ol+'" data-cmd="insertOrderedList"><i data-lucide="list-ordered"></i></button>'+
      sel(NotesCore.LIST_STYLES,NW_TIP.ls,'data-liststyle')+sel(NotesCore.FONTS,NW_TIP.f,'data-font')+
      '<button type="button" class="nw-conv" data-tip="'+NW_TIP.chk+'" data-a="tolist"><i data-lucide="square-check-big"></i><span>Checklist</span></button>'+
    '</div>'+
    (n.from?'<div class="nw-from">from '+esc(n.from)+'</div>':'')+
    '<div class="nw-text" contenteditable="true" data-ed="note" data-placeholder="Write anything…">'+NotesCore.display(n.text)+'</div>'+
    '<div class="nw-meta"><span class="nw-when">edited '+NotesCore.ago(n.u||NotesCore.created(n))+'</span>'+
      '<div class="nw-dots">'+NotesCore.COLORS.map(c=>'<span class="nw-dot'+(n.color===c?' sel':'')+'" style="background:'+c+'" data-a="color" data-c="'+c+'"></span>').join('')+'</div>'+
      '<div class="nw-act">'+
        '<button type="button" data-tip="'+(n.pin?'Unpin':'Pin to the top')+'" data-a="pin"><i data-lucide="pin"></i></button>'+
        '<button type="button" data-tip="Send a copy to '+o+'" data-a="send"><i data-lucide="send"></i></button>'+
        '<button type="button" data-tip="Make a To-Do task from this note" data-a="task"><i data-lucide="list-todo"></i></button>'+
        '<button type="button" data-tip="Delete (kept 30 days in Recently deleted)" data-a="del"><i data-lucide="trash-2"></i></button>'+
      '</div></div></div>';
}
function nwListHtml(l){
  const p=NotesCore.prog(l),d=NotesCore.dueInfo(l,today()),shared=l.owner==='shared',mode=l.hide||'keep',rows=NotesCore.rows(l),hid=NotesCore.hiddenCount(l);
  const doneN=l.items.some(i=>i.done),modeLbl={keep:'Ticked stay',sink:'Ticked go last',hide:'Ticked hidden'}[mode]||'Ticked stay';
  return '<div class="nw-card nw-list'+(l.pin?' pinned':'')+(l.sw?' nw-sized':'')+'" style="background:'+esc(l.color||NotesCore.COLORS[2])+nwSizeCss(l)+'" data-id="'+esc(l.id)+'" data-kind="l">'+
    (l.pin?'<span class="nw-pin"><i data-lucide="pin"></i></span>':'')+
    '<div class="nw-ttl" contenteditable="true" data-ed="ttl" data-placeholder="Checklist title" spellcheck="false">'+esc(l.title)+'</div>'+
    '<div class="nw-chips">'+
      '<button type="button" class="nw-chip" data-a="share" data-tip="'+(shared?'Shared with both of you. Tap to make it private to you.':'Private to you. Tap to share it with '+nwOther()+'.')+'"><i data-lucide="'+(shared?'users':'lock')+'"></i>'+(shared?'Shared':'Private')+'</button>'+
      '<label class="nw-chip'+(d&&d.c?' '+d.c:'')+'" data-tip="Set a due date. A reminder appears that morning while items are left."><i data-lucide="alarm-clock"></i>'+(d?d.t:'Due date')+'<input type="date" value="'+esc(l.due||'')+'" data-date></label>'+
    '</div>'+
    '<div class="nw-prog'+(p.n&&p.pct===100?' full':'')+'"><i style="width:'+p.pct+'%"></i></div>'+
    rows.map(r=>{const it=r.it,isSub=r.sub,k=NotesCore.kids(l,it.id),part=k.length&&!it.done&&k.some(x=>x.done);
      return '<div class="nw-it'+(isSub?' sub':'')+(it.done?' done':'')+'" data-iid="'+esc(it.id)+'">'+
        '<span class="nw-grip" draggable="true" data-tip="Drag to reorder">⋮⋮</span>'+
        '<button type="button" class="nw-cb'+(it.done?' on':part?' part':'')+'" data-a="tick" aria-label="Tick">'+(it.done?'✓':part?'–':'')+'</button>'+
        '<span class="nw-t" contenteditable="true" data-ed="it" spellcheck="false">'+esc(it.t)+'</span>'+
        (shared?'<button type="button" class="nw-asg'+(it.a?' on '+it.a.toLowerCase():'')+'" data-a="asg" data-tip="'+(it.a?'Assigned to '+it.a+'. Tap to change.':'Assign this item. Tap to cycle you, '+nwOther()+', nobody.')+'">'+(it.a?it.a[0]:'+')+'</button>':'')+
        '<button type="button" class="nw-x" data-tip="Delete item" data-a="delit"><i data-lucide="x"></i></button></div>';
    }).join('')+
    (hid?'<div class="nw-hint">'+hid+' ticked item'+(hid>1?'s':'')+' hidden</div>':'')+
    '<div class="nw-add" data-a="additem"><i data-lucide="plus"></i> Add item <small>Enter = next · Tab = sub-item</small></div>'+
    '<div class="nw-count">'+p.d+' of '+p.n+' done</div>'+
    '<div class="nw-tools">'+(doneN?'<button type="button" data-tip="Remove every ticked item" data-a="clear">Clear ticked</button><button type="button" data-tip="Untick everything so the list can be used again" data-a="reset">Untick all</button>':'')+
      '<button type="button" data-tip="Where ticked items go: stay, go last, or hidden" data-a="mode">'+modeLbl+'</button>'+
      '<button type="button" data-tip="Turn this checklist into a plain note (you can undo it)" data-a="tonote">Make it a note</button>'+
      '<a href="apps/checklist.html?list='+encodeURIComponent(l.id)+'" data-profile-link data-tip="Open in Checklists: templates, history, archive">Open ↗</a></div>'+
    '<div class="nw-meta"><span class="nw-when">edited '+NotesCore.ago(l.u||l.createdAt||0)+'</span>'+
      '<div class="nw-dots">'+NotesCore.COLORS.map(c=>'<span class="nw-dot'+(l.color===c?' sel':'')+'" style="background:'+c+'" data-a="color" data-c="'+c+'"></span>').join('')+'</div>'+
      '<div class="nw-act">'+
        '<button type="button" data-tip="'+(l.pin?'Unpin':'Pin to the top')+'" data-a="pin"><i data-lucide="pin"></i></button>'+
        '<button type="button" data-tip="Turn this checklist back into a plain note" data-a="tonote"><i data-lucide="file-text"></i></button>'+
        '<button type="button" data-tip="Delete (kept 30 days in Recently deleted)" data-a="del"><i data-lucide="trash-2"></i></button>'+
      '</div></div></div>';
}
function nwTrashHtml(){
  const ns=NotesCore.trashed(nw.notes),ls=NotesCore.trashedLists(nw.lists,state.profile);
  return '<div class="nw-trash"><div class="nw-trash-h"><button type="button" class="nw-back" data-a="back">← Back</button><strong>Recently deleted</strong><small>kept 30 days</small></div>'+
    (ns.length||ls.length?'':'<div class="nw-empty">Nothing deleted lately.</div>')+
    (ns.length?'<div class="nw-sec">Notes</div>'+ns.map(n=>'<div class="nw-trow" data-id="'+esc(n.id)+'" data-kind="n"><span class="nw-tdot" style="background:'+esc(n.color||'#eee')+'"></span><span class="nw-tt">'+esc(NotesCore.firstLine(n.text)||'(empty note)')+'<small>deleted '+NotesCore.ago(n.u||0)+'</small></span><button type="button" data-a="restore">Restore</button><button type="button" class="bad" data-a="forever">Delete forever</button></div>').join(''):'')+
    (ls.length?'<div class="nw-sec">Checklists</div>'+ls.map(l=>'<div class="nw-trow" data-id="'+esc(l.id)+'" data-kind="l"><span class="nw-tdot" style="background:'+esc(l.color||'#eee')+'"></span><span class="nw-tt">'+esc(l.title)+'<small>'+NotesCore.prog(l).d+' of '+NotesCore.prog(l).n+' done · deleted '+NotesCore.ago(l.u||0)+'</small></span><button type="button" data-a="restore">Restore</button><button type="button" class="bad" data-a="forever">Delete forever</button></div>').join(''):'')+
    '</div>';
}
function nwHelpHtml(){
  return '<div class="nw-help"><div class="nw-trash-h"><button type="button" class="nw-back" data-a="helpx">← Back</button><strong>What the tools do</strong></div><dl>'+
    '<dt>B / I / U</dt><dd>Bold, italic, underline the selected text.</dd>'+
    '<dt>Bullets / numbers</dt><dd>Start a dotted or numbered list.</dd>'+
    '<dt>List style</dt><dd>Change the dots or numbers of the list you are in.</dd>'+
    '<dt>Font</dt><dd>Change the typeface of the selected text.</dd>'+
    '<dt>☑ Checklist</dt><dd>Turn the note into a checklist: every line or bullet becomes a tick box (indented bullets become sub-items).</dd>'+
    '<dt>File icon on a checklist</dt><dd>Turn the checklist back into a plain note.</dd>'+
    '<dt>Pin</dt><dd>Keep it at the top.</dd>'+
    '<dt>Send</dt><dd>Send a copy of the note to '+nwOther()+'.</dd>'+
    '<dt>Task</dt><dd>Make a To-Do task from the note.</dd>'+
    '<dt>Trash</dt><dd>Delete. It stays in Recently deleted for 30 days.</dd>'+
    '<dt>Shared / Private</dt><dd>A shared checklist is visible and editable by both of you. Each item can be assigned to one of you with the small circle.</dd>'+
    '<dt>Checklist keys</dt><dd>Enter = next item · Backspace on an empty item = delete it · Tab / Shift+Tab = sub-item · Alt+↑/↓ = move · drag ⋮⋮ to reorder.</dd>'+
    '<dt>Voice</dt><dd>“Add a note that call the landlord” · “Add milk to my shopping list” · “Tick passport on my packing list” · “New checklist called weekend chores”.</dd>'+
    '</dl><a class="nw-link" href="apps/checklist.html" data-profile-link>Open Checklists (templates, history, archive) ↗</a></div>';
}
function renderNotesWidgetInto(el){
  if(!el)return;
  nw.pending=false;
  const S=nwSettings(),P=state.profile;
  if(!nw.got.n||!nw.got.l){el.innerHTML='<div class="nw-empty">Loading…</div>';nwWire(el);return}
  if(nw.err&&!nw.notes.length&&!nw.lists.length){el.innerHTML='<div class="nw-empty">Couldn’t load your notes. <button type="button" class="nw-retry" data-a="retry">Try again</button></div>';nwWire(el);return}
  if(nw.view==='trash'){el.innerHTML=nwTrashHtml();nwFinish(el);return}
  if(nw.help){el.innerHTML=nwHelpHtml();nwFinish(el);return}
  const liveN=NotesCore.live(nw.notes),liveL=NotesCore.active(nw.lists,P);
  const all=[];
  if(S.kind!=='lists')liveN.forEach(n=>all.push({k:'n',o:n,pin:!!n.pin,cr:NotesCore.created(n),ed:n.u||NotesCore.created(n)}));
  if(S.kind!=='notes')liveL.forEach(l=>all.push({k:'l',o:l,pin:!!l.pin,cr:l.createdAt||0,ed:l.u||0}));
  const q=nw.q.trim().toLowerCase(),f=q?all.filter(c=>nwSearchText(c).includes(q)):all;
  const sorted=NotesCore.sort(f,S.sort,S.pinfirst,c=>c.pin,c=>c.cr,c=>c.ed);
  const pins=S.pinfirst?sorted.filter(c=>c.pin):[],rest=S.pinfirst?sorted.filter(c=>!c.pin):sorted;
  const grid=a=>'<div class="nw-grid">'+a.map(c=>c.k==='n'?nwNoteHtml(c.o):nwListHtml(c.o)).join('')+'</div>';
  const trashN=NotesCore.trashed(nw.notes).length+NotesCore.trashedLists(nw.lists,P).length;
  el.innerHTML='<div class="nw-root nw-s-'+esc(S.size)+' nw-c-'+esc(S.cols)+(S.bar==='always'?' nw-bar-always':'')+'">'+
    '<div class="nw-top"><span class="nw-saved'+(/Couldn/.test(nw.saved||'')?' bad':'')+'">'+esc(nw.saved||'')+'</span>'+
      '<button type="button" class="nw-ib nw-arr" data-tip="Auto-arrange: reset every note to fit its text and lay them out so you can see them all" data-a="arrange"><i data-lucide="layout-grid"></i><span>Arrange</span></button>'+
      '<button type="button" class="nw-ib" data-tip="Recently deleted (kept 30 days)" data-a="trash"><i data-lucide="trash-2"></i>'+(trashN?'<b>'+trashN+'</b>':'')+'</button>'+
      '<button type="button" class="nw-ib" data-tip="What do the tools do?" data-a="help"><i data-lucide="circle-help"></i></button></div>'+
    '<div class="nw-bar"><input class="nw-quick" data-quick placeholder="Jot a note… ([ ] for a checklist)" maxlength="2000" enterkeyhint="done">'+
      '<div class="nw-addwrap"><button type="button" class="nw-add-btn" data-tip="New note or checklist" data-a="menu"><i data-lucide="plus"></i><i data-lucide="chevron-down"></i></button>'+
      '<div class="nw-menu'+(nw.menu?' show':'')+'"><button type="button" data-a="newnote">Note<small>Free text, bullets, bold…</small></button><button type="button" data-a="newlist">Checklist<small>Tick boxes, sub-items, due date, share</small></button></div></div></div>'+
    (all.length>3||q?'<input class="nw-search" data-search placeholder="Search notes and lists" value="'+esc(nw.q)+'">':'')+
    '<div class="nw-body">'+
      (pins.length?'<div class="nw-sec">Pinned</div>'+grid(pins):'')+
      (rest.length?(pins.length?'<div class="nw-sec">Others</div>':'')+grid(rest):'')+
      (!sorted.length?'<div class="nw-empty">'+(q?'Nothing matches “'+esc(nw.q)+'”':'No notes or checklists yet. Jot something above.')+'</div>':'')+
    '</div></div>';
  nwFinish(el);
  if(nw.focus){const f2=nw.focus;nw.focus=null;const t=el.querySelector(f2.sel);if(t){t.focus();if(f2.end)nwSetCaret(t)}}
}
function nwFinish(el){
  if(!el.__nwRO&&window.ResizeObserver){el.__nwRO=new ResizeObserver(()=>{const n=el.clientWidth<430;if(n!==el.__nwN){el.__nwN=n;el.classList.toggle('nw-narrow',n)}});el.__nwRO.observe(el)}
  el.classList.toggle('nw-narrow',el.clientWidth<430);
  if(window.lucide)lucide.createIcons();
  if(typeof updateProfileLinks==='function')updateProfileLinks();
  nwWire(el);
}
function nwFocusSel(sel,end){nw.focus={sel,end:!!end}}
function nwSetCaret(t){try{if(t.setSelectionRange&&t.value!==undefined){const n=t.value.length;t.setSelectionRange(n,n)}else{const r=document.createRange();r.selectNodeContents(t);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r)}}catch(e){}}
async function nwCommitItem(t){
  const card=t.closest('.nw-card'),row=t.closest('.nw-it');if(!card||!row)return;
  const id=card.dataset.id,iid=row.dataset.iid,l=nw.lists.find(x=>x.id===id),it=l&&l.items.find(x=>x.id===iid);if(!it)return;
  const v=t.textContent.replace(/\s+/g,' ').trim();
  if(!v){await nwListOp(id,x=>NotesCore.delItem(x,iid,nwBy()));return}
  if(v!==it.t)await nwListOp(id,x=>{if(!NotesCore.editText(x,iid,v,nwBy()))return false});
}
async function nwCommitTitle(t){
  const card=t.closest('.nw-card'),id=card.dataset.id,l=nw.lists.find(x=>x.id===id);if(!l)return;
  const v=t.textContent.replace(/\s+/g,' ').trim().slice(0,NotesCore.LIM.title);
  if(!v){t.textContent=l.title;return}
  if(v!==l.title)await nwListOp(id,x=>{x.title=v;NotesCore.hist(x,nwBy(),'rename',v)});
}
const nwNoteTimers={};
function nwNoteQueueSave(t){
  const card=t.closest('.nw-card'),id=card.dataset.id;clearTimeout(nwNoteTimers[id]);
  nwStatus('Typing…');
  nwNoteTimers[id]=setTimeout(()=>nwNoteFlush(t),700);
}
async function nwNoteFlush(t){
  const card=t.closest&&t.closest('.nw-card');if(!card)return;const id=card.dataset.id;clearTimeout(nwNoteTimers[id]);delete nwNoteTimers[id];
  const n=nw.notes.find(x=>x.id===id);if(!n)return;
  const html=NotesCore.sanitize(t.innerHTML);
  if(html.length>NotesCore.LIM.noteChars){toast('This note is too long to save — trim it a little');nwStatus('Couldn’t save');return}
  if(html===NotesCore.sanitize(n.text||'')||(html===''&&!n.text))return nwStatus('Saved ✓');
  await nwNotesTx(l=>{if(!NotesCore.patchNote(l,id,{text:html}))return false},null,true);
}
function nwWire(el){
  if(el.__nwWired)return;el.__nwWired=true;
  let rz=null;
  el.addEventListener('pointerdown',e=>{nw.down=true;rz=null;const c=e.target.closest&&e.target.closest('.nw-card');
    if(c&&e.target===c){const r=c.getBoundingClientRect();if(e.clientX>r.right-22&&e.clientY>r.bottom-22)rz={c,w:c.offsetWidth,h:c.offsetHeight}}});
  el.addEventListener('dblclick',async e=>{const c=e.target.closest&&e.target.closest('.nw-card');if(!c||e.target!==c)return;const r=c.getBoundingClientRect();
    if(!(e.clientX>r.right-22&&e.clientY>r.bottom-22))return;const id=c.dataset.id;
    if(c.dataset.kind==='n')await nwNotesTx(l=>{const n=l.find(x=>x.id===id);if(!n)return false;delete n.sw;delete n.sh;n.u=Date.now()},null,true);
    else await nwListOp(id,l=>{delete l.sw;delete l.sh});
    nwPaint(true)});
  const up=async()=>{
    if(rz){const {c,w,h}=rz;rz=null;const nwid=c.offsetWidth,nh=c.offsetHeight;
      if(c.isConnected&&(Math.abs(nwid-w)>6||Math.abs(nh-h)>6)){const id=c.dataset.id,sw=Math.round(Math.max(120,nwid)),sh=Math.round(Math.max(70,nh));
        if(c.dataset.kind==='n')await nwNotesTx(l=>{const n=l.find(x=>x.id===id);if(!n)return false;n.sw=sw;n.sh=sh;n.u=Date.now()},null,true);
        else await nwListOp(id,l=>{l.sw=sw;l.sh=sh})}}
    if(!nw.down)return;nw.down=false;if(nw.pending)setTimeout(()=>nwPaint(),60)};
  el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
  el.addEventListener('mousedown',e=>{if(e.target.closest('.nw-tb button'))e.preventDefault()});
  el.addEventListener('click',async e=>{
    const b=e.target.closest('[data-a]');
    if(nw.menu&&!e.target.closest('.nw-addwrap')){nw.menu=false;const m=el.querySelector('.nw-menu');m&&m.classList.remove('show')}
    if(!b)return;
    const a=b.dataset.a,card=b.closest('.nw-card')||b.closest('.nw-trow'),id=card&&card.dataset.id,kind=card&&card.dataset.kind,row=b.closest('.nw-it'),iid=row&&row.dataset.iid,by=nwBy();
    const N=nw.notes.find(x=>x.id===id),L=nw.lists.find(x=>x.id===id);
    if(a==='menu'){nw.menu=!nw.menu;const m=el.querySelector('.nw-menu');m&&m.classList.toggle('show',nw.menu);return}
    if(a==='newnote'){nw.menu=false;const r=await notesAdd('');if(r.ok)nwFocusSel('[data-id="'+r.id+'"] [data-ed="note"]');nwPaint(true);return}
    if(a==='newlist'){nw.menu=false;const l=await nwNewList('New checklist');if(l)nwFocusSel('[data-id="'+l.id+'"] [data-ed="ttl"]',true);nwPaint(true);return}
    if(a==='arrange'){
      // Auto-arrange: every note/list goes back to fitting its own text, columns follow the widget's width, and the widget grows/shrinks to show them all.
      const wcard=el.closest('.widget-card'),wd=wcard&&state.widgets.find(x=>x.id===wcard.dataset.widgetId);
      const lsz=nw.lists.filter(l=>l.sw||l.sh);
      if(nw.notes.some(n=>n.sw||n.sh))await nwNotesTx(l=>{let c=0;l.forEach(n=>{if(n.sw||n.sh){delete n.sw;delete n.sh;c++}});if(!c)return false},null,true);
      for(const l of lsz)await nwListOp(l.id,x=>{delete x.sw;delete x.sh});
      if(wd){const W=el.clientWidth;wd.settings=wd.settings||{};wd.settings.cols=W<430?'1':W<760?'2':'3';saveWidgetLayout()}
      nwPaint(true);await new Promise(r=>setTimeout(r,160));
      if(wcard&&wd)widgetFitHeight(wcard,wd);
      toast('Arranged — every note now fits its text');return;
    }
    if(a==='trash'){nw.view='trash';nw.menu=false;nwPaint(true);return}
    if(a==='back'){nw.view='main';nwPaint(true);return}
    if(a==='help'){nw.help=true;nwPaint(true);return}
    if(a==='helpx'){nw.help=false;nwPaint(true);return}
    if(a==='retry'){startHubNotesWatch();nwPaint(true);return}
    if(a==='restore'){if(kind==='n')await notesRestore(id);else await nwListsTx(ls=>{const x=ls.find(y=>y.id===id);if(!x)return false;x.deleted=false;x.archived=false;x.u=Date.now()});toast('Restored');return}
    if(a==='forever'){if(!confirm('Delete this for good? This cannot be undone.'))return;if(kind==='n')await notesForever(id);else await nwListsTx(ls=>{const x=ls.find(y=>y.id===id);if(!x)return false;x.gone=true;x.deleted=true;x.items=[];x.u=Date.now()});return}
    if(kind==='n'&&N){
      if(a==='pin')return void await notesEdit(id,{pin:N.pin?null:true});
      if(a==='color')return void await notesEdit(id,{color:b.dataset.c});
      if(a==='del'){clearTimeout(nwNoteTimers[id]);return void await notesDelete(id)}
      if(a==='send')return void await nwSendNote(id);
      if(a==='task')return void await nwNoteToTask(id);
      if(a==='tolist'){const t=card.querySelector('[data-ed="note"]');if(t)await nwNoteFlush(t);return void await nwNoteToList(id)}
    }
    if(kind==='l'&&L){
      if(a==='pin')return void await nwListOp(id,l=>{if(l.pin)delete l.pin;else l.pin=true});
      if(a==='color')return void await nwListOp(id,l=>{l.color=b.dataset.c});
      if(a==='del')return void await nwListOp(id,l=>{l.deleted=true;NotesCore.hist(l,by,'del','Deleted')},'Checklist deleted');
      if(a==='tonote')return void await nwListToNote(id);
      if(a==='tick')return void await nwTick(id,iid);
      if(a==='delit')return void await nwListOp(id,l=>NotesCore.delItem(l,iid,by),'Item deleted');
      if(a==='clear')return void await nwListOp(id,l=>{if(!NotesCore.clearTicked(l,by))return false},'Ticked items cleared');
      if(a==='reset')return void await nwListOp(id,l=>NotesCore.reset(l,by),'All items unticked');
      if(a==='mode')return void await nwListOp(id,l=>{const o=['keep','sink','hide'];l.hide=o[(o.indexOf(l.hide||'keep')+1)%3]});
      if(a==='asg')return void await nwListOp(id,l=>{const it=l.items.find(x=>x.id===iid);if(!it)return false;NotesCore.assign(l,iid,NotesCore.nextAssignee(it.a))});
      if(a==='share'){
        const shared=L.owner==='shared';
        if(shared&&!confirm('Make “'+L.title+'” private to you? '+nwOther()+' will no longer see it, and assignments are cleared.'))return;
        return void await nwListOp(id,l=>NotesCore.setOwner(l,!shared,state.profile,by),shared?'Now private':null);
      }
      if(a==='additem'){
        let nid=null;const r=await nwListOp(id,l=>{if(l.items.length>=NotesCore.LIM.items)return false;nid='i-'+NotesCore.uid()+l.items.length;l.items.push({id:nid,t:'',done:false,parent:null})});
        if(!r.ok&&L.items.length>=NotesCore.LIM.items)toast('A checklist holds '+NotesCore.LIM.items+' items at most');
        if(r.ok&&nid)nwFocusSel('[data-iid="'+nid+'"] [data-ed="it"]');nwPaint(true);return;
      }
    }
  });
  el.addEventListener('change',async e=>{
    const d=e.target.closest('[data-date]');
    if(d){const id=d.closest('.nw-card').dataset.id,v=d.value;await nwListOp(id,l=>NotesCore.setDue(l,v,nwBy()));toast(v?'Due date set · reminder that morning':'Due date removed');return}
    const sel=e.target.closest('[data-liststyle],[data-font]');
    if(sel){
      const card=sel.closest('.nw-card'),t=card.querySelector('[data-ed="note"]'),val=sel.value;sel.value='';if(!val||!t)return;
      t.focus();
      if(sel.hasAttribute('data-font'))document.execCommand('fontName',false,val);
      else{const s=getSelection();let n=s&&s.rangeCount?s.getRangeAt(0).startContainer:null;while(n&&n!==t&&n.nodeName!=='OL'&&n.nodeName!=='UL')n=n.parentNode;if(n&&(n.nodeName==='OL'||n.nodeName==='UL'))n.style.listStyleType=val;else toast('Put the cursor inside a list first')}
      nwNoteQueueSave(t);
    }
  });
  el.addEventListener('click',e=>{
    const c=e.target.closest('.nw-tb [data-cmd]');if(!c)return;
    const t=c.closest('.nw-card').querySelector('[data-ed="note"]');t.focus();document.execCommand(c.dataset.cmd);nwNoteQueueSave(t);nwToolbarState(c.closest('.nw-card'));
  });
  el.addEventListener('input',e=>{
    const t=e.target;
    if(t.matches&&t.matches('[data-ed="note"]')){nwNoteQueueSave(t);return}
    if(t.matches&&t.matches('[data-search]')){nw.q=t.value;nwFocusSel('[data-search]',true);nwPaint(true)}
  });
  el.addEventListener('keyup',e=>{const t=e.target;if(t.matches&&t.matches('[data-ed="note"]'))nwToolbarState(t.closest('.nw-card'))});
  el.addEventListener('paste',async e=>{
    const t=e.target;if(!t.matches)return;
    if(t.matches('[data-ed="note"]')){e.preventDefault();document.execCommand('insertText',false,(e.clipboardData||window.clipboardData).getData('text/plain'));nwNoteQueueSave(t);return}
    if(t.matches('[data-ed="it"],[data-ed="ttl"]')){
      const txt=(e.clipboardData||window.clipboardData).getData('text/plain');e.preventDefault();
      if(t.matches('[data-ed="it"]')&&/\n/.test(txt.trim())){const id=t.closest('.nw-card').dataset.id;await nwListOp(id,l=>{const add=NotesCore.addItems(l,txt);if(!add.length)return false;NotesCore.hist(l,nwBy(),'add',add.length+' items')});return}
      document.execCommand('insertText',false,txt.replace(/\s*\n\s*/g,' '));
    }
  });
  el.addEventListener('keydown',async e=>{
    const t=e.target;if(!t.matches)return;
    if(t.matches('[data-quick]')&&e.key==='Enter'){
      const v=t.value.trim();if(!v||e.isComposing)return;t.value='';
      if(/^\[\s?\]/.test(v)){const title=v.replace(/^\[\s?\]\s*/,'')||'New checklist';const l=await nwNewList(title);if(l){nwFocusSel('[data-id="'+l.id+'"] [data-ed="it"]');nwSetUndo('Checklist created',()=>nwListsTx(ls=>{const x=ls.find(y=>y.id===l.id);if(!x)return false;x.deleted=true;x.gone=true;x.items=[];x.u=Date.now()}))}return}
      const r=await notesAdd(v.slice(0,NotesCore.LIM.noteChars).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'));
      if(r.ok){nwSetUndo('Note added',()=>notesForever(r.id));const q=nwEls()[0]&&nwEls()[0].querySelector('[data-quick]');if(q)q.focus()}
      return;
    }
    if(t.matches('[data-ed="note"]')&&(e.ctrlKey||e.metaKey)){
      const k=e.key.toLowerCase();
      if(e.key==='Enter'){e.preventDefault();document.execCommand('insertParagraph');nwNoteQueueSave(t);return}   // Ctrl+Enter: everything after the cursor starts a new point (a new checklist item when converted)
      if(k==='b'||k==='i'||k==='u'){e.preventDefault();document.execCommand(k==='b'?'bold':k==='i'?'italic':'underline');nwNoteQueueSave(t);nwToolbarState(t.closest('.nw-card'))}
      return;
    }
    if(t.matches('[data-ed="ttl"]')){if(e.key==='Enter'){e.preventDefault();t.blur()}else if(e.key==='Escape'){t.blur()}return}
    if(t.matches('[data-ed="it"]')){
      const card=t.closest('.nw-card'),id=card.dataset.id,row=t.closest('.nw-it'),iid=row.dataset.iid,by=nwBy();
      const txt=t.textContent.replace(/\s+/g,' ').trim();
      if(e.key==='Enter'){
        e.preventDefault();
        // Enter / Ctrl+Enter: the text before the cursor stays in this point, everything after it moves into the next point.
        let off=txt.length;
        try{const sel=getSelection();if(sel&&sel.rangeCount&&t.contains(sel.anchorNode)){const rg=document.createRange();rg.selectNodeContents(t);rg.setEnd(sel.anchorNode,sel.anchorOffset);off=rg.toString().length}}catch(x){}
        const raw=t.textContent.replace(/\s+/g,' ');
        const before=raw.slice(0,off).trim(),after=raw.slice(off).trim();
        if(!before&&!after)return;let nid=null;
        if(before&&after)t.textContent=before; // so the blur that follows the jump doesn't write the old full text back
        const r=await nwListOp(id,l=>{const it=l.items.find(x=>x.id===iid);if(!it)return false;if(before)NotesCore.editText(l,iid,before,by);else it.t='';const n=NotesCore.insertAfter(l,iid,after);if(!n)return false;nid=n.id});
        if(r.ok&&nid){nwFocusSel('[data-iid="'+nid+'"] [data-ed="it"]');nwPaint(true)}else if(!nid)toast('A checklist holds '+NotesCore.LIM.items+' items at most');
      }else if(e.key==='Backspace'&&!txt){
        e.preventDefault();const rows=Array.from(card.querySelectorAll('.nw-it')),i=rows.indexOf(row),prev=rows[i-1];
        if(prev)nwFocusSel('[data-iid="'+prev.dataset.iid+'"] [data-ed="it"]',true);
        await nwListOp(id,l=>NotesCore.delItem(l,iid,by));nwPaint(true);
      }else if(e.key==='Tab'){
        const l=nw.lists.find(x=>x.id===id),it=l&&l.items.find(x=>x.id===iid);if(!it)return;
        const can=e.shiftKey?!!it.parent:(!it.parent&&l.items.indexOf(it)>0);if(!can)return;
        e.preventDefault();nwFocusSel('[data-iid="'+iid+'"] [data-ed="it"]',true);
        await nwListOp(id,x=>{if(txt)NotesCore.editText(x,iid,txt,by);return e.shiftKey?NotesCore.outdent(x,iid):NotesCore.indent(x,iid)});nwPaint(true);
      }else if(e.altKey&&(e.key==='ArrowUp'||e.key==='ArrowDown')){
        e.preventDefault();nwFocusSel('[data-iid="'+iid+'"] [data-ed="it"]',true);
        await nwListOp(id,x=>NotesCore.move(x,iid,e.key==='ArrowUp'?-1:1));nwPaint(true);
      }else if(e.key==='Escape'){t.blur()}
    }
  });
  el.addEventListener('focusout',e=>{
    const t=e.target;if(!t.matches)return;
    if(t.matches('[data-ed="note"]'))nwNoteFlush(t);
    else if(t.matches('[data-ed="it"]'))nwCommitItem(t);
    else if(t.matches('[data-ed="ttl"]'))nwCommitTitle(t);
    setTimeout(()=>{if(nw.pending&&!nw.down)nwPaint()},150);
  });
  let drag=null;
  el.addEventListener('dragstart',e=>{const g=e.target.closest&&e.target.closest('.nw-grip');if(!g){return}const row=g.closest('.nw-it');drag={id:row.closest('.nw-card').dataset.id,iid:row.dataset.iid};row.classList.add('drag');try{e.dataTransfer.setData('text/plain',drag.iid);e.dataTransfer.effectAllowed='move';e.dataTransfer.setDragImage(row,12,12)}catch(x){}});
  el.addEventListener('dragover',e=>{const row=e.target.closest&&e.target.closest('.nw-it');if(drag&&row&&row.closest('.nw-card').dataset.id===drag.id){e.preventDefault();row.classList.add('over')}});
  el.addEventListener('dragleave',e=>{const row=e.target.closest&&e.target.closest('.nw-it');row&&row.classList.remove('over')});
  el.addEventListener('drop',async e=>{const row=e.target.closest&&e.target.closest('.nw-it');if(!drag||!row)return;e.preventDefault();row.classList.remove('over');const d=drag;drag=null;if(row.closest('.nw-card').dataset.id!==d.id)return;await nwListOp(d.id,l=>NotesCore.dropOn(l,d.iid,row.dataset.iid))});
  el.addEventListener('dragend',()=>{drag=null;el.querySelectorAll('.nw-it.drag,.nw-it.over').forEach(r=>r.classList.remove('drag','over'))});
}
function nwToolbarState(card){
  try{[['bold','bold'],['italic','italic'],['underline','underline']].forEach(([c,q])=>{const b=card.querySelector('[data-cmd="'+c+'"]');if(b)b.classList.toggle('active',document.queryCommandState(q))})}catch(e){}
}
let saveWidgetsTimer=null;
function saveWidgetLayout(){
  widgetsTrack();
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
let widgetResizeCancel=null;
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
/* ---- Diet widget: a plate ring, one arc per planned meal. Reads and writes the Diet app's own data (src: assets/diet-core.js) ---- */
const dietW={S:null,key:null,t:0,view:null,ui:{add:false,open:{},choose:null,pick:{}},groc:null,gt:0,en:null,et:0,busy:false,timer:null};
const DT_FEEL=['😋','😐','😴'];
const dtPid=()=>String(state.profile||'').toLowerCase();
const dtT=(m,S)=>{if(m==null)return'';const h=Math.floor(m/60),mm=String(m%60).padStart(2,'0');if(S&&S.fmt==='24')return String(h).padStart(2,'0')+':'+mm;return(h%12||12)+':'+mm+' '+(h>=12?'PM':'AM')};
const dtN=(n,d)=>Math.round((Number(n)||0)*(d||1))/(d||1);
function dtLabel(k){const t=today();if(k===t)return'Today';if(k===addDays(t,-1))return'Yesterday';return new Date(k+'T12:00:00').toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})}
async function dietLoad(force){
  const k=state.user.uid+'|'+state.profile;
  if(dietW.key!==k){dietW.S=null;dietW.groc=null;dietW.en=null;dietW.view=null;dietW.t=0;dietW.key=k}
  if(!force&&dietW.S&&Date.now()-dietW.t<20000)return dietW.S;
  const rd=await readSafe(dietRef(),null);
  if(rd.ok&&rd.exists&&rd.val&&Array.isArray(rd.val.meals)&&Array.isArray(rd.val.diary)){dietW.S=rd.val;dietW.t=Date.now()}
  return dietW.S;
}
async function dietGroc(){
  if(dietW.groc&&Date.now()-dietW.gt<300000)return dietW.groc;
  const rd=await readSafe(groceryRef(),null);if(rd.ok&&rd.exists&&rd.val&&typeof rd.val==='object'){dietW.groc=rd.val;dietW.gt=Date.now()}
  return dietW.groc;
}
async function dietEnergy(date,eaten){
  const ck=date;
  if(dietW.en&&dietW.en.date===ck&&Date.now()-dietW.et<300000)return DietCore.energy(dietW.en.stats,dietW.en.kg,dietW.en.cardio,dietW.en.sec,eaten);
  try{
    const col=db.collection('users').doc(state.user.uid).collection('profiles').doc(state.profile.toLowerCase()),fp=firebase.firestore.FieldPath.documentId();
    const [st,c,l]=await Promise.all([col.get().catch(()=>null),col.collection('cardioLogs').doc(date).get().catch(()=>null),col.collection('workoutLogs').where(fp,'>=',date+':').where(fp,'<',date+';').get().catch(()=>null)]);
    const stats=(st&&st.exists)?st.data():{};let sec=0;if(l)l.forEach(d=>{const x=d.data()||{};sec+=x.sessionDurationSec||0});
    const cardio=(c&&c.exists&&Array.isArray(c.data().entries))?c.data().entries:[];
    let kg=0;const dl=state.insights&&state.insights.daily||{};Object.keys(dl).sort().forEach(d=>{if(dl[d].weight)kg=dl[d].weight});
    dietW.en={date:ck,stats,kg,cardio,sec};dietW.et=Date.now();
    return DietCore.energy(stats,kg,cardio,sec,eaten);
  }catch(e){return null}
}
function dietRepaintAll(){document.querySelectorAll('[data-widget-type="diet"] .widget-card-body').forEach(el=>{try{dietPaint(el,state.widgets.find(x=>x.type==='diet'))}catch(e){console.warn(e)}})}
async function renderDietInto(el,wdg){
  if(!el)return;
  if(!dietW.S)el.innerHTML='<div class="empty-state">Loading your day…</div>';
  await dietLoad(false);
  if(!dietW.S){el.innerHTML='<div class="empty-state"><strong>Diet is not set up yet</strong>Open the Diet app once to create your meals and goals.<a class="widget-card-link" href="apps/diet.html" data-profile-link>Open Diet <i data-lucide="arrow-up-right"></i></a></div>';updateProfileLinks();if(window.lucide)lucide.createIcons();return}
  dietPaint(el,wdg||state.widgets.find(x=>x.type==='diet'));
  dietStartTick();
  const S=wsAll(wdg,WIDGET_TYPES.diet);
  if(S.pantry)dietGroc().then(()=>{if(el.isConnected&&!dietW.ui.add)dietPaint(el,wdg)}).catch(()=>{});
  if(S.energy||S.weight)dietEnergy(dietW.view||today(),DietCore.totals(dietW.S,dtPid(),dietW.view||today()).calories).then(r=>{if(r&&el.isConnected&&!dietW.ui.add&&!dietW.energyShown){dietW.energyShown=1;dietPaint(el,wdg)}}).catch(()=>{});
}
function dietStartTick(){
  if(dietW.timer)return;
  dietW.timer=setInterval(async()=>{
    if(document.hidden||dietW.busy||!document.querySelector('[data-widget-type="diet"] .widget-card-body'))return;
    if(dietW.ui.add)return;
    await dietLoad(true);dietW.energyShown=0;dietRepaintAll();
  },60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&dietW.S&&Date.now()-dietW.t>30000&&document.querySelector('[data-widget-type="diet"] .widget-card-body'))dietLoad(true).then(dietRepaintAll).catch(()=>{})});
}
function dietNext(rows,nowM){
  const pl=rows.filter(r=>r.status==='planned');if(!pl.length)return null;
  const timed=pl.filter(r=>r.t!=null).sort((a,b)=>a.t-b.t),untimed=pl.filter(r=>r.t==null);
  return timed.find(r=>r.t>=nowM-45)||timed[0]||untimed[0];
}
function dietPaint(el,wdg){
  const D=dietW.S;if(!D||!el)return;
  const S=wsAll(wdg,WIDGET_TYPES.diet),C=DietCore,pid=dtPid(),td=today(),nowM=wNow();
  if(dietW.view&&dietW.view>=td)dietW.view=null;
  const k=dietW.view||td,isT=k===td,past=!isT;
  const size=wtSize(el);el._dtSz=size;
  ['dt-sm','dt-md','dt-lg','dt-wide'].forEach(c=>el.classList.remove(c));el.classList.add('dt','dt-'+size);
  const {rows,extras}=C.dayRows(D,pid,k),t=C.totals(D,pid,k),G=C.goals(D,pid),g=G.goals,mg=G.micro;
  rows.sort((a,b)=>(a.t==null?9999+a.idx:a.t)-(b.t==null?9999+b.idx:b.t));
  const eatenN=rows.filter(r=>r.status==='eaten').length+extras.length,totalN=rows.length;
  const nx=isT?dietNext(rows,nowM):null;
  const left=g.calories-t.calories,over=left<0;
  /* protein pace */
  let expP=null,pace={c:'idle',t:dtLabel(k)};
  if(isT){
    expP=rows.filter(r=>r.t!=null&&r.t<=nowM).reduce((a,r)=>a+(r.n.protein||0),0)/g.protein*100;
    const late=rows.filter(r=>r.status==='planned'&&r.t!=null&&nowM-r.t>45);
    if(late.length)pace={c:'bad',t:late.length===1?late[0].slot+' is running late':late.length+' meals are late'};
    else if(!eatenN&&!rows.some(r=>r.t!=null&&r.t<=nowM))pace={c:'idle',t:'Day not started'};
    else pace={c:'ok',t:'On pace'};
  }else{const s=C.dayStat(D,pid,k);pace=s.eaten?{c:s.state==='ok'?'ok':s.state==='over'?'bad':'warn',t:s.state==='ok'?'On target':s.state==='over'?'Over':'Under'}:{c:'idle',t:'Nothing logged'}}
  /* ring */
  const R=60,CI=2*Math.PI*R,planned=rows.reduce((a,r)=>a+(r.n.calories||0),0)+extras.reduce((a,r)=>a+(r.n.calories||0),0),tot=Math.max(planned,g.calories,1),gap=3;
  let acc=0,arcs='';
  const arc=(len,cls,key)=>{const l=Math.max(0,len/tot*CI-gap),off=-acc/tot*CI;acc+=len;return '<circle class="dt-seg '+cls+'" data-dt-arc="'+esc(key||'')+'" cx="75" cy="75" r="'+R+'" stroke-dasharray="'+l+' '+CI+'" stroke-dashoffset="'+off+'"></circle>'};
  rows.forEach(r=>{arcs+=arc(r.n.calories||0,(r.status==='eaten'?'eaten':r.status==='skipped'?'skip':'plan')+(nx&&nx.key===r.key?' next':''),r.key)});
  extras.forEach(r=>{arcs+=arc(r.n.calories||0,'extra',r.key)});
  const centre=S.center==='eaten'?'<b>'+Math.round(t.calories).toLocaleString()+'</b><span>of '+Math.round(g.calories).toLocaleString()+' kcal</span>':'<b>'+Math.abs(Math.round(left)).toLocaleString()+'</b><span>'+(over?'kcal over':'kcal left')+'</span>';
  const bar=(v,gl,col,mk,warn)=>'<div class="dt-bar"><i style="width:'+Math.min(100,gl>0?v/gl*100:0)+'%;background:'+(warn&&v>gl?'var(--danger)':col)+'"></i>'+(mk!=null?'<s style="left:'+Math.min(100,mk)+'%"></s>':'')+'</div>';
  const ringHtml=S.ring?'<div class="dt-hero"><div class="dt-ring"><svg viewBox="0 0 150 150">'+arcs+'</svg><div class="dt-rc'+(over?' over':'')+'">'+centre+'</div></div>'+
    '<div class="dt-kv"><div><div class="dt-row1"><span>Protein</span><b>'+Math.round(t.protein)+'<small> / '+Math.round(g.protein)+' g</small></b></div>'+bar(t.protein,g.protein,'var(--dt-p)',expP)+'</div>'+
    '<div class="dt-row1 dt-eaten"><span>Eaten</span><b>'+Math.round(t.calories).toLocaleString()+' kcal</b></div>'+
    '<span class="dt-pace '+pace.c+'">'+(pace.c==='ok'?'●':pace.c==='bad'?'▲':'○')+' '+esc(pace.t)+'</span></div></div>':'';
  const macroHtml=S.macros?'<div class="dt-macros"><div class="dt-mac"><small><span>Carbs</span><span>'+Math.round(g.carbs)+'g</span></small><b>'+Math.round(t.carbs)+'g</b>'+bar(t.carbs,g.carbs,'var(--dt-c)')+'</div>'+
    '<div class="dt-mac"><small><span>Fat</span><span>'+Math.round(g.fat)+'g</span></small><b>'+Math.round(t.fat)+'g</b>'+bar(t.fat,g.fat,'var(--dt-f)')+'</div>'+
    '<div class="dt-mac"><small><span>Meals</span><span>'+totalN+'</span></small><b>'+rows.filter(r=>r.status==='eaten').length+'/'+totalN+'</b>'+bar(rows.filter(r=>r.status==='eaten').length,Math.max(1,totalN),'var(--accent)')+'</div></div>':'';
  const microHtml=S.micro?'<div class="dt-micro"><div><div class="dt-row1"><span>Sugar</span><b>'+Math.round(t.sugar)+'<small> / '+Math.round(mg.sugar)+' g</small></b></div>'+bar(t.sugar,mg.sugar,'var(--dt-s)',null,true)+'</div><div><div class="dt-row1"><span>Saturated fat</span><b>'+Math.round(t.satFat)+'<small> / '+Math.round(mg.satFat)+' g</small></b></div>'+bar(t.satFat,mg.satFat,'var(--dt-sf)',null,true)+'</div></div>':'';
  /* next meal */
  const ago=r=>{if(r.t==null)return'';const d=r.t-nowM;if(d>=0)return d<60?'in '+d+' min':'in '+Math.floor(d/60)+'h '+(d%60)+'m';const a=-d;return a<60?a+' min ago':Math.floor(a/60)+'h ago'};
  const pant=S.pantry?C.pantryCheck(D,rows,dietW.groc):{};
  const chooserHtml=(r)=>{
    const ch=C.choices(D,r.meal),pick=dietW.ui.pick[r.key]||{};
    let h='<div class="dt-choose"><div class="dt-cfix">'+ch.fixed.map(x=>esc(x.name)).join(' + ')+'</div>';
    Object.keys(ch.groups).forEach(gk=>{
      const sel=pick[gk]||ch.groups[gk][0].id;
      h+='<div class="dt-chips">'+ch.groups[gk].map(x=>'<button type="button" class="dt-chip'+(sel===x.id?' on':'')+'" data-dt-pick="'+esc(r.key)+'" data-g="'+esc(gk)+'" data-r="'+esc(x.id)+'">'+esc(x.name)+'<small>'+Math.round(C.recipeServingN(D,x).calories)+' kcal</small></button>').join('')+'</div>';
    });
    return h+'<div class="dt-btns"><button type="button" class="dt-btn pri" data-dt-chooseok="'+esc(r.key)+'">✓ Log it</button><button type="button" class="dt-btn" data-dt-choosex>Cancel</button></div></div>';
  };
  const nextHtml=S.next&&isT?(nx?'<div class="dt-next"><div class="dt-nt"><span>NEXT · '+esc(String(nx.slot||'').toUpperCase())+'</span><span>'+(nx.t!=null?esc(dtT(nx.t,S))+' · '+esc(ago(nx)):'anytime')+'</span></div><div class="dt-nn">'+esc(nx.icon||'')+' '+esc(nx.name)+'</div><div class="dt-nm">'+Math.round(nx.n.calories)+' kcal · '+Math.round(nx.n.protein)+' g protein · '+Math.round(nx.n.carbs)+' g carbs · '+Math.round(nx.n.fat)+' g fat</div>'+
    (pant[nx.key]?'<div class="dt-pant">⚠ '+pant[nx.key].map(b=>esc(b.name)+(b.status==='finished'?' is finished':' is low')).join(', ')+'<button type="button" data-dt-buy="'+esc(nx.key)+'">Add to my list</button></div>':'')+
    (dietW.ui.choose===nx.key?chooserHtml(nx):'<div class="dt-btns"><button type="button" class="dt-btn pri" data-dt-ate="'+esc(nx.key)+'">✓ Ate it</button><button type="button" class="dt-btn" data-dt-skip="'+esc(nx.key)+'">Skip</button>'+(nx.choice?'':'')+'</div>')+'</div>'
    :(totalN?'<div class="dt-next done"><div class="dt-nn">All meals handled for today ✓</div><div class="dt-nm">'+Math.round(t.calories)+' of '+Math.round(g.calories)+' kcal · '+Math.round(t.protein)+' of '+Math.round(g.protein)+' g protein</div></div>':'<div class="dt-next done"><div class="dt-nn">No meals planned</div><div class="dt-nm">Add meals in the Diet app, or use “Ate something else”.</div></div>')):'';
  /* protein rescue */
  let rescueHtml='';
  if(S.rescue&&isT&&eatenN){
    const remP=g.protein-t.protein,nxP=nx?(nx.n.protein||0):0,restP=rows.filter(r=>r.status==='planned'&&r!==nx).reduce((a,r)=>a+(r.n.protein||0),0),gap=remP-nxP-restP;
    const whey=(D.foods||[]).find(f=>/whey/i.test(f.name)&&f.protein>0);
    if(remP>8&&gap>8&&whey){
      const unit=whey.unit==='g'?'g':whey.unit,per=whey.unit==='scoop'?1:(whey.unit==='g'?30:1),pn=C.nutrients(D,{foodId:whey.id,qty:per,unit:unit}),sc=Math.max(1,Math.round(gap/(pn.protein||24)));
      rescueHtml='<div class="dt-rescue"><div><b>'+Math.round(remP)+' g protein left.</b> The rest of the plan covers '+Math.round(nxP+restP)+' g. '+sc+' scoop'+(sc>1?'s':'')+' of whey closes it.</div><button type="button" class="dt-btn sm" data-dt-whey="'+esc(whey.id)+'" data-q="'+(per*sc)+'" data-u="'+esc(unit)+'">＋ Whey</button></div>';
    }else if(remP>8&&gap<=8){rescueHtml='<div class="dt-rescue ok"><div><b>'+Math.round(remP)+' g protein to go.</b> You are covered if you eat what is planned.</div></div>'}
  }
  /* list */
  const feelOf=r=>{const e=(D.diary||[]).find(x=>x.id===r.id);return e&&e.note?e.note:''};
  const listRows=rows.map(r=>{
    const late=isT&&r.status==='planned'&&r.t!=null&&nowM-r.t>45,isNx=nx&&nx.key===r.key&&!late,open=!!dietW.ui.open[r.key],showK=!(S.hideplan&&r.status==='planned');
    const feel=(r.status==='eaten'&&r.id)?feelOf(r):'';
    const feelHtml=(S.feel&&r.status==='eaten'&&r.id)?'<div class="dt-feel"><span>How did it sit?</span>'+DT_FEEL.map(f=>'<button type="button" class="'+(feel.indexOf(f)===0?'on':'')+'" data-dt-feel="'+esc(r.id)+'" data-f="'+f+'">'+f+'</button>').join('')+'</div>':'';
    const acts='<div class="dt-btns">'+(r.status==='planned'?'<button type="button" class="dt-btn sm pri" data-dt-ate="'+esc(r.key)+'">Ate it</button><button type="button" class="dt-btn sm" data-dt-skip="'+esc(r.key)+'">Skip</button>':r.status==='skipped'?'<button type="button" class="dt-btn sm" data-dt-skip="'+esc(r.key)+'">Un-skip</button>':'<button type="button" class="dt-btn sm" data-dt-un="'+esc(r.key)+'">Not eaten</button>')+'</div>';
    return '<div class="dt-meal '+r.status+(open?' open':'')+'"><button type="button" class="dt-ck" data-dt-ck="'+esc(r.key)+'" aria-label="Toggle '+esc(r.name)+'">'+(r.status==='eaten'?'✓':r.status==='skipped'?'–':'')+'</button>'+
      '<div class="dt-mn" data-dt-open="'+esc(r.key)+'" role="button"><div class="dt-mnm">'+esc(r.icon||'')+' '+esc(r.name)+(late?'<span class="dt-tag late">late</span>':'')+(isNx?'<span class="dt-tag now">next</span>':'')+'</div><small>'+esc(r.slot||'')+(r.t!=null?' · '+esc(dtT(r.t,S)):'')+'</small></div>'+
      '<div class="dt-kc">'+(showK?Math.round(r.n.calories)+' kcal':'· · ·')+'<small>'+(showK?Math.round(r.n.protein)+' g protein':'')+'</small></div>'+
      '<div class="dt-det">'+esc(r.detail||'')+(feel?'<div class="dt-fl">'+esc(feel)+'</div>':'')+feelHtml+(dietW.ui.choose===r.key&&r.status==='planned'?chooserHtml(r):acts)+'</div></div>';
  }).join('');
  const exRows=extras.map(r=>'<div class="dt-meal eaten x"><button type="button" class="dt-ck" data-dt-delx="'+esc(r.id)+'" title="Remove">✓</button><div class="dt-mn"><div class="dt-mnm">'+esc(r.icon||'➕')+' '+esc(r.name)+'<span class="dt-tag x">added</span></div><small>'+esc(r.quick?'Quick add':r.detail)+'</small></div><div class="dt-kc">'+Math.round(r.n.calories)+' kcal<small>'+Math.round(r.n.protein)+' g protein</small></div></div>').join('');
  const listHtml=S.list&&(rows.length||extras.length)?'<div class="dt-sec"><span>'+(isT?"Today's meals":esc(dtLabel(k))+"'s meals")+'</span><span>'+eatenN+' of '+(totalN+extras.length)+' eaten</span></div><div class="dt-meals">'+listRows+exRows+'</div>':'';
  const addHtml=S.add?'<button type="button" class="dt-btn sm dt-addbtn" data-dt-addtoggle>＋ Ate something else</button><div class="dt-add'+(dietW.ui.add?' on':'')+'"><input data-dt-an placeholder="What did you eat?" style="flex:2 1 130px"><input data-dt-ak type="number" inputmode="decimal" placeholder="kcal" style="width:70px"><input data-dt-ap type="number" inputmode="decimal" placeholder="protein g" style="width:84px"><input data-dt-asu type="number" inputmode="decimal" class="dt-more" placeholder="sugar g" style="width:72px"><input data-dt-asf type="number" inputmode="decimal" class="dt-more" placeholder="sat fat g" style="width:76px"><button type="button" class="dt-btn pri sm" data-dt-addgo>Add</button></div>':'';
  /* week, flex, streak */
  const wk=C.week(D,pid,k),dn=['S','M','T','W','T','F','S'];
  const onT=wk.filter(x=>x.state==='ok'&&x.proteinOk).length,logged=wk.filter(x=>x.eaten>0),avgP=logged.length?Math.round(logged.reduce((a,x)=>a+x.protein,0)/logged.length):0;
  const wkSel=dietW.ui.wk&&wk.some(x=>x.date===dietW.ui.wk)?dietW.ui.wk:null;
  const wkMax=Math.max(g.calories*1.25,...wk.map(x=>x.kcal),1),WH=70;
  const wkInfo=(()=>{
    if(!wkSel)return '<span><b>'+onT+' of '+logged.length+'</b> logged days on target</span><span>Avg protein <b>'+avgP+' g</b></span><span class="dt-tip">Tap a bar for that day</span>';
    const x=wk.find(z=>z.date===wkSel),tt=x.t||{},nm=new Date(x.date+'T12:00:00').toLocaleDateString([],{weekday:'long',month:'short',day:'numeric'});
    if(!x.eaten)return '<b class="dt-wi-h">'+esc(nm)+'</b><span>Nothing logged.</span><button type="button" class="dt-btn sm" data-dt-day="'+x.date+'">Open this day</button>';
    const st={ok:'On target',under:'Under',over:'Over'}[x.state]||'';
    return '<b class="dt-wi-h">'+esc(nm)+' · '+st+'</b><span><b>'+Math.round(x.kcal).toLocaleString()+'</b> of '+Math.round(g.calories).toLocaleString()+' kcal</span><span>Protein <b>'+Math.round(x.protein)+' g</b> / '+Math.round(g.protein)+'</span>'+
      (tt.carbs!=null?'<span>Carbs <b>'+Math.round(tt.carbs)+' g</b></span>':'')+(tt.fat!=null?'<span>Fat <b>'+Math.round(tt.fat)+' g</b></span>':'')+'<span>'+x.eaten+' meal'+(x.eaten===1?'':'s')+' logged</span><button type="button" class="dt-btn sm" data-dt-day="'+x.date+'">Open this day</button>';
  })();
  const weekHtml=S.week?'<div class="dt-sec"><span>Last 7 days</span><span>calories vs goal</span></div><div class="dt-wgraph" style="--wh:'+WH+'px"><i class="dt-gl" style="bottom:calc('+(g.calories/wkMax*WH)+'px + 22px)"></i><div class="dt-week">'+wk.map(x=>{const h=x.eaten?Math.max(5,x.kcal/wkMax*WH):3;return '<button type="button" class="dt-wd s-'+x.state+(x.date===k?' cur':'')+(x.date===wkSel?' sel':'')+'" data-dt-bar="'+x.date+'" aria-label="'+esc(x.date)+': '+Math.round(x.kcal)+' kcal"><div class="dt-col"><div style="height:'+h+'px"></div></div><small>'+dn[new Date(x.date+'T12:00:00').getDay()]+'</small></button>'}).join('')+'</div></div><div class="dt-wi">'+wkInfo+'</div>':'';
  const fx=C.flex(D,pid,td);
  const flexHtml=(S.flex&&isT)?'<div class="dt-line"><span>Flex bank this week</span><b class="'+(fx.bank<0?'neg':'')+'">'+(fx.bank>0?'+':'')+fx.bank.toLocaleString()+' kcal</b><small>'+(fx.doneDays?'Today you can have up to '+fx.todayCap.toLocaleString()+' kcal and still land on the week.':'Starts after your first full day this week.')+'</small></div>':'';
  const streakN=S.streak?C.streak(D,pid,td):0,score=wk.filter(x=>x.eaten>0&&x.state==='ok').length;
  const streakHtml=S.streak?'<div class="dt-line"><span>Streak</span><b>'+streakN+(streakN===1?' day':' days')+'</b><small>Protein goal hit on logged days'+(logged.length?' · this week '+score+'/7 on calories':'')+'</small></div>':'';
  const en=(S.energy&&dietW.en&&dietW.en.date===k)?C.energy(dietW.en.stats,dietW.en.kg,dietW.en.cardio,dietW.en.sec,t.calories):null;
  const energyHtml=(S.energy&&en)?'<div class="dt-line"><span>Eaten vs burned</span><b class="'+(en.net>0?'':'')+'">'+Math.round(t.calories).toLocaleString()+' / '+en.burned.toLocaleString()+'</b><small>'+(en.net>0?'+'+en.net:en.net)+' kcal net · '+en.neat+' baseline + '+en.exercise+' from Gym</small></div>':'';
  let kgW=0;{const dl=state.insights&&state.insights.daily||{};Object.keys(dl).sort().forEach(d=>{if(dl[d].weight)kgW=dl[d].weight})}
  const weightHtml=(S.weight&&kgW)?'<div class="dt-line"><span>Weight</span><b>'+kgW+' kg</b><small>Latest from Gym</small></div>':'';
  const head=BKW('head','<div class="dt-head"><div class="dt-hl"><a class="dt-open" href="apps/diet.html" data-profile-link title="Open the Diet app" aria-label="Open the Diet app">Open Diet ↗</a></div><div class="dt-nav"><button type="button" data-dt-nav="-1" aria-label="Earlier day">‹</button>'+(past?'<button type="button" class="dt-today" data-dt-today>'+esc(dtLabel(k))+' · back to today</button>':'<span>Today</span>')+'<button type="button" data-dt-nav="1" '+(past?'':'disabled')+' aria-label="Later day">›</button></div></div>');
  const A=BKW('ring',ringHtml)+BKW('macros',macroHtml)+(size==='sm'?'':BKW('micro',microHtml))+BKW('next',nextHtml),B=BKW('rescue',rescueHtml)+BKW('meals',listHtml)+BKW('add',addHtml);
  const C2=BKW('week',weekHtml)+BKW('flex',flexHtml)+BKW('streak',streakHtml)+BKW('energy',energyHtml)+BKW('weight',weightHtml);
  const keep=el.scrollTop,addv=['an','ak','ap','asu','asf'].map(n=>{const i=el.querySelector('[data-dt-'+n+']');return i?i.value:''});
  el.innerHTML=head+(size==='wide'?'<div class="dt-body"><div>'+A+C2+'</div><div>'+B+'</div></div>':A+B+C2);
  if(dietW.ui.add){['an','ak','ap','asu','asf'].forEach((n,i)=>{const x=el.querySelector('[data-dt-'+n+']');if(x)x.value=addv[i]||''})}
  el.scrollTop=keep;updateProfileLinks();
  if(!el._dtRO&&window.ResizeObserver){el._dtRO=new ResizeObserver(()=>{if(el.isConnected&&wtSize(el)!==el._dtSz)dietPaint(el,wdg)});el._dtRO.observe(el)}
  dtWire(el,wdg);
}
/* a change: read the Diet document fresh, apply, save whole, then update what you see. */
async function dietCommit(fn,msg,undoFn){
  if(dietW.busy)return null;dietW.busy=true;
  try{
    const rd=await readSafe(dietRef(),null);
    if(!rd.ok||!rd.exists||!rd.val||!Array.isArray(rd.val.diary)){toast('Could not reach Diet, nothing was changed');return null}
    const D=rd.val,res=fn(D);
    if(!res||!res.changed){dietW.S=D;dietW.t=Date.now();dietRepaintAll();return res}
    DietCore.trackUsage(D,res.jobs);
    await dietRef().set({json:JSON.stringify(D),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    dietW.S=D;dietW.t=Date.now();dietW.energyShown=0;
    try{if(schedX&&schedX.diet){schedX.diet=D;schedX.t=Date.now();schedRedraw()}}catch(e){}
    try{insightsLoadedAt=0}catch(e){}
    dietRepaintAll();
    if(res.jobs&&res.jobs.length){
      DietCore.trackGrocery(D,res.jobs,k=>appRef('grocery-v4',k),today()).then(r=>{dietW.groc=null;if(r&&r.low&&r.low.length)toast(r.low.map(x=>x.name).join(', ')+(r.low.length>1?' are':' is')+' running low');return dietGroc()}).then(()=>dietRepaintAll()).catch(e=>console.warn('grocery stock',e));
    }
    try{linkRun(false).catch(()=>{})}catch(e){}
    if(msg)toast(msg,undoFn?'Undo':null,undoFn||null);
    return res;
  }catch(e){console.warn(e);toast('Could not save that');return null}
  finally{dietW.busy=false}
}
function dtWire(el,wdg){
  const S=wsAll(wdg,WIDGET_TYPES.diet),pid=dtPid();
  const cur=()=>dietW.view||today();
  const rowOf=key=>{const r=DietCore.dayRows(dietW.S,pid,cur());return r.rows.find(x=>x.key===key)};
  const setTo=async(key,val,msgFn)=>{
    const r=rowOf(key);if(!r)return;const date=cur(),was=r.status;
    return dietCommit(D=>DietCore.setStatus(D,pid,date,key,val),msgFn(r),()=>dietCommit(D=>DietCore.setStatus(D,pid,date,key,was),null));
  };
  el.onclick=async e=>{
    const q=s=>e.target.closest(s);let x;
    if(x=q('[data-dt-nav]')){const d=Number(x.dataset.dtNav);if(d>0&&!dietW.view)return;const nk=addDays(cur(),d);dietW.view=nk>=today()?null:nk;dietPaint(el,wdg);return}
    if(q('[data-dt-today]')){dietW.view=null;dietPaint(el,wdg);return}
    if(x=q('[data-dt-bar]')){const d=x.dataset.dtBar;dietW.ui.wk=dietW.ui.wk===d?null:d;dietPaint(el,wdg);return}
    if(x=q('[data-dt-day]')){dietW.ui.wk=null;dietW.view=x.dataset.dtDay>=today()?null:x.dataset.dtDay;dietPaint(el,wdg);return}
    if(x=q('[data-dt-open]')){const k=x.dataset.dtOpen;dietW.ui.open[k]=!dietW.ui.open[k];dietPaint(el,wdg);return}
    if(x=q('circle[data-dt-arc]')){const k=x.getAttribute('data-dt-arc');if(k){dietW.ui.open[k]=!dietW.ui.open[k];dietPaint(el,wdg)}return}
    if(x=q('[data-dt-pick]')){const p=dietW.ui.pick[x.dataset.dtPick]=dietW.ui.pick[x.dataset.dtPick]||{};p[x.dataset.g]=x.dataset.r;dietPaint(el,wdg);return}
    if(q('[data-dt-choosex]')){dietW.ui.choose=null;dietPaint(el,wdg);return}
    if(x=q('[data-dt-chooseok]')){
      const key=x.dataset.dtChooseok,r=rowOf(key);if(!r)return;const D=dietW.S,ch=DietCore.choices(D,r.meal),pick=dietW.ui.pick[key]||{};
      const rs=ch.fixed.slice();Object.keys(ch.groups).forEach(gk=>{const id=pick[gk]||ch.groups[gk][0].id;const o=ch.groups[gk].find(z=>z.id===id);if(o)rs.push(o)});
      const date=cur(),mid=r.meal.id;let newId=null;
      dietW.ui.choose=null;
      await dietCommit(D2=>{const res=DietCore.logMealWith(D2,pid,date,mid,rs.map(z=>(D2.recipes||[]).find(y=>y.id===z.id)||z));newId=res.id;return res},'Ate '+r.name+' · +'+Math.round(rs.reduce((a,z)=>a+DietCore.recipeServingN(D,z).calories,0))+' kcal',()=>dietCommit(D2=>{DietCore.undoLogMealWith(D2,pid,date,mid,newId);return{changed:true,jobs:[]}},null));
      return;
    }
    const eat=async key=>{const r=rowOf(key);if(!r)return;if(r.choice&&r.status==='planned'){dietW.ui.choose=key;dietW.ui.open[key]=true;dietPaint(el,wdg);return}
      await setTo(key,'eaten',r=>'Ate '+r.name+' · +'+Math.round(r.n.calories)+' kcal, +'+Math.round(r.n.protein)+' g protein')};
    if(x=q('[data-dt-ate]')){await eat(x.dataset.dtAte);return}
    if(x=q('[data-dt-ck]')){const r=rowOf(x.dataset.dtCk);if(!r)return;if(r.status==='eaten')await setTo(r.key,'planned',r=>'Unmarked '+r.name);else if(r.status==='skipped')await setTo(r.key,'planned',r=>'Back on the plan: '+r.name);else await eat(r.key);return}
    if(x=q('[data-dt-skip]')){const r=rowOf(x.dataset.dtSkip);if(!r)return;if(r.status==='skipped')await setTo(r.key,'planned',r=>'Back on the plan: '+r.name);else await setTo(r.key,'skipped',r=>'Skipped '+r.name);return}
    if(x=q('[data-dt-un]')){await setTo(x.dataset.dtUn,'planned',r=>'Unmarked '+r.name);return}
    if(x=q('[data-dt-delx]')){const id=x.dataset.dtDelx,en=(dietW.S.diary||[]).find(z=>z.id===id),copy=en?JSON.parse(JSON.stringify(en)):null;
      await dietCommit(D=>({changed:DietCore.removeEntry(D,id),jobs:[]}),'Removed '+(copy?copy.name:'entry'),()=>dietCommit(D=>{if(copy&&!D.diary.some(z=>z.id===id)){D.diary.push(copy);DietCore.applyConsumption(D,copy.status==='eaten'?copy.consumption||[]:[],-1);return{changed:true,jobs:[]}}return{changed:false}},null));return}
    if(x=q('[data-dt-feel]')){const id=x.dataset.dtFeel,f=x.dataset.f,en=(dietW.S.diary||[]).find(z=>z.id===id);if(!en)return;
      const old=en.note||'',rest=DT_FEEL.some(z=>old.indexOf(z)===0)?old.slice(2).trim():old,next=old.indexOf(f)===0?rest:(f+(rest?' '+rest:''));
      await dietCommit(D=>({changed:DietCore.setNote(D,id,next),jobs:[]}),null);return}
    if(q('[data-dt-addtoggle]')){dietW.ui.add=!dietW.ui.add;dietPaint(el,wdg);if(dietW.ui.add){const i=el.querySelector('[data-dt-an]');if(i)i.focus()}return}
    if(q('[data-dt-addgo]')){
      const v=n=>{const i=el.querySelector('[data-dt-'+n+']');return i?i.value.trim():''},name=v('an'),kc=Number(v('ak'));
      if(!name||!(kc>0)){toast('Add a name and the calories');return}
      let newId=null;dietW.ui.add=false;
      await dietCommit(D=>{const res=DietCore.quickAdd(D,pid,cur(),{name:name,kcal:kc,protein:Number(v('ap'))||0,sugar:Number(v('asu'))||0,satFat:Number(v('asf'))||0});newId=res.id;return res},'Logged '+name+' · '+Math.round(kc)+' kcal',()=>dietCommit(D=>({changed:DietCore.removeEntry(D,newId),jobs:[]}),null));return}
    if(x=q('[data-dt-whey]')){
      const fid=x.dataset.dtWhey,qty=Number(x.dataset.q),unit=x.dataset.u;let nid=null;
      await dietCommit(D=>{const f=(D.foods||[]).find(z=>z.id===fid);if(!f)return{changed:false};const res=DietCore.logFood(D,pid,cur(),f,qty,unit,f.name);nid=res.id;return res},'Logged whey',()=>dietCommit(D=>({changed:DietCore.removeEntry(D,nid),jobs:[]}),null));return}
    if(x=q('[data-dt-buy]')){
      const bad=(DietCore.pantryCheck(dietW.S,DietCore.dayRows(dietW.S,pid,cur()).rows,dietW.groc)[x.dataset.dtBuy]||[]);if(!bad.length)return;
      try{await linkEnsure();await linkApplyTasks(bad.map(b=>({key:'dietbuy:'+b.name.toLowerCase()+':'+today(),src:'diet',shared:false,title:'Buy: '+b.name,due:today(),startDate:today(),tags:['grocery'],notes:'Needed for your next meal and '+(b.status==='finished'?'finished':'low')+' in the pantry.',link:'apps/grocery.html'})));toast('Added to your to-do list')}catch(err){toast('Could not add that')}
      return}
  };
}

/* ---- Diet by voice (used by assets/voice.js) ---- */
async function dietVoice(kind,o){
  const say=t=>{try{speak(t)}catch(e){toast(t)}};
  const D=await dietLoad(true);if(!D){say("I couldn't open your Diet plan.");return true}
  const pid=dtPid(),date=today();
  if(kind==='add'){
    const kc=Number(o.kcal)||0;if(!(kc>0)){say('How many calories?');return true}
    let id=null;const r=await dietCommit(S=>{const x=DietCore.quickAdd(S,pid,date,{name:o.name||'Food',kcal:kc,protein:Number(o.protein)||0});id=x.id;return x},null);
    if(!r){say("I couldn't log that.");return true}
    try{voiceUndoPush('logging '+(o.name||'food'),()=>dietCommit(S=>({changed:DietCore.removeEntry(S,id),jobs:[]}),null))}catch(e){}
    say('Logged '+(o.name||'food')+', '+Math.round(kc)+' calories.');return true;
  }
  const q=String(o.name||'').toLowerCase().trim(),{rows}=DietCore.dayRows(D,pid,date);
  const hit=rows.find(r=>r.slot&&r.slot.toLowerCase()===q)||rows.find(r=>(r.name||'').toLowerCase().includes(q)||(r.slot||'').toLowerCase().includes(q));
  if(!hit){say("I couldn't find a planned "+q+".");return true}
  if(hit.status==='eaten'){say(hit.name+' is already logged.');return true}
  if(kind==='ate'&&hit.choice){say(hit.name+' has options. Tick it on your Diet card to pick.');return true}
  const val=kind==='skip'?'skipped':'eaten',was=hit.status,key=hit.key;
  const r=await dietCommit(S=>DietCore.setStatus(S,pid,date,key,val),null);
  if(!r||!r.changed){say("I couldn't update that.");return true}
  try{voiceUndoPush((kind==='skip'?'skipping ':'logging ')+hit.name,()=>dietCommit(S=>DietCore.setStatus(S,pid,date,key,was),null))}catch(e){}
  say(kind==='skip'?'Skipped '+hit.name+'.':'Logged '+hit.name+', '+Math.round(hit.n.calories)+' calories and '+Math.round(hit.n.protein)+' grams of protein.');
  return true;
}
/* ---- Skin widget: today's routine as tickable sections. Reads and writes the Skin app's own data (src: assets/skin-core.js) ---- */
const skinW={key:null,st:null,t:0,view:null,ui:{open:{},track:{open:false,vals:{},touched:{},overall:'',react:[],obs:''},ci:false},timer:null,int:null,busy:false,gym:null,gt:0};
const skRef=k=>profileRef('skin-profiles',k);
const skFmt=(S,t)=>{if(!t)return'';if(S&&S.fmt==='24')return t.length>5?t:t;return t};
async function skinLoad(force){
  const k=state.user.uid+'|'+state.profile;
  if(skinW.key!==k){skinW.st=null;skinW.view=null;skinW.t=0;skinW.key=k;skinW.gym=null;skinW.ui.open={};skinW.ui.track={open:false,vals:{},touched:{},overall:'',react:[],obs:''}}
  if(!force&&skinW.st&&Date.now()-skinW.t<20000)return skinW.st;
  const names=['stepLog','productState','usageLedger','trackingLog','checkins','shoppingLog'];
  const [rs,ps]=await Promise.all([Promise.all(names.map(n=>readSafe(skRef(n),null))),skRef('programStart').get().then(s=>({ok:true,start:(s.exists&&s.data().startDate)||null})).catch(()=>({ok:false}))]);
  if(!rs.every(r=>r.ok)||!ps.ok)return skinW.st;
  const obj=(r,fb)=>(r.exists&&r.val&&typeof r.val==='object'&&!Array.isArray(r.val))?r.val:fb;
  const ci=obj(rs[4],{});
  try{if(window.SkinPlan)window.SkinPlan.setStart(ps.start)}catch(e){}
  skinW.st={stepLog:obj(rs[0],{}),productState:SkinCore.seedState(obj(rs[1],{}),state.profile),usageLedger:obj(rs[2],{}),trackingLog:obj(rs[3],{}),
    checkins:{weight:ci.weight||[],waist:ci.waist||[],photos:ci.photos||[],pimples:ci.pimples||[]},shoppingLog:obj(rs[5],{}),start:ps.start||SkinCore.TEMPLATE_START};
  skinW.t=Date.now();return skinW.st;
}
async function skinGym(){
  if(skinW.gym&&Date.now()-skinW.gt<600000)return skinW.gym;
  try{
    const snap=await db.collection('users').doc(state.user.uid).collection('profiles').doc(state.profile.toLowerCase()).collection('dailyLogs').get(),all=[];
    snap.forEach(d=>all.push(Object.assign({date:d.id},d.data())));all.sort((a,b)=>a.date<b.date?-1:1);
    const last=k=>{const l=all.filter(x=>x[k]!=null&&x[k]!=='');return l.length?{date:l[l.length-1].date,value:l[l.length-1][k]}:null};
    skinW.gym={weight:last('weight'),waist:last('waist')};skinW.gt=Date.now();
  }catch(e){skinW.gym={weight:null,waist:null}}
  return skinW.gym;
}
function skinRepaintAll(){document.querySelectorAll('[data-widget-type="skin"] .widget-card-body').forEach(el=>{try{skinPaint(el,state.widgets.find(x=>x.type==='skin'))}catch(e){console.warn(e)}})}
async function renderSkinInto(el,wdg){
  if(!el)return;
  if(!skinW.st)el.innerHTML='<div class="empty-state">Loading your routine…</div>';
  await skinLoad(false);
  if(!skinW.st){el.innerHTML='<div class="empty-state"><strong>Unavailable</strong>Could not load your skin data.<a class="widget-card-link" href="apps/skin.html" data-profile-link>Open Skin <i data-lucide="arrow-up-right"></i></a></div>';updateProfileLinks();if(window.lucide)lucide.createIcons();return}
  skinPaint(el,wdg||state.widgets.find(x=>x.type==='skin'));
  skinStartTick();
  if(state.profile==='Anusha')skinGym().then(()=>{if(el.isConnected&&!skinW.ui.track.open)skinPaint(el,wdg)}).catch(()=>{});
}
function skinStartTick(){
  if(skinW.int)return;
  skinW.int=setInterval(async()=>{
    if(document.hidden||skinW.busy||!document.querySelector('[data-widget-type="skin"] .widget-card-body'))return;
    if(skinW.ui.track.open||skinW.ui.ci)return;
    await skinLoad(true);skinRepaintAll();
  },60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&skinW.st&&Date.now()-skinW.t>30000&&document.querySelector('[data-widget-type="skin"] .widget-card-body'))skinLoad(true).then(skinRepaintAll).catch(()=>{})});
}
const skLabel=k=>{const t=today();if(k===t)return'Today';if(k===addDays(t,-1))return'Yesterday';return new Date(k+'T12:00:00').toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})};
function skinPaint(el,wdg){
  const st=skinW.st;if(!st||!el)return;
  const S=wsAll(wdg,WIDGET_TYPES.skin),C=SkinCore,prof=state.profile,td=today(),isA=prof==='Anusha';
  if(skinW.view&&skinW.view>=td)skinW.view=null;
  const k=skinW.view||td,isT=k===td,past=!isT;
  const size=wtSize(el);el._skSz=size;
  ['sk-sm','sk-md','sk-lg','sk-wide'].forEach(c=>el.classList.remove(c));el.classList.add('sk','sk-'+size);
  const cal=C.calendar(st.start),secs=C.sections(prof,k,st.start),month=isA?null:C.monthFor(st.start,k);
  const first=cal.months[0].range[0],lastD=cal.months[cal.months.length-1].range[1];
  const comp=C.completion(prof,k,st.start,st.stepLog);
  const streak=S.streak?C.streak(prof,st.start,st.stepLog,td):0;
  const head=BKW('head','<div class="sk-head"><div class="sk-hl"><a class="sk-open" href="apps/skin.html" data-profile-link title="Open the Skin app" aria-label="Open the Skin app">Open Skin ↗</a></div><div class="sk-nav"><button type="button" data-sk-nav="-1" aria-label="Earlier day">‹</button>'+(past?'<button type="button" class="sk-today" data-sk-today>'+esc(skLabel(k))+' · back to today</button>':'<span>Today</span>')+'<button type="button" data-sk-nav="1" '+(past?'':'disabled')+' aria-label="Later day">›</button></div></div>');
  /* program header */
  let prog='';
  if(S.prog){
    if(isA)prog='<div class="sk-prog"><div class="sk-top"><span><b>Daily routine</b></span><span>No fixed end date</span></div><div class="sk-obj">Same routine every day. Photos and measurements on a schedule.</div></div>';
    else if(k<first)prog='<div class="sk-prog"><div class="sk-top"><span><b>Program starts '+esc(new Date(first+'T12:00:00').toLocaleDateString([],{month:'short',day:'numeric'}))+'</b></span></div></div>';
    else if(k>lastD)prog='<div class="sk-prog"><div class="sk-top"><span><b>5-month program complete</b></span></div><div class="sk-obj">Keep this as your long-term maintenance routine.</div></div>';
    else if(month){
      const mi=cal.months.indexOf(month),dayN=C.daysBetween(first,k)+1,total=C.daysBetween(first,lastD)+1,dim=C.daysBetween(month.range[0],k)+1,mlen=C.daysBetween(month.range[0],month.range[1])+1;
      prog='<div class="sk-prog"><div class="sk-top"><span><b>'+esc(month.name.split(' — ')[0])+'</b> · day '+dayN+' of '+total+'</span><span>'+dim+'/'+mlen+' this month</span></div><div class="sk-months">'+cal.months.map((m,i)=>'<i class="'+(i<mi?'done':i===mi?'cur':'')+'" style="--p:'+Math.round(dim/mlen*100)+'%"></i>').join('')+'</div><div class="sk-obj">'+esc(month.name.split(' — ')[1]||'')+'</div></div>';
    }
  }
  /* empty (no plan for this day) */
  if(!secs){
    el.innerHTML=head+prog+'<div class="empty-state" style="padding:10px 0">No routine planned for '+esc(skLabel(k))+'.</div>'+skCabHtml(st,S,prof,C)+'<a class="widget-card-link" href="apps/skin.html" data-profile-link>Open Skin <i data-lucide="arrow-up-right"></i></a>';
    updateProfileLinks();if(window.lucide)lucide.createIcons();skWire(el,wdg);return;
  }
  const secStat=s=>{const req=s.steps.map((x,i)=>({x,i})).filter(o=>!o.x.optional),d=req.filter(o=>st.stepLog[C.stepKey(k,s.key,o.i)]).length;return{n:req.length,d:d,all:s.steps.filter((x,i)=>st.stepLog[C.stepKey(k,s.key,i)]).length}};
  const stats=secs.map(secStat),tD=stats.reduce((a,x)=>a+x.d,0),tN=stats.reduce((a,x)=>a+x.n,0);
  const nextIdx=stats.findIndex(x=>x.d<x.n),nextSec=nextIdx>=0?secs[nextIdx]:null;
  /* ring */
  const R=52,CI=2*Math.PI*R,gap=4;let acc=0,arcs='';
  secs.forEach((s,i)=>{const x=stats[i],len=CI/secs.length,l=Math.max(0,len-gap),off=-acc;acc+=len;
    arcs+='<circle class="sk-seg bg" cx="62" cy="62" r="'+R+'" stroke-dasharray="'+l+' '+CI+'" stroke-dashoffset="'+off+'"/>';
    if(x.d)arcs+='<circle class="sk-seg '+(x.d===x.n?'full':'fg')+'" cx="62" cy="62" r="'+R+'" stroke-dasharray="'+(l*x.d/x.n)+' '+CI+'" stroke-dashoffset="'+off+'"/>'});
  const faceSec=secs.find(s=>s.key==='face'||s.key==='pm');
  const tonight=faceSec?(faceSec.treat?faceSec.treat:'Night routine'):'';
  const hero='<div class="sk-hero"><div class="sk-ring"><svg viewBox="0 0 124 124">'+arcs+'</svg><div class="sk-rc"><b>'+tD+'/'+tN+'</b><span>steps '+(isT?'today':esc(skLabel(k).toLowerCase()))+'</span></div></div><div class="sk-kv">'+
    (tonight?'<div class="sk-sm1">'+(isT?'Tonight':'That night')+': <b>'+esc(tonight)+'</b></div>':'')+
    (nextSec?'<div class="sk-sm1">Next up: <b>'+esc(nextSec.label)+'</b> · '+(stats[nextIdx].n-stats[nextIdx].d)+' step'+((stats[nextIdx].n-stats[nextIdx].d)===1?'':'s')+' left</div>':'<span class="sk-chip ok">✓ Everything done'+(isT?' today':'')+'</span>')+
    (S.streak&&streak>0?'<span class="sk-chip fire">🔥 '+streak+'-day streak</span>':'')+
    (nextSec?'<button type="button" class="sk-btn pri sm sk-nowbtn" data-sk-open="'+esc(nextSec.key)+'">Start '+esc(nextSec.label.toLowerCase())+'</button>':'')+'</div></div>';
  /* sections */
  const stepRow=(s,step,i)=>{
    const key=C.stepKey(k,s.key,i),dn=!!st.stepLog[key];if(S.hideDone&&dn)return'';
    const pn=S.prod?C.productName(prof,step):'',run=skinW.timer&&skinW.timer.key===key;
    return '<div class="sk-step'+(dn?' done':'')+'"><button type="button" class="sk-ck" data-sk-step="'+esc(s.key)+':'+i+'" aria-label="Toggle step">'+(dn?'✓':'')+'</button><div><div class="sk-tx">'+esc(step.text)+(step.optional?'<span class="sk-opt">OPTIONAL</span>':'')+'</div>'+(pn?'<div class="sk-prod">🧴 '+esc(pn)+'</div>':'')+(S.qty&&step.qty?'<div class="sk-qty">'+esc(step.qty)+'</div>':'')+
      (S.timers&&step.timerMinutes&&!dn&&isT?'<button type="button" class="sk-tm'+(run?' run':'')+'" data-sk-timer="'+esc(s.key)+':'+i+':'+step.timerMinutes+'">'+(run?'⏱ '+skTimerText()+' left · tap to stop':'Start '+step.timerMinutes+'-min wait timer')+'</button>':'')+'</div></div>';
  };
  const secHtml=secs.map((s,i)=>{
    const x=stats[i],autoOpen=nextSec&&nextSec.key===s.key,op=skinW.ui.open[s.key]!=null?skinW.ui.open[s.key]:(autoOpen&&size!=='sm'&&size!=='md'?true:autoOpen);
    const cnt=x.d===x.n?'✓ done':x.d+'/'+x.n;
    return BKW('sec-'+s.key,'<div class="sk-sect'+(op?' open':'')+(x.d===x.n?' alldone':'')+'"><div class="sk-sh" data-sk-toggle="'+esc(s.key)+'" role="button"><div><b>'+esc(s.icon)+' '+esc(s.label)+'</b>'+(s.treat?'<span class="sk-tag">'+esc(s.treat)+'</span>':'')+(s.time&&isT?'<span class="sk-time">'+esc(s.time)+'</span>':'')+'<br><small>'+esc(s.sub||'')+'</small></div><span class="sk-ct">'+cnt+'</span></div><div class="sk-sbar"><i style="width:'+(x.n?x.d/x.n*100:0)+'%"></i></div><div class="sk-steps">'+s.steps.map((step,j)=>stepRow(s,step,j)).join('')+(s.note?'<div class="sk-qty">'+esc(s.note)+'</div>':'')+'<div class="sk-alldo"><button type="button" class="sk-btn sm" data-sk-all="'+esc(s.key)+'">'+(x.d===x.n?'Untick all':'Tick all steps')+'</button></div></div></div>');
  }).join('');
  /* coming up + heat */
  const dn=['S','M','T','W','T','F','S'];
  const up=(S.coming&&!isA)?C.upcoming(prof,st.start,td,7):[];
  const comingHtml=up.length&&up.some(u=>!u.none)?'<div class="sk-sec"><span>Next 7 nights</span><span>what each night is</span></div><div class="sk-coming">'+up.map(u=>u.none?'<div class="sk-cd"><b>'+dn[new Date(u.date+'T12:00:00').getDay()]+'</b><i class="t-regular">–</i></div>':'<div class="sk-cd" title="'+esc(u.label+(u.nizoral?' · Nizoral':'')+(u.ceraveSA?' · CeraVe SA':''))+'"><b>'+new Date(u.date+'T12:00:00').toLocaleDateString([],{weekday:'short'})+'</b><i class="t-'+esc(u.face)+'">'+esc(u.face==='regular'?'Regular':u.face==='differin'?'Differin':u.face==='azelaic'?'Azelaic':'BHA')+'</i>'+(u.nizoral?'<em>Nizoral</em>':'')+'</div>').join('')+'</div>':'';
  const heat=C.heat(prof,st.start,st.stepLog,td,28),best=C.bestStreak(prof,st.start,st.stepLog,td),wk=heat.slice(-7).filter(h=>h.lv===4).length,planned=heat.filter(h=>h.total>0&&h.date<=td),fullN=planned.filter(h=>h.lv===4).length;
  const heatHtml=S.heat?'<div class="sk-sec"><span>Last 28 days</span><span>'+fullN+' of '+planned.length+' days complete</span></div><div class="sk-heat">'+heat.map(h=>'<i class="h'+h.lv+'" title="'+esc(skLabel(h.date)+': '+(h.total?h.pct+'%':'no routine'))+'" data-sk-day="'+h.date+'"></i>').join('')+'</div><div class="sk-mini"><span>Best streak <b>'+best+'</b></span><span>This week <b>'+wk+'/7</b></span><span>Routine score <b>'+(planned.length?Math.round(planned.reduce((a,h)=>a+h.pct,0)/planned.length):0)+'%</b></span></div>':'';
  const cabHtml=skCabHtml(st,S,prof,C);
  /* tracking / check-in */
  let trkHtml='';
  if(S.track&&!isA&&month)trkHtml=skTrackHtml(st,k,month,C);
  if(S.track&&isA)trkHtml=skCheckinHtml(st,td,C);
  /* review countdown */
  let revHtml='';
  if(S.review&&!isA){const nx=cal.reviews.find(d=>d>=td);if(nx){const dl=C.daysBetween(td,nx),m=C.monthFor(st.start,nx);revHtml='<div class="sk-rev"><span><b>'+esc(m?m.name.split(' — ')[0]:'Program')+' review</b> '+(dl===0?'is today':'in '+dl+' day'+(dl===1?'':'s'))+' · '+esc(new Date(nx+'T12:00:00').toLocaleDateString([],{month:'short',day:'numeric'}))+'</span><a class="sk-btn sm" href="apps/skin.html" data-profile-link>Open in Skin</a></div>'}}
  const A=BKW('top','<div class="sk-topgrid">'+prog+hero+'</div>')+secHtml,B=BKW('coming',comingHtml)+BKW('heat',heatHtml)+BKW('cab',cabHtml)+BKW('trk',trkHtml)+BKW('rev',revHtml);
  const keep=el.scrollTop;
  const trackVals={};el.querySelectorAll('[data-sk-obs]').forEach(i=>trackVals.obs=i.value);
  el.innerHTML=head+(size==='wide'?'<div class="sk-body"><div>'+A+'</div><div>'+B+'</div></div>':A+B);
  if(skinW.ui.track.open){const o=el.querySelector('[data-sk-obs]');if(o)o.value=skinW.ui.track.obs||''}
  el.scrollTop=keep;updateProfileLinks();
  if(!el._skRO&&window.ResizeObserver){el._skRO=new ResizeObserver(()=>{if(el.isConnected&&wtSize(el)!==el._skSz)skinPaint(el,wdg)});el._skRO.observe(el)}
  skWire(el,wdg);
}
function skTimerText(){if(!skinW.timer)return'';const l=Math.max(0,Math.round((skinW.timer.end-Date.now())/1000));return Math.floor(l/60)+':'+String(l%60).padStart(2,'0')}
function skCabHtml(st,S,prof,C){
  if(!S.cab)return'';
  const prods=C.products(prof),low=C.low(st.productState,prof);
  return '<div class="sk-sec"><span>Product stock</span><span>from your Cabinet</span></div><div class="sk-cab">'+prods.map(p=>{const pc=C.pct(st.productState,p.id),lw=pc<=30;return '<div class="sk-pr'+(lw?' low':'')+'"><span class="nm">'+esc(p.name)+'</span><div class="sk-pbar"><i style="width:'+pc+'%;background:'+(pc<=15?'var(--danger)':pc<=30?'var(--accent)':'var(--success)')+'"></i></div><span class="pc">'+pc+'%</span></div>'}).join('')+'</div>'+
    low.map(p=>{const sent=st.shoppingLog[p.name];return '<div class="sk-low"><span>⚠ '+esc(p.name)+' is '+(p.pct<=15?'almost out':'running low')+' ('+p.pct+'%)'+(sent?' · sent '+(C.daysBetween(sent,today())===0?'today':C.daysBetween(sent,today())+'d ago'):'')+'</span><button type="button" data-sk-send="'+esc(p.id)+'">'+(sent?'Send again':'Send to Grocery')+'</button></div>'}).join('');
}
function skTrackHtml(st,k,month,C){
  const fields=C.trackFields(month.key),rec=st.trackingLog[k]||{},T=skinW.ui.track;
  if(!fields.length)return'';
  const react=T.open?T.react:(rec.reactions||[]);
  let h='<div class="sk-sec"><span>'+(k===today()?"Tonight's tracking":esc(skLabel(k))+' tracking')+'</span><span>'+(rec.savedAt?'saved ✓':'not saved yet')+'</span></div>';
  if(!T.open){
    const logged=Object.keys(st.trackingLog).filter(d=>st.trackingLog[d]&&st.trackingLog[d].savedAt),ov={better:0,same:0,worse:0};logged.forEach(d=>{const o=st.trackingLog[d].overall;if(ov[o]!=null)ov[o]++});
    const f0=fields[0],pts=logged.sort().slice(-7).map(d=>({d,v:st.trackingLog[d][f0.key]})).filter(p=>p.v!=null&&p.v!=='');
    h+='<button type="button" class="sk-btn sm" data-sk-trkopen>'+(rec.savedAt?'Edit tracking':'＋ Log tracking')+'</button>'+
      (pts.length>1?'<div class="sk-sm1" style="margin-top:8px">Last '+pts.length+' nights · '+esc(f0.label.toLowerCase())+'</div><div class="sk-spark">'+pts.map(p=>'<i style="height:'+Math.max(8,Number(p.v)*10)+'%" title="'+esc(p.d+': '+p.v)+'"></i>').join('')+'</div>':'')+
      '<div class="sk-mini"><span>🙂 <b>'+ov.better+'</b> better</span><span>😐 <b>'+ov.same+'</b> same</span><span>🙁 <b>'+ov.worse+'</b> worse</span><span><b>'+logged.length+'</b> nights logged</span></div>';
    return h;
  }
  const val=(f)=>T.vals[f.key]!=null?T.vals[f.key]:(rec[f.key]!=null&&rec[f.key]!==''?rec[f.key]:5);
  h+='<div class="sk-trk">'+fields.map(f=>f.type==='text'?'<div class="sk-trow"><span>'+esc(f.label)+'</span><input type="text" data-sk-fld="'+esc(f.key)+'" data-t="text" placeholder="none" value="'+esc(T.vals[f.key]!=null?T.vals[f.key]:(rec[f.key]||''))+'"></div>':'<div class="sk-trow"><span>'+esc(f.label)+'</span><input type="range" min="0" max="10" step="1" data-sk-fld="'+esc(f.key)+'" value="'+val(f)+'"><b data-sk-fv="'+esc(f.key)+'">'+((T.touched[f.key]||(rec[f.key]!=null&&rec[f.key]!==''))?val(f):'–')+'</b></div>').join('')+
    '<div class="sk-ov">'+['better','same','worse'].map(v=>'<button type="button" class="'+((T.overall||rec.overall)===v?'on':'')+'" data-sk-ov="'+v+'">'+(v==='better'?'🙂 Better':v==='same'?'😐 Same':'🙁 Worse')+'</button>').join('')+'</div>'+
    '<div class="sk-chips">'+C.REACTIONS.map(r=>'<button type="button" class="'+(C.CONCERNING.includes(r)?'warn ':'')+(react.includes(r)?'on':'')+'" data-sk-re="'+esc(r)+'">'+esc(r)+'</button>').join('')+'</div>'+
    (C.concerning(react)?'<div class="sk-alert">You logged a possible reaction. The tracker keeps the planned routine as-is, but this isn’t a diagnosis — consider pausing the affected active and checking with a doctor if it lasts.</div>':'')+
    '<textarea rows="2" data-sk-obs placeholder="One observation">'+esc(T.obs!=null&&T.obs!==''?T.obs:(rec.observation||''))+'</textarea><div class="sk-btns"><button type="button" class="sk-btn pri sm" data-sk-trksave>'+(rec.savedAt?'Update tracking':'Save tracking')+'</button><button type="button" class="sk-btn sm" data-sk-trkclose>Close</button></div></div>';
  return h;
}
function skCheckinHtml(st,td,C){
  const g=skinW.gym||{},pim=st.checkins.pimples,ph=st.checkins.photos,dp=C.dueIn(pim,14,td),dph=C.dueIn(ph,28,td),lastP=pim.length?pim[pim.length-1]:null;
  const fmt=d=>new Date(d+'T12:00:00').toLocaleDateString([],{month:'short',day:'numeric'});
  return '<div class="sk-sec"><span>Check-ins</span><span>weight and waist come from Gym</span></div><div class="sk-ci"><div><b>'+(g.weight?esc(String(g.weight.value)):'–')+'</b><small>weight kg'+(g.weight?' · '+esc(fmt(g.weight.date)):'')+'</small></div><div><b>'+(g.waist?esc(String(g.waist.value)):'–')+'</b><small>waist cm'+(g.waist?' · '+esc(fmt(g.waist.date)):'')+'</small></div><div><b>'+(lastP?esc(String(lastP.value)):'–')+'</b><small>pimples'+(lastP?' · '+esc(fmt(lastP.date)):'')+'</small></div><div><b>'+(ph.length?esc(fmt(ph[ph.length-1].date)):'–')+'</b><small>last photos</small></div></div>'+
    (skinW.ui.ci?'<div class="sk-trk" style="margin-top:8px"><div class="sk-trow" style="grid-template-columns:1fr 90px"><span>Active pimple count today</span><input type="number" inputmode="decimal" step="1" min="0" data-sk-pim></div><div class="sk-btns"><button type="button" class="sk-btn pri sm" data-sk-pimsave>Log today</button><button type="button" class="sk-btn sm" data-sk-ciclose>Close</button></div></div>':'<div class="sk-btns"><button type="button" class="sk-btn sm" data-sk-ciopen>＋ Log pimple count</button><button type="button" class="sk-btn sm" data-sk-photo>Photos taken today</button></div>')+
    '<div class="sk-sm1" style="margin-top:6px">Pimples: '+(dp.never?'not logged yet':dp.due?'due now':'next in '+dp.left+' d')+' · Photos: '+(dph.never?'not logged yet':dph.due?'due now':'next in '+dph.left+' d')+'</div>';
}
/* a change: read each document fresh, apply, then save only what changed. A failed read changes nothing. */
async function skinCommit(names,fn,msg,undoFn){
  if(skinW.busy)return null;skinW.busy=true;
  try{
    const rs=await Promise.all(names.map(n=>readSafe(skRef(n),null)));
    if(!rs.every(r=>r.ok)){toast('Could not reach Skin, nothing was changed');return null}
    const docs={};names.forEach((n,i)=>{const v=rs[i];docs[n]=(v.exists&&v.val&&typeof v.val==='object'&&!Array.isArray(v.val))?v.val:(n==='checkins'?{weight:[],waist:[],photos:[],pimples:[]}:{})});
    if(docs.productState)docs.productState=SkinCore.seedState(docs.productState,state.profile);
    const before={};names.forEach(n=>before[n]=JSON.stringify(docs[n]));
    const res=fn(docs);
    if(!res||!res.changed){return res}
    for(const n of names){if(JSON.stringify(docs[n])!==before[n])await skRef(n).set({json:JSON.stringify(docs[n])})}
    const st=skinW.st||{};
    skinW.st=Object.assign({},st,{stepLog:docs.stepLog||st.stepLog,productState:docs.productState||st.productState,usageLedger:docs.usageLedger||st.usageLedger,trackingLog:docs.trackingLog||st.trackingLog,checkins:docs.checkins||st.checkins,shoppingLog:docs.shoppingLog||st.shoppingLog});
    skinW.t=Date.now();
    try{if(schedX&&schedX.steps&&docs.stepLog){schedX.steps=docs.stepLog;schedX.t=Date.now();schedRedraw()}}catch(e){}
    try{insightsLoadedAt=0}catch(e){}
    skinRepaintAll();
    if(docs.stepLog){try{linkRun(false).catch(()=>{})}catch(e){}}
    if(msg)toast(msg,undoFn?'Undo':null,undoFn||null);
    return res;
  }catch(e){console.warn(e);toast('Could not save that');return null}
  finally{skinW.busy=false}
}
function skWire(el,wdg){
  const S=wsAll(wdg,WIDGET_TYPES.skin),C=SkinCore,prof=state.profile;
  const cur=()=>skinW.view||today();
  const secOf=key=>{const st=skinW.st;return C.sections(prof,cur(),st.start).find(s=>s.key===key)};
  const setSteps=async(secKey,idxs,on,msg)=>{
    const date=cur(),s=secOf(secKey);if(!s)return;const changedIdx=[];
    const apply=(d,list,val)=>{let any=false;list.forEach(i=>{const r=C.setStep({stepLog:d.stepLog,productState:d.productState,usageLedger:d.usageLedger},C.stepKey(date,secKey,i),s.steps[i],val);if(r.changed){any=true;if(val===on)changedIdx.push(i)}});return{changed:any}};
    const names=['stepLog','productState','usageLedger'];
    return skinCommit(names,d=>apply(d,idxs,on),msg,()=>skinCommit(names,d=>{let any=false;changedIdx.forEach(i=>{const r=C.setStep({stepLog:d.stepLog,productState:d.productState,usageLedger:d.usageLedger},C.stepKey(date,secKey,i),s.steps[i],!on);if(r.changed)any=true});return{changed:any}},null));
  };
  el.onclick=async e=>{
    const q=s=>e.target.closest(s);let x;
    if(x=q('[data-sk-nav]')){const d=Number(x.dataset.skNav);if(d>0&&!skinW.view)return;const nk=addDays(cur(),d);skinW.view=nk>=today()?null:nk;skinPaint(el,wdg);return}
    if(q('[data-sk-today]')){skinW.view=null;skinPaint(el,wdg);return}
    if(x=q('[data-sk-day]')){const d=x.dataset.skDay;skinW.view=d>=today()?null:d;skinPaint(el,wdg);return}
    if(x=q('[data-sk-toggle]')){const k=x.dataset.skToggle,cs=el.querySelector('[data-sk-toggle="'+k+'"]').parentElement;skinW.ui.open[k]=!cs.classList.contains('open');skinPaint(el,wdg);return}
    if(x=q('[data-sk-open]')){skinW.ui.open[x.dataset.skOpen]=true;skinPaint(el,wdg);const sc=el.querySelector('.sk-sect.open');return}
    if(x=q('[data-sk-step]')){const[k,i]=x.dataset.skStep.split(':'),idx=Number(i),s=secOf(k);if(!s)return;const was=!!skinW.st.stepLog[C.stepKey(cur(),k,idx)];await setSteps(k,[idx],!was,(was?'Unticked: ':'Ticked: ')+s.steps[idx].text.slice(0,40)+(s.steps[idx].product&&!was?' · stock updated':''));return}
    if(x=q('[data-sk-all]')){const k=x.dataset.skAll,s=secOf(k);if(!s)return;const st=skinW.st,idx=s.steps.map((_,i)=>i);const req=idx.filter(i=>!s.steps[i].optional),allDone=req.every(i=>st.stepLog[C.stepKey(cur(),k,i)]);
      await setSteps(k,allDone?idx:req,!allDone,(allDone?'Unticked all: ':'Ticked all: ')+s.label);return}
    if(x=q('[data-sk-timer]')){const[k,i,m]=x.dataset.skTimer.split(':'),key=C.stepKey(cur(),k,+i);clearInterval(skinW.tint);
      if(skinW.timer&&skinW.timer.key===key){skinW.timer=null;skinPaint(el,wdg);return}
      skinW.timer={key,end:Date.now()+Number(m)*60000};
      skinW.tint=setInterval(()=>{const b=document.querySelector('[data-sk-timer]');if(!skinW.timer){clearInterval(skinW.tint);return}
        if(Date.now()>=skinW.timer.end){clearInterval(skinW.tint);skinW.timer=null;toast('⏱ Wait time is up');try{if('Notification'in window&&Notification.permission==='granted')new Notification('Skin: wait time is up',{icon:'icon-192.png'})}catch(e){}skinRepaintAll();return}
        document.querySelectorAll('[data-sk-timer].run').forEach(bb=>{bb.textContent='⏱ '+skTimerText()+' left · tap to stop'})},1000);
      skinPaint(el,wdg);return}
    if(x=q('[data-sk-send]')){
      const id=x.dataset.skSend,p=C.products(prof).find(z=>z.id===id);if(!p)return;x.disabled=true;x.textContent='Sending…';
      const r=await C.sendToGrocery(groceryRef(),{name:p.name});
      if(r&&r.error){x.disabled=false;x.textContent='Send to Grocery';toast("Couldn't reach Grocery — open the Grocery app once first, then try again");return}
      await skinCommit(['shoppingLog'],d=>{d.shoppingLog[p.name]=today();return{changed:true}},r.added?'Added '+p.name+' to Grocery':p.name+' is already on your Grocery list',null);return}
    /* tracking */
    const T=skinW.ui.track;
    if(q('[data-sk-trkopen]')){const rec=(skinW.st.trackingLog[cur()]||{});T.open=true;T.vals={};T.touched={};T.overall=rec.overall||'';T.react=(rec.reactions||[]).slice();T.obs=rec.observation||'';skinPaint(el,wdg);return}
    if(q('[data-sk-trkclose]')){T.open=false;skinPaint(el,wdg);return}
    if(x=q('[data-sk-ov]')){T.overall=x.dataset.skOv;skinPaint(el,wdg);return}
    if(x=q('[data-sk-re]')){const r=x.dataset.skRe;if(r==='No reaction')T.react=['No reaction'];else{T.react=T.react.filter(v=>v!=='No reaction');const i=T.react.indexOf(r);i>=0?T.react.splice(i,1):T.react.push(r)}const o=el.querySelector('[data-sk-obs]');if(o)T.obs=o.value;skinPaint(el,wdg);return}
    if(q('[data-sk-trksave]')){
      const date=cur(),obs=(el.querySelector('[data-sk-obs]')||{}).value||'',vals={};
      el.querySelectorAll('[data-sk-fld]').forEach(i=>{if(i.dataset.t==='text'){if(i.value)vals[i.dataset.skFld]=i.value}else if(T.touched[i.dataset.skFld]||(skinW.st.trackingLog[date]&&skinW.st.trackingLog[date][i.dataset.skFld]!=null))vals[i.dataset.skFld]=i.value});
      const prev=skinW.st.trackingLog[date]?JSON.parse(JSON.stringify(skinW.st.trackingLog[date])):null;
      T.open=false;
      await skinCommit(['trackingLog'],d=>{C.trackSave(d.trackingLog,date,vals,T.overall,T.react,obs);return{changed:true}},'Saved tracking for '+skLabel(date).toLowerCase(),()=>skinCommit(['trackingLog'],d=>{if(prev)d.trackingLog[date]=prev;else delete d.trackingLog[date];return{changed:true}},null));return}
    /* Anusha check-ins */
    if(q('[data-sk-ciopen]')){skinW.ui.ci=true;skinPaint(el,wdg);return}
    if(q('[data-sk-ciclose]')){skinW.ui.ci=false;skinPaint(el,wdg);return}
    if(q('[data-sk-pimsave]')){const v=parseFloat((el.querySelector('[data-sk-pim]')||{}).value);if(isNaN(v)){toast('Enter the pimple count');return}skinW.ui.ci=false;
      await skinCommit(['checkins'],d=>{d.checkins.pimples=d.checkins.pimples||[];d.checkins.pimples.push({date:today(),value:v});return{changed:true}},'Logged '+v+' pimples',()=>skinCommit(['checkins'],d=>{const a=d.checkins.pimples||[];for(let i=a.length-1;i>=0;i--)if(a[i].date===today()&&a[i].value===v){a.splice(i,1);break}return{changed:true}},null));return}
    if(q('[data-sk-photo]')){
      await skinCommit(['checkins'],d=>{d.checkins.photos=d.checkins.photos||[];d.checkins.photos.push({date:today()});return{changed:true}},'Marked photos taken today',()=>skinCommit(['checkins'],d=>{const a=d.checkins.photos||[];for(let i=a.length-1;i>=0;i--)if(a[i].date===today()){a.splice(i,1);break}return{changed:true}},null));return}
  };
  el.oninput=e=>{const t=e.target,T=skinW.ui.track;
    if(t.dataset&&t.dataset.skFld!=null&&t.type==='range'){T.touched[t.dataset.skFld]=true;T.vals[t.dataset.skFld]=t.value;const b=el.querySelector('[data-sk-fv="'+t.dataset.skFld+'"]');if(b)b.textContent=t.value}
    else if(t.dataset&&t.dataset.skFld!=null){T.vals[t.dataset.skFld]=t.value}
    else if(t.dataset&&t.dataset.skObs!=null){T.obs=t.value}};
}

/* ---- Skin by voice (used by assets/voice.js): "I did my morning skincare" ---- */
async function skinVoice(word){
  const say=t=>{try{speak(t)}catch(e){toast(t)}};
  const st=await skinLoad(true);if(!st){say("I couldn't open your skin routine.");return true}
  const C=SkinCore,prof=state.profile,date=today(),secs=C.sections(prof,date,st.start);
  if(!secs){say('There is no skin routine planned for today.');return true}
  const w=String(word||'').toLowerCase();
  const pick=/morning|am\b/.test(w)?secs.filter(s=>s.key==='am'):/night|evening|pm\b|face/.test(w)?secs.filter(s=>s.key!=='am'&&s.key!=='body'):/body|shower/.test(w)?secs.filter(s=>s.key==='body'):/nizoral|scalp|hair/.test(w)?secs.filter(s=>s.key==='nizoral'):secs;
  if(!pick.length){say("There's no "+w+" routine today.");return true}
  const names=['stepLog','productState','usageLedger'],done=[];
  const r=await skinCommit(names,d=>{let any=false;pick.forEach(s=>s.steps.forEach((x,i)=>{if(x.optional)return;const r=C.setStep({stepLog:d.stepLog,productState:d.productState,usageLedger:d.usageLedger},C.stepKey(date,s.key,i),x,true);if(r.changed){any=true;done.push([s.key,i,x])}}));return{changed:any}},null);
  if(!r){say("I couldn't save that.");return true}
  if(!r.changed){say('That routine is already done.');return true}
  try{voiceUndoPush('ticking the skin routine',()=>skinCommit(names,d=>{let any=false;done.forEach(([k,i,x])=>{const rr=C.setStep({stepLog:d.stepLog,productState:d.productState,usageLedger:d.usageLedger},C.stepKey(date,k,i),x,false);if(rr.changed)any=true});return{changed:any}},null))}catch(e){}
  say('Ticked '+done.length+' skin step'+(done.length===1?'':'s')+'.');return true;
}

const WIDGET_NO_CACHE={notes:1,photos:1,schedule:1,water:1,diet:1,skin:1};
/* ---- Free-hand block layout: every widget's content is made of named blocks ([data-blk="id"]). Arrange mode lets you drag a block anywhere, pull its corner to resize,
   hide it, or press Auto-arrange. Text inside a block scales with the block. A widget you never touched keeps its own native layout. ---- */
const BKW=(id,h)=>h?'<div data-blk="'+id+'">'+h+'</div>':'';
WIDGET_TYPES.water.blocks=[{id:'alerts',label:'Reminder'},{id:'fig',label:'Body figure',w:3},{id:'amt',label:'Amount drunk',w:9},{id:'btns',label:'Quick-add buttons',w:9},{id:'pace',label:'Pace bar'},{id:'undo',label:'Undo last drink'},{id:'plan',label:'Plan for the day'},{id:'week',label:'Last 30 days & streak'},{id:'pattern',label:'When you drink'}];
WIDGET_TYPES.diet.blocks=[{id:'head',label:'Day switcher'},{id:'ring',label:'Calories ring'},{id:'macros',label:'Protein, carbs & fat'},{id:'micro',label:'Micronutrients'},{id:'next',label:'Next meal'},{id:'rescue',label:'Protein rescue'},{id:'meals',label:'Meals list'},{id:'add',label:'Add something else'},{id:'week',label:'Last 7 days'},{id:'flex',label:'Flex bank'},{id:'streak',label:'Streak'},{id:'energy',label:'Eaten vs burned'},{id:'weight',label:'Weight'}];
WIDGET_TYPES.skin.blocks=[{id:'head',label:'Day switcher'},{id:'top',label:'Progress & today'},{id:'sec-am',label:'Morning routine'},{id:'sec-body',label:'Shower & body'},{id:'sec-face',label:'Face routine'},{id:'sec-nizoral',label:'Nizoral shampoo'},{id:'sec-pm',label:'Night routine'},{id:'coming',label:'Coming up'},{id:'heat',label:'Heat map'},{id:'cab',label:'Product cabinet'},{id:'trk',label:'Check-ins'},{id:'rev',label:'Review'}];
WIDGET_TYPES.schedule.blocks=[{id:'progress',label:'Progress bar'},{id:'timeline',label:'Timeline'},{id:'anytime',label:'Anytime today'},{id:'next',label:'Up next'}];
const FH={COLS:12,RU:8,CG:8};   // RU (row height) follows the widget's width so block heights scale with itlet fhEditId=null;
const fhOn=w=>!!(w&&w.fh&&Array.isArray(w.fh.items));
const fhHit=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
// a block stays exactly where it was put; only one that would overlap another is pushed down
function fhSettle(items,active){
  const placed=[],act=active&&items.find(i=>i.id===active);if(act)placed.push(act);
  items.filter(i=>i!==act).sort((a,b)=>a.y-b.y||a.x-b.x).forEach(i=>{i.y=Math.max(0,i.y);let n=0;while(placed.some(p=>fhHit(i,p))&&n++<4000)i.y++;placed.push(i)});
}
// Auto-arrange: every block keeps its size; gaps are filled in reading order
function fhPack(items){
  const placed=[];
  items.sort((a,b)=>a.y-b.y||a.x-b.x).forEach(i=>{
    let done=false;
    for(let y=0;!done&&y<4000;y++)for(let x=0;x<=FH.COLS-i.w;x++){const t={...i,x,y};if(!placed.some(p=>fhHit(t,p))){i.x=x;i.y=y;done=true;break}}
    placed.push(i);
  });
}
// text scales with the block so it just fills it (about 80% of the width), never out of bounds
const FH_MINZ=.9,FH_MINPX=10.5;   // text never gets smaller than 90% of its normal size and never under ~10.5px on screen: it wraps (and the block grows) instead
function fhLo(inn){
  let mn=99;inn.querySelectorAll('*').forEach(e=>{if(e.closest('svg'))return;for(const n of e.childNodes){if(n.nodeType===3&&n.textContent.trim()){const f=parseFloat(getComputedStyle(e).fontSize);if(f&&f<mn)mn=f;break}}});
  return mn>=99?FH_MINZ:Math.min(1.4,Math.max(FH_MINZ,FH_MINPX/mn));
}
const FH_FS=[.7,.8,.9,1,1.15,1.3,1.5,1.75,2];
// text stays readable and grows only a little with the block's width; "A− / A+" on a block changes its whole font size
function fhZoom(inn,W,f,cap){
  const base=1+Math.min(1,Math.max(0,(W-320)/520))*.3;f=f||1;
  inn.style.transform='none';
  return f===1?Math.max(fhLo(inn),base):Math.max(.7,base*f);
}
// narrowest a block may be so its unbreakable parts still fit at the smallest text size
function fhMinCols(cell,g){
  const inn=cell.querySelector('.fh-in'),ct=inn.style.containerType;inn.style.containerType='normal';inn.style.transform='none';inn.style.width='min-content';
  const mc=inn.offsetWidth*fhLo(inn);inn.style.containerType=ct;
  return Math.max(2,Math.min(6,Math.ceil((mc+FH.CG+2)/g.cw)));
}
function fhSizeCell(cell,i,g){
  const inn=cell.querySelector('.fh-in'),W=i.w*g.cw-FH.CG;inn.style.height='';const m=fhZoom(inn,W,i.f);cell._m=m;
  inn.style.width=(W/m)+'px';inn.style.transform='scale('+m+')';
  return inn.offsetHeight*m;
}
const fhRows=px=>Math.max(2,Math.ceil((px+FH.CG)/FH.RU));
function fhPlace(cell,i,g){cell.style.left=(i.x*g.cw)+'px';cell.style.top=(i.y*FH.RU)+'px';cell.style.width=(i.w*g.cw-FH.CG)+'px';cell.style.height=(i.h*FH.RU-FH.CG)+'px'}
function fhView(wrap,items){
  if(!wrap.__narrow)return items.map(i=>({...i}));
  const a=items.map(i=>({...i,x:0,w:FH.COLS}));let y=0;a.sort((p,q)=>p.y-q.y||p.x-q.x).forEach(i=>{i.y=y;y+=i.h});return a;
}
function fhPaint(wrap,list,skip){
  const g=wrap.__g;FH.RU=g.ru;const on=new Set(list.map(i=>i.id));
  Object.keys(wrap.__cells).forEach(id=>{wrap.__cells[id].hidden=!on.has(id)});
  list.forEach(i=>{if(i.id!==skip)fhPlace(wrap.__cells[i.id],i,g)});
  wrap.__grid.style.height=(Math.max(0,...list.map(i=>i.y+i.h))*FH.RU)+'px';
}
function fhRelayout(wrap){
  if(!wrap||!wrap.isConnected)return;
  const body=wrap.parentNode,def=wrap.__def,w=wrap.__w,F=w.fh;
  const bw=wrap.__grid.clientWidth;if(!bw)return;
  wrap.__narrow=body.clientWidth<380;
  FH.RU=Math.max(6,bw/72);const g=wrap.__g={cw:(bw+FH.CG)/FH.COLS,w:bw,ru:FH.RU,cap:Math.min(1.7,Math.max(1.15,bw/560))};
  wrap.classList.toggle('fh-narrow',wrap.__narrow);
  const items=F.items.filter(i=>wrap.__cells[i.id]);
  const view=wrap.__narrow?items.map(i=>({...i,x:0,w:FH.COLS})):items;
  view.forEach(i=>{
    const cell=wrap.__cells[i.id];cell.style.transition='none';
    if(!wrap.__narrow)i.w=Math.max(i.w,Math.min(FH.COLS-i.x,fhMinCols(cell,g)));
    const hv=fhSizeCell(cell,i,g),nat=fhRows(hv);
    i.h=i.auto?nat:Math.max(i.h||0,nat);
    cell.style.width=(i.w*g.cw-FH.CG)+'px';cell.style.height=(i.h*FH.RU-FH.CG)+'px';
    cell.querySelector('.fh-in').style.height=i.auto?'':(((i.h*FH.RU-FH.CG)/cell._m)+'px');void cell.offsetHeight;cell.style.transition='';
  });
  if(wrap.__narrow){items.forEach(o=>{const v=view.find(x=>x.id===o.id);if(v&&o.auto)o.h=v.h})}
  if(F.needPack&&!wrap.__narrow){fhPack(items);F.needPack=false;saveWidgetLayout()}else if(!wrap.__narrow)fhSettle(items,null);
  fhPaint(wrap,fhView(wrap,items));
  const hid=(F.hide||[]),tray=wrap.querySelector('.fh-tray');
  if(tray)tray.innerHTML=hid.length?'<span>Hidden — tap to bring back:</span>'+hid.map(id=>{const b=def.blocks.find(x=>x.id===id);return b?'<button type="button" data-fh-add="'+id+'">+ '+esc(b.label)+'</button>':''}).join(''):'';
  const u=wrap.querySelector('[data-fh-undo]');if(u)u.disabled=!HubHist.undo.length;
}
function fhApply(body,def,w){
  if(!fhOn(w)||!body||!body.isConnected||body.querySelector(':scope>.fh-wrap'))return;
  const els={};def.blocks.forEach(b=>{els[b.id]=[...body.querySelectorAll('[data-blk="'+b.id+'"]')]});
  if(!def.blocks.some(b=>els[b.id].length))return;      // loading / empty state: nothing to arrange yet
  const F=w.fh;F.hide=F.hide||[];const editing=fhEditId===w.id;
  const wrap=document.createElement('div');wrap.className='fh-wrap'+(editing?' fh-edit':'');wrap.__def=def;wrap.__w=w;wrap.__cells={};
  wrap.innerHTML=(editing?'<div class="fh-bar"><button type="button" class="fh-pri" data-fh-auto>Auto-arrange</button><button type="button" data-fh-undo>Undo</button><button type="button" data-fh-reset>Reset</button><button type="button" class="fh-done" data-fh-done>Done</button></div><div class="fh-hint">Drag a block anywhere · pull its corner to resize · double-click the corner to fit the content · ✕ hides it</div>':'')+'<div class="fh-grid"><div class="fh-ghost" hidden></div></div><div class="fh-tray"></div>';
  const grid=wrap.__grid=wrap.querySelector('.fh-grid');
  def.blocks.forEach(b=>{
    if(!els[b.id].length||F.hide.includes(b.id))return;
    if(!F.items.some(i=>i.id===b.id)){if(!F.items.length)F.needPack=true;F.items.push({id:b.id,x:0,w:b.w||FH.COLS,y:Math.max(0,...F.items.map(i=>i.y+(i.h||2))),h:0,auto:true})}
    const cell=document.createElement('div');cell.className='fh-blk';cell.dataset.id=b.id;
    cell.innerHTML='<div class="fh-clip"><div class="fh-in"></div></div><span class="fh-fs"><button type="button" data-fs="-1" title="Smaller text in this block">A\u2212</button><button type="button" data-fs="1" title="Bigger text in this block">A+</button></span><span class="fh-name">'+esc(b.label)+'</span><button type="button" class="fh-x" aria-label="Hide '+esc(b.label)+'">✕</button><span class="fh-rz" title="Drag to resize · double-click to fit the content"></span>';
    els[b.id].forEach(e=>cell.querySelector('.fh-in').appendChild(e));grid.appendChild(cell);wrap.__cells[b.id]=cell;
  });
  const rest=[...body.querySelectorAll('.widget-card-link')];
  body.replaceChildren(wrap,...rest);
  fhWire(wrap);fhRelayout(wrap);
  if(!body.__fhRO&&window.ResizeObserver){let last=0;body.__fhRO=new ResizeObserver(()=>{const cw=body.clientWidth;if(cw===last)return;last=cw;const wr=body.querySelector(':scope>.fh-wrap');if(wr)fhRelayout(wr)});body.__fhRO.observe(body)}
}
function fhWire(wrap){
  const grid=wrap.__grid,ghost=grid.querySelector('.fh-ghost'),w=wrap.__w,F=w.fh;let drag=null;
  const save=()=>{saveWidgetLayout();fhRelayout(wrap)};
  wrap.addEventListener('click',e=>{
    const fs=e.target.closest('[data-fs]');
    if(fs){const id=fs.closest('.fh-blk').dataset.id,it=F.items.find(i=>i.id===id);if(it){const cur=it.f||1;let k=FH_FS.reduce((bi,v,j)=>Math.abs(v-cur)<Math.abs(FH_FS[bi]-cur)?j:bi,0);k=Math.max(0,Math.min(FH_FS.length-1,k+(+fs.dataset.fs)));if(FH_FS[k]===1)delete it.f;else it.f=FH_FS[k];save()}return}
    const t=e.target.closest('[data-fh-auto],[data-fh-undo],[data-fh-reset],[data-fh-done],[data-fh-add]');if(!t)return;
    if(t.hasAttribute('data-fh-done')){fhEditId=null;wrap.classList.remove('fh-edit');redrawFh(wrap);return}
    if(t.hasAttribute('data-fh-undo')){HubHist.run('undo');return}
    if(t.hasAttribute('data-fh-auto')){F.items.forEach(i=>{if(!i.auto){}});fhPack(F.items);save();return}
    if(t.hasAttribute('data-fh-reset')){F.items=[];F.hide=[];F.needPack=true;saveWidgetLayout();redrawFh(wrap);return}
    if(t.dataset.fhAdd){F.hide=F.hide.filter(x=>x!==t.dataset.fhAdd);F.items=F.items.filter(i=>i.id!==t.dataset.fhAdd);redrawFh(wrap)}
  });
  grid.addEventListener('pointerdown',e=>{
    if(fhEditId!==w.id||wrap.__narrow)return;const cell=e.target.closest('.fh-blk');if(!cell)return;
    const it=F.items.find(i=>i.id===cell.dataset.id);if(!it)return;
    if(e.target.closest('.fh-fs'))return;
    if(e.target.closest('.fh-x')){F.items=F.items.filter(i=>i!==it);F.hide=(F.hide||[]).concat(it.id);saveWidgetLayout();redrawFh(wrap);return}
    FH.RU=wrap.__g.ru;const r=cell.getBoundingClientRect(),gr=grid.getBoundingClientRect();
    drag={mode:e.target.classList.contains('fh-rz')?'rz':'mv',it,cell,startH:r.height,ox:e.clientX-r.left,oy:e.clientY-r.top,left:r.left-gr.left,top:r.top-gr.top,trial:null};
    cell.classList.add('drag');try{cell.setPointerCapture(e.pointerId)}catch(x){}ghost.hidden=false;e.preventDefault();
  });
  grid.addEventListener('pointermove',e=>{
    if(!drag)return;const g=wrap.__g;FH.RU=g.ru;const gr=grid.getBoundingClientRect(),{it,cell}=drag;let t={...it};
    if(drag.mode==='mv'){
      const px=e.clientX-gr.left-drag.ox,py=e.clientY-gr.top-drag.oy;cell.style.left=px+'px';cell.style.top=py+'px';
      t.x=Math.max(0,Math.min(FH.COLS-it.w,Math.round(px/g.cw)));t.y=Math.max(0,Math.round(py/FH.RU));
    }else{
      const wpx=Math.max(g.cw*2-FH.CG,e.clientX-gr.left-drag.left),hpx=Math.max(3*FH.RU-FH.CG,e.clientY-gr.top-drag.top);
      t.w=Math.max(fhMinCols(cell,g),Math.min(FH.COLS-it.x,Math.round((wpx+FH.CG)/g.cw)));
      const nat=fhRows(fhSizeCell(cell,t,g));
      if(Math.abs(hpx-drag.startH)<14){t.h=it.auto?nat:Math.max(it.h,nat);t.auto=it.auto}else{t.h=Math.max(nat,Math.round((hpx+FH.CG)/FH.RU));t.auto=false}
      cell.style.width=Math.max(wpx,t.w*g.cw-FH.CG)+'px';cell.style.height=Math.max(t.h*FH.RU-FH.CG,hpx)+'px';cell.querySelector('.fh-in').style.height=t.auto?'':((Math.max(t.h*FH.RU-FH.CG,hpx)/cell._m)+'px');
    }
    const trial=F.items.map(i=>i.id===it.id?t:{...i});fhSettle(trial,it.id);drag.trial=trial;
    const me=trial.find(i=>i.id===it.id);fhPlace(ghost,me,g);
    trial.forEach(i=>{if(i.id!==it.id&&wrap.__cells[i.id])fhPlace(wrap.__cells[i.id],i,g)});
    grid.style.height=(Math.max(0,...trial.map(i=>i.y+i.h))*FH.RU)+'px';
  });
  const drop=()=>{
    if(!drag)return;const d=drag;drag=null;d.cell.classList.remove('drag');ghost.hidden=true;
    if(d.trial){F.items=d.trial;F.items.forEach(i=>{if(i.auto===undefined)i.auto=true});saveWidgetLayout()}
    fhRelayout(wrap);
  };
  grid.addEventListener('pointerup',drop);grid.addEventListener('pointercancel',drop);
  grid.addEventListener('dblclick',e=>{if(fhEditId!==w.id||!e.target.classList.contains('fh-rz'))return;const it=F.items.find(i=>i.id===e.target.closest('.fh-blk').dataset.id);if(it){it.auto=true;save()}});
}
// re-run the widget's own render so the blocks are rebuilt, then fhApply lays them out again
function redrawFh(wrap,pack){
  const body=wrap.parentNode,w=wrap.__w,def=wrap.__def;if(!body)return;
  if(pack)w.fh.needPack=true;saveWidgetLayout();
  body.innerHTML='';try{Promise.resolve(def.render(body,w)).catch(()=>{})}catch(e){console.warn(e)}
}
function blkWatch(body,def,wid){
  if(!def||!def.blocks||body.__blkMO||!window.MutationObserver)return;
  body.__blkMO=new MutationObserver(()=>{
    if(!body.isConnected||body.querySelector(':scope>.fh-wrap'))return;
    const w=(state.widgets||[]).find(x=>x.id===wid);if(w)fhApply(body,def,w);
  });
  body.__blkMO.observe(body,{childList:true});
}
function blkSettingsHtml(def,w){
  if(!def.blocks)return'';
  return '<h4>Arrange</h4><p class="ws-bnote">Drag the parts of this widget anywhere, resize them from the corner, hide the ones you don’t need. The text inside each part scales with it.</p><button type="button" class="ws-fit" data-ws-arrange>Arrange blocks on the card</button>'+(fhOn(w)?'<button type="button" class="ws-breset" data-ws-breset>Back to the default layout</button>':'');
}
function blkWireSettings(panel,card,def,w){
  const body=card.querySelector('.widget-card-body');if(!body)return;
  const redraw=()=>{body.innerHTML='';try{Promise.resolve(def.render(body,w)).catch(()=>{})}catch(e){console.warn(e)}};
  const go=panel.querySelector('[data-ws-arrange]');if(!go)return;
  go.addEventListener('click',()=>{
    const c=panel.querySelector('[data-ws-close]');if(c)c.click();
    if(!fhOn(w)){w.fh={items:[],hide:[],needPack:true}}
    fhEditId=w.id;saveWidgetLayout();redraw();
  });
  const rs=panel.querySelector('[data-ws-breset]');
  if(rs)rs.addEventListener('click',()=>{delete w.fh;if(fhEditId===w.id)fhEditId=null;saveWidgetLayout();const c=panel.querySelector('[data-ws-close]');if(c)c.click();redraw()});
}

function wLoading(el){ if(!el.firstChild) el.innerHTML='<div class="empty-state"><strong>Loading…</strong></div>'; }

/* ---- per-widget settings: the gear turns the card over to its settings ---- */
function widgetSettingsHtml(def,w){
  const cur=wsAll(w,def);
  return '<div class="widget-settings" aria-hidden="true"><div class="ws-head"><strong>'+esc(def.title)+' settings</strong><button type="button" class="widget-card-gear" data-ws-close aria-label="Back">✕</button></div>'+
    '<div class="ws-opt ws-presets"><button type="button" class="ws-fit" data-ws-fit>Fit height to content</button></div>'+
    blkSettingsHtml(def,w)+
    def.settings.map(o=>{
      if(o.h)return '<h4>'+esc(o.h)+'</h4>';
      const val=o.get?o.get(w):cur[o.key];
      if(o.type==='seg')return '<div class="ws-opt"><span>'+esc(o.label)+'</span><div class="ws-seg" data-ws-seg="'+o.key+'">'+o.opts.map(([v,l])=>'<button type="button" data-v="'+v+'" class="'+(val===v?'on':'')+'">'+esc(l)+'</button>').join('')+'</div></div>';
      if(o.type==='num'||o.type==='time'||o.type==='text')return '<label class="ws-opt"><span>'+esc(o.label)+(o.hint?'<small>'+esc(o.hint)+'</small>':'')+'</span><input class="ws-in" data-ws-in="'+o.key+'" type="'+(o.type==='num'?'number':o.type)+'"'+(o.type==='num'?' inputmode="decimal" step="any"':'')+(o.min!=null?' min="'+o.min+'"':'')+' value="'+esc(String(val==null?'':val))+'"></label>';
      return '<label class="ws-opt"><span>'+esc(o.label)+(o.hint?'<small>'+esc(o.hint)+'</small>':'')+'</span><input type="checkbox" class="ws-sw" data-ws-key="'+o.key+'"'+(val?' checked':'')+'></label>';
    }).join('')+
    '<button type="button" class="ws-done" data-ws-close>Done</button><button type="button" class="ws-reset" data-ws-reset>Reset to defaults</button></div>';
}
// Make the card exactly tall enough for what is in it.
function widgetFitHeight(card,w,def,setSize){
  const body=card.querySelector('.widget-card-body');if(!body||!w)return;
  def=def||WIDGET_TYPES[w.type];
  const [c,r]=widgetSpanFor(w,def),h0=card.offsetHeight,per=(h0+WIDGET_GAP_PX)/r;
  const chrome=h0-body.clientHeight,sv=body.style.cssText;
  body.style.cssText+=';display:block;height:auto;flex:none;overflow:visible;max-height:none';
  const content=body.scrollHeight;body.style.cssText=sv;
  const rows=Math.ceil((chrome+content+WIDGET_GAP_PX+6)/per);
  const R=Math.max(WIDGET_MIN_ROW,Math.min(WIDGET_MAX_ROW,rows));
  if(setSize)setSize(c,R);else{w.colSpan=c;w.rowSpan=R;delete w.size;card.style.setProperty('--cs',c);card.style.setProperty('--rs',R);saveWidgetLayout()}
}
function wireWidgetSettings(card,def,w){
  if(!w)return;
  const panel=card.querySelector('.widget-settings'),body=card.querySelector('.widget-card-body');if(!panel)return;
  const flip=on=>{card.classList.toggle('flipped',on);panel.setAttribute('aria-hidden',on?'false':'true')};
  const optOf=k=>(def.settings||[]).find(o=>o.key===k);
  // some settings live with the app's own data (not the widget layout): they carry get()/set(), and the panel re-reads them after a change
  const refresh=()=>{
    panel.querySelectorAll('[data-ws-in]').forEach(i=>{const o=optOf(i.dataset.wsIn);if(o&&o.get&&document.activeElement!==i)i.value=o.get(w)});
    panel.querySelectorAll('[data-ws-key]').forEach(i=>{const o=optOf(i.dataset.wsKey);if(o&&o.get)i.checked=!!o.get(w)});
    panel.querySelectorAll('[data-ws-seg]').forEach(g=>{const o=optOf(g.dataset.wsSeg);if(o&&o.get){const v=o.get(w);g.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.v===v))}});
  };
  const apply=(key,val)=>{
    const o=optOf(key);
    if(o&&o.set){Promise.resolve(o.set(val,w)).then(()=>{refresh();try{def.render(body,w)}catch(e){console.warn(e)}}).catch(e=>console.warn(e));return}
    w.settings=w.settings||{};w.settings[key]=val;saveWidgetLayout();try{def.render(body,w)}catch(e){console.warn(e)}};
  card.querySelector('[data-widget-gear]').addEventListener('click',e=>{e.stopPropagation();Promise.resolve(def.ready?def.ready():null).then(()=>{refresh();flip(true)})});
  panel.querySelectorAll('[data-ws-in]').forEach(i=>i.addEventListener('change',()=>apply(i.dataset.wsIn,i.value)));
  panel.querySelectorAll('[data-ws-close]').forEach(b=>b.addEventListener('click',()=>flip(false)));
  const setSize=(c,r)=>{
    const board=$('widget-board'),maxC=board?getComputedStyle(board).gridTemplateColumns.split(' ').filter(Boolean).length||12:12;
    c=Math.max(WIDGET_MIN_COL,Math.min(maxC,c));r=Math.max(WIDGET_MIN_ROW,Math.min(WIDGET_MAX_ROW,r));
    w.colSpan=c;w.rowSpan=r;delete w.size;card.style.setProperty('--cs',c);card.style.setProperty('--rs',r);saveWidgetLayout();
    panel.querySelectorAll('[data-ws-size]').forEach(g=>{g.querySelector('output').textContent=g.dataset.wsSize==='c'?c:r});
  };
  panel.querySelectorAll('[data-ws-size] button').forEach(b=>b.addEventListener('click',()=>{
    const [c,r]=widgetSpanFor(w,def),d=+b.dataset.d,k=b.parentNode.dataset.wsSize;
    setSize(k==='c'?c+d:c,k==='r'?r+d:r);
  }));
  panel.querySelectorAll('[data-ws-fit]').forEach(b=>b.addEventListener('click',()=>widgetFitHeight(card,w,def,setSize)));
  blkWireSettings(panel,card,def,w);
  panel.querySelectorAll('[data-ws-key]').forEach(i=>i.addEventListener('change',()=>apply(i.dataset.wsKey,i.checked)));
  panel.querySelectorAll('[data-ws-seg]').forEach(g=>g.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{g.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));apply(g.dataset.wsSeg,b.dataset.v)})));
  panel.querySelector('[data-ws-reset]').addEventListener('click',()=>{
    w.settings={};saveWidgetLayout();if(def.resetData)def.resetData(w);const cur=wsAll(w,def);
    panel.querySelectorAll('[data-ws-key]').forEach(i=>{const o=optOf(i.dataset.wsKey);i.checked=o&&o.get?!!o.get(w):!!cur[i.dataset.wsKey]});
    panel.querySelectorAll('[data-ws-seg]').forEach(g=>{const o=optOf(g.dataset.wsSeg);g.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.v===(o&&o.get?o.get(w):cur[g.dataset.wsSeg])))});
    refresh();
    try{def.render(body,w)}catch(e){}
  });
}
function renderWidgetBoard(){
  const board=$('widget-board');if(!board||!state.widgets)return;
  if(wlSnap==null)wlSnap=JSON.stringify(state.widgets);
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
          +(def.settings?'<button type="button" class="widget-card-gear widget-gear-bare" data-widget-gear title="Widget settings" aria-label="Widget settings"><i data-lucide="settings"></i></button>':'')
        :'<div class="widget-card-head"><div class="widget-card-title"><span class="widget-drag-handle" data-widget-drag title="Drag to move"><i data-lucide="grip-vertical"></i></span><strong>'+esc(def.title)+'</strong></div>'
          +(def.headerAction?'<button type="button" class="widget-card-quick-add" data-widget-quick-add title="Add task" aria-label="Add task"><i data-lucide="plus"></i></button>':'')
          +(def.settings?'<button type="button" class="widget-card-gear" data-widget-gear title="Widget settings" aria-label="Widget settings"><i data-lucide="settings"></i></button>':'')
          +'</div>')+
      '<div class="widget-card-body"></div>'+
      (def.settings?widgetSettingsHtml(def,w):'')+
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
      if(def.blocks&&w)blkWatch(body,def,w.id);
      let r; try{ r=def.render(body,w); }catch(e){ console.warn(e); }
      if(!WIDGET_NO_CACHE[type]) Promise.resolve(r).then(()=>{ if(body.isConnected&&body.innerHTML&&!/Loading…|Unavailable/.test(body.innerHTML)) widgetHtmlCache.set(ck,body.innerHTML); }).catch(()=>{});
    }
    wireWidgetCard(card);
    if(def&&def.settings)wireWidgetSettings(card,def,w);
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
  widgetResizeCancel=()=>{document.removeEventListener('pointermove',onMove);document.removeEventListener('pointerup',onUp);document.removeEventListener('pointercancel',onUp);card.classList.remove('resizing');card.style.setProperty('--cs',startCol);card.style.setProperty('--rs',startRow);widgetResizeCancel=null;setTimeout(()=>{widgetGestureActive=false},250);return true};
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
    card.classList.remove('resizing');widgetResizeCancel=null;
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
      delete photoWidgetRuntime[removedId]; delete state.photosByWidget[removedId]; photoSave(removedId,{drop:true});
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
    m.get=d=>{const blocks=dayBlocksFor(d),total=blocks.length;if(!total)return null;let done=0;for(let i=0;i<total;i++)if(ins.tplLog[d+':'+i])done++;return{done,total}};
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
      const gd=d=>Number(w.goals&&w.goals[d])>0?Number(w.goals[d]):w.goal;
      m.get=d=>{const f=Math.min(1,tot(d)/gd(d));return{done:f>=1?1:0,total:1,frac:f}};m.frac=true;
      m.detail=d=>(tot(d)/1000).toFixed(1)+' of '+(gd(d)/1000).toFixed(1)+' L'}
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
function renderGlassSettings(){const box=$('settings-glass');if(!box)return;const on=(state.theme&&state.theme.mode)==='glass';box.hidden=!on;if(!on)return;const g=glassCfg();[['c1'],['c2'],['base'],['gold']].forEach(([k])=>{const e=$('gl-'+k);if(e&&document.activeElement!==e)e.value=g[k]});[['op'],['blur']].forEach(([k])=>{const e=$('gl-'+k);if(e&&document.activeElement!==e)e.value=g[k];const o=$('gl-'+k+'-v');if(o)o.textContent=g[k]})}
let glSaveT=null;
function glassSet(k,v){state.theme.glass=Object.assign({},glassCfg(),{[k]:(k==='op'||k==='blur')?Number(v):v});applyTheme();renderGlassSettings();clearTimeout(glSaveT);glSaveT=setTimeout(saveProfileAppearance,500)}
function glassReset(){state.theme.glass=null;applyTheme();renderGlassSettings();saveProfileAppearance()}
function renderSettingsPage(){
  const t=state.theme||DEFAULT_THEME;
  renderGlassSettings();
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
  renderInstallCard();
  renderLinksCard();
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
  page.addEventListener('input',e=>{ if(e.target.dataset.profileColor)applyProfileColorLive(e.target.dataset.profileColor,e.target.value); if(e.target.dataset.gl)glassSet(e.target.dataset.gl,e.target.value); });
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
    if(e.target.closest('#gl-reset')){glassReset();return}
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
    setProfile(next);linksStart();
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
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  const t=e.target;if(t&&t.matches&&t.matches('input,textarea,[contenteditable="true"],select'))return;
  if(typeof widgetResizeCancel==='function'&&widgetResizeCancel()){e.preventDefault();return}
  const fl=document.querySelector('.widget-card.flipped');if(fl){fl.classList.remove('flipped');const pn=fl.querySelector('.widget-settings');if(pn)pn.setAttribute('aria-hidden','true');return}
  if(widgetEditMode){widgetSetEditMode(false);e.preventDefault()}
});
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

/* ---- Undo / redo for the whole page: Ctrl+Z undoes, Ctrl+U (or Ctrl+Shift+Z / Ctrl+Y) redoes. Layout and widget-setting changes are tracked automatically;
   anything that offers an “Undo” in its toast is added to the same history, so the toast button and Ctrl+Z are the same thing. ---- */
let wlSnap=null;
const HubHist={undo:[],redo:[],busy:false,
  sync(){const u=$('hist-undo'),r=$('hist-redo');if(u){u.disabled=!this.undo.length;u.title=this.undo.length?'Undo “'+this.undo[this.undo.length-1].label+'” (Ctrl+Z)':'Nothing to undo'}if(r){r.disabled=!this.redo.length;r.title=this.redo.length?'Redo “'+this.redo[this.redo.length-1].label+'” (Ctrl+U)':'Nothing to redo'}},
  push(e){if(this.busy)return e;this.undo.push(e);if(this.undo.length>60)this.undo.shift();this.redo=[];this.sync();return e},
  drop(e){const i=this.undo.indexOf(e);if(i>=0){this.undo.splice(i,1);this.sync()}},
  async run(dir){
    const from=dir==='undo'?this.undo:this.redo,to=dir==='undo'?this.redo:this.undo,e=from[from.length-1];
    if(!e){toast('Nothing to '+dir);return}
    const fn=dir==='undo'?e.undo:e.redo;
    if(!fn){from.pop();this.sync();toast('That can’t be redone — “'+e.label+'”');return}
    from.pop();this.busy=true;
    try{await fn();to.push(e);toast((dir==='undo'?'Undid ':'Redid ')+e.label)}catch(x){console.warn(x);toast('Couldn’t '+dir+' “'+e.label+'”')}
    finally{this.busy=false;this.sync()}
  }};
function widgetsRestore(json){
  try{state.widgets=JSON.parse(json)}catch(e){return}
  wlSnap=json;renderWidgetBoard();saveWidgetLayout();
}
function widgetsTrack(){
  if(!state.widgets)return;
  const cur=JSON.stringify(state.widgets);
  if(wlSnap==null||cur===wlSnap){if(wlSnap==null)wlSnap=cur;return}
  const prev=wlSnap;wlSnap=cur;
  if(HubHist.busy)return;
  const last=HubHist.undo[HubHist.undo.length-1],now=Date.now();
  if(last&&last.kind==='layout'&&now-last.t<900){last.t=now;last.cur=cur;return} // a drag / a few steps in a row = one undo
  const e={kind:'layout',label:'layout change',t:now,prev,cur,undo:()=>widgetsRestore(e.prev),redo:()=>widgetsRestore(e.cur)};
  HubHist.push(e);
}
document.addEventListener('keydown',e=>{
  if(!(e.ctrlKey||e.metaKey)||e.altKey)return;
  const k=(e.key||'').toLowerCase(),t=e.target;
  const typing=t&&(t.isContentEditable||/^(input|textarea|select)$/i.test(t.tagName));
  const redo=k==='y'||(k==='z'&&e.shiftKey)||(k==='u'&&!typing);
  const undo=k==='z'&&!e.shiftKey;
  if(!undo&&!redo)return;
  if(typing)return; // inside a text box the browser's own undo handles the text
  if(document.querySelector('.modal-backdrop:not([hidden]),.pw-lb'))return;
  e.preventDefault();HubHist.run(redo?'redo':'undo');
});
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('#hist-undo,#hist-redo');if(b&&!b.disabled)HubHist.run(b.id==='hist-undo'?'undo':'redo')});
function toast(message,actLabel,actFn){const el=$('toast');el.textContent=message;el.classList.toggle('has-act',!!(actLabel&&actFn));
  let hist=null;if(actLabel==='Undo'&&actFn&&!HubHist.busy)hist=HubHist.push({kind:'act',label:String(message).replace(/[.…]+$/,'').toLowerCase(),undo:actFn,redo:null});
  if(actLabel&&actFn){const b=document.createElement('button');b.type='button';b.className='toast-act';b.textContent=actLabel;b.onclick=()=>{el.classList.remove('show');if(hist)HubHist.drop(hist);actFn()};el.appendChild(b)}
  el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),actLabel?4500:2200)}
function chooseProfile(){setGate('profile')}
document.querySelectorAll('[data-profile-choice]').forEach(btn=>btn.addEventListener('click',()=>{setProfile(btn.dataset.profileChoice);loadDashboard().then(linksStart,linksStart)}));
$('profile-switch').addEventListener('click',chooseProfile);$('mobile-profile').addEventListener('click',chooseProfile);$('signout').addEventListener('click',()=>{localStorage.removeItem(PROFILE_KEY);if(clockTimer)clearInterval(clockTimer);auth.signOut()});
$('auth-form').addEventListener('submit',async e=>{e.preventDefault();$('auth-error').textContent='';$('auth-submit').disabled=true;try{await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);await auth.signInWithEmailAndPassword($('auth-email').value.trim(),$('auth-password').value)}catch(err){$('auth-error').textContent=(err.message||'Sign in failed').replace('Firebase: ','')}finally{$('auth-submit').disabled=false}});

auth.onAuthStateChanged(user=>{state.user=user;if(!user){setGate('auth');return}const saved=localStorage.getItem(PROFILE_KEY);if(saved==='Bhargav'||saved==='Anusha'){setProfile(saved);loadDashboard().then(linksStart,linksStart)}else setGate('profile')});
lucide.createIcons();

/* ---- Install as an app (PWA) ---- */
let _installEv=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();_installEv=e;renderInstallCard()});
window.addEventListener('appinstalled',()=>{_installEv=null;renderInstallCard()});
function isStandalone(){return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true}
function renderInstallCard(){
  const b=document.getElementById('install-btn'),st=document.getElementById('install-status'),h=document.getElementById('install-hint');
  if(!b)return;
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
  if(isStandalone()){b.hidden=true;st.textContent='Installed — you are using the app.';return}
  b.hidden=false;
  if(_installEv){b.textContent='Install app';st.textContent='';b.onclick=async()=>{_installEv.prompt();try{await _installEv.userChoice}catch(e){}_installEv=null;renderInstallCard()};return}
  if(ios){b.textContent='How to install';st.textContent='';b.onclick=()=>toast('In Safari: tap Share, then “Add to Home Screen”.');h.textContent='iPhone and iPad: open this page in Safari, tap the Share button, then “Add to Home Screen”. Installing is also what lets notifications reach you later.';return}
  b.textContent='How to install';st.textContent='';
  b.onclick=()=>toast('Use your browser menu: “Install Home Hub” (Chrome/Edge) or “Add to Home screen” (Android).');
}
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

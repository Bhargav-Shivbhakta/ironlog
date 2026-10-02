/* =====================================================================
   IRONLOG LIVE BANNER SYSTEM
   ---------------------------------------------------------------------
   Replaces the old static Today-page header with a data-driven, fully
   animated banner. Bhargav: the real gold-Porsche photo preset plus a
   9-scene "mafia pack" (CSS/Lucide-glyph motion scenes). Anusha: 8 soft
   CSS motion scenes (placeholders, pending a real-photo pass later).

   To add a new banner later: append one object to BANNER_PRESETS and,
   if it needs a new visual motif, one entry in SCENE_BUILDERS + its CSS
   in banners.css. That's the whole extension surface — nothing else in
   this file needs to change.
===================================================================== */

/* Deterministic pseudo-random generator — same seed always produces the
   same scatter layout, so a preset's particle field doesn't jump around
   between renders/reloads. */
function bannerSeeded(seed){
  let s = seed % 2147483647; if(s<=0) s += 2147483646;
  return function(){ s = (s*16807) % 2147483647; return (s-1)/2147483646; };
}
function bannerScatter(count, cls, seed, opts){
  opts = opts||{};
  const rnd = bannerSeeded(seed);
  const minDur = opts.minDur||3.2, maxDur = opts.maxDur||6, minScale = opts.minScale||0.7, maxScale = opts.maxScale||1.3;
  let html = '';
  for(let i=0;i<count;i++){
    const x = (rnd()*(opts.xMax!=null?opts.xMax:94) + (opts.xMin!=null?opts.xMin:2)).toFixed(1);
    const y = (rnd()*(opts.yMax!=null?opts.yMax:82) + (opts.yMin!=null?opts.yMin:4)).toFixed(1);
    const delay = (rnd()*3.4).toFixed(2);
    const dur = (minDur + rnd()*(maxDur-minDur)).toFixed(2);
    const scale = (minScale + rnd()*(maxScale-minScale)).toFixed(2);
    const rot = (rnd()*50-25).toFixed(0);
    html += '<i class="'+cls+'" style="left:'+x+'%;top:'+y+'%;animation-delay:'+delay+'s;animation-duration:'+dur+'s;--sc:'+scale+';--rot:'+rot+'deg"></i>';
  }
  return html;
}

// Entry-direction / motion-speed presets for the "subject" scene below —
// ported as-is from the real-photo banner pack (each cutout already came
// with a direction+motion assignment chosen per image). Add a new named
// direction/motion here if a future photo needs one that isn't covered.
const SUBJECT_DIRECTIONS = {
  left:            {x:'-105%', y:'18px', z:'-330px', ry:'23deg',  rz:'-1.4deg', scale:.58},
  right:           {x:'105%',  y:'18px', z:'-330px', ry:'-23deg', rz:'1.4deg',  scale:.58},
  toward:          {x:'0%',    y:'0',    z:'-760px', ry:'0deg',   rz:'0deg',    scale:.24},
  bottom:          {x:'0%',    y:'105%', z:'-180px', ry:'0deg',   rz:'0deg',    scale:.68},
  'diagonal-right':{x:'105%',  y:'-52%', z:'-330px', ry:'-23deg', rz:'1.4deg',  scale:.58},
  'diagonal-left': {x:'-105%', y:'-52%', z:'-330px', ry:'23deg',  rz:'-1.4deg', scale:.58}
};
const SUBJECT_MOTIONS = {cinematic:2.15, energetic:1.35, subtle:2.8, calm:3.35};

const SCENE_BUILDERS = {
  // "porsche" is generic — every drive-in car preset uses this builder,
  // just pointing carImg at a different cutout. Add a new car preset by
  // dropping a transparent PNG/WEBP in assets/banners/ and adding one
  // BANNER_PRESETS entry with scene:'porsche' and that carImg path.
  porsche: (preset) => '<div class="road-line"></div><div class="motion-trail"></div>'+
    '<i class="speed-particle p1"></i><i class="speed-particle p2"></i><i class="speed-particle p3"></i>'+
    '<div class="car-rig"><div class="car-glow"></div><img class="car" src="'+(preset.carImg||'assets/banners/porsche-gold.webp')+'" alt="" draggable="false"></div>',

  // "subject" — the general-purpose real-photo scene for the mafia pack.
  // Same drive-in rig as "porsche" but the entry path (direction) and
  // speed (motion) are data-driven per preset instead of hardcoded, so
  // one builder covers a car arriving from the left, a jet banking in
  // from the right, a vault door growing "toward" camera, a suit sliding
  // up from the bottom, etc. Needs preset.carImg (the cutout), and
  // optionally preset.direction/preset.motion (default left/cinematic).
  subject: (preset) => {
    const d = SUBJECT_DIRECTIONS[preset.direction] || SUBJECT_DIRECTIONS.left;
    const dur = SUBJECT_MOTIONS[preset.motion] || SUBJECT_MOTIONS.cinematic;
    const ratio = preset.ratio || 1.5;
    // Narrower cutouts (3:2, e.g. chess/vault/suit) get a taller box than
    // wide ones (2:1, e.g. yacht/jet) so their rendered WIDTH lands closer
    // to the same ballpark instead of reading small/cramped next to the
    // wide ones -- a fixed height for every ratio made narrow subjects
    // visibly smaller even with no internal letterboxing.
    const stageH = ratio < 1.8 ? 270 : 235;
    const stageHMobile = ratio < 1.8 ? 195 : 170;
    const vars = '--entry-x:'+d.x+';--entry-y:'+d.y+';--entry-z:'+d.z+';--entry-ry:'+d.ry+';--entry-rz:'+d.rz+';--entry-scale:'+d.scale+';--duration:'+dur+'s;--subj-ratio:'+ratio+';--subj-h:'+stageH+'px;--subj-h-mobile:'+stageHMobile+'px';
    return '<div class="subject-stage" style="'+vars+'"><div class="road-line"></div><div class="motion-trail"></div>'+
      '<i class="speed-particle p1"></i><i class="speed-particle p2"></i><i class="speed-particle p3"></i>'+
      '<div class="subject-rig"><div class="subject-glow"></div><img class="subject" src="'+esc(preset.carImg||preset.image||'')+'" alt="" draggable="false"></div></div>';
  },

  showroom: () => '<img class="showroom-photo" src="assets/banners/porsche-showroom.jpg" alt="" draggable="false">'+
    '<div class="showroom-overlay"></div><div class="showroom-sweep"></div>',

  money: () => '<div class="money-glow"></div>' + bannerScatter(12,'money-bill',101,{minDur:3.6,maxDur:5.6,yMin:10,yMax:88}),

  cigar: () => '<div class="cigar-glass"></div><div class="cigar-glint"></div>' + bannerScatter(6,'smoke-curl',202,{minDur:4.5,maxDur:7,xMin:30,xMax:85,yMin:5,yMax:70}),

  chain: () => '<div class="chain-rig">'+
      Array.from({length:8}).map(()=>'<span class="chain-link"></span>').join('')+
    '</div><div class="chain-shine"></div>',

  card: () => '<div class="black-card"><span class="card-chip"></span><span class="card-sweep"></span><span class="card-line"></span></div>',

  thunder: () => '<div class="storm-sky"></div><div class="bolt bolt1"></div><div class="bolt bolt2"></div><div class="storm-flash"></div>',

  // (An earlier pass prototyped sedan/jet/yacht/chess/vault/briefcase/
  // phone/watch/skyline as oversized-Lucide-glyph CSS scenes, shown to
  // Bhargav for a thumbs up on the technique before committing. He then
  // supplied real transparent-cutout photos for all of them instead, so
  // those CSS versions were removed in favor of "subject" below — real
  // photos read far better than icon abstractions at this size.)

  goldenhour: () => '<div class="sun-glow"></div><div class="haze-sweep"></div>',

  florals: () => bannerScatter(9,'flower',505,{minDur:5,maxDur:8,yMin:14,yMax:86}),

  watercolor: () => ['wc-a','wc-b','wc-c','wc-d'].map((c,i)=>'<i class="wc-blob '+c+'" style="animation-delay:'+(i*0.7)+'s"></i>').join(''),

  clouds: () => bannerScatter(5,'cloud',606,{minDur:9,maxDur:14,yMin:8,yMax:55,xMin:0,xMax:80}),

  butterfly: () => bannerScatter(6,'butterfly',707,{minDur:6,maxDur:9,yMin:10,yMax:80}),

  petals: () => bannerScatter(16,'rose-petal',808,{minDur:5,maxDur:8,yMin:2,yMax:70}),

  stars: () => '<div class="crescent-moon"></div>' + bannerScatter(24,'star',909,{minDur:2,maxDur:3.8,yMin:2,yMax:70}),

  calm: () => '<div class="calm-wash"></div>'
};

const BANNER_PRESETS = [
  /* ---- Bhargav: just the original. He tried the other 11 (4 real-car
     cutouts + 7 CSS motion scenes, kept below in BANNER_PRESETS_ARCHIVED
     so they're one move away from coming back) and wants only this one
     for now. ---- */
  {id:'b-porsche', profile:'Bhargav', title:'Golden Arrival', category:'Signature', glyph:'car-front',
   accent:'#ad7b20', accent2:'#d2a84f', bg:'#111210', bg2:'#090a09', scene:'porsche'},

  /* ---- "Mafia pack" — 11 real-photo banners (transparent cutouts Bhargav
     supplied, Oct 1), using the generic "subject" scene (drive/fly/grow-in
     rig, direction+motion data-driven — see SUBJECT_DIRECTIONS/MOTIONS and
     the "subject" SCENE_BUILDERS entry). mood is the small, optional
     corner flavor line (#today-banner-mood) — purely decorative, never
     replaces the real task-driven summary line next to it. Golden Arrival
     stays above as-is; these sit alongside it, so nothing changes for
     Bhargav until he picks one. ---- */
  {id:'b-sedan', profile:'Bhargav', title:'Vintage Sedan', category:'Signature', glyph:'car-front',
   accent:'#c9a227', accent2:'#eede9a', bg:'radial-gradient(circle at 77% 48%,#ad7b202b,transparent 31%),linear-gradient(120deg,#111210,#15130e)', bg2:'#050504', scene:'subject',
   carImg:'assets/banners/vintage-sedan.png', direction:'left', motion:'cinematic', ratio:2},
  {id:'b-jet', profile:'Bhargav', title:'Private Jet', category:'Empire', glyph:'plane',
   accent:'#8fa8d9', accent2:'#dce8ff', bg:'repeating-linear-gradient(90deg,transparent 0 84px,#d2a84f0b 85px 86px),radial-gradient(circle at 78% 42%,#ad7b2022,transparent 34%),#0b0c0b', bg2:'#04050a', scene:'subject',
   carImg:'assets/banners/private-jet.png', direction:'right', motion:'cinematic', ratio:2},
  {id:'b-speedboat', profile:'Bhargav', title:'Night Speedboat', category:'Momentum', glyph:'sailboat',
   accent:'#6fb8d9', accent2:'#dff2fa', bg:'radial-gradient(ellipse at 78% 75%,#23475a38,transparent 38%),linear-gradient(#0c1116,#111210)', bg2:'#070a0d', scene:'subject',
   carImg:'assets/banners/speedboat.png', direction:'left', motion:'energetic', ratio:2},
  {id:'b-chess', profile:'Bhargav', title:'Chess King', category:'Mindset', glyph:'crown',
   accent:'#d2a84f', accent2:'#f0e0b0', bg:'radial-gradient(circle at 76% 45%,#ad7b2030,transparent 34%),linear-gradient(120deg,#10110f,#17130d)', bg2:'#070604', scene:'subject',
   carImg:'assets/banners/chess-king.png', direction:'toward', motion:'cinematic', ratio:1.5},
  {id:'b-vault', profile:'Bhargav', title:'Gold Vault', category:'Money', glyph:'vault',
   accent:'#e8c468', accent2:'#fff3d2', bg:'radial-gradient(circle at 78% 45%,#d2a84f2c,transparent 34%),linear-gradient(120deg,#0e0f0d,#16130d)', bg2:'#0a0806', scene:'subject',
   carImg:'assets/banners/gold-vault.png', direction:'toward', motion:'subtle', ratio:1.5},
  {id:'b-gates', profile:'Bhargav', title:'Mansion Gates', category:'Signature', glyph:'landmark',
   accent:'#c9a227', accent2:'#eede9a', bg:'radial-gradient(circle at 77% 46%,#ad7b2027,transparent 33%),linear-gradient(120deg,#0d0e0c,#15130e)', bg2:'#050504', scene:'subject',
   carImg:'assets/banners/mansion-gates.png', direction:'diagonal-right', motion:'cinematic', ratio:1.5},
  {id:'b-watch', profile:'Bhargav', title:'Tailored Standard', category:'Flex', glyph:'shirt',
   accent:'#d9b45c', accent2:'#eaf2ff', bg:'linear-gradient(110deg,#10110f,#16130e),repeating-linear-gradient(90deg,transparent 0 72px,#d2a84f0b 73px 74px)', bg2:'#070604', scene:'subject',
   carImg:'assets/banners/tailored-suit.png', direction:'bottom', motion:'subtle', ratio:1.5},
  {id:'b-skyline', profile:'Bhargav', title:'Penthouse Office', category:'Empire', glyph:'building-2',
   accent:'#6c93c2', accent2:'#8f9cc2', bg:'radial-gradient(circle at 77% 35%,#2c4b622c,transparent 31%),linear-gradient(120deg,#0b0d0e,#141310)', bg2:'#06070b', scene:'subject',
   carImg:'assets/banners/penthouse-office.png', direction:'toward', motion:'calm', ratio:2},
  {id:'b-briefcase', profile:'Bhargav', title:'Prepared Briefcase', category:'Money', glyph:'briefcase',
   accent:'#c9a227', accent2:'#eede9a', bg:'radial-gradient(circle at 78% 50%,#ad7b202a,transparent 35%),linear-gradient(120deg,#111210,#15130e)', bg2:'#080705', scene:'subject',
   carImg:'assets/banners/leather-briefcase.png', direction:'diagonal-left', motion:'cinematic', ratio:1.5},
  {id:'b-yacht', profile:'Bhargav', title:'Luxury Yacht', category:'Momentum', glyph:'sailboat',
   accent:'#8fd4e8', accent2:'#eaf6fa', bg:'radial-gradient(ellipse at 78% 75%,#23475a38,transparent 38%),linear-gradient(#0c1116,#111210)', bg2:'#050a0f', scene:'subject',
   carImg:'assets/banners/luxury-yacht.png', direction:'right', motion:'cinematic', ratio:2},
  {id:'b-phone', profile:'Bhargav', title:'The Call', category:'Empire', glyph:'phone-call',
   accent:'#d9b45c', accent2:'#fff3d2', bg:'radial-gradient(circle at 79% 48%,#ad7b2026,transparent 32%),linear-gradient(120deg,#0e0f0d,#17140f)', bg2:'#080604', scene:'subject',
   carImg:'assets/banners/rotary-telephone.png', direction:'left', motion:'subtle', ratio:1.5},

  /* ---- Anusha: soft aesthetic (placeholder CSS scenes for now — she
     wants real photos instead, but asked to hold that for a later pass;
     left in place as the stand-in until then). ---- */
  {id:'a-goldenhour', profile:'Anusha', title:'Golden Hour Glow', category:'Warm', glyph:'sunrise',
   accent:'#e8935a', accent2:'#ffd9a8', bg:'#2a1810', bg2:'#190e09', scene:'goldenhour'},
  {id:'a-florals', profile:'Anusha', title:'Soft Florals', category:'Bloom', glyph:'flower-2',
   accent:'#e397b8', accent2:'#f9d7e4', bg:'#241220', bg2:'#150a13', scene:'florals'},
  {id:'a-watercolor', profile:'Anusha', title:'Watercolor Bloom', category:'Bloom', glyph:'droplet',
   accent:'#c9a8e8', accent2:'#bfe3e8', bg:'#1a1526', bg2:'#0f0c17', scene:'watercolor'},
  {id:'a-clouds', profile:'Anusha', title:'Cloud Dreams', category:'Sky', glyph:'cloud',
   accent:'#a9c7e8', accent2:'#ffd9ec', bg:'#151c2c', bg2:'#0b0f19', scene:'clouds'},
  {id:'a-butterfly', profile:'Anusha', title:'Butterfly Drift', category:'Bloom', glyph:'wand-sparkles',
   accent:'#c9a0e0', accent2:'#f3d9f7', bg:'#1c1428', bg2:'#110c19', scene:'butterfly'},
  {id:'a-petals', profile:'Anusha', title:'Rose Petals Falling', category:'Romantic', glyph:'flower',
   accent:'#d9648a', accent2:'#f7c6d9', bg:'#22121a', bg2:'#140b10', scene:'petals'},
  {id:'a-stars', profile:'Anusha', title:'Moonlit Stars', category:'Sky', glyph:'moon',
   accent:'#8fa0e8', accent2:'#f3ecd9', bg:'#10122a', bg2:'#080919', scene:'stars'},
  {id:'a-calm', profile:'Anusha', title:'Calm Pastel Wash', category:'Calm', glyph:'sparkle',
   accent:'#c9b8e8', accent2:'#bfe0d9', bg:'#1a1826', bg2:'#0f0e17', scene:'calm'}
];

/* Archived — not in BANNER_PRESETS, so they don't show in the gallery.
   The 4 real-car cutouts + 5 CSS scenes Bhargav tried and didn't want
   from the first round (watch/skyline were brought back above, renamed,
   for the mafia pack). To bring one back, move its object into
   BANNER_PRESETS above. */
const BANNER_PRESETS_ARCHIVED = [
  {id:'b-showroom', profile:'Bhargav', title:'Desert Showroom', category:'Signature', glyph:'car-front',
   accent:'#c9a227', accent2:'#eede9a', bg:'#0c0d0a', bg2:'#050504', scene:'showroom', thumb:'assets/banners/porsche-showroom.jpg'},
  {id:'b-blackout', profile:'Bhargav', title:'Blacked Out', category:'Signature', glyph:'car-front',
   accent:'#8a8f98', accent2:'#e4e7ee', bg:'#0a0a0b', bg2:'#040405', scene:'porsche', carImg:'assets/banners/porsche-black.png', thumb:'assets/banners/porsche-black.png'},
  {id:'b-911turbo', profile:'Bhargav', title:'911 Turbo Flex', category:'Signature', glyph:'car-front',
   accent:'#c9a227', accent2:'#f0d9a0', bg:'#121008', bg2:'#070603', scene:'porsche', carImg:'assets/banners/porsche-911gold.png', thumb:'assets/banners/porsche-911gold.png'},
  {id:'b-greyghost', profile:'Bhargav', title:'Grey Ghost', category:'Signature', glyph:'car-front',
   accent:'#9aa0ac', accent2:'#eef1f6', bg:'#0d0e10', bg2:'#050506', scene:'porsche', carImg:'assets/banners/porsche-grey.png', thumb:'assets/banners/porsche-grey.png'},
  {id:'b-money', profile:'Bhargav', title:'Money Moves', category:'Money', glyph:'banknote',
   accent:'#c9a227', accent2:'#eede9a', bg:'#10140f', bg2:'#080a07', scene:'money'},
  {id:'b-cigar', profile:'Bhargav', title:'After Hours', category:'Lounge', glyph:'cigarette',
   accent:'#b2733a', accent2:'#f0dfae', bg:'#15100c', bg2:'#0a0806', scene:'cigar'},
  {id:'b-chain', profile:'Bhargav', title:'Gold Chain Drip', category:'Flex', glyph:'link-2',
   accent:'#d9b45c', accent2:'#fff3d2', bg:'#121008', bg2:'#080703', scene:'chain'},
  {id:'b-card', profile:'Bhargav', title:'Black Card', category:'Flex', glyph:'credit-card',
   accent:'#c9a227', accent2:'#f2f2ec', bg:'#0c0c0b', bg2:'#050504', scene:'card'},
  {id:'b-thunder', profile:'Bhargav', title:'Thunder Power', category:'Badass', glyph:'zap',
   accent:'#8fb4ff', accent2:'#e7efff', bg:'#0b0d13', bg2:'#05060a', scene:'thunder'}
];

function allBannerPresets(){ return BANNER_PRESETS; }

function bannerPresetsFor(profile){ return allBannerPresets().filter(p=>p.profile===profile); }
function bannerFind(id){ return allBannerPresets().find(p=>p.id===id); }
function bannerDefaultFor(profile){ return bannerPresetsFor(profile)[0]; }

/* ---------------------------------------------------------------------
   Engine — mounts into #today-banner, renders the active preset's scene,
   plays the entrance animation, and exposes a tiny API for Settings and
   the replay button.
--------------------------------------------------------------------- */
const bannerEngine = {
  current: null,
  mount(preset){
    const root = document.getElementById('today-banner');
    const scene = document.getElementById('today-banner-scene');
    if(!root || !scene || !preset) return;
    this.current = preset.id;
    root.style.setProperty('--accent', preset.accent);
    root.style.setProperty('--accent2', preset.accent2);
    root.style.setProperty('--ihbg', preset.bg);
    root.style.setProperty('--ihbg2', preset.bg2);
    scene.className = 'ih-banner-scene scene-'+preset.scene;
    const build = SCENE_BUILDERS[preset.scene];
    scene.innerHTML = build ? build(preset) : '';
    const moodEl = document.getElementById('today-banner-mood');
    if(moodEl){
      if(preset.mood){ moodEl.textContent = preset.mood; moodEl.hidden = false; }
      else { moodEl.hidden = true; moodEl.textContent=''; }
    }
    root.classList.remove('is-playing');
    // force reflow so re-adding the class restarts the entrance animation
    void root.offsetWidth;
    root.classList.add('is-playing');
    if(window.lucide) lucide.createIcons();
  },
  replay(){
    const preset = bannerFind(this.current);
    if(preset) this.mount(preset);
  }
};

/* ---------------------------------------------------------------------
   Rotation — the saved doc now carries rotateMode ('off'|'visit'|'daily'
   |'timer') and rotateMinutes alongside active, so a pick persists
   across tabs/reloads the same as before, but the active banner can also
   change itself: once per visit, once per day, or on a repeating timer
   while the Hub stays open. lastRotatedAt (ISO string) is how 'daily'
   tells today's visit apart from an earlier one.
--------------------------------------------------------------------- */
async function saveBannerTheme(){
  try{ await profileRef('hub-profiles','bannerTheme').set({json: JSON.stringify(state.bannerTheme)}); }catch(e){}
}
function bannerRandomPreset(list, excludeId){
  if(!list.length) return null;
  const pool = list.filter(p=>p.id!==excludeId);
  return (pool.length ? pool : list)[Math.floor(Math.random()*(pool.length||list.length))];
}
// Which banners shuffle/rotation is allowed to pick from — a subset the
// person chooses in Settings (the checkbox badge on each swatch), not
// automatically every banner that exists. shufflePool is a list of ids;
// null/undefined (nothing chosen yet) defaults to "everything", and an
// empty result (every banner unchecked) also falls back to everything
// rather than silently never rotating.
function bannerShufflePool(){
  const list = bannerPresetsFor(state.profile);
  const pool = state.bannerTheme && state.bannerTheme.shufflePool;
  if(!Array.isArray(pool)) return list;
  const ids = new Set(pool);
  const filtered = list.filter(p=>ids.has(p.id));
  return filtered.length ? filtered : list;
}
async function toggleBannerShuffleInclusion(id){
  const list = bannerPresetsFor(state.profile);
  const current = (state.bannerTheme && Array.isArray(state.bannerTheme.shufflePool))
    ? state.bannerTheme.shufflePool.slice()
    : list.map(p=>p.id); // materialize the implicit "everything" into an explicit list the first time something gets excluded
  const idx = current.indexOf(id);
  if(idx===-1) current.push(id); else current.splice(idx,1);
  state.bannerTheme = Object.assign({}, state.bannerTheme, {shufflePool: current});
  await saveBannerTheme();
  renderBannerGallery();
}
// Bulk versions of the same toggle, for the Select all / Unselect all
// buttons above the gallery. Select all stores an explicit list of every
// current preset id. Unselect all stores an explicit empty list so every
// checkbox shows unchecked here in Settings — note bannerShufflePool()
// deliberately treats an empty pool as "everything" at shuffle/rotation
// time (so shuffle never silently breaks if every box gets unchecked),
// so this is really "uncheck everything to then pick a few," not a way
// to turn shuffle off; Rotate mode's own 'off' option does that.
async function setBannerShufflePoolAll(includeAll){
  const list = bannerPresetsFor(state.profile);
  const ids = includeAll ? list.map(p=>p.id) : [];
  state.bannerTheme = Object.assign({}, state.bannerTheme, {shufflePool: ids});
  await saveBannerTheme();
  renderBannerGallery();
  toast(includeAll ? 'All banners included in shuffle' : 'All banners left out — pick a few to include');
}
let bannerRotateTimer = null;
function bannerScheduleTimerRotation(){
  if(bannerRotateTimer){ clearInterval(bannerRotateTimer); bannerRotateTimer=null; }
  if(!state.bannerTheme || state.bannerTheme.rotateMode!=='timer') return;
  const minutes = Math.max(1, Number(state.bannerTheme.rotateMinutes)||5);
  bannerRotateTimer = setInterval(()=>{ shuffleBannerNow(); }, minutes*60*1000);
}
// Applies 'visit'/'daily' rotation right as the Today page loads. Returns
// the preset that should actually be shown (rotated or not).
function applyBannerRotationOnLoad(preset){
  const mode = state.bannerTheme.rotateMode;
  if(mode!=='visit' && mode!=='daily') return preset;
  const pool = bannerShufflePool();
  if(pool.length<2) return preset;
  if(mode==='daily'){
    const today = new Date().toDateString();
    const lastDay = state.bannerTheme.lastRotatedAt ? new Date(state.bannerTheme.lastRotatedAt).toDateString() : null;
    if(today===lastDay) return preset; // already rotated once today
  }
  const next = bannerRandomPreset(pool, preset.id);
  if(!next) return preset;
  state.bannerTheme.active = next.id;
  state.bannerTheme.lastRotatedAt = new Date().toISOString();
  saveBannerTheme();
  return next;
}
async function initTodayBanner(){
  if(!document.getElementById('today-banner')) return;
  const saved = await readJson(profileRef('hub-profiles','bannerTheme'), null);
  const list = bannerPresetsFor(state.profile);
  let preset = (saved && saved.active && bannerFind(saved.active) && bannerFind(saved.active).profile===state.profile)
    ? bannerFind(saved.active) : bannerDefaultFor(state.profile);
  if(!preset) preset = list[0];
  state.bannerTheme = {
    active: preset.id,
    rotateMode: (saved && saved.rotateMode) || 'off',
    rotateMinutes: (saved && saved.rotateMinutes) || 5,
    lastRotatedAt: (saved && saved.lastRotatedAt) || null,
    shufflePool: (saved && Array.isArray(saved.shufflePool)) ? saved.shufflePool : null
  };
  preset = applyBannerRotationOnLoad(preset);
  bannerEngine.mount(preset);
  renderBannerGallery();
  renderBannerRotationControls();
  bannerScheduleTimerRotation();
}
async function selectBannerPreset(id){
  const preset = bannerFind(id);
  if(!preset || preset.profile!==state.profile) return;
  state.bannerTheme = Object.assign({}, state.bannerTheme, {active: id});
  bannerEngine.mount(preset);
  await saveBannerTheme();
  renderBannerGallery();
  toast(preset.title+' set as your Today banner');
}
async function shuffleBannerNow(){
  const pool = bannerShufflePool();
  if(pool.length<2){ toast(pool.length===1?'Only one banner is in your shuffle pool — pick a few more in Settings':'No banners to shuffle'); return; }
  const next = bannerRandomPreset(pool, state.bannerTheme && state.bannerTheme.active);
  if(!next) return;
  state.bannerTheme = Object.assign({}, state.bannerTheme, {active: next.id});
  bannerEngine.mount(next);
  await saveBannerTheme();
  renderBannerGallery();
  toast('Shuffled to '+next.title);
}
async function setBannerRotateMode(mode){
  state.bannerTheme = Object.assign({}, state.bannerTheme, {rotateMode: mode});
  await saveBannerTheme();
  renderBannerRotationControls();
  bannerScheduleTimerRotation();
}
async function setBannerRotateMinutes(minutes){
  const n = Math.min(1440, Math.max(1, Math.round(Number(minutes))||5));
  // No-op if this is already the running value — otherwise the debounced
  // 'input' save (below) and the 'change'-on-blur save both fire for the
  // same typed value, and the second one would re-anchor the timer's
  // countdown back to zero right after the first one already started it.
  if(state.bannerTheme && state.bannerTheme.rotateMinutes===n && bannerRotateTimer) return;
  state.bannerTheme = Object.assign({}, state.bannerTheme, {rotateMinutes: n});
  await saveBannerTheme();
  bannerScheduleTimerRotation();
}

/* ---------------------------------------------------------------------
   Settings gallery — a simple static swatch per preset (glyph + accent
   gradient), scoped to the signed-in profile's own 8. Clicking one
   activates it live on the Today page and persists the choice.
--------------------------------------------------------------------- */
function renderBannerGallery(){
  const grid = document.getElementById('banner-gallery');
  if(!grid) return;
  const list = bannerPresetsFor(state.profile);
  const active = (state.bannerTheme && state.bannerTheme.active) || (bannerDefaultFor(state.profile)||{}).id;
  const pool = state.bannerTheme && Array.isArray(state.bannerTheme.shufflePool) ? new Set(state.bannerTheme.shufflePool) : null;
  let includedCount = 0;
  grid.innerHTML = list.map(p=>{
    const thumbImg = p.thumb || p.image || p.carImg;
    // A real <img loading="lazy" decoding="async"> instead of a CSS
    // background-image: with ~50+ swatches each pointing at a 1-4MB
    // animated webp, a background-image forces every single one to
    // fetch/decode/animate at once as soon as the gallery renders — that
    // was the "lags, something is going on" glitch. An <img> with
    // loading="lazy" only has the browser fetch/decode the ones actually
    // near the viewport, same as any other lazy image grid.
    const previewStyle = 'background:linear-gradient(135deg,'+p.accent+','+p.bg+')';
    const thumbEl = thumbImg
      ? '<img class="banner-swatch-img" src="'+esc(thumbImg)+'" alt="" loading="lazy" decoding="async" draggable="false">'
      : '';
    const included = !pool || pool.has(p.id); // no explicit pool yet = everything counts as included
    if(included) includedCount++;
    return '<div class="banner-swatch'+(p.id===active?' active':'')+(p._custom?' banner-swatch-custom':'')+'" data-banner-id="'+p.id+'">'+
      '<button type="button" class="banner-swatch-shuffle-toggle'+(included?' included':'')+'" data-banner-shuffle-toggle="'+p.id+'" title="'+(included?'In the shuffle pool — click to leave it out':'Left out of the shuffle pool — click to include it')+'" aria-pressed="'+included+'"><i data-lucide="check"></i></button>'+
      '<button type="button" class="banner-swatch-select" data-banner-select="'+p.id+'" title="'+esc(p.title)+'">'+
        '<span class="banner-swatch-preview" style="'+previewStyle+'">'+thumbEl+(thumbImg?'':'<i data-lucide="'+p.glyph+'"></i>')+'</span>'+
        '<strong>'+esc(p.title)+'</strong><small>'+esc(p.category)+'</small>'+
      '</button></div>';
  }).join('');
  if(window.lucide) lucide.createIcons();
  const countEl = document.getElementById('banner-pool-count');
  if(countEl) countEl.textContent = includedCount+' of '+list.length+' in shuffle';
  // One toggle button instead of two separate always-visible ones — it
  // reads "Select all" until everything is already included, then flips
  // to "Unselect all" so it always describes the action a click will
  // take, not two buttons sitting there with one of them always a no-op.
  const toggleBtn = document.getElementById('banner-pool-toggle');
  if(toggleBtn){
    const allIncluded = list.length>0 && includedCount===list.length;
    toggleBtn.textContent = allIncluded ? 'Unselect all' : 'Select all';
    toggleBtn.dataset.bannerPoolAction = allIncluded ? 'none' : 'all';
  }
}
function renderBannerRotationControls(){
  const modeSel = document.getElementById('banner-rotate-mode');
  const minutesRow = document.getElementById('banner-rotate-minutes-row');
  const minutesInput = document.getElementById('banner-rotate-minutes');
  if(!modeSel || !state.bannerTheme) return;
  modeSel.value = state.bannerTheme.rotateMode || 'off';
  if(minutesRow) minutesRow.hidden = modeSel.value!=='timer';
  if(minutesInput) minutesInput.value = state.bannerTheme.rotateMinutes || 5;
}
let bannerGalleryWired = false;
function wireBannerGallery(){
  if(bannerGalleryWired) return; bannerGalleryWired = true;
  const grid = document.getElementById('banner-gallery');
  if(grid) grid.addEventListener('click', e=>{
    const shuffleBtn = e.target.closest('[data-banner-shuffle-toggle]');
    if(shuffleBtn){ e.stopPropagation(); toggleBannerShuffleInclusion(shuffleBtn.dataset.bannerShuffleToggle); return; }
    const btn = e.target.closest('[data-banner-select]');
    if(btn) selectBannerPreset(btn.dataset.bannerSelect);
  });
  const replayBtn = document.getElementById('today-banner-replay');
  if(replayBtn) replayBtn.addEventListener('click', ()=>bannerEngine.replay());
  const poolToggleBtn = document.getElementById('banner-pool-toggle');
  if(poolToggleBtn) poolToggleBtn.addEventListener('click', ()=>setBannerShufflePoolAll(poolToggleBtn.dataset.bannerPoolAction!=='none'));
  const modeSel = document.getElementById('banner-rotate-mode');
  if(modeSel) modeSel.addEventListener('change', e=>{
    const minutesRow = document.getElementById('banner-rotate-minutes-row');
    if(minutesRow) minutesRow.hidden = e.target.value!=='timer';
    setBannerRotateMode(e.target.value);
  });
  const minutesInput = document.getElementById('banner-rotate-minutes');
  if(minutesInput){
    minutesInput.addEventListener('change', e=>setBannerRotateMinutes(e.target.value));
    // Also save shortly after typing stops, not only on blur/change — on
    // some mobile keyboards tapping another control can dismiss focus
    // without firing 'change' first, which would otherwise leave the old
    // interval running on the un-typed value.
    let minutesDebounce;
    minutesInput.addEventListener('input', e=>{
      clearTimeout(minutesDebounce);
      const val=e.target.value;
      minutesDebounce=setTimeout(()=>setBannerRotateMinutes(val),600);
    });
  }
  const shuffleBtn = document.getElementById('banner-shuffle-now');
  if(shuffleBtn) shuffleBtn.addEventListener('click', ()=>shuffleBannerNow());
}

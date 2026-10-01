/* =====================================================================
   IRONLOG LIVE BANNER SYSTEM
   ---------------------------------------------------------------------
   Replaces the old static Today-page header with a data-driven, fully
   animated banner. One real preset ("Golden Arrival", the gold Porsche)
   plus 7 hand-built CSS/SVG motion scenes per profile — 8 for Bhargav
   (mafia / luxury / money / badass), 8 for Anusha (soft aesthetic).

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

const SCENE_BUILDERS = {
  // "porsche" is generic — every drive-in car preset uses this builder,
  // just pointing carImg at a different cutout. Add a new car preset by
  // dropping a transparent PNG/WEBP in assets/banners/ and adding one
  // BANNER_PRESETS entry with scene:'porsche' and that carImg path.
  porsche: (preset) => '<div class="road-line"></div><div class="motion-trail"></div>'+
    '<i class="speed-particle p1"></i><i class="speed-particle p2"></i><i class="speed-particle p3"></i>'+
    '<div class="car-rig"><div class="car-glow"></div><img class="car" src="'+(preset.carImg||'assets/banners/porsche-gold.webp')+'" alt="" draggable="false"></div>',

  showroom: () => '<img class="showroom-photo" src="assets/banners/porsche-showroom.jpg" alt="" draggable="false">'+
    '<div class="showroom-overlay"></div><div class="showroom-sweep"></div>',

  // Generic full-bleed photo scene — this is what custom/uploaded JSON
  // banners use (see discoverCustomBanners below): any preset with
  // scene:'photo' and an "image" field renders through here with no
  // code changes needed.
  photo: (preset) => '<img class="photo-hero" src="'+esc(preset.image||'')+'" alt="" draggable="false" style="object-position:'+esc(preset.objectPosition||'center 55%')+'">'+
    '<div class="photo-overlay"></div><div class="photo-sweep"></div>',

  money: () => '<div class="money-glow"></div>' + bannerScatter(12,'money-bill',101,{minDur:3.6,maxDur:5.6,yMin:10,yMax:88}),

  cigar: () => '<div class="cigar-glass"></div><div class="cigar-glint"></div>' + bannerScatter(6,'smoke-curl',202,{minDur:4.5,maxDur:7,xMin:30,xMax:85,yMin:5,yMax:70}),

  chain: () => '<div class="chain-rig">'+
      Array.from({length:8}).map(()=>'<span class="chain-link"></span>').join('')+
    '</div><div class="chain-shine"></div>',

  skyline: () => '<div class="skyline-moon"></div><div class="skyline"><div class="skyline-row">'+
      [34,52,40,66,28,58,46,72,36,50].map(h=>'<span class="building" style="height:'+h+'%"></span>').join('')+
    '</div></div>' + bannerScatter(14,'sky-window',303,{minDur:2,maxDur:3.6,yMin:18,yMax:62,xMin:4,xMax:70}),

  card: () => '<div class="black-card"><span class="card-chip"></span><span class="card-sweep"></span><span class="card-line"></span></div>',

  watch: () => '<div class="watch-dial"><span class="watch-hand"></span><span class="watch-center"></span></div>' +
    bannerScatter(6,'diamond-glint',404,{minDur:2,maxDur:3.4,xMin:4,xMax:96,yMin:6,yMax:90}),

  thunder: () => '<div class="storm-sky"></div><div class="bolt bolt1"></div><div class="bolt bolt2"></div><div class="storm-flash"></div>',

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
   The 4 real-car cutouts + 7 CSS scenes Bhargav tried and didn't want.
   To bring one back, move its object into BANNER_PRESETS above. */
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
  {id:'b-skyline', profile:'Bhargav', title:'Penthouse Skyline', category:'Empire', glyph:'building-2',
   accent:'#d2a84f', accent2:'#8f9cc2', bg:'#0c0e15', bg2:'#06070b', scene:'skyline'},
  {id:'b-card', profile:'Bhargav', title:'Black Card', category:'Flex', glyph:'credit-card',
   accent:'#c9a227', accent2:'#f2f2ec', bg:'#0c0c0b', bg2:'#050504', scene:'card'},
  {id:'b-watch', profile:'Bhargav', title:'Diamond Grip', category:'Flex', glyph:'watch',
   accent:'#d9b45c', accent2:'#eaf2ff', bg:'#0e0d0a', bg2:'#070604', scene:'watch'},
  {id:'b-thunder', profile:'Bhargav', title:'Thunder Power', category:'Badass', glyph:'zap',
   accent:'#8fb4ff', accent2:'#e7efff', bg:'#0b0d13', bg2:'#05060a', scene:'thunder'}
];

/* ---------------------------------------------------------------------
   Custom banners — dropped into banners/custom/ in the GitHub repo as
   one .json file each (see banners/custom/README.md for the format).
   Fetched the same way discoverApps() in app.js finds apps/*.html: list
   the folder via the GitHub contents API, then fetch each file's raw
   content. No code changes needed to add one — just push the JSON (and
   its image, if it points at one in the repo) and reload.
--------------------------------------------------------------------- */
let customBannersCache = null;
async function discoverCustomBanners(){
  if(customBannersCache) return customBannersCache;
  if(typeof GITHUB_REPO==='undefined' || GITHUB_REPO==='YOUR_USERNAME/YOUR_REPO'){ customBannersCache=[]; return customBannersCache; }
  try{
    const res = await fetch('https://api.github.com/repos/'+GITHUB_REPO+'/contents/banners/custom');
    if(!res.ok){ customBannersCache=[]; return customBannersCache; }
    const files = await res.json();
    const jsonFiles = Array.isArray(files) ? files.filter(f=>f.type==='file' && /\.json$/i.test(f.name)) : [];
    const loaded = await Promise.all(jsonFiles.map(async f=>{
      try{
        const r = await fetch(f.download_url);
        const data = await r.json();
        if(!data.id || !data.profile || !data.title) return null; // required fields
        if(data.profile!=='Bhargav' && data.profile!=='Anusha') return null;
        return Object.assign({
          category:'Custom', glyph:'image', scene:'photo',
          accent:'#ad7b20', accent2:'#d2a84f', bg:'#111210', bg2:'#090a09',
          _custom:true
        }, data);
      }catch(e){ return null; }
    }));
    customBannersCache = loaded.filter(Boolean);
  }catch(e){ customBannersCache = []; }
  return customBannersCache;
}
function allBannerPresets(){ return BANNER_PRESETS.concat(customBannersCache||[]); }

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

async function initTodayBanner(){
  if(!document.getElementById('today-banner')) return;
  await discoverCustomBanners();
  const saved = await readJson(profileRef('hub-profiles','bannerTheme'), null);
  const list = bannerPresetsFor(state.profile);
  let preset = (saved && saved.active && bannerFind(saved.active) && bannerFind(saved.active).profile===state.profile)
    ? bannerFind(saved.active) : bannerDefaultFor(state.profile);
  if(!preset) preset = list[0];
  state.bannerTheme = {active: preset.id};
  bannerEngine.mount(preset);
  renderBannerGallery(); // in case Settings was opened before custom banners finished loading
}
async function selectBannerPreset(id){
  const preset = bannerFind(id);
  if(!preset || preset.profile!==state.profile) return;
  state.bannerTheme = {active: id};
  bannerEngine.mount(preset);
  try{ await profileRef('hub-profiles','bannerTheme').set({json: JSON.stringify({active:id})}); }catch(e){}
  renderBannerGallery();
  toast(preset.title+' set as your Today banner');
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
  grid.innerHTML = list.map(p=>{
    const thumbImg = p.thumb || p.image;
    const previewStyle = thumbImg
      ? 'background:linear-gradient(135deg,'+p.accent+','+p.bg+');background-image:linear-gradient(0deg,'+p.bg+'cc,transparent 60%),url(\''+thumbImg+'\');background-size:cover;background-position:center'
      : 'background:linear-gradient(135deg,'+p.accent+','+p.bg+')';
    return '<button type="button" class="banner-swatch'+(p.id===active?' active':'')+(p._custom?' banner-swatch-custom':'')+'" data-banner-select="'+p.id+'" title="'+esc(p.title)+'">'+
      '<span class="banner-swatch-preview" style="'+previewStyle+'">'+(thumbImg?'':'<i data-lucide="'+p.glyph+'"></i>')+'</span>'+
      '<strong>'+esc(p.title)+'</strong><small>'+esc(p.category)+'</small></button>';
  }).join('');
  if(window.lucide) lucide.createIcons();
}
let bannerGalleryWired = false;
function wireBannerGallery(){
  if(bannerGalleryWired) return; bannerGalleryWired = true;
  const grid = document.getElementById('banner-gallery');
  if(grid) grid.addEventListener('click', e=>{
    const btn = e.target.closest('[data-banner-select]');
    if(btn) selectBannerPreset(btn.dataset.bannerSelect);
  });
  const replayBtn = document.getElementById('today-banner-replay');
  if(replayBtn) replayBtn.addEventListener('click', ()=>bannerEngine.replay());
}

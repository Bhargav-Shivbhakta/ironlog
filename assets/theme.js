/* =====================================================================
   Shared theme loader — used by every app in this suite (not just the
   Home Hub) so a color picked once in the Hub's Settings tab reskins
   everywhere. Each app already has its own small set of CSS custom
   properties for its "brand" color (named differently per app — some
   are --accent/--accent-deep/--accent-soft, some are --green/--green2 —
   see the block below each app's own <style> for whichever it uses),
   set per-profile via a body[data-profile="X"] rule. This file reads the
   one shared theme doc (apps/hub/data/theme) and overrides those same
   variables at runtime via inline style on <html>, which always wins
   over any stylesheet rule regardless of profile — so it works whether
   or not the theme has been customized yet (falls back to the same
   defaults every app already ships with).

   This file intentionally has zero dependency on any particular app's
   own state — it only needs firebase (already initialized by the time
   it's called) and the profile name currently showing.
===================================================================== */
(function(global){
  function hexToRgb(hex){
    hex=(hex||'').replace('#','');
    if(hex.length===3)hex=hex.split('').map(c=>c+c).join('');
    const n=parseInt(hex,16)||0;
    return[n>>16&255,n>>8&255,n&255];
  }
  function rgbToHsl(r,g,b){
    r/=255;g/=255;b/=255;
    const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
    let h,s,l=(mx+mn)/2;
    if(mx===mn){h=s=0}
    else{
      const d=mx-mn;
      s=l>0.5?d/(2-mx-mn):d/(mx+mn);
      if(mx===r)h=(g-b)/d+(g<b?6:0);
      else if(mx===g)h=(b-r)/d+2;
      else h=(r-g)/d+4;
      h/=6;
    }
    return[h*360,s*100,l*100];
  }
  function hslToHex(h,s,l){
    h=((h%360)+360)%360/360;s=Math.max(0,Math.min(100,s))/100;l=Math.max(0,Math.min(100,l))/100;
    let r,g,b;
    if(s===0){r=g=b=l}
    else{
      const q=l<0.5?l*(1+s):l+s-l*s,p=2*l-q;
      const hue2rgb=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p};
      r=hue2rgb(p,q,h+1/3);g=hue2rgb(p,q,h);b=hue2rgb(p,q,h-1/3);
    }
    const toHex=x=>Math.round(x*255).toString(16).padStart(2,'0');
    return'#'+toHex(r)+toHex(g)+toHex(b);
  }
  function deriveShades(base){
    const[h,s,l]=rgbToHsl(...hexToRgb(base));
    const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    return{accent:base,deep:hslToHex(h,clamp(s*1.08,40,96),clamp(l*0.6,16,42)),soft:hslToHex(h,clamp(s*0.5,18,55),92)};
  }
  const DEFAULT_ACCENTS={Bhargav:'#ad7b20',Anusha:'#b25c78'};
  function canonProfile(raw){
    raw=String(raw||'');
    if(!raw)return null;
    return raw[0].toUpperCase()+raw.slice(1).toLowerCase();
  }
  // varNames: {base:'--accent', deep:'--accent-deep', soft:'--accent-soft'}
  // — pass whichever custom property names this app's own CSS uses.
  async function applyHubTheme(profileRaw, varNames){
    varNames=varNames||{};
    const baseVar=varNames.base||'--accent', deepVar=varNames.deep||'--accent-deep', softVar=varNames.soft||'--accent-soft';
    const canon=canonProfile(profileRaw)||'Bhargav';
    let hex=null;
    try{
      const user=firebase.auth&&firebase.auth().currentUser;
      if(user){
        // Accents live at apps/hub/data/theme-accents (the Hub split its
        // shared accent doc from its personal mode/wallpaper doc a while
        // back — see app.js's saveHubAccents). Falls back to the old
        // combined "theme" doc for anyone who picked a color before that
        // split and never touched it since, so this doesn't regress them
        // to the default gold/pink.
        const col=firebase.firestore().collection('users').doc(user.uid).collection('apps').doc('hub').collection('data');
        const [accentsSnap,legacySnap]=await Promise.all([col.doc('theme-accents').get(),col.doc('theme').get()]);
        let t=null;
        if(accentsSnap.exists)t=JSON.parse(accentsSnap.data().json||'{}');
        else if(legacySnap.exists)t=JSON.parse(legacySnap.data().json||'{}');
        hex=t&&t.accents&&t.accents[canon];
      }
    }catch(e){/* theme is a progressive enhancement — never block the app on it */}
    hex=hex||DEFAULT_ACCENTS[canon]||DEFAULT_ACCENTS.Bhargav;
    const sh=deriveShades(hex);
    document.documentElement.style.setProperty(baseVar,sh.accent);
    if(deepVar)document.documentElement.style.setProperty(deepVar,sh.deep);
    if(softVar)document.documentElement.style.setProperty(softVar,sh.soft);
    // Follow the Hub's full look (mode / palette) too, so every app matches
    // whatever was picked in Settings instead of only taking the accent color.
    try{ await applyHubAppearance(canon); }catch(e){}
    return sh;
  }
  /* ---- Full-appearance follower (mode + palette + wallpaper) ----------
     Opt-in: only apps whose CSS is built entirely on the Hub's surface
     tokens (--bg --surface --surface-soft --line --text --muted --faint
     --ink --shadow) should call this. It mirrors app.js applyTheme(): reads
     the profile's own appearance doc and sets data-theme plus inline
     tokens, so the app changes whenever the Hub look changes. */
  const MODES={
    light:{bg:'#f4f4f0',surface:'#fff',soft:'#f8f8f5',line:'#e3e3dc',text:'#20211e',muted:'#74766f',faint:'#9c9e97',ink:'#171714',shadow:'0 18px 50px rgba(37,38,32,.08)',dark:false},
    dark:{bg:'#121212',surface:'#1b1b1a',soft:'#232322',line:'#323230',text:'#f2f1ed',muted:'#a7a59d',faint:'#79776f',ink:'#0a0a09',shadow:'0 18px 50px rgba(0,0,0,.4)',dark:true},
    midnight:{bg:'#0b0e1a',surface:'#131829',soft:'#1a2036',line:'#262e4a',text:'#eef0f8',muted:'#9298b3',faint:'#636a87',ink:'#070912',shadow:'0 18px 50px rgba(0,0,10,.45)',dark:true},
    sepia:{bg:'#f6ecd9',surface:'#fbf5e8',soft:'#f1e5cd',line:'#e1cfa8',text:'#3a2f1e',muted:'#7a6a4d',faint:'#a39370',ink:'#2c2413',shadow:'0 18px 50px rgba(90,70,20,.12)',dark:false}
  };
  const HUES={crimson:0,coral:15,amber:30,gold:45,olive:60,lime:75,sage:90,fern:105,emerald:120,jade:135,mint:150,teal:165,cyan:180,sky:195,azure:210,cobalt:225,indigo:240,violet:255,purple:270,orchid:285,magenta:300,rose:315,blush:330,ruby:345,mono:0};
  const hsl=(h,s,l)=>'hsl('+Math.round(h)+' '+Math.round(s)+'% '+Math.round(l)+'%)';
  function paletteVars(id){
    const m=/^palette-([a-z]+)-(light|dark)$/.exec(id||'');
    if(!m||!(m[1] in HUES))return null;
    const h=HUES[m[1]],s=m[1]==='mono'?0:1;
    return m[2]==='dark'
      ?{bg:hsl(h,18*s,8),surface:hsl(h,16*s,12),soft:hsl(h,15*s,16),line:hsl(h,15*s,22),text:hsl(h,14*s,94),muted:hsl(h,10*s,66),faint:hsl(h,8*s,46),ink:hsl(h,24*s,6),shadow:'0 18px 50px rgba(0,0,0,.4)',dark:true}
      :{bg:hsl(h,26*s,95),surface:hsl(h,32*s,99),soft:hsl(h,24*s,96),line:hsl(h,18*s,88),text:hsl(h,20*s,15),muted:hsl(h,10*s,43),faint:hsl(h,8*s,60),ink:hsl(h,24*s,9),shadow:'0 18px 50px hsla('+Math.round(h)+',30%,25%,.12)',dark:false};
  }
  function readableOn(hex){
    const[r,g,b]=hexToRgb(hex);
    return(0.299*r+0.587*g+0.114*b)>150?'#16130c':'#ffffff';
  }
  /* Every app names its tokens a little differently (--surface-alt, --panel, --border, --text-soft ...).
     This maps the Hub's surface tokens onto all of those names, and in dark modes re-tints the pastel
     "-soft" chips so they don't glow on a dark surface. */
  const SOFT_BASES=['accent','danger','good','done','success','info','warn','gold','p1','p2','p3','p4','todo','gym','chores','schedule','skin','am','body-c','night','pm','track','ok','bad','orange','blue','red','coral','violet'];
  function applyVars(v){
    const root=document.documentElement,set=(k,x)=>root.style.setProperty(k,x);
    const inkText=root.dataset.themeInk==='text';
    root.dataset.theme=v.dark?'dark':'light';
    root.style.colorScheme=v.dark?'dark':'light';
    set('--bg',v.bg);set('--surface',v.surface);set('--surface-soft',v.soft);set('--line',v.line);
    set('--text',v.text);set('--muted',v.muted);set('--faint','color-mix(in srgb,'+v.muted+' 72%,'+v.text+')');set('--shadow',v.shadow);
    set('--ink',inkText?v.text:v.ink);
    set('--surface-alt',v.soft);set('--surface-2',v.soft);set('--panel',v.surface);set('--panel2',v.soft);
    set('--border',v.line);set('--border-soft','color-mix(in srgb,'+v.line+' 55%,'+v.surface+')');
    set('--text-soft',v.muted);set('--text-faint','color-mix(in srgb,'+v.muted+' 72%,'+v.text+')');
    if(v.dark){
      SOFT_BASES.forEach(n=>set('--'+n+'-soft','color-mix(in srgb,var(--'+n+') 20%,'+v.surface+')'));
      set('--green2','color-mix(in srgb,var(--green,var(--accent)) 20%,'+v.surface+')');
      const lift='color-mix(in srgb,var(--accent) 62%,#fff)';
      set('--accent-deep',lift);set('--accent-ink',lift);
    }else{
      ['--accent-deep','--accent-ink'].forEach(k=>{ /* keep whatever applyHubTheme derived */ });
    }
    const meta=document.querySelector('meta[name="theme-color"]'); if(meta&&/^#|^hsl/.test(v.bg))meta.setAttribute('content',v.bg);
    root.classList.add('themed');
  }
  function cacheKey(p){return 'hub-appearance:'+(canonProfile(p)||'last');}
  function readCache(p){ try{ const c=JSON.parse(localStorage.getItem(cacheKey(p))||'null'); return c&&c.surface?c:null; }catch(e){ return null; } }
  function writeCache(p,v){ try{ const j=JSON.stringify(v); localStorage.setItem(cacheKey(p),j); localStorage.setItem(cacheKey('last'),j); }catch(e){} }
  function profileFromUrl(){ try{ return new URLSearchParams(location.search).get('profile'); }catch(e){ return null; } }
  function applyCached(p){ const c=readCache(p||profileFromUrl())||readCache('last'); if(c)applyVars(c); return !!c; }
  async function applyHubAppearance(profileRaw){
    const canon=canonProfile(profileRaw)||'Bhargav';
    let ap=null, fetched=false;
    try{
      const user=firebase.auth&&firebase.auth().currentUser;
      if(user){
        const snap=await firebase.firestore().collection('users').doc(user.uid).collection('hub-profiles').doc(canon).collection('data').doc('appearance').get();
        if(snap.exists)ap=JSON.parse(snap.data().json||'{}');
        fetched=true;
      }
    }catch(e){}
    if(!fetched){ const c=readCache(canon); if(c){ applyVars(c); return c; } }
    ap=ap||{};
    const v=Object.assign({},(ap.mode&&ap.mode.indexOf('palette-')===0?paletteVars(ap.mode):MODES[ap.mode])||MODES.light);
    const wp=ap.wallpaper&&ap.wallpaper.css;
    if(wp)v.bg=wp;
    applyVars(v);
    writeCache(canon,v);
    document.documentElement.classList.toggle('wallpaper-live',!!(ap.wallpaper&&/^(aurora|ember|tide)$/.test(ap.wallpaper.id||'')));
    return v;
  }
  // Paint the last-known look immediately (before Firebase answers) so a dark theme never flashes light.
  applyCached();
  global.HubTheme={applyHubTheme,applyHubAppearance,applyCached,writeCache,readableOn,deriveShades,hexToRgb,rgbToHsl,hslToHex};
})(window);

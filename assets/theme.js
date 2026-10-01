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
    return sh;
  }
  global.HubTheme={applyHubTheme,deriveShades,hexToRgb,rgbToHsl,hslToHex};
})(window);

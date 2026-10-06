/* =====================================================================
   Schedule categories — one editable list shared by the Schedule app and
   the Calendar app. Routine, Gym, Meal, LeetCode, Study, Teaching, Admin
   and Sleep, plus Class / Chore / Free / Other so every block lands
   somewhere. Each category has a name, a colour and a list of keywords;
   a block belongs to the first category whose keyword it contains.

   Definitions are saved per profile at
     users/{uid}/schedule-profiles/{profile}/data/categories
   (the same place Schedule keeps that profile's routine), so an edit made
   in either app shows up in both. Which categories are *shown* is a
   per-device view preference kept in localStorage (each app has its own
   key), so hiding Sleep in the grid never changes the schedule itself.
===================================================================== */
(function(global){
  const BUILTIN = [
    {key:'sleep',  label:'Sleep',    color:'#6D28D9', words:['=sleep']},
    {key:'free',   label:'Free',     color:'#A8A29E', words:['free / flexible','flexible time','open/reset']},
    {key:'admin',  label:'Admin',    color:'#52525B', words:['github','linkedin','plan the next day','final review','check assignments','prepare for sleep']},
    {key:'code',   label:'LeetCode', color:'#EA580C', words:['leetcode']},
    {key:'fitness',label:'Gym',      color:'#16A34A', words:['gym','home workout','travel to gym','travel home']},
    {key:'meal',   label:'Meal',     color:'#B45309', words:['breakfast','lunch','dinner','snack','social break']},
    {key:'class',  label:'Class',    color:'#DB2777', words:['cs #','math #','comp #']},
    {key:'teach',  label:'Teaching', color:'#0F766E', words:['teaching']},
    {key:'chore',  label:'Chore',    color:'#7C6A2E', words:['laundry','trash','costco','trader joe','groceries','washer','dryer','clothes','dishwashing','house cleaning']},
    {key:'routine',label:'Routine',  color:'#57606A', words:['daily break','bath','get ready','food preparation']},
    {key:'study',  label:'Study',    color:'#2563EB', words:['study','review']},
    {key:'other',  label:'Other',    color:'#78716C', words:[]}
  ];
  // Display order in chips/panels: the eight the user asked for first.
  const DISPLAY_ORDER = ['routine','fitness','meal','code','study','teach','admin','sleep','class','chore','free','other'];

  let pins = {};             // activity (lowercase) -> category key: a block you filed by hand
  let saved = {};            // key -> {label,color,words} overrides, plus customs
  let customOrder = [];      // keys of user-made categories, in creation order
  let hidden = new Set();    // category keys currently hidden in this app's views
  let cfg = {filterKey:'sched-cat-hidden', save:null, getActivities:null, onChange:null};
  let rxCache = {};

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function mixWhite(hex, amt){
    hex = String(hex||'#78716C').replace('#','');
    if(hex.length===3) hex = hex.split('').map(function(c){ return c+c; }).join('');
    const n = parseInt(hex,16)||0, r = n>>16&255, g = n>>8&255, b = n&255;
    const m = function(v){ return Math.round(v+(255-v)*amt); };
    return '#'+[m(r),m(g),m(b)].map(function(v){ return v.toString(16).padStart(2,'0'); }).join('');
  }
  function all(){
    const out = BUILTIN.map(function(b){
      const o = saved[b.key]||{};
      return {key:b.key, builtin:true, label:o.label||b.label, color:o.color||b.color, words:Array.isArray(o.words)?o.words:b.words.slice()};
    });
    customOrder.forEach(function(k){
      const o = saved[k]; if(!o) return;
      out.push({key:k, builtin:false, label:o.label||'New category', color:o.color||'#0EA5E9', words:Array.isArray(o.words)?o.words:[]});
    });
    return out;
  }
  function list(){
    const a = all();
    return a.slice().sort(function(x,y){
      const ix = DISPLAY_ORDER.indexOf(x.key), iy = DISPLAY_ORDER.indexOf(y.key);
      return (ix<0?99:ix)-(iy<0?99:iy);
    });
  }
  function meta(key){
    const c = all().find(function(x){ return x.key===key; }) || all().find(function(x){ return x.key==='other'; });
    return {label:c.label, color:c.color, soft:mixWhite(c.color,0.88), key:c.key};
  }
  function wordRegex(w){
    if(rxCache[w]) return rxCache[w];
    let p = String(w).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/#/g,'\\d');
    if(/^\w/.test(p)) p = '\\b'+p;
    return (rxCache[w] = new RegExp(p));
  }
  function categorize(activity){
    const a = String(activity||'').trim().toLowerCase();
    if(!a) return 'other';
    if(pins[a] && all().some(function(c){ return c.key===pins[a]; })) return pins[a];
    const cats = all();
    // 1) exact matches ("=sleep"), 2) your own categories, 3) built-ins in order
    for(const c of cats){ if(c.words.some(function(w){ return w.charAt(0)==='=' && w.slice(1).trim().toLowerCase()===a; })) return c.key; }
    const ordered = cats.filter(function(c){ return !c.builtin; }).concat(cats.filter(function(c){ return c.builtin; }));
    for(const c of ordered){
      if(c.key==='other') continue;
      if(c.words.some(function(w){ return w && w.charAt(0)!=='=' && wordRegex(w).test(a); })) return c.key;
    }
    return 'other';
  }

  /* ---------- show / hide (per device, per app) ---------- */
  function loadHidden(){
    try{ const v = JSON.parse(localStorage.getItem(cfg.filterKey)); if(Array.isArray(v)) hidden = new Set(v); }catch(e){}
  }
  function saveHidden(){ try{ localStorage.setItem(cfg.filterKey, JSON.stringify([...hidden])); }catch(e){} }
  function isVisible(key){ return !hidden.has(key); }
  function anyHidden(){ return hidden.size>0; }
  function showAll(){ hidden.clear(); saveHidden(); }
  function setVisible(key, on){ if(on) hidden.delete(key); else hidden.add(key); saveHidden(); }
  function only(key){ hidden = new Set(all().map(function(c){ return c.key; }).filter(function(k){ return k!==key; })); saveHidden(); }
  // Chip click: with nothing hidden, isolate that category (the original
  // behaviour); otherwise toggle just that one.
  function chipClick(key, presentKeys){
    if(!hidden.size){
      hidden = new Set((presentKeys||all().map(function(c){ return c.key; })).filter(function(k){ return k!==key; }));
    }else if(hidden.has(key)) hidden.delete(key);
    else hidden.add(key);
    // Everything present is hidden → treat as "show all" rather than a blank screen.
    if(presentKeys && presentKeys.every(function(k){ return hidden.has(k); })) hidden.clear();
    saveHidden();
  }

  /* ---------- chips ---------- */
  function chipsHtml(presentKeys, opts){
    opts = opts||{};
    const keys = presentKeys && presentKeys.length ? presentKeys : all().map(function(c){ return c.key; });
    const shown = list().filter(function(c){ return keys.indexOf(c.key)>=0; });
    let h = shown.map(function(c){
      const on = isVisible(c.key), m = meta(c.key);
      const solid = on && hidden.size>0;
      return '<button type="button" class="cat-chip sc-chip'+(on?'':' sc-off')+(solid?' cat-chip-active':'')+'" data-sccat="'+esc(c.key)+'" title="'+(on?'Click to hide/isolate':'Hidden — click to show')+'" style="background:'+(solid?m.color:m.soft)+';color:'+(solid?'#fff':m.color)+';">'+esc(m.label)+'</button>';
    }).join('');
    if(hidden.size) h += '<button type="button" class="cat-chip sc-chip sc-all" data-scall="1">Show all</button>';
    if(opts.edit!==false) h += '<button type="button" class="cat-chip sc-chip sc-edit" data-scedit="1" title="Edit categories">⚙ Edit</button>';
    return '<div class="sc-chiprow">'+h+'</div>';
  }
  // One delegated listener; apps pass the keys currently on screen via data-scpresent on a wrapper.
  document.addEventListener('click', function(e){
    const chip = e.target.closest('[data-sccat]');
    const allBtn = e.target.closest('[data-scall]');
    const editBtn = e.target.closest('[data-scedit]');
    if(!chip && !allBtn && !editBtn) return;
    if(editBtn){ openEditor(); return; }
    if(allBtn){ showAll(); changed(); return; }
    const wrap = chip.closest('[data-scpresent]');
    const present = wrap ? wrap.dataset.scpresent.split(',').filter(Boolean) : null;
    chipClick(chip.dataset.sccat, present);
    changed();
  });

  /* ---------- persistence ---------- */
  function serialize(){ return {v:2, saved:saved, customOrder:customOrder, pins:pins}; }
  function hydrate(obj){
    saved = {}; customOrder = []; pins = {}; rxCache = {};
    if(obj && typeof obj==='object'){
      if(obj.saved && typeof obj.saved==='object') saved = obj.saved;
      if(obj.pins && typeof obj.pins==='object') pins = obj.pins;
      if(Array.isArray(obj.customOrder)) customOrder = obj.customOrder.filter(function(k){ return saved[k]; });
    }
  }
  async function persist(){ rxCache = {}; if(cfg.save){ try{ await cfg.save(serialize()); }catch(e){ console.error('categories save failed', e); } } }
  function changed(){ if(cfg.onChange) cfg.onChange(); }
  function init(opts){ cfg = Object.assign(cfg, opts||{}); loadHidden(); ensureStyle(); }

  /* ---------- editor ---------- */
  function ensureStyle(){
    if(document.getElementById('sc-style')) return;
    const s = document.createElement('style'); s.id = 'sc-style';
    s.textContent =
      '.sc-chiprow{display:flex;flex-wrap:wrap;gap:6px;align-items:center}'+
      '.sc-chip{font:inherit;font-size:11.5px;font-weight:700;border-radius:20px;padding:5px 11px;border:none;cursor:pointer;transition:transform .1s ease}.sc-chip:hover{transform:translateY(-1px)}'+
      '.sc-chip.cat-chip-active{box-shadow:0 2px 8px rgba(0,0,0,.18)}'+
      '.sc-chip.sc-off{opacity:.45;text-decoration:line-through}'+
      '.sc-chip.sc-all,.sc-chip.sc-edit{background:var(--surface-alt,#f1f1ec)!important;color:var(--text-soft,#74766f)!important}'+
      '.sc-wrap{position:fixed;inset:0;z-index:400;background:rgba(15,15,12,.45);display:flex;align-items:flex-start;justify-content:center;padding:4vh 14px;overflow:auto}'+
      '.sc-modal{width:min(640px,100%);background:var(--surface,#fff);color:var(--text,#20211e);border:1px solid var(--border,#e3e3dc);border-radius:18px;padding:18px 18px 16px;box-shadow:0 24px 60px rgba(0,0,0,.25);font:14px/1.45 Inter,system-ui,sans-serif}'+
      '.sc-modal h2{margin:0;font-size:18px}.sc-modal h3{margin:18px 0 6px;font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:var(--text-soft,#74766f)}'+
      '.sc-head{display:flex;justify-content:space-between;align-items:center;gap:10px}'+
      '.sc-x{border:0;background:var(--surface-alt,#f1f1ec);border-radius:10px;width:32px;height:32px;font-size:18px;cursor:pointer;color:inherit}'+
      '.sc-sub{color:var(--text-soft,#74766f);font-size:12.5px;margin:2px 0 0}'+
      '.sc-row{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--border-soft,#ececE6)}'+
      '.sc-row:last-child{border:0}.sc-dot{width:12px;height:12px;border-radius:4px;display:inline-block;margin-right:8px;vertical-align:-1px}'+
      '.sc-row label{display:flex;align-items:center;gap:8px;cursor:pointer}'+
      '.sc-mini{border:0;background:var(--surface-alt,#f1f1ec);color:var(--text-soft,#74766f);border-radius:8px;padding:5px 9px;font-size:12px;font-weight:700;cursor:pointer}'+
      '.sc-edit-row{display:grid;grid-template-columns:44px 1fr;gap:8px 10px;padding:10px 0;border-bottom:1px solid var(--border-soft,#ececE6)}'+
      '.sc-edit-row input[type=color]{width:44px;height:36px;padding:2px;border:1px solid var(--border,#e3e3dc);border-radius:9px;background:none}'+
      '.sc-edit-row input[type=text],.sc-unsorted select{width:100%;padding:8px 10px;border:1px solid var(--border,#e3e3dc);border-radius:9px;font:inherit;background:var(--surface,#fff);color:inherit}'+
      '.sc-edit-row .sc-kw{grid-column:2}.sc-edit-row .sc-actions{grid-column:2;display:flex;gap:6px;justify-content:space-between;align-items:center}'+
      '.sc-hint{font-size:11.5px;color:var(--text-faint,#9c9e97)}'+
      '.sc-search{width:100%;padding:8px 10px;border:1px solid var(--border,#e3e3dc);border-radius:9px;font:inherit;margin:8px 0 4px;background:var(--surface,#fff);color:inherit}.sc-blocks{max-height:360px;overflow:auto}'+
      '.sc-unsorted{display:grid;grid-template-columns:1fr 150px;gap:8px;align-items:center;padding:6px 0}'+
      '.sc-primary{border:0;background:var(--accent,#ad7b20);color:#fff;border-radius:11px;padding:9px 14px;font-weight:700;cursor:pointer;font:inherit;font-weight:700}'+
      '.sc-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}'+
      '@media(max-width:560px){.sc-wrap{padding:0}.sc-modal{border-radius:0;min-height:100%}.sc-unsorted{grid-template-columns:1fr}}';
    document.head.appendChild(s);
  }
  function blockList(){
    let acts = [];
    try{ acts = (cfg.getActivities && cfg.getActivities()) || []; }catch(e){}
    const seen = {}, out = [];
    acts.forEach(function(a){ const k = String(a||'').trim(); if(!k) return; const lk = k.toLowerCase(); if(seen[lk]) return; seen[lk]=1; out.push({name:k, cat:categorize(k), pinned:pins[lk]||''}); });
    const order = list().map(function(c){ return c.key; });
    // Unsorted ("Other") first so they are the first thing you see, then by category, then A–Z.
    return out.sort(function(x,y){
      const ox = x.cat==='other'?-1:order.indexOf(x.cat), oy = y.cat==='other'?-1:order.indexOf(y.cat);
      return ox-oy || x.name.localeCompare(y.name);
    });
  }
  function openEditor(){
    ensureStyle();
    let blockSearch = '';
    let host = document.getElementById('sc-host');
    if(!host){ host = document.createElement('div'); host.id = 'sc-host'; document.body.appendChild(host); }
    const render = function(){
      const cats = list();
      const rows = cats.map(function(c){
        const m = meta(c.key);
        return '<div class="sc-row"><label><input type="checkbox" data-vis="'+esc(c.key)+'" '+(isVisible(c.key)?'checked':'')+'><span><i class="sc-dot" style="background:'+m.color+'"></i>'+esc(m.label)+'</span></label><span></span><button type="button" class="sc-mini" data-only="'+esc(c.key)+'">Only this</button></div>';
      }).join('');
      const edits = cats.map(function(c){
        const isOther = c.key==='other';
        return '<div class="sc-edit-row" data-ek="'+esc(c.key)+'">'+
          '<input type="color" data-f="color" value="'+esc(c.color)+'" aria-label="Colour">'+
          '<input type="text" data-f="label" value="'+esc(c.label)+'" aria-label="Name">'+
          (isOther?'<div class="sc-kw sc-hint">Everything that matches no other category lands here.</div>':
          '<div class="sc-kw"><input type="text" data-f="words" value="'+esc(c.words.join(', '))+'" placeholder="Keywords, comma separated"><div class="sc-hint">A block goes here if its name contains one of these. Use # for a digit, and = for an exact name.</div></div>')+
          '<div class="sc-actions"><span class="sc-hint">'+(c.builtin?'Built in':'Your category')+'</span>'+(c.builtin?'<button type="button" class="sc-mini" data-reset="'+esc(c.key)+'">Reset</button>':'<button type="button" class="sc-mini" data-del="'+esc(c.key)+'">Delete</button>')+'</div></div>';
      }).join('');
      const blocks = blockList();
      const unsortedCount = blocks.filter(function(b){ return b.cat==='other'; }).length;
      const opts = function(sel){ return '<option value="__auto"'+(sel?'':' selected')+'>Automatic (by keywords)</option>'+cats.map(function(c){ return '<option value="'+esc(c.key)+'"'+(sel===c.key?' selected':'')+'>'+esc(c.label)+'</option>'; }).join(''); };
      const unsortedHtml = '<h3>Your schedule blocks</h3><p class="sc-sub">'+(unsortedCount?unsortedCount+' block'+(unsortedCount===1?' is':'s are')+' not sorted yet (shown first). ':'Every block is in a category. ✓ ')+'Pick a category to file any block by hand; it overrides the keywords.</p>'+
        (blocks.length?'<input type="text" id="sc-blocksearch" class="sc-search" placeholder="Search your blocks…" value="'+esc(blockSearch)+'">'+
        '<div class="sc-blocks">'+blocks.map(function(b,i){
          const m = meta(b.cat);
          return '<div class="sc-unsorted" data-bname="'+esc(b.name.toLowerCase())+'" style="'+(blockSearch && b.name.toLowerCase().indexOf(blockSearch.toLowerCase())<0?'display:none':'')+'"><span><i class="sc-dot" style="background:'+m.color+'"></i>'+esc(b.name)+(b.pinned?' <span class="sc-hint">· set by you</span>':'')+'</span><select data-assign="'+i+'">'+opts(b.pinned)+'</select></div>';
        }).join('')+'</div>':'<p class="sc-sub">No schedule blocks found yet.</p>');
      host.innerHTML = '<div class="sc-wrap" id="sc-wrap"><div class="sc-modal" role="dialog" aria-label="Schedule categories">'+
        '<div class="sc-head"><div><h2>Categories & filters</h2><p class="sc-sub">Choose what to show, and edit how blocks are sorted.</p></div><button type="button" class="sc-x" id="sc-close" aria-label="Close">×</button></div>'+
        '<h3>Show on the schedule</h3><div style="display:flex;gap:8px;margin-bottom:4px"><button type="button" class="sc-mini" id="sc-showall">Show all</button></div>'+rows+
        '<h3>Edit categories</h3>'+edits+
        '<div style="margin-top:10px"><button type="button" class="sc-mini" id="sc-add">+ Add a category</button></div>'+
        unsortedHtml+
        '<div class="sc-foot"><button type="button" class="sc-primary" id="sc-done">Done</button></div></div></div>';
      wire(blocks);
    };
    const wire = function(blocks){
      const q = function(s){ return host.querySelector(s); };
      const close = function(){ host.innerHTML = ''; };
      q('#sc-close').onclick = close; q('#sc-done').onclick = close;
      q('#sc-wrap').addEventListener('mousedown', function(e){ if(e.target.id==='sc-wrap') close(); });
      q('#sc-showall').onclick = function(){ showAll(); changed(); render(); };
      host.querySelectorAll('[data-vis]').forEach(function(cb){ cb.onchange = function(){ setVisible(cb.dataset.vis, cb.checked); changed(); }; });
      host.querySelectorAll('[data-only]').forEach(function(b){ b.onclick = function(){ only(b.dataset.only); changed(); render(); }; });
      host.querySelectorAll('.sc-edit-row').forEach(function(row){
        const key = row.dataset.ek;
        row.querySelectorAll('[data-f]').forEach(function(inp){
          inp.onchange = async function(){
            const c = all().find(function(x){ return x.key===key; });
            const o = saved[key] = Object.assign({label:c.label,color:c.color,words:c.words.slice()}, saved[key]||{});
            if(inp.dataset.f==='words') o.words = inp.value.split(',').map(function(w){ return w.trim(); }).filter(Boolean);
            else if(inp.dataset.f==='label') o.label = inp.value.trim() || c.label;
            else o.color = inp.value;
            await persist(); changed(); render();
          };
        });
      });
      host.querySelectorAll('[data-reset]').forEach(function(b){ b.onclick = async function(){ delete saved[b.dataset.reset]; await persist(); changed(); render(); }; });
      host.querySelectorAll('[data-del]').forEach(function(b){ b.onclick = async function(){
        const k = b.dataset.del; if(!confirm('Delete this category? Its blocks go back to their built-in category.')) return;
        delete saved[k]; customOrder = customOrder.filter(function(x){ return x!==k; }); Object.keys(pins).forEach(function(a){ if(pins[a]===k) delete pins[a]; }); hidden.delete(k); saveHidden(); await persist(); changed(); render();
      }; });
      q('#sc-add').onclick = async function(){
        const k = 'custom-'+Date.now().toString(36);
        saved[k] = {label:'New category', color:'#0EA5E9', words:[]}; customOrder.push(k); await persist(); changed(); render();
      };
      host.querySelectorAll('[data-assign]').forEach(function(sel){
        sel.onchange = async function(){
          const b = blocks[Number(sel.dataset.assign)]; if(!b) return;
          const k = b.name.toLowerCase();
          if(sel.value==='__auto') delete pins[k]; else pins[k] = sel.value;
          await persist(); changed(); render();
        };
      });
      const bs = q('#sc-blocksearch');
      if(bs) bs.oninput = function(){
        blockSearch = bs.value; const needle = blockSearch.toLowerCase();
        host.querySelectorAll('.sc-unsorted[data-bname]').forEach(function(r){ r.style.display = (!needle || r.dataset.bname.indexOf(needle)>=0) ? '' : 'none'; });
      };
    };
    render();
  }

  global.SchedCats = {init:init, hydrate:hydrate, serialize:serialize, list:list, meta:meta, categorize:categorize,
    isVisible:isVisible, anyHidden:anyHidden, showAll:showAll, chipsHtml:chipsHtml, openEditor:openEditor, mixWhite:mixWhite, all:all};
})(window);

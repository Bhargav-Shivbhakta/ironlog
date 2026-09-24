const FIREBASE_CONFIG={apiKey:"AIzaSyBe01eR2RZwSbU_aoJMeh_2MMJ5mqkVuKk",authDomain:"iron-log-bfc55.firebaseapp.com",projectId:"iron-log-bfc55",storageBucket:"iron-log-bfc55.firebasestorage.app",messagingSenderId:"106586808946",appId:"1:106586808946:web:f4736554ba9fc82c6fd8eb"};
firebase.initializeApp(FIREBASE_CONFIG);
const auth=firebase.auth(),db=firebase.firestore();
try{db.enablePersistence({synchronizeTabs:true}).catch(()=>{});}catch(e){}

const state={user:null,profile:null,templates:{},events:[],personalTasks:[],sharedTasks:[],chores:[],choreHistory:[],dailyLog:null,apps:[],categories:{},order:[],hidden:[]};
const PROFILE_KEY='hub-active-profile',DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const $=id=>document.getElementById(id);
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const safeJson=(value,fallback)=>{try{return value?JSON.parse(value):fallback}catch(e){return fallback}};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time12=value=>{if(!value)return'Anytime';const [h,m]=value.split(':').map(Number),p=h>=12?'PM':'AM',hh=h%12||12;return hh+(m?':'+String(m).padStart(2,'0'):'')+' '+p};
const minutes=value=>{if(!value)return 9999;const [h,m]=value.split(':').map(Number);return h*60+m};
const addDays=(date,n)=>{const d=new Date(date+'T00:00:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};

function profileRef(group,key){return db.collection('users').doc(state.user.uid).collection(group).doc(state.profile).collection('data').doc(key)}
function appRef(app,key){return db.collection('users').doc(state.user.uid).collection('apps').doc(app).collection('data').doc(key)}
function sharedTodoRef(){return db.collection('users').doc(state.user.uid).collection('todo-shared').doc('tasks')}
function hubRef(key){return db.collection('users').doc(state.user.uid).collection('apps').doc('hub').collection('data').doc(key)}
async function readJson(ref,fallback=[]){try{const snap=await ref.get();return snap.exists?safeJson(snap.data().json,fallback):fallback}catch(e){console.warn(e);return fallback}}

function setGate(name){['loading','auth','profile'].forEach(x=>$(x+'-gate').hidden=x!==name);$('app-shell').hidden=!!name}
function setProfile(name){state.profile=name;localStorage.setItem(PROFILE_KEY,name);document.body.dataset.profile=name;$('sidebar-profile').textContent=name;$('sidebar-avatar').textContent=name[0];$('sidebar-avatar').className='avatar '+name.toLowerCase();$('mobile-profile').textContent=name[0];$('mobile-profile').className='avatar '+name.toLowerCase();updateProfileLinks()}
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
  { file: 'jobs.html', title: 'Job Tracker' },
  { file: 'diet.html', title: 'Diet Tracker' },
  { file: 'calendar.html', title: 'Calendar' }
];
const ICONS = {
  'grocery.html': 'tile-icons/grocery.png', 'schedule.html': 'tile-icons/schedule.png',
  'todo.html': 'tile-icons/todo.png', 'skin.html': 'tile-icons/skin.png',
  'chores.html': 'tile-icons/chores.png', 'jobs.html': 'tile-icons/jobs.png',
  'diet.html': 'tile-icons/diet.png', 'calendar.html': 'tile-icons/calendar.png'
};
// Sensible defaults for the apps that already exist — anything genuinely
// new (not in this list) has no default and lands in "uncategorized"
// until a category is picked for it.
const DEFAULT_CATEGORY = {
  'schedule.html':'planner', 'todo.html':'planner', 'calendar.html':'planner', 'clock.html':'planner', 'jobs.html':'planner',
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
  const [categories,order,hidden] = await Promise.all([
    readJson(hubRef('categories'), {}), readJson(hubRef('order'), []), readJson(hubRef('hidden'), [])
  ]);
  state.categories = categories; state.order = order; state.hidden = hidden;
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
  apps.forEach(a => {
    const isHidden = state.hidden.includes(a.file);
    if(isHidden && !editMode[cat]) return;
    const card = document.createElement('a');
    card.className = 'app-card' + (isHidden ? ' hidden-card' : '');
    card.href = 'apps/'+a.file + (state.profile ? '?profile='+encodeURIComponent(state.profile) : '');
    card.draggable = editMode[cat];
    card.dataset.file = a.file;
    const iconHtml = a.icon ? '<img src="'+a.icon+'" alt="">' : '<i data-lucide="layout-grid"></i>';
    card.innerHTML = '<span class="app-icon">'+iconHtml+'</span><strong>'+esc(a.title)+'</strong>'+
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
  Object.assign(state,{templates,events,personalTasks:personal,sharedTasks:shared,chores,choreHistory,dailyLog,apps});
  renderDashboard();renderAllCategoryPages();startHubClock();setGate(null);showRoute(location.hash.replace('#','')||'today');
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
  $('insight-open').textContent=tasks.length;$('insight-blocks').textContent=timeline.length;
  const sevenDaysAgo=new Date();sevenDaysAgo.setDate(sevenDaysAgo.getDate()-6);const from=sevenDaysAgo.getFullYear()+'-'+String(sevenDaysAgo.getMonth()+1).padStart(2,'0')+'-'+String(sevenDaysAgo.getDate()).padStart(2,'0');
  $('insight-completed').textContent=state.personalTasks.concat(state.sharedTasks).filter(t=>t.done&&t.completedOn&&t.completedOn>=from).length;
  $('chores-status').textContent=chores.length?chores.length+' chore'+(chores.length===1?'':'s')+' due today':'No chores due';
  renderTimeline(timeline);renderTasks(tasks.slice(0,5));renderChoresList(chores);renderTraining();
}
function renderTimeline(items){
  const el=$('today-timeline');if(!items.length){el.innerHTML='<div class="empty-state"><strong>No scheduled blocks</strong>Your day is open. Add plans from the schedule.</div>';return}
  el.innerHTML=items.slice(0,9).map(x=>'<div class="timeline-row '+(x.kind==='event'?'':'muted')+'"><span class="timeline-time">'+esc(time12(x.time))+'</span><span class="timeline-dot"></span><span class="timeline-content"><strong>'+esc(x.title)+'</strong><small>'+(x.end?esc(time12(x.time)+' – '+time12(x.end)):(x.notes?esc(x.notes):x.kind==='event'?'Event':'Routine'))+'</small></span></div>').join('');
}
function renderTasks(items){
  const el=$('today-tasks');if(!items.length){el.innerHTML='<div class="empty-state"><strong>You are caught up</strong>No open tasks are due today.</div>';return}
  el.innerHTML=items.map(t=>'<div class="task-row" data-task-id="'+esc(t.id)+'"><button class="task-check" type="button" aria-label="Complete '+esc(t.title)+'"><i data-lucide="check"></i></button><span class="task-copy"><strong>'+esc(t.title)+'</strong><small>'+(t._shared?'Shared':esc(t.listId||'Personal'))+(t.dueTime?' · '+esc(time12(t.dueTime)):'')+'</small></span>'+(t.priority?'<span class="priority-mark">'+(t.priority>1?'Urgent':'Important')+'</span>':'')+'</div>').join('');
  lucide.createIcons();el.querySelectorAll('.task-check').forEach(btn=>btn.addEventListener('click',()=>completeTask(btn.closest('.task-row').dataset.taskId)));
}
function renderChoresList(chores){
  const el=$('today-chores-list');
  if(!chores.length){ el.innerHTML='<div class="empty-state"><strong>Nothing due</strong>No chores need attention today.</div>'; return; }
  el.innerHTML = chores.map(c => '<div class="chores-mini-row'+(c.overdue?' overdue':'')+'"><span>'+esc(c.name)+'</span><span>'+(c.overdue?'Overdue':'Due today')+'</span></div>').join('');
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
function renderTraining(){$('training-status').textContent=state.dailyLog?"Today's check-in is started":"Open today's workout"}

/* =====================================================================
   CLOCK WIDGET
===================================================================== */
let clockTimer = null;
function startHubClock(){
  if(clockTimer) clearInterval(clockTimer);
  const tick = () => {
    const now = new Date();
    let h = now.getHours(); const period = h>=12?'PM':'AM'; h = h%12||12;
    const m = String(now.getMinutes()).padStart(2,'0'), s = String(now.getSeconds()).padStart(2,'0');
    $('hub-clock').firstChild.textContent = h+':'+m+':'+s+' '+period+' ';
    $('hub-clock-date').textContent = now.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
  };
  tick(); clockTimer = setInterval(tick, 1000);
}

/* =====================================================================
   ROUTING
===================================================================== */
function showRoute(route){if(!['today','planner','health','home','insights'].includes(route))route='today';document.querySelectorAll('[data-page]').forEach(p=>p.classList.toggle('active',p.dataset.page===route));document.querySelectorAll('[data-route]').forEach(b=>b.classList.toggle('active',b.dataset.route===route));if(location.hash!=='#'+route)history.replaceState(null,'','#'+route);window.scrollTo({top:0,behavior:'smooth'})}
document.querySelectorAll('[data-route]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();showRoute(el.dataset.route)}));
window.addEventListener('hashchange',()=>showRoute(location.hash.replace('#','')));

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

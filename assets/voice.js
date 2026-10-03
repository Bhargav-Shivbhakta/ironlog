/* =====================================================================
   JARVIS — wake-word voice control for the Hub.

   Built entirely on the browser's own Web Speech API (SpeechRecognition
   for listening, SpeechSynthesis for talking back) — no server, no
   external service of ours involved. Real limits worth knowing, since
   "like Jarvis" sets a high bar:
     - No true OS-level background listening. The mic only works while
       this tab/app is actually open and not suspended — not after the
       screen locks, not if the window is fully closed. It is NOT a
       system-wide assistant.
     - The audio is sent to the browser's own speech-to-text service
       (Google's, in Chrome/Edge) to be turned into text — it is not
       transcribed locally on-device. There is no other third party
       involved, but it isn't fully offline either.
     - It's opt-in only (off by default, toggled in Settings), and
       Chrome/Edge always show their own mic-in-use indicator while it's
       listening — that's the browser's own privacy affordance, not
       something this app can hide or override.
     - Wake-word detection here just means: keep transcribing everything
       continuously, and only *act* on speech that contains "jarvis".
       There's no dedicated low-power hotword engine like a real smart
       speaker uses, so continuous recognition does use some CPU/battery
       and occasionally needs to silently restart itself (Chrome's
       SpeechRecognition times out after periods of silence) — handled
       below via onend auto-restart, invisible to you.

   Commands understood (see handleVoiceCommand): opening any app by name,
   going back to today/closing the open app, adding a task, reading back
   a quick summary (next event / tasks remaining), "what can you do", and
   "stop listening". This is a first real set, not literally "everything"
   — new commands are easy to add to COMMAND rules below as you find
   things you want it to do.
===================================================================== */
const VOICE_KEY='hub-voice-enabled';
let voiceEnabled=localStorage.getItem(VOICE_KEY)==='1';
let voiceRecognition=null;
let voiceAwaitingCommand=false;
let voiceAwaitingTimer=null;
let voiceCachedVoices=[];
let voiceLastSpoken='';

function voiceSupported(){ return !!(window.SpeechRecognition||window.webkitSpeechRecognition); }

if(window.speechSynthesis){
  const refreshVoices=()=>{ voiceCachedVoices=window.speechSynthesis.getVoices()||[]; };
  refreshVoices();
  window.speechSynthesis.onvoiceschanged=refreshVoices;
}

function voiceSetState(s){
  const btn=document.getElementById('jarvis-btn');
  if(btn) btn.dataset.state=s;
}

function speak(text,opts){
  try{
    if(!window.speechSynthesis){ return; }
    if(!(opts&&opts.isRepeat)) voiceLastSpoken=text;
    window.speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(text);
    // Prefer a deeper/calmer English voice for a bit of a Jarvis feel when
    // one happens to be installed; otherwise just use whatever default
    // English voice the browser already has. Never a hard requirement.
    const preferred=voiceCachedVoices.find(v=>/Daniel|Google UK English Male|Microsoft (Guy|Ryan)/i.test(v.name))
      || voiceCachedVoices.find(v=>/^en/i.test(v.lang));
    if(preferred) u.voice=preferred;
    u.rate=1.0; u.pitch=0.92;
    voiceSetState('speaking');
    u.onend=()=>voiceSetState(voiceRecognition?'listening-wake':'idle');
    u.onerror=()=>voiceSetState(voiceRecognition?'listening-wake':'idle');
    window.speechSynthesis.speak(u);
  }catch(e){}
}

// Each app the Hub can open by voice, plus the words that should trigger
// it. Add a new app here and voice nav picks it up automatically — no
// other code needs to change.
const VOICE_APPS=[
  {keys:['gym','training','workout','lifting','weights'],url:'gym/index.html',title:'Gym'},
  {keys:['diet','nutrition','food','meals','calories'],url:'apps/diet.html',title:'Diet'},
  {keys:['to do','to-do','todo','tasks','task list'],url:'apps/todo.html',title:'To-Do'},
  {keys:['schedule','planner','routine','my day'],url:'apps/schedule.html',title:'Schedule'},
  {keys:['grocery','groceries','shopping list','shopping'],url:'apps/grocery.html',title:'Grocery'},
  {keys:['chores','household','cleaning'],url:'apps/chores.html',title:'Chores'},
  {keys:['skin','skincare','skin care'],url:'apps/skin.html',title:'Skin'},
  {keys:['calendar','events'],url:'apps/calendar.html',title:'Calendar'},
  {keys:['clock','timer','focus','stopwatch','alarm'],url:'apps/clock.html',title:'Clock'}
];
const THEME_MODES_NAMES={light:'Light',dark:'Dark',midnight:'Midnight',sepia:'Sepia'};
const VOICE_ROUTES=[
  {keys:['settings','preferences'],route:'settings'},
  {keys:['insights','stats','analytics'],route:'insights'}
];

function voiceOpenApp(target){
  if(!state.user||!state.profile) return;
  const url=target.url+'?profile='+encodeURIComponent(state.profile);
  openAppFrame(url,target.title);
}

async function voiceAddTask(title){
  title=(title||'').trim().replace(/[.?!]+$/,'');
  if(!title){ speak("I didn't catch what to add — try again."); return; }
  if(!state.user||!state.profile){ speak("I can't add that right now."); return; }
  const task={id:'task-'+Date.now()+'-'+Math.floor(Math.random()*1000),title,done:false,priority:0,startDate:today(),due:null,dueTime:null,repeat:'none',notes:'',link:'',tags:[],subtasks:[],listId:'personal',createdBy:state.profile,order:Date.now(),createdAt:new Date().toISOString()};
  state.personalTasks.push(task);
  try{
    await profileRef('todo-profiles','tasks').set({json:JSON.stringify(state.personalTasks),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    if(typeof renderDashboard==='function') renderDashboard();
    speak('Added "'+title+'" to your tasks.');
  }catch(e){
    state.personalTasks.pop();
    speak("I couldn't save that — try again.");
  }
}

async function voiceAddNote(text){
  text=(text||'').trim();
  if(!text){ speak("I didn't catch what to note down."); return; }
  if(typeof hubStickyNotes==='undefined'){ speak("Notes aren't available right now."); return; }
  hubStickyNotes.unshift({id:'note-'+Date.now(),text,color:HUB_NOTE_COLORS[Math.floor(Math.random()*HUB_NOTE_COLORS.length)]});
  try{
    await saveHubStickyNotes();
    document.querySelectorAll('[data-widget-type="notes"] .widget-card-body').forEach(el=>renderNotesWidgetInto(el));
    speak('Noted: "'+text+'"');
  }catch(e){
    hubStickyNotes.shift();
    speak("I couldn't save that note — try again.");
  }
}

// Switching profile by voice is a convenience, not a security boundary —
// same as the sidebar's own profile switcher, anyone who can reach the
// Hub (or say "Hey Jarvis" near it) can already switch profiles there
// with one tap. This just does the same thing hands-free.
function voiceSwitchProfile(name){
  const target=['Bhargav','Anusha'].find(p=>p.toLowerCase()===name.toLowerCase());
  if(!target){ speak("I don't know a profile called "+name+"."); return; }
  if(state.profile===target){ speak("Already on "+target+"."); return; }
  if(typeof setProfile==='function') setProfile(target);
  if(typeof loadDashboard==='function') loadDashboard();
  speak('Switched to '+target+'.');
}

function voiceSetTheme(id,label){
  if(typeof setThemeMode!=='function'){ speak("I can't change the theme right now."); return; }
  setThemeMode(id);
  speak(label+' it is.');
}

async function voiceCompleteChore(spokenName){
  const name=(spokenName||'').trim();
  if(!name){ speak('Which chore?'); return; }
  if(typeof choresDueToday!=='function'||!state.chores){ speak("Chores aren't available right now."); return; }
  const due=choresDueToday();
  const lower=name.toLowerCase();
  const chore=due.find(c=>c.name.toLowerCase()===lower)
    || due.find(c=>c.name.toLowerCase().includes(lower)||lower.includes(c.name.toLowerCase()));
  if(!chore){ speak("I couldn't find a chore called "+name+" due today."); return; }
  const real=state.chores.find(c=>c.id===chore.id);
  if(!real){ speak("Couldn't find that chore."); return; }
  const date=typeof today==='function'?today():new Date().toISOString().slice(0,10);
  real.lastCompleted=date;
  real.snoozedUntil=null;
  state.choreHistory.unshift({id:'log-'+Date.now(),date,task:real.name,by:state.profile,rating:null,notes:null,recordedBy:state.profile});
  try{
    await appRef('chores','chores').set({json:JSON.stringify(state.chores)});
    await appRef('chores','history').set({json:JSON.stringify(state.choreHistory)});
    if(typeof renderDashboard==='function') renderDashboard();
    speak('Marked "'+real.name+'" done.');
  }catch(e){
    speak("I couldn't save that — try again.");
  }
}

function voiceSpeakTime(){
  const now=new Date();
  speak("It's "+now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})+'.');
}

function voiceSpeakSummary(){
  const next=(document.getElementById('stat-next')&&document.getElementById('stat-next').textContent.trim())||'nothing';
  const tasks=(document.getElementById('stat-tasks')&&document.getElementById('stat-tasks').textContent.trim())||'0';
  speak('Your next event is '+next+'. You have '+tasks+' task'+(tasks==='1'?'':'s')+' remaining today.');
}

function voiceHelp(){
  speak('I can open any app — say "open" and its name, like "open gym" or "open diet". '
    +'Say "add a task to" followed by what it is, or "add a note that" for a sticky note. '
    +'Say "mark" a chore "as done", "switch to Bhargav" or "Anusha", or "dark mode" to change themes. '
    +'Ask "what\'s next", "how many tasks", or "what time is it". '
    +'Say "go to today" to head back to the dashboard, or "stop listening" to turn me off.');
}

function handleVoiceCommand(rawText){
  const t=(rawText||'').toLowerCase().trim();
  if(!t) return;

  // Checked first because "switch to" is also a generic nav trigger below
  // (e.g. "switch to gym") — these two more specific "switch to X" meanings
  // need to win before the generic app/route matcher gets a chance at them.
  const profileMatch=t.match(/^switch to (bhargav|anusha)$/);
  if(profileMatch){ voiceSwitchProfile(profileMatch[1]); return; }
  const themeMatch=t.match(/^(?:switch to |turn on |use )?(dark|light|midnight|sepia)(?: mode| theme)?$/);
  if(themeMatch && /mode|theme|^switch to |^turn on |^use /.test(t)){
    const m=THEME_MODES_NAMES[themeMatch[1]];
    voiceSetTheme(themeMatch[1],m);
    return;
  }

  const choreMatch=t.match(/^(?:mark|complete|finish)\s+(?:the\s+)?(.+?)\s+(?:as\s+)?(?:done|complete|finished)$/);
  if(choreMatch){ voiceCompleteChore(choreMatch[1]); return; }

  const noteMatch=t.match(/^(?:add a note|note down|jot down|make a note)(?: that)?\s+(.+)$/);
  if(noteMatch){ voiceAddNote(noteMatch[1]); return; }

  if(/^what('?s| is) the time|^what time is it/.test(t)){ voiceSpeakTime(); return; }
  if(/^(?:say that again|repeat that|what did you say)$/.test(t)){
    if(voiceLastSpoken) speak(voiceLastSpoken,{isRepeat:true});
    else speak("I haven't said anything yet.",{isRepeat:true});
    return;
  }
  if(/^(hello|hi|hey)( jarvis)?$/.test(t)){ speak('Hello.'); return; }

  const navMatch=t.match(/^(?:please\s+)?(?:open|go to|show me|launch|switch to|take me to)\s+(.+)$/);
  if(navMatch){
    const phrase=navMatch[1];
    const app=VOICE_APPS.find(a=>a.keys.some(k=>phrase.includes(k)));
    if(app){ voiceOpenApp(app); speak('Opening '+app.title+'.'); return; }
    const route=VOICE_ROUTES.find(r=>r.keys.some(k=>phrase.includes(k)));
    if(route){ if(typeof closeAppFrame==='function') closeAppFrame(); if(typeof showRoute==='function') showRoute(route.route); speak('Opening '+route.route+'.'); return; }
    if(/today|dashboard|home screen|main screen/.test(phrase)){
      if(typeof closeAppFrame==='function') closeAppFrame();
      if(typeof showRoute==='function') showRoute('today');
      speak('Back to today.');
      return;
    }
    speak("I don't have an app called "+phrase+".");
    return;
  }

  if(/^(close|back|exit|never mind)\b/.test(t)){
    if(typeof closeAppFrame==='function') closeAppFrame();
    speak('Okay.');
    return;
  }

  const addMatch=t.match(/^(?:add (?:a )?task(?: to)?|remind me to|i need to)\s+(.+)$/);
  if(addMatch){ voiceAddTask(addMatch[1]); return; }

  if(/what('?s| is) (next|on my schedule|my day)|^summary$|what do i have (today|going on)/.test(t)){ voiceSpeakSummary(); return; }
  if(/how many tasks/.test(t)){
    const tasks=(document.getElementById('stat-tasks')&&document.getElementById('stat-tasks').textContent.trim())||'0';
    speak('You have '+tasks+' task'+(tasks==='1'?'':'s')+' remaining today.');
    return;
  }

  if(/what can you do|^help$/.test(t)){ voiceHelp(); return; }

  if(/stop listening|go to sleep|mute yourself/.test(t)){
    speak('Okay, turning off. Switch me back on in Settings whenever you want.');
    setTimeout(()=>setVoiceEnabled(false),1200);
    return;
  }

  speak("Sorry, I didn't catch a command in that.");
}

function voiceEnsureRecognition(){
  if(voiceRecognition||!voiceSupported()) return;
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  voiceRecognition=new SR();
  voiceRecognition.continuous=true;
  voiceRecognition.interimResults=false;
  voiceRecognition.lang='en-US';
  voiceRecognition.onresult=(e)=>{
    let finalText='';
    for(let i=e.resultIndex;i<e.results.length;i++){
      if(e.results[i].isFinal) finalText+=e.results[i][0].transcript;
    }
    if(!finalText) return;
    const lower=finalText.toLowerCase();
    if(voiceAwaitingCommand){
      clearTimeout(voiceAwaitingTimer);
      voiceAwaitingCommand=false;
      voiceSetState('listening-wake');
      handleVoiceCommand(finalText);
      return;
    }
    const wakeMatch=lower.match(/\b(?:hey |ok |okay )?jarvis\b[,]?\s*(.*)$/);
    if(wakeMatch){
      const rest=wakeMatch[1].trim();
      if(rest){
        handleVoiceCommand(rest);
      }else{
        voiceSetState('listening-command');
        speak('Yes?');
        voiceAwaitingCommand=true;
        voiceAwaitingTimer=setTimeout(()=>{voiceAwaitingCommand=false;voiceSetState('listening-wake');},6000);
      }
    }
  };
  voiceRecognition.onerror=(e)=>{
    if(e.error==='not-allowed'||e.error==='service-not-allowed'){
      setVoiceEnabled(false);
      if(typeof toast==='function') toast('Microphone access was denied — voice control turned off.');
    }
    // Other errors (no-speech, network hiccups, etc.) are left to onend,
    // which restarts listening automatically — Chrome's continuous mode
    // times out periodically on its own even with nothing wrong.
  };
  voiceRecognition.onend=()=>{
    if(voiceEnabled){ try{ voiceRecognition.start(); }catch(e){} }
    else{ voiceSetState('idle'); }
  };
}

function voiceUpdateSettingsUI(){
  const btn=document.getElementById('voice-toggle');
  const status=document.getElementById('voice-status');
  if(!voiceSupported()){
    if(btn){ btn.disabled=true; btn.textContent='Not supported in this browser'; }
    if(status) status.textContent='Voice control needs Chrome or Edge.';
    return;
  }
  if(btn) btn.textContent=voiceEnabled?'Turn off voice control':'Turn on voice control';
  if(status) status.textContent=voiceEnabled?'Listening for "Hey Jarvis"':'Off';
}

function setVoiceEnabled(on){
  if(on&&!voiceSupported()){
    if(typeof toast==='function') toast('Voice control needs Chrome or Edge.');
    return;
  }
  voiceEnabled=on;
  localStorage.setItem(VOICE_KEY,on?'1':'0');
  const jarvisBtn=document.getElementById('jarvis-btn');
  if(jarvisBtn) jarvisBtn.hidden=!on;
  if(on){
    voiceEnsureRecognition();
    if(voiceRecognition){ try{ voiceRecognition.start(); }catch(e){} }
    voiceSetState('listening-wake');
  }else{
    if(voiceRecognition){ try{ voiceRecognition.stop(); }catch(e){} }
    clearTimeout(voiceAwaitingTimer);
    voiceAwaitingCommand=false;
    voiceSetState('idle');
  }
  voiceUpdateSettingsUI();
}

document.addEventListener('DOMContentLoaded',()=>{
  const toggleBtn=document.getElementById('voice-toggle');
  if(toggleBtn) toggleBtn.addEventListener('click',()=>setVoiceEnabled(!voiceEnabled));
  // The floating mic button doubles as push-to-talk: a direct click skips
  // the wake word and starts listening for one command right away — a
  // reliable fallback for a noisy room or a missed "Hey Jarvis".
  const jarvisBtn=document.getElementById('jarvis-btn');
  if(jarvisBtn) jarvisBtn.addEventListener('click',()=>{
    if(!voiceRecognition) return;
    clearTimeout(voiceAwaitingTimer);
    voiceAwaitingCommand=true;
    voiceSetState('listening-command');
    speak('Yes?');
    voiceAwaitingTimer=setTimeout(()=>{voiceAwaitingCommand=false;voiceSetState('listening-wake');},6000);
  });
  voiceUpdateSettingsUI();
  if(voiceEnabled) setVoiceEnabled(true);
});

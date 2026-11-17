// Landing page for signed-out visitors (#/). Written for professors, who bring a class; students
// find "Sign in" in the header. No database reads. Motion: one passive scroll listener (rAF) for
// the hero tilt, parallax and progress line; IntersectionObserver for reveals and for running the
// demos only while they're on screen. Everything stops for "Pause motion" and reduced motion.
import { ensureCss, header, footer, mountSheet } from './lp-shell.js';

const CHECK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12l5 5L20 7" stroke="#fff" stroke-width="3.2"/></svg>';
const TICK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12l5 5L20 7" stroke="currentColor" stroke-width="2.2" style="color:var(--accent)"/></svg>';
const PLUS = '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 2v14M2 9h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="color:var(--accent)"/></svg>';

const TASKS = [['Redo 4 questions you got wrong', 4], ['Review 6 questions that are due', 4], ['Read Unit 4: The chain rule', 15]];
const BUILD = ['Read your materials', 'Draft the course map', 'You approve the map', 'Write notes and practice', 'Check every answer key twice', 'Ready for your review'];
const OPTIONS = [
  ['0.4', 'Not quite. That divides by n, not by its square root.'],
  ['2', 'Correct.'],
  ['10', 'Not quite. 10 is the standard deviation itself.'],
  ['50', 'Not quite. That multiplies instead of divides.'],
];
const FAQ = [
  ['Do I have to pay for the AI?', 'No. Build my course runs on your own Claude, ChatGPT or Gemini account. A large course can be built in parts to stay within free plan limits.'],
  ['How much of my time does it take?', 'You upload your materials and approve the course map, and the AI drafts the rest. Your time goes into reviewing, which you can do one unit at a time.'],
  ['Can I use questions I already have?', 'Yes. Upload a question file and Cramming checks it, shows you any problems, and publishes only when you say so.'],
  ['Does it work with Canvas?', 'Rosters come from a Canvas export, and scores export in the file Canvas imports. A direct Canvas connection is on our roadmap.'],
  ['Where does student data go?', "Into Cramming's database on Google Firebase, readable only by the student and the staff of their class. Student work is never sent to an AI."],
  ['Which courses does it suit?', 'Computer science, mathematics and statistics courses, today with multiple-choice questions and Java programming assignments.'],
];
const points = (list) => list.map(([h, p], i) => `<div class="reveal" style="--d:${i * 0.08}s"><h3>${h}</h3><p>${p}</p></div>`).join('');
const task = ([t, m]) => `<div class="lp-task"><span class="mark">${CHECK}</span><span class="text">${t}</span><span class="mins">${m} min</span><span class="go" aria-hidden="true">Start</span></div>`;

function markup() {
  return `<div class="lp js-anim">
  ${header(true)}
  <section class="wrap center lp-hero" aria-labelledby="lp-h1">
    <p class="kicker">For computer science, mathematics and statistics courses</p>
    <h1 id="lp-h1">Cram the right way.<sup class="tm" aria-hidden="true">™</sup></h1>
    <p class="lead">A little every day, ready on exam day. Cramming turns your course materials into daily practice and a plan for every student. You approve every word.</p>
    <div class="ctas"><button type="button" class="lp-btn big" data-request>Request access</button><a class="lp-link" href="#/" data-jump="how">See how it works ›</a></div>
    <div class="lp-stage">
      <div class="lp-tilt">
        <div class="lp-glow" aria-hidden="true"></div>
        <div class="lp-window" role="img" aria-label="Example: a student's Today screen for a calculus class. Three tasks are checked off one by one while the readiness bar for the chain rule grows.">
          <div class="bar" aria-hidden="true"><i></i><i></i><i></i><span>cramming.net</span></div>
          <div class="lp-today" aria-hidden="true">
            <div class="main">
              <div><p class="meta">Tuesday · MATH 150 · Midterm in 12 days</p><p class="title" data-today-title>Today, about 23 minutes</p></div>
              <div class="lp-tasks" data-tasks>${TASKS.map(task).join('')}</div>
            </div>
            <div class="side">
              <div class="lp-note"><small>From Prof. Alvarez</small><span>Most of you lost points on the chain rule in Quiz 2. Read Unit 4 before Tuesday.</span></div>
              <div class="lp-note">
                <small>How ready you are</small>
                <div class="lp-meter"><span>Limits</span><span>Solid</span></div><div class="lp-track"><b class="ink" style="--w:86%"></b></div>
                <div class="lp-meter"><span>The chain rule</span><span data-chain-label>Needs work</span></div><div class="lp-track"><b data-chain style="--w:41%"></b></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="lp-phone" data-par="-0.08" aria-hidden="true"><div class="screen"><div class="notch"></div><p class="m">MATH 150</p><p class="t" data-today-title>Today, about 23 minutes</p><div class="lp-tasks" data-tasks>${TASKS.map(task).join('')}</div></div></div>
    </div>
  </section>

  <section id="students" class="wrap sec" aria-labelledby="st-h">
    <div class="center stack reveal">
      <p class="eyebrow">For students</p>
      <h2 id="st-h" class="h2">Every student knows what to do tonight.</h2>
      <p class="lead">Each student gets a short plan built from their own mistakes, the questions due for review and this week's unit. Small sessions, most days: the way people remember best.</p>
    </div>
    <div class="points">${points([
      ['Built from your course', 'Questions and notes come from your own material, so practice matches what you teach and what you test.'],
      ['Planned for each student', "Mistakes come first, then what's due for review, then this week's unit. Nobody has to guess where to start."],
      ['Short enough to happen', 'Three tasks at most, each with its time. Students finish, and come back tomorrow.'],
    ])}</div>
  </section>

  <section class="lp-dark" aria-labelledby="pr-h">
    <div class="wrap">
      <div class="center stack reveal">
        <p class="eyebrow">Practice · try it</p>
        <h2 id="pr-h" class="h2">Practice that teaches.</h2>
        <p class="lead">Every answer is explained the moment it's given, right or wrong. In computer science, mathematics and statistics, with equations set properly and code that runs in the browser.</p>
      </div>
      <div class="lp-q reveal" data-q>
        <div class="top"><span>STAT 119 · Sampling</span><span>Question 3 of 10</span></div>
        <p class="stem" id="q-stem">A sample of 25 students has a standard deviation of 10 points. What is the standard error of the mean?</p>
        <div class="opts" role="group" aria-labelledby="q-stem">${OPTIONS.map(([v]) => `<button type="button" class="lp-opt" data-opt="${v}"><span>${v}</span><em></em></button>`).join('')}</div>
        <div data-q-out><p class="lp-hint">Choose an answer.</p></div>
      </div>
    </div>
  </section>

  <section class="wrap sec" aria-labelledby="sr-h">
    <div class="center stack reveal">
      <p class="eyebrow">Spaced review</p>
      <h2 id="sr-h" class="h2">Learn it once. Keep it for the exam.</h2>
      <p class="lead">We forget fast at first, then more slowly. Reviewing after growing gaps is one of the best-tested ways to remember, and Cramming sets the gaps for you: a day, then three, then a week, then sixteen days. Miss one, and it starts again.</p>
    </div>
    <figure class="card lp-curve reveal" style="margin-left:0;margin-right:0">
      <p class="axis">How much you remember</p>
      <div class="scroll"><svg viewBox="0 0 800 270" role="img" aria-label="Two memory curves over a month. Without review, memory keeps falling. With reviews on day 1, 4, 11 and 27, it climbs back each time and falls more slowly after each review.">
        <line class="base" x1="0" y1="250" x2="800" y2="250" stroke-width="1.5"/>
        <path class="without" d="M0 20 C120 170 300 222 800 238" fill="none" stroke-width="3" stroke-dasharray="7 8" stroke-linecap="round"/>
        <path class="with" d="M0 20 C10 50 20 64 27 72 L27 24 C60 56 90 70 107 78 L107 24 C170 56 240 72 293 80 L293 24 C450 48 620 60 720 66 L720 22 C750 25 780 28 800 30" fill="none" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${[[27, 24], [107, 24], [293, 24], [720, 22]].map(([x, y]) => `<circle class="ring" cx="${x}" cy="${y}" r="7"/><circle class="dot" cx="${x}" cy="${y}" r="6"/>`).join('')}
      </svg></div>
      <figcaption class="legend"><span style="display:flex;flex-wrap:wrap;gap:10px 28px"><span><i class="sw"></i>With Cramming's reviews on day 1, 4, 11 and 27</span><span><i class="sw dash"></i>Without review</span></span><span>Day 1 → Day 30. An illustration, not measured data.</span></figcaption>
      <p class="research">The research: the forgetting curve, first measured by Ebbinghaus in 1885 and replicated by <a href="https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0120644" target="_blank" rel="noopener">Murre and Dros (2015)</a>. Spaced practice beats massed practice across hundreds of experiments (Cepeda and colleagues, 2006, <em>Psychological Bulletin</em>). A review of study methods by Dunlosky and colleagues (2013) rated spaced practice and practice testing the two most useful techniques.</p>
    </figure>
  </section>

  <section class="wrap sec split" aria-labelledby="tu-h">
    <div class="stack reveal">
      <p class="eyebrow">AI tutor</p>
      <h2 id="tu-h" class="h2" style="font-size:clamp(32px,min(4.4vw,7vh),50px)">AI that stays inside your course.</h2>
      <p class="lead" style="text-wrap:pretty">Students connect the AI they already use to your course. It reads only the units you've opened, and it switches off while a quiz or exam is running. One switch turns it off for the whole class.</p>
    </div>
    <div class="card lp-chat lp-lift reveal" data-par="0.05" role="img" aria-label="Example chat: a student asks the tutor for a quiz answer while the quiz is open. The tutor declines and offers to go through the topic from the unit notes after the quiz closes.">
      <small>MATH 150 tutor · Quiz 3 is open</small>
      <div class="me">Can you just give me the answer to question 2 on Quiz 3?</div>
      <div class="ai">Quiz 3 is open right now, so I can't help with it. When it closes, I can walk you through the chain rule using your Unit 4 notes.</div>
    </div>
  </section>

  <section id="professors" class="wrap sec" aria-labelledby="pf-h">
    <div class="lp-panel split reveal">
      <div class="stack">
        <p class="eyebrow">For professors</p>
        <h2 id="pf-h" class="h2" style="font-size:clamp(32px,min(4.4vw,7vh),50px)">Your materials in. A complete course out.</h2>
        <p class="lead" style="text-wrap:pretty">Upload your slides, notes and a past exam. Your own AI drafts notes, practice and quizzes for every unit, checks every answer key twice, then waits for you. Nothing reaches students until you publish it.</p>
        <ul class="lp-checks">${['Built from the materials you upload', 'Every answer key checked twice', 'Edit anything before you publish', 'Works with Claude, ChatGPT or Gemini, on your own account'].map((t) => `<li>${TICK}${t}</li>`).join('')}</ul>
      </div>
      <div class="card lp-build" data-build role="img" aria-label="Example of Build my course: steps from reading the materials to ready for review, completing one after another.">
        <div class="head" aria-hidden="true"><b>Build my course · MATH 150</b><span data-build-pct>0%</span></div>
        <div class="lp-track" aria-hidden="true"><b data-build-bar style="--w:0%"></b></div>
        <div aria-hidden="true">${BUILD.map((s) => `<div class="lp-step"><span class="mark">${CHECK}</span><span>${s}</span></div>`).join('')}</div>
      </div>
    </div>
  </section>

  <section class="wrap sec split" aria-labelledby="da-h">
    <div class="stack reveal">
      <p class="eyebrow">Class dashboard</p>
      <h2 id="da-h" class="h2" style="font-size:clamp(32px,min(4.4vw,7vh),50px)">See who's struggling before the exam does.</h2>
      <p class="lead" style="text-wrap:pretty">The questions most of your class gets wrong, and the students who haven't started. Fix a misunderstanding in Tuesday's lecture, not after the midterm.</p>
    </div>
    <div class="card lp-dash lp-lift reveal" data-par="0.05" role="img" aria-label="Example class dashboard: the two most-missed questions this week, 64 and 41 percent wrong, and 9 students who signed in but have not started the quiz.">
      <div class="head" aria-hidden="true"><b>MATH 150 · This week</b><span>142 students</span></div>
      <div aria-hidden="true" style="display:flex;flex-direction:column;gap:14px">
        <small style="font-size:13px;color:var(--ink-3)">Most missed</small>
        <div class="row"><span>Q7 · The chain rule, nested functions</span><b>64% wrong</b></div><div class="lp-track"><b style="--w:64%"></b></div>
        <div class="row"><span>Q3 · Limits at infinity</span><b>41% wrong</b></div><div class="lp-track"><b style="--w:41%;opacity:.55"></b></div>
        <div class="alert">9 students signed in but haven't started Quiz 3.</div>
      </div>
    </div>
  </section>

  <section class="wrap sec" aria-labelledby="ex-h">
    <div class="center stack reveal">
      <p class="eyebrow">Graded exams</p>
      <h2 id="ex-h" class="h2">Exams you can trust.</h2>
      <p class="lead">Run quizzes and exams in Cramming, in the room or online, with the controls a fair exam needs.</p>
    </div>
    <div class="points">${points([
      ['Access codes', 'Students start only when you give the code, shown on the projector.'],
      ['Lockdown', 'Safe Exam Browser support, and warnings when a student leaves the exam.'],
      ['Fair timing', 'Timed by the server, not the laptop, with extra time per student.'],
      ['Straight to Canvas', 'Scores export in the file format Canvas imports.'],
    ])}</div>
  </section>

  <section id="how" class="wrap sec" aria-labelledby="hw-h">
    <div class="center stack reveal"><p class="eyebrow">How it starts</p><h2 id="hw-h" class="h2">Three steps. No big project.</h2></div>
    <ol class="lp-steps">${[
      ['Request access', 'Tell us your course and roughly how many students. It takes a minute.'],
      ['We build it with you', 'Upload your materials and approve the course map. We help you through your first build and review.'],
      ['Students start that week', 'Share the class link. Each student gets a plan for the units you have opened.'],
    ].map(([h, p], i) => `<li class="card lp-lift reveal" style="--d:${i * 0.1}s"><span class="n">${i + 1}</span><h3>${h}</h3><p>${p}</p></li>`).join('')}</ol>
  </section>

  <section class="lp-band" aria-labelledby="tr-h">
    <div class="wrap">
      <div class="center stack reveal"><p class="eyebrow">Privacy and access</p><h2 id="tr-h" class="h2">Safe for students. Ready for your school.</h2></div>
      <div class="points">${points([
        ['School accounts only', "Sign-in is limited to your school's accounts and your class roster."],
        ['No student work in AI', "Students' answers and scores are never sent to an AI. The AI only sees your course materials."],
        ['Scores stay with staff', 'Exam scores are visible to you and your TAs, and to each student only after you release them.'],
        ['Accessible', 'Keyboard and screen reader support, light and dark mode, and extra time built into the timer.'],
      ])}</div>
    </div>
  </section>

  <section id="faq" class="wrap sec lp-faq" aria-labelledby="fq-h">
    <h2 id="fq-h" class="h2 reveal" style="text-align:center;margin:0 auto;font-size:clamp(30px,min(4.2vw,6.5vh),48px)">Questions professors ask.</h2>
    <div class="list">${FAQ.map(([q, a]) => `<details class="reveal"><summary><span>${q}</span>${PLUS}</summary><p>${a}</p></details>`).join('')}</div>
  </section>

  <section class="wrap center lp-end" aria-labelledby="en-h">
    <h2 id="en-h" class="h2 reveal">Bring Cramming to your class.</h2>
    <p class="lead reveal">We're setting up a small number of courses by hand this term. Tell us about yours, and we'll build the first one with you.</p>
    <button type="button" class="lp-btn big reveal" data-request>Request access</button>
    <p class="small">Free during early access. Student? <a href="#/signin">Sign in with your school account ›</a></p>
  </section>
  ${footer()}
  <button type="button" class="lp-pause" data-pause aria-pressed="false"><svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true" data-pause-icon><rect x="2" y="1.5" width="2.6" height="9" rx=".8"/><rect x="7.4" y="1.5" width="2.6" height="9" rx=".8"/></svg><span>Pause motion</span></button>
  <div class="lp-mobile-cta"><button type="button" class="lp-btn" data-request>Request access</button></div>
</div>`;
}

// Eased scroll to a section, so a jump glides instead of flashing the whole page past.
function glideTo(el, reduce) {
  const head = 56, y = el.getBoundingClientRect().top + scrollY - head;
  if (reduce) { scrollTo(0, y); return; }
  const from = scrollY, dist = y - from, dur = Math.min(1400, 600 + Math.abs(dist) * 0.12), t0 = performance.now();
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const step = (now) => { const t = Math.min(1, (now - t0) / dur); scrollTo(0, from + dist * ease(t)); if (t < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

export async function render(main, params = {}, query = {}) {
  await ensureCss();
  document.body.classList.add('landing-mode');
  document.title = 'Cramming · Cram the right way';
  main.innerHTML = markup();
  const lp = main.querySelector('.lp');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let paused = reduce;
  const offs = [mountSheet(lp)];

  // reveals
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  lp.querySelectorAll('.reveal').forEach((el) => io.observe(el));
  offs.push(() => io.disconnect());

  // scroll-linked: hero tilt, parallax, progress line
  const tilt = lp.querySelector('.lp-tilt'), bar = lp.querySelector('.lp-progress'), par = [...lp.querySelectorAll('[data-par]')];
  let ticking = false;
  const frame = () => {
    ticking = false;
    const vh = innerHeight, max = document.documentElement.scrollHeight - vh;
    bar.style.setProperty('--progress', max > 0 ? (scrollY / max).toFixed(4) : 0);
    if (paused) return;
    tilt.style.setProperty('--tilt', Math.max(0, 1 - scrollY / (vh * 0.45)).toFixed(3));
    for (const el of par) {
      const r = el.getBoundingClientRect(), off = r.top + r.height / 2 - vh / 2;
      el.style.setProperty('--py', (off * Number(el.dataset.par)).toFixed(1));
    }
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  offs.push(() => { removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); });
  frame();

  // demos: Today checks off tasks, Build my course completes steps. They run only on screen.
  const todayTitles = lp.querySelectorAll('[data-today-title]'), taskLists = lp.querySelectorAll('[data-tasks]');
  const chain = lp.querySelector('[data-chain]'), chainLabel = lp.querySelector('[data-chain-label]');
  const steps = [...lp.querySelectorAll('.lp-step')], pct = lp.querySelector('[data-build-pct]'), buildBar = lp.querySelector('[data-build-bar]');
  let k = 0;
  const paint = () => {
    const t = k % 10, done = t >= 6 ? 3 : t >= 4 ? 2 : t >= 2 ? 1 : 0;
    const left = TASKS.slice(done).reduce((n, x) => n + x[1], 0);
    todayTitles.forEach((el) => (el.textContent = done === 3 ? 'Done for today' : `Today, about ${left} minutes`));
    taskLists.forEach((list) => [...list.children].forEach((row, i) => { row.classList.toggle('done', i < done); row.classList.toggle('next', i === done); }));
    const c = [41, 52, 63, 74][done];
    chain.style.setProperty('--w', c + '%'); chainLabel.textContent = c >= 70 ? 'Getting there' : 'Needs work';
    const b = Math.min(k % 9, 6);
    steps.forEach((s, i) => { s.classList.toggle('done', i < b); s.classList.toggle('now', i === b); });
    pct.textContent = b === 6 ? 'Ready' : Math.round((b / 6) * 100) + '%';
    buildBar.style.setProperty('--w', Math.round((b / 6) * 100) + '%');
  };
  if (reduce) k = 6 * 9 + 6; // a finished state for people who turned motion off
  paint();
  const visible = new Set();
  const vio = new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target))));
  [lp.querySelector('.lp-stage'), lp.querySelector('[data-build]')].forEach((el) => vio.observe(el));
  const timer = setInterval(() => { if (!paused && visible.size) { k++; paint(); } }, 1300);
  offs.push(() => { clearInterval(timer); vio.disconnect(); });

  // the practice question
  const q = lp.querySelector('[data-q]'), out = q.querySelector('[data-q-out]');
  const showQ = (pick) => {
    q.querySelectorAll('[data-opt]').forEach((b) => {
      const v = b.dataset.opt, right = v === '2';
      b.disabled = pick !== null;
      b.classList.toggle('right', pick !== null && right);
      b.classList.toggle('wrong', pick === v && !right);
      b.querySelector('em').textContent = pick !== null && right ? 'Correct' : pick === v ? 'Not this one' : '';
    });
    out.innerHTML = pick === null ? '<p class="lp-hint">Choose an answer.</p>' : `<div class="lp-explain" role="status"><p style="color:var(--dark-ink);font-weight:600">${OPTIONS.find((o) => o[0] === pick)[1]}</p><p class="formula" style="color:var(--dark-ink)">SE = s / √n = 10 / √25 = 2</p><p>Divide the standard deviation by the square root of the sample size. Bigger samples give smaller errors, which is why larger studies are more precise.</p><button type="button" data-q-again>Try again</button></div>`;
    if (pick === null) q.querySelector('[data-opt]').focus(); else out.querySelector('[data-q-again]').focus();
  };
  q.addEventListener('click', (e) => {
    const o = e.target.closest('[data-opt]');
    if (o && !o.disabled) showQ(o.dataset.opt);
    if (e.target.closest('[data-q-again]')) showQ(null);
  });

  // section links glide; the pause button stops every animation
  const onClick = (e) => {
    const j = e.target.closest('[data-jump]'), top = e.target.closest('[data-top]');
    if (j) { e.preventDefault(); const el = lp.querySelector('#' + j.dataset.jump); if (el) glideTo(el, reduce); }
    else if (top) { e.preventDefault(); glideTo(lp, reduce); }
    const p = e.target.closest('[data-pause]');
    if (p) {
      paused = !paused;
      lp.classList.toggle('paused', paused);
      p.setAttribute('aria-pressed', String(paused));
      p.querySelector('span').textContent = paused ? 'Play motion' : 'Pause motion';
      p.querySelector('[data-pause-icon]').innerHTML = paused ? '<path d="M3 1.5v9l7.5-4.5z"/>' : '<rect x="2" y="1.5" width="2.6" height="9" rx=".8"/><rect x="7.4" y="1.5" width="2.6" height="9" rx=".8"/>';
      if (paused) { tilt.style.setProperty('--tilt', 0); par.forEach((el) => el.style.setProperty('--py', 0)); } else frame();
    }
  };
  lp.addEventListener('click', onClick);
  if (reduce) { lp.classList.add('paused'); const p = lp.querySelector('[data-pause]'); p.hidden = true; }
  if (query.to) { const el = lp.querySelector('#' + CSS.escape(query.to)); if (el) setTimeout(() => glideTo(el, reduce), 150); }

  return () => { offs.forEach((f) => f()); document.body.classList.remove('landing-mode'); };
}

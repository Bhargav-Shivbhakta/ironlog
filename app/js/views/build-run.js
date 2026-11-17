// Build my course, steps 2 to 4: connect the professor's AI, check the course map, watch it build.
// The AI does the work through the connector service; this page only starts, shows and approves.
import * as cloud from '../cloud.js';
import { esc, icon, toast, confirmDialog, plural } from '../ui.js';
import { scheduleMap, approveMap, retryStuck, thinTopics, partInfo, releaseNext } from '../build/engine.js';

const SAY = 'Use the Cramming connector to build my course. Keep going, job after job, until it says FINISHED.';
const SAY_ROLE = {
  build: 'Use the Cramming connector with the role "build" to build my course. Keep going, job after job, until it says FINISHED.',
  check: 'Use the Cramming connector with the role "check" to check my course. Keep going, job after job, until it says FINISHED.',
  fresh: 'Use the Cramming connector with the role "fresh" to give my course a final fresh look. Keep going, job after job, until it says FINISHED.',
};
const CONTINUE = 'The course map is approved. Continue with the Cramming connector until it says FINISHED.';
const POLL_MS = 15000;
const day = (s) => (s ? new Date(s + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${plural(m, 'minute')} ago` : m < 1440 ? `${plural(Math.round(m / 60), 'hour')} ago` : `${plural(Math.round(m / 1440), 'day')} ago`; };

export async function render(main, { classId }) {
  const back = `#/build/${encodeURIComponent(classId)}`;
  const page = (inner) => { main.innerHTML = `<section class="page builder"><nav class="crumbs" aria-label="Breadcrumb"><a href="#/instructor?class=${encodeURIComponent(classId)}">Class dashboard</a><span aria-hidden="true">›</span><a href="${back}">Build my course</a><span aria-hidden="true">›</span><span>Build</span></nav>${inner}</section>`; };
  if (!cloud.enabled || !cloud.currentUser() || !cloud.leadsClass(classId)) { page('<h1>Build my course</h1><p>Only the class\'s instructor can open this page.</p>'); return; }
  let b;
  try { b = await cloud.getBuild(classId); }
  catch (e) { page(`<h1>Build my course</h1><p class="bad">${e?.code === 'permission-denied' ? 'This needs the latest security rules. Ask the site admin to publish the newest firestore.rules.' : esc(e?.message || String(e))}</p>`); return; }
  if (!b) { page(`<h1>Build my course</h1><p>Nothing is being built yet. Add your materials first.</p><p><a class="btn primary" href="${back}">Course and materials</a></p>`); return; }

  let alive = true, timer = null, units = null, dirty = false;
  const $ = (s) => main.querySelector(s);
  const link = () => (cloud.connectorUrl() ? `${cloud.connectorUrl()}/mcp/${b.code}` : '');
  const steps = () => b.st.order.map((id) => b.st.steps[id]);
  const stage = () => (b.st.phase === 'approve' ? 3 : b.st.phase === 'build' || b.st.phase === 'done' ? 4 : 2);

  function stepper() {
    const names = ['Course and materials', 'Connect your AI', 'Check the course map', 'Building', 'Review and schedule'];
    return `<ol class="build-steps" aria-label="Steps">${names.map((n, i) => `<li class="${i + 1 === stage() ? 'on' : i + 1 < stage() ? 'past' : ''}"${i + 1 === stage() ? ' aria-current="step"' : ''}><span>${i + 1 < stage() ? '✓' : i + 1}</span> ${i === 0 ? `<a href="${back}">${n}</a>` : n}</li>`).join('')}</ol>`;
  }
  // for a message: buttons that open a new chat with the message already typed in (the professor only presses send)
  const openIn = (value) => `<a class="btn" target="_blank" rel="noopener" href="https://claude.ai/new?q=${encodeURIComponent(value)}">Open in Claude</a><a class="btn" target="_blank" rel="noopener" href="https://chatgpt.com/?q=${encodeURIComponent(value)}">Open in ChatGPT</a>`;
  const copyRow = (label, value, key) => `<div class="copy-row"><label class="field grow"><span>${label}</span><input readonly value="${esc(value)}" data-copy-src="${key}" onfocus="this.select()"></label>${key.startsWith('say') ? openIn(value) : ''}<button type="button" class="btn" data-copy="${key}">${icon('copy')} Copy</button></div>`;

  const teamRows = () => copyRow('Chat 1, the builder', SAY_ROLE.build, 'say') + copyRow('Chat 2, the checker', SAY_ROLE.check, 'say2') + copyRow('Chat 3, fresh eyes', SAY_ROLE.fresh, 'say3');
  function connectPanel() {
    const started = !!b.lastCallAt;
    const outlines = steps().filter((s) => s.kind === 'outline'), read = outlines.filter((s) => s.status !== 'todo').length;
    return `
      <div class="build-card">
        <h2>${started ? 'Your AI is reading your materials' : 'Connect your AI'}</h2>
        ${started ? `<p class="build-status" role="status">${icon('check')} Connected. ${b.st.phase === 'map' ? 'It is putting the topics in order.' : `Read ${read} of ${outlines.length} ${outlines.length === 1 ? 'part' : 'parts'} of your files.`} Last worked ${ago(b.lastCallAt)}.</p>
          <div class="bar" role="progressbar" aria-label="Files read" aria-valuemin="0" aria-valuemax="${outlines.length}" aria-valuenow="${read}"><span style="width:${Math.round((read / Math.max(1, outlines.length)) * 100)}%"></span></div>
          <p class="muted small">You can close this page. If your AI stops, open a new chat and say the sentence in step 3 again: it carries on where it stopped.</p>` : ''}
        <ol class="connect-steps">
          <li><h3>Copy your private link</h3>
            ${link() ? copyRow('Connector link', link(), 'link') : '<p class="note">The connector is not online yet. This page is a preview: the link will appear here when it is switched on.</p>'}
            <p class="muted small">Keep it to yourself. Anyone who has this link can add to this build. <button type="button" class="linklike" data-restart>Make a new link and start again</button></p></li>
          <li><h3>Add it to your AI, once</h3>
            <details><summary>Claude</summary><p>Settings → Connectors → Add custom connector. Name it <strong>Cramming</strong> and paste the link.</p></details>
            <details><summary>ChatGPT</summary><p>Settings → Apps and connectors → Advanced → turn on Developer mode, then Create. Name it <strong>Cramming</strong>, paste the link and choose "No authentication". ChatGPT may ask you to confirm each step it sends.</p></details>
            <details><summary>Gemini</summary><p>Custom connectors are not open to every Gemini account yet. If yours has them, add the link the same way. Otherwise use Claude or ChatGPT for this step.</p></details></li>
          <li><h3>${b.st.setup.team ? 'Open three chats and send one message in each' : 'Say this to your AI'}</h3>
            ${b.st.setup.team ? teamRows() + '<p class="muted small">Start them in any order: each one waits for the others. If you have two AIs, use one to build and the other to check, since they catch each other\'s mistakes. One AI in three separate chats also works.</p>' : copyRow('Message to send', SAY, 'say')}
            <p class="muted small">The Open buttons start a new chat with the message already typed: check the Cramming connector is switched on, then press send.</p>
            <p class="muted small">That is all you type. It asks Cramming for one job at a time, and Cramming checks each answer before giving the next.</p></li>
        </ol>
      </div>`;
  }

  function mapPanel() {
    if (!units) units = b.st.map.units.map((u) => ({ title: u.title, topics: u.topics }));
    const m = scheduleMap(b.st.setup, units);
    const topicCount = units.reduce((n, u) => n + u.topics.length, 0);
    const left = steps().filter((s) => s.kind === 'outline' && s.meta?.skip?.length).map((s) => ({ name: s.meta.name, skip: s.meta.skip }));
    const unread = steps().filter((s) => s.kind === 'outline' && s.status === 'stuck');
    const thin = thinTopics(b.st, m.units);
    return `
      <div class="build-card">
        <h2>Check the course map</h2>
        <p>Your AI read everything and found <strong>${plural(topicCount, 'topic')}</strong> in <strong>${plural(units.length, 'unit')}</strong>. This is the order they will be taught and built in. Rename a unit or move it up or down if it is wrong, then approve.</p>
        <ol class="map-units">
          ${m.units.map((u, i) => `<li class="map-unit">
            <div class="map-head"><span class="map-n" aria-hidden="true">${u.n}</span>
              <label class="field grow"><span class="sr-only">Name of unit ${u.n}</span><input data-unit-title="${i}" value="${esc(u.title)}" maxlength="60"></label>
              <span class="muted small map-dates">${u.start ? `${day(u.start)} to ${day(u.end)}` : ''}</span>
              <button type="button" class="btn small icon-btn" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move unit ${u.n} up">${icon('up')}</button>
              <button type="button" class="btn small icon-btn" data-down="${i}" ${i === units.length - 1 ? 'disabled' : ''} aria-label="Move unit ${u.n} down">${icon('down')}</button></div>
            <ul class="map-topics">${u.topics.map((g) => `<li>${esc(g.title)} <span class="muted small">${esc([...new Set(g.from.map((id) => b.st.topics.find((t) => t.id === id)?.fileName).filter(Boolean))].join(', '))}</span></li>`).join('')}</ul>
          </li>`).join('')}
        </ol>
        ${left.length ? `<details class="map-left"><summary>What was left out of your files (${left.reduce((n, f) => n + f.skip.length, 0)} parts that teach nothing)</summary><ul>${left.map((f) => `<li><strong>${esc(f.name)}</strong>: ${f.skip.map((k) => `${esc(k.label)}${k.why ? ` (${esc(k.why)})` : ''}`).join(', ')}</li>`).join('')}</ul><p class="muted small">If something here should be taught, start again and tell the AI in "Anything you want the AI to know".</p></details>` : ''}
        ${unread.length ? `<p class="note"><strong>Could not be read:</strong> ${unread.map((s) => esc(s.title.replace(/^Read /, ''))).join('; ')}. Nothing from ${unread.length === 1 ? 'it' : 'them'} is in this map.</p>` : ''}
        ${m.exams.length ? `<h3>What each exam covers</h3><ul class="map-exams">${m.exams.map((e) => `<li><strong>${esc(e.name)}</strong> <span class="muted">${day(e.date)}</span>: ${e.units.length === units.length ? 'everything' : e.units.length ? (e.units.length > 1 ? `units ${e.units[0]} to ${e.units[e.units.length - 1]}` : `unit ${e.units[0]}`) : 'nothing yet'}</li>`).join('')}</ul>
          <p class="muted small">An exam covers the units that finish before its date. A final covers everything.</p>` : ''}
        ${thin.length ? `<div class="note"><p><strong>Your files say very little about ${thin.length === 1 ? 'this topic' : `these ${thin.length} topics`}:</strong> ${thin.map((t) => `${esc(t.title)} (unit ${t.unit})`).join('; ')}.</p><p>The notes and questions for ${thin.length === 1 ? 'it' : 'them'} will be short and basic, because nothing is added that your files do not say. If ${thin.length === 1 ? 'it matters' : 'they matter'}, add material about ${thin.length === 1 ? 'it' : 'them'} and start again.</p></div>` : ''}
        <div class="row"><button type="button" class="btn primary" data-approve>${icon('check')} Approve this map</button></div>
      </div>`;
  }

  const KIND = { notes: 'Study notes', practice: 'Practice questions', quiz: 'Quiz', assign: 'Programming assignment', exam: 'Exam questions' };
  function buildPanel() {
    const all = steps().filter((s) => !['outline', 'map'].includes(s.kind));
    const done = all.filter((s) => s.status === 'done').length, stuck = all.filter((s) => s.status === 'stuck'), finished = b.st.phase === 'done';
    const team = !!b.st.setup.team, back2 = ['check', 'solve', 'revise', 'reassign'];
    const parts = partInfo(b.st);
    const current = new Set(['build', 'check', 'fresh'].map((r) => all.find((s) => s.status === 'todo' && (s.role || 'build') === r)).filter(Boolean));
    const row = (s) => {
      const state = s.status === 'done' ? 'done' : s.status === 'stuck' ? 'stuck' : current.has(s) && b.lastCallAt ? 'now' : 'todo';
      const label = { done: 'Done', stuck: 'Needs you', now: s.tries ? `Being fixed (try ${s.tries + 1})` : 'Being made now', todo: 'Waiting' }[state];
      return `<li class="job ${state}"><span class="job-mark" aria-hidden="true">${state === 'done' ? icon('check') : state === 'stuck' ? '!' : state === 'now' ? '…' : ''}</span>
        <span class="job-name">${esc(back2.includes(s.kind) ? (team ? s.title : s.title.replace(/^Second look · /, '')) : s.exam != null && s.kind === 'assign' ? `Programming problem ${s.problem}` : (KIND[s.kind] || s.title) + (s.part ? `, part ${s.part}` : ''))}${s.note ? ` <span class="muted small">${esc(s.note)}</span>` : ''}</span>
        <span class="job-state">${label}</span>
        ${state === 'stuck' && s.problems?.length ? `<details class="job-why"><summary>Why it was set aside</summary><ul>${s.problems.slice(0, 6).map((p) => `<li>${esc(p)}</li>`).join('')}</ul></details>` : ''}</li>`;
    };
    const groups = [
      ...b.st.map.units.map((u) => ({ title: `Unit ${u.n}: ${u.title}`, sub: u.start ? `${day(u.start)} to ${day(u.end)}` : '', items: all.filter((s) => s.unit === u.n) })),
      ...b.st.map.exams.map((e, i) => ({ title: e.name, sub: day(e.date), items: all.filter((s) => s.exam === i) })),
      ...(team ? [
        { title: 'The checker', sub: 'answers every question without the key and solves every assignment from the instructions alone', items: all.filter((s) => s.role === 'check') },
        { title: 'Fixes by the builder', sub: 'where the checker or fresh eyes disagreed', items: all.filter((s) => ['revise', 'reassign'].includes(s.kind)) },
        { title: 'Fresh eyes', sub: 'one more independent look at the agreed version', items: all.filter((s) => s.role === 'fresh') },
      ] : [{ title: 'Second look at every answer', sub: 'each question set is answered again and compared with its answer key', items: all.filter((s) => s.kind === 'check') }]),
    ].filter((g) => g.items.length);
    return `
      <div class="build-card">
        <h2>${finished ? 'Your course is built' : parts?.paused ? `Part ${parts.part} of ${parts.parts} is built` : 'Building your course'}</h2>
        ${parts && !finished ? `<p class="muted">Building in parts: units 1 to ${parts.upto} of ${parts.units} so far.</p>` : ''}
        ${parts?.paused ? `<div class="note"><p><strong>Units ${Math.max(1, parts.upto - parts.size + 1)} to ${parts.upto} are finished, and the build has stopped here.</strong> Look them over first: if something is not how you want it, it is cheaper to change your wishes now than after everything is made.</p><div class="row"><a class="btn" href="${back}/review">Look at what was made</a><button type="button" class="btn primary" data-next-part>Build the next part (${parts.upto + 1 === Math.min(parts.units, parts.upto + parts.size) ? `unit ${parts.upto + 1}` : `units ${parts.upto + 1} to ${Math.min(parts.units, parts.upto + parts.size)}`})</button>${parts.upto + parts.size < parts.units ? '<button type="button" class="btn" data-next-part="all">Build all the rest</button>' : ''}</div><p class="small">After you press it, tell your AI to continue (or send the message below in a new chat).</p></div>` : ''}
        <p class="build-status" role="status">${finished ? `${icon('check')} ${done} of ${all.length} made.` : `${done} of ${all.length} made.`}${stuck.length ? ` ${plural(stuck.length, 'item')} set aside for you.` : ''}${!finished && b.lastCallAt ? ` Your AI last worked ${ago(b.lastCallAt)}.` : ''}</p>
        ${!finished && !parts?.paused && b.lastCallAt && Date.now() - b.lastCallAt > 10 * 60000 ? `<p class="note" role="status"><strong>Your AI seems to have stopped.</strong> That is normal on a long build (it can run out of room or reach its limit). Nothing is lost: open a new chat with it and send the message below.</p>` : ''}
        ${stuck.length ? `<div class="row"><button type="button" class="btn small" data-retry>Try the ${stuck.length === 1 ? 'item' : `${stuck.length} items`} set aside again</button></div>` : ''}
        <div class="bar" role="progressbar" aria-label="Items made" aria-valuemin="0" aria-valuemax="${all.length}" aria-valuenow="${done}"><span style="width:${Math.round((done / Math.max(1, all.length)) * 100)}%"></span></div>
        ${finished ? `<p>Nothing has gone to students yet. Next you look over what was made and publish it.</p><div class="row"><a class="btn primary" href="${back}/review">Review and publish</a></div>`
          : `<p class="muted small">You can close this page and come back. If your AI stops before the end, open a new chat with it and send this again:</p>${b.st.setup.team ? teamRows() : copyRow('Message to send', b.approvedAt ? CONTINUE : SAY, 'say')}`}
        <div class="job-groups">${groups.map((g) => `<section class="job-group"><h3>${esc(g.title)} ${g.sub ? `<span class="muted small">${esc(g.sub)}</span>` : ''}</h3><ul class="jobs">${g.items.map(row).join('')}</ul></section>`).join('')}</div>
      </div>`;
  }

  function draw() {
    const failed = b.st.failed;
    page(`
      <p class="eyebrow">Build my course <span class="tag">Preview</span></p>
      <h1>Build my course with AI</h1>
      ${stepper()}
      ${failed ? `<div class="build-card"><h2>The build stopped</h2><p class="bad">${esc(failed)}</p><p>You can ask your AI to try that step again, or check that your files have readable text and start again.</p><div class="row"><button type="button" class="btn primary" data-retry>Try again</button><a class="btn" href="${back}">Course and materials</a></div></div>`
        : stage() === 2 ? connectPanel() : stage() === 3 ? mapPanel() : buildPanel()}
      <p class="muted small build-foot"><button type="button" class="linklike" data-restart>Throw this build away and start again</button></p>`);
  }

  async function refresh() {
    if (!alive || dirty || document.hidden) return;
    try {
      const n = await cloud.getBuild(classId);
      if (!alive || dirty) return;
      if (!n) { location.hash = back; return; }
      if (n.updatedAt !== b.updatedAt) {
        const open = [...main.querySelectorAll('details[open] > summary')].map((x) => x.textContent), focus = document.activeElement?.dataset?.copy;
        b = n; if (stage() !== 3) units = null; draw();
        main.querySelectorAll('details > summary').forEach((x) => { if (open.includes(x.textContent)) x.parentElement.open = true; });
        if (focus) main.querySelector(`[data-copy="${focus}"]`)?.focus();
      }
    } catch { /* offline: try again next time */ }
  }
  const schedule = () => { clearInterval(timer); timer = setInterval(refresh, POLL_MS); };

  main.addEventListener('input', (ev) => {
    const i = ev.target.dataset?.unitTitle;
    if (i != null && units) { units[Number(i)].title = ev.target.value; dirty = true; }
  });
  main.addEventListener('click', async (ev) => {
    const el = ev.target.closest('button'); if (!el || !alive) return;
    if (el.dataset.copy) {
      const src = main.querySelector(`[data-copy-src="${el.dataset.copy}"]`);
      try { await navigator.clipboard.writeText(src.value); toast('Copied'); } catch { src.focus(); src.select(); toast('Press Ctrl+C (or ⌘C) to copy'); }
      return;
    }
    if (el.dataset.up != null || el.dataset.down != null) {
      const i = Number(el.dataset.up ?? el.dataset.down), j = el.dataset.up != null ? i - 1 : i + 1;
      [units[i], units[j]] = [units[j], units[i]]; dirty = true; draw();
      (main.querySelector(`[data-${el.dataset.up != null ? 'up' : 'down'}="${j}"]:not([disabled])`) || main.querySelector(`[data-unit-title="${j}"]`))?.focus();
      return;
    }
    if ('approve' in el.dataset) {
      const blank = units.findIndex((u) => !u.title.trim());
      if (blank >= 0) { toast('Give every unit a name', 'bad'); main.querySelector(`[data-unit-title="${blank}"]`)?.focus(); return; }
      el.disabled = true;
      try {
        const fresh = await cloud.getBuild(classId);
        if (!fresh || fresh.st.phase !== 'approve') { dirty = false; b = fresh || b; units = null; draw(); return; }
        approveMap(fresh.st, { units: units.map((u) => ({ title: u.title.trim(), topics: u.topics })) });
        await cloud.saveBuildState(classId, fresh.st, { approvedAt: Date.now() });
        b = await cloud.getBuild(classId); dirty = false; units = null; draw();
        toast('Map approved. Tell your AI to continue.');
        main.querySelector('h2')?.setAttribute('tabindex', '-1'); main.querySelector('h2')?.focus();
      } catch (e) { el.disabled = false; toast("Couldn't save: " + (e?.message || e), 'bad'); }
      return;
    }
    if ('nextPart' in el.dataset) {
      el.disabled = true;
      try {
        const fresh = await cloud.getBuild(classId);
        if (fresh && releaseNext(fresh.st, el.dataset.nextPart === 'all')) { await cloud.saveBuildState(classId, fresh.st); toast('Ready. Tell your AI to continue.'); }
        b = (await cloud.getBuild(classId)) || b; draw();
      } catch (e) { el.disabled = false; toast("Couldn't do that: " + (e?.message || e), 'bad'); }
      return;
    }
    if ('retry' in el.dataset) {
      el.disabled = true;
      try {
        const fresh = await cloud.getBuild(classId);
        if (fresh && retryStuck(fresh.st)) { await cloud.saveBuildState(classId, fresh.st); toast('Ready. Tell your AI to continue.'); }
        b = (await cloud.getBuild(classId)) || b; draw();
      } catch (e) { el.disabled = false; toast("Couldn't do that: " + (e?.message || e), 'bad'); }
      return;
    }
    if ('restart' in el.dataset) {
      const ok = await confirmDialog({ title: 'Start again?', body: '<p>Everything this build has made so far is deleted and the link stops working. Your materials and settings are kept.</p>', confirm: 'Throw it away', danger: true });
      if (!ok) return;
      try { await cloud.cancelBuild(classId); location.hash = back; } catch (e) { toast("Couldn't do that: " + (e?.message || e), 'bad'); }
    }
  });
  const onShow = () => { if (!document.hidden) refresh(); };
  document.addEventListener('visibilitychange', onShow);
  draw(); schedule();
  return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', onShow); };
}

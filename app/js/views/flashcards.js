import { getExam } from '../data.js';
import * as store from '../store.js';
import { esc, icon, plural } from '../ui.js';
import { md, highlight } from '../render.js';
import { correctAnswerLabel } from '../parser.js';
import { recordAnswer, shuffle, isDue, qStat } from '../engine.js';

export async function render(main, { id }, query) {
  const exam = await getExam(id);
  if (!exam) { main.innerHTML = `<section class="page narrow empty-state"><h1>Exam not found</h1><a class="btn primary" href="#/">See all exams</a></section>`; return; }
  const e = encodeURIComponent(exam.id);
  const crumbs = `<nav class="crumbs"><a href="#/">Exams</a><a href="#/exam/${e}">${esc(exam.title)}</a></nav>`;

  // deck state
  const st = { cards: [], i: 0, flipped: false, knew: 0, again: 0, missed: [], active: false };

  function picker() {
    st.active = false;
    const stats = store.getStats(exam.id);
    const dueCount = exam.questions.filter((q) => isDue(qStat(stats, q.id))).length;
    main.innerHTML = `
      <section class="page narrow setup">
        ${crumbs}
        <h1>Flashcards</h1>
        <p class="lead">See a question, think of the answer, then flip. Mark whether you knew it, and the cards you miss come back sooner in smart review.</p>
        <form class="setup-form" data-deck-form>
          <label class="field"><span>Deck</span>
            <select name="deck">
              <option value="all">All topics (${exam.questions.length})</option>
              ${dueCount ? `<option value="due">Due for review (${dueCount})</option>` : ''}
              ${exam.topics.map((t) => `<option value="t:${esc(t.name)}">${esc(t.name)} (${t.count})</option>`).join('')}
            </select>
          </label>
          <div class="inline-fields plain">
            <label class="field"><span>Cards</span>
              <select name="size">${[10, 20, 30, 50].map((n) => `<option value="${n}" ${n === 20 ? 'selected' : ''}>${n}</option>`).join('')}<option value="0">All in the deck</option></select>
            </label>
            <label class="field"><span>Order</span>
              <select name="order"><option value="weak" selected>Weakest first</option><option value="random">Random</option><option value="file">In order</option></select>
            </label>
          </div>
          <div class="row end"><a class="btn" href="#/exam/${e}">Cancel</a><button class="btn primary big" type="submit">Start</button></div>
        </form>
      </section>`;
    const form = main.querySelector('form');
    if (query.deck) form.deck.value = query.deck;
    form.onsubmit = (ev) => {
      ev.preventDefault();
      const deck = form.deck.value;
      const stats2 = store.getStats(exam.id);
      let pool = exam.questions;
      if (deck === 'due') pool = pool.filter((q) => isDue(qStat(stats2, q.id)));
      else if (deck.startsWith('t:')) pool = pool.filter((q) => q.topic === deck.slice(2));
      const size = Number(form.size.value) || pool.length;
      const order = form.order.value;
      const strength = (q) => { const st = qStat(stats2, q.id); return st.seen ? st.box + st.right / (st.seen + 1) : 0.5; };
      let ids;
      if (order === 'weak') ids = shuffle(pool).sort((a, b) => strength(a) - strength(b)).map((q) => q.id);
      else if (order === 'random') ids = shuffle(pool.map((q) => q.id));
      else ids = pool.map((q) => q.id);
      start(ids.slice(0, size), true);
    };
  }

  function start(ids, keepOrder = true) {
    Object.assign(st, { cards: keepOrder ? ids.slice() : shuffle(ids), i: 0, flipped: false, knew: 0, again: 0, missed: [], active: true });
    main.innerHTML = `
      <section class="page narrow flash">
        ${crumbs}
        <h1 class="sr-only">Flashcards</h1>
        <div class="flash-top"><span data-pos></span><span class="muted" data-tally></span></div>
        <div class="flash-card" data-card tabindex="0" role="button" aria-label="Flip card"></div>
        <div class="flash-actions" data-actions></div>
        <p class="muted small center">Space flips the card. Press 1 if you didn't know it, 2 if you did.</p>
      </section>`;
    draw();
  }

  function draw() {
    if (st.i >= st.cards.length) return finish();
    const q = exam.byId.get(st.cards[st.i]);
    const cardEl = main.querySelector('[data-card]');
    main.querySelector('[data-pos]').textContent = `Card ${st.i + 1} of ${st.cards.length}`;
    main.querySelector('[data-tally]').textContent = `${st.knew} knew · ${st.again} to review`;
    const back = q.options
      ? `<ul class="flash-answers">${q.options.filter((o) => o.correct).map((o) => `<li>${md(o.text, { inline: true })}</li>`).join('')}</ul>`
      : `<p class="flash-answer">${md(correctAnswerLabel(q), { inline: true })}</p>`;
    cardEl.className = `flash-card ${st.flipped ? 'flipped' : ''}`;
    cardEl.innerHTML = `
      <div class="flash-face">
        <span class="tag">${esc(q.topic)}</span>
        <div class="prose">${md(q.text)}</div>
        ${q.options && !st.flipped ? `<ol class="browse-opts faint">${q.options.map((o) => `<li>${md(o.text, { inline: true })}</li>`).join('')}</ol>` : ''}
        ${st.flipped ? `<div class="flash-back"><p class="muted small">Answer</p>${back}${q.explanation ? `<div class="explanation prose">${md(q.explanation)}</div>` : ''}</div>` : '<p class="muted small flip-hint">Click or press Space to flip</p>'}
      </div>`;
    highlight(cardEl);
    main.querySelector('[data-actions]').innerHTML = st.flipped
      ? `<button class="btn big bad-btn" data-again>${icon('x')} Didn't know</button><button class="btn big primary" data-knew>${icon('check')} Knew it</button>`
      : `<button class="btn big primary" data-flip>Show answer</button>`;
  }

  function mark(ok) {
    const stats = store.getStats(exam.id);
    recordAnswer(stats, st.cards[st.i], ok);
    store.saveStats(exam.id, stats);
    store.logActivity(0, 1);
    if (ok) st.knew++; else { st.again++; st.missed.push(st.cards[st.i]); }
    st.i++; st.flipped = false;
    draw();
  }

  function finish() {
    st.active = false;
    const total = st.knew + st.again;
    main.innerHTML = `
      <section class="page narrow empty-state">
        ${crumbs}
        <h1>${total ? 'Deck done' : 'No cards in this deck'}</h1>
        <p>${total ? `You knew ${st.knew} of ${total}. ${st.again ? `${plural(st.again, 'card')} will come back in smart review soon.` : 'Every card. Nice.'}` : 'Pick a different deck.'}</p>
        <div class="row center">
          ${st.again ? '<button class="btn primary" data-redo>Go over the missed cards</button>' : ''}
          <button class="btn" data-pick>Pick another deck</button>
          <a class="btn" href="#/exam/${e}">Back to ${esc(exam.title)}</a>
        </div>
      </section>`;
  }

  const onClick = (ev) => {
    const b = ev.target.closest('button, [data-card]');
    if (!b) return;
    if ('redo' in b.dataset) return start(st.missed.slice(), false);
    if ('pick' in b.dataset) return picker();
    if (!st.active) return;
    if (b.matches('[data-card]') || 'flip' in b.dataset) { st.flipped = !st.flipped; draw(); }
    else if ('knew' in b.dataset) mark(true);
    else if ('again' in b.dataset) mark(false);
  };
  const onKey = (ev) => {
    if (!st.active || ev.target.matches('input, textarea, select')) return;
    if (ev.key === ' ' || (ev.key === 'Enter' && !ev.target.closest('button'))) { ev.preventDefault(); st.flipped = !st.flipped; draw(); }
    else if (st.flipped && ev.key === '1') mark(false);
    else if (st.flipped && ev.key === '2') mark(true);
  };
  main.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  picker();
  return () => { main.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); };
}

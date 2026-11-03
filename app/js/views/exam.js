import { getExam } from '../data.js';
import * as store from '../store.js';
import { esc, ring, meter, toneFor, plural, icon } from '../ui.js';
import { readiness, topicMastery, dueIds, mistakeIds } from '../engine.js';
import * as cloud from '../cloud.js';

export async function render(main, { id }) {
  const exam = await getExam(id);
  if (!exam) {
    main.innerHTML = `<section class="page narrow empty-state"><h1>Exam not found</h1><p>It may have been removed or renamed.</p><a class="btn primary" href="#/">See all exams</a></section>`;
    return;
  }
  const stats = store.getStats(exam.id);
  const attempts = store.getAttempts(exam.id);
  const saved = store.getSaved(exam.id);
  const ready = readiness(exam, stats, attempts);
  const topics = topicMastery(exam, stats);
  const due = dueIds(exam, stats).length;
  const unseen = exam.questions.filter((q) => !stats[q.id]?.seen).length;
  const missed = mistakeIds(exam, stats).length;
  const onExam = exam.questions.filter((q) => q.onExam).length;
  const realCount = onExam || exam.questions.length;
  const e = encodeURIComponent(exam.id);

  const smartSub = due ? `${plural(due, 'question')} due for review` : unseen ? `${unseen} you haven't tried yet` : 'Everything is up to date';

  main.innerHTML = `
    <section class="page exam-hub">
      <nav class="crumbs"><a href="#/">Exams</a></nav>
      <header class="hub-head">
        <div>
          ${exam.course ? `<p class="course">${esc(exam.course)}</p>` : ''}
          <h1>${esc(exam.title)}</h1>
          <p class="muted">${plural(exam.questions.length, 'question')} across ${plural(exam.topics.length, 'topic')}${exam.preview ? ' · Preview from your file' : ''}</p>
          ${(() => { const d = cloud.classForExam(exam.id)?.examDates?.[exam.id] || exam.examDate; if (!d) return ''; const n = Math.ceil((new Date(d + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000); return n >= 0 ? `<p class="countdown-chip">${icon('clock')} ${n === 0 ? 'Exam is today' : `Exam in ${plural(n, 'day')}`}</p>` : ''; })()}
        </div>
        <a class="hub-ready" href="#/progress/${e}" aria-label="Quiz readiness ${ready.score}%. See progress">
          ${ring(ready.score, { size: 96, stroke: 9, label: ready.score + '%', tone: toneFor(ready.score / 100) })}
          <span><span class="muted small">Quiz readiness</span><strong>${esc(ready.label)}</strong><span class="muted">See my progress</span></span>
        </a>
      </header>

      <div class="mode-primary">
        <a class="mode-card exam" href="#/start/${e}/exam">
          <span class="mode-name">Timed practice test</span>
          <span class="mode-sub">${plural(realCount, 'question')} in a fixed order${exam.timeLimit ? `, ${exam.timeLimit} minutes` : ''}, scored at the end. Practice only, not graded.</span>
        </a>
        <a class="mode-card mock" href="#/start/${e}/mock">
          <span class="mode-name">Random practice test</span>
          <span class="mode-sub">A new set of ${realCount} questions each time, same topic mix${exam.timeLimit ? `, ${exam.timeLimit} minutes` : ''}.</span>
        </a>
        <a class="mode-card smart" href="#/start/${e}/smart">
          <span class="mode-name">Smart review</span>
          <span class="mode-sub">${esc(smartSub)}. Focuses on what you're most likely to forget.</span>
        </a>
      </div>

      ${exam.assignmentCount ? (() => {
        const prog = store.getAsgProgress(exam.id);
        const done = Object.values(prog).filter((x) => x.done).length;
        return `<a class="code-card" href="#/assignments/${e}">
          <span class="code-card-icon" aria-hidden="true">{ }</span>
          <span class="code-card-text"><span class="mode-name">Programming assignments</span>
          <span class="mode-sub">${plural(exam.assignmentCount, 'Java program')} to write and test right in your browser${done ? ` · ${done} of ${exam.assignmentCount} done` : ''}</span></span>
          ${done ? `<span class="code-card-meter">${meter(done / exam.assignmentCount, { tone: done === exam.assignmentCount ? 'good' : '' })}</span>` : ''}
          ${icon('right')}
        </a>`;
      })() : ''}

      <h2 class="section-title">More ways to practice</h2>
      <ul class="more-list">
        ${[
          { ic: 'target', name: 'Practice by topic', sub: 'Choose one or more topics', href: `#/start/${e}/topic` },
          { ic: 'shuffle', name: 'Full question bank', sub: `All ${exam.questions.length}, shuffled`, href: `#/start/${e}/bank` },
          { ic: 'settings', name: 'Custom test', sub: 'Your topics, length and timer', href: `#/start/${e}/custom` },
          { ic: 'x', name: 'My mistakes', sub: missed ? plural(missed, 'question') + ' to fix' : 'Nothing to fix yet', href: missed ? `#/start/${e}/mistakes` : null },
          { ic: 'star', name: 'Saved questions', sub: saved.length ? plural(saved.length, 'question') : 'Star a question to save it', href: saved.length ? `#/start/${e}/saved` : null },
          { ic: 'book', name: 'Flashcards', sub: 'Flip through answers fast', href: `#/cards/${e}` },
          { ic: 'search', name: 'Browse all questions', sub: 'Search, read answers, add notes', href: `#/browse/${e}` },
          { ic: 'chart', name: 'My progress', sub: attempts.length ? plural(attempts.length, 'quiz', 'quizzes') + ' so far' : 'Scores and weak spots', href: `#/progress/${e}` },
        ].map((m) => `
          <li><${m.href ? `a href="${m.href}"` : 'span aria-disabled="true"'} class="more-item ${m.href ? '' : 'disabled'}">
            <span class="more-icon" aria-hidden="true">${icon(m.ic)}</span>
            <span class="more-text"><span class="more-name">${m.name}</span><span class="muted small">${esc(m.sub)}</span></span>
            ${m.href ? icon('right') : ''}
          </${m.href ? 'a' : 'span'}></li>`).join('')}
      </ul>

      <div class="topics-head">
        <h2 class="section-title">Topics</h2>
        ${topics.some((t) => t.seen) ? '<span class="muted small">Weakest first</span>' : ''}
      </div>
      <ul class="topic-list" data-topics>
        ${(topics.some((t) => t.seen) ? [...topics].sort((a, b) => (a.seen ? a.mastery : 2) - (b.seen ? b.mastery : 2)) : topics).map((t, i) => `
          <li ${i >= 6 ? 'data-extra hidden' : ''}>
            <div class="topic-info">
              <span class="topic-name">${esc(t.name)}</span>
              <span class="muted small">${t.seen}/${t.count} tried${t.accuracy != null ? ` · ${Math.round(t.accuracy * 100)}% correct` : ''}${t.due ? ` · ${t.due} due` : ''}</span>
            </div>
            <div class="topic-meter" title="Mastery ${Math.round(t.mastery * 100)}%">${meter(t.mastery, { tone: t.seen ? toneFor(t.mastery) : 'muted' })}</div>
            <a class="btn small" href="#/start/${e}/topic?topic=${encodeURIComponent(t.name)}" aria-label="Practice ${esc(t.name)}">Practice</a>
          </li>`).join('')}
      </ul>
      ${topics.length > 6 ? `<button class="btn small show-all" data-show-topics>Show all ${topics.length} topics</button>` : ''}
    </section>`;

  main.querySelector('[data-show-topics]')?.addEventListener('click', (ev) => {
    main.querySelectorAll('[data-extra]').forEach((li) => (li.hidden = false));
    ev.currentTarget.remove();
  });
}

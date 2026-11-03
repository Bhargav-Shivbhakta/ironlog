// "Next up" study panel for the class / home page: one clear next step,
// a small progress strip, the weakest topics and assignment progress.
import { getExam, getAssignments } from '../data.js';
import * as store from '../store.js';
import { esc, icon, ring, plural, toneFor } from '../ui.js';
import { readiness, topicMastery, dueIds, streakDays, MODES } from '../engine.js';

const DAY = 86400000;

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return null;
  const n = Math.ceil((d - new Date(new Date().toDateString())) / DAY);
  return n >= 0 ? n : null;
}

// What should this student do right now? Returns { title, sub, href, cta, icon }.
function nextStep(exam, stats, attempts, asgList, asgProg) {
  const e = encodeURIComponent(exam.id);
  const session = store.getSession();
  if (session && session.examId === exam.id) {
    const left = session.questionIds.length - Object.keys(session.answers).length;
    return { icon: 'play', title: `Finish your ${MODES[session.mode]?.label.toLowerCase() || 'quiz'}`, sub: `${plural(left, 'question')} left. Your answers so far are saved.`, href: '#/quiz', cta: 'Resume' };
  }
  const seen = exam.questions.filter((q) => stats[q.id]?.seen).length;
  if (!seen) return { icon: 'sparkle', title: 'Start with a quick warm-up', sub: `A mix of questions from across ${exam.title}, with each answer explained as you go.`, href: `#/start/${e}/smart`, cta: 'Start warm-up' };
  const due = dueIds(exam, stats).length;
  if (due >= 5) return { icon: 'flame', title: `Review ${plural(due, 'question')} due today`, sub: `About ${Math.max(2, Math.round(due * 0.6))} minutes. Reviewing at the right time is what makes answers stick.`, href: `#/start/${e}/smart`, cta: 'Start review' };
  const topics = topicMastery(exam, stats).filter((t) => t.seen >= 3 && t.accuracy != null).sort((a, b) => a.accuracy - b.accuracy);
  const weak = topics[0];
  if (weak && weak.accuracy < 0.7) return { icon: 'target', title: `Strengthen ${weak.name}`, sub: `You're getting ${Math.round(weak.accuracy * 100)}% right in this topic. A focused round will help most.`, href: `#/start/${e}/topic?topic=${encodeURIComponent(weak.name)}`, cta: 'Practice this topic' };
  const asgOpen = asgList.find((a) => asgProg[a.slug]?.attempts && !asgProg[a.slug]?.done);
  if (asgOpen) return { icon: 'code', title: `Finish "${asgOpen.title}"`, sub: `${asgProg[asgOpen.slug].best} of ${asgProg[asgOpen.slug].total} checks passing so far.`, href: `#/code/${e}/${asgOpen.slug}`, cta: 'Open assignment' };
  const unseen = exam.questions.length - seen;
  if (unseen > exam.questions.length * 0.3) return { icon: 'sparkle', title: `Try ${Math.min(20, unseen)} new questions`, sub: `You haven't seen ${unseen} of the ${exam.questions.length} questions yet.`, href: `#/start/${e}/smart`, cta: 'Keep going' };
  const timed = attempts.some((a) => a.mode === 'exam');
  if (!timed) return { icon: 'clock', title: 'Take the timed practice test', sub: `See how you do under exam conditions${exam.timeLimit ? ` (${exam.timeLimit} minutes)` : ''}. Practice only, not graded.`, href: `#/start/${e}/exam`, cta: 'Start timed test' };
  return { icon: 'clock', title: 'Try a random practice test', sub: 'A fresh set of questions with the same topic mix as the exam.', href: `#/start/${e}/mock`, cta: 'Start test' };
}

export async function studyPanel(examMeta) {
  let exam;
  try { exam = await getExam(examMeta.id); } catch { return ''; }
  const stats = store.getStats(exam.id);
  const attempts = store.getAttempts(exam.id);
  const asgList = examMeta.assignmentCount ? await getAssignments(exam.id).catch(() => []) : [];
  const asgProg = store.getAsgProgress(exam.id);
  const r = readiness(exam, stats, attempts);
  const step = nextStep(exam, stats, attempts, asgList, asgProg);
  const activity = store.getActivity();
  let week = 0;
  for (let i = 0; i < 7; i++) { const d = new Date(Date.now() - i * DAY).toLocaleDateString('en-CA'); week += activity[d]?.answered || 0; }
  const streak = streakDays(activity);
  const asgDone = asgList.filter((a) => asgProg[a.slug]?.done).length;
  const until = daysUntil(examMeta.examDate);
  const e = encodeURIComponent(exam.id);
  const topics = topicMastery(exam, stats);
  const anySeen = topics.some((t) => t.seen);
  const weakest = anySeen
    ? topics.filter((t) => t.seen).sort((a, b) => (a.accuracy ?? 1) - (b.accuracy ?? 1) || a.mastery - b.mastery).slice(0, 3)
    : [];
  const untouched = topics.filter((t) => !t.seen).slice(0, Math.max(0, 3 - weakest.length));

  return `
    <section class="study" aria-label="Your study plan for ${esc(exam.title)}">
      <div class="next-up">
        <span class="next-icon" aria-hidden="true">${icon(step.icon)}</span>
        <div class="next-text">
          <p class="eyebrow">Next up${until != null ? ` · ${until === 0 ? 'exam is today' : `${esc(exam.title)} in ${plural(until, 'day')}`}` : ''}</p>
          <h2>${esc(step.title)}</h2>
          <p>${esc(step.sub)}</p>
        </div>
        <a class="btn primary big next-cta" href="${step.href}">${esc(step.cta)} ${icon('right')}</a>
      </div>
      <div class="stat-strip">
        <a class="strip-item ready" href="#/progress/${e}">
          ${ring(r.score, { size: 58, stroke: 6, label: r.score + '', tone: toneFor(r.score / 100) })}
          <span><strong>${esc(r.label)}</strong><span class="muted small">Quiz readiness</span></span>
        </a>
        <div class="strip-item"><span class="strip-icon" aria-hidden="true">${icon('check')}</span><span><strong>${week}</strong><span class="muted small">answered this week</span></span></div>
        <div class="strip-item"><span class="strip-icon flame" aria-hidden="true">${icon('flame')}</span><span><strong>${plural(streak, 'day')}</strong><span class="muted small">study streak</span></span></div>
        ${asgList.length ? `<a class="strip-item" href="#/assignments/${e}"><span class="strip-icon" aria-hidden="true">${icon('code')}</span><span><strong>${asgDone} of ${asgList.length}</strong><span class="muted small">assignments done</span></span></a>` : ''}
      </div>
      ${weakest.length || untouched.length ? `
      <div class="focus-topics">
        <h3>${anySeen ? 'Focus on' : 'Topics to start with'}</h3>
        <div class="focus-list">
          ${weakest.map((t) => `<a class="focus-chip" href="#/start/${e}/topic?topic=${encodeURIComponent(t.name)}"><span class="focus-name">${esc(t.name)}</span><span class="pill ${toneFor(t.accuracy)}">${t.accuracy == null ? 'new' : Math.round(t.accuracy * 100) + '%'}</span></a>`).join('')}
          ${untouched.map((t) => `<a class="focus-chip" href="#/start/${e}/topic?topic=${encodeURIComponent(t.name)}"><span class="focus-name">${esc(t.name)}</span><span class="pill">new</span></a>`).join('')}
        </div>
      </div>` : ''}
    </section>`;
}

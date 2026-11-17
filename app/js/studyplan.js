// What a student should do today and this week, worked out from what they have already done.
// Pure functions (no page, no database) so the rules can be tested.
//
// The rules follow what is known to work: redo mistakes first, review what is due before it is
// forgotten, a little new material, spread over several short sessions.
const DAY = 86400000;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// sets: [{ id, title, unit?, mistakes, due, questions, seen }]   one per practice set the student can open
// unit: the unit that is being taught now { id, n, title, read, examId } | null
// answeredToday: questions answered today
// → up to 3 tasks: { key, title, why, minutes, href, done }
export function todayTasks({ classId, sets, unit, answeredToday = 0 }) {
  const e = encodeURIComponent, out = [];
  const withMistakes = sets.filter((s) => s.mistakes > 0).sort((a, b) => b.mistakes - a.mistakes);
  const mistakes = withMistakes.reduce((n, s) => n + s.mistakes, 0);
  if (mistakes) out.push({ key: 'mistakes', title: `Redo ${plural(mistakes, 'question')} you got wrong`, why: `Start here, while you can still fix them. ${withMistakes.length > 1 ? `Most are in ${withMistakes[0].title}.` : `From ${withMistakes[0].title}.`}`, minutes: Math.min(15, Math.max(3, mistakes)), href: `#/start/${e(withMistakes[0].id)}/mistakes`, done: false });
  const withDue = sets.filter((s) => s.due > 0).sort((a, b) => b.due - a.due);
  const due = withDue.reduce((n, s) => n + s.due, 0);
  if (due) out.push({ key: 'due', title: `Review ${plural(due, 'question')} that ${due === 1 ? 'is' : 'are'} due`, why: 'These come back just before you would forget them. Reviewing now is what makes them stick.', minutes: Math.min(15, Math.max(3, Math.round(due * 0.6))), href: `#/start/${e(withDue[0].id)}/smart`, done: false });
  if (unit) {
    if (!unit.read) out.push({ key: 'read', title: `Read Unit ${unit.n}: ${unit.title}`, why: 'This week\'s unit. Read the notes once, then practise.', minutes: 15, href: `#/study/${e(classId)}/${e(unit.id)}`, done: false });
    else if (unit.examId && sets.some((s) => s.id === unit.examId)) out.push({ key: 'practice', title: `Practise Unit ${unit.n}: ${unit.title}`, why: 'About ten questions, each one explained as you go.', minutes: 15, href: `#/start/${e(unit.examId)}/smart`, done: answeredToday >= 10 });
  }
  if (!out.length) {
    const fresh = sets.find((s) => s.seen < s.questions);
    if (fresh) out.push({ key: 'new', title: `Try new questions in ${fresh.title}`, why: 'You have not seen all of these yet.', minutes: 10, href: `#/start/${e(fresh.id)}/smart`, done: answeredToday >= 10 });
  }
  return out.slice(0, 3);
}

// A plan for the next 7 days. daysPerWeek 3, 4 or 5. graded: [{ title, at (ms) }] upcoming quizzes and exams.
// → [{ date (ms, local midnight), items: [{ text, minutes }], graded?: title }]
export function weekPlan({ now = Date.now(), daysPerWeek = 4, unit = null, hasAssignment = false, earlier = 0, graded = [] }) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const day = (i) => start.getTime() + i * DAY;
  const pattern = { 3: [0, 2, 5], 4: [0, 1, 3, 5], 5: [0, 1, 2, 4, 5] }[daysPerWeek] || [0, 1, 3, 5];
  const u = unit ? `Unit ${unit.n}` : 'this week\'s unit';
  const sessions = [
    [{ text: 'Redo what you got wrong', minutes: 10 }, { text: `Read ${u}`, minutes: 15 }],
    [{ text: `Practise ${u}`, minutes: 20 }],
    hasAssignment ? [{ text: `Programming assignment for ${u}`, minutes: 40 }] : [{ text: `Practise ${u} again, the questions you have not seen`, minutes: 20 }],
    earlier ? [{ text: `Mixed review of ${earlier === 1 ? 'the earlier unit' : `the ${earlier} earlier units`}`, minutes: 20 }] : [{ text: 'Review what is due', minutes: 15 }],
    [{ text: 'Flashcards for everything so far', minutes: 10 }],
  ];
  // with fewer days, the sessions are joined so nothing is dropped
  const groups = daysPerWeek === 3 ? [[0], [1, 3], [2, 4]] : daysPerWeek === 4 ? [[0], [1], [2], [3, 4]] : [[0], [1], [2], [3], [4]];
  const plan = pattern.map((offset, i) => ({ date: day(offset), items: groups[i].flatMap((k) => sessions[k]) }));
  // the day before something graded: a timed run-through instead, and nothing new
  for (const g of graded.filter((x) => x.at > now && x.at < day(8)).sort((a, b) => a.at - b.at).slice(0, 2)) {
    const gd = new Date(g.at); gd.setHours(0, 0, 0, 0);
    const before = gd.getTime() - DAY;
    if (before < day(0)) continue;
    let d = plan.find((p) => p.date === before);
    if (!d) { d = { date: before, items: [] }; plan.push(d); }
    d.items = [{ text: `Timed practice test, like the real one, then redo what you missed`, minutes: 35 }];
    d.graded = g.title;
  }
  return plan.sort((a, b) => a.date - b.date).map((p) => ({ ...p, minutes: p.items.reduce((n, x) => n + x.minutes, 0) }));
}

// Rules the AI tutor is given, with the unit's notes. The student pastes this into their own AI.
export function tutorPrompt({ course, unit, notes }) {
  return `You are a patient tutor for a university student in ${course || 'this course'}. Follow these rules for the whole conversation:

1. Coach, do not solve. Give hints, ask a guiding question, or explain the idea with a different example. Never write the finished answer to a homework, quiz, exam or assignment question, even if asked directly; say you can help them get there instead.
2. Use only the course notes below as your source for facts about this course. If the notes do not cover something, say so and suggest the student ask their instructor.
3. Keep answers short and in plain words. Check understanding by asking the student to explain it back.
4. If the student says they are taking a quiz or exam right now, stop helping and tell them to come back afterwards.
5. You can be wrong. If you and the notes disagree, the notes are right.

Start by asking the student what they are stuck on in ${unit ? `Unit ${unit.n}: ${unit.title}` : 'the course'}.

COURSE NOTES
${String(notes || '').slice(0, 12000)}`;
}

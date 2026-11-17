// A practice run for the connector, with no school data: a small sample Java course kept in the
// Worker's own key-value store (binding name BUILDS). Any link code starting with "demo-" opens it.
//   GET /demo/<code>           what has been done so far, and everything that was made (plain text)
//   GET /demo/<code>?reset=1   start the practice run again
import { createBuild, needs } from '../app/js/build/engine.js';
import { stripOutputs } from './store.mjs';

const part = (label, text) => ({ label, text });
export const DEMO_FILES = [
  { id: 'd1', name: 'Lecture 05 Decisions.pptx', chunks: 1, parts: [
    part('slide 1', 'CS 150 Introduction to Programming\nLecture 5: Making decisions'),
    part('slide 2', 'Boolean expressions\nA boolean expression is either true or false.\nRelational operators compare two values: < <= > >= == !=\nUse == to compare, = to assign. Writing if (x = 5) is a compile error in Java.\nExample: int age = 20; boolean adult = age >= 18; // true'),
    part('slide 3', 'The if statement\nif (condition) { statements }\nThe statements run only when the condition is true.\nAlways use braces, even for one statement. Without braces only the first statement belongs to the if.\nExample:\nif (temp > 100) {\n  System.out.println("Too hot");\n}'),
    part('slide 4', 'if / else and else-if chains\nelse runs when the condition is false.\nAn else-if chain checks conditions from top to bottom and runs only the FIRST branch that is true.\nOrder matters: check the most specific case first.\nExample:\nif (score >= 90) grade = "A";\nelse if (score >= 80) grade = "B";\nelse if (score >= 70) grade = "C";\nelse grade = "F";\nA score of 95 gets "A" only, even though 95 >= 80 is also true.'),
    part('slide 5', 'Logical operators\n&& (and): true only when both sides are true\n|| (or): true when at least one side is true\n! (not): flips true and false\nShort-circuit: with &&, if the left side is false the right side is not evaluated. With ||, if the left side is true the right side is not evaluated.\nExample: if (count != 0 && total / count > 10) is safe, because the division is skipped when count is 0.\nRange check: write x >= 1 && x <= 10. Java does not allow 1 <= x <= 10.'),
    part('slide 6', 'Comparing Strings\nDo not use == for Strings: it compares whether they are the same object, not the same letters.\nUse a.equals(b). Use a.equalsIgnoreCase(b) to ignore upper and lower case.\nExample: if (answer.equals("yes")) { ... }'),
    part('slide 7', 'Announcements\nLab 4 is due Friday. Quiz 2 is next Tuesday in class. Office hours moved to Thursday 2 to 4.'),
  ] },
  { id: 'd2', name: 'Lecture 06 While loops.pptx', chunks: 1, parts: [
    part('slide 1', 'Lecture 6: Repeating with while'),
    part('slide 2', 'The while loop\nwhile (condition) { body }\nThe condition is checked BEFORE each pass. If it is false the first time, the body never runs.\nSomething in the body must change so the condition becomes false, or the loop never ends (an infinite loop).\nExample:\nint n = 3;\nwhile (n > 0) {\n  System.out.println(n);\n  n--;\n}\nPrints 3, 2, 1.'),
    part('slide 3', 'Counter-controlled loops\nThree parts: start the counter, test it, change it.\nint i = 1;            // start\nwhile (i <= 5) {      // test\n  System.out.println(i);\n  i++;                // change\n}\nOff-by-one errors: i < 5 runs 4 times when starting at 1; i <= 5 runs 5 times. Trace the first and last pass to check.'),
    part('slide 4', 'Sentinel loops\nUse when you do not know how many values there are. A sentinel is a special value that means "stop", such as -1.\nPattern (priming read): read a value before the loop, then read the next value at the END of the body.\nint x = in.nextInt();\nwhile (x != -1) {\n  sum += x;\n  x = in.nextInt();\n}\nThe sentinel itself must not be added to the sum.'),
    part('slide 5', 'Accumulators\nA running total: start at 0 before the loop, add inside the loop.\nA running count: start at 0, add 1 inside the loop.\nA running maximum: start with the first value, replace it when a bigger one is seen.\nAverage = sum / count. Use a double, and check count is not 0 before dividing.\nCommon mistake: declaring sum inside the loop resets it to 0 on every pass.'),
    part('slide 6', 'The do-while loop\ndo { body } while (condition);\nThe body runs at least once because the condition is checked AFTER each pass. Note the semicolon at the end.\nGood for menus and input checking: ask, then repeat while the answer is not valid.'),
  ] },
  { id: 'd3', name: 'Week 7 notes - for loops.docx', chunks: 1, parts: [
    part('The for loop', 'The for loop\nA for loop puts the three parts of a counter loop on one line: for (start; test; change) { body }.\nfor (int i = 0; i < 5; i++) { System.out.println(i); } prints 0 1 2 3 4, one per line. It runs 5 times.\nThe variable i exists only inside the loop. Use a for loop when you know the number of passes before the loop starts; use while when you do not.\nCounting down: for (int i = 10; i >= 1; i--). Counting by twos: for (int i = 0; i <= 10; i += 2).'),
    part('Nested loops', 'Nested loops\nA loop inside a loop. For each single pass of the outer loop, the inner loop runs all of its passes.\nfor (int row = 1; row <= 3; row++) {\n  for (int col = 1; col <= 4; col++) {\n    System.out.print("*");\n  }\n  System.out.println();\n}\nprints 3 rows of 4 stars. The body of the inner loop runs 3 x 4 = 12 times.\nUse different counter names for the two loops. The println that ends the row belongs to the outer loop, after the inner loop finishes.'),
    part('break and continue', 'break and continue\nbreak leaves the nearest loop immediately. continue skips the rest of the body and goes to the next pass.\nIn a for loop, continue still runs the change step (i++). In a while loop, a continue placed before the change step causes an infinite loop.\nUse them sparingly: a clear loop condition is usually easier to read.'),
  ] },
];
export const DEMO_SETUP = { team: true, kinds: { concepts: true, programming: true }, firstDay: '2027-01-20', lastDay: '2027-03-10', approveMap: false,
  exams: [{ name: 'Midterm', date: '2027-03-12' }], make: { notes: true, practice: true, quiz: true, exams: true, assignments: true, progExams: false }, wishes: '' };
export const isDemo = (code) => /^demo-/.test(code);

// kv: { get(key) → text | null, put(key, text), delete(key) }
export function demoStore(kv, { hooks = {} } = {}) {
  return {
    async open(code) {
      if (!isDemo(code)) return null;
      const saved = await kv.get(`st:${code}`);
      const st = saved ? JSON.parse(saved) : createBuild(DEMO_SETUP, DEMO_FILES);
      const ctx = { files: DEMO_FILES, outputs: {} };
      return {
        st, ctx, hooks,
        async load(stepId) { for (const id of needs(st, stepId).outputs) { const o = await kv.get(`out:${code}:${id}`); if (o) ctx.outputs[id] = JSON.parse(o); } },
        async save(s, done) {
          for (const id of [].concat(done || [])) if (s.steps[id]?.status === 'done') await kv.put(`out:${code}:${id}`, JSON.stringify(s.steps[id].output));
          const next = JSON.stringify({ ...stripOutputs(s), calls: (st.calls || 0) + 1, lastCallAt: Date.now() });
          if (next !== saved) await kv.put(`st:${code}`, next);
        },
      };
    },
  };
}
export async function demoPage(kv, code, reset) {
  if (!isDemo(code)) return new Response('Not found', { status: 404 });
  const saved = await kv.get(`st:${code}`);
  if (reset && saved) {
    for (const id of JSON.parse(saved).order) await kv.delete(`out:${code}:${id}`);
    await kv.delete(`st:${code}`);
    return new Response('The practice run was cleared. It starts again at the first job.', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  if (!saved) return new Response('Nothing yet: the AI has not asked for a job on this link.', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const st = JSON.parse(saved), lines = [`PHASE ${st.phase} · calls ${st.calls || 0} · last call ${st.lastCallAt ? new Date(st.lastCallAt).toISOString() : '-'}`, ''];
  for (const id of st.order) { const s = st.steps[id]; lines.push(`[${s.status}] ${s.role || 'build'} · ${id} · ${s.title} · tries ${s.tries}${s.note ? ` · ${s.note}` : ''}`); for (const p of s.problems || []) lines.push(`      last problem: ${p}`); }
  if (st.map) { lines.push('', 'COURSE MAP'); for (const u of st.map.units) lines.push(`  Unit ${u.n}: ${u.title} (${u.start} to ${u.end}) — ${u.topics.map((g) => g.title).join('; ')}`); for (const e of st.map.exams) lines.push(`  ${e.name} ${e.date}: units ${e.units.join(', ')}`); }
  for (const id of st.order) {
    if (st.steps[id].status !== 'done') continue;
    const o = await kv.get(`out:${code}:${id}`); if (!o) continue;
    const v = JSON.parse(o);
    lines.push('', `==================== ${id} ====================`, typeof v === 'string' ? v : v?.files ? Object.entries(v.files).map(([k, t]) => `--- ${k} ---\n${t}`).join('\n') : JSON.stringify(v, null, 1));
  }
  return new Response(lines.join('\n'), { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}

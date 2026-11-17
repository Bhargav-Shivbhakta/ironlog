#!/usr/bin/env node
// Quick self-tests for the question parser and grading. Run with:  npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseExam, gradeQuestion, isAnswered, parseNumber, correctAnswerLabel } from '../app/js/parser.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗ ${name}\x1b[0m\n    ${e.message.split('\n').join('\n    ')}`); }
}
async function atest(name, fn) {
  try { await fn(); passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗ ${name}\x1b[0m\n    ${e.message.split('\n').join('\n    ')}`); }
}
const parse = (body, head = '---\ntitle: T\n---\n# Topic: A\n') => parseExam(head + body);
const one = (body) => { const r = parse(body); assert.deepEqual(r.errors, [], JSON.stringify(r.errors)); return r.questions[0]; };

console.log('\nParser');
test('reads settings, topics and question tags', () => {
  const r = parseExam(`---\ntitle: Midterm 2\nactive: true\ntime_limit: 75   # minutes\npass_mark: 70\n---\n# Topic: Recursion\n## Q1 · single · hard · on-exam · 2pts\nText\n- [ ] a\n- [x] b\n> Explanation: because\n# Sorting\n## Q2\nMore\n- [x] c\n- [ ] d`);
  assert.deepEqual(r.errors, []);
  assert.equal(r.meta.title, 'Midterm 2');
  assert.equal(r.meta.active, true);
  assert.equal(r.meta.timeLimit, 75);
  assert.equal(r.meta.passMark, 70);
  assert.deepEqual(r.topics.map((t) => t.name), ['Recursion', 'Sorting']);
  const [q1, q2] = r.questions;
  assert.equal(q1.type, 'single'); assert.equal(q1.difficulty, 'hard'); assert.equal(q1.onExam, true); assert.equal(q1.points, 2);
  assert.equal(q1.explanation, 'because');
  assert.equal(q2.type, 'single'); assert.equal(q2.topic, 'Sorting'); assert.equal(q2.difficulty, 'medium');
});
test('infers multi when several choices are marked and no type is given', () => {
  assert.equal(one('## Q1\nPick\n- [x] a\n- [x] b\n- [ ] c').type, 'multi');
});
test('infers true/false, numeric and text from the answer line', () => {
  assert.equal(one('## Q1\nT?\n= true').type, 'truefalse');
  assert.equal(one('## Q1\nN?\n= 3.5').type, 'numeric');
  assert.equal(one('## Q1\nW?\n= mitochondria').type, 'text');
});
test('keeps code blocks with "- [ ]" lines inside as question text', () => {
  const q = one('## Q1\nWhat prints?\n```\n- [x] not a choice\n```\n- [x] a\n- [ ] b');
  assert.equal(q.options.length, 2);
  assert.match(q.text, /not a choice/);
});
test('hints and multi-line explanations', () => {
  const q = one('## Q1\nX\n- [x] a\n- [ ] b\n> Hint: think\n> Explanation: line one\n> line two');
  assert.equal(q.hint, 'think');
  assert.equal(q.explanation, 'line one\nline two');
});
test('CHECK comments become warnings, not errors', () => {
  const r = parse('## Q1\nX <!-- CHECK: answer key unclear -->\n- [x] a\n- [ ] b');
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0].message, /answer key unclear/);
});

console.log('\nError messages');
const expectError = (body, re) => { const r = parse(body); assert.ok(r.errors.some((e) => re.test(e.message)), `expected ${re}, got ${JSON.stringify(r.errors.map((e) => e.message))}`); };
test('no correct answer marked', () => expectError('## Q1\nX\n- [ ] a\n- [ ] b', /no correct answer/));
test('single with two correct answers', () => expectError('## Q1 · single\nX\n- [x] a\n- [x] b', /2 choices marked correct/));
test('duplicate question IDs', () => expectError('## Q1\nX\n- [x] a\n- [ ] b\n## Q1\nY\n- [x] a\n- [ ] b', /used twice/));
test('numeric with a non-number answer', () => expectError('## Q1 · numeric\nX\n= twelve', /isn't a number/));
test('only one choice', () => expectError('## Q1 · single\nX\n- [x] a', /at least two/));
test('missing question text', () => expectError('## Q1\n- [x] a\n- [ ] b', /no question text/));
test('unclosed settings block', () => { const r = parseExam('---\ntitle: X\n# Topic\n## Q1\nX\n- [x] a\n- [ ] b'); assert.ok(r.errors.some((e) => /never ends/.test(e.message))); });
test('error line numbers point at the right line', () => {
  const r = parse('## Q1\nX\n- [x] a\n- [ ] b\n## Q2 · numeric\nY\n= abc');
  const e = r.errors.find((x) => /isn't a number/.test(x.message));
  assert.equal(e.line, 11);
});

console.log('\nGrading');
test('single and multi choice', () => {
  const s = one('## Q1\nX\n- [ ] a\n- [x] b');
  assert.equal(gradeQuestion(s, 1), true);
  assert.equal(gradeQuestion(s, 0), false);
  assert.equal(gradeQuestion(s, undefined), false);
  const m = one('## Q1 · multi\nX\n- [x] a\n- [ ] b\n- [x] c');
  assert.equal(gradeQuestion(m, [2, 0]), true);
  assert.equal(gradeQuestion(m, [0]), false);
  assert.equal(gradeQuestion(m, [0, 1, 2]), false);
});
test('true/false becomes two choices', () => {
  const q = one('## Q1\nX\n= false');
  assert.deepEqual(q.options.map((o) => o.text), ['True', 'False']);
  assert.equal(gradeQuestion(q, 1), true);
});
test('numeric: exact, tolerance, percent, range, fractions, commas', () => {
  const exact = one('## Q1 · numeric\nX\n= 42');
  assert.equal(gradeQuestion(exact, '42'), true);
  assert.equal(gradeQuestion(exact, '42.0'), true);
  assert.equal(gradeQuestion(exact, '41.9'), false);
  const tol = one('## Q1 · numeric\nX\n= 3.14 ± 0.01');
  assert.equal(gradeQuestion(tol, '3.149'), true);
  assert.equal(gradeQuestion(tol, '3.16'), false);
  const pct = one('## Q1 · numeric\nX\n= 200 ± 5%');
  assert.equal(gradeQuestion(pct, '209'), true);
  assert.equal(gradeQuestion(pct, '211'), false);
  const frac = one('## Q1 · numeric\nX\n= 0.25');
  assert.equal(gradeQuestion(frac, '1/4'), true);
  assert.equal(parseNumber('1,000'), 1000);
  assert.equal(gradeQuestion(exact, 'abc'), false);
  assert.ok(correctAnswerLabel(tol).includes('3.14'));
});
test('text: case, spacing, trailing period and alternatives', () => {
  const q = one('## Q1\nX\n= chloroplast | chloroplasts');
  assert.equal(gradeQuestion(q, '  Chloroplasts. '), true);
  assert.equal(gradeQuestion(q, 'chlorophyll'), false);
  assert.equal(isAnswered(q, '   '), false);
});

console.log('\nExam files in this repo');
const examsDir = path.join(ROOT, 'exams');
const examFiles = [];
(function walk(dir, depth) {
  if (!fs.existsSync(dir)) return; // exams can all live on the site instead
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory() && depth < 2) walk(full, depth + 1);
    else if (e.isFile() && e.name.endsWith('.md') && !/^readme/i.test(e.name)) examFiles.push(full);
  }
})(examsDir, 0);
for (const f of examFiles) {
  test(`${path.relative(ROOT, f)} parses without errors and every answer key grades as correct`, () => {
    const r = parseExam(fs.readFileSync(f, 'utf8'));
    assert.deepEqual(r.errors, [], r.errors.map((e) => `line ${e.line}: ${e.message}`).join('\n'));
    for (const q of r.questions) {
      let v;
      if (q.type === 'multi') v = q.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
      else if (q.options) v = q.options.findIndex((o) => o.correct);
      else if (q.type === 'numeric') v = String(q.answer.numeric[0].value ?? q.answer.numeric[0].min);
      else v = q.answer.text[0];
      assert.equal(gradeQuestion(q, v), true, `${q.id}: its own answer key graded as wrong`);
    }
  });
}

console.log('\nMock exams');
{
  const { mockPick } = await import('../app/js/engine.js');
  for (const f of examFiles) {
    if (f.includes(`${path.sep}_`)) continue;
    const entry = { name: path.relative(examsDir, path.dirname(f)) };
    const r = parseExam(fs.readFileSync(f, 'utf8'));
    const exam = { ...r.meta, topics: r.topics, questions: r.questions };
    const real = r.questions.filter((q) => q.onExam);
    if (!real.length) continue;
    test(`${entry.name}: mock exams match the real exam's length and topic mix, with no repeats`, () => {
      for (let k = 0; k < 20; k++) {
        const m = mockPick(exam);
        assert.equal(m.length, real.length);
        assert.equal(new Set(m.map((q) => q.id)).size, m.length);
        for (const t of r.topics) assert.equal(m.filter((q) => q.topic === t.name).length, real.filter((q) => q.topic === t.name).length, t.name);
      }
    });
  }
}

// ---- Canvas gradebook import (made-up students)
{
  const { readCanvasExport, matchCanvas, canvasCsv } = await import('../app/js/canvas.js');
  test('reads a Canvas export, matches by RedID / email / name, and writes an importable file', () => {
    const csv = 'Student,ID,SIS User ID,SIS Login ID,Section,Quiz 4 (2010509),Current Score\n    Points Possible,,,,,10.00,(read only)\n'
      + '"Lopez, Maria",11,826000001,mlopez@sdsu.edu,Section 04,,\n"Kim, Jo",12,,jkim@sdsu.edu,Section 04,,\n"Diaz, Ana",13,,,Section 04,,\n"Student, Test",14,,,Section 04,,\n';
    const ex = readCanvasExport(csv);
    assert.equal(ex.students.length, 4);
    assert.deepEqual(ex.assignments.map((a) => [a.base, a.points]), [['Quiz 4', 10]]);
    const people = [{ name: 'Maria Lopez', email: 'x@sdsu.edu', redId: '826000001' }, { name: 'J K', email: 'JKim@sdsu.edu', redId: '' }, { name: 'Ana Diaz', email: '', redId: '' }, { name: 'Not There', email: 'nt@sdsu.edu', redId: '1' }];
    const m = matchCanvas(ex.students, people);
    assert.deepEqual(m.pairs.map((x) => x.how), ['RedID', 'email', 'name']);
    assert.equal(m.notInCanvas.length, 1);
    const out = canvasCsv({ column: 'Quiz 4 (2010509)', points: 10, rows: m.pairs.map(({ c }) => ({ c, score: 7.456 })) }).trim().split('\r\n');
    assert.equal(out[0], 'Student,ID,SIS User ID,SIS Login ID,Section,Quiz 4 (2010509)');
    assert.equal(out[1], 'Points Possible,,,,,10');
    assert.equal(out[2], '"Lopez, Maria",11,826000001,mlopez@sdsu.edu,Section 04,7.46');
    assert.throws(() => readCanvasExport('Name,Score\nA,1\n'), /Canvas gradebook export/);
  });
}

// ---- Build my course: reading the words out of course files
{
  const { slideParagraphs, wordParagraphs, splitSections, packChunks, tidy, countWords, xmlText } = await import('../app/js/materials.js');
  test('reads slide text: paragraphs, line breaks, escaped characters; ignores shapes without text', () => {
    const xml = '<p:sld><a:p><a:r><a:t>The while</a:t></a:r><a:r><a:t xml:space="preserve"> loop</a:t></a:r></a:p><a:p><a:endParaRPr/></a:p>'
      + '<a:p><a:r><a:t>x &lt; 10 &amp;&amp; y &gt; 0</a:t></a:r><a:br/><a:r><a:t>second line</a:t></a:r></a:p><a:tbl><a:tblGrid/></a:tbl></p:sld>';
    assert.deepEqual(slideParagraphs(xml), ['The while loop', 'x < 10 && y > 0\nsecond line']);
    assert.equal(xmlText('caf&#233; &#x1F600; &amp;lt;'), 'café 😀 &lt;');
  });
  test('reads Word paragraphs, marks headings, and names sections by their heading', () => {
    const xml = '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Unit 3: Loops</w:t></w:r></w:p>'
      + '<w:p><w:r><w:t xml:space="preserve">A loop </w:t></w:r><w:r><w:tab/><w:t>repeats.</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
    const paras = wordParagraphs(xml);
    assert.deepEqual(paras, [{ text: 'Unit 3: Loops', heading: true }, { text: 'A loop  repeats.', heading: false }, { text: 'cell', heading: false }]);
    assert.deepEqual(splitSections(paras), [{ label: 'Unit 3: Loops', text: 'Unit 3: Loops\nA loop  repeats.\ncell' }]);
    const plain = splitSections(Array.from({ length: 5 }, () => ({ text: 'x'.repeat(2000), heading: false })));
    assert.deepEqual(plain.map((p) => p.label), ['section 1', 'section 2', 'section 3']);
  });
  test('packs text into chunks that fit a Firestore document, cutting an oversized part', () => {
    const parts = [{ label: 'a', text: 'x'.repeat(60) }, { label: 'b', text: 'y'.repeat(60) }, { label: 'c', text: 'z'.repeat(250) }, { label: 'd', text: '' }];
    const chunks = packChunks(parts, 100);
    assert.ok(chunks.every((c) => c.reduce((n, p) => n + p.text.length, 0) <= 100));
    assert.equal(chunks.flat().map((p) => p.text).join(''), parts.map((p) => p.text).join(''));
    assert.deepEqual(chunks.flat().map((p) => p.label), ['a', 'b', 'c', 'c (continued)', 'c (continued)', 'd']);
    assert.equal(tidy('  a \t b \n\n\n\n c\u0000 '), 'a b\n\nc');
    assert.equal(countWords("Don't over-count: x < 10, café, 3 loops."), 7);
  });
}

// ---- Build my course: the conductor (one job at a time, every answer checked)
{
  const E = await import('../app/js/build/engine.js');
  const { runTests } = await import('../app/js/java/index.js');
  const lesson = (id, name, topics) => ({ id, name, parts: [{ label: 'slide 1', text: name }, ...topics.map((t, i) => ({ label: `slide ${i + 2}`, text: `${t}. ${t} is an important idea in this course and students must be able to explain ${t} clearly. Marker${id}x${i}.` }))] });
  const files = [
    lesson('f1', 'Lecture 1.pptx', ['Variables', 'Data types', 'Input with Scanner']),
    lesson('f2', 'Lecture 2.pptx', ['If statements', 'Boolean logic']),
    lesson('f3', 'Lecture 3.pptx', ['While loops', 'For loops', 'Nested loops']),
    { id: 'f4', name: 'Syllabus.pdf', parts: [{ label: 'page 1', text: 'Grading: midterm 30%, final 40%, labs 30%. Week 1 variables. Week 2 decisions. Week 3 loops. Office hours Tuesday.' }] },
  ];
  const setup = { kinds: { concepts: true, programming: true }, firstDay: '2027-01-20', lastDay: '2027-05-06', approveMap: true,
    exams: [{ name: 'Midterm', date: '2027-03-10' }, { name: 'Final exam', date: '2027-05-12' }],
    make: { notes: true, practice: true, quiz: true, exams: true, assignments: true, progExams: true } };
  const ctx = { files };
  const quoted = (s) => [...s.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const para = (t, n) => Array.from({ length: n }, (_, i) => `Sentence ${i} explains ${t} in plain words for you.`).join(' ');
  const qs = (topic, n, tag, { hint = false, pts = false } = {}) => `# Topic: ${topic}\n\n` + Array.from({ length: n }, (_, i) => {
    const d = ['easy', 'medium', 'hard'][i % 3], head = (ty) => `## Q${tag}${i} · ${ty} · ${d}${pts ? ` · ${i % 3 + 1}pts` : ''}`;
    const tail = `${hint && d !== 'easy' ? '> Hint: think about the rule.\n' : ''}> Explanation: this is right because the rule for ${topic} says so here.\n`;
    return i % 2 ? `${head('truefalse')}\nStatement number ${tag}${i} about ${topic} is true.\n= true\n${tail}`
      : `${head('single')}\nWhich choice ${tag}${i} describes ${topic} best?\n- [x] the right one ${i}\n- [ ] wrong a\n- [ ] wrong b\n- [ ] wrong c\n${tail}`;
  }).join('\n');
  const javaSol = (cls) => `import java.util.Scanner;\npublic class ${cls} {\n  public static void main(String[] args) {\n    Scanner in = new Scanner(System.in);\n    int n = in.nextInt();\n    int sum = 0;\n    for (int i = 1; i <= n; i++) sum += i;\n    System.out.println("Sum: " + sum);\n  }\n}\n`;
  const assignment = (cls, { wrongOut = false, hints = true } = {}) => `=== FILE: assignment.md ===\n---\ntitle: ${cls} sum\nclass: ${cls}\ndifficulty: easy\nestimate: 20 min\ntopics: loops\nsample_tests: test1_three, test2_one\n---\n\n${para('the program that reads one whole number n and prints the sum of 1 to n', 8)}\n${hints ? '\n## Hints\n- Use a loop.\n- Keep a running total.\n' : ''}\n=== FILE: ${cls}.java ===\nimport java.util.Scanner;\npublic class ${cls} {\n  public static void main(String[] args) {\n    Scanner in = new Scanner(System.in);\n    // read n, then print the sum\n  }\n}\n\n=== FILE: solution/${cls}.java ===\n${javaSol(cls)}\n`
    + [['three', 3, 6], ['one', 1, 1], ['ten', 10, 55], ['zero', 0, 0], ['hundred', 100, 5050]].map(([n, i, o], k) => `=== FILE: tests/test${k + 1}_${n}.in ===\n${i}\n\n=== FILE: tests/test${k + 1}_${n}.out ===\nSum: ${wrongOut && k === 2 ? 54 : o}\n`).join('\n');
  // a careful AI: answers each job from the request alone
  function goodAI(step, req) {
    const material = req.slice(req.indexOf('\nMATERIAL\n'));
    if (step.kind === 'outline') {
      const labels = [...material.matchAll(/^\[(.+?) of "/gm)].map((m) => m[1]);
      if (/Grading:/.test(material)) return JSON.stringify({ type: 'syllabus', topics: [], schedule: ['variables', 'decisions', 'loops'] });
      return '```json\n' + JSON.stringify({ type: 'lesson', skip: [{ part: labels[0], why: 'title slide' }],
        topics: labels.slice(1).map((l) => { const t = material.match(new RegExp(`\\[${l} of [^\\n]*\\n([^.]+)\\.`))[1]; return { title: t, parts: [l], points: [`${t} is an important idea in this course.`, `Students must explain ${t} clearly.`] }; }) }) + '\n```';
    }
    if (step.kind === 'map') {
      const ids = [...material.matchAll(/^(t\d+) · (.+?) · from "(.+?)"/gm)];
      const by = {}; ids.forEach((m) => (by[m[3]] ||= []).push({ title: m[2], from: [m[1]] }));
      return JSON.stringify({ units: Object.entries(by).map(([f, topics]) => ({ title: `Unit from ${f.replace('.pptx', '')}`, topics })) });
    }
    const head = req.slice(req.indexOf('WHAT TO MAKE'), req.indexOf('\nANSWER FORMAT')).split('\n');
    let names = quoted(head.find((l) => /copied exactly:/.test(l))?.split('copied exactly:')[1] || '');
    if (!names.length) names = quoted(head.find((l) => /these topics:/.test(l))?.split('these topics:')[1] || '');
    if (step.kind === 'notes') return names.map((t) => `## ${t}\n\n${para(t, 16)}\n\n### Common mistakes\n- Forgetting ${t}.`).join('\n\n');
    if (step.kind === 'practice') return names.map((t, i) => qs(t, 4, `p${step.unit}${i}`, { hint: true })).join('\n');
    if (step.kind === 'quiz') return names.map((t, i) => qs(t, i === 0 ? 8 - (names.length - 1) * 2 : 2, `z${step.unit}${i}`)).join('\n');
    if (step.kind === 'exam') { const n = Number(req.match(/Exactly (\d+) questions/)[1]); const each = Math.floor(n / names.length); return names.map((t, i) => qs(t, i === 0 ? n - each * (names.length - 1) : each, `e${step.exam}${i}`, { pts: true })).join('\n'); }
    if (step.kind === 'check') {
      const body = req.slice(req.indexOf('\nQUESTIONS\n') + 11), answers = {};
      for (const blk of body.split(/\n\n(?=\d+\. )/)) {
        const n = blk.match(/^(\d+)\. /)[1];
        if (/^\d+\. \(true or false\)/.test(blk)) answers[n] = 'true';
        else answers[n] = (blk.match(/^ {3}([A-H])\. the right one/m) || [])[1] || '?';
      }
      return JSON.stringify({ answers });
    }
    if (step.kind === 'assign') return assignment(step.unit ? `SumUnit${step.unit}` : `ExamSum${step.exam}${step.problem}`, { hints: !!step.unit });
    if (step.kind === 'solve') return `=== FILE: solution/${req.match(/=== FILE: solution\/(\w+)\.java ===/)[1]}.java ===\n${javaSol(req.match(/=== FILE: solution\/(\w+)\.java ===/)[1])}`;
    if (step.kind === 'revise') return req.slice(req.indexOf('\nTHE QUESTION SET\n') + 18);
    if (step.kind === 'reassign') { const cls = req.match(/^class: (\w+)$/m)[1]; return assignment(cls, { hints: /## Hints/.test(req.slice(req.indexOf('YOUR ASSIGNMENT'))) }); }
    throw new Error('unknown job ' + step.kind);
  }
  function run(st, ai, { approve = true, max = 400, ctx: c = ctx } = {}) {
    const log = [];
    for (let i = 0; i < max; i++) {
      st = JSON.parse(JSON.stringify(st));            // the state is saved and loaded between every job
      const n = E.nextStep(st, c);
      if (n.done) return { st, log, done: true };
      if (n.waiting) { if (!approve) return { st, log, waiting: true }; E.approveMap(st); continue; }
      const r = E.submit(st, n.step.id, ai(n.step, n.request, st), c, { runTests });
      log.push({ id: n.step.id, kind: n.step.kind, ok: r.ok, problems: r.problems, request: n.request });
    }
    throw new Error('the build never finished');
  }

  console.log('\nBuild my course: the conductor');
  test('a careful AI builds the whole course: every job accepted, nothing left out', () => {
    const { st, log } = run(E.createBuild(setup, files), goodAI);
    assert.deepEqual(log.filter((l) => !l.ok).map((l) => `${l.id}: ${l.problems.join(' | ')}`), []);
    assert.equal(st.topics.length, 8);
    assert.deepEqual(st.map.units.map((u) => u.topics.length), [3, 2, 3]);
    assert.deepEqual(st.order, ['o1', 'o2', 'o3', 'o4', 'map',
      ...[1, 2, 3].flatMap((n) => [`notes-${n}`, `practice-${n}`, `quiz-${n}`, `assign-${n}`]),
      'exam-1', 'pexam-1-1', 'pexam-1-2', 'exam-2-1', 'exam-2-2', 'pexam-2-1', 'pexam-2-2',
      ...[1, 2, 3].flatMap((n) => [`check-practice-${n}`, `check-quiz-${n}`]), 'check-exam-1', 'check-exam-2-1', 'check-exam-2-2']);
    assert.deepEqual(E.progress(st), { phase: 'done', total: 33, done: 33, stuck: 0 });
    assert.equal(st.steps['assign-1'].note, 'solution passes all tests');
    assert.match(st.steps['notes-1'].output, /\*From Lecture 1\.pptx: slide 2\*/);
    assert.match(st.steps['practice-2'].output, /^## u2p1 · single · easy/m);     // ids are ours: unique across the course
    assert.ok(JSON.stringify(st).length < 400000);
  });
  test('each job carries only its own material and says nothing about the rest of the plan', () => {
    const { log } = run(E.createBuild(setup, files), goodAI);
    const req = (id) => log.find((l) => l.id === id).request;
    assert.match(req('practice-2'), /Markerf2x0/);
    assert.doesNotMatch(req('practice-2'), /Markerf1|Markerf3|While loops|Variables/);
    assert.doesNotMatch(req('o1'), /Lecture 2|quiz|assignment|unit/i);
    assert.doesNotMatch(req('notes-1'), /quiz|\bexams?\b|practice question|next step/i);
    assert.match(req('exam-1'), /"Unit from Lecture 1"/);
    for (const l of log) assert.ok(l.request.length < 80000, l.id);
  });
  test('dates and exam coverage are worked out by the site, not the AI', () => {
    const { st } = run(E.createBuild(setup, files), goodAI);
    assert.deepEqual(st.map.units.map((u) => [u.start, u.end]), [['2027-01-20', '2027-02-23'], ['2027-02-24', '2027-03-31'], ['2027-04-01', '2027-05-05']]);
    assert.deepEqual(st.map.exams.map((e) => [e.name, e.units, e.final]), [['Midterm', [1], false], ['Final exam', [1, 2, 3], true]]);
    const m = E.scheduleMap({ exams: [{ name: 'Midterm 1', date: '2027-02-01' }, { name: 'Midterm 2', date: '2027-03-01' }] }, [1, 2, 3, 4].map((n) => ({ title: `U${n}`, topics: [] })));
    assert.deepEqual(m.exams.map((e) => e.units), [[1, 2], [3, 4]]);          // no term dates: split evenly
  });
  test('waits for the professor to approve the map when they asked to', () => {
    const r = run(E.createBuild(setup, files), goodAI, { approve: false });
    assert.equal(r.waiting, true);
    assert.equal(r.st.phase, 'approve');
    assert.equal(E.nextStep(r.st, ctx).waiting, 'approval');
    const auto = run(E.createBuild({ ...setup, approveMap: false }, files), goodAI, { approve: false });
    assert.equal(auto.done, true);
  });
  test('an AI that cuts corners is sent back with the reason, then accepted when it does the work', () => {
    const tried = {};
    const lazy = (step, req, st) => {
      const first = !(tried[step.id]++ || (tried[step.id] = 1, 0));
      const good = goodAI(step, req);
      if (!first) { assert.match(req, /YOUR LAST ANSWER WAS NOT ACCEPTED/); return good; }
      if (step.id === 'o1') { const j = E.readJson(good); j.topics.pop(); return JSON.stringify(j); }                  // skips a slide
      if (step.id === 'o2') return 'Sure! Here are the topics: If statements and Boolean logic.';                       // chat, not the format
      if (step.id === 'map') { const j = E.readJson(good); j.units[2].topics.pop(); return JSON.stringify(j); }         // drops a topic
      if (step.id === 'notes-1') return good.replace(/(Sentence \d+ [^.]+\. ){12}/, '');                                // a thin section
      if (step.id === 'practice-1') return good.split('\n## ').slice(0, -2).join('\n## ');                              // too few questions
      if (step.id === 'quiz-1') return good.replace(/^Which choice \S+ describes Variables best\?$/m, 'Which choice p100 describes Variables best?'); // reuses a practice question
      if (step.id === 'assign-1') return assignment('SumUnit1', { wrongOut: true });                                    // an expected output that is wrong
      if (step.id === 'exam-1') return good.replace('- [ ] wrong c\n', '');                                             // three choices
      return good;
    };
    const { st, log } = run(E.createBuild(setup, files), lazy);
    const why = (id) => log.find((l) => l.id === id && !l.ok)?.problems.join(' ') || '';
    assert.match(why('o1'), /These parts are in no topic and not under "skip": slide 4/);
    assert.match(why('o2'), /must be JSON/);
    assert.match(why('map'), /left out: t8 \(Nested loops\)/);
    assert.match(why('notes-1'), /has \d+ words\. It needs at least 120/);
    assert.match(why('practice-1'), /"Input with Scanner" has 2 questions\. Write at least 4/);
    assert.match(why('quiz-1'), /repeat questions students have already seen/);
    assert.match(why('assign-1'), /Your solution fails test "test3_ten"/);
    assert.match(why('exam-1'), /has 3 choices\. Multiple choice needs exactly 4/);
    assert.match(why('exam-1'), /^Question 1 \(counting from the top of your answer\) has 3 choices/);
    assert.equal(log.filter((l) => !l.ok).length, 8);
    assert.deepEqual(E.progress(st), { phase: 'done', total: 33, done: 33, stuck: 0 });
  });
  test('questions numbered Q1.. again under each topic, and choices that differ only in capitals, are accepted', () => {
    const habits = (step, req) => {
      let a = goodAI(step, req);
      if (['practice', 'quiz', 'exam'].includes(step.kind)) a = a.split(/(?=^# Topic:)/m).map((blk) => { let n = 0; return blk.replace(/^## \S+/gm, () => `## Q${++n}`); }).join('').replace('- [ ] wrong a\n- [ ] wrong b', '- [ ] String\n- [ ] string');
      return a;
    };
    const { st, log } = run(E.createBuild({ ...setup, approveMap: false }, files), habits);
    assert.deepEqual(log.filter((l) => !l.ok).map((l) => `${l.id}: ${l.problems[0]}`), []);
    assert.match(st.steps['practice-1'].output, /^## u1p1 ·[\s\S]*^## u1p12 ·/m);
  });
  test('a long exam is written in small parts that do not repeat each other; big units share the material fairly', () => {
    const many = Array.from({ length: 9 }, (_, i) => lesson(`g${i}`, `Week ${i + 1}.pptx`, [`Idea ${i}a`, `Idea ${i}b`]));
    const { st, log } = run(E.createBuild({ ...setup, approveMap: false, exams: [{ name: 'Final exam', date: '2027-05-12' }], make: { exams: true } }, many), goodAI, { ctx: { files: many } });
    const parts = st.order.filter((id) => id.startsWith('exam-')).map((id) => st.steps[id]);
    assert.deepEqual(parts.map((s) => [s.id, s.units.length, s.count, s.status]), [['exam-1-1', 3, 9, 'done'], ['exam-1-2', 3, 9, 'done'], ['exam-1-3', 3, 9, 'done']]);
    assert.match(parts[1].output, /^## e1p2q1 ·/m);
    assert.doesNotMatch(log.find((l) => l.id === 'exam-1-2').request, /\(part|of 3\b|Idea 0a|Idea 8a/);      // its own units only, no hint of the rest
    const big = [{ id: 'b1', name: 'Big.pdf', parts: Array.from({ length: 30 }, (_, i) => ({ label: `page ${i + 1}`, text: `Topic ${i}. ` + `Fact about topic ${i} that matters. `.repeat(120) + `END${i}` })) }];
    const s2 = E.createBuild({ ...setup, approveMap: false, make: { notes: true }, exams: [] }, big);
    s2.phase = 'build'; s2.topics = big[0].parts.map((p, i) => ({ id: `t${i + 1}`, title: `Topic ${i}`, file: 'b1', fileName: 'Big.pdf', parts: [i], labels: [p.label], points: ['x', 'y'] }));
    s2.map = E.scheduleMap(s2.setup, [{ title: 'Everything', topics: s2.topics.slice(0, 8).map((t) => ({ title: t.title, from: [t.id] })) }, { title: 'Rest', topics: [{ title: 'All the rest', from: s2.topics.slice(8).map((t) => t.id) }] }]);
    s2.order.forEach((id) => { s2.steps[id].status = 'done'; });
    s2.order.push('notes-2'); s2.steps['notes-2'] = { id: 'notes-2', kind: 'notes', unit: 2, status: 'todo', tries: 0, problems: [], title: 'n' };
    const req = E.nextStep(s2, { files: big }).request;
    assert.ok(req.length < E.MATERIAL_CAP + 6000, String(req.length));
    for (let i = 8; i < 30; i++) assert.match(req, new RegExp(`\\[page ${i + 1} of "Big\\.pdf"\\]\\nTopic ${i}\\. Fact`));   // every part is still there
    assert.match(req, /\[the rest of this part was left out for length\]/);
  });
  test('a second look answers every question set again without the key, and holds back the ones it disagrees with', () => {
    // this AI marks the wrong choice right in one practice question, and writes one true/false with the wrong key
    const sloppy = (step, req) => {
      let a = goodAI(step, req);
      if (step.id === 'practice-1') a = a.replace('- [x] the right one 0\n- [ ] wrong a', '- [ ] the right one 0\n- [x] wrong a').replace('= true', '= false');
      return a;
    };
    const { st, log } = run(E.createBuild({ ...setup, approveMap: false }, files), sloppy);
    const c = st.steps['check-practice-1'], req = log.find((l) => l.id === 'check-practice-1').request;
    assert.equal(c.status, 'done'); assert.equal(c.note, '10 of 12 agree');
    assert.deepEqual(c.output.disagree.map((d) => d.id), ['u1p1', 'u1p2']);
    assert.equal(c.output.disagree[0].got, 'the right one 0');                           // what the second look chose
    assert.equal(st.steps['check-quiz-1'].note, '8 of 8 agree');
    assert.doesNotMatch(req, /\[x\]|Explanation|Hint|= true|MATERIAL\n/);                 // no key, no hints, nothing that says it is a check
    assert.doesNotMatch(req, /second look|check|verify|compare/i);
    assert.ok(st.order.indexOf('check-practice-1') > st.order.indexOf('exam-2-2'));     // asked at the very end, far from where the answers were written
    const orders = new Set(Array.from({ length: 12 }, (_, i) => E.checkOrder('check-practice-1', i, 4).join('')));
    assert.ok(orders.size > 4);                                                          // choices are shown in a new order each time
    // a missing answer is the only thing that sends this job back
    const st2 = JSON.parse(JSON.stringify(st)); st2.steps['check-quiz-1'].status = 'todo';
    assert.match(E.submit(st2, 'check-quiz-1', '{"answers": {"1": "A"}}', { files, outputs: { 'quiz-1': st.steps['quiz-1'].output } }).problems.join(' '), /Question 2 has no answer/);
  });
  test('the professor can ask for another try at what was set aside, or at a build that stopped', () => {
    const stubborn = (step, req) => (step.id === 'quiz-2' ? 'I cannot do that.' : goodAI(step, req));
    const { st } = run(E.createBuild(setup, files), stubborn);
    assert.equal(E.retryStuck(st), 1);
    assert.deepEqual([st.phase, st.steps['quiz-2'].status, st.steps['quiz-2'].tries], ['build', 'todo', 0]);
    const again = run(st, goodAI);
    assert.deepEqual(E.progress(again.st), { phase: 'done', total: 33, done: 33, stuck: 0 });
    assert.equal(E.retryStuck(again.st), 0);
    const noMap = run(E.createBuild(setup, files), (step, req) => (step.kind === 'map' ? '{}' : goodAI(step, req)));
    assert.match(noMap.st.failed, /course map could not be made/);
    assert.equal(E.retryStuck(noMap.st), 1);
    assert.deepEqual([noMap.st.phase, noMap.st.failed], ['map', undefined]);
    assert.equal(run(noMap.st, goodAI).st.phase, 'done');
  });
  test('thinking for the professor: thin topics are flagged and not padded; a past exam sets the style', () => {
    const thinFiles = [
      { id: 'h1', name: 'Week 1.pptx', parts: [{ label: 'slide 1', text: 'Recursion. ' + 'Recursion is when a method calls itself and every recursive method needs a base case. '.repeat(6) }, { label: 'slide 2', text: 'Tail calls. Covered on the board in class.' }] },
      { id: 'h2', name: 'Old midterm.txt', parts: [{ label: 'section 1', text: 'CS 150 Midterm, Fall 2025. Question 1 (5 points). Trace the method below and state exactly what it prints. Show your work for partial credit.' }] },
    ];
    const ai = (step, req) => {
      if (step.id === 'o1') return JSON.stringify({ type: 'lesson', topics: [{ title: 'Recursion', parts: ['slide 1'], points: ['Recursion is when a method calls itself.', 'Every recursive method needs a base case.'] }, { title: 'Tail calls', parts: ['slide 2'], points: ['Tail calls were covered on the board.', 'Tail calls are part of this unit.'] }] });
      if (step.id === 'o2') return JSON.stringify({ type: 'exam', topics: [] });
      if (step.kind === 'map') return JSON.stringify({ units: [{ title: 'Recursion basics', topics: [{ title: 'Recursion', from: ['t1'] }, { title: 'Tail calls', from: ['t2'] }] }] });
      if (step.kind === 'practice') return qs('Recursion', 4, 'a') + '\n' + qs('Tail calls', 2, 'b');
      return goodAI(step, req);
    };
    const { st, log } = run(E.createBuild({ ...setup, approveMap: false, exams: [{ name: 'Final exam', date: '2027-05-12' }], make: { practice: true, exams: true } }, thinFiles), ai, { ctx: { files: thinFiles } });
    assert.deepEqual(E.thinTopics(st), [{ unit: 1, title: 'Tail calls', words: 8 }]);
    const req = (id) => log.find((l) => l.id === id).request;
    assert.match(req('practice-1'), /The material says very little about "Tail calls"\. For that topic write only 2 or 3 questions/);
    assert.equal(st.steps['practice-1'].status, 'done');                                   // 2 questions on the thin topic is enough
    assert.match(req('exam-1'), /THE PROFESSOR'S OWN PAST EXAM[\s\S]*Never reuse its questions[\s\S]*Show your work for partial credit/);
    assert.doesNotMatch(req('practice-1'), /PAST EXAM/);
  });
  // ---- a TEAM build: builder, checker and fresh eyes are three separate chats working in turn
  function team(st, ais, { max = 600, order = ['build', 'check', 'fresh'] } = {}) {
    const log = []; let idle = 0;
    for (let i = 0; i < max && idle < 6; i++) {
      const role = order[i % order.length];
      st = JSON.parse(JSON.stringify(st));
      const n = E.nextStep(st, ctx, role);
      if (n.done || n.wait || n.waiting) { idle++; log.push({ role, state: n.done ? 'done' : 'wait' }); if (order.every((r) => log.filter((l) => l.role === r).at(-1)?.state === 'done')) return { st, log }; continue; }
      idle = 0;
      const r = E.submit(st, n.step.id, (ais[role] || goodAI)(n.step, n.request, st), ctx, { runTests });
      log.push({ role, id: n.step.id, kind: n.step.kind, ok: r.ok, problems: r.problems, request: n.request, also: r.also });
    }
    return { st, log };
  }
  const teamSetup = { ...setup, team: true, approveMap: false, exams: [{ name: 'Final exam', date: '2027-05-12' }], make: { practice: true, quiz: true, exams: true, assignments: true } };
  test('team: when the checker and fresh eyes agree, each set is built, checked once and looked at fresh', () => {
    const { st, log } = team(E.createBuild(teamSetup, files), {});
    assert.deepEqual(log.filter((l) => l.id && !l.ok).map((l) => `${l.id}: ${l.problems[0]}`), []);
    assert.equal(st.phase, 'done');
    const chain = (id) => st.order.filter((x) => st.steps[x].of === id).map((x) => `${st.steps[x].role}:${x}`);
    assert.deepEqual(chain('quiz-1'), ['check:check-quiz-1', 'fresh:fresh-quiz-1']);
    assert.deepEqual(chain('assign-2'), ['check:solve-assign-2', 'fresh:fresh-assign-2']);
    assert.equal(st.steps['solve-assign-2'].note, 'a second solution passes all 5 tests');
    assert.equal(st.steps['quiz-1'].last, 'fresh-quiz-1');
    for (const l of log.filter((x) => x.id)) assert.equal(st.steps[l.id].role || 'build', l.role, l.id);       // nobody is ever handed another role's job
    const solveReq = log.find((l) => l.id === 'solve-assign-1').request;
    assert.match(solveReq, /INSTRUCTIONS[\s\S]*STARTER CODE/);
    assert.doesNotMatch(solveReq, /sum \+= i|Sum: 55|tests\/test/);                                              // the checker never sees the solution or the tests
    assert.doesNotMatch(log.find((l) => l.id === 'check-quiz-1').request, /\[x\]|Explanation/);                  // nor the answer key
    assert.equal(log.filter((l) => l.role === 'fresh' && l.id).every((l) => st.steps[st.steps[l.id].of].status === 'done'), true);
  });
  test('team: the checker disagrees, the builder fixes it, they agree, then fresh eyes finds one more thing', () => {
    let quizFixed = 0, wrongKey = true, badTests = true;
    const builder = (step, req) => {
      if (step.id === 'quiz-1' && wrongKey) return goodAI(step, req).replace('- [x] the right one 0\n- [ ] wrong a', '- [ ] the right one 0\n- [x] wrong a');           // a wrong key
      if (step.id === 'assign-1' && badTests) return assignment('SumUnit1').replace('prints the sum of 1 to n', 'prints the total');                                    // vague instructions
      if (step.kind === 'revise' && step.of === 'quiz-1') { quizFixed++; assert.match(req, /Question 1: a careful reader who did not see your answer key answered "the right one 0"/); return goodAI({ ...step, kind: 'quiz', unit: 1 }, req.replace('Improve the question set', 'x')) || ''; }
      return goodAI(step, req);
    };
    const quizText = (req) => { const names = quoted(req.split('copied exactly')[0]); return null; };
    const ais = {
      build: (step, req, st) => {
        if (step.kind === 'revise') {
          const cur = req.slice(req.indexOf('\nTHE QUESTION SET\n') + 18);
          if (step.of === 'quiz-1') { quizFixed++; assert.match(req, /Question 1: a careful reader who did not see your answer key answered "the right one 0"/); return cur.replace('- [ ] the right one 0\n- [x] wrong a', '- [x] the right one 0\n- [ ] wrong a'); }
          if (step.of === 'practice-2') { assert.match(req, /Question 3: The wording is unclear about which loop is meant\./); return cur.replace(/^Which choice (\S+) describes/m, 'Exactly which choice $1 describes'); }
          return cur;
        }
        return builder(step, req);
      },
      check: (step, req) => {
        if (step.id === 'solve-assign-1' && step.round === 1) { const cls = 'SumUnit1'; return `=== FILE: solution/${cls}.java ===\n${javaSol(cls).replace('"Sum: " + sum', '"Total: " + sum')}`; }     // read "the total" literally
        return goodAI(step, req);
      },
      fresh: (step, req) => {
        const a = goodAI(step, req);
        return step.id === 'fresh-practice-2' ? JSON.stringify({ ...JSON.parse(a), issues: [{ q: 3, issue: 'The wording is unclear about which loop is meant.' }, { q: 99, issue: 'not a real question number here' }] }) : a;
      },
    };
    const { st, log } = team(E.createBuild(teamSetup, files), ais);
    const chain = (id) => st.order.filter((x) => st.steps[x].of === id).map((x) => `${st.steps[x].role}:${x}:${st.steps[x].note}`);
    assert.deepEqual(chain('quiz-1'), ['check:check-quiz-1:7 of 8 agree', 'build:revise-quiz-1-1:improved', 'check:check-quiz-1-2:8 of 8 agree', 'fresh:fresh-quiz-1:8 of 8 agree']);
    assert.equal(quizFixed, 1);
    assert.match(st.steps['quiz-1'].output || log.find((l) => l.id === 'revise-quiz-1-1').request, /./);
    assert.deepEqual(log.find((l) => l.id === 'revise-quiz-1-1').also, ['quiz-1']);                              // the improved set replaces the first one
    assert.deepEqual(chain('assign-1').map((x) => x.split(':').slice(0, 2).join(':')), ['check:solve-assign-1', 'build:reassign-assign-1-1', 'check:solve-assign-1-2', 'fresh:fresh-assign-1']);
    assert.equal(st.steps['solve-assign-1'].note, '5 of 5 tests differ');
    assert.match(log.find((l) => l.id === 'reassign-assign-1-1').request, /your test expects: "Sum: 6\\n"\n\s+the second solution printed: "Total: 6\\n"[\s\S]*THE SECOND SOLUTION[\s\S]*"Total: "/);
    assert.equal(st.steps['solve-assign-1-2'].note, 'a second solution passes all 5 tests');
    assert.deepEqual(chain('practice-2'), ['check:check-practice-2:8 of 8 agree', 'fresh:fresh-practice-2:8 of 8 agree, 1 remark', 'build:revise-practice-2-f:improved', 'check:check-practice-2-final:8 of 8 agree']);
    assert.equal(st.steps['practice-2'].last, 'check-practice-2-final');
    assert.equal(st.phase, 'done');
    assert.equal(Object.values(st.steps).filter((x) => x.status !== 'done').length, 0);
  });
  test('team: a builder who never fixes it stops after two rounds and the disagreement is kept for the professor', () => {
    const ais = { build: (step, req) => (step.id === 'quiz-1' ? goodAI(step, req).replace('- [x] the right one 0\n- [ ] wrong a', '- [ ] the right one 0\n- [x] wrong a') : goodAI(step, req)) };
    const { st } = team(E.createBuild(teamSetup, files), ais);
    const mine = st.order.filter((x) => st.steps[x].of === 'quiz-1');
    assert.deepEqual(mine, ['check-quiz-1', 'revise-quiz-1-1', 'check-quiz-1-2', 'fresh-quiz-1', 'revise-quiz-1-f', 'check-quiz-1-final']);
    assert.deepEqual([st.steps['quiz-1'].last, st.steps['check-quiz-1-final'].meta.disagree], ['check-quiz-1-final', 1]);
    assert.equal(st.phase, 'done');
  });
  test('team: each chat waits for the others, and a one-chat build is unchanged', () => {
    const st = E.createBuild(teamSetup, files);
    assert.equal(E.nextStep(st, ctx, 'check').wait, true);                       // nothing to check before anything is built
    assert.equal(E.nextStep(st, ctx, 'fresh').wait, true);
    assert.equal(E.nextStep(st, ctx, 'build').step.id, 'o1');
    const solo = run(E.createBuild({ ...teamSetup, team: false }, files), goodAI);
    assert.equal(Object.values(solo.st.steps).some((x) => x.role || ['revise', 'solve', 'reassign'].includes(x.kind)), false);
    assert.equal(solo.st.phase, 'done');
  });
  test('building in parts: it stops after each part until the professor starts the next', () => {
    const st0 = E.createBuild({ ...setup, approveMap: false, partSize: 1 }, files);
    const stopAt = (st) => { for (let i = 0; i < 200; i++) { st = JSON.parse(JSON.stringify(st)); const n = E.nextStep(st, ctx); if (!n.step) return { st, n }; E.submit(st, n.step.id, goodAI(n.step, n.request), ctx, { runTests }); } throw new Error('never stopped'); };
    let { st, n } = stopAt(st0);
    assert.equal(n.paused, true);
    const made = (x) => x.order.filter((id) => x.steps[id].status === 'done' && /^(notes|practice|quiz|assign)-/.test(id));
    assert.deepEqual(made(st), ['notes-1', 'practice-1', 'quiz-1', 'assign-1']);
    assert.equal(st.steps['check-practice-1'].status, 'done');                         // its second look belongs to the same part
    assert.equal(st.steps['exam-1'].status, 'done');                                    // the midterm covers unit 1 only, so it is in part 1
    assert.equal(st.steps['notes-2'].status, 'todo');
    assert.deepEqual(E.partInfo(st), { size: 1, upto: 1, units: 3, part: 1, parts: 3, left: st.order.filter((id) => st.steps[id].status === 'todo').length, paused: true });
    assert.equal(E.nextStep(st, ctx).paused, true);                                    // asking again does not start the next part
    assert.equal(E.releaseNext(st), true);
    ({ st, n } = stopAt(st));
    assert.deepEqual([n.paused, made(st).length, E.partInfo(st).part], [true, 8, 2]);
    assert.deepEqual(['exam-2-1', 'exam-2-2', 'pexam-2-1'].map((id) => st.steps[id].status), ['done', 'todo', 'todo']);   // each piece of the final waits for the units it covers
    assert.equal(E.releaseNext(st, true), true);
    ({ st, n } = stopAt(st));
    assert.deepEqual([n.done, st.phase, E.partInfo(st).paused, E.releaseNext(st)], [true, 'done', false, false]);
    assert.equal(E.partInfo(E.createBuild(setup, files)), null);
  });
  test('a job that keeps failing is set aside after 4 tries and the build carries on', () => {
    const stubborn = (step, req) => (step.id === 'quiz-2' ? 'I cannot do that.' : goodAI(step, req));
    const { st, log } = run(E.createBuild(setup, files), stubborn);
    assert.equal(log.filter((l) => l.id === 'quiz-2').length, E.MAX_TRIES);
    assert.equal(st.steps['quiz-2'].status, 'stuck');
    assert.deepEqual(E.progress(st), { phase: 'done', total: 33, done: 32, stuck: 1 });
    assert.equal(E.submit(st, 'quiz-2', 'x', ctx).ok, false);
  });
  test('reads answers wrapped the ways AIs wrap them; splits big files into pieces', () => {
    assert.deepEqual(E.readJson('Here you go:\n```json\n{"a": 1}\n```'), { a: 1 });
    assert.equal(E.readJson('[1]'), null);
    assert.equal(E.unfence('```markdown\n## A\ntext\n```'), '## A\ntext');
    const f = E.readFiles('=== FILE: a.md ===\nhello\n\n=== FILE: tests/t1.in ===\n```\n5\n```\n');
    assert.deepEqual([...f], [['a.md', 'hello\n'], ['tests/t1.in', '5\n']]);
    const big = [{ id: 'b', name: 'Big.pdf', parts: Array.from({ length: 10 }, (_, i) => ({ label: `page ${i + 1}`, text: i === 4 ? '' : 'w '.repeat(5000) })) }];
    assert.deepEqual(E.pieces(big, 24000).map((p) => p.parts.map((x) => x.label)), [['page 1', 'page 2'], ['page 3', 'page 4'], ['page 6', 'page 7'], ['page 8', 'page 9'], ['page 10']]);
  });

  // ---- the connector an AI talks to (MCP over HTTP)
  const { createHandler, memoryStore, TOOLS } = await import('../connector/handler.mjs');
  const CODE = 'k'.repeat(32);
  const post = async (handle, body, code = CODE) => { const r = await handle(new Request(`https://x.test/mcp/${code}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })); return { status: r.status, body: r.status === 202 ? null : await r.json() }; };
  const call = async (handle, name, args = {}, code = CODE) => (await post(handle, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, code)).body.result;
  console.log('\nBuild my course: the connector');
  await atest('speaks MCP: initialize, tools/list, notifications, unknown methods, wrong addresses', async () => {
    const handle = createHandler(memoryStore({}));
    const init = await post(handle, { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    assert.equal(init.body.result.protocolVersion, '2025-03-26');
    assert.ok(init.body.result.capabilities.tools);
    assert.match(init.body.result.instructions, /next_step/);
    assert.equal((await post(handle, { jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
    assert.deepEqual((await post(handle, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).body.result.tools.map((t) => t.name), ['next_step', 'submit_step']);
    assert.equal(TOOLS.every((t) => t.inputSchema.type === 'object' && t.description.length > 40), true);
    assert.equal((await post(handle, { jsonrpc: '2.0', id: 3, method: 'nope' })).body.error.code, -32601);
    assert.equal((await handle(new Request('https://x.test/mcp/short', { method: 'POST', body: '{}' }))).status, 404);
    assert.equal((await handle(new Request(`https://x.test/mcp/${CODE}`, { method: 'GET' }))).status, 405);
    assert.equal((await handle(new Request(`https://x.test/mcp/${CODE}`, { method: 'POST', body: 'not json' }))).status, 400);
    const dead = await call(handle, 'next_step', {}, 'z'.repeat(32));
    assert.equal(dead.isError, true); assert.match(dead.content[0].text, /not active/);
  });
  await atest('an AI that only follows the tool replies builds the whole course through the connector', async () => {
    const builds = { [CODE]: { st: E.createBuild(setup, files), files, hooks: { runTests } } };
    const handle = createHandler(memoryStore(builds));
    let calls = 0, rejected = 0, stops = 0, finished = false, lazyOnce = true;
    for (let i = 0; i < 120 && !finished; i++) {
      const t = (await call(handle, 'next_step')).content[0].text; calls++;
      if (/^FINISHED/.test(t)) { finished = true; break; }
      if (/^STOP/.test(t)) { stops++; assert.match(t, /approve/); E.approveMap(builds[CODE].st); continue; }   // the professor approves on the site
      const id = t.match(/^JOB ID: (\S+)/)[1];
      assert.doesNotMatch(t, /\b\d+ (of|\/) \d+\b|jobs? (left|remaining)/i);        // no hint of how much work is left
      const step = builds[CODE].st.steps[id];
      let answer = goodAI(step, t);
      if (id === 'practice-1' && lazyOnce) { lazyOnce = false; answer = answer.split('\n## ').slice(0, -2).join('\n## '); }
      let r = await call(handle, 'submit_step', { step_id: id, answer }); calls++;
      if (r.isError) { rejected++; assert.match(r.content[0].text, /^NOT ACCEPTED[\s\S]*Write at least 4/); r = await call(handle, 'submit_step', { step_id: id, answer: goodAI(step, t) }); calls++; }
      assert.equal(r.content[0].text, 'Accepted. Call next_step now.');
    }
    assert.equal(finished, true);
    assert.deepEqual([rejected, stops], [1, 1]);
    assert.deepEqual(E.progress(builds[CODE].st), { phase: 'done', total: 33, done: 33, stuck: 0 });
    assert.equal(builds[CODE].saves, calls);                                          // every call is saved: nothing is lost if the chat stops
    assert.match((await call(handle, 'submit_step', { step_id: 'quiz-1', answer: 'again' })).content[0].text, /NOT ACCEPTED[\s\S]*not open/);
    assert.equal((await call(handle, 'submit_step', { step_id: 'quiz-1' })).isError, true);
  });

  await atest('trouble outside the AI\'s control gets a plain instruction instead of a dead chat', async () => {
    const mk = (fail) => createHandler({ async open() { const st = E.createBuild(setup, files); return { st, ctx: { files }, async load() { if (fail.load) throw fail.load; }, async save() { if (fail.save?.length) throw fail.save.shift(); fail.saved = (fail.saved || 0) + 1; } }; } });
    const err = (code) => Object.assign(new Error(code), { code });
    const f1 = { save: [err('conflict')] };
    assert.match((await call(mk(f1), 'next_step')).content[0].text, /^JOB ID: o1/);          // someone saved in between: done again, quietly
    assert.equal(f1.saved, 1);
    const quota = await call(mk({ save: [err('quota')] }), 'next_step');
    assert.match(quota.content[0].text, /^STOP\. The free daily limit[\s\S]*tomorrow/);
    assert.match((await call(mk({ load: err('materials') }), 'next_step')).content[0].text, /^STOP\. A course file was removed or changed/);
    const temp = await call(mk({ save: [new Error('boom')] }), 'next_step');
    assert.equal(temp.isError, true); assert.match(temp.content[0].text, /temporary problem[\s\S]*call this same tool again/);
    assert.match((await call(mk({ save: [err('conflict'), err('conflict'), err('conflict')] }), 'next_step')).content[0].text, /temporary problem/);
  });
  await atest('three chats through the connector: each role gets only its own jobs, waits for the others, and is told when it is done', async () => {
    const builds = { [CODE]: { st: E.createBuild(teamSetup, files), files, hooks: { runTests } } };
    let naps = 0;
    const handle = createHandler(memoryStore(builds), { waitMs: 30, pollMs: 10, sleep: async () => { naps++; } });
    const nothing = await call(handle, 'next_step', { role: 'check' });
    assert.match(nothing.content[0].text, /^NOTHING FOR YOU YET[\s\S]*role "check"/);
    assert.equal(naps, 3);                                                               // it held the call and looked again before answering
    assert.deepEqual((await post(handle, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).body.result.tools[0].inputSchema.properties.role.enum, ['build', 'check', 'fresh']);
    const done = {}, seen = { build: new Set(), check: new Set(), fresh: new Set() };
    for (let i = 0; i < 900 && Object.keys(done).length < 3; i++) {
      const role = ['fresh', 'check', 'build'][i % 3];
      if (done[role]) continue;
      const t = (await call(handle, 'next_step', { role })).content[0].text;
      if (/^FINISHED/.test(t)) { done[role] = t; continue; }
      if (/^NOTHING/.test(t)) continue;
      const id = t.match(/^JOB ID: (\S+)/)[1]; seen[role].add(id);
      assert.equal((await call(handle, 'submit_step', { step_id: id, answer: goodAI(builds[CODE].st.steps[id], t) })).content[0].text, 'Accepted. Call next_step now.', id);
    }
    assert.match(done.build, /Your course is built/); assert.match(done.check, /nothing more for you to check/); assert.match(done.fresh, /nothing more/);
    assert.equal([...seen.check].every((id) => /^(check|solve)-/.test(id)) && [...seen.fresh].every((id) => /^fresh-/.test(id)), true);
    assert.equal(seen.check.size > 5 && seen.fresh.size === seen.check.size, true);
    assert.equal(builds[CODE].st.phase, 'done');
    // a one-chat build has no work for a checker and says so
    const solo = { [CODE]: { st: E.createBuild(setup, files), files } };
    assert.match((await call(createHandler(memoryStore(solo)), 'next_step', { role: 'check' })).content[0].text, /^STOP\. This course is being built in one chat/);
    assert.match((await call(createHandler(memoryStore(solo)), 'next_step', { role: 'nonsense' })).content[0].text, /^JOB ID: o1/);
    const st3 = E.createBuild({ ...setup, approveMap: false, partSize: 1 }, files); st3.phase = 'build'; st3.topics = [{ id: 't1', title: 'A', file: 'f1', fileName: 'x', parts: [1], labels: ['slide 2'], points: ['a b c d', 'e f g h'] }];
    st3.map = E.scheduleMap(st3.setup, [{ title: 'One', topics: [{ title: 'A', from: ['t1'] }] }, { title: 'Two', topics: [{ title: 'A2', from: ['t1'] }] }]); st3.order.forEach((id) => { st3.steps[id].status = 'done'; });
    st3.order.push('notes-2'); st3.steps['notes-2'] = { id: 'notes-2', kind: 'notes', unit: 2, status: 'todo', tries: 0, problems: [], title: 'n' };
    assert.match((await call(createHandler(memoryStore({ [CODE]: { st: st3, files } })), 'next_step')).content[0].text, /^STOP\. This part of the course is finished[\s\S]*Build the next part/);
  });
  // ---- the Worker bundle against a stand-in for Google's sign-in and database
  await atest('the Worker signs in as the service account and builds a course in Firestore', async () => {
    const nodeCrypto = await import('node:crypto');
    const { encodeFields, decodeFields } = await import('../connector/firestore.mjs');
    const { stripOutputs } = await import('../connector/store.mjs');
    const worker = (await import('../connector/worker.mjs')).default;
    const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
    const account = { project_id: 'demo-proj', client_email: 'svc@demo-proj.iam.gserviceaccount.com', private_key: privateKey };
    const docs = new Map(), root = 'https://firestore.googleapis.com/v1/projects/demo-proj/databases/(default)/documents/';
    const put = (path, obj) => docs.set(path, encodeFields(obj));
    const C = 'cs150', code = 'W'.repeat(32), calls = { token: 0, get: 0, patch: 0, unauth: 0, conflict: 0 }, vers = new Map(); let clash = 0;
    const withChunks = files.map((f) => ({ ...f, chunks: 1 }));
    const st0 = E.createBuild({ ...setup, approveMap: false }, withChunks);
    put(`buildLinks/${code}`, { classId: C });
    put(`classes/${C}/builder/build`, { json: JSON.stringify(st0), code, phase: 'outline', total: 4, done: 0, stuck: 0, startedAt: 1.5 });
    for (const f of files) put(`classes/${C}/materialText/${f.id}_0`, { mid: f.id, i: 0, parts: f.parts });
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      url = String(url);
      const res = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      if (url === 'https://oauth2.googleapis.com/token') {
        calls.token++;
        const jwt = new URLSearchParams(init.body).get('assertion'), [h, pl, sig] = jwt.split('.');
        const okSig = nodeCrypto.createVerify('RSA-SHA256').update(`${h}.${pl}`).verify(publicKey, Buffer.from(sig, 'base64url'));
        const claims = JSON.parse(Buffer.from(pl, 'base64url'));
        if (!okSig || claims.iss !== account.client_email || claims.aud !== url || !/datastore/.test(claims.scope)) return res(400, { error: 'invalid_grant' });
        return res(200, { access_token: 'tok-' + calls.token, expires_in: 3600 });
      }
      assert.ok(url.startsWith(root), url);
      if (!/^Bearer tok-\d+$/.test(init.headers?.authorization || '')) { calls.unauth++; return res(401, {}); }
      const path = decodeURIComponent(url.slice(root.length));
      const [pathOnly, query = ''] = path.split('?'), want = new URLSearchParams(query).get('currentDocument.updateTime');
      if ((init.method || 'GET') === 'GET') { calls.get++; return docs.has(pathOnly) ? res(200, { name: pathOnly, fields: docs.get(pathOnly), updateTime: vers.get(pathOnly) || 'v0' }) : res(404, {}); }
      if (init.method === 'PATCH') {
        if (clash > 0 && pathOnly.endsWith('/builder/build')) { clash--; vers.set(pathOnly, 'x' + clash); }      // the professor's page saved first
        if (want && want !== (vers.get(pathOnly) || 'v0')) { calls.conflict++; return res(409, { error: { status: 'ABORTED' } }); }
        calls.patch++; docs.set(pathOnly, JSON.parse(init.body).fields); vers.set(pathOnly, 'v' + calls.patch); return res(200, {});
      }
      return res(405, {});
    };
    try {
      const env = { SERVICE_ACCOUNT: JSON.stringify(account) };
      const ask = async (name, args = {}) => { const t0 = performance.now(); const r = await worker.fetch(new Request(`https://c.test/mcp/${code}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }), env); slow = Math.max(slow, performance.now() - t0); return (await r.json()).result.content[0].text; };
      let slow = 0, jobs = 0, finished = false;
      assert.equal((await worker.fetch(new Request('https://c.test/mcp/' + code, { method: 'POST', body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' }), {})).status, 503);   // no secret: says so
      for (let i = 0; i < 200 && !finished; i++) {
        if (i === 3) clash = 1;
        const t = await ask('next_step');
        if (/^FINISHED/.test(t)) { finished = true; break; }
        const id = t.match(/^JOB ID: (\S+)/)[1];
        const state = JSON.parse(decodeFields(docs.get(`classes/${C}/builder/build`)).json);
        assert.equal(await ask('submit_step', { step_id: id, answer: goodAI(state.steps[id], t) }), 'Accepted. Call next_step now.', id);
        jobs++;
      }
      assert.equal(finished, true);
      const build = decodeFields(docs.get(`classes/${C}/builder/build`));
      assert.deepEqual([build.phase, build.total, build.done, build.stuck, build.code, build.startedAt], ['done', 33, 33, 0, code, 1.5]);
      assert.equal(JSON.stringify(stripOutputs(JSON.parse(build.json))), build.json);                    // results are kept out of the state
      assert.match(decodeFields(docs.get(`classes/${C}/built/notes-1`)).text, /^## Variables/);
      assert.ok(JSON.parse(decodeFields(docs.get(`classes/${C}/built/assign-2`)).json).files['solution/SumUnit2.java']);
      assert.equal(decodeFields(docs.get(`classes/${C}/built/assign-2`)).note, 'solution passes all tests');  // small programs are run by the Worker itself
      assert.equal([...docs.keys()].filter((k) => k.includes('/built/')).length, 33);
      assert.equal(calls.conflict, 1);                                                                       // a clash is noticed and redone, never overwritten
      assert.deepEqual([calls.token, calls.unauth], [1, 0]);                                                // signs in once, reuses the token
      assert.ok(calls.get / jobs < 12 && calls.patch / jobs < 4, `reads ${calls.get} writes ${calls.patch} for ${jobs} jobs`);
      assert.match(await ask('next_step').then(() => worker.fetch(new Request(`https://c.test/mcp/${'x'.repeat(32)}`, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'next_step', arguments: {} } }) }), env)).then((r) => r.json()).then((j) => j.result.content[0].text), /not active/);
      console.log(`      (${jobs} jobs: ${calls.get} reads, ${calls.patch} writes; slowest call ${slow.toFixed(1)} ms including the stand-in network)`);
    } finally { globalThis.fetch = realFetch; }
  });

  await atest('the practice run: a sample course in the Worker\'s own storage, with a page to read the results', async () => {
    const worker = (await import('../connector/worker.mjs')).default;
    const mem = new Map(); let puts = 0;
    const env = { BUILDS: { get: async (k) => mem.get(k) ?? null, put: async (k, v) => { puts++; mem.set(k, v); }, delete: async (k) => { mem.delete(k); } } };
    const code = 'demo-' + 'a1B2'.repeat(5);
    const ask = async (name, args = {}) => (await (await worker.fetch(new Request(`https://c.test/mcp/${code}`, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }), env)).json()).result.content[0].text;
    const pageText = async (q = '') => (await worker.fetch(new Request(`https://c.test/demo/${code}${q}`), env)).text();
    assert.equal((await worker.fetch(new Request(`https://c.test/mcp/${code}`, { method: 'POST', body: '{}' }), {})).status, 503);
    assert.match(await pageText(), /Nothing yet/);
    const first = await ask('next_step');
    assert.match(first, /^JOB ID: o1[\s\S]*\[slide 4 of "Lecture 05 Decisions\.pptx"\][\s\S]*else-if chain/);
    assert.doesNotMatch(first, /Lecture 06|sentinel/);                                    // only this file's text
    assert.match(await ask('submit_step', { step_id: 'o1', answer: '{"type":"lesson","topics":[{"title":"The if statement","parts":["slide 3"],"points":["The statements run only when the condition is true.","Always use braces, even for one statement."]}],"skip":[{"part":"slide 1","why":"title"},{"part":"slide 7","why":"announcements"}]}' }),
      /^NOT ACCEPTED[\s\S]*in no topic and not under "skip": slide 2, slide 4, slide 5, slide 6/);
    const p1 = await pageText();
    assert.match(p1, /\[todo\] build · o1 · Read Lecture 05 Decisions\.pptx[^\n]*tries 1\n\s+last problem: These parts/);
    assert.ok(puts <= 3, `puts ${puts}`);
    assert.match(await pageText('?reset=1'), /cleared/);
    assert.equal(mem.size, 0);
  });
}

// ---- Student study plan
{
  const P = await import('../app/js/studyplan.js');
  console.log('\nStudent study plan');
  test('today: mistakes first, then what is due, then this week\'s unit; never more than three things', () => {
    const sets = [{ id: 'c--unit-1', title: 'Unit 1', mistakes: 2, due: 4, questions: 12, seen: 12 }, { id: 'c--unit-2', title: 'Unit 2', mistakes: 5, due: 0, questions: 13, seen: 6 }];
    const unit = { id: 'unit-2', n: 2, title: 'Loops', read: false, examId: 'c--unit-2' };
    const t = P.todayTasks({ classId: 'c', sets, unit });
    assert.deepEqual(t.map((x) => [x.key, x.href]), [['mistakes', '#/start/c--unit-2/mistakes'], ['due', '#/start/c--unit-1/smart'], ['read', '#/study/c/unit-2']]);
    assert.match(t[0].title, /^Redo 7 questions/); assert.match(t[0].why, /Most are in Unit 2/);
    const read = P.todayTasks({ classId: 'c', sets: sets.map((x) => ({ ...x, mistakes: 0, due: 0 })), unit: { ...unit, read: true }, answeredToday: 12 });
    assert.deepEqual(read.map((x) => [x.key, x.done]), [['practice', true]]);
    assert.deepEqual(P.todayTasks({ classId: 'c', sets: [], unit: null }), []);
    assert.equal(P.todayTasks({ classId: 'c', sets: [{ id: 'x', title: 'X', mistakes: 0, due: 0, questions: 5, seen: 2 }], unit: null })[0].key, 'new');
  });
  test('the week: short sessions on the days chosen, nothing dropped with fewer days, a run-through before an exam', () => {
    const now = new Date('2027-02-08T10:00:00').getTime(), unit = { n: 3, title: 'While loops' };
    const days = (plan) => plan.map((p) => new Date(p.date).getDay());
    const four = P.weekPlan({ now, daysPerWeek: 4, unit, hasAssignment: true, earlier: 2 });
    assert.deepEqual(days(four), [1, 2, 4, 6]);
    assert.deepEqual(four.map((p) => p.minutes), [25, 20, 40, 30]);
    const three = P.weekPlan({ now, daysPerWeek: 3, unit, hasAssignment: true, earlier: 2 });
    assert.equal(three.length, 3);
    assert.equal(three.reduce((n, p) => n + p.minutes, 0), four.reduce((n, p) => n + p.minutes, 0));     // the same work, in fewer sittings
    const exam = P.weekPlan({ now, daysPerWeek: 4, unit, graded: [{ title: 'Midterm', at: new Date('2027-02-12T09:00:00').getTime() }] });
    const eve = exam.find((p) => p.graded === 'Midterm');
    assert.equal(new Date(eve.date).getDate(), 11);
    assert.match(eve.items[0].text, /Timed practice test/); assert.equal(eve.items.length, 1);
  });
  test('the tutor set-up tells the AI to coach, not solve, and carries only this unit\'s notes', () => {
    const p = P.tutorPrompt({ course: 'CS 150', unit: { n: 3, title: 'While loops' }, notes: 'A while loop repeats. ' + 'x'.repeat(20000) });
    assert.match(p, /Never write the finished answer/); assert.match(p, /taking a quiz or exam right now, stop/); assert.match(p, /You can be wrong/);
    assert.match(p, /Unit 3: While loops/); assert.ok(p.length < 13500);
  });
}

// ---- The student tutor connector: only the professor's notes, only for open units
{
  const T = await import('../connector/tutor.mjs');
  const CODE = 't'.repeat(32), NOW = 1_800_000_000_000;
  const docs = {
    [`tutorLinks/${CODE}`]: { classId: 'c1', uid: 'u1', section: '2', createdAt: NOW - 86400000 },
    'classes/c1': { name: 'CS150', course: 'CS 150', tools: { tutor: true }, study: { 'unit-1': { n: 1, title: 'Decisions', opensAt: NOW - 1000 }, 'unit-2': { n: 2, title: 'Loops', opensAt: NOW + 86400000 } }, timed: {} },
    'classes/c1/study/unit-1': { n: 1, opensAt: NOW - 1000, notes: '## The if statement\nAn if statement runs its body only when the condition is true.\n\n## Comparing Strings\nUse equals, not ==, to compare the letters of two Strings.' },
    'classes/c1/study/unit-2': { n: 2, opensAt: NOW + 86400000, notes: '## The while loop\nSECRET-NOT-OPEN-YET' },
    'classes/c1/testKeys/q1': { questions: { a: 'ANSWER-KEY' } },
  };
  const reads = [];
  const db = { async get(p) { reads.push(p); return docs[p] ?? null; } };
  const handle = T.createTutorHandler(T.dbTutorSource(db, { now: () => NOW }));
  const rpcT = async (body, code = CODE) => (await (await handle(new Request(`https://x.test/tutor/${code}`, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...body }) }))).json());
  const tool = async (name, args = {}, code = CODE) => (await rpcT({ method: 'tools/call', params: { name, arguments: args } }, code)).result;
  console.log('\nThe student tutor connector');
  await atest('gives the AI its rules, read-only tools, and only the notes of units that are open', async () => {
    const init = (await rpcT({ method: 'initialize', params: { protocolVersion: '2025-06-18' } })).result;
    assert.match(init.instructions, /Coach, do not solve/); assert.match(init.instructions, /ONLY from the course notes/); assert.match(init.instructions, /You can be wrong/);
    const tools = (await rpcT({ method: 'tools/list' })).result.tools;
    assert.deepEqual(tools.map((t) => [t.name, t.annotations.readOnlyHint]), [['list_units', true], ['get_notes', true], ['find_in_notes', true]]);
    const list = (await tool('list_units')).content[0].text;
    assert.match(list, /1\. Decisions/); assert.doesNotMatch(list, /Loops/);                         // unit 2 has not opened
    assert.match((await tool('get_notes', { unit: 1 })).content[0].text, /NOTES FOR UNIT 1: Decisions[\s\S]*Use equals, not ==/);
    const early = await tool('get_notes', { unit: 2 });
    assert.equal(early.isError, true); assert.match(early.content[0].text, /not open to this student/);
    const found = (await tool('find_in_notes', { words: 'compare strings' })).content[0].text;
    assert.match(found, /FROM UNIT 1[\s\S]*## Comparing Strings/); assert.doesNotMatch(found, /The if statement/);
    assert.match((await tool('find_in_notes', { words: 'while loop' })).content[0].text, /do not mention "while loop"[\s\S]*Do not answer from your own knowledge/);
    assert.equal(reads.some((p) => /unit-2|testKeys|tests|built|attempts|roster/.test(p)), false);     // never even asks for anything else
    assert.equal(JSON.stringify(await Promise.all(['list_units', 'get_notes', 'find_in_notes'].map((n) => tool(n, { unit: 2, words: 'SECRET' })))).includes('SECRET-NOT-OPEN-YET'), false);
  });
  await atest('is closed while graded work is open, when the instructor turns it off, and for dead or old links', async () => {
    docs['classes/c1'].timed = { q: { title: 'Quiz 3', status: 'published', opensAt: NOW + 5000, closesAt: NOW + 9000, windows: { 2: { opensAt: NOW - 1000, closesAt: NOW + 60000 } } } };
    const during = await tool('get_notes', { unit: 1 });
    assert.equal(during.isError, true); assert.match(during.content[0].text, /closed because "Quiz 3" is open[\s\S]*stop/);     // this student's section window is open
    docs['classes/c1'].timed.q.status = 'draft';
    assert.match((await tool('list_units')).content[0].text, /Decisions/);
    docs['classes/c1'].tools = { tutor: false };
    assert.match((await tool('list_units')).content[0].text, /instructor has turned the tutor off/);
    docs['classes/c1'].tools = { tutor: true };
    assert.match((await tool('list_units', {}, 'z'.repeat(32))).content[0].text, /not active[\s\S]*Do not answer course questions without the notes/);
    docs[`tutorLinks/${CODE}`].createdAt = NOW - 300 * 86400000;
    assert.match((await tool('list_units')).content[0].text, /not active/);
    assert.equal((await handle(new Request('https://x.test/tutor/short', { method: 'POST', body: '{}' }))).status, 404);
    const worker = (await import('../connector/worker.mjs')).default, demo = 'demo-' + 'q'.repeat(24);
    const d = await (await worker.fetch(new Request(`https://x.test/tutor/${demo}`, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'find_in_notes', arguments: { words: 'sentinel' } } }) }), {})).json();
    assert.match(d.result.content[0].text, /FROM UNIT 2: Lecture 06 While loops[\s\S]*Sentinel loops/);
  });
}

console.log(`\n${failed ? '\x1b[31m' : '\x1b[32m'}${passed} passed, ${failed} failed\x1b[0m\n`);
process.exit(failed ? 1 : 0);

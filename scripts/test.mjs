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

console.log(`\n${failed ? '\x1b[31m' : '\x1b[32m'}${passed} passed, ${failed} failed\x1b[0m\n`);
process.exit(failed ? 1 : 0);

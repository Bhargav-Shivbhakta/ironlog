// Public API of the browser Java runner. Works in the browser (inside a Web Worker) and in Node (for the build checks).
import { compileProgram } from './compiler.js';

export function compile(source, opts = {}) {
  return compileProgram(source, opts);
}

// javac-style error text:
//   Main.java:5: error: ';' expected
//           int n = scnr.nextInt()
//                                 ^
export function formatErrors(errors, source, fileName = 'Main.java') {
  const lines = source.split('\n');
  const out = errors.map((e) => {
    const [first, ...rest] = e.message.split('\n');
    const srcLine = (lines[e.line - 1] || '').replace(/\t/g, '    ');
    const raw = lines[e.line - 1] || '';
    let caretCol = 0;
    for (let i = 0; i < Math.max(0, (e.col || 1) - 1) && i < raw.length; i++) caretCol += raw[i] === '\t' ? 4 : 1;
    return `${fileName}:${e.line}: error: ${first}\n${srcLine}\n${' '.repeat(caretCol)}^${rest.length ? '\n' + rest.join('\n') : ''}`;
  });
  out.push(`${errors.length} error${errors.length === 1 ? '' : 's'}`);
  return out.join('\n');
}

export function runProgram(source, input = '', opts = {}) {
  const prog = compileProgram(source, opts);
  if (prog.errors.length) return { compileErrors: prog.errors };
  return prog.run(input, opts);
}

// Same rules as the course's run_tests.sh: // and /* */ comments are removed, then each regex is checked line by line.
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
}
export function checkStructure(source, checks = []) {
  const code = stripComments(source).split('\n');
  return checks.map((c) => {
    let re;
    try { re = new RegExp(c.pattern); } catch { re = null; }
    const found = !!re && code.some((l) => re.test(l));
    return { ...c, passed: c.kind === 'require' ? found : !found };
  });
}

// Output comparison: trailing spaces at the ends of lines and trailing blank lines are ignored.
export function normalizeOutput(s) {
  const lines = String(s).replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[ \t]+$/, ''));
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

// tests: [{ name, input, output }], checks: [{ kind, pattern, label }]
export function runTests(source, { className = null, tests = [], checks = [] } = {}, opts = {}) {
  const prog = compileProgram(source, { expectedClass: className });
  const structure = checkStructure(source, checks);
  if (prog.errors.length) {
    return { compileErrors: prog.errors, structure, results: [], passed: structure.filter((s) => s.passed).length, total: tests.length + structure.length };
  }
  const results = tests.map((t) => {
    const r = prog.run(t.input, { timeLimitMs: opts.timeLimitMs ?? 5000, maxSteps: opts.maxSteps ?? 50_000_000 });
    const passed = !r.timedOut && !r.outputLimit && normalizeOutput(r.stdout) === normalizeOutput(t.output);
    return { name: t.name, passed, input: t.input, expected: t.output, actual: r.stdout.length > 100000 ? r.stdout.slice(0, 100000) : r.stdout, stderr: r.stderr, timedOut: r.timedOut, outputLimit: !!r.outputLimit, exception: r.exception };
  });
  const passed = results.filter((r) => r.passed).length + structure.filter((s) => s.passed).length;
  return { compileErrors: null, structure, results, passed, total: tests.length + structure.length };
}

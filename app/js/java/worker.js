// Runs student code off the main thread so a slow or infinite loop never freezes the page.
import { compile, runTests, formatErrors, checkStructure } from './index.js';

self.onmessage = (e) => {
  const { id, kind, source, input, spec, fileName } = e.data;
  try {
    if (kind === 'run') {
      const prog = compile(source, { expectedClass: spec?.className || null });
      if (prog.errors.length) {
        self.postMessage({ id, ok: true, result: { compileErrors: prog.errors, errorText: formatErrors(prog.errors, source, fileName) } });
        return;
      }
      const t0 = performance.now();
      const r = prog.run(input || '', { timeLimitMs: 5000 });
      r.ms = Math.round(performance.now() - t0);
      if (r.stdout.length > 200000) r.stdout = r.stdout.slice(0, 200000);
      self.postMessage({ id, ok: true, result: r });
    } else if (kind === 'test') {
      const r = runTests(source, spec, { timeLimitMs: 5000 });
      if (r.compileErrors) r.errorText = formatErrors(r.compileErrors, source, fileName);
      self.postMessage({ id, ok: true, result: r });
    } else if (kind === 'check') {
      const prog = compile(source, { expectedClass: spec?.className || null });
      self.postMessage({ id, ok: true, result: { compileErrors: prog.errors, structure: checkStructure(source, spec?.checks || []) } });
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.stack || err) });
  }
};

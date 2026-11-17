// Main-thread helper: sends code to the worker and enforces a hard time limit.
let worker = null;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    clearTimeout(p.timer);
    if (e.data.ok) p.resolve(e.data.result); else p.reject(new Error(e.data.error));
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error(e.message || 'The Java runner crashed')); }
    pending.clear();
    worker = null;
  };
  return worker;
}

function call(msg, hardLimitMs) {
  const w = getWorker();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      // the program is stuck in a way the runner couldn't interrupt: kill the worker
      pending.delete(id);
      try { w.terminate(); } catch {}
      worker = null;
      resolve({ killed: true, timedOut: true, stdout: '', stderr: '', results: [] });
    }, hardLimitMs);
    pending.set(id, { resolve, reject, timer });
    w.postMessage({ id, ...msg });
  });
}

export function runJava(source, input, { className, fileName }) {
  return call({ kind: 'run', source, input, spec: { className }, fileName }, 9000);
}
export function testJava(source, spec, fileName) {
  return call({ kind: 'test', source, spec, fileName }, 6000 * Math.max(1, spec.tests.length) + 3000);
}
export function checkJava(source, spec, fileName) {
  return call({ kind: 'check', source, spec, fileName }, 4000);
}

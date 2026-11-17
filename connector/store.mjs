// Where the connector keeps a build: the class's own database, next to the materials.
//
//   buildLinks/{code}                  → { classId }           the secret link code → which class
//   classes/{C}/builder/build          → { json, phase, … }    the build's state (engine.js), as text
//   classes/{C}/materialText/{M}_{i}   the words of each file  (read only, and only the files a job needs)
//   classes/{C}/built/{stepId}         what each finished job made
//
// db: { get(path) → object | null, set(path, object) }   (Firestore on the real host, the mock in tests)
import { needs } from '../app/js/build/engine.js';

export const stripOutputs = (st) => { const c = JSON.parse(JSON.stringify(st)); for (const s of Object.values(c.steps)) delete s.output; return c; };
export const summary = (st) => { const all = Object.values(st.steps); return { phase: st.phase, total: all.length, done: all.filter((s) => s.status === 'done').length, stuck: all.filter((s) => s.status === 'stuck').length }; };
export const builtDoc = (s, at) => ({ id: s.id, kind: s.kind, title: s.title, unit: s.unit ?? null, exam: s.exam ?? null, problem: s.problem ?? null, note: s.note || '',
  ...(typeof s.output === 'string' ? { text: s.output } : { json: JSON.stringify(s.output ?? null) }), at });

export function dbStore(db, { hooks = {}, now = () => Date.now() } = {}) {
  return {
    async open(code) {
      const link = await db.get(`buildLinks/${code}`);
      if (!link?.classId) return null;
      const base = `classes/${link.classId}`;
      const got = db.getWithRev ? await db.getWithRev(`${base}/builder/build`) : { data: await db.get(`${base}/builder/build`), rev: null };
      const doc = got.data; let rev = got.rev;
      if (!doc?.json || doc.code !== code) return null;        // the build was started over: the old link is dead
      const st = JSON.parse(doc.json);
      const ctx = { files: [], outputs: {} };
      return {
        st, ctx, hooks,
        // read what a job needs (and nothing else): the text of its files, earlier results it builds on
        async load(stepId) {
          const n = needs(st, stepId);
          for (const id of n.files) {
            if (ctx.files.some((f) => f.id === id)) continue;
            const f = st.files.find((x) => x.id === id);
            if (!f) continue;
            const chunks = await Promise.all(Array.from({ length: f.chunks }, (_, i) => db.get(`${base}/materialText/${id}_${i}`)));
            // the professor removed or replaced this file after the build started: its text is gone
            if (!f.chunks || chunks.some((c) => !c)) throw Object.assign(new Error('A course file was removed after the build started.'), { code: 'materials' });
            ctx.files.push({ id, name: f.name, parts: chunks.flatMap((c) => c?.parts || []) });
          }
          for (const id of n.outputs) {
            if (id in ctx.outputs) continue;
            const b = await db.get(`${base}/built/${id}`);
            if (b) ctx.outputs[id] = b.text ?? JSON.parse(b.json || 'null');
          }
        },
        async save(s, done) {
          const at = now();
          for (const id of [].concat(done || [])) if (s.steps[id]?.status === 'done') await db.set(`${base}/built/${id}`, builtDoc(s.steps[id], at));
          // only if nobody (another chat, or the professor approving the map) saved since we read it
          await db.set(`${base}/builder/build`, { ...doc, json: JSON.stringify(stripOutputs(s)), ...summary(s), updatedAt: at, lastCallAt: at }, rev ? { ifRev: rev } : undefined);
          rev = null;
        },
      };
    },
  };
}

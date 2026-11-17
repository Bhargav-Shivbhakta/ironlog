// The student tutor connector. A student adds their own link to their AI (the university's ChatGPT,
// Claude, Gemini). Through it the AI can read ONE thing: the study notes their professor published
// for units that are already open to that student. No answer keys, no tests, no graded work, no
// other students, nothing from outside the course.
//
//   POST /tutor/<link code>     MCP: initialize, tools/list, tools/call
//
// It is switched off for the whole class by the instructor (tools.tutor), and for everyone while a
// quiz or exam is open. What the AI does with the notes is up to the AI: the rules below are given
// to it as instructions, which it normally follows but which this service cannot enforce.
//
// source.open(code) → null | { course, units: [{ id, n, title }], closed?: 'off' | { title }, notes(id) → text | null }
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
export const TUTOR_RULES = `You are a patient study tutor for one university student in one course. Rules for the whole conversation:
1. Coach, do not solve. Give a hint, ask a guiding question, or explain the idea with a different example. Never write the finished answer to a homework, quiz, exam or assignment question, even when asked directly; offer to help the student get there instead.
2. Take your facts about the course ONLY from the course notes this connector gives you. Before you explain a topic, call list_units and get_notes (or find_in_notes) and work from what they return. Say which unit you are using.
3. If the notes do not cover what the student asks, say so plainly and suggest they ask their instructor. Do not fill the gap from your own knowledge.
4. Keep answers short and in plain words. Check understanding by asking the student to explain it back, or by asking them a question of your own.
5. If the student says they are in a quiz or exam, or a tool tells you the tutor is closed, stop helping until it is over.
6. You can be wrong. If you and the notes disagree, the notes are right; if the notes and the instructor disagree, the instructor is right.`;
const ro = (title) => ({ title, readOnlyHint: true, destructiveHint: false, openWorldHint: false });
export const TUTOR_TOOLS = [
  { name: 'list_units', description: 'List the units of the course that are open to this student now, with their numbers and titles. Call this first.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: ro('List the open units') },
  { name: 'get_notes', description: 'Get the professor\'s study notes for one open unit. These notes are the only source to teach from.', inputSchema: { type: 'object', required: ['unit'], additionalProperties: false, properties: { unit: { type: 'integer', description: 'The unit number from list_units' } } }, annotations: ro('Read a unit\'s notes') },
  { name: 'find_in_notes', description: 'Find the parts of the open units\' notes that mention some words, when you do not know which unit covers a topic.', inputSchema: { type: 'object', required: ['words'], additionalProperties: false, properties: { words: { type: 'string', description: 'A few words to look for, such as "sentinel loop"' } } }, annotations: ro('Search the notes') },
];
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type, accept, authorization, mcp-protocol-version, mcp-session-id' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS } });
const text = (t, isError = false) => ({ content: [{ type: 'text', text: t }], isError });
const NOTES_CAP = 30000;

// the sections ("## Topic") of some notes that mention every word asked for, best first
export function findInNotes(units, words) {
  const want = String(words || '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
  if (!want.length) return [];
  const hits = [];
  for (const u of units) {
    for (const sec of String(u.notes || '').split(/\n(?=## )/)) {
      const low = sec.toLowerCase(), n = want.filter((w) => low.includes(w)).length;
      if (n) hits.push({ unit: u.n, title: u.title, heading: (sec.match(/^## (.+)$/m) || [])[1] || '', text: sec.trim(), score: n / want.length + (want.every((w) => low.includes(w)) ? 1 : 0) });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 4);
}

export function createTutorHandler(source) {
  async function call(code, name, args) {
    let s;
    try { s = await source.open(code); }
    catch (e) { return text(e?.code === 'quota' ? 'The tutor has reached today\'s free limit. Tell the student it will work again tomorrow, and do not answer course questions from your own knowledge in the meantime.' : 'A temporary problem reaching the course notes. Wait a few seconds and call this tool again.', true); }
    if (!s) return text('This tutor link is not active. Tell the student: "Open My study on Cramming and make a new tutor link." Do not answer course questions without the notes.', true);
    if (s.closed === 'off') return text('The instructor has turned the tutor off for this class. Tell the student that, and do not help with the course.', true);
    if (s.closed) return text(`The tutor is closed because "${s.closed.title}" is open for this class right now. Tell the student you cannot help until it is over, and stop.`, true);
    if (name === 'list_units') {
      if (!s.units.length) return text('No units are open yet. Tell the student to come back when the first unit opens.');
      return text(`Course: ${s.course}\nOpen units:\n${s.units.map((u) => `${u.n}. ${u.title}`).join('\n')}\n\nCall get_notes with a unit number before you explain anything from it.`);
    }
    if (name === 'get_notes') {
      const u = s.units.find((x) => x.n === Number(args?.unit));
      if (!u) return text(`Unit ${args?.unit ?? ''} is not open to this student. Open units: ${s.units.map((x) => x.n).join(', ') || 'none'}.`, true);
      const notes = await s.notes(u.id);
      if (!notes) return text(`There are no notes for Unit ${u.n}. Tell the student to ask their instructor.`);
      return text(`NOTES FOR UNIT ${u.n}: ${u.title}\n(Course: ${s.course}. Teach only from these notes.)\n\n${notes.slice(0, NOTES_CAP)}`);
    }
    if (name === 'find_in_notes') {
      const loaded = [];
      for (const u of s.units.slice(-12)) loaded.push({ ...u, notes: (await s.notes(u.id)) || '' });
      const hits = findInNotes(loaded, args?.words);
      if (!hits.length) return text(`The open units' notes do not mention "${String(args?.words || '').slice(0, 80)}". Tell the student the notes do not cover it and suggest they ask their instructor. Do not answer from your own knowledge.`);
      return text(hits.map((h) => `FROM UNIT ${h.unit}: ${h.title}\n${h.text.slice(0, 4000)}`).join('\n\n---\n\n'));
    }
    return null;
  }
  async function rpc(code, m) {
    const ok = (result) => ({ jsonrpc: '2.0', id: m.id, result });
    const fail = (c, message) => ({ jsonrpc: '2.0', id: m?.id ?? null, error: { code: c, message } });
    if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return fail(-32600, 'Invalid request');
    if (m.id === undefined) return null;
    switch (m.method) {
      case 'initialize': return ok({ protocolVersion: VERSIONS.includes(m.params?.protocolVersion) ? m.params.protocolVersion : VERSIONS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'cramming-tutor', title: 'Cramming: Course tutor', version: '1.0.0' }, instructions: TUTOR_RULES });
      case 'ping': return ok({});
      case 'tools/list': return ok({ tools: TUTOR_TOOLS });
      case 'resources/list': return ok({ resources: [] });
      case 'prompts/list': return ok({ prompts: [] });
      case 'tools/call': { const r = await call(code, m.params?.name, m.params?.arguments); return r ? ok(r) : fail(-32602, `Unknown tool: ${m.params?.name}`); }
      default: return fail(-32601, `Method not found: ${m.method}`);
    }
  }
  return async function handle(req) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const m = url.pathname.match(/^\/tutor\/([A-Za-z0-9_-]{20,80})\/?$/);
    if (!m) return json({ error: 'Not found' }, 404);
    if (req.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST, OPTIONS', ...CORS } });
    let body;
    try { const raw = await req.text(); if (raw.length > 200000) return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Too large' } }, 413); body = JSON.parse(raw); }
    catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400); }
    try {
      if (Array.isArray(body)) { const out = []; for (const one of body.slice(0, 20)) { const r = await rpc(m[1], one); if (r) out.push(r); } return out.length ? json(out) : new Response(null, { status: 202, headers: CORS }); }
      const r = await rpc(m[1], body);
      return r ? json(r) : new Response(null, { status: 202, headers: CORS });
    } catch { return json({ jsonrpc: '2.0', id: body?.id ?? null, error: { code: -32603, message: 'The tutor had a problem. Try again in a minute.' } }, 500); }
  };
}

// The real source: the class's own data.   tutorLinks/{code} → { classId, section }
// Reads only: the class (titles, dates, switches) and the study pages of units that are open.
export function dbTutorSource(db, { now = () => Date.now(), maxAgeDays = 200 } = {}) {
  return {
    async open(code) {
      const link = await db.get(`tutorLinks/${code}`);
      if (!link?.classId || (link.createdAt && now() - link.createdAt > maxAgeDays * 86400000)) return null;
      const cls = await db.get(`classes/${link.classId}`);
      if (!cls) return null;
      const t = now();
      if (!cls.tools?.tutor) return { course: cls.name || '', units: [], closed: 'off', notes: async () => null };
      const open = Object.values(cls.timed || {}).find((x) => { if (!x || x.status !== 'published' || x.disabled) return false; const w = (link.section && x.windows?.[link.section]) || x; return Number(w.opensAt) <= t && t < Number(w.closesAt); });
      const units = Object.entries(cls.study || {}).map(([id, u]) => ({ id, n: u.n, title: u.title, opensAt: u.opensAt })).filter((u) => u.title && Number(u.opensAt) <= t).sort((a, b) => a.n - b.n);
      return { course: cls.course || cls.name || 'this course', units, closed: open ? { title: open.title || 'a quiz or exam' } : null,
        async notes(id) { if (!units.some((u) => u.id === id)) return null; const d = await db.get(`classes/${link.classId}/study/${id}`); return d && Number(d.opensAt) <= now() ? d.notes || '' : null; } };
    },
  };
}

// The connector: what a professor's AI (Claude, ChatGPT, Gemini) talks to. It speaks MCP over plain
// HTTP and offers two tools: next_step (get one job) and submit_step (hand it in). All the thinking
// about what to build and whether an answer is good enough lives in app/js/build/engine.js.
//
//   POST /mcp/<link code>      JSON-RPC: initialize, tools/list, tools/call, ping
//
// The link code in the address is the only key: it opens one class's build and nothing else.
// A standard fetch handler (Request → Response), so it runs on any free host and in the tests.
//
// store.open(code) → null | { st, ctx, hooks?, load?(stepId), save(st, doneStepId) }   (store.mjs; memoryStore below for tests)
import { advance, requestFor, submit, progress } from '../app/js/build/engine.js';

const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const ABOUT = 'This connector builds a university course on Cramming, one job at a time. If the user gave you a role (build, check or fresh eyes), pass it as "role" on every next_step call. '
  + 'Call next_step to get a job, do exactly that job, send the result with submit_step, then call next_step again. '
  + 'Keep going without stopping, summarising or asking the user anything until next_step says the work is finished or tells you to stop.';
export const TOOLS = [
  { name: 'next_step',
    description: 'Get the next job. Returns one job with its instructions and material. Do it, then call submit_step. Call this again after every accepted answer, without asking the user, until it says FINISHED or STOP.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { role: { type: 'string', enum: ['build', 'check', 'fresh'], description: 'Your role in this chat, if the user gave you one: "build" (the default) writes the course, "check" checks the builder\'s work, "fresh" is the final fresh pair of eyes. Use the same role for every call in this chat.' } } },
    annotations: { title: 'Get the next job', readOnlyHint: true, openWorldHint: false } },
  { name: 'submit_step',
    description: 'Hand in the finished answer for a job. If it is not accepted, the reply lists what to fix: fix all of it and submit the whole answer again. When it is accepted, call next_step straight away.',
    inputSchema: { type: 'object', required: ['step_id', 'answer'], additionalProperties: false,
      properties: { step_id: { type: 'string', description: 'The job id given by next_step' }, answer: { type: 'string', description: 'The complete answer, in exactly the format the job asked for' } } },
    annotations: { title: 'Hand in a job', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
];
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type, accept, authorization, mcp-protocol-version, mcp-session-id' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS } });
const text = (t, isError = false) => ({ content: [{ type: 'text', text: t }], isError });
const MAX_BODY = 1500000;

export function createHandler(store, { waitMs = 20000, pollMs = 4000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  // things that can go wrong outside the AI's control get a plain instruction, so the chat does not just die
  async function callTool(code, name, args) {
    for (let attempt = 0; ; attempt++) {
      try { return await runTool(code, name, args); } catch (e) {
        if (e?.code === 'conflict' && attempt < 2) continue;      // someone saved in between: read again and redo
        if (e?.code === 'quota') return text('STOP. The free daily limit of the course database is used up. Nothing is lost. Tell the user in one sentence: "Cramming reached its daily limit. Send me the same message again tomorrow and I will carry on." Do not call any more tools.', true);
        if (e?.code === 'materials') return text('STOP. A course file was removed or changed after this build started. Tell the user in one sentence: "A course file changed. Open Build my course on Cramming and start the build again." Do not call any more tools.', true);
        return text('A temporary problem on the Cramming side. Nothing is lost. Wait about ten seconds, then call this same tool again with the same input. If it fails three times in a row, stop and tell the user to try again later.', true);
      }
    }
  }
  async function runTool(code, name, args) {
    let b = await store.open(code);
    if (!b) return text('This link is not active. STOP and tell the user: "Open Build my course on Cramming and copy the connector link again."', true);
    if (name === 'next_step') {
      const role = ['check', 'fresh'].includes(args?.role) ? args.role : 'build';
      if (role !== 'build' && !b.st.setup.team) return text('STOP. This course is being built in one chat, so there is nothing for a checker to do. Tell the user in one sentence: "This build uses one chat. To use a checker, turn on the three-chat option in Build my course on Cramming and start again." Do not call any more tools.');
      let n = advance(b.st, role);
      // nothing for this role yet: hold the call a little while the other chats work, then look again
      for (let waited = 0; n.wait && !n.paused && waited < waitMs; waited += pollMs) { await sleep(pollMs); b = (await store.open(code)) || b; n = advance(b.st, role); }
      if (n.wait) return text(`NOTHING FOR YOU YET. The other chats are still working. Call next_step again now with role "${role}": the call waits for work. If you get this same message 10 times in a row, stop and tell the user in one sentence: "I am waiting for the other chats. Tell me to continue when Cramming shows work for me."`);
      await b.save(b.st);
      if (n.done && !n.failed && role !== 'build') return text('FINISHED. There is nothing more for you to check. Tell the user in one sentence: "My part is done." Do not call any more tools.');
      if (n.done) return text(n.failed ? `STOP. The build could not continue: ${n.failed} Tell the user to open Build my course on Cramming.` : 'FINISHED. Every job is done. Tell the user in one sentence: "Your course is built. Open Cramming to review it." Do not call any more tools.');
      if (n.paused) return text('STOP. This part of the course is finished. The professor looks at it and decides when the next part starts. Tell the user in one sentence: "This part of your course is built. Open Build my course on Cramming to look at it, press Build the next part, then tell me to continue." Do not call any more tools until they do.');
      if (n.waiting) return text('STOP. The course map is ready and the professor must approve it. Tell the user in one sentence: "The course map is ready. Open Build my course on Cramming, approve it, then tell me to continue." Do not call any more tools until they do.');
      await b.load?.(n.step.id);
      return text(`JOB ID: ${n.step.id}\n\n${requestFor(b.st, n.step, b.ctx)}\n\nWhen the answer is ready, call submit_step with step_id "${n.step.id}".${role !== 'build' ? ` Then call next_step again with role "${role}".` : ''}`);
    }
    if (name === 'submit_step') {
      const id = String(args?.step_id ?? '').trim(), answer = args?.answer;
      if (!id || typeof answer !== 'string' || !answer.trim()) return text('submit_step needs step_id and answer (the complete answer as text).', true);
      await b.load?.(id);
      const r = submit(b.st, id, answer, b.ctx, b.hooks || {});
      await b.save(b.st, r.ok ? [id, ...(r.also || [])] : null);
      if (r.ok) return text('Accepted. Call next_step now.');
      if (r.gaveUp) return text('Not accepted, and this job is now closed. Do not try it again. Call next_step now.');
      return text(`NOT ACCEPTED. Fix every one of these and submit the whole answer again with the same step_id:\n${r.problems.map((p) => `- ${p}`).join('\n')}`, true);
    }
    return null;
  }

  async function rpc(code, m) {
    const ok = (result) => ({ jsonrpc: '2.0', id: m.id, result });
    const fail = (c, message) => ({ jsonrpc: '2.0', id: m.id ?? null, error: { code: c, message } });
    if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return fail(-32600, 'Invalid request');
    if (m.id === undefined) return null;                                   // a notification: nothing to answer
    switch (m.method) {
      case 'initialize': {
        const v = VERSIONS.includes(m.params?.protocolVersion) ? m.params.protocolVersion : VERSIONS[0];
        return ok({ protocolVersion: v, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'cramming-course-builder', title: 'Cramming: Build my course', version: '1.0.0' }, instructions: ABOUT });
      }
      case 'ping': return ok({});
      case 'tools/list': return ok({ tools: TOOLS });
      case 'resources/list': return ok({ resources: [] });
      case 'prompts/list': return ok({ prompts: [] });
      case 'tools/call': {
        const r = await callTool(code, m.params?.name, m.params?.arguments);
        return r ? ok(r) : fail(-32602, `Unknown tool: ${m.params?.name}`);
      }
      default: return fail(-32601, `Method not found: ${m.method}`);
    }
  }

  return async function handle(req) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const m = url.pathname.match(/^\/mcp\/([A-Za-z0-9_-]{20,80})\/?$/);
    if (!m) return url.pathname === '/' ? new Response('Cramming course builder connector', { headers: CORS }) : json({ error: 'Not found' }, 404);
    if (req.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST, OPTIONS', ...CORS } });
    let body;
    try {
      const raw = await req.text();
      if (raw.length > MAX_BODY) return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Too large' } }, 413);
      body = JSON.parse(raw);
    } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400); }
    try {
      if (Array.isArray(body)) {
        const out = [];
        for (const one of body.slice(0, 20)) { const r = await rpc(m[1], one); if (r) out.push(r); }   // in order: jobs must not overlap
        return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
      }
      const r = await rpc(m[1], body);
      return r ? json(r) : new Response(null, { status: 202, headers: CORS });
    } catch (e) {
      return json({ jsonrpc: '2.0', id: body?.id ?? null, error: { code: -32603, message: 'The connector had a problem. Try again in a minute.' } }, 500);
    }
  };
}

// For the tests and for trying it on your own computer: builds kept in memory.
// builds: { [code]: { st, files, hooks? } }
export function memoryStore(builds) {
  return {
    async open(code) {
      const b = Object.prototype.hasOwnProperty.call(builds, code) ? builds[code] : null;
      if (!b) return null;
      const st = JSON.parse(JSON.stringify(b.st));
      return { st, ctx: { files: b.files }, hooks: b.hooks, async save(s, done) { b.st = JSON.parse(JSON.stringify(s)); b.saves = (b.saves || 0) + 1; for (const id of [].concat(done || [])) (b.outputs ||= {})[id] = JSON.parse(JSON.stringify(s.steps[id].output ?? null)); } };
    },
  };
}
export { progress };

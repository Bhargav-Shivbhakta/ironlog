// The connector as a Cloudflare Worker (free plan).
//   SERVICE_ACCOUNT (secret)   the whole Firebase service account key file (JSON text): real classes
//   BUILDS (KV binding)        optional: a practice run with a sample course, for links that start "demo-"
// Java solutions are run here too (small programs take about a millisecond); the Review page runs
// every solution again in the professor's browser before anything is published.
import { createHandler } from './handler.mjs';
import { dbStore } from './store.mjs';
import { firestoreDb } from './firestore.mjs';
import { demoStore, demoPage, isDemo } from './demo.mjs';
import { runTests } from '../app/js/java/index.js';
import { createTutorHandler, dbTutorSource } from './tutor.mjs';
import { DEMO_FILES } from './demo.mjs';

// Small student programs take about a millisecond to run, so the Worker can check them itself.
const hooks = { runTests: (src, spec) => runTests(src, spec, { timeLimitMs: 1500 }) };

let real = null, demo = null, tutor = null, tutorDemo = null;
// a practice tutor with the sample course's text as its notes (links that start "demo-")
const demoTutorSource = { async open(code) { return isDemo(code) ? { course: 'CS 150 (sample)', units: DEMO_FILES.map((f, i) => ({ id: f.id, n: i + 1, title: f.name.replace(/\.\w+$/, '') })), closed: null, async notes(id) { const f = DEMO_FILES.find((x) => x.id === id); return f ? f.parts.map((p) => `## ${p.text.split('\n')[0]}\n${p.text.split('\n').slice(1).join('\n')}`).join('\n\n') : null; } } : null; } };
const codeOf = (url) => (url.pathname.match(/^\/(?:mcp|demo|tutor)\/([A-Za-z0-9_-]{20,80})\/?$/) || [])[1] || '';
export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url), code = codeOf(url);
      if (url.pathname.startsWith('/tutor/')) {
        if (isDemo(code)) { tutorDemo ||= createTutorHandler(demoTutorSource); return await tutorDemo(request); }
        if (!env.SERVICE_ACCOUNT) return new Response('The tutor is not set up yet.', { status: 503 });
        tutor ||= createTutorHandler(dbTutorSource(firestoreDb(JSON.parse(env.SERVICE_ACCOUNT))));
        return await tutor(request);
      }
      if (isDemo(code)) {
        if (!env.BUILDS) return new Response('The practice run is not set up: the BUILDS storage is not connected.', { status: 503 });
        if (url.pathname.startsWith('/demo/')) return await demoPage(env.BUILDS, code, url.searchParams.has('reset'));
        demo ||= createHandler(demoStore(env.BUILDS, { hooks }));
        return await demo(request);
      }
      if (!real) {
        if (!env.SERVICE_ACCOUNT) return url.pathname === '/' ? new Response('Cramming course builder connector') : new Response('The connector is not set up yet: the SERVICE_ACCOUNT secret is missing.', { status: 503 });
        real = createHandler(dbStore(firestoreDb(JSON.parse(env.SERVICE_ACCOUNT)), { hooks }));
      }
      return await real(request);
    } catch (e) {
      return new Response('The connector had a problem. Try again in a minute.', { status: 500 });
    }
  },
};

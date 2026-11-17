// Safe Exam Browser settings file (.seb) for one exam, made in the browser. Format (safeexambrowser.org
// developer docs): a plist (XML) of settings, gzipped, prefixed with "plnd" (= not encrypted), gzipped again.
// Keys not listed keep SEB's own exam defaults (Print Screen and screen capture off, no URL filter,
// no switching to other apps, links that open a new window open one).

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function plist(obj) {
  const val = (v) => (typeof v === 'boolean' ? (v ? '<true/>' : '<false/>') : Number.isInteger(v) ? `<integer>${v}</integer>` : `<string>${xmlEsc(v)}</string>`);
  const body = Object.entries(obj).map(([k, v]) => `\t<key>${xmlEsc(k)}</key>\n\t${val(v)}`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n${body}\n</dict>\n</plist>\n`;
}
async function gzip(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function sha256hex(text) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function sebSettings({ startURL, quitURL, hashedQuitPassword = '' }) {
  return {
    originatorVersion: 'Cramming',
    sebConfigPurpose: 0,                 // starting an exam (doesn't change the student's own SEB settings)
    startURL,
    quitURL,                             // the site's "Quit Safe Exam Browser" button goes here after submitting
    quitURLConfirm: false,
    hashedQuitPassword,                  // for the proctor if a student must leave early
    allowQuit: true,
    browserWindowAllowReload: false,     // reloading would leave the exam page and end the exam
    showReloadButton: false,
    newBrowserWindowByLinkPolicy: 2,     // the Google sign-in window opens
    newBrowserWindowByScriptPolicy: 2,
    newBrowserWindowByLinkBlockForeign: false,
    enablePrintScreen: false,
    allowScreenCapture: false,
    URLFilterEnable: false,
    allowSwitchToApplications: false,
  };
}

export async function makeSebFile({ startURL, quitURL, quitPassword = '' }) {
  if (typeof CompressionStream === 'undefined') throw new Error('This browser is too old to make the file. Use a current Chrome, Edge, Firefox or Safari.');
  const hashedQuitPassword = quitPassword ? await sha256hex(quitPassword) : '';
  const xml = new TextEncoder().encode(plist(sebSettings({ startURL, quitURL, hashedQuitPassword })));
  const inner = await gzip(xml);
  const prefixed = new Uint8Array(4 + inner.length);
  prefixed.set(new TextEncoder().encode('plnd'), 0);
  prefixed.set(inner, 4);
  return new Blob([await gzip(prefixed)], { type: 'application/seb' });
}

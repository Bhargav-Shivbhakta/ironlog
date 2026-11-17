// Shared frame for the public pages (landing, privacy, terms, AI, accessibility): the stylesheet,
// header, footer, and the "Request access" sheet. No database reads; one write per request sent.
import * as cloud from '../cloud.js';
import { esc } from '../ui.js';

let cssReady = null;
export function ensureCss() {
  return cssReady ||= new Promise((resolve) => {
    if (document.querySelector('link[data-landing-css]')) return resolve();
    const l = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'css/landing.css' });
    l.dataset.landingCss = '';
    l.onload = l.onerror = () => resolve();
    document.head.append(l);
  });
}

const LOGO = '<svg width="22" height="22" viewBox="0 0 28 28" aria-hidden="true"><circle cx="9" cy="9" r="5.5"/><circle class="filled" cx="19" cy="9" r="5.5"/><circle cx="9" cy="19" r="5.5"/><circle cx="19" cy="19" r="5.5"/></svg>';

// onLanding: section links scroll within the page; elsewhere they go back to it.
export function header(onLanding) {
  const to = (id) => (onLanding ? '#/' : `#/?to=${id}`);
  return `<header class="lp-head">
    <div class="wrap">
      <a class="lp-brand" href="#/" ${onLanding ? 'data-top' : ''} aria-label="Cramming home">${LOGO}<span>Cramming<sup class="tm" aria-hidden="true">™</sup></span></a>
      <nav class="lp-nav" aria-label="Main">
        <a class="link hide-sm" href="${to('students')}" data-jump="students">Students</a>
        <a class="link hide-sm" href="${to('professors')}" data-jump="professors">Professors</a>
        <a class="link hide-sm" href="${to('faq')}" data-jump="faq">Questions</a>
        <a class="link" href="#/signin">Sign in</a>
        <button type="button" class="lp-btn small" data-request>Request access</button>
      </nav>
    </div>
    <div class="lp-progress" aria-hidden="true"></div>
  </header>`;
}

export function footer() {
  return `<footer class="lp-foot"><div class="wrap">
    <span>© ${new Date().getFullYear()} Cramming™ · Cram the right way.™ Cramming and Cram the right way are trademarks of Cramming.</span>
    <nav aria-label="Policies"><a href="#/privacy">Privacy</a><a href="#/terms">Terms</a><a href="#/ai">How we use AI</a><a href="#/accessibility">Accessibility</a></nav>
  </div></footer>`;
}

const SHEET = `<dialog class="lp-sheet" aria-labelledby="ra-h">
  <div class="in">
    <div class="top"><h2 id="ra-h">Request access</h2><button type="button" class="x" data-close aria-label="Close"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>
    <div data-body>
      <p>We're setting up a small number of courses by hand this term. Tell us about yours, and we'll build the first one with you.</p>
      <form class="lp-form" novalidate style="margin-top:18px">
        <label>Your name<input name="name" required maxlength="100" autocomplete="name"></label>
        <label>School email<input name="email" type="email" required maxlength="200" autocomplete="email"></label>
        <label>School<input name="school" required maxlength="150" autocomplete="organization"></label>
        <label>Course<input name="course" required maxlength="100" placeholder="MATH 150"></label>
        <label class="full">Students, roughly<select name="size">${cloud.ACCESS_SIZES.map((s) => `<option>${esc(s)}</option>`).join('')}</select></label>
        <label class="trap" aria-hidden="true">Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label>
        <p class="full consent">We use these details only to contact you about Cramming. See our <a href="#/privacy">privacy policy</a>.</p>
        <p class="full error" data-error role="alert" hidden></p>
        <button type="submit" class="lp-btn big full">Send request</button>
      </form>
    </div>
  </div>
</dialog>`;

// Wires [data-request] buttons inside root to the sheet. Returns a cleanup function.
export function mountSheet(root) {
  root.insertAdjacentHTML('beforeend', SHEET);
  const dlg = root.querySelector('.lp-sheet');
  let opener = null;
  const close = () => {
    if (!dlg.open || dlg.classList.contains('closing')) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { dlg.close(); return; }
    dlg.classList.add('closing');
    setTimeout(() => { dlg.classList.remove('closing'); dlg.close(); }, 260);
  };
  dlg.addEventListener('close', () => opener?.focus());
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) close(); });
  const onOpen = (e) => {
    const b = e.target.closest('[data-request]');
    if (!b) return;
    opener = b;
    dlg.showModal();
    dlg.querySelector('input[name="name"]')?.focus();
  };
  root.addEventListener('click', onOpen);

  const form = dlg.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = form.querySelector('[data-error]');
    const v = Object.fromEntries(new FormData(form));
    const missing = ['name', 'email', 'school', 'course'].find((k) => !String(v[k] || '').trim());
    const problem = missing ? `Please fill in your ${{ name: 'name', email: 'school email', school: 'school', course: 'course' }[missing]}.`
      : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim()) ? 'Please check your email address.' : '';
    if (problem) {
      err.textContent = problem; err.hidden = false;
      form.querySelector(`[name="${missing || 'email'}"]`).focus();
      return;
    }
    err.hidden = true;
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      if (!v.website) await cloud.requestAccess(v); // the hidden field is filled only by bots: pretend it worked
      dlg.querySelector('[data-body]').innerHTML = `<div class="lp-done" role="status" tabindex="-1"><strong>Thank you, ${esc(v.name.trim().split(' ')[0])}.</strong><span>We'll email you within two school days to set up ${esc(v.course.trim())}.</span></div>`;
      dlg.querySelector('.lp-done').focus();
    } catch (ex) {
      console.error(ex);
      err.textContent = "Your request didn't send. Check your connection and try again."; err.hidden = false;
      btn.disabled = false; btn.textContent = 'Send request';
    }
  });
  return () => { root.removeEventListener('click', onOpen); if (dlg.open) dlg.close(); };
}

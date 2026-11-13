// Sign-in page shown before anything else when student sign-in is on.
import config from '../../config.js';
import * as cloud from '../cloud.js';
import { esc, icon } from '../ui.js';

const GOOGLE_G = `<svg viewBox="0 0 48 48" aria-hidden="true" width="20" height="20"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

export function render(main) {
  const school = config.schoolName || 'school';
  const draw = (busy = false) => {
    const err = cloud.lastError();
    main.innerHTML = `
      <section class="page narrow signin">
        <div class="signin-card">
          <svg class="brand-mark big" viewBox="0 0 28 28" aria-hidden="true"><circle cx="9" cy="9" r="5.5"/><circle cx="19" cy="9" r="5.5" class="filled"/><circle cx="9" cy="19" r="5.5"/><circle cx="19" cy="19" r="5.5"/></svg>
          <h1>${esc(config.siteName)}</h1>
          <p class="lead">Practice questions, timed practice tests and programming assignments. Sign in with your ${esc(school)} account to start.</p>
          ${err ? `<p class="signin-error" role="alert">${icon('x')} <span>${esc(err)}</span></p>` : ''}
          <button class="btn big signin-btn" data-signin ${busy ? 'disabled' : ''}>${GOOGLE_G}<span>${busy ? 'Opening sign-in…' : `Sign in with your ${esc(school)} account`}</span></button>
          <p class="muted small">Use your <strong>@${esc(cloud.domain)}</strong> email. You'll sign in through your school's usual login page.</p>
          <details class="signin-more">
            <summary>What is saved, and who can see it?</summary>
            <ul>
              <li>Your answers, scores, saved questions, notes and assignment code are saved to your account, so they follow you to any device.</li>
              <li>Your instructor can see your progress and your assignment code to help the class. Other students can't see anything of yours.</li>
              <li>Your name and email come from your school account. Your password is never shared with this site.</li>
            </ul>
          </details>
        </div>
      </section>`;
    main.querySelector('[data-signin]').addEventListener('click', async () => {
      draw(true);
      await cloud.signIn();
      if (!cloud.currentUser()) draw(false);
    });
  };
  draw();
  const onAuth = () => { if (!cloud.currentUser()) draw(false); };
  window.addEventListener('qp:auth', onAuth);
  return () => window.removeEventListener('qp:auth', onAuth);
}

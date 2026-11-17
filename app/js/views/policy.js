// Public policy pages: #/privacy, #/terms, #/ai, #/accessibility. Plain language, no database reads.
// DRAFTS until reviewed by a lawyer (see docs/DECISIONS.md); the banner says so on the page.
import config from '../../config.js';
import { ensureCss, header, footer, mountSheet } from './lp-shell.js';

const UPDATED = '17 November 2026';
const CONTACT = config.contactEmail || '';
const contact = () => (CONTACT ? `<a href="mailto:${CONTACT}">${CONTACT}</a>` : 'the contact address on this page once it is published');

const PAGES = {
  privacy: {
    title: 'Privacy policy',
    body: () => `
      <p>Cramming is a study and assessment platform used by schools. This page explains what we collect, why, who can see it, and the choices you have.</p>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Your school account:</strong> your name, school email and profile picture, from your school's sign-in. We never see your password.</li>
        <li><strong>Your work in a class:</strong> your answers, scores, flashcard and review history, notes, code you write, and when you signed in and started work.</li>
        <li><strong>Course material:</strong> what your professor uploads, such as notes, questions and assignments.</li>
        <li><strong>Access requests:</strong> the name, email, school, course and class size a professor sends us on the landing page.</li>
        <li><strong>On your device:</strong> your settings and a copy of your progress are kept in your browser's local storage, so the site works when your connection drops. We don't use advertising or tracking cookies.</li>
      </ul>
      <h2>Why we collect it</h2>
      <p>Only to run the course: to save your progress, plan what you study next, grade your work, and show your professor how the class is doing. We don't sell personal information, show ads, or use your work to train AI.</p>
      <h2>Who can see it</h2>
      <ul>
        <li>You can see your own work.</li>
        <li>Your professor and the TAs of your class can see your work and scores in that class, to teach and grade.</li>
        <li>Graded scores are shown to you only after your professor releases them.</li>
        <li>Other students can't see anything of yours.</li>
        <li>Cramming's administrators can see records when that's needed to run or fix the service.</li>
      </ul>
      <h2>Student records and your school</h2>
      <p>When a school uses Cramming, your work in a class is part of your education record, and we handle it on the school's behalf under the Family Educational Rights and Privacy Act (FERPA). Your school decides how long it's kept and can ask us to delete it.</p>
      <h2>AI and your data</h2>
      <p>Your answers and scores are never sent to an AI. When your professor builds a course with AI, only the course materials go to the AI service your professor chooses. When you use the AI tutor, your own AI account reads your professor's notes for open units; what you type there is covered by that AI provider's terms. See <a href="#/ai">How we use AI</a>.</p>
      <h2>Where it's stored</h2>
      <p>Records are stored in Google Firebase (Cloud Firestore). The site is served by GitHub Pages, and the AI connectors run on Cloudflare Workers.</p>
      <h2>Your choices</h2>
      <p>You can export your progress from Settings, and you can ask your professor or school to correct or delete your records. You can also contact us at ${contact()}.</p>
      <h2>Children</h2>
      <p>Cramming is for college students and high school students aged 13 or older. It isn't designed for children under 13.</p>
      <h2>Changes</h2>
      <p>If we change this policy, we'll update the date at the top and, for important changes, tell schools and professors before the change takes effect.</p>`,
  },
  terms: {
    title: 'Terms of use',
    body: () => `
      <p>These terms apply to everyone who uses Cramming: students, professors, teaching assistants and school administrators. By signing in, you agree to them.</p>
      <h2>Using Cramming</h2>
      <ul>
        <li>Use your own school account, and keep it to yourself.</li>
        <li>Use Cramming only for the classes you're on the roster for.</li>
        <li>Don't try to see other people's work, answer keys or hidden tests, or get around the controls on graded work.</li>
        <li>Don't upload anything you don't have the right to share, or anything harmful.</li>
      </ul>
      <h2>Academic integrity</h2>
      <p>Your school's academic integrity policy applies on Cramming. During a graded quiz or exam, work alone and follow your professor's rules, including the rules on AI tools. Cramming may record when you leave an exam page and show warnings, and your professor can see this.</p>
      <h2>Professors' content</h2>
      <p>Professors own the course materials they upload. They let Cramming store and show them to their students so the course can run. Professors are responsible for reviewing and approving what's published, including anything drafted by AI.</p>
      <h2>AI-drafted content</h2>
      <p>Some notes, questions and explanations are drafted by AI and approved by your professor. They can still contain mistakes. If something looks wrong, use <strong>Report a problem</strong> on the question, and check your professor's materials.</p>
      <h2>No guarantee of grades</h2>
      <p>Practice, plans and readiness estimates are study aids. They don't predict or guarantee any grade.</p>
      <h2>The service</h2>
      <p>Cramming is provided as it is, during early access, for free. We work to keep it available and your work safe, but we can't promise it will never be interrupted. We may change or stop features, and we'll give schools notice of big changes.</p>
      <h2>Ending access</h2>
      <p>Your school or professor can remove you from a class. We may suspend an account that breaks these terms.</p>
      <h2>Contact</h2>
      <p>Questions about these terms: ${contact()}.</p>`,
  },
  ai: {
    title: 'How we use AI',
    body: () => `
      <p>Cramming uses AI in two places. In both, a person stays in charge.</p>
      <h2>1. Building a course</h2>
      <p>A professor can connect their own AI (Claude, ChatGPT or Gemini) to draft notes, practice questions, quizzes and programming assignments from the materials they upload.</p>
      <ul>
        <li>The AI sees only the course materials, never student work or scores.</li>
        <li>Every answer key is checked a second time, and programming solutions are run against their tests.</li>
        <li>Nothing reaches students until the professor reviews and publishes it.</li>
        <li>AI can make mistakes. Professors are asked to review everything, and students can report a problem on any question.</li>
      </ul>
      <h2>2. The course tutor</h2>
      <p>Students can connect the AI they already use to their course. Through Cramming, it can read only the notes for units the professor has opened.</p>
      <ul>
        <li>It switches off while a quiz or exam is running.</li>
        <li>Professors can turn it off for their whole class.</li>
        <li>It's the student's own AI account, so the provider's terms and privacy policy apply to the chat.</li>
        <li>The tutor can be wrong. Students should check what it says against their notes and ask their professor when unsure.</li>
      </ul>
      <h2>What we never do</h2>
      <ul>
        <li>Grade students with AI.</li>
        <li>Send student answers, scores or personal details to an AI.</li>
        <li>Use anyone's work to train AI.</li>
      </ul>`,
  },
  accessibility: {
    title: 'Accessibility',
    body: () => `
      <p>Cramming should work for every student. We design and test against the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA.</p>
      <h2>What's built in</h2>
      <ul>
        <li>Everything works with a keyboard alone, and with screen readers.</li>
        <li>Text meets contrast requirements, and the text size can be changed in Settings.</li>
        <li>Light and dark mode.</li>
        <li>Extra time for accommodations, set per student by the professor and added to the exam timer.</li>
        <li>Motion can be paused, and it's turned off when your device asks for reduced motion.</li>
        <li>Pages work on phones, with touch targets at least 44 pixels in size.</li>
      </ul>
      <h2>What we're still improving</h2>
      <p>Not every screen has been through a full accessibility audit yet. We're auditing each one before our public launch, and we fix problems as soon as they're reported.</p>
      <h2>Tell us about a barrier</h2>
      <p>If something on Cramming is hard or impossible to use, tell your professor or contact us at ${contact()}. Say which page and what happened, and we'll respond and fix it.</p>`,
  },
};

export async function render(main, params = {}) {
  const page = PAGES[params.page];
  if (!page) { location.replace('#/'); return; }
  await ensureCss();
  document.body.classList.add('landing-mode');
  main.innerHTML = `<div class="lp">
    ${header(false)}
    <article class="wrap"><div class="lp-doc">
      <h1>${page.title}</h1>
      <p class="updated">Last updated ${UPDATED}</p>
      <p class="draft">This is a draft for review before Cramming's public launch.</p>
      ${page.body()}
    </div></article>
    ${footer()}
  </div>`;
  const off = mountSheet(main.querySelector('.lp'));
  document.title = `${page.title} · Cramming`;
  return () => { off(); document.body.classList.remove('landing-mode'); };
}

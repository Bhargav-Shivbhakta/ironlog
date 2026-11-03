// "Report a problem with this question": students tell their instructors about
// a wrong answer, a typo or an unclear question. Needs sign-in and a class roster.
import * as cloud from './cloud.js';
import { modal, toast, esc } from './ui.js';

const REASONS = [
  ['answer', 'The marked answer looks wrong'],
  ['unclear', 'The question is unclear or has a typo'],
  ['explanation', "The explanation doesn't help"],
  ['other', 'Something else'],
];
export const REASON_LABEL = Object.fromEntries(REASONS);

export const canReport = (examId) => cloud.canReport(examId);

export function openReport({ examId, qid, label, text }) {
  const body = document.createElement('form');
  body.className = 'report-form';
  body.innerHTML = `
    <p class="muted small">About <strong>${esc(label)}</strong>. Your instructors will see this with your name, so they can follow up.</p>
    <fieldset class="report-reasons"><legend class="sr-only">What's wrong?</legend>
      ${REASONS.map(([k, l], i) => `<label class="check"><input type="radio" name="reason" value="${k}" ${i === 0 ? 'checked' : ''}><span>${l}</span></label>`).join('')}
    </fieldset>
    <label class="field"><span>Details <span class="muted">(optional)</span></span>
      <textarea name="note" rows="3" maxlength="600" placeholder="For example: I think the answer should be B because..."></textarea></label>`;
  modal({
    title: 'Report a problem',
    body,
    actions: [
      { label: 'Cancel' },
      { label: 'Send report', kind: 'primary', onClick: (close) => {
        const reason = body.querySelector('input[name=reason]:checked')?.value || 'other';
        const note = body.querySelector('textarea').value.trim();
        cloud.reportQuestion({ examId, qid, text: String(text || '').slice(0, 300), reason, note })
          .then(() => toast('Thanks! Your instructors will see your report.', 'good'))
          .catch((e) => toast("Couldn't send the report: " + (e?.message || e), 'bad'));
        close();
        return true;
      } },
    ],
  });
}

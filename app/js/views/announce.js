// Announcement banners on a class page (students can dismiss them on their device).
import * as cloud from '../cloud.js';
import * as store from '../store.js';
import { esc, icon } from '../ui.js';
import { fmtDate } from '../engine.js';

const KEY = 'dismissed-announcements';
export async function announcementBanners(classId, { staff = false } = {}) {
  let list = [];
  try { list = await cloud.listAnnouncements(classId); } catch { return ''; }
  const dismissed = new Set(store.get(KEY, []));
  const show = list.filter((a) => !a.expired && (staff || !dismissed.has(a.id))).slice(0, 3);
  if (!show.length) return '';
  return `<div class="announcements" aria-label="Announcements">${show.map((a) => `
    <div class="announce" role="status" data-ann="${esc(a.id)}">
      <span class="announce-icon" aria-hidden="true">${icon('megaphone')}</span>
      <div class="announce-text"><p>${esc(a.text)}</p><span class="muted small">${esc(a.author || '')} · ${esc(fmtDate(a.createdAt))}${a.until ? ` · until ${esc(a.until)}` : ''}</span></div>
      ${staff ? '' : `<button class="icon-btn small" data-dismiss-ann="${esc(a.id)}" aria-label="Dismiss announcement">${icon('x')}</button>`}
    </div>`).join('')}</div>`;
}
export function bindAnnouncements(root) {
  root.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-dismiss-ann]');
    if (!b) return;
    const ids = new Set(store.get(KEY, []));
    ids.add(b.dataset.dismissAnn);
    store.set(KEY, [...ids].slice(-200));
    b.closest('.announce')?.remove();
  });
}

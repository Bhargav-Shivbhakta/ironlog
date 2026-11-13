import { esc } from './render.js';
export { esc };

// Small inline icons (stroke = currentColor)
const P = {
  flag: '<path d="M5 21V4m0 0h11l-2 4 2 4H5"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 18h.01M12 18h4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  play: '<path d="M8 5.5v13l10-6.5z"/>',
  left: '<path d="M14.5 6l-6 6 6 6"/>',
  right: '<path d="M9.5 6l6 6-6 6"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z"/>',
  keyboard: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  home: '<path d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-6h-6v6H5a1 1 0 01-1-1z"/>',
  strike: '<path d="M5 12h14M8 7c0-1.5 1.8-2.5 4-2.5s4 1 4 2.5M8 17c0 1.5 1.8 2.5 4 2.5s4-1 4-2.5"/>',
  note: '<path d="M5 4h10l4 4v12H5z"/><path d="M15 4v4h4M8 12h8M8 16h5"/>',
  upload: '<path d="M12 16V4m0 0l-4.5 4.5M12 4l4.5 4.5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/>',
  download: '<path d="M12 4v12m0 0l-4.5-4.5M12 16l4.5-4.5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  shuffle: '<path d="M4 7h3.5c4 0 5 10 9 10H20m0 0l-2.5-2.5M20 17l-2.5 2.5M4 17h3.5c1.4 0 2.4-1.2 3.3-2.8M20 7h-3.5c-1.4 0-2.4 1.2-3.3 2.8M20 7l-2.5-2.5M20 7l-2.5 2.5"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.6 3.2-5.5 6.5-5.5s6 1.9 6.5 5.5M16 4.8a3.3 3.3 0 010 6.4M18.5 14.8c1.8.8 2.8 2.6 3 5.2"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5zM4 20.5A2.5 2.5 0 006.5 23H20v-5"/>',
  code: '<path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5M13.5 4l-3 16"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
  flame: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.3 2.4-5.4 3.9-7.8.4 1.7 1.3 2.8 2.6 3.4.3-2.9 1.8-5.4 3.6-7.4.5 3.5 4.9 6.2 4.9 11.6 0 3.7-3.1 6.4-8.5 6.4z"/>',
  sparkle: '<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/>',
  megaphone: '<path d="M3 10.5v3a1.5 1.5 0 001.5 1.5H7l6 4.5v-15L7 9H4.5A1.5 1.5 0 003 10.5zM17 9a4.5 4.5 0 010 6"/>',
  report: '<path d="M5 21V4m0 0h12l-2.5 4L17 12H5"/><path d="M12 15.5v.01"/>',
};
export function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

// ---------- toast ----------
let toastTimer;
export function toast(msg, kind = '') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.className = `toast show ${kind}`;
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ---------- modal ----------
let openModalEl = null;
export function modal({ title, body, actions = [], wide = false, onClose }) {
  closeModal();
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-head"><h2 id="modal-title">${esc(title)}</h2>
        <button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="modal-body"></div>
      ${actions.length ? `<div class="modal-foot">${actions.map((a, i) => `<button class="btn ${a.kind || ''}" data-act="${i}">${esc(a.label)}</button>`).join('')}</div>` : ''}
    </div>`;
  const bodyEl = back.querySelector('.modal-body');
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  const prevFocus = document.activeElement;
  const close = () => {
    back.remove();
    openModalEl = null;
    document.removeEventListener('keydown', onKey, true);
    onClose?.();
    prevFocus?.focus?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'Tab') {
      const f = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', back).filter((x) => !x.disabled);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  };
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  back.querySelector('[data-close]').onclick = close;
  back.querySelectorAll('[data-act]').forEach((b) => {
    b.onclick = () => { const a = actions[Number(b.dataset.act)]; const keep = a.onClick?.(close); if (keep !== true) close(); };
  });
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(back);
  openModalEl = { el: back, close };
  (back.querySelector('.modal-foot .btn.primary') || back.querySelector('[data-close]')).focus();
  return { el: back, close };
}
export function closeModal() { openModalEl?.close(); }
export const modalOpen = () => !!openModalEl;

export function confirmDialog({ title, body, confirm = 'Confirm', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    modal({
      title, body,
      actions: [
        { label: cancel, onClick: () => { done = true; resolve(false); } },
        { label: confirm, kind: danger ? 'danger' : 'primary', onClick: () => { done = true; resolve(true); } },
      ],
      onClose: () => { if (!done) resolve(false); },
    });
  });
}

// ---------- small visual pieces ----------
export function ring(pct, { size = 120, stroke = 10, label = '', sub = '', tone = '' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, pct ?? 0));
  return `<div class="ring ${tone}" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-track" stroke-width="${stroke}" fill="none"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fill" stroke-width="${stroke}" fill="none"
        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v / 100)}" stroke-linecap="round" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>
    <div class="ring-text"><strong>${esc(label)}</strong>${sub ? `<span>${esc(sub)}</span>` : ''}</div>
  </div>`;
}

export function meter(frac, { tone = '' } = {}) {
  const v = Math.max(0, Math.min(1, frac || 0));
  return `<span class="meter ${tone}"><span style="width:${(v * 100).toFixed(1)}%"></span></span>`;
}

export function toneFor(frac) {
  if (frac == null) return 'muted';
  return frac >= 0.8 ? 'good' : frac >= 0.55 ? 'ok' : 'bad';
}

export function plural(n, word, pluralWord) {
  return `${n} ${n === 1 ? word : pluralWord || word + 's'}`;
}

// Simple SVG line chart: points = [{x: label, y: 0..100, title}]
export function lineChart(points, { height = 180, target = null } = {}) {
  if (points.length < 2) return '';
  const W = 640, H = height, padL = 34, padR = 12, padT = 12, padB = 26;
  const xs = (i) => padL + (i * (W - padL - padR)) / (points.length - 1);
  const ys = (v) => padT + (1 - v / 100) * (H - padT - padB);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(p.y).toFixed(1)}`).join(' ');
  const grid = [0, 25, 50, 75, 100].map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${ys(v)}" y2="${ys(v)}" class="grid"/><text x="${padL - 6}" y="${ys(v) + 4}" text-anchor="end">${v}</text>`).join('');
  const tgt = target != null ? `<line x1="${padL}" x2="${W - padR}" y1="${ys(target)}" y2="${ys(target)}" class="target"/><text x="${W - padR}" y="${ys(target) - 5}" text-anchor="end" class="target-label">Target ${target}%</text>` : '';
  const step = Math.max(1, Math.ceil(points.length / 8));
  const xl = points.map((p, i) => (i % step === 0 || i === points.length - 1) ? `<text x="${xs(i)}" y="${H - 6}" text-anchor="middle">${esc(p.x)}</text>` : '').join('');
  const dots = points.map((p, i) => `<circle cx="${xs(i)}" cy="${ys(p.y)}" r="4" class="dot"><title>${esc(p.title || `${p.y}%`)}</title></circle>`).join('');
  return `<svg class="line-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Score history chart">${grid}${tgt}<path d="${path}" class="line"/>${dots}${xl}</svg>`;
}

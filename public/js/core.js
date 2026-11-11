import { ICONS } from './icons.js';

export const state = { user: null, unread: 0, meta: null };

/* ---------- safe templating: every interpolated value is escaped unless wrapped in raw() ---------- */
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function render(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  if (v === null || v === undefined || v === false) return '';
  return esc(v);
}
export function h(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new Raw(out);
}
export const icon = (name, cls = '') => raw(`<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`);

/* ---------- api ---------- */
export async function api(path, { method = 'GET', body, form } = {}) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (form) opts.body = form;
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  let r;
  try { r = await fetch('/api' + path, opts); } catch { throw Object.assign(new Error('Cannot reach the server. Check your internet connection and try again.'), { status: 0 }); }
  let data = null;
  try { data = await r.json(); } catch { /* not json */ }
  if (!r.ok) {
    const e = new Error((data && data.error) || 'Something went wrong.');
    e.status = r.status; e.data = data; e.fields = (data && data.fields) || {};
    if (r.status === 401 && state.user) { state.user = null; location.hash = '#/login'; }
    throw e;
  }
  return data;
}

/* ---------- dates ---------- */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function fmtMonth(d) { if (!d) return ''; const [y, m, day] = String(d).split('-'); return m ? (day ? `${Number(day)} ${MONTHS[m - 1].slice(0, 3)} ${y}` : `${MONTHS[m - 1]} ${y}`) : y; }
export function fmtDate(iso) { if (!iso) return ''; const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`; }
export function fmtDateTime(iso) { if (!iso) return ''; const d = new Date(iso); return `${fmtDate(iso)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
export function ago(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`; return fmtDate(iso);
}
export const daysLeft = (iso) => Math.ceil((new Date(iso) - Date.now()) / 86400000);
export const greeting = () => { const hr = new Date().getHours(); return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'; };
export const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
export const firstName = (n) => String(n).replace(/^(Dr\.?|Prof\.?)\s+/i, '').split(' ')[0];
export const initials = (n) => String(n || '?').replace(/^(Dr\.?|Prof\.?|Mr\.?|Ms\.?|Mrs\.?)\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

/* ---------- small components ---------- */
const STATUS = {
  verified: ['Verified', 'b-verified', 'check'], pending: ['Pending', 'b-pending', 'clock'], rejected: ['Rejected', 'b-rejected', 'x'],
  clarification: ['Needs info', 'b-clarification', 'circle-help'], flagged: ['Under review', 'b-flagged', 'flag'],
  requested: ['Requested', 'b-pending', 'clock'], drafting: ['In progress', 'b-clarification', 'pencil'], approved: ['Approved', 'b-verified', 'check'],
  declined: ['Declined', 'b-rejected', 'x'], revision_requested: ['Revision asked', 'b-flagged', 'refresh-cw'],
  active: ['Active', 'b-verified', 'check'], expired: ['Expired', 'b-neutral', 'clock'], revoked: ['Cancelled', 'b-rejected', 'ban'],
  open: ['Open', 'b-pending', 'clock'], resolved: ['Resolved', 'b-verified', 'check'], restricted: ['Restricted', 'b-rejected', 'ban'], disabled: ['Disabled', 'b-neutral', 'ban'],
};
export const badge = (s) => { const [t, c, i] = STATUS[s] || [s, 'b-neutral', 'clock']; return h`<span class="badge ${c}">${icon(i)}${t}</span>`; };
export const tierTag = (t) => (t ? h`<span class="tier ${t}">${t[0].toUpperCase() + t.slice(1)}</span>` : '');
export const avatar = (name, sq = false) => h`<div class="avatar ${sq ? 'sq' : ''}" aria-hidden="true">${initials(name)}</div>`;
export const tile = (name, color = 'red', sm = false) => h`<div class="tile t-${color} ${sm ? 'sm' : ''}">${icon(name)}</div>`;
export const empty = (ic, title, text) => h`<div class="empty">${tile(ic)}<div class="b" style="color:var(--ink)">${title}</div><p>${text || ''}</p></div>`;
export const loading = () => h`<div class="loading">Loading…</div>`;
export const fieldErr = (fields, k) => (fields && fields[k] ? h`<div class="errmsg">${icon('triangle-alert')}${fields[k]}</div>` : '');
export const errCls = (fields, k) => (fields && fields[k] ? 'err' : '');

export function kindIcon(item) {
  const c = item.categories || [];
  if (item.kind === 'project') return c.includes('Certification') ? ['file-text', 'blue'] : ['folder', 'purple'];
  if (item.kind === 'activity') return c.includes('Leadership') ? ['users', 'red'] : ['users', 'blue'];
  return c.includes("Dean's List") ? ['book-open', 'red'] : ['award', 'amber'];
}
export function itemSubtitle(i) {
  const when = i.ongoing ? `${fmtMonth(i.date).replace(/^\w+ /, '')}–Present` : fmtMonth(i.date);
  const lead = i.kind === 'activity' ? i.role_text : i.kind === 'project' ? i.role_text : i.issuer;
  const org = i.kind === 'achievement' ? '' : '';
  return [lead || i.issuer, org, when].filter(Boolean).join(' · ');
}

/* ---------- toast & modal ---------- */
export function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', type === 'err' ? 'alert' : 'status');
  el.innerHTML = `${type === 'ok' ? icon('circle-check').s : icon('triangle-alert').s}<span>${esc(msg)}</span>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), type === 'err' ? 7000 : 4200);
}
let lastFocus = null;
export function openModal(content, { narrow = false } = {}) {
  closeModal();
  lastFocus = document.activeElement;
  const o = document.createElement('div');
  o.className = 'overlay'; o.id = 'modal';
  o.innerHTML = `<div class="modal ${narrow ? 'narrow' : ''}" role="dialog" aria-modal="true">${render(content)}</div>`;
  document.body.appendChild(o);
  document.body.style.overflow = 'hidden';
  const f = o.querySelector('input:not([type=hidden]),select,textarea,button');
  if (f) f.focus();
  return o;
}
export function closeModal() {
  const o = document.getElementById('modal');
  if (o) { o.remove(); document.body.style.overflow = ''; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
}
export function confirmBox(title, text, okLabel = 'Confirm', danger = false) {
  return new Promise((resolve) => {
    openModal(h`<h2>${title}</h2><p class="sub">${text}</p><div class="foot"><button class="btn" data-act="confirm-no">Cancel</button><button class="btn ${danger ? 'red' : 'dark-btn'}" data-act="confirm-yes">${okLabel}</button></div>`, { narrow: true });
    const m = document.getElementById('modal');
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'confirm-yes') { closeModal(); resolve(true); } else if (b.dataset.act === 'confirm-no') { closeModal(); resolve(false); }
    });
  });
}
export function promptBox(title, label, { okLabel = 'Send', placeholder = '', sub = '' } = {}) {
  return new Promise((resolve) => {
    openModal(h`<h2>${title}</h2><p class="sub">${sub}</p><div class="field"><label class="l" for="pb">${label}</label><textarea class="textarea" id="pb" placeholder="${placeholder}"></textarea><div class="errmsg" id="pberr" hidden></div></div>
      <div class="foot"><button class="btn" data-act="p-no">Cancel</button><button class="btn red" data-act="p-yes">${okLabel}</button></div>`, { narrow: true });
    const m = document.getElementById('modal');
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'p-no') { closeModal(); resolve(null); }
      if (b.dataset.act === 'p-yes') {
        const v = m.querySelector('#pb').value.trim();
        if (v.length < 5) { const er = m.querySelector('#pberr'); er.hidden = false; er.textContent = 'Please write at least a few words.'; return; }
        closeModal(); resolve(v);
      }
    });
  });
}

export const download = (name, text, type = 'text/plain') => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
};
export const copyText = async (text) => {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* ignore */ } t.remove(); return ok;
  }
};
/* a button that shows a spinner-like disabled state while an async job runs */
export async function busy(btn, fn) {
  if (btn) { btn.disabled = true; btn.dataset.t = btn.textContent; }
  try { return await fn(); } finally { if (btn) { btn.disabled = false; } }
}

export const refresh = () => window.dispatchEvent(new Event('app:refresh'));
/* highlight server-side field errors inside a form (each input wrapper carries data-field="name") */
export function showErrors(root, fields) {
  root.querySelectorAll('.field.err').forEach((f) => { f.classList.remove('err'); const m = f.querySelector(':scope > .errmsg'); if (m) m.remove(); });
  let first = null;
  for (const [k, msg] of Object.entries(fields || {})) {
    const w = root.querySelector(`[data-field="${k}"]`);
    if (!w) continue;
    w.classList.add('err');
    const d = document.createElement('div'); d.className = 'errmsg'; d.textContent = msg; w.appendChild(d);
    first = first || w;
  }
  if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  return !!first;
}
export function formError(root, msg) {
  let e = root.querySelector('.formerr');
  if (!e) { e = document.createElement('div'); e.className = 'callout red formerr'; e.setAttribute('role', 'alert'); root.prepend(e); }
  e.textContent = msg || ''; e.hidden = !msg;
  if (msg) e.scrollIntoView({ block: 'nearest' });
}

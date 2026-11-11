import { h, raw, api, state, icon, toast, openModal, closeModal, confirmBox, promptBox, showErrors, formError, refresh, copyText, download, esc,
  fmtDateTime, ago, avatar, loading, initials, badge, empty } from './core.js';
import * as R from './records.js';
import * as S from './views-student.js';
import * as T from './views-staff.js';
import * as A from './views-admin.js';
import * as P from './views-public.js';
import * as O from './views-opportunities.js';
import * as X from './views-extra.js';

const $ = (s, r = document) => r.querySelector(s);
const PUBLIC = ['/login', '/verify', '/register', '/forgot', '/reset', '/mailbox'];
let renderId = 0;
let pendingChallenge = null;

/* ---------- navigation per role ---------- */
const NAV = {
  student: [
    ['WORKSPACE', [['/', 'house', 'Dashboard'], ['/profile', 'user', 'My profile'], ['/results', 'book-open', 'Academic results'], ['/achievements', 'award', 'Achievements'], ['/activities', 'users', 'Activities & clubs'], ['/projects', 'folder', 'Projects & certificates'], ['/opportunities', 'briefcase', 'Opportunities'], ['/applications', 'send', 'My applications'], ['/library', 'book-open', 'Resource library']]],
    ['SHARE', [['/letters', 'file-text', 'Recommendation letters'], ['/messages', 'message-square', 'Messages'], ['/sharing', 'link', 'Sharing & privacy'], ['/cv', 'graduation-cap', 'My CV']]],
    ['ACCOUNT', [['/premium', 'star', 'Premium'], ['/help', 'life-buoy', 'Help & requests'], ['/security', 'lock', 'Security'], ['/privacy', 'shield-check', 'Privacy notice']]],
  ],
  lecturer: [
    ['WORKSPACE', [['/', 'house', 'Dashboard'], ['/students', 'search', 'Search students'], ['/recent', 'users', 'Recent profiles'], ['/letters', 'file-text', 'Recommendation letters'], ['/queue', 'check', 'Verification queue', true], ['/opportunities', 'briefcase', 'Opportunities'], ['/library', 'book-open', 'Resource library'], ['/messages', 'message-square', 'Messages']]],
    ['ACCOUNT', [['/security', 'lock', 'Security'], ['/privacy', 'shield-check', 'Privacy notice']]],
  ],
  verifier: [
    ['WORKSPACE', [['/', 'house', 'Dashboard'], ['/queue', 'check', 'Verification queue', true], ['/opportunities', 'briefcase', 'Opportunities'], ['/library', 'book-open', 'Resource library'], ['/messages', 'message-square', 'Messages']]],
    ['ACCOUNT', [['/security', 'lock', 'Security'], ['/privacy', 'shield-check', 'Privacy notice']]],
  ],
  admin: [
    ['WORKSPACE', [['/', 'house', 'Dashboard'], ['/records', 'users', 'Student records'], ['/queue', 'check', 'Verification queue', true], ['/directory', 'search', 'Directory & access'], ['/summaries', 'file-text', 'Verified summaries'], ['/library', 'book-open', 'Resource library'], ['/opportunities', 'briefcase', 'Opportunities']]],
    ['INSIGHT', [['/reports', 'chart-column', 'Reports'], ['/subscriptions', 'star', 'Premium subscriptions'], ['/support', 'inbox', 'Support inbox'], ['/audit', 'history', 'Audit log'], ['/import', 'upload', 'Import results']]],
    ['ACCOUNT', [['/security', 'lock', 'Security'], ['/privacy', 'shield-check', 'Privacy notice']]],
  ],
};
const ROLE_LABEL = { student: 'Student', lecturer: 'Lecturer', verifier: 'Verifier', admin: 'Administrator' };

/* ---------- routes ---------- */
function resolve(path) {
  const role = state.user.role;
  const seg = path.split('/').filter(Boolean);
  const id = seg[1];
  const is = (...r) => r.includes(role);
  const key = '/' + seg[0];
  if (path === '/') return { title: 'Dashboard', fn: () => (role === 'student' ? S.dashboard() : role === 'admin' ? A.dashboard() : T.dashboard()) };
  if (path === '/security') return { title: 'Security', fn: () => S.security() };
  if (path === '/opportunities') return { title: 'Opportunities', fn: O.opportunities };
  if (path === '/privacy') return { title: 'Privacy notice', fn: P.privacyCard };
  if (path === '/library') return { title: 'Resource library', fn: X.library };
  if (path === '/messages' && is('student', 'lecturer', 'verifier')) return { title: 'Messages', fn: X.messages };
  if (key === '/messages' && id && is('student', 'lecturer', 'verifier')) return { title: 'Conversation', fn: () => X.thread(id) };
  if (key === '/opportunities' && id && seg[2] === 'applicants' && is('lecturer', 'verifier', 'admin')) return { title: 'Applicants', fn: () => X.applicants(id) };
  if (path === '/premium' && is('student')) return { title: 'Premium', fn: X.premium };
  if (path === '/applications' && is('student')) return { title: 'My applications', fn: X.myApplications };
  if (path === '/subscriptions' && is('admin')) return { title: 'Premium subscriptions', fn: X.subscriptions };
  if (is('student')) {
    if (path === '/profile') return { title: 'My profile', fn: S.profile };
    if (path === '/results') return { title: 'Academic results', fn: S.results };
    if (path === '/achievements') return { title: 'Achievements', fn: () => R.recordsPage('achievement') };
    if (path === '/activities') return { title: 'Activities & clubs', fn: () => R.recordsPage('activity') };
    if (path === '/projects') return { title: 'Projects & certificates', fn: () => R.recordsPage('project') };
    if (path === '/letters') return { title: 'Letters', fn: S.letters };
    if (key === '/letters' && id) return { title: 'Letter', fn: () => S.letterDetail(id) };
    if (path === '/sharing') return { title: 'Sharing & privacy', fn: S.sharing };
    if (path === '/cv') return { title: 'My CV', fn: S.cv };
    if (path === '/help') return { title: 'Help & requests', fn: S.help };
  }
  if (is('lecturer', 'verifier')) {
    if (path === '/queue') return { title: 'Verification queue', fn: T.queue };
  }
  if (is('lecturer')) {
    if (path === '/students') return { title: 'Search students', fn: T.students };
    if (seg[0] === 'students' && id && seg[2] === 'summary') return { title: 'Recommendation summary', fn: () => T.lecturerSummary(id) };
    if (seg[0] === 'students' && id) return { title: 'Student profile', fn: () => T.studentView(id) };
    if (path === '/recent') return { title: 'Recent profiles', fn: T.recent };
    if (path === '/letters') return { title: 'Letter requests', fn: T.lecturerLetters };
    if (key === '/letters' && id) return { title: 'Letter', fn: () => T.lecturerLetterDetail(id) };
  }
  if (is('admin')) {
    if (path === '/queue') return { title: 'Verification queue', fn: T.queue };
    if (path === '/records') return { title: 'Student records', fn: A.records };
    if (seg[0] === 'records' && id) return { title: 'Student record', fn: () => A.recordDetail(id) };
    if (path === '/directory') return { title: 'Directory & access', fn: A.directory };
    if (path === '/summaries') return { title: 'Verified summaries', fn: A.summaries };
    if (seg[0] === 'summaries' && id) return { title: 'Verified summary', fn: () => A.summaryFor(id) };
    if (path === '/reports') return { title: 'Reports', fn: A.reports };
    if (path === '/support') return { title: 'Support inbox', fn: A.support };
    if (path === '/audit') return { title: 'Audit log', fn: A.audit };
    if (path === '/import') return { title: 'Import results', fn: async () => A.importPage() };
  }
  return null;
}

function parseHash() {
  const raw0 = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw0.split('?');
  return { path: path.replace(/\/$/, '') || '/', query: Object.fromEntries(new URLSearchParams(qs || '')) };
}
const mount = (el, content) => { el.innerHTML = content && content.s !== undefined ? content.s : String(content); };

/* ---------- shell ---------- */
function shellHtml() {
  const u = state.user;
  return h`<a href="#view" class="sr" style="position:absolute;left:8px;top:8px">Skip to content</a>
  <div class="shell" id="shell"><aside class="side" id="side" aria-label="Main navigation">
    <div class="brand"><img src="/assets/logo.png" alt="Africa University"><div class="t">AU<br>StudentSphere<small>VERIFIED RECORD</small></div></div>
    <div class="viewing"><small>VIEWING AS</small><b>${ROLE_LABEL[u.role]}${u.premium ? ' · Premium' : ''}</b></div>
    <nav>${NAV[u.role].map(([label, items]) => h`<div class="navlabel">${label}</div><div class="nav">${items.map(([href, ic, text, badge]) => h`<a href="#${href}" data-href="${href}">${icon(ic)}<span>${text}</span>${badge ? h`<span class="badge" id="qbadge" hidden></span>` : ''}</a>`)}</div>`)}</nav>
    <div class="me"><div class="row">${avatar(u.name)}<div><b>${u.name}</b><small>${u.title && u.role !== 'student' ? u.title : ROLE_LABEL[u.role]}</small></div></div>
      <button class="signout" data-act="signout">${icon('log-out')}Sign out</button></div></aside>
  <div class="main"><header class="top"><button class="iconbtn menu" data-act="nav-toggle" aria-label="Open menu">${icon('menu')}</button>
    <div style="position:relative"><button class="iconbtn" data-act="bell" aria-label="Notifications" id="bellbtn">${icon('bell')}<span class="dot" id="belldot" hidden></span></button><div class="pop" id="pop" hidden></div></div>
    <span class="chip-user">${u.name}</span></header><main class="content" id="view" tabindex="-1"></main></div></div>`;
}

async function updateChrome() {
  document.querySelectorAll('.nav a').forEach((a) => {
    const { path } = parseHash();
    const href = a.dataset.href;
    a.classList.toggle('on', href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));
    if (a.classList.contains('on')) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('#side') && $('#side').classList.remove('open');
  try {
    const me = await api('/me');
    state.user = me.user; state.unread = me.unread;
    const vb = $('.viewing b'); if (vb) vb.textContent = ROLE_LABEL[me.user.role] + (me.user.premium ? ' · Premium' : '');
    const dot = $('#belldot'); if (dot) dot.hidden = !me.unread;
    if (['lecturer', 'verifier', 'admin'].includes(me.user.role)) {
      const q = await api('/review/queue');
      const b = $('#qbadge'); if (b) { b.hidden = !q.length; b.textContent = q.length; }
    }
  } catch { /* handled elsewhere */ }
}

async function render() {
  const my = ++renderId;
  const { path, query } = parseHash();
  const root = $('#app');
  document.title = 'AU StudentSphere · Africa University';

  /* public, no login needed */
  if (path.startsWith('/shared/')) { mount(root, loading()); const v = await P.shared(path.split('/')[2]); if (my === renderId) mount(root, v); return; }
  if (path === '/review') { mount(root, loading()); const v = await P.reviewLink(query.token || ''); if (my === renderId) mount(root, v); return; }
  if (path === '/mailbox') { const v = await P.mailbox(); if (my === renderId) mount(root, v); return; }
  if (path === '/reset') { mount(root, P.reset(query.token || '')); return; }
  if (path === '/forgot') { mount(root, P.forgot()); return; }
  if (path === '/register') { mount(root, P.register()); return; }
  if (path === '/privacy' && !state.user) { mount(root, P.privacyPage()); return; }

  if (!state.user) {
    try { const me = await api('/me'); state.user = me.user; state.unread = me.unread; } catch { state.user = null; }
  }
  if (!state.user) {
    if (path === '/verify' && pendingChallenge) mount(root, P.twoStep(pendingChallenge)); else { if (path !== '/login') { location.hash = '#/login'; return; } mount(root, P.login()); }
    return;
  }
  if (path === '/login' || path === '/verify') { location.hash = '#/'; return; }
  if (!state.user.privacy_accepted) { mount(root, P.consent(state.user)); return; }

  if (!$('#shell') || $('#shell').dataset.uid !== String(state.user.id)) { mount(root, shellHtml()); $('#shell').dataset.uid = state.user.id; }
  const view = $('#view');
  const r = resolve(path);
  if (!r) { mount(view, h`<div class="card">${empty('circle-help', 'Page not found', 'That page does not exist, or is not available for your role.')}<div style="text-align:center"><a class="btn" href="#/" style="text-decoration:none">Go to dashboard</a></div></div>`); updateChrome(); return; }
  const focusKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.input : null;
  const focusVal = document.activeElement && document.activeElement.value;
  const scroll = window.scrollY;
  if (!view.dataset.path || view.dataset.path !== path) mount(view, loading());
  try {
    const out = await r.fn();
    if (my !== renderId) return;
    view.dataset.path = path;
    mount(view, out);
    document.title = `${r.title} · AU StudentSphere`;
    if (focusKey) { const el = $(`[data-input="${focusKey}"]`); if (el && el.tagName === 'INPUT') { el.focus(); el.setSelectionRange && el.setSelectionRange(el.value.length, el.value.length); } }
    else if (view.dataset.fresh !== path) { window.scrollTo(0, 0); view.focus({ preventScroll: true }); }
    view.dataset.fresh = path;
    if (focusKey) window.scrollTo(0, scroll);
  } catch (e) {
    if (my !== renderId) return;
    mount(view, h`<div class="card">${empty('triangle-alert', 'Could not load this page', e.message)}<div style="text-align:center"><button class="btn" data-act="retry">Try again</button></div></div>`);
  }
  updateChrome();
}

/* ---------- notifications ---------- */
async function toggleBell() {
  const pop = $('#pop');
  if (!pop.hidden) { pop.hidden = true; return; }
  pop.hidden = false;
  pop.innerHTML = '<div class="n muted">Loading…</div>';
  const list = await api('/notifications');
  pop.innerHTML = h`<div class="h"><span>Notifications</span><button class="link" data-act="read-all">Mark all read</button></div>${list.length ? list.map((n) => (n.link ? h`<a href="#${n.link}" class="${n.read ? '' : 'unread'}">${n.text}<small>${ago(n.at)}</small></a>` : h`<div class="n ${n.read ? '' : 'unread'}">${n.text}<small>${ago(n.at)}</small></div>`)) : h`<div class="n muted">You are all caught up.</div>`}`.s;
}

/* ---------- actions ---------- */
const actions = {
  ...R.recordActions,
  'opp-new': () => O.openPostForm(),
  'opp-filter': (el) => { O.setKind(el.dataset.kind || ''); refresh(); },
  async 'opp-remove'(el) {
    if (!(await confirmBox('Remove this opportunity?', `“${el.dataset.title}” will disappear from the board for everyone.`, 'Remove', true))) return;
    await api(`/opportunities/${el.dataset.id}`, { method: 'DELETE' });
    toast('Opportunity removed.'); refresh();
  },
  'opp-apply': (el) => X.openApplyForm(el.dataset.id, el.dataset.title),
  'res-new': () => X.openResourceForm(),
  'res-filter': (el) => { X.libState.category = el.dataset.cat || ''; refresh(); },
  'res-open': (el) => { const r = X.findResource(el.dataset.id); if (r) X.openResource(r); },
  async 'res-remove'(el) {
    if (!(await confirmBox('Remove this resource?', `“${el.dataset.title}” will disappear for everyone.`, 'Remove', true))) return;
    await api(`/resources/${el.dataset.id}`, { method: 'DELETE' }); toast('Resource removed.'); refresh();
  },
  'msg-new': () => X.openMessageForm(),
  async 'app-withdraw'(el) {
    if (!(await confirmBox('Withdraw application?', `Your application for “${el.dataset.title}” will be removed.`, 'Withdraw', true))) return;
    await api(`/applications/${el.dataset.id}`, { method: 'DELETE' }); toast('Application withdrawn.'); refresh();
  },
  async 'premium-subscribe'() { const r = await api('/premium/subscribe', { method: 'POST', body: {} }); toast(r.message); refresh(); updateChrome(); },
  async 'premium-cancel'() {
    if (!(await confirmBox('Cancel Premium renewal?', 'You keep Premium until the end of the period you already paid for.', 'Cancel renewal', true))) return;
    await api('/premium/cancel', { method: 'POST', body: {} }); toast('Renewal cancelled.'); refresh();
  },
  async 'pay-confirm'(el) { await api(`/admin/payments/${el.dataset.id}/confirm`, { method: 'POST', body: {} }); toast('Payment confirmed. Premium started.'); refresh(); },
  async 'pay-reject'(el) { await api(`/admin/payments/${el.dataset.id}/reject`, { method: 'POST', body: {} }); toast('Payment rejected.'); refresh(); },
  'close-modal': () => closeModal(),
  print: () => window.print(),
  retry: () => render(),
  'nav-toggle': () => $('#side').classList.toggle('open'),
  bell: toggleBell,
  'read-all': async () => { await api('/notifications/read', { method: 'POST' }); $('#pop').hidden = true; $('#belldot').hidden = true; },
  signout: async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); state.user = null; location.hash = '#/login'; render(); },
  resend: async (el) => { try { await api('/auth/resend', { method: 'POST', body: { challenge: el.dataset.challenge } }); toast('A new code was sent.'); } catch (e) { toast(e.message, 'err'); } },
  'edit-contact': () => {
    const u = state.user;
    openModal(h`<h2>Contact details</h2><p class="sub">Your name, programme and results are locked. You can update how we reach you.</p><form data-form="contact" novalidate>
      <div class="field" data-field="phone"><label class="l" for="c1">Phone</label><input class="input" id="c1" name="phone" value="${u.phone || ''}"></div>
      <div class="field" data-field="personal_email"><label class="l" for="c2">Backup personal email</label><input class="input" type="email" id="c2" name="personal_email" value="${u.personal_email || ''}"><div class="hint">Keeps your access after graduation if your school email expires.</div></div>
      <div class="field" data-field="about"><label class="l" for="c3">About you</label><textarea class="textarea" id="c3" name="about" maxlength="600">${u.about || ''}</textarea></div>
      <div class="foot"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn red" type="submit">Save</button></div></form>`);
  },
  skills: async () => {
    const list = await api('/skills');
    openModal(h`<h2>Skills</h2><p class="sub">List the language and technical skills you want on your profile.</p>
      <div class="tags" style="margin-bottom:18px">${list.length ? list.map((k) => h`<span class="tag">${k.name} <span class="muted small">${k.type}</span><button data-act="skill-del" data-id="${k.id}" aria-label="Remove ${k.name}">×</button></span>`) : h`<span class="muted">Nothing yet.</span>`}</div>
      <form data-form="skill" class="row wrap" novalidate><input class="input" name="name" placeholder="e.g. Python, French" style="flex:1;min-width:160px" aria-label="Skill name"><select class="select" name="type" style="width:auto" aria-label="Skill type"><option value="technical">Technical</option><option value="language">Language</option></select><button class="btn red" type="submit">Add</button></form>
      <div class="foot"><button class="btn" data-act="close-modal">Done</button></div>`, { narrow: true });
  },
  'skill-del': async (el) => { await api(`/skills/${el.dataset.id}`, { method: 'DELETE' }); closeModal(); actions.skills(); refresh(); },
  'letter-new': () => S.openLetterForm(),
  'letter-remind': async (el) => { try { await api(`/letters/${el.dataset.id}/remind`, { method: 'POST' }); toast('Reminder sent to your lecturer.'); } catch (e) { toast(e.message, 'err'); } },
  'letter-download': () => download('recommendation-letter.txt', $('#lettertext').textContent),
  'letter-revise': async (el) => {
    const note = await promptBox('Ask for a revision', 'What should change?', { okLabel: 'Send to lecturer', sub: 'The lecturer remains the author and decides how to respond.' });
    if (!note) return;
    try { await api(`/letters/${el.dataset.id}/revision`, { method: 'POST', body: { note } }); toast('Revision requested.'); refresh(); } catch (e) { toast(e.message, 'err'); }
  },
  'lt-generate': async (el) => {
    const t = $('#lt-text');
    if (t.value.trim() && !(await confirmBox('Replace the current text?', 'Generating again replaces what is in the editor with a fresh draft from the verified records.', 'Replace'))) return;
    try { const r = await api(`/letters/${el.dataset.id}/draft`, { method: 'POST' }); t.value = r.draft_text; toast('Draft generated from verified records. Add your own observations before approving.'); } catch (e) { toast(e.message, 'err'); }
  },
  'lt-save': async (el) => { try { await api(`/letters/${el.dataset.id}`, { method: 'PUT', body: { draft_text: $('#lt-text').value } }); toast('Draft saved.'); } catch (e) { toast(e.message, 'err'); } },
  'lt-approve': async (el) => {
    if (!(await confirmBox('Approve and send?', 'The student will be able to view and download this letter. You remain its author.', 'Approve'))) return;
    try { await api(`/letters/${el.dataset.id}/approve`, { method: 'POST', body: { text: $('#lt-text').value } }); toast('Letter approved and shared with the student.'); refresh(); } catch (e) { toast(e.message, 'err'); }
  },
  'lt-decline': async (el) => {
    const reason = await promptBox('Decline this request', 'Reason for the student', { okLabel: 'Decline request', sub: 'Be kind and specific — for example if you do not know their work well enough.' });
    if (!reason) return;
    try { await api(`/letters/${el.dataset.id}/decline`, { method: 'POST', body: { reason } }); toast('Request declined.'); refresh(); } catch (e) { toast(e.message, 'err'); }
  },
  'share-new': (el) => S.openShareForm(el.dataset.kind),
  'share-copy': async (el) => toast((await copyText(el.dataset.url)) ? 'Link copied.' : 'Could not copy — select and copy the link manually.'),
  'share-revoke': async (el) => {
    if (!(await confirmBox('Cancel access?', 'The link or lecturer access stops working immediately.', 'Cancel access', true))) return;
    try { await api(`/shares/${el.dataset.id}`, { method: 'DELETE' }); toast('Access cancelled.'); refresh(); } catch (e) { toast(e.message, 'err'); }
  },
  'q-nav': (el) => { T.queueState.idx = Math.max(0, Math.min(T.queueState.items.length - 1, T.queueState.idx + Number(el.dataset.d))); mount($('#view'), T.queueBody()); },
  'q-act': async (el) => {
    const q = T.queueState; const item = q.items[q.idx];
    const note = $('#qnote').value.trim(); const tier = $('#qtier') ? $('#qtier').value : undefined;
    el.disabled = true;
    try {
      await api(`/review/${item.id}`, { method: 'POST', body: { action: el.dataset.a, note, tier } });
      const msg = { verify: 'Verified. The student has been notified.', reject: 'Declined. The student was told why.', clarify: 'Clarification requested.', flag: 'Flagged. The student can explain before any decision.', approve_change: 'Change approved.', decline_change: 'Change declined.', approve_deletion: 'Record removed.', decline_deletion: 'Record kept.' }[el.dataset.a];
      toast(msg); delete q.checks[item.id]; refresh();
    } catch (e) { toast(e.message, 'err'); $('#qnote') && $('#qnote').focus(); el.disabled = false; }
  },
  'sum-copy': () => T.summaryCopy(),
  'adm-recfilter': (el) => { A.setAdminUi('recFilter', el.dataset.f); refresh(); },
  'adm-userfilter': (el) => { A.setAdminUi('userRole', el.dataset.f); refresh(); },
  'adm-editstudent': (el) => A.openStudentEditor(el.dataset.id),
  'adm-newuser': () => A.openNewUser(),
  'adm-edituser': (el) => A.openEditUser(el),
  'staff-add': (el) => R.openRecordForm(el.dataset.kind || 'achievement', null, null, { id: el.dataset.id, name: el.dataset.name }),
  'adm-reset': async (el) => { try { await api(`/admin/users/${el.dataset.id}/reset-password`, { method: 'POST' }); toast('Reset link sent.'); } catch (e) { toast(e.message, 'err'); } },
  'adm-unlock': async (el) => { await api(`/admin/users/${el.dataset.id}/unlock`, { method: 'POST' }); toast('Account unlocked.'); refresh(); },
};

/* ---------- forms ---------- */
const val = (f, n) => (f.elements[n] ? f.elements[n].value : '');
const forms = {
  async login(f) {
    const r = await api('/auth/login', { method: 'POST', body: { email: val(f, 'email'), password: val(f, 'password') } });
    pendingChallenge = r; location.hash = '#/verify'; render();
  },
  async consent(f) {
    if (!f.elements.agree.checked) { formError(f, 'Please tick the box to agree before continuing.'); return; }
    await api('/privacy/accept', { method: 'POST', body: {} }); state.user.privacy_accepted = true; location.hash = '#/'; render();
  },
  async verify(f) {
    const r = await api('/auth/verify', { method: 'POST', body: { challenge: f.dataset.challenge, code: val(f, 'code') } });
    state.user = r.user; pendingChallenge = null; location.hash = '#/'; render();
  },
  async register(f) {
    await api('/auth/register', { method: 'POST', body: Object.fromEntries(new FormData(f)) });
    toast('Account created. Sign in to continue.'); location.hash = '#/login';
  },
  async forgot(f) { await api('/auth/forgot', { method: 'POST', body: { email: val(f, 'email') } }); toast('If that account exists, a reset link was sent.'); f.reset(); },
  async reset(f) { await api('/auth/reset', { method: 'POST', body: { token: f.dataset.token, password: val(f, 'password') } }); toast('Password updated. Please sign in.'); location.hash = '#/login'; },
  async record(f) { await R.submitRecord(f); },
  async 'opp-new'(f) {
    const r = await api('/opportunities', { method: 'POST', body: Object.fromEntries(new FormData(f)) });
    closeModal(); toast(`Posted. ${r.notified} student${r.notified === 1 ? '' : 's'} notified.`); refresh();
  },
  async 'opp-apply'(f) { await api(`/opportunities/${f.dataset.id}/apply`, { method: 'POST', body: { note: val(f, 'note') } }); closeModal(); toast('Application submitted.'); refresh(); },
  async 'res-new'(f) {
    const b = Object.fromEntries(new FormData(f)); b.premium = !!f.elements.premium.checked;
    await api('/resources', { method: 'POST', body: b }); closeModal(); toast('Resource added.'); refresh();
  },
  async 'msg-new'(f) { const r = await api('/messages', { method: 'POST', body: Object.fromEntries(new FormData(f)) }); closeModal(); toast('Message sent.'); location.hash = `#/messages/${r.id}`; },
  async 'msg-reply'(f) { await api(`/messages/${f.dataset.id}/reply`, { method: 'POST', body: { body: val(f, 'body') } }); refresh(); },
  async 'app-status'(f) { await api(`/applications/${f.dataset.id}/status`, { method: 'POST', body: { status: val(f, 'status'), note: val(f, 'note') } }); toast('Applicant updated and notified.'); },
  async 'premium-manual'(f) { const r = await api('/premium/subscribe', { method: 'POST', body: { reference: val(f, 'reference') } }); toast(r.message); refresh(); },
  async contact(f) {
    const r = await api('/me/contact', { method: 'PUT', body: { phone: val(f, 'phone'), personal_email: val(f, 'personal_email'), about: val(f, 'about'), email_notifications: state.user.email_notifications } });
    state.user = r.user; closeModal(); toast('Contact details saved.'); refresh();
  },
  async skill(f) { await api('/skills', { method: 'POST', body: { name: val(f, 'name'), type: val(f, 'type') } }); closeModal(); actions.skills(); refresh(); },
  async letter(f, ev, confirmDup) {
    const body = { lecturer_id: val(f, 'lecturer_id'), purpose: val(f, 'purpose'), purpose_detail: val(f, 'purpose_detail'), deadline: val(f, 'deadline'), key_points: val(f, 'key_points'),
      include_results: f.elements.include_results.checked, achievement_ids: [...f.querySelectorAll('input[name=ach]:checked')].map((c) => c.value), confirm_duplicate: !!confirmDup };
    try { await api('/letters', { method: 'POST', body }); closeModal(); toast('Request sent. Your lecturer only sees the items you chose.'); location.hash = '#/letters'; refresh(); } catch (e) {
      if (e.data && e.data.duplicate && await confirmBox('You already have an open request', e.message + ' Send another anyway?', 'Send anyway')) return forms.letter(f, ev, true);
      throw e;
    }
  },
  async share(f) {
    const kind = f.dataset.kind;
    const body = { kind, days: val(f, 'days'), label: val(f, 'label'), lecturer_id: val(f, 'lecturer_id'), purpose: val(f, 'purpose'), include_results: f.include_results.checked, include_skills: f.include_skills.checked,
      achievement_ids: [...f.querySelectorAll('input[name=ach]:checked')].map((c) => c.value) };
    const s = await api('/shares', { method: 'POST', body });
    closeModal();
    if (s.url) openModal(h`<h2>Your link is ready</h2><p class="sub">Anyone with this link can see only what you selected, until it expires or you cancel it. You will be told whenever it is opened.</p><div class="field"><input class="input" readonly value="${s.url}" aria-label="Profile link"></div>
      <div class="foot"><button class="btn" data-act="close-modal">Close</button><button class="btn red" data-act="share-copy" data-url="${s.url}">${'Copy link'}</button></div>`, { narrow: true });
    else toast('Access granted. The lecturer was notified.');
    refresh();
  },
  async ticket(f) { await api('/tickets', { method: 'POST', body: Object.fromEntries(new FormData(f)) }); toast('Sent. We will notify you when it is answered.'); refresh(); },
  async password(f) { await api('/auth/change-password', { method: 'POST', body: { current: val(f, 'current'), password: val(f, 'password') } }); toast('Password updated.'); f.reset(); },
  async 'adm-student'(f) {
    await api(`/admin/students/${f.dataset.id}`, { method: 'PATCH', body: { name: val(f, 'name'), programme: val(f, 'programme'), year: val(f, 'year'), graduation: val(f, 'graduation'), status: val(f, 'status'), identity_confirmed: f.identity_confirmed.checked, alumni: f.alumni.checked } });
    closeModal(); toast('Record updated and logged.'); refresh();
  },
  async 'adm-newuser'(f) {
    const r = await api('/admin/users', { method: 'POST', body: Object.fromEntries(new FormData(f)) });
    closeModal();
    openModal(h`<h2>Account created</h2><p class="sub">The temporary password was emailed. You can also copy it now — it is not shown again.</p><div class="field"><input class="input" readonly value="${r.temp_password}" aria-label="Temporary password"></div><div class="foot"><button class="btn red" data-act="close-modal">Done</button></div>`, { narrow: true });
    refresh();
  },
  async 'adm-edituser'(f) { await api(`/admin/users/${f.dataset.id}`, { method: 'PATCH', body: Object.fromEntries(new FormData(f)) }); closeModal(); toast('Access updated.'); refresh(); },
  async 'adm-ticket'(f) { await api(`/admin/tickets/${f.dataset.id}`, { method: 'PATCH', body: { status: 'resolved', response: val(f, 'response') } }); toast('Reply sent.'); refresh(); },
  async 'adm-import'(f) {
    let csv = val(f, 'csv');
    const file = $('#csvf').files[0];
    if (file) csv = await file.text();
    const r = await api('/admin/results/import', { method: 'POST', body: { csv } });
    $('#importres').innerHTML = h`<div class="callout ${r.errors.length ? 'amber' : 'green'}">${icon(r.errors.length ? 'triangle-alert' : 'circle-check')}<div><b>${r.imported} result${r.imported === 1 ? '' : 's'} imported.</b>${r.errors.length ? h`<ul style="margin:6px 0 0 18px;padding:0">${r.errors.slice(0, 20).map((x) => h`<li>${x}</li>`)}</ul>` : ''}</div></div>`.s;
    toast(`${r.imported} results imported.`);
  },
  async reviewlink(f, ev) {
    const a = ev.submitter ? ev.submitter.dataset.a : 'verify';
    await api(`/review-link/${f.dataset.token}`, { method: 'POST', body: { action: a, note: val(f, 'note'), tier: val(f, 'tier') } });
    mount($('#app'), h`<div class="pubwrap"><div class="card" style="max-width:560px;width:100%">${empty('circle-check', 'Thank you — recorded', 'The student has been notified of your decision. You can close this page.')}</div></div>`);
  },
};

/* ---------- global events ---------- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  const pop = $('#pop');
  if (pop && !pop.hidden && !e.target.closest('#pop') && !(t && t.dataset.act === 'bell')) pop.hidden = true;
  if (!t) return;
  const fn = actions[t.dataset.act];
  if (fn) { e.preventDefault(); Promise.resolve(fn(t, e)).catch((err) => { toast(err.message, 'err'); if (err.data && err.data.upgrade) { closeModal(); location.hash = '#/premium'; } }); }
});
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const fn = forms[f.dataset.form];
  if (!fn) return;
  const btns = f.querySelectorAll('[type=submit]');
  btns.forEach((b) => { b.disabled = true; });
  try { showErrors(f, {}); formError(f, ''); await fn(f, e); } catch (err) {
    const shown = showErrors(f, err.fields);
    formError(f, shown ? 'Please fix the highlighted fields.' : err.message);
    if (err.data && err.data.upgrade) { closeModal(); location.hash = '#/premium'; }
    if (!shown && !f.querySelector('.formerr')) toast(err.message, 'err');
  } finally { btns.forEach((b) => { if (document.contains(b)) b.disabled = false; }); }
});
let debounce;
document.addEventListener('input', (e) => {
  const t = e.target;
  const k = t.dataset && t.dataset.input;
  if (!k) return;
  if (k === 'staff-search') { clearTimeout(debounce); debounce = setTimeout(() => { T.setSearch(t.value); render(); }, 250); }
  if (k === 'adm-recsearch') { clearTimeout(debounce); debounce = setTimeout(() => { A.setAdminUi('recQ', t.value); render(); }, 250); }
  if (k === 'adm-usersearch') { clearTimeout(debounce); debounce = setTimeout(() => { A.setAdminUi('userQ', t.value); render(); }, 250); }
});
document.addEventListener('change', async (e) => {
  const t = e.target;
  const f = t.closest && t.closest('form[data-form=record]');
  if (f) {
    if (t.name === 'cat') { R.suggestVerifier(f); R.syncEvidence(f); R.syncVerifierList(f); }
    if (t.name === 'verifier_type') { f.dataset.vtTouched = '1'; R.syncVerifierList(f); }
    if (['level', 'result', 'responsibility', 'duration'].includes(t.name)) R.syncTier(f);
    if (t.name === 'evidence') R.syncEvidence(f);
    return;
  }
  const k = t.dataset && t.dataset.input;
  if (k === 'term') { S.setTerm(t.value); render(); }
  if (k === 'sum-purpose') { $('#sumtext').textContent = `${t.dataset.lead}, providing a strong foundation for ${t.value.toLowerCase()}.`; }
  if (k === 'q-check') {
    const q = T.queueState; const item = q.items[q.idx]; const n = Number(t.dataset.n);
    const set = new Set(q.checks[item.id] || []); t.checked ? set.add(n) : set.delete(n); q.checks[item.id] = [...set];
    const vb = $('[data-a=verify]'); if (vb) { vb.disabled = set.size < 5; vb.title = set.size < 5 ? 'Tick every review requirement first' : ''; }
  }
  if (k === 'emailpref') {
    const u = state.user;
    try { const r = await api('/me/contact', { method: 'PUT', body: { phone: u.phone, personal_email: u.personal_email, about: u.about, email_notifications: t.checked } }); state.user = r.user; toast('Preference saved.'); } catch (err) { toast(err.message, 'err'); }
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); const p = $('#pop'); if (p) p.hidden = true; } });
window.addEventListener('hashchange', render);
window.addEventListener('app:refresh', render);

(async function boot() {
  try { state.meta = await api('/meta'); } catch { /* shown on render */ }
  render();
  // keep the notification dot fresh
  setInterval(() => { if (state.user) updateChrome(); }, 60000);
})();

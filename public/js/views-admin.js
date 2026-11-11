import { h, raw, api, state, icon, badge, tierTag, tile, empty, toast, openModal, closeModal, confirmBox, refresh,
  fmtMonth, fmtDate, fmtDateTime, ago, greeting, kindIcon, itemSubtitle, avatar } from './core.js';
import { recordRow } from './records.js';
import { summaryPage } from './views-staff.js';

const lnk = (href, label) => h`<a href="#${href}">${label}</a>`;
const ui = { recFilter: 'all', recQ: '', userRole: 'all', userQ: '' };
export const setAdminUi = (k, v) => { ui[k] = v; };
const ROLE = { student: 'Student', lecturer: 'Lecturer', verifier: 'Verifier', admin: 'Administrator' };

export async function dashboard() {
  const d = await api('/admin/stats');
  const stat = (label, n, sub, ic, col) => h`<div class="card stat"><div><small>${label}</small><div class="n">${n.toLocaleString()}</div><div class="s">${sub}</div></div>${tile(ic, col)}</div>`;
  return h`<div class="eyebrow">Administration workspace</div><h1 class="page">${greeting()}, Administrator</h1><p class="lede">Manage student records, review submitted evidence, control access, and maintain trusted institutional data.</p>
    <div class="grid g3 mt-l">${stat('Student records', d.students, `${d.active} active · ${d.alumni} alumni`, 'users', 'red')}${stat('Pending reviews', d.pending, `${d.overdue} waiting more than 3 days`, 'clock', 'amber')}${stat('Active users', d.users, 'Students, lecturers, and administrators', 'user', 'blue')}</div>
    <div class="grid split mt"><div class="card"><div class="cardhead"><h2>Administrative queue</h2>${lnk('/queue', 'View all records')}</div>
      ${d.queue.length ? d.queue.map((q) => h`<a class="itemrow" href="#/queue">${avatar(q.student)}<div class="grow"><h4>${q.student}</h4><div class="small muted">${q.note} — ${q.title}</div></div><span class="small" style="color:var(--amber);font-weight:600">${ago(q.created_at)}</span>${icon('chevron-right')}</a>`)
        : empty('circle-check', 'Queue is clear', 'No submissions are waiting.')}
      <div class="grid g3 mt" style="gap:12px"><div class="snap"><small>Letters in progress</small><div class="n">${d.lettersOpen}</div></div><div class="snap"><small>Open support requests</small><div class="n">${d.tickets}</div></div><div class="snap"><small>Sign-ins this week</small><div class="n">${d.recentLogins}</div></div></div></div>
      <div class="card dark">${tile('check', 'red')}<h2 class="mt-s" style="color:#fff">Administrator responsibilities</h2>
        ${['Manage accounts, roles, and authorized access', 'Review evidence and verify genuine achievements', 'Maintain accurate student and academic records', 'Resolve duplicate, incomplete, or disputed entries', 'Protect personal data and maintain an audit trail'].map((t) => h`<div class="row gap-s" style="margin:10px 0;color:#e5e5e5;font-size:14px"><span style="color:#d9a441">${icon('check')}</span>${t}</div>`)}</div></div>`;
}

export async function records() {
  const list = await api(`/admin/students?filter=${ui.recFilter}&q=${encodeURIComponent(ui.recQ)}`);
  const tab = (k, l) => h`<button class="pillbtn ${ui.recFilter === k ? 'on' : ''}" data-act="adm-recfilter" data-f="${k}">${l}</button>`;
  return h`<div class="eyebrow">Records administration</div><h1 class="page">Student records</h1><p class="lede">Review profile status, account access, verification activity, and data-quality actions across Africa University.</p>
    <div class="search mt"><span aria-hidden="true">${icon('search')}</span><input class="input" data-input="adm-recsearch" value="${ui.recQ}" placeholder="Search by name, student ID, programme…" aria-label="Search student records"></div>
    <div class="tabs mt">${tab('all', 'All students')}${tab('review', 'Needs review')}${tab('restricted', 'Access restricted')}</div>
    <div class="grid g2" style="gap:18px">${list.length ? list.map((s) => h`<a class="card" href="#/records/${s.id}" style="text-decoration:none;color:inherit;padding:24px"><div class="row sp"><div class="row">${avatar(s.name, true)}<div><b style="font-size:17px">${s.name}</b><div class="muted small">${s.programme} · Year ${s.year}</div></div></div>${icon('chevron-right')}</div><div class="divider"></div>
        <div class="row sp"><div><div class="navlabel" style="padding:0">Profile</div><b>${s.profile}%</b></div><div><div class="navlabel" style="padding:0">Last updated</div><b>${fmtDate(s.updated)}</b></div>
        <div><div class="navlabel" style="padding:0">Next action</div><b style="color:${s.next === 'On track' ? 'var(--green)' : 'var(--amber)'}">${s.next}</b></div></div></a>`) : h`<div class="card" style="grid-column:1/-1">${empty('users', 'No records match', 'Try a different search or filter.')}</div>`}</div>`;
}

export async function recordDetail(id) {
  const d = await api(`/admin/students/${id}`);
  const s = d.student, u = d.user;
  const pendingIds = d.items.filter((i) => ['pending', 'flagged'].includes(i.status)).length;
  return h`<a class="link" href="#/records">← Student records</a>
    <div class="card profilecard mt"><div class="banner"></div><div class="who">${avatar(s.name, true)}<div class="info"><h2>${s.name}</h2> ${u.identity_confirmed ? badge('verified') : h`<span class="badge b-pending">Identity unconfirmed</span>`} ${u.status !== 'active' ? badge(u.status) : ''} ${u.alumni ? h`<span class="badge b-neutral">Alumni</span>` : ''}
      <div class="muted">${s.programme} · Year ${s.year} · ${s.student_id} · ${u.email}</div></div><button class="btn noprint" data-act="staff-add" data-kind="achievement" data-id="${s.id}" data-name="${s.name}">${icon('plus')} Add on their behalf</button><button class="btn noprint" data-act="adm-editstudent" data-id="${s.id}">${icon('settings')} Manage record</button></div></div>
    <div class="grid split"><div class="stack"><div class="card"><div class="cardhead"><h2>All submissions</h2><span class="muted small">${d.items.length} items · ${pendingIds} awaiting review · profile ${d.completeness}% complete</span></div>
        ${d.items.length ? d.items.map((i) => recordRow(i, { student: false })) : empty('award', 'Nothing submitted', 'This student has not logged any items yet.')}</div></div>
      <div class="stack"><div class="card"><h2>Academic summary</h2>${d.academic ? h`<div class="kv" style="border:0"><span>GPA</span><span>${d.academic.gpa.toFixed(2)}</span></div><div class="kv"><span>Credits</span><span>${d.academic.credits}/${d.academic.required}</span></div>` : '<p class="muted">No results imported.</p>'}
          <a class="btn block mt" href="#/summaries/${s.id}" style="text-decoration:none">View verified summary</a></div>
        <div class="card"><h2>Recent sign-ins</h2><ul class="tl">${d.logins.map((l) => h`<li><b>${l.success ? 'Signed in' : 'Failed'}</b><small>${fmtDateTime(l.at)} · ${l.ip || ''}</small></li>`)}</ul></div></div></div>`;
}
export async function openStudentEditor(id) {
  const d = await api(`/admin/students/${id}`);
  const s = d.student, u = d.user;
  openModal(h`<h2>Manage record</h2><p class="sub">Identity and academic details are locked for students — only administrators change them. Every change is audited.</p>
    <form data-form="adm-student" data-id="${s.id}" novalidate>
      <div class="formgrid"><div class="field"><label class="l" for="e-n">Full name</label><input class="input" id="e-n" name="name" value="${s.name}"></div><div class="field"><label class="l" for="e-p">Programme</label><input class="input" id="e-p" name="programme" value="${s.programme || ''}"></div>
        <div class="field"><label class="l" for="e-y">Year</label><input class="input" type="number" min="1" max="8" id="e-y" name="year" value="${s.year || ''}"></div><div class="field"><label class="l" for="e-g">Graduation year</label><input class="input" type="number" id="e-g" name="graduation" value="${s.graduation || ''}"></div>
        <div class="field"><label class="l" for="e-s">Account access</label><select class="select" id="e-s" name="status">${['active', 'restricted', 'disabled'].map((x) => h`<option value="${x}" ${u.status === x ? 'selected' : ''}>${x[0].toUpperCase() + x.slice(1)}</option>`)}</select></div></div>
      <label class="check"><input type="checkbox" name="identity_confirmed" ${u.identity_confirmed ? 'checked' : ''}> Identity confirmed</label>
      <label class="check mt-s"><input type="checkbox" name="alumni" ${u.alumni ? 'checked' : ''}> Alumni (verification codes and resets go to their backup personal email)</label>
      <div class="foot"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn red" type="submit">Save</button></div></form>`);
}

export async function summaries() {
  const list = await api('/admin/students');
  return h`<div class="eyebrow">Verified summaries</div><h1 class="page">Verified summaries</h1><p class="lede">Evidence-based summaries drawn only from verified records. Each view is logged and the student is notified.</p>
    <div class="mt-l">${list.map((s) => h`<a class="itemrow" href="#/summaries/${s.id}">${avatar(s.name)}<div class="grow"><h4>${s.name}</h4><div class="small muted">${s.student_id} · ${s.programme}</div></div>${icon('chevron-right')}</a>`)}</div>`;
}
export async function summaryFor(id) {
  const d = await api(`/admin/summary/${id}`);
  return summaryPage(d.profile, d.summary, { backHref: '/summaries', backLabel: 'Verified summaries', eyebrow: 'Verified summary' });
}

export async function directory() {
  const list = await api(`/admin/users?role=${ui.userRole}&q=${encodeURIComponent(ui.userQ)}`);
  const tab = (k, l) => h`<button class="pillbtn ${ui.userRole === k ? 'on' : ''}" data-act="adm-userfilter" data-f="${k}">${l}</button>`;
  return h`<div class="pagehead"><div><div class="eyebrow">Student directory</div><h1 class="page">Directory &amp; access</h1><p class="lede">Manage who can sign in and what they can do. Access is role-based.</p></div><button class="btn red" data-act="adm-newuser">${icon('plus')} Add user</button></div>
    <div class="card"><div class="search"><span aria-hidden="true">${icon('search')}</span><input class="input" data-input="adm-usersearch" value="${ui.userQ}" placeholder="Search by name, email or student ID…" aria-label="Search users"></div>
      <div class="tabs mt">${tab('all', 'All users')}${tab('student', 'Students')}${tab('staff', 'Lecturers & verifiers')}${tab('admin', 'Administrators')}</div></div>
    <div class="mt">${list.map((u) => h`<div class="itemrow">${avatar(u.name)}<div class="grow"><h4>${u.name} ${u.status !== 'active' ? badge(u.status) : ''} ${u.locked ? h`<span class="badge b-rejected">Locked</span>` : ''}</h4>
        <div class="small muted">${u.email} · ${ROLE[u.role]}${u.title ? ' — ' + u.title : ''}${u.student_id ? ' · ' + u.student_id : ''}</div></div>
      <div class="row gap-s wrap noprint"><button class="btn sm" data-act="adm-edituser" data-id="${u.id}" data-name="${u.name}" data-role="${u.role}" data-status="${u.status}" data-title="${u.title || ''}" data-vt="${u.verifier_type || ''}">Edit access</button>
        <button class="btn sm" data-act="adm-reset" data-id="${u.id}">Send reset link</button>${u.locked ? h`<button class="btn sm" data-act="adm-unlock" data-id="${u.id}">Unlock</button>` : ''}</div></div>`)}</div>`;
}
export function openNewUser() {
  openModal(h`<h2>Add a user</h2><p class="sub">A temporary password is created and emailed. They must change it after signing in.</p>
    <form data-form="adm-newuser" novalidate><div class="formgrid"><div class="field" data-field="name"><label class="l" for="n-n">Full name</label><input class="input" id="n-n" name="name"></div>
      <div class="field" data-field="email"><label class="l" for="n-e">Email</label><input class="input" type="email" id="n-e" name="email"></div>
      <div class="field" data-field="role"><label class="l" for="n-r">Role</label><select class="select" id="n-r" name="role"><option value="lecturer">Lecturer</option><option value="verifier">Verifier (Records Office, Sports Director, supervisor…)</option><option value="admin">Administrator</option><option value="student">Student</option></select></div>
      <div class="field" data-field="verifier_type"><label class="l" for="n-v">Verifier type <span class="muted">(verifiers only)</span></label><select class="select" id="n-v" name="verifier_type"><option value="records_office">Academic Records Office</option><option value="department_head">Department head</option><option value="supervisor">Attachment supervisor</option></select></div>
      <div class="field" data-field="title"><label class="l" for="n-t">Title <span class="muted">(shown to students)</span></label><input class="input" id="n-t" name="title" placeholder="e.g. Sports Director"></div>
      <div class="field" data-field="student_id"><label class="l" for="n-s">Student ID <span class="muted">(students only)</span></label><input class="input" id="n-s" name="student_id"></div></div>
      <div class="foot"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn red" type="submit">Create account</button></div></form>`);
}
export function openEditUser(el) {
  const d = el.dataset;
  openModal(h`<h2>Edit access — ${d.name}</h2><p class="sub">Changes sign the user out and are recorded in the audit log.</p>
    <form data-form="adm-edituser" data-id="${d.id}" novalidate><div class="formgrid">
      <div class="field"><label class="l" for="u-r">Role</label><select class="select" id="u-r" name="role">${Object.entries(ROLE).map(([k, v]) => h`<option value="${k}" ${d.role === k ? 'selected' : ''}>${v}</option>`)}</select></div>
      <div class="field"><label class="l" for="u-v">Verifier type</label><select class="select" id="u-v" name="verifier_type">${[['records_office', 'Academic Records Office'], ['department_head', 'Department head'], ['supervisor', 'Attachment supervisor']].map(([k, v]) => h`<option value="${k}" ${d.vt === k ? 'selected' : ''}>${v}</option>`)}</select></div>
      <div class="field"><label class="l" for="u-t">Title</label><input class="input" id="u-t" name="title" value="${d.title}"></div>
      <div class="field"><label class="l" for="u-s">Status</label><select class="select" id="u-s" name="status">${['active', 'restricted', 'disabled'].map((x) => h`<option value="${x}" ${d.status === x ? 'selected' : ''}>${x[0].toUpperCase() + x.slice(1)}</option>`)}</select></div></div>
      <div class="foot"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn red" type="submit">Save</button></div></form>`);
}

export async function reports() {
  const r = await api('/admin/reports');
  const max = (arr) => Math.max(1, ...arr.map((x) => x.n));
  const bars = (arr, key) => arr.length ? arr.map((x) => h`<div class="bar"><span class="lab">${x[key]}</span><span class="trk"><i style="width:${(x.n / max(arr)) * 100}%"></i></span><span class="v">${x.n}</span></div>`) : h`<p class="muted">No data yet.</p>`;
  const hrs = (v) => (v == null ? '—' : v < 48 ? `${v.toFixed(1)} h` : `${(v / 24).toFixed(1)} days`);
  const pct = r.activeProfiles.students ? Math.round((r.activeProfiles.withRecords / r.activeProfiles.students) * 100) : 0;
  const stat = (label, n, sub, ic, col) => h`<div class="card stat"><div><small>${label}</small><div class="n">${n}</div><div class="s">${sub}</div></div>${tile(ic, col)}</div>`;
  return h`<div class="pagehead"><div><div class="eyebrow">University reporting</div><h1 class="page">Reports</h1><p class="lede">Evidence of value: adoption, verification speed, and what students achieve. Supports accreditation and awards reporting.</p></div><a class="btn" href="/api/admin/reports.csv" style="text-decoration:none">${icon('download')} Export CSV</a></div>
    <div class="grid g3">${stat('Active profiles', pct + '%', `${r.activeProfiles.withRecords} of ${r.activeProfiles.students} students have logged records`, 'users', 'red')}${stat('Avg. verification time', hrs(r.avgVerificationHours), 'From submission to decision', 'clock', 'amber')}${stat('Letters approved', `${r.letters.approved}/${r.letters.total}`, `Average ${hrs(r.avgLetterHours)} from request`, 'file-text', 'blue')}</div>
    <div class="grid g2 mt"><div class="card"><h2>Verified achievements by category</h2>${bars(r.byCategory, 'category')}</div><div class="card"><h2>Verified by programme</h2>${bars(r.byProgramme.map((x) => ({ p: x.p, n: x.n })), 'p')}
      <h2 class="mt-l">By significance tier</h2>${bars(r.byTier.map((x) => ({ t: x.tier[0].toUpperCase() + x.tier.slice(1), n: x.n })), 't')}<h2 class="mt-l">By status</h2>${bars(r.byStatus.map((x) => ({ s: x.status, n: x.n })), 's')}</div></div>`;
}

export async function support() {
  const list = await api('/admin/tickets');
  const labels = { complaint: 'Complaint / question', attachment_letter: 'Attachment letter', admission_letter: 'Admission letter', transcript: 'Official transcript', other: 'Other' };
  return h`<div class="eyebrow">Help desk</div><h1 class="page">Support inbox</h1><p class="lede">Complaints and requests for official documents. Replies notify the student.</p>
    <div class="mt-l">${list.length ? list.map((t) => h`<div class="card tight" style="margin-bottom:14px"><div class="row sp wrap"><div><b>${t.subject}</b> ${badge(t.status)}<div class="small muted">${t.name} (${t.student_id || t.email}) · ${labels[t.type]} · ${fmtDate(t.created_at)}</div></div></div>
      <p style="margin-top:10px;white-space:pre-wrap">${t.message}</p>${t.response ? h`<div class="callout green">${icon('mail')}<div>${t.response}</div></div>` : ''}
      ${t.status === 'open' ? h`<form data-form="adm-ticket" data-id="${t.id}" class="mt-s"><div class="field" style="margin-bottom:10px"><label class="l" for="r-${t.id}">Reply</label><textarea class="textarea" id="r-${t.id}" name="response" style="min-height:64px"></textarea></div><button class="btn red sm" type="submit">Reply &amp; resolve</button></form>` : ''}</div>`)
      : h`<div class="card">${empty('inbox', 'Inbox is empty', 'Student requests will appear here.')}</div>`}</div>`;
}

export async function audit() {
  const d = await api('/admin/audit?limit=120');
  return h`<div class="eyebrow">Accountability</div><h1 class="page">Audit log</h1><p class="lede">Who changed what, and every sign-in. Records are retained.</p>
    <div class="grid g2 mt-l"><div class="card"><h2>Changes</h2><ul class="tl">${d.audit.map((a) => h`<li><b style="text-transform:capitalize">${a.action}</b> <span class="muted">· ${a.entity} #${a.entity_id ?? '—'}</span><small>${a.actor_name} · ${fmtDateTime(a.at)}${a.detail ? ' · ' + a.detail : ''}</small></li>`)}</ul></div>
      <div class="card"><h2>Sign-ins</h2><ul class="tl">${d.logins.map((l) => h`<li><b>${l.success ? 'Signed in' : 'Failed'}</b> ${l.name || l.email} <span class="muted">${l.success ? '' : '(' + l.reason + ')'}</span><small>${fmtDateTime(l.at)} · ${l.ip || ''}</small></li>`)}</ul></div></div>`;
}

export function importPage() {
  return h`<div class="eyebrow">Academic Records Office</div><h1 class="page">Import results</h1><p class="lede">Students never type in their courses. Upload the official transcript data here; it appears on their profile as verified and read-only.</p>
    <div class="card mt-l"><form data-form="adm-import"><div class="field"><label class="l" for="csvf">CSV file</label><input class="input" type="file" id="csvf" accept=".csv,text/csv"><div class="hint">Columns: <code>student_id, term, module, code, credits, mark</code> — e.g. <code>STU-2022-0418, Spring 2025, Machine Learning, CS340, 4, 91</code>. Grades are calculated automatically. Re-importing a module updates it.</div></div>
      <div class="field"><label class="l" for="csvt">…or paste rows</label><textarea class="textarea" id="csvt" name="csv" style="min-height:150px;font-family:ui-monospace,monospace;font-size:13px" placeholder="student_id,term,module,code,credits,mark"></textarea></div><button class="btn red" type="submit">Import results</button><div id="importres" class="mt"></div></form></div>`;
}

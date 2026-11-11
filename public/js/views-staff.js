import { h, raw, api, state, icon, badge, tierTag, tile, empty, toast, openModal, closeModal, confirmBox, promptBox, refresh, copyText,
  fmtMonth, fmtDate, fmtDateTime, ago, daysLeft, greeting, firstName, kindIcon, itemSubtitle, avatar, fmtSize } from './core.js';
import { recordRow } from './records.js';

const lnk = (href, label) => h`<a href="#${href}">${label}</a>`;

/* ---------- lecturer / verifier dashboard ---------- */
export async function dashboard() {
  const [d, recent] = await Promise.all([api('/staff/dashboard'), api('/staff/recent')]);
  const u = state.user;
  const isLec = u.role === 'lecturer';
  const stat = (label, n, sub, ic, col) => h`<div class="card stat"><div><small>${label}</small><div class="n">${n}</div><div class="s">${sub}</div></div>${tile(ic, col)}</div>`;
  return h`<div class="eyebrow">${isLec ? 'Faculty workspace' : 'Verifier workspace'}</div><h1 class="page">${greeting()}, ${u.name}</h1><p class="lede">${isLec ? 'Find student records and prepare evidence-based recommendations.' : 'Confirm what you know best. Approve or reject with a clear reason.'}</p>
    <div class="grid g3 mt-l">
      ${isLec ? stat('Profiles viewed', d.profilesViewed, 'This semester', 'users', 'red') : stat('Students shared', d.accessible, 'Active access grants', 'users', 'red')}
      ${isLec ? stat('Recommendations', d.letters_total, `${d.letters_open} in progress`, 'file-text', 'blue') : stat('Reviewed items', '—', 'See the audit trail in each record', 'file-text', 'blue')}
      ${stat('Verification requests', d.queue, 'Awaiting review', 'clock', 'amber')}
    </div>
    <div class="grid split mt"><div class="card"><div class="cardhead"><h2>Recently viewed students</h2>${lnk('/recent', 'View all')}</div>
      ${recent.length ? recent.slice(0, 4).map((s) => h`<a class="itemrow" href="#/students/${s.id}">${avatar(s.name)}<div class="grow"><h4>${s.name}</h4><div class="small muted">${s.programme} · Year ${s.year}</div></div><span class="small" style="color:var(--green);font-weight:600">${s.verified_records} verified records</span>${icon('chevron-right')}</a>`)
        : empty('users', 'No students viewed yet', 'Students appear here after they share records with you.')}</div>
      <div class="card dark">${tile('search', 'red')}<h2 class="mt-s" style="color:#fff;margin-bottom:6px">Student records, in context</h2><p>Search by name or student ID to review academic progress and verified contributions that students have shared with you.</p><a class="btn white mt" href="#/students" style="text-decoration:none">Search student directory</a></div></div>`;
}

/* ---------- search ---------- */
let sq = '';
export async function students() {
  const list = await api(`/staff/students?q=${encodeURIComponent(sq)}`);
  return h`<div class="eyebrow">Student directory</div><h1 class="page">Search students</h1><p class="lede">Access is limited to students who have given you permission for a stated academic purpose.</p>
    <div class="card mt-l"><div class="search"><span aria-hidden="true">${icon('search')}</span><input class="input" id="sq" data-input="staff-search" value="${sq}" placeholder="Search by student name, ID, or programme…" aria-label="Search students"></div></div>
    <div class="mt"><div class="navlabel" style="padding-left:6px">Students who shared with you</div>
    ${list.length ? list.map((s) => h`<a class="itemrow" href="#/students/${s.id}">${avatar(s.name)}<div class="grow"><h4>${s.name}</h4><div class="small muted">${s.student_id} · ${s.programme}</div><div class="small muted">For: ${s.purposes.join('; ')}</div></div>
      <div style="text-align:right"><div class="small">Year ${s.year}</div><div class="small muted">${s.shared_count} items · ${Math.max(0, daysLeft(s.expires_at))} d left</div></div>${icon('chevron-right')}</a>`)
      : h`<div class="card">${empty('shield-check', sq ? 'No match' : 'No students have shared with you yet', 'Students choose what to share and for how long. When they do, they appear here.')}</div>`}</div>`;
}
export const setSearch = (v) => { sq = v; };

export async function recent() {
  const list = await api('/staff/recent');
  return h`<div class="eyebrow">History</div><h1 class="page">Recent profiles</h1><p class="lede">Profiles you opened. Students are told when you view their record.</p>
    <div class="mt-l">${list.length ? list.map((s) => h`<a class="itemrow" href="#/students/${s.id}">${avatar(s.name)}<div class="grow"><h4>${s.name} ${s.access_active ? badge('active') : badge('expired')}</h4><div class="small muted">${s.programme} · Year ${s.year} · last viewed ${ago(s.last_viewed)}</div></div>${icon('chevron-right')}</a>`)
      : h`<div class="card">${empty('users', 'Nothing yet', 'Profiles you open will be listed here.')}</div>`}</div>`;
}

/* ---------- student profile (lecturer view, limited to what was shared) ---------- */
export async function studentView(id) {
  const d = await api(`/staff/students/${id}`);
  const p = d.profile, s = p.student, a = p.academic;
  return h`<a class="link" href="#/students">← Search students</a><div class="eyebrow mt-s">Student record</div><h1 class="page">Student profile</h1><p class="lede">Authorized view · profile last updated ${fmtDate(d.last_updated)}</p>
    <div class="callout green mt">${icon('shield-check')}<div>This student shared the items below with you for: <b>${d.purposes.map((x) => x.purpose).join('; ')}</b>. Access ends ${fmtDate(d.purposes[0].expires_at)}. Nothing else on their profile is visible to you.</div></div>
    <div class="card profilecard mt"><div class="banner"></div><div class="who">${avatar(s.name, true)}<div class="info"><h2>${s.name}</h2> ${s.identity_confirmed ? badge('verified') : ''}<div class="muted">${s.programme} · Year ${s.year} · ID ${s.student_id}</div></div>
      <button class="btn noprint" data-act="staff-add" data-kind="achievement" data-id="${s.id}" data-name="${s.name}">${icon('plus')} Add achievement</button><a class="btn red noprint" href="#/students/${s.id}/summary" style="text-decoration:none">${icon('file-text')} Recommendation summary</a></div></div>
    <div class="grid split"><div class="stack">
      ${a ? h`<div class="card"><div class="cardhead"><h2>Academic overview</h2>${badge('verified')}</div><div class="grid g3" style="gap:14px"><div class="snap hi"><small>GPA</small><div class="n">${a.gpa.toFixed(2)}</div></div>
        <div class="snap"><small>${a.percentile ? 'Cohort rank' : 'Terms'}</small><div class="n">${a.percentile ? 'Top ' + a.percentile + '%' : a.terms.length}</div></div><div class="snap"><small>Credits</small><div class="n">${a.credits}</div></div></div></div>` : ''}
      <div class="card"><div class="cardhead"><h2>Verified achievements</h2><span class="small muted">Africa University confirmed</span></div>
        ${p.items.length ? p.items.map((i) => { const [ic, col] = kindIcon(i); return h`<div class="itemrow">${tile(ic, col)}<div class="grow"><h4>${i.title} ${badge('verified')} ${tierTag(i.tier)}</h4><div class="small muted">${itemSubtitle(i)}</div><p class="small" style="margin-top:6px;color:var(--ink-2)">${i.description}</p>
          <div class="small muted mt-s">Verified by ${i.reviewed_by_name}${i.evidence ? h` · <a href="/api/achievements/${i.id}/evidence" target="_blank" rel="noopener">View evidence</a>` : ''}</div></div></div>`; }) : empty('award', 'Nothing shared', 'The student has not shared any verified items with you.')}</div></div>
      <div class="stack"><div class="card"><h2>Student strengths</h2><div class="tags">${p.strengths.length ? p.strengths.map((t) => h`<span class="tag">${t}</span>`) : h`<span class="muted">Not enough verified items yet.</span>`}</div></div>
        <div class="card dark">${tile('file-text', 'red')}<h2 class="mt-s" style="color:#fff;margin-bottom:6px">Prepare a recommendation</h2><p>Generate a concise summary based only on verified Africa University records.</p><a class="btn white mt" href="#/students/${s.id}/summary" style="text-decoration:none">View summary</a></div></div></div>`;
}

/* ---------- recommendation summary (shared by lecturer + admin) ---------- */
let summaryCache = null;
export function summaryPage(p, sum, { backHref, backLabel, eyebrow = 'Recommendation support', purposes = ['Graduate study', 'Scholarship', 'Job application', 'Internship / attachment', 'Award nomination'] } = {}) {
  summaryCache = { p, sum };
  const s = p.student;
  const compose = (purpose) => `${sum.lead}, providing a strong foundation for ${purpose.toLowerCase()}.`;
  return h`<a class="link" href="#${backHref}">← ${backLabel}</a>
    <div class="pagehead mt-s"><div><div class="eyebrow">${eyebrow}</div><h1 class="page">Recommendation profile</h1><p class="lede">A concise, evidence-based summary prepared from ${s.name.split(' ')[0]}’s verified record.</p></div><button class="btn noprint" data-act="print">${icon('printer')} Export PDF</button></div>
    <div class="grid split"><div class="card"><div class="row">${avatar(s.name, true)}<div><b style="font-size:20px">${s.name}</b><div class="muted"><span id="sumfor">${s.programme} · Graduate study profile</span></div></div></div><div class="divider"></div>
        <h2>Profile summary</h2><p id="sumtext" style="color:var(--ink-2);line-height:1.8">${compose(purposes[0])}</p>
        <h2 class="mt-l">Evidence highlights</h2>${sum.highlights.length ? sum.highlights.map((t) => h`<div class="itemrow" style="background:#f8f8f8;border:0"><span style="color:var(--green)">${icon('check')}</span><div class="grow" style="font-size:15px">${t}</div></div>`) : h`<p class="muted">No verified items are included.</p>`}
        <h2 class="mt-l">Demonstrated strengths</h2><div class="tags">${p.strengths.map((t) => h`<span class="tag red">${t}</span>`)}</div></div>
      <div class="stack"><div class="card" style="background:var(--green-soft);border-color:#cfe9d8">${badge('verified')}<h2 class="mt-s" style="color:#115f2d">Evidence status</h2><p style="color:#115f2d">All information in this summary is drawn from Africa University-verified records.</p></div>
        <div class="card noprint"><h2>Summary settings</h2><div class="field"><label class="l" for="sumpurpose">Recommendation for</label><select class="select" id="sumpurpose" data-input="sum-purpose" data-lead="${sum.lead}">${purposes.map((x) => h`<option>${x}</option>`)}</select></div>
          <button class="btn red block" data-act="sum-copy">Copy summary</button></div></div></div>`;
}
export const summaryCopy = async () => {
  if (!summaryCache) return;
  const { p, sum } = summaryCache;
  const txt = `${document.getElementById('sumtext').textContent}\n\nEvidence highlights:\n${sum.highlights.map((x) => '- ' + x).join('\n')}\n\nDemonstrated strengths: ${p.strengths.join(', ')}\n\nSource: Africa University verified records.`;
  toast((await copyText(txt)) ? 'Summary copied.' : 'Could not copy automatically — select the text and copy it.', 'ok');
};
export async function lecturerSummary(id) {
  const d = await api(`/staff/students/${id}`);
  return summaryPage(d.profile, d.summary, { backHref: `/students/${id}`, backLabel: 'Student profile' });
}

/* ---------- letters (lecturer) ---------- */
export async function lecturerLetters() {
  const list = await api('/letters');
  return h`<div class="eyebrow">Recommendation letters</div><h1 class="page">Letter requests</h1><p class="lede">Students send key points and choose the relevant verified achievements. You draft, edit and approve — you remain the author.</p>
    <div class="mt-l">${list.length ? list.map((l) => h`<a class="itemrow" href="#/letters/${l.id}" style="padding:22px">${avatar(l.student.name)}<div class="grow"><h4>${l.student.name} — ${l.purpose} ${badge(l.status)}</h4><div class="small muted">${l.student.programme}${l.deadline ? ' · needed by ' + fmtDate(l.deadline) : ''} · requested ${ago(l.created_at)}</div></div>${icon('chevron-right')}</a>`)
      : h`<div class="card">${empty('file-text', 'No letter requests', 'Requests appear here with a reminder if they wait too long.')}</div>`}</div>`;
}
export async function lecturerLetterDetail(id) {
  const l = await api(`/letters/${id}`);
  const open = ['requested', 'drafting', 'revision_requested'].includes(l.status);
  const p = l.profile;
  return h`<a class="link" href="#/letters">← All requests</a>
    <div class="pagehead mt-s"><div><div class="eyebrow">${l.purpose}</div><h1 class="page">Letter for ${l.student.name}</h1><p class="lede">${l.student.programme} · Year ${l.student.year}${l.deadline ? ' · needed by ' + fmtDate(l.deadline) : ''}</p></div>${badge(l.status)}</div>
    ${l.status === 'revision_requested' ? h`<div class="callout purple">${icon('refresh-cw')}<div><b>The student asked for a revision:</b> ${l.revision_note}</div></div>` : ''}
    <div class="grid split mt-s"><div class="card"><div class="cardhead"><h2>Letter</h2>${open ? h`<button class="btn sm" data-act="lt-generate" data-id="${l.id}">${icon('sparkles')} ${l.draft_text ? 'Regenerate from verified records' : 'Generate draft from verified records'}</button>` : ''}</div>
        <textarea class="textarea letter" id="lt-text" style="min-height:460px" ${open ? '' : 'readonly'} placeholder="Generate a draft from the student's verified records, then edit it in your own words.">${l.draft_text || l.final_text || ''}</textarea>
        ${open ? h`<div class="row wrap mt"><button class="btn" data-act="lt-save" data-id="${l.id}">Save draft</button><button class="btn red" data-act="lt-approve" data-id="${l.id}">${icon('check')} Approve &amp; send to student</button><button class="btn ghost-red" data-act="lt-decline" data-id="${l.id}">Decline request</button></div>
          <p class="small muted mt-s">The draft only summarises verified records. Add your own observations — replace the “[Lecturer: …]” placeholder — before approving.</p>` : l.status === 'approved' ? h`<p class="small muted mt-s">Approved ${fmtDate(l.approved_at)} and shared with the student.</p>` : h`<div class="callout red">${icon('circle-x')}Declined: ${l.decline_reason}</div>`}</div>
      <div class="stack"><div class="card"><h2>What the student asked</h2>${l.purpose_detail ? h`<p><b>${l.purpose_detail}</b></p>` : ''}${l.key_points ? h`<p style="white-space:pre-wrap;color:var(--ink-2)">${l.key_points}</p>` : h`<p class="muted">No key points given.</p>`}</div>
        <div class="card"><h2>Relevant verified records</h2><p class="small muted">Only items the student chose to include.</p>
          ${p.academic ? h`<div class="kv" style="border:0"><span>GPA</span><span>${p.academic.gpa.toFixed(2)} · ${p.academic.credits} credits</span></div>` : ''}
          ${p.items.map((i) => h`<div class="kv"><span>${i.title}<br><span class="small muted">${itemSubtitle(i)}</span></span><span>${tierTag(i.tier)}</span></div>`)}</div></div></div>`;
}

/* ---------- verification queue (lecturer, verifier, admin) ---------- */
const qs = { idx: 0, items: [], checks: {} };
const CHECKS = ['Student identity and ownership confirmed', 'Issuer or organizer is credible', 'Dates and title match the evidence', 'Description fairly represents the contribution', 'No sensitive information is exposed'];
export async function queue() {
  const items = await api('/review/queue');
  qs.items = items;
  if (qs.idx >= items.length) qs.idx = Math.max(0, items.length - 1);
  return queueBody();
}
export function queueBody() {
  const items = qs.items;
  const isAdmin = state.user.role === 'admin';
  if (!items.length) return h`<div class="eyebrow">${isAdmin ? 'Administrator review' : 'Verification'}</div><h1 class="page">Verification queue</h1><div class="card mt-l">${empty('circle-check', 'You are all caught up', 'New submissions will appear here and in your notifications.')}</div>`;
  const i = items[qs.idx];
  const s = i.student;
  const change = i.change_pending ? i.pending_changes : null;
  const delReq = i.deletion_requested;
  const normal = !change && !delReq;
  const checked = qs.checks[i.id] || [];
  const allChecked = checked.length === CHECKS.length;
  return h`<div class="eyebrow">${isAdmin ? 'Administrator review' : 'Verification'}</div><div class="pagehead"><div><h1 class="page">Verification queue</h1><p class="lede">Check the submitted information against supporting evidence before confirming it as an official Africa University record.</p></div></div>
    <div class="grid split"><div class="card"><div class="row sp"><div class="row">${avatar(s.name, true)}<div><b style="font-size:18px">${s.name}</b><div class="muted small">${s.student_id} · ${s.programme}</div></div></div>${badge(i.status === 'flagged' ? 'flagged' : 'pending')}</div><div class="divider"></div>
      <div class="eyebrow">${change ? 'Change request on a verified record' : delReq ? 'Deletion request' : i.kind === 'achievement' ? 'Achievement submission' : i.kind === 'activity' ? 'Activity submission' : 'Project / certificate submission'}</div>
      <h2 style="font-size:26px;margin:6px 0 4px">${i.title}</h2><div class="muted">${itemSubtitle(i)}</div>
      <p class="mt-s" style="color:var(--ink-2)">${i.description}</p>
      <div class="row wrap gap-s mt-s">${i.categories.map((c) => h`<span class="tag" style="padding:3px 10px;font-size:12.5px">${c}</span>`)}</div>
      ${i.student_note ? h`<div class="callout blue">${icon('mail')}<div><b>Student’s note:</b> ${i.student_note}</div></div>` : ''}
      ${change ? h`<div class="callout purple mt">${icon('pencil')}<div><b>Requested changes</b><ul style="margin:6px 0 0 18px;padding:0">${Object.entries(change).filter(([k]) => !k.startsWith('evidence_')).map(([k, v]) => h`<li><b>${k.replace(/_/g, ' ')}:</b> ${String(v)}</li>`)}${change.evidence_file ? h`<li><b>new evidence:</b> ${change.evidence_name}</li>` : ''}</ul></div></div>` : ''}
      ${delReq ? h`<div class="callout amber">${icon('trash-2')}<div>The student asked to delete this verified item. It remains in the audit trail.</div></div>` : ''}
      <div class="mt">${i.evidence ? h`<div class="itemrow" style="background:#f8f8f8">${tile('file-text', 'red', true)}<div class="grow"><b>${i.evidence.name}</b><div class="small muted">${i.evidence.mime.split('/').pop().toUpperCase()} · ${fmtSize(i.evidence.size)}</div></div><a href="/api/achievements/${i.id}/evidence" target="_blank" rel="noopener"><b>View</b></a></div>`
        : h`<div class="callout amber">${icon('triangle-alert')}<div><b>No evidence attached.</b> ${i.no_evidence_reason ? 'Student says: ' + i.no_evidence_reason : ''}</div></div>`}</div>
      <div class="field mt"><label class="l" for="qnote">Review note ${normal ? '' : ''}</label><textarea class="textarea" id="qnote" placeholder="Add the basis for your decision or request clarification…"></textarea><div class="hint">Required when rejecting, flagging or asking for clarification — the student sees it.</div></div>
      ${normal ? h`<div class="field"><label class="l" for="qtier">Significance tier <span class="muted">(suggested: ${i.tier_suggested})</span></label><select class="select" id="qtier" style="max-width:260px">${['major', 'moderate', 'minor'].map((t) => h`<option value="${t}" ${t === i.tier_suggested ? 'selected' : ''}>${t[0].toUpperCase() + t.slice(1)}</option>`)}</select></div>` : ''}
      <div class="row wrap" style="justify-content:flex-end">
        ${normal ? h`<button class="btn" data-act="q-act" data-a="clarify">Request clarification</button><button class="btn" data-act="q-act" data-a="flag" title="Looks false or inconsistent">${icon('flag')} Flag</button><button class="btn ghost-red" data-act="q-act" data-a="reject">Decline</button>
          <button class="btn red" data-act="q-act" data-a="verify" ${allChecked ? '' : 'disabled title="Tick every review requirement first"'}>${icon('check')} Verify ${i.kind === 'achievement' ? 'achievement' : 'record'}</button>`
        : change ? h`<button class="btn ghost-red" data-act="q-act" data-a="decline_change">Decline change</button><button class="btn red" data-act="q-act" data-a="approve_change">Approve change</button>`
          : h`<button class="btn" data-act="q-act" data-a="decline_deletion">Keep the record</button><button class="btn red" data-act="q-act" data-a="approve_deletion">Approve deletion</button>`}</div></div>
      <div class="stack"><div class="card" style="background:var(--red-soft);border-color:#f3cccc"><h2 style="color:var(--red)">Review requirements</h2>${CHECKS.map((c, n) => h`<label class="check-li"><input type="checkbox" data-input="q-check" data-n="${n}" ${checked.includes(n) ? 'checked' : ''}>${c}</label>`)}</div>
        <div class="card"><h2>Queue</h2><div class="row sp"><span class="muted">Current item</span><b>${qs.idx + 1} of ${items.length}</b></div><div class="progress light mt-s"><i style="width:${((qs.idx + 1) / items.length) * 100}%"></i></div>
          <div class="row mt"><button class="btn sm" data-act="q-nav" data-d="-1" ${qs.idx === 0 ? 'disabled' : ''}>← Previous</button><button class="btn sm" data-act="q-nav" data-d="1" ${qs.idx >= items.length - 1 ? 'disabled' : ''}>Next →</button></div></div>
        ${i.history && i.history.length ? h`<div class="card"><h2>Recent activity</h2><ul class="tl">${i.history.map((x) => h`<li><b style="text-transform:capitalize">${x.action}</b><small>${x.actor_name} · ${fmtDateTime(x.at)}</small></li>`)}</ul></div>` : ''}</div></div>`;
}
export const queueState = qs;

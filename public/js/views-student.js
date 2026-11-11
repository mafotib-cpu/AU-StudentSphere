import { h, raw, api, state, icon, badge, tierTag, tile, empty, toast, openModal, closeModal, confirmBox, promptBox, showErrors, formError, refresh, copyText, download,
  fmtMonth, fmtDate, fmtDateTime, ago, daysLeft, greeting, firstName, kindIcon, itemSubtitle, avatar } from './core.js';
import { recordRow } from './records.js';
import * as O from './views-opportunities.js';

const lnk = (href, label) => h`<a href="#${href}">${label}</a>`;

/* ---------- dashboard ---------- */
export async function dashboard() {
  const [d, dl, opp] = await Promise.all([
    api('/student/dashboard'),
    api('/student/deadlines').catch(() => ({ items: [] })),
    api('/opportunities').catch(() => ({ items: [] })),
  ]);
  const u = state.user;
  const stat = (label, n, sub, ic, col) => h`<div class="card stat"><div><small>${label}</small><div class="n">${n}</div><div class="s">${sub}</div></div>${tile(ic, col)}</div>`;
  const quick = (href, ic, title) => h`<a class="quick" href="#${href}">${tile(ic, 'red', true)}<div><b>${title}</b><small>View and update records</small></div><span class="chev">${icon('chevron-right')}</span></a>`;
  const letters = d.pendingLetters;
  return h`<div class="eyebrow">Student workspace</div><h1 class="page">${greeting()}, ${firstName(u.name)}</h1><p class="lede">Your Africa University journey, organized and ready to share.</p>
    <div class="grid g4 mt-l">
      ${stat('Cumulative GPA', d.gpa ? d.gpa.toFixed(2) : '—', d.percentile ? `Top ${d.percentile}% of cohort` : `${d.credits} credits earned`, 'book-open', 'red')}
      ${stat('Achievements', d.achievements.total, `${d.achievements.verified} verified · ${d.achievements.pending} pending`, 'award', 'amber')}
      ${stat('Activities', d.activities.total, `${d.activities.verified} verified · ${d.activities.pending} pending`, 'users', 'blue')}
      ${stat('Projects', d.projects.total, `${d.projectBreakdown.projects} projects · ${d.projectBreakdown.certs} certificates`, 'folder', 'purple')}
    </div>
    <div class="grid split mt">${O.deadlinesCard(dl.items)}${O.latestCard(opp.items)}</div>
    <div class="grid split mt">
      <div class="card"><div class="cardhead"><h2>Continue building your profile</h2>${lnk('/profile', 'View profile')}</div>
        <div class="grid g2" style="gap:14px">${quick('/results', 'book-open', 'Academic results')}${quick('/achievements', 'award', 'Achievements')}${quick('/activities', 'users', 'Activities & clubs')}${quick('/projects', 'folder', 'Projects & certificates')}</div>
        ${letters ? h`<div class="callout blue mt">${icon('mail')}<div>You have ${letters} recommendation letter request${letters > 1 ? 's' : ''} in progress. ${lnk('/letters', 'Track progress')}</div></div>` : ''}</div>
      <div class="card dark"><div class="row sp"><h2 style="margin:0;color:#fff">Profile strength</h2><span style="font-size:28px;font-weight:700">${d.strength.percent}%</span></div>
        <div class="progress mt"><i style="width:${d.strength.percent}%"></i></div>
        <p class="mt">${d.strength.missing.length ? d.strength.missing[0] + ' to make your profile complete.' : 'Your profile is complete. Well done.'}</p>
        <a class="btn white mt" href="#/profile" style="text-decoration:none">Improve profile</a></div>
    </div>
    <div class="pulse"><div><div class="eyebrow">Your journey pulse</div><h2>From first semester to future opportunity.</h2><p>Each verified milestone adds context that a transcript alone cannot show.</p></div>
      <div class="steps">${d.journey.map((s) => h`<div class="step"><div class="y"><i>${s.n}</i>${s.year}</div><small>${s.label}</small></div>`)}</div></div>
    <div class="card mt"><div class="cardhead"><h2>Recent updates</h2>${lnk('/achievements', 'See all')}</div>
      ${d.recent.length ? d.recent.map((i) => { const [ic, col] = kindIcon(i); return h`<div class="itemrow">${tile(ic, col)}<div class="grow"><h4>${i.title} ${badge(i.status)}</h4><div class="small muted">${itemSubtitle(i)}</div><p class="small" style="margin-top:6px;color:var(--ink-2)">${i.description}</p></div></div>`; })
        : empty('award', 'No verified updates yet', 'Log an achievement and send it for verification — it will appear here once confirmed.')}</div>`;
}

/* ---------- profile ---------- */
export async function profile() {
  const p = await api('/student/profile');
  const s = p.student, u = p.user, a = p.academic;
  return h`<div class="eyebrow">My profile</div><h1 class="page">Profile overview</h1><p class="lede">The complete, verified story of your Africa University journey.</p>
    <div class="card profilecard mt-l"><div class="banner"></div><div class="who">${avatar(s.name, true)}<div class="info"><h2>${s.name}</h2> ${u.identity_confirmed ? badge('verified') : h`<span class="badge b-pending">Identity check pending</span>`}
      <div class="muted">${s.programme} · Year ${s.year} · ID ${s.student_id}</div></div>
      <button class="btn noprint" data-act="edit-contact">${icon('pencil')} Edit contact details</button></div></div>
    <div class="grid split">
      <div class="stack">
        <div class="card"><div class="cardhead"><h2>Academic snapshot</h2>${lnk('/results', 'Full results')}</div>
          <div class="grid g3" style="gap:14px"><div class="snap hi"><small>GPA</small><div class="n">${a && a.gpa ? a.gpa.toFixed(2) : '—'}</div></div><div class="snap"><small>Credits</small><div class="n">${a ? a.credits : 0}</div></div><div class="snap"><small>Graduation</small><div class="n">${s.graduation}</div></div></div>
          <h2 class="mt-l" style="font-size:18px">Recent accomplishments</h2>
          ${p.recent.length ? p.recent.map((i) => { const [ic, col] = kindIcon(i); return h`<div class="itemrow">${tile(ic, col)}<div class="grow"><h4>${i.title} ${badge('verified')}</h4><div class="small muted">${itemSubtitle(i)}</div><p class="small" style="margin-top:6px;color:var(--ink-2)">${i.description}</p></div></div>`; }) : h`<p class="muted">Verified accomplishments will appear here.</p>`}</div>
        <div class="card"><div class="cardhead"><h2>Skills</h2></div>
          <div class="tags">${p.skills.length ? p.skills.map((k) => h`<span class="tag">${k.name} <span class="muted small">${k.type}</span></span>`) : h`<span class="muted">No skills listed yet.</span>`}</div>
          <button class="btn sm mt noprint" data-act="skills">${icon('plus')} Manage skills</button></div></div>
      <div class="stack">
        <div class="card"><h2>About</h2><p style="color:var(--ink-2)">${u.about || 'Add a short summary about your interests and goals.'}</p>
          <div class="divider"></div><div class="kv" style="border:0"><span>Student ID</span><span>${s.student_id}</span></div><div class="kv"><span>Enrolled</span><span>${fmtMonth(s.enrolled)}</span></div>
          <div class="kv"><span>School email</span><span>${u.email}</span></div><div class="kv"><span>Backup email</span><span>${u.personal_email || '—'}</span></div><div class="kv"><span>Phone</span><span>${u.phone || '—'}</span></div>
          <p class="small muted mt-s">Name, programme and results are managed by the university and cannot be edited here.</p></div>
        <div class="card dark"><div class="tile">${icon('file-text')}</div><h2 class="mt-s" style="color:#fff;margin-bottom:6px">${p.letterReady ? 'Recommendation ready' : 'Ask for a recommendation'}</h2>
          <p>Your verified profile can be shared with authorized lecturers — only what you choose, only for as long as you allow.</p><a class="btn white mt" href="#/sharing" style="text-decoration:none">Manage sharing</a></div></div>
    </div>`;
}

/* ---------- results ---------- */
let termSel = null;
export async function results() {
  const r = await api('/results');
  const cur = r.terms.find((t) => t.term === termSel) || r.terms[r.terms.length - 1];
  const stat = (label, n, sub, ic, col) => h`<div class="card stat"><div><small>${label}</small><div class="n">${n}</div><div class="s">${sub}</div></div>${tile(ic, col)}</div>`;
  return h`<div class="eyebrow">Academic record</div><div class="pagehead"><div><h1 class="page">Academic results</h1><p class="lede">Official module results imported from the Africa University Academic Records Office. Read-only.</p></div>${badge('verified')}</div>
    <div class="grid g3">${stat('Cumulative GPA', r.gpa ? r.gpa.toFixed(2) : '—', `Across ${r.credits} earned credits`, 'book-open', 'red')}${stat('Credits earned', `${r.credits}/${r.required}`, `${Math.round((r.credits / r.required) * 100)}% degree completion`, 'check', 'green')}
      ${stat('Current term', cur ? cur.gpa.toFixed(2) : '—', cur ? `${cur.term} GPA` : 'No results yet', 'calendar', 'blue')}</div>
    ${cur ? h`<div class="card tablecard mt"><div class="cardhead"><div><h2>${cur.term}</h2><div class="muted small">${cur.rows.length} modules · ${cur.credits} credits</div></div>
      <select class="select" style="width:auto" data-input="term" aria-label="Select term">${r.terms.map((t) => h`<option ${t.term === cur.term ? 'selected' : ''}>${t.term}</option>`)}</select></div>
      <div class="scroll-x"><table class="t"><thead><tr><th>Module</th><th>Code</th><th>Credits</th><th>Mark</th><th>Grade</th><th>Status</th></tr></thead>
      <tbody>${cur.rows.map((m) => h`<tr><td><b>${m.module}</b></td><td>${m.code}</td><td>${m.credits}</td><td>${m.mark}</td><td class="grade">${m.grade}</td><td>${badge('verified')}</td></tr>`)}</tbody></table></div></div>`
      : h`<div class="card mt">${empty('book-open', 'No results imported yet', 'Your results appear here once the Academic Records Office has imported your transcript. You do not need to type them in.')}</div>`}`;
}
export const setTerm = (t) => { termSel = t; };

/* ---------- letters ---------- */
const STEPS = ['requested', 'drafting', 'approved'];
const stepper = (st) => {
  const idx = st === 'revision_requested' ? 1 : Math.max(0, STEPS.indexOf(st));
  return h`<div class="stepper" aria-label="Progress">${['Requested', 'Lecturer drafting', 'Approved'].map((l, i) => h`<div class="s ${st === 'declined' ? '' : i <= idx ? 'on' : ''}"><i></i>${l}</div>`)}</div>`;
};
export async function letters() {
  const list = await api('/letters');
  return h`<div class="pagehead"><div><div class="eyebrow">Recommendation letters</div><h1 class="page">Letters</h1><p class="lede">Request a letter, give key points, and track progress. Your lecturer stays the author.</p></div>
    <button class="btn red" data-act="letter-new">${icon('plus')} Request a letter</button></div>
    ${list.length ? list.map((l) => h`<a class="itemrow" href="#/letters/${l.id}" style="padding:22px">${tile('file-text', l.status === 'approved' ? 'green' : 'blue')}<div class="grow"><h4>${l.purpose}${l.purpose_detail ? ' — ' + l.purpose_detail : ''} ${badge(l.status)}</h4>
        <div class="small muted">To ${l.lecturer.name} · requested ${fmtDate(l.created_at)}${l.deadline ? ' · needed by ' + fmtDate(l.deadline) : ''}</div>${stepper(l.status)}</div>${icon('chevron-right')}</a>`)
      : h`<div class="card">${empty('file-text', 'No letter requests yet', 'Pick a lecturer, say what the letter is for, and choose which verified achievements are relevant. The lecturer only sees what you include.')}</div>`}`;
}
export async function letterDetail(id) {
  const l = await api(`/letters/${id}`);
  const isStudent = state.user.role === 'student';
  return h`<a class="link" href="#/letters">← All letters</a>
    <div class="pagehead mt-s"><div><div class="eyebrow">${l.purpose}</div><h1 class="page">Recommendation letter</h1><p class="lede">${l.purpose_detail || ''} To ${l.lecturer.name}</p></div>${badge(l.status)}</div>
    <div class="card">${stepper(l.status)}
      ${l.status === 'declined' ? h`<div class="callout red mt">${icon('circle-x')}<div><b>Declined:</b> ${l.decline_reason}</div></div>` : ''}
      ${l.status === 'revision_requested' ? h`<div class="callout purple mt">${icon('refresh-cw')}<div><b>You asked for a revision:</b> ${l.revision_note}</div></div>` : ''}
      ${['requested', 'drafting', 'revision_requested'].includes(l.status) && isStudent ? h`<div class="row mt noprint"><button class="btn" data-act="letter-remind" data-id="${l.id}">${icon('bell')} Remind lecturer</button><span class="small muted">The lecturer also gets automatic reminders.</span></div>` : ''}</div>
    ${l.status === 'approved' ? h`<div class="card mt"><div class="cardhead"><h2>Approved letter</h2><div class="row noprint"><button class="btn sm" data-act="letter-download" data-id="${l.id}">${icon('download')} Download</button><button class="btn sm" data-act="print">${icon('printer')} Print / PDF</button><button class="btn sm" data-act="letter-revise" data-id="${l.id}">${icon('refresh-cw')} Ask for revision</button></div></div>
      <div class="letter card tight" id="lettertext">${l.final_text}</div><p class="small muted mt-s">Approved by ${l.lecturer.name} on ${fmtDate(l.approved_at)}.</p></div>` : ''}
    <div class="grid g2 mt"><div class="card"><h2>Your request</h2><div class="kv" style="border:0"><span>Purpose</span><span>${l.purpose}</span></div><div class="kv"><span>Needed by</span><span>${l.deadline ? fmtDate(l.deadline) : '—'}</span></div>
      <div class="kv"><span>Verified items shared</span><span>${l.achievement_ids.length}</span></div><div class="kv"><span>Academic summary shared</span><span>${l.include_results ? 'Yes' : 'No'}</span></div>
      ${l.key_points ? h`<div class="divider"></div><b>Key points you gave</b><p style="white-space:pre-wrap;color:var(--ink-2);margin-top:6px">${l.key_points}</p>` : ''}</div>
      <div class="card"><h2>Progress</h2><ul class="tl">${l.history.map((x) => h`<li><b style="text-transform:capitalize">${x.action}</b><small>${x.actor_name} · ${fmtDateTime(x.at)}</small></li>`)}</ul></div></div>`;
}
export async function openLetterForm() {
  const [meta, items] = await Promise.all([api('/letters/meta'), api('/achievements')]);
  const verified = items.filter((i) => i.status === 'verified');
  openModal(h`<h2>Request a recommendation letter</h2><p class="sub">The lecturer sees only the items you tick — not your whole profile.</p>
    <form data-form="letter" novalidate>
      <div class="formgrid"><div class="field" data-field="lecturer_id"><label class="l" for="l-lec">Lecturer</label><select class="select" id="l-lec" name="lecturer_id"><option value="">Select…</option>${meta.lecturers.map((x) => h`<option value="${x.id}">${x.name}${x.title ? ' — ' + x.title : ''}</option>`)}</select></div>
        <div class="field" data-field="purpose"><label class="l" for="l-p">What is it for?</label><select class="select" id="l-p" name="purpose"><option value="">Select…</option>${meta.purposes.map((p) => h`<option>${p}</option>`)}</select></div></div>
      <div class="formgrid"><div class="field" data-field="purpose_detail"><label class="l" for="l-pd">Details <span class="muted">(optional)</span></label><input class="input" id="l-pd" name="purpose_detail" placeholder="e.g. MSc Artificial Intelligence, University of X"></div>
        <div class="field" data-field="deadline"><label class="l" for="l-d">Needed by <span class="muted">(optional)</span></label><input class="input" type="date" id="l-d" name="deadline" min="${new Date().toISOString().slice(0, 10)}"></div></div>
      <div class="field" data-field="key_points"><label class="l" for="l-k">Key points you would like mentioned</label><textarea class="textarea" id="l-k" name="key_points" placeholder="One per line. The lecturer remains the author and may adapt or leave these out."></textarea></div>
      <div class="field" data-field="achievement_ids"><span class="l">Verified items relevant to this letter</span>
        ${verified.length ? verified.map((i) => h`<label class="check" style="margin:6px 0"><input type="checkbox" name="ach" value="${i.id}" checked><span><b>${i.title}</b> <span class="muted small">${itemSubtitle(i)}</span></span></label>`) : h`<p class="muted small">You have no verified items yet. The lecturer will only see your academic summary.</p>`}</div>
      <label class="check"><input type="checkbox" name="include_results" checked> Include my GPA and credit summary</label>
      <div class="foot"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn red" type="submit">Send request</button></div></form>`);
}

/* ---------- sharing ---------- */
export async function sharing() {
  const [shares, log] = await Promise.all([api('/shares'), api('/access-log')]);
  const row = (s) => h`<div class="itemrow">${tile(s.kind === 'link' ? 'link' : 'user', s.status === 'active' ? 'green' : 'blue')}
    <div class="grow"><h4>${s.kind === 'link' ? s.label : `${s.recipient.name}`} ${badge(s.status)}</h4>
      <div class="small muted">${s.kind === 'lecturer' ? `${s.purpose} · ` : ''}${s.achievement_ids.length} item${s.achievement_ids.length === 1 ? '' : 's'}${s.include_results ? ' + academic summary' : ''} · ${s.status === 'active' ? `expires in ${Math.max(0, daysLeft(s.expires_at))} day(s)` : s.status === 'revoked' ? `cancelled ${fmtDate(s.revoked_at)}` : `expired ${fmtDate(s.expires_at)}`}${s.kind === 'link' ? ` · ${s.view_count} view${s.view_count === 1 ? '' : 's'}` : ''}</div></div>
    ${s.status === 'active' ? h`<div class="row gap-s noprint">${s.url ? h`<button class="btn sm" data-act="share-copy" data-url="${s.url}">${icon('copy')} Copy link</button>` : ''}<button class="btn sm ghost-red" data-act="share-revoke" data-id="${s.id}">Cancel access</button></div>` : ''}</div>`;
  return h`<div class="pagehead"><div><div class="eyebrow">Privacy</div><h1 class="page">Sharing &amp; privacy</h1><p class="lede">You decide what is shared, with whom, and for how long. Only verified items can be shared. Nobody has permanent access.</p></div></div>
    <div class="grid g2"><div class="card dark">${tile('link', 'red')}<h2 class="mt-s" style="color:#fff;margin-bottom:6px">Share a profile link</h2><p>Replace piles of documents with one link that expires and can be cancelled at any time.</p><button class="btn white mt" data-act="share-new" data-kind="link">Create a link</button></div>
      <div class="card">${tile('user', 'blue')}<h2 class="mt-s" style="margin-bottom:6px">Give a lecturer access</h2><p class="muted">For a stated purpose and time period, limited to the items you choose. The lecturer is told the purpose.</p><button class="btn red mt" data-act="share-new" data-kind="lecturer">Grant access</button></div></div>
    <div class="card mt"><h2>Your shares</h2>${shares.length ? shares.map(row) : empty('shield-check', 'Nothing shared', 'Your profile is private until you share it.')}</div>
    <div class="card mt"><div class="cardhead"><h2>Who has viewed your profile</h2></div>${log.length ? h`<ul class="tl">${log.map((x) => h`<li><b>${x.viewer_label}</b><small>${fmtDateTime(x.at)} · ${x.via === 'link' ? 'shared link' : x.via === 'lecturer' ? 'granted lecturer access' : 'administrator'}</small></li>`)}</ul>` : h`<p class="muted">No one has viewed your profile yet. You will be notified the moment someone does.</p>`}</div>`;
}
export async function openShareForm(kind) {
  const items = (await api('/achievements')).filter((i) => i.status === 'verified');
  const lecs = kind === 'lecturer' ? (await api('/letters/meta')).lecturers : [];
  openModal(h`<h2>${kind === 'link' ? 'Create a profile link' : 'Give a lecturer access'}</h2><p class="sub">Choose exactly what is visible. You can cancel at any time.</p>
    <form data-form="share" data-kind="${kind}" novalidate>
      ${kind === 'link' ? h`<div class="field" data-field="label"><label class="l" for="s-l">Who is this link for?</label><input class="input" id="s-l" name="label" placeholder="e.g. Admissions office, University of X"></div>`
        : h`<div class="formgrid"><div class="field" data-field="lecturer_id"><label class="l" for="s-lec">Lecturer</label><select class="select" id="s-lec" name="lecturer_id"><option value="">Select…</option>${lecs.map((x) => h`<option value="${x.id}">${x.name}</option>`)}</select></div>
          <div class="field" data-field="purpose"><label class="l" for="s-pu">Purpose</label><input class="input" id="s-pu" name="purpose" placeholder="e.g. Reference for MSc application"></div></div>`}
      <div class="field" data-field="days"><label class="l" for="s-d">Access lasts</label><select class="select" id="s-d" name="days"><option value="1">1 day</option><option value="7" selected>7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></div>
      <div class="field" data-field="achievement_ids"><span class="l">Verified items to include</span>
        ${items.length ? items.map((i) => h`<label class="check" style="margin:6px 0"><input type="checkbox" name="ach" value="${i.id}" checked><span><b>${i.title}</b> <span class="muted small">${itemSubtitle(i)}</span></span></label>`) : h`<p class="muted small">No verified items yet.</p>`}</div>
      <label class="check"><input type="checkbox" name="include_results" checked> Include GPA and credit summary</label>
      <label class="check mt-s"><input type="checkbox" name="include_skills" checked> Include my skills</label>
      <div class="foot"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn red" type="submit">${kind === 'link' ? 'Create link' : 'Grant access'}</button></div></form>`);
}

/* ---------- CV ---------- */
export async function cv() {
  const c = await api('/student/cv');
  const s = c.student, u = c.user;
  const by = (k) => c.items.filter((i) => i.kind === k);
  const sec = (t, items) => (items.length ? h`<h3>${t}</h3>${items.map((i) => h`<div class="it"><b>${i.title}${i.tier === 'major' ? ' ★' : ''}</b><span>${itemSubtitle(i)}</span><div style="font-size:14px">${i.description}</div></div>`)}` : '');
  return h`<div class="pagehead noprint"><div><div class="eyebrow">Generated from verified records</div><h1 class="page">Your CV</h1><p class="lede">Only verified items appear. Print it or save it as a PDF.</p></div><button class="btn red" data-act="print">${icon('printer')} Print / Save as PDF</button></div>
    <div class="cvpage"><h1>${s.name}</h1><div class="muted">${s.programme} · Africa University · ${s.student_id}</div><div class="small muted">${u.email}${u.phone ? ' · ' + u.phone : ''}</div>
      ${u.about ? h`<h3>Profile</h3><p>${u.about}</p>` : ''}
      ${c.academic ? h`<h3>Education</h3><div class="it"><b>${s.programme}, Africa University</b><span>Enrolled ${fmtMonth(s.enrolled)} · expected ${s.graduation}</span><div style="font-size:14px">Cumulative GPA ${c.academic.gpa.toFixed(2)} · ${c.academic.credits} credits earned</div></div>` : ''}
      ${sec('Achievements & awards', by('achievement'))}${sec('Leadership, activities & volunteering', by('activity'))}${sec('Projects & certifications', by('project'))}
      ${c.skills.length ? h`<h3>Skills</h3><p>${c.skills.map((k) => k.name).join(' · ')}</p>` : ''}
      <p class="small muted mt-l">Every item above was verified by Africa University staff. Generated ${fmtDate(c.generated_at)}.</p></div>`;
}

/* ---------- help ---------- */
export async function help() {
  const t = await api('/tickets');
  const labels = { complaint: 'Complaint / question', attachment_letter: 'Attachment letter', admission_letter: 'Admission letter', transcript: 'Official transcript', other: 'Other' };
  return h`<div class="pagehead"><div><div class="eyebrow">Help</div><h1 class="page">Help &amp; requests</h1><p class="lede">Contact the administrator or request official documents.</p></div></div>
    <div class="grid split"><div class="card"><h2>Your requests</h2>${t.length ? t.map((x) => h`<div class="itemrow">${tile('inbox', x.status === 'open' ? 'amber' : 'green')}<div class="grow"><h4>${x.subject} ${badge(x.status)}</h4><div class="small muted">${labels[x.type]} · ${fmtDate(x.created_at)}</div>
        ${x.response ? h`<div class="callout green">${icon('mail')}<div>${x.response}</div></div>` : ''}</div></div>`) : empty('inbox', 'No requests yet', 'Anything you send will appear here with the answer.')}</div>
      <div class="card"><h2>New request</h2><form data-form="ticket" novalidate>
        <div class="field" data-field="type"><label class="l" for="t-t">Type</label><select class="select" id="t-t" name="type">${Object.entries(labels).map(([k, v]) => h`<option value="${k}">${v}</option>`)}</select></div>
        <div class="field" data-field="subject"><label class="l" for="t-s">Subject</label><input class="input" id="t-s" name="subject"></div>
        <div class="field" data-field="message"><label class="l" for="t-m">Details</label><textarea class="textarea" id="t-m" name="message"></textarea></div>
        <button class="btn red block" type="submit">Send</button></form></div></div>`;
}

/* ---------- security ---------- */
export async function security() {
  const hist = await api('/security/history');
  const u = state.user;
  return h`<div class="pagehead"><div><div class="eyebrow">Account</div><h1 class="page">Security</h1><p class="lede">Two-step verification by email is always on. Review where your account was used.</p></div></div>
    <div class="grid g2"><div class="card"><h2>Change password</h2><form data-form="password" novalidate>
        <div class="field" data-field="current"><label class="l" for="pw1">Current password</label><input class="input" type="password" id="pw1" name="current" autocomplete="current-password"></div>
        <div class="field" data-field="password"><label class="l" for="pw2">New password</label><input class="input" type="password" id="pw2" name="password" autocomplete="new-password"><div class="hint">At least 8 characters, with letters and a number.</div></div>
        <button class="btn red" type="submit">Update password</button></form>
        <div class="divider"></div><h2 style="font-size:17px">Notifications</h2><label class="check"><input type="checkbox" id="emailpref" data-input="emailpref" ${u.email_notifications ? 'checked' : ''}> Also email me about status changes and profile views <span class="muted">(in-app notices are always on)</span></label></div>
      <div class="card"><h2>Sign-in history</h2><ul class="tl">${hist.map((x) => h`<li><b>${x.success ? 'Signed in' : 'Failed attempt'}</b> ${x.success ? '' : h`<span class="muted">(${x.reason})</span>`}<small>${fmtDateTime(x.at)} · ${x.ip || ''}</small></li>`)}</ul></div></div>`;
}

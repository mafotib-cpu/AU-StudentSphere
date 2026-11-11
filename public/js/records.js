import { h, raw, api, state, icon, badge, tierTag, tile, empty, toast, openModal, closeModal, confirmBox, promptBox, showErrors, formError, refresh,
  fmtMonth, fmtDate, fmtDateTime, kindIcon, itemSubtitle, fmtSize, loading } from './core.js';

export const KINDS = {
  achievement: { path: 'achievements', title: 'Achievements', lede: 'Awards, honors, and recognition earned throughout your studies.', issuer: 'Awarding body / issuer', role: null, ongoing: false, singular: 'achievement' },
  activity: { path: 'activities', title: 'Activities, clubs & volunteering', lede: 'Your contribution to Africa University life and the wider community.', issuer: 'Club / organisation', role: 'Your role (e.g. Vice President, Volunteer Tutor)', ongoing: true, singular: 'activity' },
  project: { path: 'projects', title: 'Projects & certifications', lede: 'Practical work and professional credentials that demonstrate your skills.', issuer: 'Organisation / issuer', role: 'Type (e.g. Team project, Certification)', ongoing: false, singular: 'project or certificate' },
};
const ui = { filter: { achievement: 'all', activity: 'all', project: 'all' } };
const SUGGEST = { 'Academic award': 'records_office', "Dean's List": 'records_office', 'Scholarship / bursary': 'records_office', 'Conference / seminar': 'lecturer', Certification: 'lecturer',
  Project: 'lecturer', 'Technical / professional': 'supervisor', 'Club / society': 'department_head', Sports: 'department_head', 'Debate & public speaking': 'department_head',
  Leadership: 'department_head', Volunteering: 'department_head', Entrepreneurship: 'lecturer' };
let verifiers = null;

/* ---------- list ---------- */
export function recordRow(i, { student = true } = {}) {
  const [ic, col] = kindIcon(i);
  const needs = ['rejected', 'clarification', 'flagged'].includes(i.status);
  const note = i.review_note;
  return h`<article class="rec" id="rec-${i.id}">
    ${tile(ic, col)}
    <div class="body">
      <h3>${i.title} ${badge(i.status)} ${i.status === 'verified' ? tierTag(i.tier) : ''}
        ${i.change_pending ? h`<span class="badge b-flagged">Change awaiting approval</span>` : ''}${i.deletion_requested ? h`<span class="badge b-neutral">Deletion requested</span>` : ''}</h3>
      <div class="meta">${itemSubtitle(i)}</div>
      <p class="desc">${i.description}</p>
      <div class="row wrap gap-s mt-s">${i.categories.map((c) => h`<span class="tag" style="padding:3px 10px;font-size:12.5px">${c}</span>`)}</div>
      ${i.evidence ? h`<div class="evi">${icon('file-text')}<a href="/api/achievements/${i.id}/evidence" target="_blank" rel="noopener">${i.evidence.name}</a><span class="muted">${fmtSize(i.evidence.size)}</span></div>`
        : i.no_evidence_reason ? h`<div class="callout amber">${icon('triangle-alert')}<div><b>No evidence yet.</b> ${i.no_evidence_reason}. It stays unverified until evidence is provided.</div></div>` : ''}
      ${i.status === 'verified' ? h`<div class="small muted mt-s">${icon('badge-check')} Verified by ${i.reviewed_by_name || 'staff'} on ${fmtDate(i.reviewed_at)}</div>` : ''}
      ${i.status === 'pending' ? h`<div class="small muted mt-s">${icon('clock')} Waiting for ${i.verifier_name || state.meta.verifier_types[i.verifier_type] || 'a verifier'} · submitted ${fmtDate(i.created_at)}</div>` : ''}
      ${needs && note ? h`<div class="callout ${i.status === 'rejected' ? 'red' : i.status === 'flagged' ? 'purple' : 'blue'}">${icon(i.status === 'rejected' ? 'circle-x' : i.status === 'flagged' ? 'flag' : 'circle-help')}
        <div><b>${i.status === 'rejected' ? 'Rejected' : i.status === 'flagged' ? 'Flagged for review' : 'More information needed'} by ${i.reviewed_by_name || 'a verifier'}:</b> ${note}
        <div class="row gap-s mt-s">${i.status === 'flagged' ? h`<button class="btn sm" data-act="rec-explain" data-id="${i.id}">Explain this entry</button>` : ''}<button class="btn sm" data-act="rec-edit" data-id="${i.id}" data-kind="${i.kind}">${icon('pencil')} Edit &amp; resubmit</button></div></div></div>` : ''}
    </div>
    ${student ? h`<div class="acts">
      <button class="iconbtn" style="width:40px;height:40px" title="History" aria-label="View history" data-act="rec-history" data-id="${i.id}">${icon('history')}</button>
      <button class="iconbtn" style="width:40px;height:40px" title="${i.status === 'verified' ? 'Request a change' : 'Edit'}" aria-label="Edit" data-act="rec-edit" data-id="${i.id}" data-kind="${i.kind}" ${i.change_pending || i.deletion_requested ? 'disabled' : ''}>${icon('pencil')}</button>
      <button class="iconbtn" style="width:40px;height:40px" title="${i.status === 'verified' ? 'Request deletion' : 'Delete'}" aria-label="Delete" data-act="rec-del" data-id="${i.id}" data-status="${i.status}" ${i.deletion_requested ? 'disabled' : ''}>${icon('trash-2')}</button>
    </div>` : ''}
  </article>`;
}

export async function recordsPage(kind) {
  const K = KINDS[kind];
  const items = await api(`/achievements?kind=${kind}`);
  const f = ui.filter[kind];
  const shown = items.filter((i) => f === 'all' ? true : f === 'verified' ? i.status === 'verified' : f === 'pending' ? i.status === 'pending' : ['rejected', 'clarification', 'flagged'].includes(i.status));
  const attn = items.filter((i) => ['rejected', 'clarification', 'flagged'].includes(i.status)).length;
  const tab = (k, label, n) => h`<button class="pillbtn ${f === k ? 'on' : ''}" data-act="rec-filter" data-kind="${kind}" data-f="${k}">${label}${n ? h` (${n})` : ''}</button>`;
  return h`<div class="pagehead"><div><div class="eyebrow">My record</div><h1 class="page">${K.title}</h1><p class="lede">${K.lede}</p></div>
      <button class="btn red" data-act="rec-add" data-kind="${kind}">${icon('plus')} Add new</button></div>
    <div class="tabs" role="tablist">${tab('all', 'All records')}${tab('verified', 'Verified')}${tab('pending', 'Pending')}${attn ? tab('attn', 'Needs attention', attn) : ''}</div>
    ${shown.length ? shown.map((i) => recordRow(i)) : empty(KINDS[kind].path === 'achievements' ? 'award' : kind === 'activity' ? 'users' : 'folder', items.length ? 'Nothing here yet' : `No ${K.singular}s logged yet`, items.length ? 'Try another filter.' : `Use “Add new” to log your first ${K.singular}. Add the evidence and send it for verification.`)}
    <p class="small muted mt">Only verified items count on your profile and can be shared. Disciplinary or conduct records are not achievements and cannot be logged.</p>`;
}

/* ---------- form ---------- */
const factor = (name, label, opts, val) => h`<div class="field" data-field="${name}"><label class="l" for="f-${name}">${label}</label>
  <select class="select" id="f-${name}" name="${name}" data-input="rec-tier"><option value="">Select…</option>${opts.map((o, i) => (i ? h`<option value="${i}" ${String(val) === String(i) ? 'selected' : ''}>${o}</option>` : ''))}</select></div>`;

export async function openRecordForm(kind, existing = null, prefill = null, staffFor = null) {
  const K = KINDS[kind];
  const m = state.meta;
  if (!verifiers) { try { verifiers = await api('/verifiers'); } catch { verifiers = []; } }
  const e = existing || prefill || {};
  const verified = existing && existing.status === 'verified';
  const cats = e.categories || [];
  const wrap = openModal(h`<h2>${existing ? (verified ? 'Request a change' : `Edit ${K.singular}`) : staffFor ? `Add ${K.singular} for ${staffFor.name}` : `Add ${K.singular}`}</h2>
    <p class="sub">${verified ? 'This item is verified. Your changes will be reviewed before they replace the verified version.' : 'Items are sent to a verifier and only count once verified.'}</p>
    <form data-form="record" data-kind="${kind}" data-id="${existing ? existing.id : ''}" data-staff-for="${staffFor ? staffFor.id : ''}" novalidate enctype="multipart/form-data">
      <div class="formgrid">
        <div class="field" data-field="title" style="grid-column:1/-1"><label class="l" for="f-title">Title</label><input class="input" id="f-title" name="title" maxlength="120" value="${e.title || ''}" placeholder="${kind === 'activity' ? 'e.g. Computing Society' : kind === 'project' ? 'e.g. Campus Navigation Assistant' : 'e.g. 1st Place, National Data Challenge'}"></div>
        <div class="field" data-field="issuer"><label class="l" for="f-issuer">${K.issuer}</label><input class="input" id="f-issuer" name="issuer" value="${e.issuer || ''}"></div>
        ${K.role ? h`<div class="field" data-field="role_text"><label class="l" for="f-role">${K.role}</label><input class="input" id="f-role" name="role_text" value="${e.role_text || ''}"></div>` : ''}
        <div class="field" data-field="date"><label class="l" for="f-date">${K.ongoing ? 'Start date' : 'Date'}</label><input class="input" type="month" id="f-date" name="date" value="${(e.date || '').slice(0, 7)}" max="${new Date().toISOString().slice(0, 7)}">
          ${K.ongoing ? h`<label class="check mt-s"><input type="checkbox" name="ongoing" value="1" ${e.ongoing ? 'checked' : ''}> I still do this (ongoing)</label>` : ''}
          <div class="hint">Historical items are welcome — use the real date. Anything before you enrolled goes under “Pre-university”.</div></div>
      </div>
      <div class="field" data-field="categories"><span class="l">Categories <span class="muted">(choose one or more)</span></span>
        <div class="chips" data-input="rec-cats">${m.categories.map((c) => h`<label><input type="checkbox" name="cat" value="${c}" ${cats.includes(c) ? 'checked' : ''}><span>${c}</span></label>`)}</div></div>
      <div class="field" data-field="description"><label class="l" for="f-desc">What did you do or achieve?</label><textarea class="textarea" id="f-desc" name="description" maxlength="1000" placeholder="Describe your contribution and the outcome (at least 20 characters). Please leave out ID numbers and medical or other sensitive details.">${e.description || ''}</textarea></div>
      <div class="card tight" style="background:#fafafa;box-shadow:none;margin-bottom:18px"><div class="row sp wrap"><b>How significant was it?</b><span id="tierprev" class="small muted"></span></div>
        <p class="small muted" style="margin:4px 0 12px">Used for reporting only. Your verifier can adjust it, and lecturers still judge the real achievement.</p>
        <div class="formgrid">${factor('level', 'Level of recognition', m.levels, e.level)}${factor('result', 'Competitiveness / result', m.results, e.result)}${factor('responsibility', 'Responsibility', m.responsibility, e.responsibility)}${factor('duration', 'Duration & commitment', m.duration, e.duration)}</div></div>
      <div class="formgrid">
        <div class="field" data-field="verifier_type"><label class="l" for="f-vt">Who should verify this?</label><select class="select" id="f-vt" name="verifier_type" data-input="rec-vt"><option value="">Select…</option>${Object.entries(m.verifier_types).map(([k, v]) => h`<option value="${k}" ${e.verifier_type === k ? 'selected' : ''}>${v}</option>`)}</select></div>
        <div class="field" data-field="verifier_id"><label class="l" for="f-vid">Specific person <span class="muted">(optional)</span></label><select class="select" id="f-vid" name="verifier_id"><option value="">Anyone of that type</option></select></div>
      </div>
      <div class="field" data-field="evidence"><label class="l" for="f-ev">Evidence <span id="evreq" class="muted"></span></label>
        <input class="input" type="file" id="f-ev" name="evidence" accept=".pdf,.png,.jpg,.jpeg,.docx">
        ${existing && existing.evidence ? h`<div class="hint">Current file: ${existing.evidence.name}. Choose a new file only to replace it.</div>` : ''}
        <div class="hint">PDF, PNG, JPG or DOCX, up to ${m.max_upload_mb} MB — for example a scanned certificate or a photo.</div>
        <div id="noev" hidden class="mt-s"><label class="l" for="f-noev">Why is evidence not available yet?</label><textarea class="textarea" id="f-noev" name="no_evidence_reason" style="min-height:64px" placeholder="e.g. The certificate is being reissued">${e.no_evidence_reason || ''}</textarea><div class="hint">Without evidence the item stays pending until evidence is provided.</div></div></div>
      ${existing && ['rejected', 'clarification', 'flagged'].includes(existing.status) ? h`<div class="field"><label class="l" for="f-sn">Note to the verifier <span class="muted">(optional)</span></label><textarea class="textarea" id="f-sn" name="student_note" style="min-height:64px" placeholder="What did you change or clarify?"></textarea></div>` : ''}
      <div id="dupe" hidden></div>
      <div class="foot"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn red" type="submit">${existing ? (verified ? 'Send change for approval' : 'Save changes') : 'Submit for verification'}</button></div>
    </form>`);
  const form = wrap.querySelector('form');
  const syncVerifierList = () => {
    const t = form.elements.verifier_type.value;
    const sel = form.elements.verifier_id; const cur = e.verifier_id ? String(e.verifier_id) : '';
    sel.innerHTML = '<option value="">Anyone of that type</option>' + verifiers.filter((v) => !t || v.verifier_type === t).map((v) => `<option value="${v.id}" ${String(v.id) === cur ? 'selected' : ''}>${v.name.replace(/[<>&"]/g, '')}</option>`).join('');
  };
  form.dataset.vtTouched = existing ? '1' : '';
  syncVerifierList(); syncTier(form); syncEvidence(form);
  return form;
}
export function suggestVerifier(form) {
  if (form.dataset.vtTouched) return;
  const picked = [...form.querySelectorAll('input[name=cat]:checked')].map((c) => c.value);
  const s = picked.map((c) => SUGGEST[c]).find(Boolean);
  if (s) { form.elements.verifier_type.value = s; }
}
export function syncTier(form) {
  const v = (n) => Number(form.elements[n].value) || 0;
  const el = form.querySelector('#tierprev');
  if (!el) return;
  if (!(v('level') && v('result') && v('responsibility') && v('duration'))) { el.textContent = 'Fill in all four to see the suggested tier'; return; }
  const s = v('level') + v('result') + v('responsibility') + v('duration');
  el.textContent = `Suggested tier: ${s >= 10 ? 'Major' : s >= 7 ? 'Moderate' : 'Minor'}`;
}
export function syncEvidence(form) {
  const picked = [...form.querySelectorAll('input[name=cat]:checked')].map((c) => c.value);
  const need = picked.some((c) => state.meta.evidence_required.includes(c));
  const hasFile = form.elements.evidence.files && form.elements.evidence.files.length;
  const hasOld = !!form.querySelector('.hint')?.textContent.includes('Current file');
  form.querySelector('#evreq').textContent = need ? '(required for this type of achievement)' : '(recommended where available)';
  form.querySelector('#noev').hidden = !(need && !hasFile && !hasOld);
}
export function syncVerifierList(form) {
  const t = form.elements.verifier_type.value;
  const sel = form.elements.verifier_id;
  sel.innerHTML = '<option value="">Anyone of that type</option>' + (verifiers || []).filter((v) => !t || v.verifier_type === t).map((v) => `<option value="${v.id}">${String(v.name).replace(/[<>&"]/g, '')}</option>`).join('');
}

export async function submitRecord(form, { confirmDuplicate = false } = {}) {
  const fd = new FormData();
  fd.append('kind', form.dataset.kind);
  for (const n of ['title', 'issuer', 'role_text', 'date', 'description', 'level', 'result', 'responsibility', 'duration', 'verifier_type', 'verifier_id', 'no_evidence_reason', 'student_note']) {
    if (form.elements[n]) fd.append(n, form.elements[n].value);
  }
  fd.append('ongoing', form.elements.ongoing && form.elements.ongoing.checked ? '1' : '0');
  fd.append('categories', JSON.stringify([...form.querySelectorAll('input[name=cat]:checked')].map((c) => c.value)));
  const evf = form.elements.evidence; if (evf.files[0]) fd.append('evidence', evf.files[0]);
  if (confirmDuplicate) fd.append('confirm_duplicate', '1');
  const id = form.dataset.id, staffFor = form.dataset.staffFor;
  const btn = form.querySelector('[type=submit]');
  btn.disabled = true;
  try {
    const url = id ? `/achievements/${id}` : staffFor ? `/staff/students/${staffFor}/achievements` : '/achievements';
    const res = await api(url, { method: id ? 'PUT' : 'POST', form: fd });
    closeModal();
    toast(id ? (res.change_pending ? 'Change sent for approval. The verified version stays live until then.' : 'Changes saved.') : 'Submitted for verification. You will be notified at each step.');
    refresh();
  } catch (err) {
    if (err.data && err.data.duplicate) {
      const d = form.querySelector('#dupe'); d.hidden = false;
      d.innerHTML = h`<div class="callout amber">${icon('triangle-alert')}<div><b>This looks like something you already logged:</b><ul style="margin:6px 0 10px 18px;padding:0">${err.data.matches.map((x) => h`<li>${x.title} (${fmtMonth(x.date)}) — ${x.status}</li>`)}</ul>
        <button type="button" class="btn sm" data-act="rec-dupe-ok">Save anyway — it is a different entry</button></div></div>`.s;
      d.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else {
      const shown = showErrors(form, err.fields);
      if (!shown) formError(form, err.message); else formError(form, 'Please complete the highlighted fields before submitting.');
    }
  } finally { btn.disabled = false; }
}

export async function showHistory(id) {
  openModal(loading());
  try {
    const hist = await api(`/achievements/${id}/history`);
    openModal(h`<h2>History</h2><p class="sub">Every change is kept in an audit trail.</p>
      <ul class="tl">${hist.map((x) => h`<li><b style="text-transform:capitalize">${x.action}</b> — ${x.actor_name}<small>${fmtDateTime(x.at)}${x.detail ? ' · ' + x.detail : ''}</small></li>`)}</ul>
      <div class="foot"><button class="btn" data-act="close-modal">Close</button></div>`, { narrow: true });
  } catch (e) { closeModal(); toast(e.message, 'err'); }
}

/* ---------- actions ---------- */
export const recordActions = {
  'rec-filter': (el) => { ui.filter[el.dataset.kind] = el.dataset.f; refresh(); },
  'rec-add': (el) => openRecordForm(el.dataset.kind),
  'rec-edit': async (el) => { const it = await api(`/achievements/${el.dataset.id}`); openRecordForm(it.kind, it); },
  'rec-history': (el) => showHistory(el.dataset.id),
  'rec-del': async (el) => {
    const verified = el.dataset.status === 'verified';
    const ok = await confirmBox(verified ? 'Request deletion?' : 'Delete this item?', verified ? 'This item is verified, so deleting it needs staff approval. It stays on your profile until then.' : 'It will be removed from your profile. A record of the deletion is kept in the audit trail.', verified ? 'Request deletion' : 'Delete', true);
    if (!ok) return;
    try { const r = await api(`/achievements/${el.dataset.id}`, { method: 'DELETE' }); toast(r.requested ? 'Deletion request sent for approval.' : 'Deleted.'); refresh(); } catch (e) { toast(e.message, 'err'); }
  },
  'rec-explain': async (el) => {
    const msg = await promptBox('Explain this entry', 'Your explanation', { okLabel: 'Send explanation', sub: 'The verifier will read this before making any decision.', placeholder: 'e.g. This is a different course from the earlier certificate…' });
    if (!msg) return;
    try { await api(`/achievements/${el.dataset.id}/respond`, { method: 'POST', body: { message: msg } }); toast('Explanation sent. The item is back in the queue.'); refresh(); } catch (e) { toast(e.message, 'err'); }
  },
  'rec-dupe-ok': () => { const f = document.querySelector('#modal form'); if (f) submitRecord(f, { confirmDuplicate: true }); },
};

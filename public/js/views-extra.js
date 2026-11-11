import { h, api, state, icon, tile, empty, badge, fmtDate, fmtDateTime, ago, openModal, avatar } from './core.js';

const lnk = (href, label) => h`<a href="#${href}">${label}</a>`;
const pill = (t, c = 'grey') => h`<span class="due ${c}">${t}</span>`;

/* ================= PREMIUM ================= */
const PERKS = [
  ['Share links', '2 active links', 'Unlimited active links'],
  ['Applications to opportunities', '3 every 30 days', 'Unlimited'],
  ['Resource library', 'Free guides', 'Free + all Premium guides'],
];
export async function premium() {
  const d = await api('/premium');V
  const on = d.premium;
  let action;
  if (on) {
    action = h`<div class="callout green">${icon('circle-check')}<div><b>Premium is active</b><div class="small">${d.cancelled ? `Ends on ${fmtDate(d.period_end)}. It will not renew.` : `Paid until ${fmtDate(d.period_end)}.`}</div></div></div>
      <div class="row wrap mt" style="gap:10px">${d.cancelled ? '' : h`<button class="btn" data-act="premium-cancel">Cancel renewal</button>`}<button class="btn red" data-act="premium-subscribe">${d.mode === 'demo' ? 'Add another month' : 'Pay for another month'}</button></div>`;
  } else if (d.mode === 'manual') {
    action = d.pending ? h`<div class="callout amber">${icon('clock')}<div><b>Waiting for confirmation</b><div class="small">Payment reference ${d.pending.reference} was sent on ${fmtDate(d.pending.at)}. Premium starts when an administrator confirms it.</div></div></div>`
      : h`<form data-form="premium-manual" novalidate><p class="small muted">Pay ${d.price}. ${d.instructions} Enter the reference below. An administrator confirms it and Premium starts.</p>
        <div class="field mt-s" data-field="reference"><label class="l" for="p-r">Payment reference</label><input class="input" id="p-r" name="reference" maxlength="60" placeholder="e.g. receipt or transaction number"></div>
        <button class="btn red block" type="submit">Submit payment for confirmation</button></form>`;
  } else {
    action = h`<button class="btn red block" data-act="premium-subscribe">${icon('star')} Get Premium for ${d.price}/month</button>
      <p class="small muted mt-s">Demonstration: no payment is taken.</p>`;
  }
  return h`<div class="pagehead"><div><div class="eyebrow">Plans</div><h1 class="page">AU StudentSphere Premium</h1><p class="lede">More room to share and apply, plus the full resource library. ${d.price} per month, cancel any time.</p></div></div>
    <div class="grid split"><div class="card"><h2>Free vs Premium</h2>
      <table class="t"><thead><tr><th></th><th>Free</th><th>Premium · ${d.price}/mo</th></tr></thead><tbody>${PERKS.map(([a, b, c]) => h`<tr><td><b>${a}</b></td><td>${b}</td><td>${c}</td></tr>`)}</tbody></table>
      <div class="divider"></div><h2 style="font-size:17px">Your usage</h2>
      <p class="small muted">Active share links: <b>${d.usage.activeLinks}</b>${on ? '' : ` of ${d.limits.activeLinks}`} · Applications in the last 30 days: <b>${d.usage.applications}</b>${on ? '' : ` of ${d.limits.applicationsPer30Days}`}</p></div>
      <div class="card"><div class="row" style="gap:14px;margin-bottom:16px">${tile('star', 'amber')}<div><div class="b" style="font-size:28px;line-height:1">${d.price}</div><div class="small muted">per month</div></div></div>${action}
        ${d.payments.length ? h`<div class="divider"></div><h2 style="font-size:17px">Payments</h2>${d.payments.map((p) => h`<div class="small" style="display:flex;justify-content:space-between;padding:4px 0"><span>${fmtDate(p.at)} · ${p.provider}</span><span>$${(p.amount_cents / 100).toFixed(2)} · ${p.status}</span></div>`)}` : ''}</div></div>`;
}

/* ================= RESOURCE LIBRARY ================= */
export const libState = { category: '' };
let libItems = [];
export const findResource = (id) => libItems.find((r) => String(r.id) === String(id));
let libCats = [];
export async function library() {
  const d = await api('/resources' + (libState.category ? `?category=${encodeURIComponent(libState.category)}` : ''));
  libItems = d.items; libCats = d.categories;
  const student = state.user.role === 'student';
  const card = (r) => h`<div class="card"><div class="row" style="align-items:flex-start;gap:16px">${tile(r.locked ? 'lock' : 'book-open', r.premium ? 'amber' : 'blue')}
    <div class="grow" style="min-width:0"><div class="row wrap" style="gap:8px"><h3 style="font-size:17px">${r.title}</h3><span class="badge b-clarification">${r.category}</span>${r.premium ? h`<span class="badge b-pending">${icon('star')}Premium</span>` : ''}</div>
      <p style="margin-top:8px;color:var(--ink-2)">${r.description}</p>
      <div class="row wrap" style="gap:10px;margin-top:12px">${r.locked ? h`<a class="btn red" href="#/premium">${icon('star')} Unlock with Premium</a>` : h`${r.body ? h`<button class="btn" data-act="res-open" data-id="${r.id}">${icon('book-open')} Read guide</button>` : ''}${r.link ? h`<a class="btn" href="${r.link}" target="_blank" rel="noopener noreferrer">${icon('external-link')} Open link</a>` : ''}`}${r.can_remove ? h`<button class="btn" data-act="res-remove" data-id="${r.id}" data-title="${r.title}">${icon('trash-2')} Remove</button>` : ''}</div></div></div></div>`;
  return h`<div class="pagehead"><div><div class="eyebrow">Resources</div><h1 class="page">Resource library</h1><p class="lede">${student ? 'Guides for CVs, interviews, funding and study. Premium guides are marked with a star.' : 'Add guides and links for students. Mark a resource Premium to reserve it for Premium students.'}</p></div>
      ${d.canPost ? h`<button class="btn red" data-act="res-new">${icon('plus')} Add resource</button>` : ''}</div>
    <div class="chips"><button class="chip ${libState.category === '' ? 'on' : ''}" data-act="res-filter" data-cat="">All</button>${d.categories.map((c) => h`<button class="chip ${libState.category === c ? 'on' : ''}" data-act="res-filter" data-cat="${c}">${c}</button>`)}</div>
    <div class="stack mt">${d.items.length ? d.items.map(card) : h`<div class="card">${empty('book-open', 'Nothing here yet', 'Resources will appear here as staff add them.')}</div>`}</div>`;
}
export function openResource(r) {
  openModal(h`<h2>${r.title}</h2><p class="sub">${r.category}${r.premium ? ' · Premium' : ''}</p><div style="white-space:pre-line;color:var(--ink-2)">${r.body}</div><div class="foot"><button class="btn" data-act="close-modal">Close</button></div>`);
}
export function openResourceForm() {
  openModal(h`<h2>Add a resource</h2><p class="sub">Write the guide here, link to one, or both.</p><form data-form="res-new" novalidate>
    <div class="field" data-field="title"><label class="l" for="r-t">Title</label><input class="input" id="r-t" name="title" maxlength="120"></div>
    <div class="field" data-field="category"><label class="l" for="r-c">Category</label><select class="select" id="r-c" name="category">${libCats.map((c) => h`<option>${c}</option>`)}</select></div>
    <div class="field" data-field="description"><label class="l" for="r-d">Short description</label><textarea class="textarea" id="r-d" name="description" maxlength="400"></textarea></div>
    <div class="field" data-field="body"><label class="l" for="r-b">Guide text <span class="muted">(optional if you add a link)</span></label><textarea class="textarea" id="r-b" name="body" maxlength="6000" style="min-height:140px"></textarea></div>
    <div class="field" data-field="link"><label class="l" for="r-l">Link <span class="muted">(optional)</span></label><input class="input" id="r-l" name="link" inputmode="url" placeholder="https://…"></div>
    <label class="check"><input type="checkbox" name="premium"> Premium only</label>
    <div class="foot"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn red" type="submit">Add resource</button></div></form>`);
}

/* ================= MESSAGES ================= */
export async function messages() {
  const list = await api('/messages');
  const student = state.user.role === 'student';
  return h`<div class="pagehead"><div><div class="eyebrow">Messages</div><h1 class="page">Messages</h1><p class="lede">${student ? 'Ask a lecturer or verifier a question. They reply here and you get a notification.' : 'Students write to you here. Reply from the conversation.'}</p></div>
      ${student ? h`<button class="btn red" data-act="msg-new">${icon('plus')} New message</button>` : ''}</div>
    <div class="card">${list.length ? list.map((t) => h`<a class="itemrow" href="#/messages/${t.id}">${avatar(t.with)}<div class="grow"><h4>${t.subject} ${t.unread ? h`<span class="badge b-pending">${t.unread} new</span>` : ''}</h4><div class="small muted">${t.with}${t.with_title ? ' · ' + t.with_title : ''} · ${t.preview ? t.preview.slice(0, 80) : ''}</div></div><span class="small muted">${ago(t.last_at)}</span></a>`)
      : empty('message-square', 'No conversations yet', student ? 'Use “New message” to ask a lecturer or verifier something.' : 'When a student writes to you it will show up here.')}</div>`;
}
export async function thread(id) {
  const t = await api(`/messages/${id}`);
  return h`<div class="pagehead"><div><div class="eyebrow">${lnk('/messages', 'Messages')}</div><h1 class="page">${t.subject}</h1><p class="lede">With ${t.with}${t.with_title ? ' · ' + t.with_title : ''}</p></div></div>
    <div class="card"><div class="stack">${t.messages.map((m) => h`<div style="display:flex;justify-content:${m.mine ? 'flex-end' : 'flex-start'}"><div style="max-width:78%;background:${m.mine ? 'var(--red-soft)' : '#f4f4f4'};border-radius:16px;padding:12px 16px"><div style="white-space:pre-line">${m.body}</div><div class="small muted" style="margin-top:4px">${m.mine ? 'You' : t.with} · ${fmtDateTime(m.at)}</div></div></div>`)}</div>
      <form data-form="msg-reply" data-id="${t.id}" class="mt" novalidate><div class="field" data-field="body"><label class="l" for="m-b">Reply</label><textarea class="textarea" id="m-b" name="body" maxlength="2000"></textarea></div><button class="btn red" type="submit">${icon('send')} Send</button></form></div>`;
}
export async function openMessageForm() {
  const people = await api('/messages/recipients');
  openModal(h`<h2>New message</h2><p class="sub">Only the person you choose can read it.</p><form data-form="msg-new" novalidate>
    <div class="field" data-field="staff_id"><label class="l" for="n-s">To</label><select class="select" id="n-s" name="staff_id">${people.map((p) => h`<option value="${p.id}">${p.name}${p.title ? ' — ' + p.title : ''}</option>`)}</select></div>
    <div class="field" data-field="subject"><label class="l" for="n-j">Subject</label><input class="input" id="n-j" name="subject" maxlength="100"></div>
    <div class="field" data-field="body"><label class="l" for="n-b">Message</label><textarea class="textarea" id="n-b" name="body" maxlength="2000"></textarea></div>
    <div class="foot"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn red" type="submit">Send</button></div></form>`);
}

/* ================= APPLICATIONS ================= */
const APP_BADGE = { submitted: 'pending', shortlisted: 'clarification', accepted: 'approved', declined: 'rejected' };
export async function myApplications() {
  const list = await api('/applications/mine');
  const d = await api('/premium');
  return h`<div class="pagehead"><div><div class="eyebrow">Opportunities</div><h1 class="page">My applications</h1><p class="lede">Track every application you made through the board. ${d.premium ? 'Premium: unlimited applications.' : `Free plan: ${d.usage.applications} of ${d.limits.applicationsPer30Days} used in the last 30 days. ${'Premium removes the limit.'}`}</p></div>${lnk('/opportunities', h`<span class="btn">${icon('briefcase')} Browse opportunities</span>`)}</div>
    <div class="card">${list.length ? list.map((a) => h`<div class="itemrow">${tile('briefcase', 'blue', true)}<div class="grow"><h4>${a.title} ${badge(APP_BADGE[a.status])}</h4><div class="small muted">${a.kind}${a.organisation ? ' · ' + a.organisation : ''} · applied ${fmtDate(a.created_at)}${a.staff_note ? ' · “' + a.staff_note + '”' : ''}</div></div>${a.status === 'submitted' ? h`<button class="btn sm" data-act="app-withdraw" data-id="${a.id}" data-title="${a.title}">Withdraw</button>` : ''}</div>`)
      : empty('briefcase', 'No applications yet', 'Use “Apply here” on any opportunity.')}</div>`;
}
export function openApplyForm(id, title) {
  openModal(h`<h2>Apply: ${title}</h2><p class="sub">The person who posted this will see your name, programme and note. Your verified records are only shared if you share them separately.</p>
    <form data-form="opp-apply" data-id="${id}" novalidate><div class="field" data-field="note"><label class="l" for="a-n">Short note <span class="muted">(optional)</span></label><textarea class="textarea" id="a-n" name="note" maxlength="600" placeholder="Why you are a good fit"></textarea></div>
    <div class="foot"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn red" type="submit">Submit application</button></div></form>`, { narrow: true });
}
export async function applicants(id) {
  const d = await api(`/opportunities/${id}/applicants`);
  return h`<div class="pagehead"><div><div class="eyebrow">${lnk('/opportunities', 'Opportunities')}</div><h1 class="page">Applicants</h1><p class="lede">${d.opportunity.title} · ${d.items.length} applicant${d.items.length === 1 ? '' : 's'}</p></div></div>
    <div class="card">${d.items.length ? d.items.map((a) => h`<div class="itemrow" style="align-items:flex-start">${avatar(a.name)}<div class="grow"><h4>${a.name} ${badge(APP_BADGE[a.status])}</h4><div class="small muted">${a.programme || ''} · ${a.reg || ''} · applied ${fmtDate(a.created_at)}</div>${a.note ? h`<p style="margin-top:6px;white-space:pre-line">${a.note}</p>` : ''}
      <form data-form="app-status" data-id="${a.id}" class="row wrap" style="gap:8px;margin-top:10px"><select class="select" name="status" aria-label="Status" style="max-width:170px">${d.statuses.map((s) => h`<option ${s === a.status ? 'selected' : ''}>${s}</option>`)}</select><input class="input" name="note" placeholder="Note to student (optional)" value="${a.staff_note || ''}" maxlength="400" style="flex:1;min-width:160px"><button class="btn sm" type="submit">Save</button></form></div></div>`)
      : empty('users', 'No applicants yet', 'Students who apply from the board will appear here.')}</div>`;
}

/* ================= ADMIN: SUBSCRIPTIONS ================= */
export async function subscriptions() {
  const d = await api('/admin/subscriptions');
  return h`<div class="pagehead"><div><div class="eyebrow">Insight</div><h1 class="page">Premium subscriptions</h1><p class="lede">Plan price ${d.price}/month · payment mode: <b>${d.mode}</b>${d.mode === 'demo' ? ' (instant activation, no money moves)' : ' (administrator confirms each payment)'}.</p></div></div>
    <div class="grid g3"><div class="card stat"><div><small>Active subscribers</small><div class="n">${d.active.length}</div></div></div><div class="card stat"><div><small>Confirmed revenue</small><div class="n">${d.revenue}</div></div></div><div class="card stat"><div><small>Demo payments</small><div class="n">${d.demo_total}</div><div class="s">not real money</div></div></div></div>
    <div class="card mt"><h2>Payments waiting for confirmation</h2>${d.pending.length ? d.pending.map((p) => h`<div class="itemrow">${tile('clock', 'amber', true)}<div class="grow"><h4>${p.name}</h4><div class="small muted">${p.email} · reference ${p.reference} · ${fmtDateTime(p.at)}</div></div><button class="btn sm" data-act="pay-reject" data-id="${p.id}">Reject</button><button class="btn red sm" data-act="pay-confirm" data-id="${p.id}">Confirm</button></div>`) : empty('circle-check', 'Nothing waiting', 'Manual payments appear here.')}</div>
    <div class="card mt"><h2>Active Premium students</h2>${d.active.length ? d.active.map((s) => h`<div class="itemrow">${avatar(s.name)}<div class="grow"><h4>${s.name}</h4><div class="small muted">${s.email}</div></div>${pill(s.cancel_at_period_end ? 'Ends ' + fmtDate(s.current_period_end) : 'Renews ' + fmtDate(s.current_period_end), s.cancel_at_period_end ? 'amber' : 'blue')}</div>`) : empty('star', 'No subscribers yet', 'Students can subscribe from the Premium page.')}</div>`;
}

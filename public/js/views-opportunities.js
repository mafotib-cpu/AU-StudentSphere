import { h, api, state, icon, tile, empty, fmtDate, openModal } from './core.js';

/* ---------- shared bits ---------- */
export const oppState = { kind: '' };
export const setKind = (k) => { oppState.kind = k || ''; };
let kinds = ['Internship', 'Industrial attachment', 'Scholarship', 'Competition', 'Workshop / training', 'Job / graduate role', 'Other'];

const KIND_ICON = { Internship: 'briefcase', 'Industrial attachment': 'briefcase', Scholarship: 'award', Competition: 'award', 'Workshop / training': 'graduation-cap', 'Job / graduate role': 'briefcase', Other: 'sparkles' };
const KIND_COLOR = { Internship: 'blue', 'Industrial attachment': 'purple', Scholarship: 'amber', Competition: 'red', 'Workshop / training': 'green', 'Job / graduate role': 'blue', Other: 'purple' };
const URGENCY_TILE = { overdue: 'red', urgent: 'red', action: 'amber', soon: 'blue', info: 'purple' };
const URGENCY_PILL = { overdue: 'red', urgent: 'red', action: 'amber', soon: 'blue', info: 'grey' };

export function whenLabel(days) {
  if (days === null || days === undefined) return '';
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} overdue`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}
const lnk = (href, label) => h`<a href="#${href}">${label}</a>`;

/* ---------- student dashboard cards ---------- */
function feedRow(i) {
  const label = i.days !== null ? whenLabel(i.days) : i.urgency === 'action' ? 'Action needed' : '';
  return h`<a class="itemrow" href="#${i.link}">${tile(i.icon, URGENCY_TILE[i.urgency] || 'purple', true)}<div class="grow"><h4>${i.title}</h4><div class="small muted">${i.detail}</div></div>${label ? h`<span class="due ${URGENCY_PILL[i.urgency] || 'grey'}">${label}</span>` : ''}</a>`;
}
export function deadlinesCard(items) {
  const shown = items.slice(0, 6);
  return h`<div class="card"><div class="cardhead"><h2>Deadlines &amp; reminders</h2>${items.length > shown.length ? h`<span class="small muted">+${items.length - shown.length} more</span>` : ''}</div>
    ${shown.length ? shown.map(feedRow) : empty('circle-check', 'You are all caught up', 'Nothing needs your attention right now.')}</div>`;
}
export function latestCard(items) {
  const shown = items.slice(0, 3);
  return h`<div class="card"><div class="cardhead"><h2>New opportunities</h2>${lnk('/opportunities', 'See all')}</div>
    ${shown.length ? shown.map((o) => h`<a class="itemrow" href="#/opportunities">${tile(KIND_ICON[o.kind] || 'sparkles', KIND_COLOR[o.kind] || 'red', true)}<div class="grow"><h4>${o.title}</h4><div class="small muted">${o.kind}${o.organisation ? ' · ' + o.organisation : ''}</div></div>${o.days_left !== null ? h`<span class="due ${o.days_left <= 3 ? 'red' : o.days_left <= 14 ? 'blue' : 'grey'}">${whenLabel(o.days_left)}</span>` : ''}</a>`)
      : empty('briefcase', 'Nothing posted yet', 'Internships, attachments and scholarships will appear here.')}</div>`;
}

/* ---------- opportunities page (all roles) ---------- */
function card(o) {
  const closing = o.days_left !== null ? h`<span class="due ${o.days_left <= 3 ? 'red' : o.days_left <= 14 ? 'blue' : 'grey'}">Closes ${o.days_left === 0 ? 'today' : o.days_left === 1 ? 'tomorrow' : fmtDate(o.deadline)}</span>` : '';
  return h`<div class="card opp"><div class="row" style="align-items:flex-start;gap:16px">${tile(KIND_ICON[o.kind] || 'sparkles', KIND_COLOR[o.kind] || 'red')}
    <div class="grow" style="min-width:0"><div class="row wrap" style="gap:8px"><h3 style="font-size:17px">${o.title}</h3><span class="badge b-clarification">${o.kind}</span>${closing}</div>
      <div class="small muted" style="margin-top:2px">${o.organisation ? o.organisation + ' · ' : ''}Posted by ${o.poster_name} · ${fmtDate(o.created_at)}</div>
      <p style="margin-top:10px;color:var(--ink-2);white-space:pre-line">${o.description}</p>
      ${o.link || o.can_remove || state.user.role === 'student' ? h`<div class="row wrap" style="gap:10px;margin-top:14px">${state.user.role === 'student' ? (o.my_application ? h`<span class="badge b-verified">${icon('check')}Applied · ${o.my_application}</span>` : h`<button class="btn red" data-act="opp-apply" data-id="${o.id}" data-title="${o.title}">${icon('send')} Apply here</button>`) : ''}${o.applicants !== null ? h`<a class="btn" href="#/opportunities/${o.id}/applicants">${icon('users')} Applicants (${o.applicants})</a>` : ''}${o.link ? h`<a class="btn" href="${o.link}" target="_blank" rel="noopener noreferrer">${icon('external-link')} View details</a>` : ''}${o.can_remove ? h`<button class="btn" data-act="opp-remove" data-id="${o.id}" data-title="${o.title}">${icon('trash-2')} Remove</button>` : ''}</div>` : ''}
    </div></div></div>`;
}
export async function opportunities() {
  const d = await api('/opportunities' + (oppState.kind ? `?kind=${encodeURIComponent(oppState.kind)}` : ''));
  kinds = d.kinds;
  const student = state.user.role === 'student';
  return h`<div class="pagehead"><div><div class="eyebrow">Opportunities</div><h1 class="page">Opportunities board</h1>
      <p class="lede">${student ? 'Internships, attachments, scholarships and competitions posted by staff. You are notified when something new appears.' : 'Post internships, attachments, scholarships and events. Every student is notified when you post.'}</p></div>
      ${d.canPost ? h`<button class="btn red" data-act="opp-new">${icon('plus')} Post opportunity</button>` : ''}</div>
    <div class="chips" role="group" aria-label="Filter by type"><button class="chip ${oppState.kind === '' ? 'on' : ''}" data-act="opp-filter" data-kind="">All</button>${d.kinds.map((k) => h`<button class="chip ${oppState.kind === k ? 'on' : ''}" data-act="opp-filter" data-kind="${k}">${k}</button>`)}</div>
    <div class="stack mt">${d.items.length ? d.items.map(card) : h`<div class="card">${empty('briefcase', oppState.kind ? 'Nothing of this type right now' : 'No opportunities posted yet', student ? 'Check back soon. You will get a notification when staff post something new.' : 'Use “Post opportunity” to add the first one.')}</div>`}</div>`;
}

export function openPostForm() {
  const min = new Date().toISOString().slice(0, 10);
  openModal(h`<h2>Post an opportunity</h2><p class="sub">Every student will be notified straight away. Only post opportunities you can vouch for.</p>
    <form data-form="opp-new" novalidate>
      <div class="field" data-field="title"><label class="l" for="o-t">Title</label><input class="input" id="o-t" name="title" maxlength="120" placeholder="e.g. Software Engineering Internship"></div>
      <div class="grid g2" style="gap:14px">
        <div class="field" data-field="kind"><label class="l" for="o-k">Type</label><select class="select" id="o-k" name="kind">${kinds.map((k) => h`<option>${k}</option>`)}</select></div>
        <div class="field" data-field="deadline"><label class="l" for="o-d">Closing date <span class="muted">(optional)</span></label><input class="input" type="date" id="o-d" name="deadline" min="${min}"></div>
      </div>
      <div class="field" data-field="organisation"><label class="l" for="o-o">Organisation <span class="muted">(optional)</span></label><input class="input" id="o-o" name="organisation" maxlength="120"></div>
      <div class="field" data-field="link"><label class="l" for="o-l">Link <span class="muted">(optional)</span></label><input class="input" id="o-l" name="link" inputmode="url" placeholder="https://…"></div>
      <div class="field" data-field="description"><label class="l" for="o-x">Description</label><textarea class="textarea" id="o-x" name="description" maxlength="1000" placeholder="What is it, who can apply, and how?"></textarea></div>
      <div class="foot"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn red" type="submit">Post and notify students</button></div></form>`);
}

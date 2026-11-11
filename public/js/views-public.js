import { h, raw, api, state, icon, badge, tierTag, tile, empty, esc, fmtMonth, fmtDate, fmtDateTime, kindIcon, itemSubtitle, fmtSize, avatar } from './core.js';

const head = () => h`<div class="pubhead"><img src="/assets/logo.png" alt="Africa University"><div style="border-left:1px solid var(--line-2);padding-left:12px"><b>AU<br>StudentSphere</b><small>VERIFIED RECORD</small></div></div>`;
const side = () => h`<div class="authside"><div><div class="eyebrow" style="color:#fff;opacity:.8">Africa University</div><h2>Your university story, verified.</h2><p style="opacity:.9">One central profile for achievements, leadership and growth — confirmed by the people who know best.</p></div>
  <ul><li>${icon('shield-check')}<span>Nothing counts until a staff member verifies it</span></li><li>${icon('link')}<span>Share through links that expire and can be cancelled</span></li><li>${icon('file-text')}<span>Faster, fairer recommendation letters</span></li><li>${icon('lock')}<span>Two-step verification and role-based access</span></li></ul></div>`;
const wrap = (inner) => h`<div class="pubwrap">${head()}<div class="authgrid">${side()}<div class="authform">${inner}</div></div><p class="small muted mt">${state.meta && state.meta.demo ? h`Demo mode: emails are delivered to the <a href="#/mailbox">demo mailbox</a>.` : ''}</p></div>`;

export const login = () => wrap(h`<h1>Sign in</h1><p class="muted" style="margin-bottom:24px">Use your Africa University account.</p>
  <form data-form="login" novalidate><div class="field" data-field="email"><label class="l" for="em">Email</label><input class="input" type="email" id="em" name="email" autocomplete="username" required></div>
    <div class="field" data-field="password"><label class="l" for="pw">Password</label><input class="input" type="password" id="pw" name="password" autocomplete="current-password" required></div>
    <button class="btn red block" type="submit">Continue</button></form>
  <div class="row sp mt"><a href="#/forgot">Forgot password?</a><a href="#/register">Create student account</a></div><p class="small muted mt"><a href="#/privacy">Privacy notice</a></p>`);

export const twoStep = (ch) => wrap(h`<h1>Check your email</h1><p class="muted" style="margin-bottom:22px">We sent a 6-digit code to <b>${ch.sent_to}</b>. It expires in 10 minutes.</p>
  <form data-form="verify" data-challenge="${ch.challenge}" novalidate><div class="field" data-field="code"><label class="l" for="cd">Verification code</label><input class="input codebox" id="cd" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••"></div>
    <button class="btn red block" type="submit">Verify &amp; sign in</button></form>
  <div class="row sp mt"><button class="link" data-act="resend" data-challenge="${ch.challenge}">Send a new code</button><a href="#/login">Back</a></div>
  ${ch.demo ? h`<div class="demo">Demo mode: no real email is sent. <a href="#/mailbox" target="_blank" rel="noopener">Open the demo mailbox</a> to read the code.</div>` : ''}`);

export const register = () => wrap(h`<h1>Create your account</h1><p class="muted" style="margin-bottom:20px">Students register here. Staff accounts are created by an administrator.</p>
  <form data-form="register" novalidate>
    <div class="field" data-field="name"><label class="l" for="r1">Full name</label><input class="input" id="r1" name="name" autocomplete="name"></div>
    <div class="formgrid"><div class="field" data-field="email"><label class="l" for="r2">School email</label><input class="input" type="email" id="r2" name="email" autocomplete="email"></div>
      <div class="field" data-field="student_id"><label class="l" for="r3">Student ID</label><input class="input" id="r3" name="student_id" placeholder="STU-2022-0418"></div>
      <div class="field" data-field="programme"><label class="l" for="r4">Programme</label><input class="input" id="r4" name="programme" placeholder="BSc Computer Science"></div>
      <div class="field" data-field="year"><label class="l" for="r5">Year of study</label><select class="select" id="r5" name="year"><option value="">Select…</option>${[1, 2, 3, 4, 5, 6].map((y) => h`<option>${y}</option>`)}</select></div>
      <div class="field" data-field="enrolled"><label class="l" for="r6">Enrolled (month)</label><input class="input" type="month" id="r6" name="enrolled"></div>
      <div class="field" data-field="password"><label class="l" for="r7">Password</label><input class="input" type="password" id="r7" name="password" autocomplete="new-password"><div class="hint">8+ characters, letters and a number.</div></div></div>
    <button class="btn red block" type="submit">Create account</button></form><p class="mt small">Already registered? <a href="#/login">Sign in</a></p>`);

export const forgot = () => wrap(h`<h1>Reset your password</h1><p class="muted" style="margin-bottom:22px">Enter your registered email. We will send a reset link if the account exists.</p>
  <form data-form="forgot" novalidate><div class="field" data-field="email"><label class="l" for="f1">Email</label><input class="input" type="email" id="f1" name="email"></div><button class="btn red block" type="submit">Send reset link</button></form><p class="mt small"><a href="#/login">Back to sign in</a></p>`);

export const reset = (token) => wrap(h`<h1>Choose a new password</h1><p class="muted" style="margin-bottom:22px">Use at least 8 characters with letters and a number.</p>
  <form data-form="reset" data-token="${token}" novalidate><div class="field" data-field="password"><label class="l" for="p1">New password</label><input class="input" type="password" id="p1" name="password" autocomplete="new-password"></div><button class="btn red block" type="submit">Save password</button></form>`);

/* ---------- shared profile (no login) ---------- */
export async function shared(token) {
  let d;
  try { d = await api(`/public/share/${encodeURIComponent(token)}`); } catch (e) {
    return h`<div class="pubwrap">${head()}<div class="card" style="max-width:560px;width:100%">${empty('lock', 'This profile is not available', e.message)}</div></div>`;
  }
  const p = d.profile, s = p.student, a = p.academic;
  return h`<div class="pubwrap">${head()}<div style="max-width:920px;width:100%">
    <div class="callout green noprint">${icon('shield-check')}<div>Shared with <b>${d.label}</b> by the student. Every item shown was verified by Africa University staff. This link expires on ${fmtDate(d.expires_at)}.</div></div>
    <div class="card profilecard mt"><div class="banner"></div><div class="who">${avatar(s.name, true)}<div class="info"><h2>${s.name}</h2> ${badge('verified')}<div class="muted">${s.programme} · Year ${s.year} · ${s.student_id}</div></div><button class="btn noprint" data-act="print">${icon('printer')} Print / PDF</button></div></div>
    ${a ? h`<div class="grid g3 mt" style="gap:14px"><div class="snap hi"><small>GPA</small><div class="n">${a.gpa.toFixed(2)}</div></div><div class="snap"><small>Credits earned</small><div class="n">${a.credits}</div></div><div class="snap"><small>Expected graduation</small><div class="n">${s.graduation}</div></div></div>` : ''}
    <div class="card mt"><h2>Verified achievements</h2>${p.items.length ? p.items.map((i) => { const [ic, col] = kindIcon(i); return h`<div class="itemrow">${tile(ic, col)}<div class="grow"><h4>${i.title} ${badge('verified')} ${tierTag(i.tier)}</h4><div class="small muted">${itemSubtitle(i)}</div><p class="small" style="margin-top:6px;color:var(--ink-2)">${i.description}</p><div class="small muted mt-s">Verified by ${i.reviewed_by_name} on ${fmtDate(i.reviewed_at)}</div></div></div>`; }) : empty('award', 'No items shared', '')}</div>
    ${p.skills.length ? h`<div class="card mt"><h2>Skills</h2><div class="tags">${p.skills.map((k) => h`<span class="tag">${k.name}</span>`)}</div></div>` : ''}</div></div>`;
}

/* ---------- one-time email review link ---------- */
export async function reviewLink(token) {
  let d;
  try { d = await api(`/review-link/${encodeURIComponent(token)}`); } catch (e) {
    return h`<div class="pubwrap">${head()}<div class="card" style="max-width:560px;width:100%">${empty('lock', 'Link not valid', e.message)}</div></div>`;
  }
  const i = d.item;
  return h`<div class="pubwrap">${head()}<div class="card" style="max-width:720px;width:100%"><div class="eyebrow">Verification request for ${d.verifier.name}</div>
    <h1 style="font-size:28px;margin:8px 0 4px">${i.title}</h1><div class="muted">${itemSubtitle(i)}</div>
    <div class="divider"></div><p><b>${d.student.name}</b> · ${d.student.student_id} · ${d.student.programme}</p><p style="color:var(--ink-2);margin-top:8px">${i.description}</p>
    <div class="row wrap gap-s mt-s">${i.categories.map((c) => h`<span class="tag" style="padding:3px 10px;font-size:12.5px">${c}</span>`)}</div>
    ${i.evidence ? h`<div class="itemrow mt" style="background:#f8f8f8">${tile('file-text', 'red', true)}<div class="grow"><b>${i.evidence.name}</b><div class="small muted">${fmtSize(i.evidence.size)}</div></div><a href="/api/review-link/${encodeURIComponent(token)}/evidence" target="_blank" rel="noopener"><b>View</b></a></div>` : h`<div class="callout amber">${icon('triangle-alert')}<div>No evidence was attached. ${i.no_evidence_reason || ''}</div></div>`}
    <form data-form="reviewlink" data-token="${token}" class="mt" novalidate><div class="field" data-field="note"><label class="l" for="rn">Note to the student <span class="muted">(required to reject or ask for clarification)</span></label><textarea class="textarea" id="rn" name="note"></textarea></div>
      <div class="field"><label class="l" for="rt">Significance tier <span class="muted">(suggested: ${i.tier_suggested})</span></label><select class="select" id="rt" name="tier" style="max-width:240px">${['major', 'moderate', 'minor'].map((t) => h`<option value="${t}" ${t === i.tier_suggested ? 'selected' : ''}>${t[0].toUpperCase() + t.slice(1)}</option>`)}</select></div>
      <div class="row wrap" style="justify-content:flex-end"><button class="btn" type="submit" data-a="clarify">Ask for clarification</button><button class="btn ghost-red" type="submit" data-a="reject">Reject</button><button class="btn red" type="submit" data-a="verify">${icon('check')} Approve</button></div></form>
    <p class="small muted mt">This secure link works once and expires in 14 days. You do not need to sign in.</p></div></div>`;
}

/* ---------- demo mailbox ---------- */
export async function mailbox() {
  let list;
  try { list = await api('/mailbox'); } catch { return h`<div class="pubwrap">${head()}<div class="card">${empty('lock', 'Mailbox unavailable', 'The demo mailbox is only available in demo mode.')}</div></div>`; }
  const linkify = (t) => raw(esc(t).replace(/(https?:\/\/[^\s<]+)/g, (u) => { const hash = u.includes('/#/') ? u.slice(u.indexOf('/#/') + 2) : null; return `<a href="${hash || u}">${u}</a>`; }));
  return h`<div class="pubwrap">${head()}<div style="max-width:820px;width:100%"><div class="pagehead"><div><div class="eyebrow">Demo mode</div><h1 class="page">Demo mailbox</h1><p class="lede">Every email the system would send appears here — sign-in codes, reset links and review links. Connect an SMTP server to send real email.</p></div><a class="btn" href="#/login" style="text-decoration:none">Back to sign in</a></div>
    ${list.length ? list.map((m) => h`<div class="mail"><div class="row sp wrap"><b>${m.subject}</b><span class="small muted">${fmtDateTime(m.at)}</span></div><div class="small muted">To: ${m.to_addr}</div><pre>${linkify(m.body)}</pre></div>`) : h`<div class="card">${empty('mail', 'No emails yet', 'Sign in to generate a verification code.')}</div>`}</div></div>`;
}

const NOTICE = h`<h3>What we collect</h3><p>Your name, university email, programme and year, academic results, the achievements you log with their evidence files, messages, applications, and sign-in records (time, device and address).</p>
<h3>Why</h3><p>To keep a verified record of your university journey, let authorised staff verify it, and let you share it or request recommendation letters. We do not sell your data or use it for advertising.</p>
<h3>Who can see it</h3><p>You always can. Lecturers and verifiers see only what you grant, for the time you choose. Verifiers see an item only to check it. Administrators manage accounts and verification and their actions are logged. Disciplinary records and sensitive personal details (ID numbers, medical, religious or political information) are not accepted.</p>
<h3>How it is protected</h3><p>Two-step sign-in, role-based access, expiring share links, an audit log, and limits on uploaded file types and sizes. Data is kept only as long as your record is active, and for the period university policy requires afterwards.</p>
<h3>Your rights</h3><p>You can view and correct your information, ask for an item to be deleted, and cancel any share link at any time. Use Help &amp; requests, or contact the Records Office, to ask about your data. This notice follows Africa University privacy policies and applicable data protection law, including Zimbabwe’s Cyber and Data Protection Act.</p>`;
export const privacyPage = () => wrap(h`<h1>Privacy notice</h1><p class="muted" style="margin-bottom:12px">How AU StudentSphere handles your information.</p><div class="stack" style="gap:6px">${NOTICE}</div><div class="mt"><a href="#/login">Back to sign in</a></div>`);
export const consent = (user) => wrap(h`<h1>Before you continue</h1><p class="muted" style="margin-bottom:12px">Please read how AU StudentSphere handles your information, ${user.name.split(' ')[0]}.</p><div style="max-height:300px;overflow:auto;border:1px solid var(--line-2);border-radius:12px;padding:6px 18px">${NOTICE}</div>
  <form data-form="consent" class="mt" novalidate><label class="check"><input type="checkbox" name="agree" id="agree"> I have read the privacy notice and agree to this use of my information.</label><div class="field" data-field="agree"></div>
  <div class="row" style="gap:10px"><button class="btn red" type="submit">Accept and continue</button><button class="btn" type="button" data-act="signout">Sign out</button></div></form>`);
export const privacyCard = () => h`<div class="pagehead"><div><div class="eyebrow">Account</div><h1 class="page">Privacy notice</h1><p class="lede">How AU StudentSphere handles your information.</p></div></div><div class="card">${NOTICE}</div>`;

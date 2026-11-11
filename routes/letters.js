'use strict';
const { db } = require('../src/db');
const H = require('../src/helpers');

const needUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Please sign in.' }));
const needStudent = (req, res, next) => (!req.user ? res.status(401).json({ error: 'Please sign in.' }) : req.user && req.user.role === 'student' ? next() : res.status(403).json({ error: 'Students only.' }));
const PURPOSES = ['Graduate study', 'Scholarship', 'Job application', 'Internship / attachment', 'Award nomination', 'Other'];
const OPEN = ['requested', 'drafting', 'revision_requested'];

function shapeLetter(l, viewer) {
  const s = H.getUser(l.student_id);
  const lec = H.getUser(l.lecturer_id);
  const isStudent = viewer.id === l.student_id;
  return {
    id: l.id, purpose: l.purpose, purpose_detail: l.purpose_detail, key_points: l.key_points, deadline: l.deadline,
    status: l.status, revision_note: l.revision_note, decline_reason: l.decline_reason,
    achievement_ids: H.parse(l.achievement_ids, []), include_results: !!l.include_results,
    student: { id: s.id, name: s.name, initials: H.initials(s.name), student_id: s.student_id, programme: s.programme, year: s.year },
    lecturer: { id: lec.id, name: lec.name, title: lec.title },
    draft_text: isStudent ? null : l.draft_text, // lecturer is the author; students only see the approved letter
    final_text: isStudent && l.status !== 'approved' ? null : l.final_text,
    created_at: l.created_at, updated_at: l.updated_at, approved_at: l.approved_at, last_reminder: l.last_reminder,
  };
}

function template(l, student, lecturer) {
  const ids = H.parse(l.achievement_ids, []);
  const p = H.profileFor(student.id, { itemIds: ids, includeResults: !!l.include_results, includeSkills: false });
  const first = student.name.split(' ')[0];
  const ord = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'][student.year] || `year ${student.year}`;
  const lines = [];
  lines.push('To whom it may concern,', '');
  lines.push(`I am pleased to write in support of ${student.name}, a ${ord}-year ${student.programme || ''} student at Africa University, for the purpose of: ${l.purpose}${l.purpose_detail ? ` (${l.purpose_detail})` : ''}.`, '');
  if (p.academic && p.academic.gpa) {
    lines.push('ACADEMIC STANDING');
    lines.push(`${first} holds a cumulative GPA of ${p.academic.gpa.toFixed(2)} across ${p.academic.credits} earned credits${p.academic.percentile ? `, placing them in the top ${p.academic.percentile}% of their cohort` : ''}. These results are drawn from the Academic Records Office.`, '');
  }
  if (p.items.length) {
    lines.push('VERIFIED ACHIEVEMENTS AND CONTRIBUTIONS');
    for (const i of p.items) lines.push(`• ${i.title}${i.issuer ? ' — ' + i.issuer : ''} (${H.fmtMonth(i.date)}${i.ongoing ? ' – present' : ''}): ${i.description}`);
    lines.push('');
  }
  if (p.strengths.length) lines.push('STRENGTHS', `The verified record points to strengths in ${p.strengths.join(', ').toLowerCase().replace(/, ([^,]*)$/, ' and $1')}.`, '');
  if (l.key_points) { lines.push(`POINTS ${first.toUpperCase()} ASKED ME TO CONSIDER`); l.key_points.split(/\n+/).filter(Boolean).forEach((k) => lines.push('• ' + k.replace(/^[•\-*\s]+/, ''))); lines.push(''); }
  lines.push('[Lecturer: add your own observations of the student here. This letter reflects your personal assessment; the text above only summarises verified records.]', '');
  lines.push('I recommend them to you without reservation.', '', 'Yours sincerely,', lecturer.name, `${lecturer.title || 'Lecturer'}, Africa University`);
  return lines.join('\n');
}

function sendReminders() {
  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const twoDays = new Date(Date.now() - 2 * 86400000).toISOString();
  const open = db.prepare(`SELECT * FROM letters WHERE status IN ('requested','drafting','revision_requested') AND created_at < ? AND (last_reminder IS NULL OR last_reminder < ?)`).all(dayAgo, twoDays);
  for (const l of open) {
    const s = H.getUser(l.student_id);
    H.notify(l.lecturer_id, `Reminder: a recommendation letter for ${s.name} (${l.purpose}) is still waiting${l.deadline ? ` — due ${l.deadline}` : ''}.`, `/letters/${l.id}`, { email: true, subject: `Reminder: recommendation letter for ${s.name}` });
    db.prepare('UPDATE letters SET last_reminder=? WHERE id=?').run(H.now(), l.id);
  }
  // verification reminders after 3 days
  const old = db.prepare("SELECT * FROM achievements WHERE deleted_at IS NULL AND status='pending' AND created_at < ?").all(new Date(Date.now() - 3 * 86400000).toISOString());
  const byReviewer = new Map();
  for (const a of old) for (const r of H.reviewers(a)) byReviewer.set(r.id, (byReviewer.get(r.id) || 0) + 1);
  for (const [uid, n] of byReviewer) {
    const recent = db.prepare("SELECT 1 FROM notifications WHERE user_id=? AND text LIKE 'Reminder: % verification%' AND at > ?").get(uid, dayAgo);
    if (!recent) H.notify(uid, `Reminder: ${n} verification request${n > 1 ? 's have' : ' has'} been waiting more than 3 days.`, '/queue');
  }
  return open.length;
}

module.exports = (app) => {
  app.get('/api/letters/meta', needUser, (req, res) => res.json({ purposes: PURPOSES, lecturers: db.prepare("SELECT id, name, title FROM users WHERE role='lecturer' AND status='active' ORDER BY name").all() }));

  app.get('/api/letters', needUser, (req, res) => {
    const u = req.user;
    const rows = u.role === 'student' ? db.prepare('SELECT * FROM letters WHERE student_id=? ORDER BY id DESC').all(u.id)
      : ['lecturer', 'verifier'].includes(u.role) ? db.prepare('SELECT * FROM letters WHERE lecturer_id=? ORDER BY id DESC').all(u.id)
        : u.role === 'admin' ? db.prepare('SELECT * FROM letters ORDER BY id DESC').all() : [];
    res.json(rows.map((l) => shapeLetter(l, u)));
  });

  app.post('/api/letters', needStudent, (req, res) => {
    const b = req.body || {};
    const f = {};
    const lec = H.getUser(Number(b.lecturer_id));
    if (!lec || lec.role !== 'lecturer' || lec.status !== 'active') f.lecturer_id = 'Choose a lecturer.';
    if (!PURPOSES.includes(b.purpose)) f.purpose = 'Choose the purpose of the letter.';
    const ids = (Array.isArray(b.achievement_ids) ? b.achievement_ids : []).map(Number);
    const own = db.prepare("SELECT id FROM achievements WHERE user_id=? AND status='verified' AND deleted_at IS NULL").all(req.user.id).map((r) => r.id);
    if (ids.some((i) => !own.includes(i))) f.achievement_ids = 'Only verified items can be included.';
    if (String(b.key_points || '').length > 2000) f.key_points = 'Please keep key points under 2000 characters.';
    if (b.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(b.deadline)) f.deadline = 'Enter a valid date.';
    if (Object.keys(f).length) return res.status(422).json({ error: 'Please complete the highlighted fields.', fields: f });
    const open = db.prepare("SELECT 1 FROM letters WHERE student_id=? AND lecturer_id=? AND purpose=? AND status IN ('requested','drafting','revision_requested')").get(req.user.id, lec.id, b.purpose);
    if (open && b.confirm_duplicate !== true) return res.status(409).json({ duplicate: true, error: `You already have an open ${b.purpose.toLowerCase()} request with ${lec.name}.` });
    // time-limited access for the lecturer, limited to the chosen items
    const days = Math.min(Math.max(Math.ceil((new Date(b.deadline || H.addDays(30)) - Date.now()) / 86400000) + 14, 14), 90);
    const sh = db.prepare(`INSERT INTO shares (student_id, kind, label, purpose, recipient_id, achievement_ids, include_results, include_skills, expires_at, created_at)
      VALUES (?, 'lecturer', NULL, ?, ?, ?, ?, 0, ?, ?)`).run(req.user.id, `Recommendation letter — ${b.purpose}`, lec.id, JSON.stringify(ids), b.include_results === false ? 0 : 1, H.addDays(days), H.now());
    const r = db.prepare(`INSERT INTO letters (student_id, lecturer_id, purpose, purpose_detail, key_points, deadline, achievement_ids, include_results, share_id, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(req.user.id, lec.id, b.purpose, String(b.purpose_detail || '').trim() || null, String(b.key_points || '').trim() || null,
      b.deadline || null, JSON.stringify(ids), b.include_results === false ? 0 : 1, sh.lastInsertRowid, H.now(), H.now());
    H.audit('letter', r.lastInsertRowid, req.user, 'requested', `${b.purpose} → ${lec.name}`);
    H.notify(lec.id, `${req.user.name} requested a recommendation letter (${b.purpose})${b.deadline ? `, needed by ${b.deadline}` : ''}.`, `/letters/${r.lastInsertRowid}`, { email: true, subject: `Recommendation letter request from ${req.user.name}` });
    H.notify(req.user.id, `Your letter request was sent to ${lec.name}. You will be notified at every step.`, '/letters');
    res.json(shapeLetter(db.prepare('SELECT * FROM letters WHERE id=?').get(r.lastInsertRowid), req.user));
  });

  function load(req, res) {
    const l = db.prepare('SELECT * FROM letters WHERE id=?').get(req.params.id);
    if (!l) { res.status(404).json({ error: 'Not found.' }); return null; }
    const u = req.user;
    if (!(u.id === l.student_id || u.id === l.lecturer_id || u.role === 'admin')) { res.status(403).json({ error: 'Not allowed.' }); return null; }
    return l;
  }

  app.get('/api/letters/:id', needUser, (req, res) => {
    const l = load(req, res); if (!l) return;
    const out = shapeLetter(l, req.user);
    if (req.user.id === l.lecturer_id) {
      // lecturer sees only what the student chose to include
      const p = H.profileFor(l.student_id, { itemIds: H.parse(l.achievement_ids, []), includeResults: !!l.include_results, includeSkills: false });
      out.profile = p;
      out.summary = H.buildSummary(p, l.purpose);
      db.prepare("INSERT INTO access_log (student_id, viewer_id, viewer_label, via, share_id, at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM access_log WHERE student_id=? AND viewer_id=? AND share_id=? AND at > ?)")
        .run(l.student_id, req.user.id, `${req.user.name}${req.user.title ? ', ' + req.user.title : ''}`, 'lecturer', l.share_id, H.now(), l.student_id, req.user.id, l.share_id, new Date(Date.now() - 86400000).toISOString());
    }
    const hist = db.prepare("SELECT action, detail, actor_name, at FROM audit WHERE entity='letter' AND entity_id=? ORDER BY id").all(l.id);
    res.json({ ...out, history: hist });
  });

  app.post('/api/letters/:id/draft', needUser, (req, res) => {
    const l = load(req, res); if (!l) return;
    if (req.user.id !== l.lecturer_id) return res.status(403).json({ error: 'Only the lecturer can draft the letter.' });
    if (!OPEN.includes(l.status)) return res.status(409).json({ error: 'This letter is already finished.' });
    const text = template(l, H.getUser(l.student_id), req.user);
    db.prepare("UPDATE letters SET draft_text=?, status='drafting', updated_at=? WHERE id=?").run(text, H.now(), l.id);
    H.audit('letter', l.id, req.user, 'draft generated from verified records', null);
    res.json({ draft_text: text });
  });

  app.put('/api/letters/:id', needUser, (req, res) => {
    const l = load(req, res); if (!l) return;
    if (req.user.id !== l.lecturer_id) return res.status(403).json({ error: 'Only the lecturer can edit the letter.' });
    if (!OPEN.includes(l.status)) return res.status(409).json({ error: 'This letter is already finished.' });
    const text = String((req.body || {}).draft_text || '');
    if (text.length > 20000) return res.status(422).json({ error: 'Letter is too long.' });
    db.prepare("UPDATE letters SET draft_text=?, status='drafting', updated_at=? WHERE id=?").run(text, H.now(), l.id);
    res.json({ ok: true });
  });

  app.post('/api/letters/:id/approve', needUser, (req, res) => {
    const l = load(req, res); if (!l) return;
    if (req.user.id !== l.lecturer_id) return res.status(403).json({ error: 'Only the lecturer can approve the letter.' });
    const text = String((req.body || {}).text || l.draft_text || '').trim();
    if (text.length < 100) return res.status(422).json({ error: 'The letter is too short to approve.' });
    if (/\[Lecturer:/i.test(text)) return res.status(422).json({ error: 'Please replace the “[Lecturer: …]” placeholder with your own observations before approving.' });
    db.prepare("UPDATE letters SET final_text=?, draft_text=?, status='approved', approved_at=?, updated_at=?, revision_note=NULL WHERE id=?").run(text, text, H.now(), H.now(), l.id);
    H.audit('letter', l.id, req.user, 'approved', null);
    H.notify(l.student_id, `${req.user.name} approved your recommendation letter (${l.purpose}). You can view and download it now.`, `/letters/${l.id}`, { email: true, subject: 'Your recommendation letter is ready' });
    res.json({ ok: true });
  });

  app.post('/api/letters/:id/decline', needUser, (req, res) => {
    const l = load(req, res); if (!l) return;
    if (req.user.id !== l.lecturer_id) return res.status(403).json({ error: 'Only the lecturer can decline.' });
    const reason = String((req.body || {}).reason || '').trim();
    if (reason.length < 5) return res.status(422).json({ error: 'Please give the student a reason.' });
    db.prepare("UPDATE letters SET status='declined', decline_reason=?, updated_at=? WHERE id=?").run(reason, H.now(), l.id);
    H.audit('letter', l.id, req.user, 'declined', reason);
    H.notify(l.student_id, `${req.user.name} could not take on your letter request: ${reason}`, `/letters/${l.id}`, { email: true, subject: 'Recommendation letter request declined' });
    res.json({ ok: true });
  });

  app.post('/api/letters/:id/revision', needStudent, (req, res) => {
    const l = load(req, res); if (!l) return;
    if (req.user.id !== l.student_id || l.status !== 'approved') return res.status(409).json({ error: 'Only an approved letter can be sent back for revision.' });
    const note = String((req.body || {}).note || '').trim();
    if (note.length < 5) return res.status(422).json({ error: 'Tell the lecturer what to change.' });
    db.prepare("UPDATE letters SET status='revision_requested', revision_note=?, updated_at=? WHERE id=?").run(note, H.now(), l.id);
    H.audit('letter', l.id, req.user, 'revision requested', note);
    H.notify(l.lecturer_id, `${req.user.name} asked for a revision of the letter: ${note}`, `/letters/${l.id}`, { email: true, subject: 'Letter revision requested' });
    res.json({ ok: true });
  });

  app.post('/api/letters/:id/remind', needStudent, (req, res) => {
    const l = load(req, res); if (!l) return;
    if (l.student_id !== req.user.id || !OPEN.includes(l.status)) return res.status(409).json({ error: 'Nothing to remind about.' });
    if (l.student_reminded_at && Date.now() - new Date(l.student_reminded_at).getTime() < 86400000) return res.status(429).json({ error: 'You can send one reminder per day.' });
    db.prepare('UPDATE letters SET student_reminded_at=? WHERE id=?').run(H.now(), l.id);
    H.notify(l.lecturer_id, `${req.user.name} is waiting for a recommendation letter (${l.purpose}).`, `/letters/${l.id}`, { email: true, subject: `Reminder: letter for ${req.user.name}` });
    res.json({ ok: true });
  });
};
module.exports.sendReminders = sendReminders;

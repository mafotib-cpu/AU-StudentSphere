'use strict';
const { db } = require('../src/db');
const H = require('../src/helpers');

const needUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Please sign in.' }));
const needStudent = (req, res, next) => (!req.user ? res.status(401).json({ error: 'Please sign in.' }) : req.user && req.user.role === 'student' ? next() : res.status(403).json({ error: 'Students only.' }));

module.exports = (app) => {
  app.get('/api/me', needUser, (req, res) => {
    const unread = db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read=0').get(req.user.id).c;
    const P = require('../src/premium');
    res.json({ user: { ...H.publicUser(req.user), privacy_accepted: !!req.user.privacy_accepted_at, premium: req.user.role === 'student' && P.isPremium(req.user.id) }, unread });
  });

  app.put('/api/me/contact', needUser, (req, res) => {
    // identity and academic details are locked: only contact details, bio and notification choice can change
    const b = req.body || {};
    const f = {};
    const phone = String(b.phone || '').trim();
    const pe = String(b.personal_email || '').trim();
    const about = String(b.about || '').trim();
    if (phone && !/^[+\d][\d\s()-]{6,20}$/.test(phone)) f.phone = 'Enter a valid phone number.';
    if (pe && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(pe)) f.personal_email = 'Enter a valid email address.';
    if (about.length > 600) f.about = 'Keep your summary under 600 characters.';
    if (Object.keys(f).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', fields: f });
    db.prepare('UPDATE users SET phone=?, personal_email=?, about=?, email_notifications=? WHERE id=?')
      .run(phone || null, pe || null, req.user.role === 'student' ? about || null : req.user.about, b.email_notifications ? 1 : 0, req.user.id);
    H.audit('user', req.user.id, req.user, 'contact details updated', null);
    res.json({ user: H.publicUser(H.getUser(req.user.id)) });
  });

  /* skills */
  app.get('/api/skills', needStudent, (req, res) => res.json(db.prepare('SELECT id, name, type FROM skills WHERE user_id=? ORDER BY type, name').all(req.user.id)));
  app.post('/api/skills', needStudent, (req, res) => {
    const name = String((req.body || {}).name || '').trim();
    const type = (req.body || {}).type === 'language' ? 'language' : 'technical';
    if (name.length < 2 || name.length > 40) return res.status(422).json({ error: 'Enter a skill (2–40 characters).' });
    if (db.prepare('SELECT 1 FROM skills WHERE user_id=? AND lower(name)=lower(?)').get(req.user.id, name)) return res.status(409).json({ error: 'You already listed that skill.' });
    db.prepare('INSERT INTO skills (user_id, name, type) VALUES (?,?,?)').run(req.user.id, name, type);
    res.json({ ok: true });
  });
  app.delete('/api/skills/:id', needStudent, (req, res) => {
    db.prepare('DELETE FROM skills WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    res.json({ ok: true });
  });

  /* results: read-only for the student */
  app.get('/api/results', needStudent, (req, res) => {
    const r = H.academicRecord(req.user.id);
    res.json({ ...r, required: req.user.credits_required, percentile: H.cohortPercentile(req.user.id) });
  });

  /* student dashboard */
  app.get('/api/student/dashboard', needStudent, (req, res) => {
    const u = req.user;
    const rec = H.academicRecord(u.id);
    const count = (kind) => {
      const rows = db.prepare('SELECT status FROM achievements WHERE user_id=? AND kind=? AND deleted_at IS NULL').all(u.id, kind);
      return { total: rows.length, verified: rows.filter((r) => r.status === 'verified').length, pending: rows.filter((r) => ['pending', 'clarification', 'flagged'].includes(r.status)).length };
    };
    const recent = db.prepare("SELECT * FROM achievements WHERE user_id=? AND deleted_at IS NULL AND status='verified' ORDER BY reviewed_at DESC LIMIT 4").all(u.id).map((a) => H.shapeAch(a));
    const lead = db.prepare("SELECT MIN(date) d FROM achievements WHERE user_id=? AND deleted_at IS NULL AND status='verified' AND categories LIKE '%Leadership%'").get(u.id).d
      || db.prepare("SELECT MIN(date) d FROM achievements WHERE user_id=? AND deleted_at IS NULL AND status='verified' AND kind='activity'").get(u.id).d;
    res.json({
      gpa: rec.gpa, credits: rec.credits, percentile: H.cohortPercentile(u.id),
      achievements: count('achievement'), activities: count('activity'), projects: count('project'),
      projectBreakdown: {
        projects: db.prepare("SELECT COUNT(*) c FROM achievements WHERE user_id=? AND kind='project' AND deleted_at IS NULL AND categories NOT LIKE '%Certification%'").get(u.id).c,
        certs: db.prepare("SELECT COUNT(*) c FROM achievements WHERE user_id=? AND kind='project' AND deleted_at IS NULL AND categories LIKE '%Certification%'").get(u.id).c,
      },
      strength: H.profileStrength(u), recent,
      journey: [{ n: 1, year: (u.enrolled || '').slice(0, 4), label: 'Enrolled' }, { n: 2, year: lead ? lead.slice(0, 4) : '—', label: 'Leadership' }, { n: 3, year: u.graduation, label: 'Graduate' }],
      pendingLetters: db.prepare("SELECT COUNT(*) c FROM letters WHERE student_id=? AND status IN ('requested','drafting','revision_requested')").get(u.id).c,
    });
  });

  app.get('/api/student/profile', needStudent, (req, res) => {
    const p = H.profileFor(req.user.id, { itemIds: 'all', includeUnverified: false });
    res.json({ ...p, user: H.publicUser(req.user), recent: p.items.slice(0, 3), letterReady: !!db.prepare("SELECT 1 FROM letters WHERE student_id=? AND status='approved'").get(req.user.id) });
  });

  app.get('/api/student/cv', needStudent, (req, res) => {
    const p = H.profileFor(req.user.id, { itemIds: 'all' });
    res.json({ ...p, user: H.publicUser(req.user), generated_at: H.now() });
  });

  /* notifications */
  app.get('/api/notifications', needUser, (req, res) => {
    res.json(db.prepare('SELECT id, text, link, read, at FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 40').all(req.user.id));
  });
  app.post('/api/notifications/read', needUser, (req, res) => {
    db.prepare('UPDATE notifications SET read=1 WHERE user_id=?').run(req.user.id);
    res.json({ ok: true });
  });

  /* security */
  app.get('/api/security/history', needUser, (req, res) => {
    res.json(db.prepare('SELECT success, reason, ip, ua, at FROM login_history WHERE user_id=? ORDER BY id DESC LIMIT 25').all(req.user.id));
  });

  /* support tickets: complaints + official document requests */
  app.get('/api/tickets', needUser, (req, res) => {
    res.json(db.prepare('SELECT * FROM tickets WHERE user_id=? ORDER BY id DESC').all(req.user.id));
  });
  app.post('/api/tickets', needUser, (req, res) => {
    const b = req.body || {};
    const f = {};
    if (!['complaint', 'attachment_letter', 'admission_letter', 'transcript', 'other'].includes(b.type)) f.type = 'Choose a request type.';
    if (String(b.subject || '').trim().length < 3) f.subject = 'Enter a subject.';
    if (String(b.message || '').trim().length < 10) f.message = 'Please give a few more details.';
    if (Object.keys(f).length) return res.status(422).json({ error: 'Please complete the highlighted fields.', fields: f });
    const r = db.prepare('INSERT INTO tickets (user_id, type, subject, message, created_at, updated_at) VALUES (?,?,?,?,?,?)').run(req.user.id, b.type, String(b.subject).trim(), String(b.message).trim(), H.now(), H.now());
    for (const a of db.prepare("SELECT id FROM users WHERE role='admin' AND status='active'").all()) H.notify(a.id, `New ${b.type.replace('_', ' ')} from ${req.user.name}: ${b.subject}`, '/support');
    H.notify(req.user.id, 'Your message reached the administrator. You will be notified when it is answered.', '/help');
    res.json({ id: r.lastInsertRowid });
  });

  /* demo mailbox (replaces real email when no SMTP server is configured) */
  app.get('/api/mailbox', (req, res) => {
    if (!H.DEMO_MODE) return res.status(404).json({ error: 'Not available.' });
    res.json(db.prepare('SELECT id, to_addr, subject, body, at FROM outbox ORDER BY id DESC LIMIT 60').all());
  });
};

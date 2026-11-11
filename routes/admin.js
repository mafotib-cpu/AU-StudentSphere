'use strict';
const { db } = require('../src/db');
const H = require('../src/helpers');

const needAdmin = (req, res, next) => (!req.user ? res.status(401).json({ error: 'Please sign in.' }) : req.user && req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Administrators only.' }));
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function completeness(u) {
  const checks = [u.phone, u.personal_email, u.about, u.identity_confirmed,
    db.prepare('SELECT 1 FROM skills WHERE user_id=?').get(u.id),
    db.prepare("SELECT 1 FROM achievements WHERE user_id=? AND status='verified' AND deleted_at IS NULL").get(u.id),
    db.prepare('SELECT 1 FROM results WHERE user_id=?').get(u.id)];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

module.exports = (app) => {
  app.get('/api/admin/stats', needAdmin, (req, res) => {
    const c = (sql, ...p) => db.prepare(sql).get(...p).c;
    const weekAgo = H.addDays(-7);
    const pend = c("SELECT COUNT(*) c FROM achievements WHERE deleted_at IS NULL AND (status IN ('pending','flagged') OR pending_changes IS NOT NULL OR deletion_requested=1)");
    const queue = db.prepare("SELECT a.*, u.name uname FROM achievements a JOIN users u ON u.id=a.user_id WHERE a.deleted_at IS NULL AND (a.status IN ('pending','flagged') OR a.pending_changes IS NOT NULL OR a.deletion_requested=1) ORDER BY a.created_at LIMIT 5").all()
      .map((a) => ({ id: a.id, student: a.uname, initials: H.initials(a.uname), title: a.title, status: a.status, created_at: a.created_at, note: a.pending_changes ? 'Change request' : a.deletion_requested ? 'Deletion request' : a.status === 'flagged' ? 'Flagged — awaiting student' : 'Achievement evidence awaiting review' }));
    res.json({
      students: c("SELECT COUNT(*) c FROM users WHERE role='student'"), active: c("SELECT COUNT(*) c FROM users WHERE role='student' AND status='active' AND alumni=0"),
      alumni: c("SELECT COUNT(*) c FROM users WHERE role='student' AND alumni=1"),
      pending: pend, overdue: c("SELECT COUNT(*) c FROM achievements WHERE deleted_at IS NULL AND status='pending' AND created_at < ?", H.addDays(-3)),
      users: c("SELECT COUNT(*) c FROM users WHERE status='active'"), queue,
      lettersOpen: c("SELECT COUNT(*) c FROM letters WHERE status IN ('requested','drafting','revision_requested')"),
      tickets: c("SELECT COUNT(*) c FROM tickets WHERE status='open'"),
      recentLogins: c('SELECT COUNT(*) c FROM login_history WHERE success=1 AND at > ?', weekAgo),
    });
  });

  app.get('/api/admin/students', needAdmin, (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const filter = req.query.filter || 'all';
    let rows = db.prepare("SELECT * FROM users WHERE role='student' ORDER BY name").all();
    if (q) rows = rows.filter((u) => `${u.name} ${u.student_id} ${u.programme} ${u.email}`.toLowerCase().includes(q));
    const out = rows.map((u) => {
      const pend = db.prepare("SELECT COUNT(*) c FROM achievements WHERE user_id=? AND deleted_at IS NULL AND (status IN ('pending','flagged') OR pending_changes IS NOT NULL OR deletion_requested=1)").get(u.id).c;
      const flagged = db.prepare("SELECT COUNT(*) c FROM achievements WHERE user_id=? AND deleted_at IS NULL AND status='flagged'").get(u.id).c;
      const next = u.status !== 'active' ? 'Access restricted' : !u.identity_confirmed ? 'Identity check' : flagged ? 'Flagged item' : pend ? `${pend} pending review` : 'On track';
      const upd = db.prepare('SELECT MAX(updated_at) m FROM achievements WHERE user_id=?').get(u.id).m || u.created_at;
      return { id: u.id, name: u.name, initials: H.initials(u.name), student_id: u.student_id, programme: u.programme, year: u.year, status: u.status, alumni: !!u.alumni, profile: completeness(u), updated: upd, next, needs_review: pend > 0 || flagged > 0 || !u.identity_confirmed };
    });
    res.json(out.filter((s) => filter === 'review' ? s.needs_review : filter === 'restricted' ? s.status !== 'active' : true));
  });

  app.get('/api/admin/students/:id', needAdmin, (req, res) => {
    const u = H.getUser(req.params.id);
    if (!u || u.role !== 'student') return res.status(404).json({ error: 'Not found.' });
    const p = H.profileFor(u.id, { itemIds: 'all', includeUnverified: true });
    H.logAccess(u.id, req.user, 'admin', null, `${req.user.name}, Administrator`);
    res.json({ ...p, user: H.publicUser(u), completeness: completeness(u),
      logins: db.prepare('SELECT success, reason, ip, at FROM login_history WHERE user_id=? ORDER BY id DESC LIMIT 10').all(u.id) });
  });

  app.patch('/api/admin/students/:id', needAdmin, (req, res) => {
    const u = H.getUser(req.params.id);
    if (!u || u.role !== 'student') return res.status(404).json({ error: 'Not found.' });
    const b = req.body || {};
    const next = {
      name: b.name !== undefined ? String(b.name).trim() : u.name,
      programme: b.programme !== undefined ? String(b.programme).trim() : u.programme,
      year: b.year !== undefined ? Number(b.year) : u.year,
      graduation: b.graduation !== undefined ? Number(b.graduation) : u.graduation,
      status: ['active', 'restricted', 'disabled'].includes(b.status) ? b.status : u.status,
      alumni: b.alumni !== undefined ? (b.alumni ? 1 : 0) : u.alumni,
      identity_confirmed: b.identity_confirmed !== undefined ? (b.identity_confirmed ? 1 : 0) : u.identity_confirmed,
    };
    if (next.name.length < 3) return res.status(422).json({ error: 'Name is too short.' });
    db.prepare('UPDATE users SET name=?, programme=?, year=?, graduation=?, status=?, alumni=?, identity_confirmed=? WHERE id=?')
      .run(next.name, next.programme, next.year, next.graduation, next.status, next.alumni, next.identity_confirmed, u.id);
    if (next.status !== 'active') db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
    H.audit('user', u.id, req.user, 'record updated by administrator', Object.keys(b).join(', '));
    res.json({ ok: true });
  });

  /* transcript import (Academic Records Office / administrator) */
  app.post('/api/admin/results/import', needAdmin, (req, res) => {
    const csv = String((req.body || {}).csv || '');
    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return res.status(422).json({ error: 'Paste or upload a CSV first.' });
    let imported = 0;
    const errors = [];
    const termOrder = (t) => { const m = /(Spring|Summer|Fall|Autumn|Winter)\s+(\d{4})/i.exec(t); if (!m) return null; return Number(m[2]) * 10 + ({ spring: 1, summer: 2, fall: 3, autumn: 3, winter: 4 })[m[1].toLowerCase()]; };
    lines.forEach((line, i) => {
      if (i === 0 && /student/i.test(line)) return; // header
      const parts = line.split(',').map((x) => x.trim().replace(/^"|"$/g, ''));
      if (parts.length < 6) return errors.push(`Line ${i + 1}: expected 6 columns (student_id, term, module, code, credits, mark).`);
      const [sid, term, module, code, credits, mark] = parts;
      const st = db.prepare("SELECT id FROM users WHERE role='student' AND upper(student_id)=upper(?)").get(sid);
      const ord = termOrder(term);
      if (!st) return errors.push(`Line ${i + 1}: unknown student ID ${sid}.`);
      if (!ord) return errors.push(`Line ${i + 1}: term must look like “Spring 2025”.`);
      if (!(Number(credits) > 0 && Number(credits) <= 30) || !(Number(mark) >= 0 && Number(mark) <= 100)) return errors.push(`Line ${i + 1}: credits or mark out of range.`);
      const g = H.gradeFor(Number(mark));
      db.prepare('DELETE FROM results WHERE user_id=? AND term=? AND code=?').run(st.id, term, code);
      db.prepare('INSERT INTO results (user_id, term, term_order, module, code, credits, mark, grade, points, imported_by, at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(st.id, term, ord, module, code, Number(credits), Number(mark), g.grade, g.points, req.user.id, H.now());
      imported++;
    });
    H.audit('results', null, req.user, 'results imported', `${imported} rows, ${errors.length} errors`);
    res.json({ imported, errors });
  });

  /* users & access */
  app.get('/api/admin/users', needAdmin, (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const role = req.query.role;
    let rows = db.prepare('SELECT * FROM users ORDER BY role, name').all();
    if (role && role !== 'all') rows = rows.filter((u) => (role === 'staff' ? ['lecturer', 'verifier'].includes(u.role) : u.role === role));
    if (q) rows = rows.filter((u) => `${u.name} ${u.email} ${u.student_id || ''} ${u.title || ''}`.toLowerCase().includes(q));
    res.json(rows.map((u) => ({ ...H.publicUser(u), initials: H.initials(u.name), locked: !!(u.locked_until && new Date(u.locked_until) > new Date()) })));
  });

  app.post('/api/admin/users', needAdmin, (req, res) => {
    const b = req.body || {};
    const f = {};
    const email = String(b.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) f.email = 'Enter a valid email.';
    if (String(b.name || '').trim().length < 3) f.name = 'Enter a name.';
    if (!['lecturer', 'verifier', 'admin', 'student'].includes(b.role)) f.role = 'Choose a role.';
    if (b.role === 'verifier' && !['records_office', 'department_head', 'supervisor'].includes(b.verifier_type)) f.verifier_type = 'Choose the verifier type.';
    if (b.role === 'student' && !String(b.student_id || '').trim()) f.student_id = 'Student ID is required.';
    if (Object.keys(f).length) return res.status(422).json({ error: 'Please complete the highlighted fields.', fields: f });
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return res.status(409).json({ error: 'That email already has an account.', fields: { email: 'Already in use.' } });
    const temp = H.rand(5) + 'A1';
    const r = db.prepare(`INSERT INTO users (email, name, role, verifier_type, title, pw_hash, student_id, programme, year, enrolled, graduation, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(email, String(b.name).trim(), b.role, b.role === 'lecturer' ? 'lecturer' : b.role === 'verifier' ? b.verifier_type : null, String(b.title || '').trim() || null, H.hashPw(temp),
        b.role === 'student' ? String(b.student_id).trim().toUpperCase() : null, b.programme || null, Number(b.year) || null, b.enrolled || null, Number(b.graduation) || null, H.now());
    H.audit('user', r.lastInsertRowid, req.user, 'account created', `${b.role}: ${email}`);
    H.sendMail(email, 'Your AU StudentSphere account', `Hello ${b.name},\n\nAn account was created for you.\nEmail: ${email}\nTemporary password: ${temp}\n\nSign in at ${H.BASE_URL}/ and change your password straight away.\n\nAU StudentSphere`);
    res.json({ id: r.lastInsertRowid, temp_password: temp });
  });

  app.patch('/api/admin/users/:id', needAdmin, (req, res) => {
    const u = H.getUser(req.params.id);
    if (!u) return res.status(404).json({ error: 'Not found.' });
    const b = req.body || {};
    if (u.id === req.user.id && (b.status && b.status !== 'active' || (b.role && b.role !== 'admin'))) return res.status(409).json({ error: 'You cannot lock yourself out.' });
    const role = ['student', 'lecturer', 'verifier', 'admin'].includes(b.role) ? b.role : u.role;
    let vt = u.verifier_type;
    if (role === 'lecturer') vt = 'lecturer';
    else if (role === 'verifier') vt = ['records_office', 'department_head', 'supervisor'].includes(b.verifier_type) ? b.verifier_type : (vt && vt !== 'lecturer' ? vt : 'department_head');
    else vt = null;
    const status = ['active', 'restricted', 'disabled'].includes(b.status) ? b.status : u.status;
    db.prepare('UPDATE users SET role=?, verifier_type=?, title=?, status=?, alumni=? WHERE id=?')
      .run(role, vt, b.title !== undefined ? String(b.title).trim() || null : u.title, status, b.alumni !== undefined ? (b.alumni ? 1 : 0) : u.alumni, u.id);
    if (status !== 'active') db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
    H.audit('user', u.id, req.user, 'account updated', JSON.stringify({ role, status }));
    res.json({ ok: true });
  });

  app.post('/api/admin/users/:id/reset-password', needAdmin, (req, res) => {
    const u = H.getUser(req.params.id);
    if (!u) return res.status(404).json({ error: 'Not found.' });
    const t = H.rand(24);
    db.prepare('INSERT INTO reset_tokens (token_hash, user_id, expires_at) VALUES (?,?,?)').run(H.sha(t), u.id, H.addMinutes(60));
    H.sendMail(H.mailTo(u), 'Reset your AU StudentSphere password', `Hello ${u.name},\n\nAn administrator started a password reset for you. Choose a new password here (valid 1 hour):\n${H.BASE_URL}/#/reset?token=${t}\n`);
    H.audit('user', u.id, req.user, 'password reset sent', null);
    res.json({ ok: true });
  });
  app.post('/api/admin/users/:id/unlock', needAdmin, (req, res) => {
    db.prepare('UPDATE users SET locked_until=NULL, failed_logins=0 WHERE id=?').run(req.params.id);
    H.audit('user', Number(req.params.id), req.user, 'account unlocked', null);
    res.json({ ok: true });
  });

  /* audit + logins */
  app.get('/api/admin/audit', needAdmin, (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    res.json({
      audit: db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(limit),
      logins: db.prepare('SELECT l.*, u.name FROM login_history l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.id DESC LIMIT ?').all(limit),
    });
  });

  /* support inbox */
  app.get('/api/admin/tickets', needAdmin, (req, res) => {
    res.json(db.prepare("SELECT t.*, u.name, u.email, u.student_id FROM tickets t JOIN users u ON u.id=t.user_id ORDER BY (t.status='open') DESC, t.id DESC").all());
  });
  app.patch('/api/admin/tickets/:id', needAdmin, (req, res) => {
    const t = db.prepare('SELECT * FROM tickets WHERE id=?').get(req.params.id);
    if (!t) return res.status(404).json({ error: 'Not found.' });
    const resp = String((req.body || {}).response || '').trim();
    const status = (req.body || {}).status === 'open' ? 'open' : 'resolved';
    if (status === 'resolved' && resp.length < 3) return res.status(422).json({ error: 'Write a short reply before resolving.' });
    db.prepare('UPDATE tickets SET status=?, response=?, responded_by=?, updated_at=? WHERE id=?').run(status, resp || t.response, req.user.id, H.now(), t.id);
    if (status === 'resolved') H.notify(t.user_id, `Your request “${t.subject}” was answered: ${resp}`, '/help', { email: true, subject: `Re: ${t.subject}` });
    res.json({ ok: true });
  });

  /* verified summaries & reports */
  app.get('/api/admin/summary/:id', needAdmin, (req, res) => {
    const u = H.getUser(req.params.id);
    if (!u || u.role !== 'student') return res.status(404).json({ error: 'Not found.' });
    const p = H.profileFor(u.id, { itemIds: 'all' });
    H.logAccess(u.id, req.user, 'admin', null, `${req.user.name}, Administrator`);
    res.json({ profile: p, summary: H.buildSummary(p, 'further study or employment') });
  });

  function reportData() {
    const all = (sql, ...p) => db.prepare(sql).all(...p);
    const byStatus = all("SELECT status, COUNT(*) n FROM achievements WHERE deleted_at IS NULL GROUP BY status");
    const byTier = all("SELECT COALESCE(tier,'unrated') tier, COUNT(*) n FROM achievements WHERE deleted_at IS NULL AND status='verified' GROUP BY tier");
    const rows = all("SELECT categories FROM achievements WHERE deleted_at IS NULL AND status='verified'");
    const cat = {};
    rows.forEach((r) => H.parse(r.categories, []).forEach((c) => { cat[c] = (cat[c] || 0) + 1; }));
    const tat = all("SELECT created_at, reviewed_at FROM achievements WHERE deleted_at IS NULL AND status IN ('verified','rejected') AND reviewed_at IS NOT NULL");
    const hours = tat.length ? tat.reduce((s, r) => s + (new Date(r.reviewed_at) - new Date(r.created_at)) / 3600000, 0) / tat.length : null;
    const lt = all("SELECT created_at, approved_at FROM letters WHERE status='approved' AND approved_at IS NOT NULL");
    const lhours = lt.length ? lt.reduce((s, r) => s + (new Date(r.approved_at) - new Date(r.created_at)) / 3600000, 0) / lt.length : null;
    const students = db.prepare("SELECT COUNT(*) c FROM users WHERE role='student' AND status='active'").get().c;
    const withProfile = db.prepare("SELECT COUNT(DISTINCT user_id) c FROM achievements WHERE deleted_at IS NULL").get().c;
    const byProgramme = all("SELECT u.programme p, COUNT(*) n FROM achievements a JOIN users u ON u.id=a.user_id WHERE a.deleted_at IS NULL AND a.status='verified' GROUP BY u.programme ORDER BY n DESC");
    return {
      byStatus, byTier, byCategory: Object.entries(cat).map(([category, n]) => ({ category, n })).sort((a, b) => b.n - a.n), byProgramme,
      avgVerificationHours: hours, avgLetterHours: lhours, letters: { total: db.prepare('SELECT COUNT(*) c FROM letters').get().c, approved: lt.length },
      activeProfiles: { students, withRecords: withProfile }, generated_at: H.now(),
    };
  }
  app.get('/api/admin/reports', needAdmin, (req, res) => res.json(reportData()));
  app.get('/api/admin/reports.csv', needAdmin, (req, res) => {
    const rows = db.prepare(`SELECT a.id, u.student_id, u.name, u.programme, a.kind, a.title, a.issuer, a.date, a.categories, a.status, a.tier, a.reviewed_at
      FROM achievements a JOIN users u ON u.id=a.user_id WHERE a.deleted_at IS NULL ORDER BY a.id`).all();
    const head = ['id', 'student_id', 'name', 'programme', 'kind', 'title', 'issuer', 'date', 'categories', 'status', 'tier', 'verified_at'];
    const csv = [head.join(','), ...rows.map((r) => [r.id, r.student_id, r.name, r.programme, r.kind, r.title, r.issuer, r.date, H.parse(r.categories, []).join('; '), r.status, r.tier, r.reviewed_at].map(csvCell).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="achievements-report.csv"');
    res.send(csv);
  });
};

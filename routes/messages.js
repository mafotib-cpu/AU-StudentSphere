'use strict';
// Direct messaging: a student writes to a lecturer or verifier; staff reply in the same thread.
const { db } = require('../src/db');
const H = require('../src/helpers');

const STAFF = ['lecturer', 'verifier'];
const MAX_PER_DAY = 40;
const needUser = (req, res, next) => (!req.user ? res.status(401).json({ error: 'Please sign in.' }) : ['student', 'lecturer', 'verifier'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Messaging is for students, lecturers and verifiers.' }));

const mine = (u, t) => (u.role === 'student' ? t.student_id === u.id : t.staff_id === u.id);
const unreadOf = (u, t) => (u.role === 'student' ? t.student_unread : t.staff_unread);

function sendInThread(user, t, body) {
  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  if (db.prepare('SELECT COUNT(*) c FROM messages WHERE sender_id=? AND at > ?').get(user.id, dayAgo).c >= MAX_PER_DAY) { const e = new Error(`You can send up to ${MAX_PER_DAY} messages per day.`); e.status = 429; throw e; }
  const at = H.now();
  db.prepare('INSERT INTO messages (thread_id, sender_id, body, at) VALUES (?,?,?,?)').run(t.id, user.id, body, at);
  const col = user.role === 'student' ? 'staff_unread' : 'student_unread';
  db.prepare(`UPDATE threads SET last_at=?, ${col}=${col}+1 WHERE id=?`).run(at, t.id);
  const other = H.getUser(user.role === 'student' ? t.staff_id : t.student_id);
  H.notify(other.id, `New message from ${user.name}: “${t.subject}”`, `/messages/${t.id}`);
}
const cleanBody = (b) => String(b || '').trim();
const bodyErr = (b) => (b.length < 1 ? 'Write a message.' : b.length > 2000 ? 'Keep messages under 2000 characters.' : null);

module.exports = (app) => {
  app.get('/api/messages/recipients', needUser, (req, res) => {
    if (req.user.role !== 'student') return res.json([]);
    res.json(db.prepare("SELECT id, name, title, role, verifier_type FROM users WHERE role IN ('lecturer','verifier') AND status='active' ORDER BY name").all());
  });

  app.get('/api/messages', needUser, (req, res) => {
    const col = req.user.role === 'student' ? 'student_id' : 'staff_id';
    const rows = db.prepare(`SELECT t.*, s.name AS student_name, f.name AS staff_name, f.title AS staff_title,
        (SELECT body FROM messages m WHERE m.thread_id=t.id ORDER BY m.id DESC LIMIT 1) AS last_body
      FROM threads t JOIN users s ON s.id=t.student_id JOIN users f ON f.id=t.staff_id WHERE t.${col}=? ORDER BY t.last_at DESC`).all(req.user.id);
    res.json(rows.map((t) => ({ id: t.id, subject: t.subject, with: req.user.role === 'student' ? t.staff_name : t.student_name, with_title: req.user.role === 'student' ? t.staff_title : null, preview: t.last_body, last_at: t.last_at, unread: unreadOf(req.user, t) })));
  });

  app.get('/api/messages/unread', needUser, (req, res) => {
    const col = req.user.role === 'student' ? 'student_id' : 'staff_id';
    const un = req.user.role === 'student' ? 'student_unread' : 'staff_unread';
    res.json({ count: db.prepare(`SELECT COALESCE(SUM(${un}),0) c FROM threads WHERE ${col}=?`).get(req.user.id).c });
  });

  app.post('/api/messages', needUser, (req, res) => {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Students start conversations. You can reply to them from your inbox.' });
    const b = req.body || {};
    const f = {};
    const staff = H.getUser(Number(b.staff_id));
    const subject = String(b.subject || '').trim();
    const body = cleanBody(b.body);
    if (!staff || !STAFF.includes(staff.role) || staff.status !== 'active') f.staff_id = 'Choose who to message.';
    if (subject.length < 3 || subject.length > 100) f.subject = 'Enter a subject of 3 to 100 characters.';
    if (bodyErr(body)) f.body = bodyErr(body);
    if (Object.keys(f).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', fields: f });
    const at = H.now();
    const r = db.prepare('INSERT INTO threads (student_id, staff_id, subject, created_at, last_at) VALUES (?,?,?,?,?)').run(req.user.id, staff.id, subject, at, at);
    const t = db.prepare('SELECT * FROM threads WHERE id=?').get(Number(r.lastInsertRowid));
    sendInThread(req.user, t, body);
    res.status(201).json({ id: t.id });
  });

  app.get('/api/messages/:id', needUser, (req, res) => {
    const t = db.prepare('SELECT * FROM threads WHERE id=?').get(Number(req.params.id));
    if (!t || !mine(req.user, t)) return res.status(404).json({ error: 'Conversation not found.' });
    db.prepare(`UPDATE threads SET ${req.user.role === 'student' ? 'student_unread' : 'staff_unread'}=0 WHERE id=?`).run(t.id);
    const other = H.getUser(req.user.role === 'student' ? t.staff_id : t.student_id);
    const msgs = db.prepare('SELECT id, sender_id, body, at FROM messages WHERE thread_id=? ORDER BY id').all(t.id);
    res.json({ id: t.id, subject: t.subject, with: other.name, with_title: other.title, messages: msgs.map((m) => ({ ...m, mine: m.sender_id === req.user.id })) });
  });

  app.post('/api/messages/:id/reply', needUser, (req, res) => {
    const t = db.prepare('SELECT * FROM threads WHERE id=?').get(Number(req.params.id));
    if (!t || !mine(req.user, t)) return res.status(404).json({ error: 'Conversation not found.' });
    const body = cleanBody(req.body && req.body.body);
    if (bodyErr(body)) return res.status(422).json({ error: bodyErr(body), fields: { body: bodyErr(body) } });
    sendInThread(req.user, t, body);
    res.json({ ok: true });
  });
};

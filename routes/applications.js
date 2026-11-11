'use strict';
// Applying to opportunities from inside the system. Free students: 3 applications per rolling 30 days; Premium: unlimited.
const { db } = require('../src/db');
const H = require('../src/helpers');
const P = require('../src/premium');

const STATUSES = ['submitted', 'shortlisted', 'accepted', 'declined'];
const needUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Please sign in.' }));
const needStudent = (req, res, next) => (!req.user ? res.status(401).json({ error: 'Please sign in.' }) : req.user.role === 'student' ? next() : res.status(403).json({ error: 'Students only.' }));
const todayStr = () => new Date().toISOString().slice(0, 10);

module.exports = (app) => {
  app.post('/api/opportunities/:id/apply', needStudent, (req, res) => {
    const o = db.prepare('SELECT * FROM opportunities WHERE id=? AND removed_at IS NULL').get(Number(req.params.id));
    if (!o || (o.deadline && o.deadline < todayStr())) return res.status(404).json({ error: 'This opportunity is closed or no longer available.' });
    if (db.prepare('SELECT 1 FROM applications WHERE opportunity_id=? AND student_id=?').get(o.id, req.user.id)) return res.status(409).json({ error: 'You have already applied for this opportunity.' });
    const note = String(req.body && req.body.note || '').trim();
    if (note.length > 600) return res.status(422).json({ error: 'Keep your note under 600 characters.', fields: { note: 'Keep your note under 600 characters.' } });
    if (!P.isPremium(req.user.id)) {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const n = db.prepare('SELECT COUNT(*) c FROM applications WHERE student_id=? AND created_at > ?').get(req.user.id, since).c;
      if (n >= P.FREE_LIMITS.applicationsPer30Days) return res.status(402).json({ error: `Free accounts can apply to ${P.FREE_LIMITS.applicationsPer30Days} opportunities every 30 days. Upgrade to Premium (${P.money(P.PRICE_CENTS)}/month) for unlimited applications.`, upgrade: true });
    }
    const at = H.now();
    const r = db.prepare('INSERT INTO applications (opportunity_id, student_id, note, created_at, updated_at) VALUES (?,?,?,?,?)').run(o.id, req.user.id, note || null, at, at);
    H.audit('application', Number(r.lastInsertRowid), req.user, 'application submitted', o.title);
    H.notify(o.posted_by, `${req.user.name} applied for “${o.title}”.`, `/opportunities/${o.id}/applicants`);
    res.status(201).json({ ok: true });
  });

  app.get('/api/applications/mine', needStudent, (req, res) => {
    res.json(db.prepare(`SELECT a.id, a.status, a.staff_note, a.created_at, a.opportunity_id, o.title, o.kind, o.organisation, o.deadline
      FROM applications a JOIN opportunities o ON o.id=a.opportunity_id WHERE a.student_id=? ORDER BY a.id DESC`).all(req.user.id));
  });

  app.get('/api/opportunities/:id/applicants', needUser, (req, res) => {
    const o = db.prepare('SELECT * FROM opportunities WHERE id=?').get(Number(req.params.id));
    if (!o) return res.status(404).json({ error: 'Opportunity not found.' });
    if (req.user.role !== 'admin' && o.posted_by !== req.user.id) return res.status(403).json({ error: 'Only the person who posted this can see its applicants.' });
    const rows = db.prepare(`SELECT a.id, a.status, a.note, a.staff_note, a.created_at, u.id AS student_id, u.name, u.programme, u.student_id AS reg
      FROM applications a JOIN users u ON u.id=a.student_id WHERE a.opportunity_id=? ORDER BY a.id`).all(o.id);
    res.json({ opportunity: { id: o.id, title: o.title, kind: o.kind }, statuses: STATUSES, items: rows });
  });

  app.post('/api/applications/:id/status', needUser, (req, res) => {
    const a = db.prepare('SELECT a.*, o.posted_by, o.title FROM applications a JOIN opportunities o ON o.id=a.opportunity_id WHERE a.id=?').get(Number(req.params.id));
    if (!a) return res.status(404).json({ error: 'Application not found.' });
    if (req.user.role !== 'admin' && a.posted_by !== req.user.id) return res.status(403).json({ error: 'Not allowed.' });
    const status = String(req.body && req.body.status || '');
    if (!STATUSES.includes(status)) return res.status(422).json({ error: 'Choose a valid status.' });
    const note = String(req.body && req.body.note || '').trim().slice(0, 400);
    db.prepare('UPDATE applications SET status=?, staff_note=?, updated_at=? WHERE id=?').run(status, note || null, H.now(), a.id);
    H.audit('application', a.id, req.user, `application ${status}`, a.title);
    H.notify(a.student_id, `Your application for “${a.title}” is now: ${status}.`, '/applications');
    res.json({ ok: true });
  });

  app.delete('/api/applications/:id', needStudent, (req, res) => {
    const a = db.prepare('SELECT * FROM applications WHERE id=? AND student_id=?').get(Number(req.params.id), req.user.id);
    if (!a) return res.status(404).json({ error: 'Application not found.' });
    if (a.status !== 'submitted') return res.status(409).json({ error: 'This application has already been reviewed and cannot be withdrawn.' });
    db.prepare('DELETE FROM applications WHERE id=?').run(a.id);
    res.json({ ok: true });
  });
};

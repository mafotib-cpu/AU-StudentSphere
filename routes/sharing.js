'use strict';
const { db } = require('../src/db');
const H = require('../src/helpers');
const P = require('../src/premium');

const needStudent = (req, res, next) => (!req.user ? res.status(401).json({ error: 'Please sign in.' }) : req.user && req.user.role === 'student' ? next() : res.status(403).json({ error: 'Students only.' }));
const needLecturer = (req, res, next) => (!req.user ? res.status(401).json({ error: 'Please sign in.' }) : req.user && ['lecturer', 'verifier'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Staff only.' }));

function shapeShare(s) {
  const lec = s.recipient_id ? H.getUser(s.recipient_id) : null;
  return {
    id: s.id, kind: s.kind, label: s.label, purpose: s.purpose, status: H.shareStatus(s),
    recipient: lec ? { id: lec.id, name: lec.name, title: lec.title } : null,
    achievement_ids: H.parse(s.achievement_ids, []), include_results: !!s.include_results, include_skills: !!s.include_skills,
    expires_at: s.expires_at, revoked_at: s.revoked_at, view_count: s.view_count, created_at: s.created_at,
    url: s.kind === 'link' ? `${H.BASE_URL}/#/shared/${s.token}` : null,
  };
}

function activeGrantsFor(lecturerId, studentId) {
  const q = studentId
    ? db.prepare("SELECT * FROM shares WHERE kind='lecturer' AND recipient_id=? AND student_id=? AND revoked_at IS NULL AND expires_at > ?").all(lecturerId, studentId, H.now())
    : db.prepare("SELECT * FROM shares WHERE kind='lecturer' AND recipient_id=? AND revoked_at IS NULL AND expires_at > ?").all(lecturerId, H.now());
  return q;
}

module.exports = (app) => {
  /* ---- student manages sharing ---- */
  app.get('/api/shares', needStudent, (req, res) => {
    res.json(db.prepare('SELECT * FROM shares WHERE student_id = ? ORDER BY id DESC').all(req.user.id).map(shapeShare));
  });

  app.post('/api/shares', needStudent, (req, res) => {
    const b = req.body || {};
    const f = {};
    const kind = b.kind === 'lecturer' ? 'lecturer' : 'link';
    const ids = (Array.isArray(b.achievement_ids) ? b.achievement_ids : []).map(Number);
    const own = db.prepare("SELECT id FROM achievements WHERE user_id=? AND status='verified' AND deleted_at IS NULL").all(req.user.id).map((r) => r.id);
    if (ids.some((i) => !own.includes(i))) f.achievement_ids = 'You can only share verified items.';
    if (!ids.length && !b.include_results) f.achievement_ids = 'Choose at least one verified item or include your academic summary.';
    const days = Math.min(Math.max(Number(b.days) || 7, 1), 90);
    const label = String(b.label || '').trim();
    const purpose = String(b.purpose || '').trim();
    let recipient = null;
    if (kind === 'lecturer') {
      recipient = H.getUser(Number(b.lecturer_id));
      if (!recipient || !['lecturer', 'verifier'].includes(recipient.role)) f.lecturer_id = 'Choose a lecturer.';
      if (purpose.length < 5) f.purpose = 'State the purpose (e.g. “Reference for MSc application”).';
    } else if (label.length < 2) f.label = 'Who is this link for? (e.g. “Admissions office, University of X”)';
    if (Object.keys(f).length) return res.status(422).json({ error: 'Please complete the highlighted fields.', fields: f });
    if (kind === 'link' && !P.isPremium(req.user.id)) {
      const n = db.prepare("SELECT COUNT(*) c FROM shares WHERE student_id=? AND kind='link' AND revoked_at IS NULL AND expires_at > ?").get(req.user.id, H.now()).c;
      if (n >= P.FREE_LIMITS.activeLinks) return res.status(402).json({ error: `Free accounts can have ${P.FREE_LIMITS.activeLinks} active share links. Cancel one, or upgrade to Premium (${P.money(P.PRICE_CENTS)}/month) for unlimited links.`, upgrade: true });
    }
    const token = kind === 'link' ? H.rand(24) : null;
    const r = db.prepare(`INSERT INTO shares (student_id, kind, token, label, purpose, recipient_id, achievement_ids, include_results, include_skills, expires_at, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(req.user.id, kind, token, label || null, purpose || null, recipient ? recipient.id : null,
      JSON.stringify(ids), b.include_results ? 1 : 0, b.include_skills ? 1 : 0, H.addDays(days), H.now());
    H.audit('share', r.lastInsertRowid, req.user, kind === 'link' ? 'link created' : 'lecturer access granted', recipient ? recipient.name : label);
    if (recipient) H.notify(recipient.id, `${req.user.name} gave you access to selected verified records for: ${purpose}. Access expires in ${days} day(s).`, '/students');
    res.json(shapeShare(db.prepare('SELECT * FROM shares WHERE id=?').get(r.lastInsertRowid)));
  });

  app.delete('/api/shares/:id', needStudent, (req, res) => {
    const s = db.prepare('SELECT * FROM shares WHERE id=? AND student_id=?').get(req.params.id, req.user.id);
    if (!s) return res.status(404).json({ error: 'Not found.' });
    db.prepare('UPDATE shares SET revoked_at=? WHERE id=? AND revoked_at IS NULL').run(H.now(), s.id);
    H.audit('share', s.id, req.user, 'access revoked', null);
    if (s.recipient_id) H.notify(s.recipient_id, `${req.user.name} withdrew your access to their records.`, '/students');
    res.json({ ok: true });
  });

  app.get('/api/access-log', needStudent, (req, res) => {
    res.json(db.prepare('SELECT viewer_label, via, at FROM access_log WHERE student_id=? ORDER BY id DESC LIMIT 100').all(req.user.id));
  });

  /* ---- public link ---- */
  app.get('/api/public/share/:token', (req, res) => {
    const s = db.prepare("SELECT * FROM shares WHERE token = ? AND kind = 'link'").get(String(req.params.token));
    if (!s) return res.status(404).json({ error: 'This link is not valid.' });
    const st = H.shareStatus(s);
    if (st !== 'active') return res.status(410).json({ error: st === 'revoked' ? 'The student has cancelled access to this profile.' : 'This link has expired.' });
    const student = H.getUser(s.student_id);
    if (!student || student.status !== 'active') return res.status(410).json({ error: 'This profile is not available.' });
    const p = H.profileFor(s.student_id, { itemIds: H.parse(s.achievement_ids, []), includeResults: !!s.include_results, includeSkills: !!s.include_skills });
    db.prepare('UPDATE shares SET view_count = view_count + 1 WHERE id=?').run(s.id);
    H.logAccess(s.student_id, null, 'link', s.id, `Shared link “${s.label}”`);
    if (p.academic) { delete p.academic.terms; delete p.academic.percentile; }
    res.json({ profile: p, label: s.label, expires_at: s.expires_at, summary: H.buildSummary(p, null) });
  });

  /* ---- lecturers: only students who shared with them ---- */
  app.get('/api/staff/students', needLecturer, (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const grants = activeGrantsFor(req.user.id);
    const byStudent = new Map();
    for (const g of grants) {
      const e = byStudent.get(g.student_id) || { ids: new Set(), purposes: [], expires: g.expires_at };
      H.parse(g.achievement_ids, []).forEach((i) => e.ids.add(i));
      e.purposes.push(g.purpose);
      if (g.expires_at > e.expires) e.expires = g.expires_at;
      byStudent.set(g.student_id, e);
    }
    const out = [];
    for (const [sid, e] of byStudent) {
      const s = H.getUser(sid);
      if (!s || s.status !== 'active') continue;
      if (q && !`${s.name} ${s.student_id} ${s.programme}`.toLowerCase().includes(q)) continue;
      const verified = db.prepare("SELECT COUNT(*) c FROM achievements WHERE user_id=? AND status='verified' AND deleted_at IS NULL").get(sid).c;
      out.push({ id: s.id, name: s.name, initials: H.initials(s.name), student_id: s.student_id, programme: s.programme, year: s.year, verified_records: verified, shared_count: e.ids.size, purposes: e.purposes, expires_at: e.expires });
    }
    res.json(out);
  });

  app.get('/api/staff/students/:id', needLecturer, (req, res) => {
    const sid = Number(req.params.id);
    const grants = activeGrantsFor(req.user.id, sid);
    if (!grants.length) return res.status(403).json({ error: 'You do not have the student’s permission to view this profile.' });
    const ids = [...new Set(grants.flatMap((g) => H.parse(g.achievement_ids, [])))];
    const p = H.profileFor(sid, { itemIds: ids, includeResults: grants.some((g) => g.include_results), includeSkills: grants.some((g) => g.include_skills) });
    H.logAccess(sid, req.user, 'lecturer', grants[0].id);
    db.prepare('UPDATE shares SET view_count = view_count + 1 WHERE id=?').run(grants[0].id);
    const lastUpdate = db.prepare("SELECT MAX(updated_at) m FROM achievements WHERE user_id=?").get(sid).m;
    res.json({ profile: p, purposes: grants.map((g) => ({ purpose: g.purpose, expires_at: g.expires_at })), last_updated: lastUpdate, summary: H.buildSummary(p, grants[0].purpose) });
  });

  app.get('/api/staff/recent', needLecturer, (req, res) => {
    const rows = db.prepare(`SELECT student_id, MAX(at) at, COUNT(*) views FROM access_log WHERE viewer_id=? GROUP BY student_id ORDER BY at DESC LIMIT 20`).all(req.user.id);
    res.json(rows.map((r) => {
      const s = H.getUser(r.student_id);
      return { id: s.id, name: s.name, initials: H.initials(s.name), programme: s.programme, year: s.year, last_viewed: r.at, views: r.views,
        access_active: activeGrantsFor(req.user.id, s.id).length > 0,
        verified_records: db.prepare("SELECT COUNT(*) c FROM achievements WHERE user_id=? AND status='verified' AND deleted_at IS NULL").get(s.id).c };
    }));
  });

  app.get('/api/staff/dashboard', needLecturer, (req, res) => {
    const sem = new Date(Date.now() - 120 * 86400000).toISOString();
    const profilesViewed = db.prepare('SELECT COUNT(DISTINCT student_id) c FROM access_log WHERE viewer_id=? AND at > ?').get(req.user.id, sem).c;
    const letters = db.prepare('SELECT status FROM letters WHERE lecturer_id=?').all(req.user.id);
    const queue = db.prepare("SELECT * FROM achievements WHERE deleted_at IS NULL AND (status IN ('pending','flagged') OR pending_changes IS NOT NULL OR deletion_requested=1)").all().filter((a) => H.canReview(req.user, a)).length;
    res.json({ profilesViewed, letters_total: letters.length, letters_open: letters.filter((l) => ['requested', 'drafting', 'revision_requested'].includes(l.status)).length, queue,
      accessible: activeGrantsFor(req.user.id).length });
  });
};

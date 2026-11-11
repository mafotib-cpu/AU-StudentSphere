'use strict';
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { db, DATA_DIR } = require('../src/db');
const H = require('../src/helpers');

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const MAX_MB = Number(process.env.MAX_UPLOAD_MB || 5);
const TYPES = {
  '.pdf': { mime: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46] },
  '.png': { mime: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47] },
  '.jpg': { mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  '.jpeg': { mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  '.docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: [0x50, 0x4b] },
};
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, H.rand(16) + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!TYPES[ext]) return cb(Object.assign(new Error('Evidence must be a PDF, PNG, JPG or DOCX file.'), { status: 422 }));
    cb(null, true);
  },
});
function checkMagic(file) {
  const t = TYPES[path.extname(file.originalname).toLowerCase()];
  const fd = fs.openSync(file.path, 'r');
  const buf = Buffer.alloc(4);
  fs.readSync(fd, buf, 0, 4, 0);
  fs.closeSync(fd);
  return t.magic.every((b, i) => buf[i] === b);
}
const rm = (f) => { try { fs.unlinkSync(path.join(UPLOAD_DIR, f)); } catch { /* ignore */ } };
function handleUpload(req, res, next) {
  upload.single('evidence')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `File is too large (max ${MAX_MB} MB).` : err.message;
      return res.status(422).json({ error: msg, fields: { evidence: msg } });
    }
    if (req.file && !checkMagic(req.file)) {
      rm(req.file.filename);
      const msg = 'That file does not look like a real PDF, image or Word document.';
      return res.status(422).json({ error: msg, fields: { evidence: msg } });
    }
    next();
  });
}

const needUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Please sign in.' }));
const needStudent = (req, res, next) => (!req.user ? res.status(401).json({ error: 'Please sign in.' }) : req.user && req.user.role === 'student' ? next() : res.status(403).json({ error: 'Students only.' }));
const needStaff = (req, res, next) => (!req.user ? res.status(401).json({ error: 'Please sign in.' }) : req.user && ['lecturer', 'verifier', 'admin'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Staff only.' }));

const DISCIPLINARY = /disciplin|misconduct|expel|suspension|probation|plagiaris|academic offen[cs]e/i;
const SENSITIVE = /\b(passport|national id|id number|identity number|medical|diagnos\w*|hiv|pregnan\w*|disabilit\w*|religio\w*|political party)\b/i;

function normTitle(t) { return String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

function validate(b, user, file, existing) {
  const f = {};
  const cats = H.parse(b.categories, null);
  const title = String(b.title || '').trim();
  const desc = String(b.description || '').trim();
  if (title.length < 3 || title.length > 120) f.title = 'Enter a title (3–120 characters).';
  if (!String(b.issuer || '').trim()) f.issuer = 'Enter the organisation or issuer.';
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(String(b.date || ''))) f.date = 'Enter the date.';
  else {
    const d = new Date(b.date.length === 7 ? b.date + '-01' : b.date);
    if (isNaN(d) || d > new Date()) f.date = 'The date cannot be in the future.';
  }
  if (desc.length < 20) f.description = 'Describe what you did or achieved (at least 20 characters).';
  if (!Array.isArray(cats) || !cats.length || cats.some((c) => !H.CATEGORIES.includes(c))) f.categories = 'Choose at least one category.';
  const pre = Array.isArray(cats) && cats.includes('Pre-university');
  if (!f.date && !pre && user.enrolled && String(b.date).slice(0, 7) < user.enrolled) f.date = 'This date is before you enrolled. Choose the “Pre-university” category for earlier achievements.';
  if (!f.title && DISCIPLINARY.test(`${title} ${desc}`)) f.title = 'Disciplinary or conduct records are not achievements and cannot be logged here.';
  if (!f.description && SENSITIVE.test(desc)) f.description = 'Please remove sensitive personal details (ID numbers, medical, religious or political information).';
  if (!H.VERIFIER_TYPES[b.verifier_type]) f.verifier_type = 'Choose who should verify this.';
  for (const [k, max] of [['level', 4], ['result', 3], ['responsibility', 3], ['duration', 3]]) {
    const v = Number(b[k]);
    if (!(v >= 1 && v <= max)) f[k] = 'Select one.';
  }
  const needEvidence = Array.isArray(cats) && cats.some((c) => H.EVIDENCE_REQUIRED.includes(c));
  const haveEvidence = !!file || (existing && existing.evidence_file);
  const reason = String(b.no_evidence_reason || '').trim();
  if (needEvidence && !haveEvidence && reason.length < 10) f.evidence = 'Upload evidence for this type of achievement, or explain why it is not available yet.';
  return { f, cats, title, desc, pre, reason, needEvidence };
}

function auditHistory(a) {
  return db.prepare("SELECT action, detail, actor_name, at FROM audit WHERE entity='achievement' AND entity_id=? ORDER BY id").all(a.id);
}

function applyReview(actor, a, action, note, tier) {
  const student = H.getUser(a.user_id);
  const link = '/' + (a.kind === 'achievement' ? 'achievements' : a.kind === 'activity' ? 'activities' : 'projects');
  note = String(note || '').trim();
  const needsNote = ['reject', 'clarify', 'flag', 'decline_change', 'decline_deletion'];
  if (needsNote.includes(action) && note.length < 5) return { error: 'Please give the student a reason (at least 5 characters).', status: 422 };
  const ts = H.now();
  const who = `${actor.name}${actor.title ? ', ' + actor.title : ''}`;
  const t = ['major', 'moderate', 'minor'].includes(tier) ? tier : a.tier_suggested;

  if (action === 'verify') {
    if (!a.evidence_file && H.parse(a.categories, []).some((c) => H.EVIDENCE_REQUIRED.includes(c)) && !['admin', 'verifier'].includes(actor.role) && !note) {
      return { error: 'This item has no evidence. Add a note explaining how you confirmed it, or request clarification.', status: 422 };
    }
    db.prepare("UPDATE achievements SET status='verified', tier=?, review_note=?, reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=?").run(t, note || null, actor.id, ts, ts, a.id);
    H.audit('achievement', a.id, actor, 'verified', `Tier: ${t}${note ? ' · ' + note : ''}`);
    H.notify(a.user_id, `“${a.title}” was verified by ${who}. It now counts on your profile.`, link);
  } else if (action === 'reject') {
    db.prepare("UPDATE achievements SET status='rejected', review_note=?, reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=?").run(note, actor.id, ts, ts, a.id);
    H.audit('achievement', a.id, actor, 'rejected', note);
    H.notify(a.user_id, `“${a.title}” was rejected by ${who}. Reason: ${note}`, link, { email: true, subject: `Achievement rejected: ${a.title}` });
  } else if (action === 'clarify') {
    db.prepare("UPDATE achievements SET status='clarification', review_note=?, reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=?").run(note, actor.id, ts, ts, a.id);
    H.audit('achievement', a.id, actor, 'clarification requested', note);
    H.notify(a.user_id, `${who} needs more information about “${a.title}”: ${note}`, link, { email: true, subject: `More information needed: ${a.title}` });
  } else if (action === 'flag') {
    db.prepare("UPDATE achievements SET status='flagged', review_note=?, reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=?").run(note, actor.id, ts, ts, a.id);
    H.audit('achievement', a.id, actor, 'flagged for review', note);
    H.notify(a.user_id, `“${a.title}” was flagged: ${note}. Please explain or correct it before any decision is made.`, link, { email: true, subject: `Item flagged: ${a.title}` });
  } else if (action === 'approve_change') {
    const ch = H.parse(a.pending_changes, null);
    if (!ch) return { error: 'There is no pending change.', status: 400 };
    const keys = ['title', 'issuer', 'role_text', 'date', 'ongoing', 'description', 'categories', 'pre_university', 'level', 'result', 'responsibility', 'duration', 'tier_suggested', 'evidence_name', 'evidence_file', 'evidence_mime', 'evidence_size', 'no_evidence_reason'];
    const set = keys.filter((k) => k in ch);
    if (ch.evidence_file && a.evidence_file) rm(a.evidence_file);
    db.prepare(`UPDATE achievements SET ${set.map((k) => k + '=?').join(', ')}${set.length ? ',' : ''} pending_changes=NULL, reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=?`)
      .run(...set.map((k) => ch[k]), actor.id, ts, ts, a.id);
    H.audit('achievement', a.id, actor, 'change approved', note || null);
    H.notify(a.user_id, `Your changes to “${a.title}” were approved by ${who}.`, link);
  } else if (action === 'decline_change') {
    const ch = H.parse(a.pending_changes, null);
    if (ch && ch.evidence_file) rm(ch.evidence_file);
    db.prepare('UPDATE achievements SET pending_changes=NULL, updated_at=? WHERE id=?').run(ts, a.id);
    H.audit('achievement', a.id, actor, 'change declined', note);
    H.notify(a.user_id, `Your requested changes to “${a.title}” were declined: ${note}`, link, { email: true, subject: 'Change request declined' });
  } else if (action === 'approve_deletion') {
    db.prepare('UPDATE achievements SET deleted_at=?, updated_at=? WHERE id=?').run(ts, ts, a.id);
    H.audit('achievement', a.id, actor, 'deletion approved', note || null);
    H.notify(a.user_id, `“${a.title}” was removed from your profile as you requested.`, link);
  } else if (action === 'decline_deletion') {
    db.prepare('UPDATE achievements SET deletion_requested=0, updated_at=? WHERE id=?').run(ts, a.id);
    H.audit('achievement', a.id, actor, 'deletion declined', note);
    H.notify(a.user_id, `Your deletion request for “${a.title}” was declined: ${note}`, link);
  } else return { error: 'Unknown action.', status: 400 };
  return { ok: true };
}

module.exports = (app) => {
  /* ---- meta ---- */
  app.get('/api/meta', (req, res) => res.json({
    categories: H.CATEGORIES, evidence_required: H.EVIDENCE_REQUIRED, verifier_types: H.VERIFIER_TYPES,
    levels: H.LEVELS, results: H.RESULTS, responsibility: H.RESPONSIBILITY, duration: H.DURATION, max_upload_mb: MAX_MB,
    demo: H.DEMO_MODE,
  }));

  app.get('/api/verifiers', needUser, (req, res) => {
    const rows = db.prepare("SELECT id, name, title, verifier_type FROM users WHERE status='active' AND role IN ('lecturer','verifier') ORDER BY name").all();
    res.json(rows);
  });

  /* ---- student CRUD ---- */
  app.get('/api/achievements', needStudent, (req, res) => {
    const kind = req.query.kind;
    const rows = db.prepare(`SELECT * FROM achievements WHERE user_id = ? AND deleted_at IS NULL ${kind ? 'AND kind = ?' : ''} ORDER BY date DESC, id DESC`).all(...(kind ? [req.user.id, kind] : [req.user.id]));
    res.json(rows.map((r) => H.shapeAch(r)));
  });

  app.get('/api/achievements/:id', needUser, (req, res) => {
    const a = H.liveAch(req.params.id);
    if (!a) return res.status(404).json({ error: 'Not found.' });
    const mine = a.user_id === req.user.id;
    if (!mine && !H.canReview(req.user, a) && req.user.role !== 'admin') return res.status(403).json({ error: 'Not allowed.' });
    const student = H.getUser(a.user_id);
    res.json({ ...H.shapeAch(a), history: auditHistory(a), student: { id: student.id, name: student.name, student_id: student.student_id, programme: student.programme } });
  });

  async function create(req, res, forStudent) {
    const author = req.user;
    const student = forStudent || author;
    const b = req.body || {};
    const v = validate(b, student, req.file, null);
    if (Object.keys(v.f).length) { if (req.file) rm(req.file.filename); return res.status(422).json({ error: 'Please complete the highlighted fields.', fields: v.f }); }
    const dupes = db.prepare('SELECT id, title, date, status FROM achievements WHERE user_id=? AND deleted_at IS NULL').all(student.id)
      .filter((r) => normTitle(r.title) === normTitle(v.title) && Math.abs(new Date(r.date) - new Date(b.date)) < 32 * 86400000);
    if (dupes.length && b.confirm_duplicate !== '1') {
      if (req.file) rm(req.file.filename);
      return res.status(409).json({ duplicate: true, error: 'This looks like an entry you already have.', matches: dupes });
    }
    const kind = ['achievement', 'activity', 'project'].includes(b.kind) ? b.kind : 'achievement';
    const vid = Number(b.verifier_id) || null;
    if (vid) {
      const vu = H.getUser(vid);
      if (!vu || !['lecturer', 'verifier'].includes(vu.role)) return res.status(422).json({ error: 'Choose a valid verifier.', fields: { verifier_id: 'Invalid verifier.' } });
    }
    const ts = H.now();
    const r = db.prepare(`INSERT INTO achievements (user_id, submitted_by, kind, title, issuer, role_text, date, ongoing, description, categories, pre_university,
      level, result, responsibility, duration, tier_suggested, verifier_type, verifier_id, status, no_evidence_reason,
      evidence_name, evidence_file, evidence_mime, evidence_size, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?,?,?,?,?,?)`).run(
      student.id, author.id, kind, v.title, String(b.issuer).trim(), String(b.role_text || '').trim() || null, b.date, b.ongoing === '1' || b.ongoing === 'true' ? 1 : 0,
      v.desc, JSON.stringify(v.cats), v.pre ? 1 : 0, Number(b.level), Number(b.result), Number(b.responsibility), Number(b.duration),
      H.scoreTier(b), b.verifier_type, vid, v.reason || null,
      req.file ? req.file.originalname : null, req.file ? req.file.filename : null, req.file ? TYPES[path.extname(req.file.originalname).toLowerCase()].mime : null, req.file ? req.file.size : null, ts, ts);
    const a = H.liveAch(r.lastInsertRowid);
    H.audit('achievement', a.id, author, 'submitted', author.id !== student.id ? `Submitted on behalf of the student by ${author.name}` : null);
    const n = H.notifyReviewers(a, student);
    const link = '/' + (kind === 'achievement' ? 'achievements' : kind === 'activity' ? 'activities' : 'projects');
    H.notify(student.id, `“${a.title}” was submitted for verification${n ? '' : ' (no verifier is currently available — an administrator will assign one)'}.`, link);
    res.json(H.shapeAch(a));
  }
  app.post('/api/achievements', needStudent, handleUpload, (req, res) => create(req, res, null));

  // staff submit on behalf of a student (lecturers: academic achievements)
  app.post('/api/staff/students/:id/achievements', needStaff, handleUpload, (req, res) => {
    const st = H.getUser(req.params.id);
    if (!st || st.role !== 'student') return res.status(404).json({ error: 'Student not found.' });
    create(req, res, st);
  });

  app.put('/api/achievements/:id', needStudent, handleUpload, (req, res) => {
    const a = H.liveAch(req.params.id);
    if (!a || a.user_id !== req.user.id) { if (req.file) rm(req.file.filename); return res.status(404).json({ error: 'Not found.' }); }
    if (a.pending_changes) { if (req.file) rm(req.file.filename); return res.status(409).json({ error: 'You already have a change waiting for approval.' }); }
    if (a.deletion_requested) { if (req.file) rm(req.file.filename); return res.status(409).json({ error: 'A deletion request is waiting for approval.' }); }
    const b = req.body || {};
    const v = validate(b, req.user, req.file, a);
    if (Object.keys(v.f).length) { if (req.file) rm(req.file.filename); return res.status(422).json({ error: 'Please complete the highlighted fields.', fields: v.f }); }
    const fields = {
      title: v.title, issuer: String(b.issuer).trim(), role_text: String(b.role_text || '').trim() || null, date: b.date,
      ongoing: b.ongoing === '1' || b.ongoing === 'true' ? 1 : 0, description: v.desc, categories: JSON.stringify(v.cats), pre_university: v.pre ? 1 : 0,
      level: Number(b.level), result: Number(b.result), responsibility: Number(b.responsibility), duration: Number(b.duration),
      tier_suggested: H.scoreTier(b), no_evidence_reason: v.reason || null,
    };
    if (req.file) Object.assign(fields, { evidence_name: req.file.originalname, evidence_file: req.file.filename, evidence_mime: TYPES[path.extname(req.file.originalname).toLowerCase()].mime, evidence_size: req.file.size });
    const ts = H.now();
    if (a.status === 'verified') {
      // major change to a verified item needs approval; original stays live meanwhile
      const changed = Object.fromEntries(Object.entries(fields).filter(([k, val]) => String(val ?? '') !== String(a[k] ?? '')));
      if (!Object.keys(changed).length) return res.json(H.shapeAch(a));
      db.prepare('UPDATE achievements SET pending_changes=?, updated_at=? WHERE id=?').run(JSON.stringify(changed), ts, a.id);
      H.audit('achievement', a.id, req.user, 'change requested', Object.keys(changed).join(', '));
      H.notifyReviewers({ ...a, verifier_type: a.verifier_type }, req.user, 'change');
      H.notify(req.user.id, `Your change to “${a.title}” was sent for approval. The verified version stays on your profile until it is approved.`, '/achievements');
      return res.json(H.shapeAch(H.liveAch(a.id)));
    }
    if (req.file && a.evidence_file) rm(a.evidence_file);
    const keys = Object.keys(fields);
    db.prepare(`UPDATE achievements SET ${keys.map((k) => k + '=?').join(', ')}, status='pending', student_note=?, updated_at=? WHERE id=?`)
      .run(...keys.map((k) => fields[k]), String(b.student_note || '').trim() || a.student_note, ts, a.id);
    H.audit('achievement', a.id, req.user, a.status === 'pending' ? 'edited' : 'resubmitted', String(b.student_note || '').trim() || null);
    const fresh = H.liveAch(a.id);
    if (a.status !== 'pending') H.notifyReviewers(fresh, req.user);
    res.json(H.shapeAch(fresh));
  });

  app.post('/api/achievements/:id/respond', needStudent, (req, res) => {
    const a = H.liveAch(req.params.id);
    if (!a || a.user_id !== req.user.id) return res.status(404).json({ error: 'Not found.' });
    const msg = String((req.body || {}).message || '').trim();
    if (msg.length < 5) return res.status(422).json({ error: 'Please write your explanation.' });
    db.prepare("UPDATE achievements SET student_note=?, status='pending', updated_at=? WHERE id=?").run(msg, H.now(), a.id);
    H.audit('achievement', a.id, req.user, 'student responded', msg);
    H.notifyReviewers(H.liveAch(a.id), req.user);
    res.json({ ok: true });
  });

  app.delete('/api/achievements/:id', needStudent, (req, res) => {
    const a = H.liveAch(req.params.id);
    if (!a || a.user_id !== req.user.id) return res.status(404).json({ error: 'Not found.' });
    if (a.status === 'verified') {
      if (a.deletion_requested) return res.json({ requested: true });
      db.prepare('UPDATE achievements SET deletion_requested=1, updated_at=? WHERE id=?').run(H.now(), a.id);
      H.audit('achievement', a.id, req.user, 'deletion requested', null);
      H.notifyReviewers(a, req.user, 'delete');
      return res.json({ requested: true });
    }
    db.prepare('UPDATE achievements SET deleted_at=?, updated_at=? WHERE id=?').run(H.now(), H.now(), a.id);
    H.audit('achievement', a.id, req.user, 'deleted', null);
    res.json({ deleted: true });
  });

  app.get('/api/achievements/:id/history', needUser, (req, res) => {
    const a = db.prepare('SELECT * FROM achievements WHERE id = ?').get(req.params.id);
    if (!a || (a.user_id !== req.user.id && !H.canReview(req.user, a))) return res.status(404).json({ error: 'Not found.' });
    res.json(auditHistory(a));
  });

  /* ---- evidence download ---- */
  function sendEvidence(res, a, file, name, mime) {
    const p = path.join(UPLOAD_DIR, path.basename(file));
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'File missing.' });
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const inline = mime === 'application/pdf' || mime.startsWith('image/');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(name)}"`);
    if (mime.startsWith('image/')) res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    fs.createReadStream(p).pipe(res);
  }
  app.get('/api/achievements/:id/evidence', needUser, (req, res) => {
    const a = db.prepare('SELECT * FROM achievements WHERE id = ?').get(req.params.id);
    if (!a || !a.evidence_file) return res.status(404).json({ error: 'No evidence.' });
    const u = req.user;
    let ok = a.user_id === u.id || u.role === 'admin' || H.canReview(u, a);
    if (!ok && u.role === 'lecturer') {
      const grants = db.prepare("SELECT achievement_ids FROM shares WHERE student_id=? AND recipient_id=? AND revoked_at IS NULL AND expires_at > ?").all(a.user_id, u.id, H.now());
      ok = grants.some((g) => H.parse(g.achievement_ids, []).includes(a.id)) && a.status === 'verified';
    }
    if (!ok) return res.status(403).json({ error: 'Not allowed.' });
    sendEvidence(res, a, a.evidence_file, a.evidence_name, a.evidence_mime);
  });

  /* ---- staff queue & review ---- */
  app.get('/api/review/queue', needStaff, (req, res) => {
    const rows = db.prepare(`SELECT * FROM achievements WHERE deleted_at IS NULL AND (status IN ('pending','flagged') OR pending_changes IS NOT NULL OR deletion_requested = 1) ORDER BY created_at`).all()
      .filter((a) => H.canReview(req.user, a));
    res.json(rows.map((a) => {
      const s = H.getUser(a.user_id);
      return H.shapeAch(a, { student: { id: s.id, name: s.name, initials: H.initials(s.name), student_id: s.student_id, programme: s.programme }, history: auditHistory(a).slice(-4) });
    }));
  });

  app.post('/api/review/:id', needStaff, (req, res) => {
    const a = H.liveAch(req.params.id);
    if (!a) return res.status(404).json({ error: 'Not found.' });
    if (!H.canReview(req.user, a)) return res.status(403).json({ error: 'You are not allowed to review this item.' });
    const { action, note, tier } = req.body || {};
    if (['verify', 'reject', 'clarify', 'flag'].includes(action) && !(a.status === 'pending' || a.status === 'flagged')) return res.status(409).json({ error: 'This item is not waiting for review.' });
    const r = applyReview(req.user, a, action, note, tier);
    if (r.error) return res.status(r.status || 400).json({ error: r.error });
    res.json({ ok: true });
  });

  /* ---- one-time email link (no portal login) ---- */
  function tokenRow(t) {
    const r = db.prepare('SELECT * FROM review_tokens WHERE token_hash = ?').get(H.sha(String(t || '')));
    if (!r || r.used || new Date(r.expires_at) < new Date()) return null;
    return r;
  }
  app.get('/api/review-link/:token', (req, res) => {
    const r = tokenRow(req.params.token);
    if (!r) return res.status(410).json({ error: 'This review link has expired or was already used.' });
    const a = H.liveAch(r.achievement_id);
    const v = H.getUser(r.verifier_id);
    if (!a || !v) return res.status(404).json({ error: 'Not found.' });
    const s = H.getUser(a.user_id);
    res.json({ item: H.shapeAch(a), student: { name: s.name, student_id: s.student_id, programme: s.programme }, verifier: { name: v.name, title: v.title } });
  });
  app.get('/api/review-link/:token/evidence', (req, res) => {
    const r = tokenRow(req.params.token);
    const a = r && H.liveAch(r.achievement_id);
    if (!a || !a.evidence_file) return res.status(404).json({ error: 'No evidence.' });
    sendEvidence(res, a, a.evidence_file, a.evidence_name, a.evidence_mime);
  });
  app.post('/api/review-link/:token', (req, res) => {
    const r = tokenRow(req.params.token);
    if (!r) return res.status(410).json({ error: 'This review link has expired or was already used.' });
    const a = H.liveAch(r.achievement_id);
    const v = H.getUser(r.verifier_id);
    if (!a || !v || v.status !== 'active') return res.status(404).json({ error: 'Not found.' });
    const { action, note, tier } = req.body || {};
    if (!['verify', 'reject', 'clarify'].includes(action)) return res.status(400).json({ error: 'Choose approve, reject or ask for clarification.' });
    if (!(a.status === 'pending' || a.status === 'flagged')) return res.status(409).json({ error: 'This item has already been reviewed.' });
    const out = applyReview(v, a, action, note, tier);
    if (out.error) return res.status(out.status || 400).json({ error: out.error });
    db.prepare('UPDATE review_tokens SET used = 1 WHERE token_hash = ?').run(r.token_hash);
    H.audit('achievement', a.id, v, 'reviewed via email link', null);
    res.json({ ok: true });
  });
};
module.exports.applyReview = applyReview;

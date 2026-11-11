'use strict';
// Opportunities board (staff post, everyone reads, students get notified) and the student "deadlines & reminders" feed.
const { db } = require('../src/db');
const H = require('../src/helpers');

const KINDS = ['Internship', 'Industrial attachment', 'Scholarship', 'Competition', 'Workshop / training', 'Job / graduate role', 'Other'];
const POSTER_ROLES = ['lecturer', 'verifier', 'admin'];
const MAX_POSTS_PER_DAY = 10;

const needUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Please sign in.' }));
const needStudent = (req, res, next) => (!req.user ? res.status(401).json({ error: 'Please sign in.' }) : req.user.role === 'student' ? next() : res.status(403).json({ error: 'Students only.' }));
const needPoster = (req, res, next) => (!req.user ? res.status(401).json({ error: 'Please sign in.' }) : POSTER_ROLES.includes(req.user.role) ? next() : res.status(403).json({ error: 'Only staff can post opportunities.' }));

const todayStr = () => new Date().toISOString().slice(0, 10);
const isRealDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z')) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;
// whole days from now until the end of a date-only string (or until an ISO timestamp)
function daysUntil(v) {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return Math.round((Date.parse(v + 'T00:00:00Z') - Date.parse(todayStr() + 'T00:00:00Z')) / 86400000); // calendar days: 0 = today
  return Math.ceil((new Date(v) - Date.now()) / 86400000);
}
function safeUrl(v) {
  try { const u = new URL(v); return (u.protocol === 'https:' || u.protocol === 'http:') ? u.toString() : null; } catch { return null; }
}

function shape(o, viewer) {
  return {
    id: o.id, title: o.title, kind: o.kind, organisation: o.organisation, description: o.description, link: o.link,
    deadline: o.deadline, days_left: daysUntil(o.deadline), created_at: o.created_at,
    poster_name: o.poster_name, poster_role: o.poster_role, poster_title: o.poster_title,
    can_remove: viewer.role === 'admin' || o.posted_by === viewer.id,
    my_application: viewer.role === 'student' ? (db.prepare('SELECT status FROM applications WHERE opportunity_id=? AND student_id=?').get(o.id, viewer.id) || {}).status || null : null,
    applicants: viewer.role === 'admin' || o.posted_by === viewer.id ? db.prepare('SELECT COUNT(*) c FROM applications WHERE opportunity_id=?').get(o.id).c : null,
  };
}

function validate(b) {
  const f = {};
  const title = String(b.title || '').trim();
  const kind = String(b.kind || '');
  const organisation = String(b.organisation || '').trim();
  const description = String(b.description || '').trim();
  const linkRaw = String(b.link || '').trim();
  const deadline = String(b.deadline || '').trim();
  if (title.length < 3 || title.length > 120) f.title = 'Enter a title of 3 to 120 characters.';
  if (!KINDS.includes(kind)) f.kind = 'Choose what kind of opportunity this is.';
  if (organisation.length > 120) f.organisation = 'Keep the organisation name under 120 characters.';
  if (description.length < 10 || description.length > 1000) f.description = 'Describe the opportunity in 10 to 1000 characters.';
  let link = null;
  if (linkRaw) { link = linkRaw.length <= 500 ? safeUrl(linkRaw) : null; if (!link) f.link = 'Enter a full web address starting with http:// or https://.'; }
  if (deadline) { if (!isRealDate(deadline)) f.deadline = 'Enter a valid closing date.'; else if (deadline < todayStr()) f.deadline = 'The closing date cannot be in the past.'; }
  return { f, v: { title, kind, organisation: organisation || null, description, link, deadline: deadline || null } };
}

/* ---------- student deadlines & reminders feed ---------- */
function studentFeed(user) {
  const items = [];
  const add = (type, ic, title, detail, link, due, action) => {
    const days = daysUntil(due);
    let urgency = action ? 'action' : 'info';
    if (days !== null) urgency = days < 0 ? 'overdue' : days <= 3 ? 'urgent' : days <= 14 ? 'soon' : (action ? 'action' : 'info');
    items.push({ type, icon: ic, title, detail, link, due: due || null, days, urgency });
  };
  const pageFor = (kind) => (kind === 'activity' ? '/activities' : kind === 'project' ? '/projects' : '/achievements');

  // records the student must respond to
  for (const a of db.prepare("SELECT * FROM achievements WHERE user_id=? AND deleted_at IS NULL AND status IN ('clarification','flagged') ORDER BY updated_at DESC").all(user.id)) {
    add('record', a.status === 'flagged' ? 'flag' : 'circle-help', a.status === 'flagged' ? `Explain “${a.title}”` : `More information needed: “${a.title}”`,
      a.status === 'flagged' ? 'A reviewer flagged this entry and is waiting for your explanation.' : 'A reviewer asked a question before they can verify it.', pageFor(a.kind), null, true);
  }
  // recently rejected records
  const twoWeeks = new Date(Date.now() - 14 * 86400000).toISOString();
  for (const a of db.prepare("SELECT * FROM achievements WHERE user_id=? AND deleted_at IS NULL AND status='rejected' AND reviewed_at > ? ORDER BY reviewed_at DESC").all(user.id, twoWeeks)) {
    add('record', 'triangle-alert', `Rejected: “${a.title}”`, a.review_note ? `Reason: ${a.review_note}` : 'Open it to read the reviewer’s reason.', pageFor(a.kind), null, true);
  }
  // recommendation letters
  for (const l of db.prepare("SELECT * FROM letters WHERE student_id=? AND status IN ('requested','drafting','revision_requested') ORDER BY id DESC").all(user.id)) {
    const lec = H.getUser(l.lecturer_id);
    add('letter', 'file-text', `${l.purpose} letter`, `With ${lec ? lec.name : 'your lecturer'} · ${l.status === 'requested' ? 'waiting to be started' : l.status === 'drafting' ? 'being written' : 'revision requested'}`, `/letters/${l.id}`, l.deadline || null, false);
  }
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  for (const l of db.prepare("SELECT * FROM letters WHERE student_id=? AND status='approved' AND approved_at > ? ORDER BY approved_at DESC").all(user.id, weekAgo)) {
    add('letter', 'circle-check', `Your ${l.purpose} letter is ready`, 'Approved by your lecturer. You can view and download it.', `/letters/${l.id}`, null, true);
  }
  // share links about to expire
  const soon = new Date(Date.now() + 7 * 86400000).toISOString();
  for (const s of db.prepare("SELECT * FROM shares WHERE student_id=? AND kind='link' AND revoked_at IS NULL AND expires_at > ? AND expires_at <= ? ORDER BY expires_at").all(user.id, H.now(), soon)) {
    add('share', 'link', `Share link “${s.label || 'Profile link'}” expires soon`, `${s.view_count} view${s.view_count === 1 ? '' : 's'} so far. Create a new link if the recipient still needs access.`, '/sharing', s.expires_at, false);
  }
  // opportunities closing within two weeks
  for (const o of db.prepare('SELECT * FROM opportunities WHERE removed_at IS NULL AND deadline IS NOT NULL AND deadline >= ? AND deadline <= ? ORDER BY deadline').all(todayStr(), new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10))) {
    add('opportunity', 'briefcase', `Closing: ${o.title}`, `${o.kind}${o.organisation ? ' · ' + o.organisation : ''}`, '/opportunities', o.deadline, false);
  }
  // gentle nudge to finish the profile
  const missing = H.profileStrength(user).missing;
  if (missing.length) add('profile', 'user', 'Complete your profile', `Next step: ${missing[0].charAt(0).toLowerCase()}${missing[0].slice(1)}.`, '/profile', null, false);

  const rank = { overdue: 0, action: 1, urgent: 2, soon: 3, info: 4 };
  items.sort((a, b) => rank[a.urgency] - rank[b.urgency] || String(a.due || '9').localeCompare(String(b.due || '9')));
  return items;
}

module.exports = (app) => {
  app.get('/api/opportunities', needUser, (req, res) => {
    const kind = String(req.query.kind || '');
    const rows = db.prepare(`SELECT o.*, u.name AS poster_name, u.role AS poster_role, u.title AS poster_title
      FROM opportunities o JOIN users u ON u.id = o.posted_by
      WHERE o.removed_at IS NULL AND (o.deadline IS NULL OR o.deadline >= ?) ORDER BY o.id DESC`).all(todayStr());
    res.json({ kinds: KINDS, canPost: POSTER_ROLES.includes(req.user.role), items: rows.filter((o) => !kind || o.kind === kind).map((o) => shape(o, req.user)) });
  });

  app.post('/api/opportunities', needPoster, (req, res) => {
    const { f, v } = validate(req.body || {});
    if (Object.keys(f).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', fields: f });
    const dayAgo = new Date(Date.now() - 86400000).toISOString();
    if (db.prepare('SELECT COUNT(*) c FROM opportunities WHERE posted_by=? AND created_at > ?').get(req.user.id, dayAgo).c >= MAX_POSTS_PER_DAY) {
      return res.status(429).json({ error: `You can post up to ${MAX_POSTS_PER_DAY} opportunities per day.` });
    }
    const r = db.prepare('INSERT INTO opportunities (title, kind, organisation, description, link, deadline, posted_by, created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(v.title, v.kind, v.organisation, v.description, v.link, v.deadline, req.user.id, H.now());
    const id = Number(r.lastInsertRowid);
    H.audit('opportunity', id, req.user, 'opportunity posted', `${v.kind}: ${v.title}`);
    const students = db.prepare("SELECT id FROM users WHERE role='student' AND status='active'").all();
    const text = `New ${v.kind.toLowerCase()}: “${v.title}”${v.deadline ? ` — closes ${v.deadline}` : ''}.`;
    db.exec('BEGIN');
    try { for (const s of students) H.notify(s.id, text, '/opportunities'); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    const row = db.prepare('SELECT o.*, u.name AS poster_name, u.role AS poster_role, u.title AS poster_title FROM opportunities o JOIN users u ON u.id=o.posted_by WHERE o.id=?').get(id);
    res.status(201).json({ item: shape(row, req.user), notified: students.length });
  });

  app.delete('/api/opportunities/:id', needPoster, (req, res) => {
    const o = db.prepare('SELECT * FROM opportunities WHERE id=? AND removed_at IS NULL').get(Number(req.params.id));
    if (!o) return res.status(404).json({ error: 'Opportunity not found.' });
    if (req.user.role !== 'admin' && o.posted_by !== req.user.id) return res.status(403).json({ error: 'You can only remove opportunities you posted.' });
    db.prepare('UPDATE opportunities SET removed_at=? WHERE id=?').run(H.now(), o.id);
    H.audit('opportunity', o.id, req.user, 'opportunity removed', o.title);
    res.json({ ok: true });
  });

  app.get('/api/student/deadlines', needStudent, (req, res) => res.json({ items: studentFeed(req.user) }));
};
module.exports.KINDS = KINDS;
module.exports.studentFeed = studentFeed;

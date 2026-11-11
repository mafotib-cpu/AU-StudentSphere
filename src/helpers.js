'use strict';
const crypto = require('crypto');
const { db } = require('./db');

const PORT = process.env.PORT || 3000;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const DEMO_MODE = process.env.DEMO_MODE !== '0';

const now = () => new Date().toISOString();
const addMinutes = (m) => new Date(Date.now() + m * 60000).toISOString();
const addDays = (d) => new Date(Date.now() + d * 86400000).toISOString();
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const rand = (n = 32) => crypto.randomBytes(n).toString('hex');
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

/* ---------- passwords ---------- */
function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function checkPw(pw, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, h] = stored.split(':');
  const hb = Buffer.from(h, 'hex');
  const c = crypto.scryptSync(String(pw), salt, 64);
  return hb.length === c.length && crypto.timingSafeEqual(hb, c);
}
function pwProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must include letters and at least one number.';
  return null;
}

/* ---------- mail ---------- */
let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = require('nodemailer').createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === '1',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}
function sendMail(to, subject, body) {
  db.prepare('INSERT INTO outbox (to_addr, subject, body, at) VALUES (?,?,?,?)').run(to, subject, body, now());
  if (transporter) {
    transporter.sendMail({
      from: process.env.MAIL_FROM || 'AU StudentSphere <no-reply@africau.edu>',
      to, subject, text: body,
    }).catch((e) => console.error('[mail] failed:', e.message));
  }
}
const mailTo = (u) => (u.alumni && u.personal_email ? u.personal_email : u.email);

/* ---------- users ---------- */
const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, email: u.email, personal_email: u.personal_email, name: u.name, role: u.role,
    verifier_type: u.verifier_type, title: u.title, student_id: u.student_id, programme: u.programme,
    year: u.year, enrolled: u.enrolled, graduation: u.graduation, phone: u.phone, about: u.about,
    status: u.status, alumni: !!u.alumni, identity_confirmed: !!u.identity_confirmed,
    email_notifications: !!u.email_notifications,
  };
}
const initials = (name) => String(name || '?').replace(/^(Dr\.?|Prof\.?|Mr\.?|Ms\.?|Mrs\.?)\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

/* ---------- notifications & audit ---------- */
function notify(userId, text, link, opts = {}) {
  const u = getUser(userId);
  if (!u) return;
  db.prepare('INSERT INTO notifications (user_id, text, link, read, at) VALUES (?,?,?,0,?)').run(userId, text, link || null, now());
  if (opts.email || u.email_notifications) {
    sendMail(mailTo(u), opts.subject || 'AU StudentSphere notification',
      `Hello ${u.name},\n\n${text}\n\n${link ? `Open: ${BASE_URL}/#${link}\n\n` : ''}AU StudentSphere`);
  }
}
function audit(entity, entityId, actor, action, detail) {
  db.prepare('INSERT INTO audit (entity, entity_id, actor_id, actor_name, action, detail, at) VALUES (?,?,?,?,?,?,?)')
    .run(entity, entityId, actor ? actor.id : null, actor ? actor.name : 'System', action, detail || null, now());
}

/* ---------- taxonomy ---------- */
const CATEGORIES = [
  'Academic award', "Dean's List", 'Scholarship / bursary', 'Conference / seminar', 'Certification',
  'Club / society', 'Sports', 'Debate & public speaking', 'Leadership', 'Volunteering',
  'Technical / professional', 'Entrepreneurship', 'Project', 'Pre-university',
];
const EVIDENCE_REQUIRED = ['Academic award', 'Scholarship / bursary', 'Certification', 'Conference / seminar'];
const VERIFIER_TYPES = {
  lecturer: 'Lecturer',
  records_office: 'Academic Records Office',
  department_head: 'Department head (Sports Director, Chaplaincy…)',
  supervisor: 'Attachment / project supervisor',
};
const LEVELS = ['', 'University', 'Local / regional', 'National', 'International'];
const RESULTS = ['', 'Participation', 'Finalist / merit', 'Winner / top position'];
const RESPONSIBILITY = ['', 'Participant', 'Contributor', 'Lead / office-bearer'];
const DURATION = ['', 'One-off event', 'A semester', 'A year or more'];

function scoreTier(a) {
  const s = (Number(a.level) || 1) + (Number(a.result) || 1) + (Number(a.responsibility) || 1) + (Number(a.duration) || 1);
  return s >= 10 ? 'major' : s >= 7 ? 'moderate' : 'minor';
}

/* ---------- academic results ---------- */
function gradeFor(mark) {
  if (mark >= 90) return { grade: 'A', points: 4.0 };
  if (mark >= 80) return { grade: 'A-', points: 3.7 };
  if (mark >= 75) return { grade: 'B+', points: 3.3 };
  if (mark >= 70) return { grade: 'B', points: 3.0 };
  if (mark >= 65) return { grade: 'B-', points: 2.7 };
  if (mark >= 60) return { grade: 'C+', points: 2.3 };
  if (mark >= 55) return { grade: 'C', points: 2.0 };
  if (mark >= 50) return { grade: 'D', points: 1.0 };
  return { grade: 'F', points: 0 };
}
function gpaOf(rows) {
  const graded = rows.filter((r) => r.grade !== 'F' || true);
  const cr = graded.reduce((s, r) => s + r.credits, 0);
  if (!cr) return 0;
  return graded.reduce((s, r) => s + r.points * r.credits, 0) / cr;
}
function academicRecord(userId) {
  const rows = db.prepare('SELECT * FROM results WHERE user_id = ? ORDER BY term_order, module').all(userId);
  const terms = {};
  for (const r of rows) (terms[r.term] = terms[r.term] || { term: r.term, order: r.term_order, rows: [] }).rows.push(r);
  const list = Object.values(terms).sort((a, b) => a.order - b.order).map((t) => ({
    term: t.term, order: t.order, rows: t.rows,
    credits: t.rows.reduce((s, r) => s + r.credits, 0), gpa: gpaOf(t.rows),
  }));
  const earned = rows.filter((r) => r.grade !== 'F').reduce((s, r) => s + r.credits, 0);
  return {
    gpa: gpaOf(rows), credits: earned, terms: list,
    current: list.length ? list[list.length - 1] : null,
  };
}
function cohortPercentile(userId) {
  const all = db.prepare("SELECT u.id FROM users u WHERE u.role='student' AND u.status='active' AND EXISTS (SELECT 1 FROM results r WHERE r.user_id=u.id)").all();
  if (all.length < 10) return null;
  const mine = gpaOf(db.prepare('SELECT * FROM results WHERE user_id = ?').all(userId));
  let better = 0;
  for (const s of all) if (s.id !== userId && gpaOf(db.prepare('SELECT * FROM results WHERE user_id = ?').all(s.id)) > mine + 1e-9) better++;
  return Math.max(1, Math.round(((better + 1) / all.length) * 100));
}

/* ---------- achievements ---------- */
function shapeAch(a, extra = {}) {
  if (!a) return null;
  const reviewer = a.reviewed_by ? getUser(a.reviewed_by) : null;
  const verifier = a.verifier_id ? getUser(a.verifier_id) : null;
  return {
    id: a.id, user_id: a.user_id, kind: a.kind, title: a.title, issuer: a.issuer, role_text: a.role_text,
    date: a.date, ongoing: !!a.ongoing, description: a.description,
    categories: parse(a.categories, []), pre_university: !!a.pre_university,
    level: a.level, result: a.result, responsibility: a.responsibility, duration: a.duration,
    tier_suggested: a.tier_suggested, tier: a.tier,
    verifier_type: a.verifier_type, verifier_id: a.verifier_id, verifier_name: verifier ? verifier.name : null,
    status: a.status, review_note: a.review_note,
    reviewed_by_name: reviewer ? `${reviewer.name}${reviewer.title && reviewer.title !== reviewer.name ? ', ' + reviewer.title : ''}` : null,
    reviewed_at: a.reviewed_at, student_note: a.student_note, no_evidence_reason: a.no_evidence_reason,
    evidence: a.evidence_file ? { name: a.evidence_name, size: a.evidence_size, mime: a.evidence_mime } : null,
    change_pending: !!a.pending_changes, pending_changes: parse(a.pending_changes, null),
    deletion_requested: !!a.deletion_requested, submitted_by: a.submitted_by,
    created_at: a.created_at, updated_at: a.updated_at,
    ...extra,
  };
}
const liveAch = (id) => db.prepare('SELECT * FROM achievements WHERE id = ? AND deleted_at IS NULL').get(id);

function reviewers(a) {
  // users who may review this achievement
  if (a.verifier_id) {
    const v = getUser(a.verifier_id);
    return v && v.status === 'active' ? [v] : [];
  }
  return db.prepare("SELECT * FROM users WHERE status='active' AND ((role IN ('lecturer','verifier') AND verifier_type = ?) )").all(a.verifier_type || 'lecturer')
    .filter((u) => u.id !== a.user_id && u.id !== a.submitted_by);
}
function canReview(user, a) {
  if (user.role === 'admin') return a.user_id !== user.id;
  if (user.role !== 'lecturer' && user.role !== 'verifier') return false;
  if (a.user_id === user.id || a.submitted_by === user.id) return false;
  if (a.verifier_id) return a.verifier_id === user.id;
  return (a.verifier_type || 'lecturer') === user.verifier_type;
}

function mkReviewToken(achievementId, verifierId) {
  const t = rand(24);
  db.prepare('INSERT INTO review_tokens (token_hash, achievement_id, verifier_id, expires_at, used) VALUES (?,?,?,?,0)')
    .run(sha(t), achievementId, verifierId, addDays(14));
  return t;
}
function notifyReviewers(a, student, kind = 'new') {
  const list = reviewers(a);
  for (const v of list) {
    const token = mkReviewToken(a.id, v.id);
    const what = kind === 'change' ? 'a change request on a verified record' : kind === 'delete' ? 'a deletion request' : 'a new item to verify';
    notify(v.id, `${student.name} submitted ${what}: “${a.title}”.`, '/queue');
    sendMail(mailTo(v), `Verification request: ${a.title}`,
      `Hello ${v.name},\n\n${student.name} (${student.student_id || 'student'}) has submitted “${a.title}” for verification.\n\n` +
      `You can approve or reject it without signing in to the full portal (link valid 14 days, single use):\n${BASE_URL}/#/review?token=${token}\n\n` +
      `Or review it in your queue: ${BASE_URL}/#/queue\n\nAU StudentSphere`);
  }
  return list.length;
}

/* ---------- profile builders ---------- */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function fmtMonth(d) {
  if (!d) return '';
  const [y, m] = String(d).split('-');
  return m ? `${MONTHS[Number(m) - 1]} ${y}` : y;
}
const STRENGTH = {
  'Academic award': 'Academic excellence', "Dean's List": 'Academic excellence', 'Scholarship / bursary': 'Academic excellence',
  'Conference / seminar': 'Scholarly engagement', Certification: 'Professional development',
  'Club / society': 'Community involvement', Sports: 'Teamwork and discipline', 'Debate & public speaking': 'Communication',
  Leadership: 'Collaborative leadership', Volunteering: 'Social impact', 'Technical / professional': 'Technical initiative',
  Entrepreneurship: 'Entrepreneurship', Project: 'Technical initiative', 'Pre-university': 'Early promise',
};

function profileFor(studentId, opts = {}) {
  // opts.itemIds: array of ids | 'all'  (verified only unless opts.includeUnverified)
  const s = getUser(studentId);
  if (!s) return null;
  let rows = db.prepare("SELECT * FROM achievements WHERE user_id = ? AND deleted_at IS NULL ORDER BY date DESC").all(studentId);
  if (!opts.includeUnverified) rows = rows.filter((r) => r.status === 'verified');
  if (Array.isArray(opts.itemIds)) rows = rows.filter((r) => opts.itemIds.includes(r.id));
  const items = rows.map((r) => shapeAch(r));
  const rec = opts.includeResults === false ? null : academicRecord(studentId);
  const skills = opts.includeSkills === false ? [] : db.prepare('SELECT name, type FROM skills WHERE user_id = ? ORDER BY type, name').all(studentId);
  const strengths = [...new Set(items.flatMap((i) => i.categories.map((c) => STRENGTH[c]).filter(Boolean)))];
  return {
    student: {
      id: s.id, name: s.name, initials: initials(s.name), student_id: s.student_id, programme: s.programme,
      year: s.year, enrolled: s.enrolled, graduation: s.graduation, about: s.about, alumni: !!s.alumni,
      identity_confirmed: !!s.identity_confirmed,
    },
    academic: rec ? { gpa: rec.gpa, credits: rec.credits, required: s.credits_required, percentile: cohortPercentile(studentId), terms: rec.terms } : null,
    items, skills, strengths,
  };
}

function buildSummary(p, purpose) {
  const n = p.student.name;
  const first = n.split(' ')[0];
  const g = p.academic ? p.academic.gpa : null;
  const perf = g == null ? 'committed' : g >= 3.7 ? 'high-performing' : g >= 3.0 ? 'strong' : 'dedicated';
  const pct = p.academic && p.academic.percentile ? `, placing them in the top ${p.academic.percentile}% of their cohort` : '';
  const acad = g != null ? ` with a cumulative GPA of ${g.toFixed(2)}${pct}` : '';
  const kinds = new Set(p.items.map((i) => i.kind));
  const breadth = [kinds.has('achievement') ? 'recognised achievement' : null, p.items.some((i) => i.categories.includes('Leadership') || i.categories.includes('Club / society')) ? 'meaningful leadership' : null,
    kinds.has('project') ? 'technical project work' : null, p.items.some((i) => i.categories.includes('Volunteering')) ? 'community engagement' : null].filter(Boolean);
  const lead = `${first} is a ${perf} ${p.student.programme || ''} student${acad}. Their record demonstrates ${breadth.length ? breadth.join(', ').replace(/, ([^,]*)$/, ' and $1') : 'steady progress'}`;
  const text = `${lead}${purpose ? `, providing a strong foundation for ${purpose.toLowerCase()}` : ''}.`;
  const highlights = p.items.slice(0, 8).map((i) => {
    const bits = [i.title];
    if (i.issuer) bits.push(i.issuer);
    return `${bits.join(' — ')} (${fmtMonth(i.date)}${i.ongoing ? ' – present' : ''}). ${i.description}`;
  });
  return { lead, text, highlights };
}

function profileStrength(user) {
  const has = (kind) => db.prepare("SELECT 1 FROM achievements WHERE user_id=? AND kind=? AND status='verified' AND deleted_at IS NULL").get(user.id, kind);
  const checks = [
    ['Add a phone number', !!user.phone],
    ['Add a backup personal email', !!user.personal_email],
    ['Write a short “About” summary', !!(user.about && user.about.length > 20)],
    ['List at least one skill', !!db.prepare('SELECT 1 FROM skills WHERE user_id=?').get(user.id)],
    ['Get an achievement verified', !!has('achievement')],
    ['Get an activity or club role verified', !!has('activity')],
    ['Get a project or certificate verified', !!has('project')],
    ['Add a faculty reference (request a recommendation letter)', !!db.prepare("SELECT 1 FROM letters WHERE student_id=? AND status='approved'").get(user.id)],
  ];
  const done = checks.filter((c) => c[1]).length;
  return { percent: Math.round((done / checks.length) * 100), missing: checks.filter((c) => !c[1]).map((c) => c[0]) };
}

/* ---------- access logging ---------- */
function logAccess(studentId, viewer, via, shareId, label) {
  const lab = label || (viewer ? `${viewer.name}${viewer.title && viewer.title !== viewer.name ? ', ' + viewer.title : ''}` : 'Anyone with the link');
  db.prepare('INSERT INTO access_log (student_id, viewer_id, viewer_label, via, share_id, at) VALUES (?,?,?,?,?,?)')
    .run(studentId, viewer ? viewer.id : null, lab, via, shareId || null, now());
  // throttle notifications: one per viewer per share/day
  const since = new Date(Date.now() - 86400000).toISOString();
  const dup = db.prepare('SELECT COUNT(*) c FROM access_log WHERE student_id=? AND viewer_label=? AND via=? AND at > ?').get(studentId, lab, via, since);
  if (dup.c <= 1) notify(studentId, `${lab} viewed your profile${via === 'link' ? ' through a shared link' : ''}.`, '/sharing');
}

function shareStatus(sh) {
  if (sh.revoked_at) return 'revoked';
  if (new Date(sh.expires_at) < new Date()) return 'expired';
  return 'active';
}

module.exports = {
  BASE_URL, DEMO_MODE, now, addMinutes, addDays, sha, rand, parse,
  hashPw, checkPw, pwProblem, sendMail, mailTo, getUser, publicUser, initials,
  notify, audit, CATEGORIES, EVIDENCE_REQUIRED, VERIFIER_TYPES, LEVELS, RESULTS, RESPONSIBILITY, DURATION,
  scoreTier, gradeFor, gpaOf, academicRecord, cohortPercentile, shapeAch, liveAch, reviewers, canReview,
  mkReviewToken, notifyReviewers, fmtMonth, profileFor, buildSummary, profileStrength, logAccess, shareStatus,
};

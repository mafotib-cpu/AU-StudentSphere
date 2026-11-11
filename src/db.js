'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  personal_email TEXT,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student','lecturer','verifier','admin')),
  verifier_type TEXT,
  title TEXT,
  pw_hash TEXT NOT NULL,
  student_id TEXT UNIQUE,
  programme TEXT,
  year INTEGER,
  enrolled TEXT,
  graduation INTEGER,
  credits_required INTEGER DEFAULT 120,
  phone TEXT,
  about TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  alumni INTEGER NOT NULL DEFAULT 0,
  identity_confirmed INTEGER NOT NULL DEFAULT 0,
  email_notifications INTEGER NOT NULL DEFAULT 0,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip TEXT, ua TEXT
);
CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  last_sent TEXT
);
CREATE TABLE IF NOT EXISTS reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS login_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER, email TEXT, success INTEGER NOT NULL, reason TEXT,
  ip TEXT, ua TEXT, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  term TEXT NOT NULL, term_order INTEGER NOT NULL,
  module TEXT NOT NULL, code TEXT NOT NULL,
  credits INTEGER NOT NULL, mark INTEGER NOT NULL,
  grade TEXT NOT NULL, points REAL NOT NULL,
  imported_by INTEGER, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL, type TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  submitted_by INTEGER,
  kind TEXT NOT NULL CHECK (kind IN ('achievement','activity','project')),
  title TEXT NOT NULL,
  issuer TEXT,
  role_text TEXT,
  date TEXT NOT NULL,
  ongoing INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  categories TEXT NOT NULL DEFAULT '[]',
  pre_university INTEGER NOT NULL DEFAULT 0,
  level INTEGER, result INTEGER, responsibility INTEGER, duration INTEGER,
  tier_suggested TEXT, tier TEXT,
  verifier_type TEXT, verifier_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  review_note TEXT, reviewed_by INTEGER, reviewed_at TEXT,
  student_note TEXT,
  no_evidence_reason TEXT,
  evidence_name TEXT, evidence_file TEXT, evidence_mime TEXT, evidence_size INTEGER,
  pending_changes TEXT,
  deletion_requested INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL, entity_id INTEGER,
  actor_id INTEGER, actor_name TEXT,
  action TEXT NOT NULL, detail TEXT, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS review_tokens (
  token_hash TEXT PRIMARY KEY,
  achievement_id INTEGER NOT NULL REFERENCES achievements(id),
  verifier_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS letters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES users(id),
  lecturer_id INTEGER NOT NULL REFERENCES users(id),
  purpose TEXT NOT NULL, purpose_detail TEXT, key_points TEXT, deadline TEXT,
  achievement_ids TEXT NOT NULL DEFAULT '[]',
  include_results INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'requested',
  draft_text TEXT, final_text TEXT, decline_reason TEXT, revision_note TEXT,
  share_id INTEGER,
  last_reminder TEXT, student_reminded_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, approved_at TEXT
);
CREATE TABLE IF NOT EXISTS shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('link','lecturer')),
  token TEXT UNIQUE,
  label TEXT, purpose TEXT,
  recipient_id INTEGER,
  achievement_ids TEXT NOT NULL DEFAULT '[]',
  include_results INTEGER NOT NULL DEFAULT 0,
  include_skills INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES users(id),
  viewer_id INTEGER, viewer_label TEXT NOT NULL,
  via TEXT NOT NULL, share_id INTEGER, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  text TEXT NOT NULL, link TEXT,
  read INTEGER NOT NULL DEFAULT 0, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_addr TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', response TEXT, responded_by INTEGER,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, kind TEXT NOT NULL, organisation TEXT,
  description TEXT NOT NULL, link TEXT, deadline TEXT,
  posted_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL, removed_at TEXT
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  plan TEXT NOT NULL DEFAULT 'premium',
  status TEXT NOT NULL DEFAULT 'active',
  started_at TEXT NOT NULL, current_period_end TEXT NOT NULL,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'USD',
  provider TEXT NOT NULL, reference TEXT NOT NULL, status TEXT NOT NULL, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL,
  link TEXT, body TEXT, premium INTEGER NOT NULL DEFAULT 0,
  posted_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL, removed_at TEXT
);
CREATE TABLE IF NOT EXISTS threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES users(id),
  staff_id INTEGER NOT NULL REFERENCES users(id),
  subject TEXT NOT NULL,
  student_unread INTEGER NOT NULL DEFAULT 0, staff_unread INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, last_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES threads(id),
  sender_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id),
  student_id INTEGER NOT NULL REFERENCES users(id),
  note TEXT, status TEXT NOT NULL DEFAULT 'submitted', staff_note TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (opportunity_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_sub_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_thread_student ON threads(student_id);
CREATE INDEX IF NOT EXISTS idx_thread_staff ON threads(staff_id);
CREATE INDEX IF NOT EXISTS idx_msg_thread ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_app_opp ON applications(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opp_active ON opportunities(removed_at, deadline);
CREATE INDEX IF NOT EXISTS idx_ach_user ON achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_ach_status ON achievements(status);
CREATE INDEX IF NOT EXISTS idx_results_user ON results(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read);
`);

// additive migration: record when each user accepted the privacy notice
if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'privacy_accepted_at')) db.exec('ALTER TABLE users ADD COLUMN privacy_accepted_at TEXT');

module.exports = { db, DATA_DIR };

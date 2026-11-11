'use strict';
const fs = require('fs');
const path = require('path');
const { db, DATA_DIR } = require('./db');
const H = require('./helpers');

const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'Welcome@2026';

function tinyPdf(title) {
  const text = `BT /F1 20 Tf 60 740 Td (${title.replace(/[()\\]/g, '')}) Tj 0 -30 Tf /F1 12 Tf (Demo evidence file - generated for the AU StudentSphere demo.) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

function seedIfEmpty() {
  if (db.prepare('SELECT COUNT(*) c FROM users').get().c > 0) return;
  console.log('[seed] Creating demo data…');
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pw = H.hashPw(DEMO_PASSWORD);
  const ins = db.prepare(`INSERT INTO users (email, name, role, verifier_type, title, pw_hash, student_id, programme, year, enrolled, graduation, phone, about, identity_confirmed, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const staff = (email, name, role, vt, title) => ins.run(email, name, role, vt, title, pw, null, null, null, null, null, null, null, 1, H.now()).lastInsertRowid;
  const admin = staff('admin@africau.edu', 'System Administrator', 'admin', null, 'Administrator');
  const malik = staff('a.malik@africau.edu', 'Dr. A. Malik', 'lecturer', 'lecturer', 'Senior Lecturer');
  const moyo = staff('s.moyo@africau.edu', 'Dr. S. Moyo', 'lecturer', 'lecturer', 'Lecturer');
  const records = staff('records@africau.edu', 'Academic Records Office', 'verifier', 'records_office', 'Academic Records Office');
  const sports = staff('sports@africau.edu', 'Sports Director', 'verifier', 'department_head', 'Sports Director');
  const chap = staff('chaplaincy@africau.edu', 'University Chaplaincy', 'verifier', 'department_head', 'Chaplaincy');
  const sup = staff('supervisor@partner-org.com', 'Industry Supervisor', 'verifier', 'supervisor', 'Attachment supervisor');

  const stu = (email, name, sid, prog, year, enrolled, grad, phone, about, idc) =>
    ins.run(email, name, 'student', null, null, pw, sid, prog, year, enrolled, grad, phone, about, idc, H.now()).lastInsertRowid;
  const elena = stu('elena.ortiz@africau.edu', 'Elena Ortiz', 'STU-2022-0418', 'BSc Computer Science', 3, '2022-09', 2026, '+263 77 123 4567', 'Computer Science student interested in responsible AI, accessible technology, and data-driven public services.', 1);
  const jonas = stu('jonas.meyer@africau.edu', 'Jonas Meyer', 'STU-2023-0194', 'BSc Data Science', 2, '2023-09', 2027, null, null, 1);
  const amara = stu('amara.lewis@africau.edu', 'Amara Lewis', 'STU-2021-0087', 'BEng Software Engineering', 4, '2021-09', 2025, null, null, 1);
  const tariro = stu('tariro.ncube@africau.edu', 'Tariro Ncube', 'STU-2021-0311', 'BSc Agribusiness', 4, '2021-09', 2025, null, null, 0);
  const kudzai = stu('kudzai.mlambo@africau.edu', 'Kudzai Mlambo', 'STU-2024-0042', 'MSc Public Health', 2, '2024-09', 2026, null, null, 1);
  const rutendo = stu('rutendo.maseko@africau.edu', 'Rutendo Maseko', 'STU-2022-0276', 'BSc Nursing', 3, '2022-09', 2026, null, null, 1);
  const extras = [];
  const names = ['Chipo Dube', 'Tendai Banda', 'Farai Chikwanha', 'Nomsa Sibanda', 'Tatenda Moyo', 'Blessing Zulu', 'Lindiwe Ncube', 'Takudzwa Phiri'];
  names.forEach((n, i) => extras.push(stu(`${n.toLowerCase().replace(/\s+/g, '.')}@africau.edu`, n, `STU-2022-${String(500 + i)}`, 'BSc Computer Science', 3, '2022-09', 2026, null, null, 1)));

  /* results */
  const insR = db.prepare('INSERT INTO results (user_id, term, term_order, module, code, credits, mark, grade, points, imported_by, at) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const addRes = (uid, term, ord, module, code, credits, mark) => { const g = H.gradeFor(mark); insR.run(uid, term, ord, module, code, credits, mark, g.grade, g.points, records, H.now()); };
  const elenaTerms = [
    ['Fall 2022', 20223, [['Programming Fundamentals', 'CS101', 4, 94], ['Discrete Mathematics', 'MA110', 4, 90], ['Academic Writing', 'EN100', 4, 88], ['Computer Systems', 'CS110', 3, 92]]],
    ['Spring 2023', 20231, [['Data Structures', 'CS201', 4, 93], ['Calculus II', 'MA120', 4, 85], ['Statistics', 'ST200', 4, 91], ['Digital Logic', 'CS210', 4, 87]]],
    ['Fall 2023', 20233, [['Algorithms', 'CS230', 4, 92], ['Operating Systems', 'CS240', 4, 86], ['Linear Algebra', 'MA210', 4, 94], ['Ethics in Computing', 'CS250', 4, 95]]],
    ['Spring 2024', 20241, [['Computer Networks', 'CS260', 4, 83], ['Web Development', 'CS270', 3, 96], ['Probability', 'ST210', 3, 91], ['Software Design', 'CS280', 4, 89], ['Entrepreneurship', 'BU200', 3, 90]]],
    ['Fall 2024', 20243, [['Artificial Intelligence', 'CS330', 4, 95], ['Theory of Computation', 'CS310', 4, 82], ['Data Visualisation', 'CS335', 3, 93], ['Research Methods', 'RS300', 3, 90], ['Mobile Computing', 'CS345', 3, 91]]],
    ['Spring 2025', 20251, [['Machine Learning', 'CS340', 4, 91], ['Software Engineering', 'CS322', 4, 86], ['Human-Computer Interaction', 'CS315', 3, 93], ['Database Systems', 'CS308', 4, 84]]],
  ];
  for (const [t, o, mods] of elenaTerms) for (const m of mods) addRes(elena, t, o, m[0], m[1], m[2], m[3]);
  const gen = (uid, years) => {
    const mods = ['Programming', 'Mathematics', 'Systems', 'Statistics', 'Communication', 'Databases', 'Networks', 'Project'];
    const terms = [['Fall 2022', 20223], ['Spring 2023', 20231], ['Fall 2023', 20233], ['Spring 2024', 20241]].slice(0, years);
    terms.forEach(([t, o], ti) => mods.slice(0, 4).forEach((m, mi) => addRes(uid, t, o, `${m} ${ti + 1}`, `GN${ti}${mi}${uid}`, 4, Math.round(62 + rnd() * 34))));
  };
  [jonas, amara, tariro, kudzai, rutendo, ...extras].forEach((u, i) => gen(u, 2 + (i % 3)));

  /* evidence files */
  const upDir = path.join(DATA_DIR, 'uploads');
  const mkEv = (name) => { const f = H.rand(8) + '.pdf'; fs.writeFileSync(path.join(upDir, f), tinyPdf(name)); return f; };

  /* achievements */
  const insA = db.prepare(`INSERT INTO achievements (user_id, submitted_by, kind, title, issuer, role_text, date, ongoing, description, categories, pre_university, level, result, responsibility, duration,
    tier_suggested, tier, verifier_type, verifier_id, status, review_note, reviewed_by, reviewed_at, evidence_name, evidence_file, evidence_mime, evidence_size, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const A = (uid, o) => {
    const ts = new Date(Date.now() - (o.ageDays ?? 30) * 86400000).toISOString();
    const ev = o.evidence ? mkEv(o.evidence) : null;
    const tier = H.scoreTier({ level: o.level, result: o.result, responsibility: o.resp, duration: o.dur });
    const r = insA.run(uid, uid, o.kind, o.title, o.issuer, o.role || null, o.date, o.ongoing ? 1 : 0, o.desc, JSON.stringify(o.cats), 0, o.level, o.result, o.resp, o.dur,
      tier, o.status === 'verified' ? tier : null, o.vt, null, o.status, o.note || null, o.by || null, o.status === 'verified' || o.status === 'rejected' ? ts : null,
      ev ? o.evidence + '.pdf' : null, ev, ev ? 'application/pdf' : null, ev ? fs.statSync(path.join(upDir, ev)).size : null, ts, ts);
    H.audit('achievement', r.lastInsertRowid, null, 'submitted', null);
    if (o.status === 'verified') H.audit('achievement', r.lastInsertRowid, H.getUser(o.by), 'verified', `Tier: ${tier}`);
    return r.lastInsertRowid;
  };
  const ach = [];
  ach.push(A(elena, { kind: 'achievement', title: '1st Place, National Data Challenge', issuer: 'National Computing Association', date: '2025-04', desc: 'Led a team of four to develop an early-warning model for student retention.', cats: ['Academic award', 'Technical / professional', 'Leadership'], level: 3, result: 3, resp: 3, dur: 1, vt: 'lecturer', status: 'verified', by: malik, evidence: 'ncda-certificate', ageDays: 200 }));
  ach.push(A(elena, { kind: 'achievement', title: 'Dean’s List', issuer: 'School of Engineering', date: '2024-12', desc: 'Recognized for academic performance in the top 10% of the cohort.', cats: ["Dean's List", 'Academic award'], level: 1, result: 3, resp: 1, dur: 2, vt: 'records_office', status: 'verified', by: records, evidence: 'deans-list-letter', ageDays: 300 }));
  ach.push(A(elena, { kind: 'achievement', title: 'Hack for Good Finalist', issuer: 'Civic Tech Network', date: '2024-05-18', desc: 'Designed an accessible reporting tool for local community organizations and presented the working prototype to an independent judging panel.', cats: ['Technical / professional', 'Volunteering'], level: 2, result: 2, resp: 2, dur: 1, vt: 'lecturer', status: 'pending', evidence: 'finalist-certificate', ageDays: 2 }));
  ach.push(A(elena, { kind: 'activity', title: 'Computing Society', issuer: 'Africa University Computing Society', role: 'Vice President', date: '2024-01', ongoing: true, desc: 'Organize peer workshops, industry panels, and an annual student hackathon.', cats: ['Club / society', 'Leadership'], level: 1, result: 2, resp: 3, dur: 3, vt: 'department_head', status: 'verified', by: sports, ageDays: 400 }));
  ach.push(A(elena, { kind: 'activity', title: 'Code Together', issuer: 'Code Together Community Programme', role: 'Volunteer Tutor', date: '2023-02', ongoing: true, desc: 'Provide weekly introductory programming support to local secondary students.', cats: ['Volunteering'], level: 2, result: 2, resp: 2, dur: 3, vt: 'department_head', status: 'verified', by: chap, ageDays: 500 }));
  ach.push(A(elena, { kind: 'activity', title: 'Women in STEM Mentoring', issuer: 'Africa University Women in STEM', role: 'Peer Mentor', date: '2025-02', desc: 'Mentor two first-year students through monthly academic check-ins.', cats: ['Volunteering', 'Leadership'], level: 1, result: 2, resp: 2, dur: 2, vt: 'department_head', status: 'pending', ageDays: 4 }));
  ach.push(A(elena, { kind: 'project', title: 'Campus Navigation Assistant', issuer: 'Africa University', role: 'Team Project', date: '2025-01', desc: 'Accessible indoor navigation prototype using Bluetooth beacons and React.', cats: ['Project', 'Technical / professional'], level: 1, result: 2, resp: 3, dur: 2, vt: 'lecturer', status: 'verified', by: malik, ageDays: 280 }));
  ach.push(A(elena, { kind: 'project', title: 'AWS Cloud Practitioner', issuer: 'Amazon Web Services', role: 'Certification', date: '2025-03', desc: 'Foundational certification covering cloud concepts, security, and billing.', cats: ['Certification'], level: 4, result: 2, resp: 1, dur: 1, vt: 'lecturer', status: 'verified', by: moyo, evidence: 'aws-cloud-practitioner', ageDays: 220 }));
  ach.push(A(elena, { kind: 'project', title: 'Student Retention Explorer', issuer: 'Independent', role: 'Independent Project', date: '2025-02', desc: 'Interactive dashboard exploring anonymized student retention indicators.', cats: ['Project', 'Technical / professional'], level: 1, result: 2, resp: 3, dur: 2, vt: 'lecturer', status: 'pending', ageDays: 1 }));
  // other students
  A(jonas, { kind: 'achievement', title: 'Data Science Society Hackathon Winner', issuer: 'Data Science Society', date: '2025-03', desc: 'Won the campus hackathon with a crop-yield forecasting model.', cats: ['Academic award', 'Technical / professional'], level: 1, result: 3, resp: 2, dur: 1, vt: 'lecturer', status: 'verified', by: malik, evidence: 'hackathon-winner', ageDays: 90 });
  A(jonas, { kind: 'activity', title: 'Debate Club', issuer: 'Africa University Debate Club', role: 'Team Captain', date: '2024-02', ongoing: true, desc: 'Captain of the university debate team competing in regional tournaments.', cats: ['Debate & public speaking', 'Leadership'], level: 2, result: 2, resp: 3, dur: 3, vt: 'department_head', status: 'verified', by: sports, ageDays: 150 });
  A(amara, { kind: 'achievement', title: 'Vice-Chancellor’s Scholarship', issuer: 'Africa University', date: '2022-02', desc: 'Merit scholarship awarded for outstanding first-year academic performance.', cats: ['Scholarship / bursary', 'Academic award'], level: 1, result: 3, resp: 1, dur: 3, vt: 'records_office', status: 'verified', by: records, evidence: 'scholarship-letter', ageDays: 600 });
  A(amara, { kind: 'activity', title: 'University Football Team', issuer: 'Africa University Sports', role: 'Midfielder', date: '2022-03', ongoing: true, desc: 'Represented the university in the inter-university football league.', cats: ['Sports'], level: 2, result: 2, resp: 2, dur: 3, vt: 'department_head', status: 'verified', by: sports, ageDays: 450 });
  A(amara, { kind: 'project', title: 'Industrial Attachment — Fintech Co.', issuer: 'Fintech Co.', role: 'Attachment', date: '2024-07', desc: 'Built internal reporting tools during a three-month industrial attachment.', cats: ['Technical / professional'], level: 2, result: 2, resp: 2, dur: 2, vt: 'supervisor', status: 'verified', by: sup, ageDays: 120 });
  A(tariro, { kind: 'achievement', title: 'Agribusiness Pitch Competition — Finalist', issuer: 'Agri-Innovation Forum', date: '2024-09', desc: 'Pitched a smallholder input-financing model to an independent panel.', cats: ['Entrepreneurship'], level: 3, result: 2, resp: 2, dur: 1, vt: 'lecturer', status: 'pending', evidence: 'pitch-finalist', ageDays: 3 });
  A(kudzai, { kind: 'project', title: 'Public Health Certificate (duplicate)', issuer: 'Global Health Academy', role: 'Certification', date: '2025-01', desc: 'Short course certificate on epidemiology basics. Possible duplicate of an earlier entry.', cats: ['Certification'], level: 4, result: 1, resp: 1, dur: 1, vt: 'lecturer', status: 'flagged', note: 'Duplicate certification flagged — please confirm this is a different course.', by: moyo, evidence: 'ph-certificate', ageDays: 5 });
  A(rutendo, { kind: 'activity', title: 'Nursing Students’ Association', issuer: 'Nursing Students’ Association', role: 'Treasurer', date: '2023-02', ongoing: true, desc: 'Managed association funds and organised the annual health outreach day.', cats: ['Club / society', 'Leadership'], level: 1, result: 2, resp: 3, dur: 3, vt: 'department_head', status: 'verified', by: chap, ageDays: 300 });
  extras.slice(0, 5).forEach((uid, i) => A(uid, { kind: 'achievement', title: ['Programming Contest Finalist', 'Dean’s List', 'Best First-Year Project', 'Conference Attendance — AfriTech', 'Mentoring Programme Completion'][i], issuer: 'Africa University', date: '2024-0' + (i + 3), desc: 'Verified item used to illustrate university-wide reporting in the demo data.', cats: [['Academic award'], ["Dean's List"], ['Project'], ['Conference / seminar'], ['Volunteering']][i], level: 1 + (i % 3), result: 2, resp: 1 + (i % 3), dur: 1 + (i % 3), vt: 'lecturer', status: 'verified', by: malik, evidence: i === 3 ? 'conference-certificate' : null, ageDays: 60 + i * 20 }));

  /* skills */
  const sk = db.prepare('INSERT INTO skills (user_id, name, type) VALUES (?,?,?)');
  [['Python', 'technical'], ['React', 'technical'], ['SQL', 'technical'], ['English', 'language'], ['Shona', 'language']].forEach(([n, t]) => sk.run(elena, n, t));

  /* Elena shares with Dr. Malik (so the lecturer workspace works straight away) + a letter request */
  const verifiedIds = db.prepare("SELECT id FROM achievements WHERE user_id=? AND status='verified'").all(elena).map((r) => r.id);
  const insS = db.prepare(`INSERT INTO shares (student_id, kind, label, purpose, recipient_id, achievement_ids, include_results, include_skills, expires_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const sh = insS.run(elena, 'lecturer', null, 'Recommendation letter — Graduate study', malik, JSON.stringify(verifiedIds), 1, 0, H.addDays(45), H.now());
  db.prepare(`INSERT INTO letters (student_id, lecturer_id, purpose, purpose_detail, key_points, deadline, achievement_ids, include_results, share_id, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(elena, malik, 'Graduate study', 'MSc Artificial Intelligence application', 'I led the winning Data Challenge team and run weekly tutoring for secondary students.', H.addDays(21).slice(0, 10), JSON.stringify(verifiedIds), 1, sh.lastInsertRowid, new Date(Date.now() - 2 * 86400000).toISOString(), H.now());
  for (const uid of [jonas, amara]) {
    const ids = db.prepare("SELECT id FROM achievements WHERE user_id=? AND status='verified'").all(uid).map((r) => r.id);
    insS.run(uid, 'lecturer', null, 'Reference discussion', malik, JSON.stringify(ids), 1, 0, H.addDays(30), H.now());
  }
  db.prepare('INSERT INTO access_log (student_id, viewer_id, viewer_label, via, share_id, at) VALUES (?,?,?,?,?,?)').run(elena, malik, 'Dr. A. Malik, Senior Lecturer', 'lecturer', sh.lastInsertRowid, new Date(Date.now() - 86400000).toISOString());

  /* a share link that is about to expire, so the deadlines feed has something real to show */
  db.prepare(`INSERT INTO shares (student_id, kind, token, label, purpose, achievement_ids, include_results, include_skills, expires_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(elena, 'link', H.rand(16), 'MSc application link', 'Graduate study application', JSON.stringify(verifiedIds), 1, 1, H.addDays(3), H.now());

  /* welcome notifications */
  H.notify(elena, 'Welcome to AU StudentSphere. Your verified record starts here.', '/');
  H.notify(elena, '“Hack for Good Finalist” is waiting for verification.', '/achievements');
  H.notify(malik, 'Elena Ortiz requested a recommendation letter (Graduate study).', '/letters');
  H.notify(admin, '4 items are waiting in the verification queue.', '/queue');
  db.prepare('DELETE FROM outbox').run();
  console.log(`[seed] Done. Demo accounts use the password: ${DEMO_PASSWORD}`);
}

/* Demo opportunities. Runs once: skipped if any opportunity was ever posted (the audit trail remembers removed ones). */
function seedOpportunities() {
  if (!H.DEMO_MODE) return;
  if (db.prepare('SELECT 1 FROM opportunities').get() || db.prepare("SELECT 1 FROM audit WHERE entity='opportunity'").get()) return;
  const who = (email) => db.prepare('SELECT * FROM users WHERE email=?').get(email);
  const malik = who('a.malik@africau.edu'), admin = who('admin@africau.edu'), sup = who('supervisor@partner-org.com');
  if (!malik || !admin) return;
  const day = (n) => H.addDays(n).slice(0, 10);
  const ins = db.prepare('INSERT INTO opportunities (title, kind, organisation, description, link, deadline, posted_by, created_at) VALUES (?,?,?,?,?,?,?,?)');
  const rows = [
    ['Software Engineering Internship', 'Internship', 'Partner Technologies Ltd', 'Three-month paid internship for final-year computing students. Work with a mentor on a live web project. Strong Python or JavaScript preferred.', null, day(9), (sup || admin).id],
    ['Industrial attachment placements, January intake', 'Industrial attachment', 'Career Advising Office', 'Supervised attachment placements are open for students who finish their coursework this year. Bring your verified record to your interview.', null, day(21), admin.id],
    ['Regional Data Challenge', 'Competition', 'Africa Data Science Network', 'Teams of up to four analyse a real public-health dataset and present findings. Winning teams receive mentoring and a cash prize.', 'https://example.org/data-challenge', day(40), malik.id],
    ['Graduate research scholarship briefing', 'Scholarship', 'Faculty of Science', 'An information session on fully funded postgraduate scholarships, including how to prepare your references and verified record.', null, null, malik.id],
  ];
  rows.forEach((r, i) => { const x = ins.run(r[0], r[1], r[2], r[3], r[4], r[5], r[6], new Date(Date.now() - (rows.length - i) * 3600000).toISOString()); H.audit('opportunity', Number(x.lastInsertRowid), null, 'opportunity posted', `${r[1]}: ${r[0]} (demo data)`); });
}

function seedResources() {
  if (db.prepare('SELECT COUNT(*) c FROM resources').get().c > 0) return;
  const admin = db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1").get();
  if (!admin) return;
  const add = (title, category, description, body, premium, link) => db.prepare('INSERT INTO resources (title, category, description, link, body, premium, posted_by, created_at) VALUES (?,?,?,?,?,?,?,?)').run(title, category, description, link || null, body || null, premium ? 1 : 0, admin.id, H.now());
  add('Writing a CV that employers read', 'CV & applications', 'A one-page structure for a student CV, and what to cut.',
    'Lead with a two-line profile, then education, then verified achievements and projects. Put results first in every bullet (what changed because of you). Keep it to one page for a first job. Use the My CV page to generate it from your verified records, then tailor the first three bullets to each role.', 0);
  add('Study planning for exam season', 'Study skills', 'A simple weekly rhythm that works with a heavy timetable.',
    'Work backwards from each exam date. Give every module two focused sessions a week, one to learn and one to practise past questions. Keep one evening free. Review mistakes in a short log and revisit the log the night before.', 0);
  add('Scholarship application checklist', 'Scholarships & funding', 'What committees look for and the documents to prepare early.',
    'Prepare: certified results, a verified achievements summary (share link from Sharing & privacy), a recommendation letter request (allow three weeks), and a short personal statement. Start the statement with a specific moment, not a general claim.', 0);
  add('Interview answer bank (Premium)', 'Interview preparation', 'Fifteen common questions with structured answer frames and examples.',
    'Use the STAR frame: Situation, Task, Action, Result. Prepare six stories (leadership, conflict, failure, initiative, teamwork, deadline pressure) and map each to several questions. For “tell me about yourself”: present, past, future in 60 seconds. For weakness questions: name a real one and the system you built to manage it.', 1);
  add('Recommendation letter request template (Premium)', 'CV & applications', 'Wording that makes it easy for a lecturer to say yes, with a timeline.',
    'Subject: Request for a reference, [programme/role], deadline [date]. Say who you are and the module you took with them, what the letter is for, the deadline, and two or three points you hope they can speak to. Offer your verified summary. Send it at least three weeks ahead and send one polite reminder a week before.', 1);
  add('Graduate role salary negotiation notes (Premium)', 'Career guidance', 'How to research a range and respond to a first offer.',
    'Research the range from three sources before the call. When given an offer, thank them, ask for the written details, and take a day. Anchor on the value of your verified projects and responsibilities, not on need. Negotiate the whole package: leave, training budget, review date.', 1);
}

module.exports = { seedIfEmpty, seedOpportunities, seedResources };

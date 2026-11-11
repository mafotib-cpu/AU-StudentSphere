'use strict';
// Builds evidence-based summaries and letter drafts from VERIFIED records only.

const PURPOSES = {
  'Graduate study': {
    close: 'providing a strong foundation for advanced study',
    cats: ['Academic award', 'Dean’s List', 'Scholarship / bursary', 'Conference / seminar', 'Technical & professional work', 'Certification'],
    letterClose: 'I am confident that they would thrive in a demanding postgraduate environment',
  },
  Employment: {
    close: 'demonstrating readiness for professional work',
    cats: ['Technical & professional work', 'Certification', 'Leadership', 'Entrepreneurship', 'Volunteering'],
    letterClose: 'I believe they would be a valuable and dependable addition to your organisation',
  },
  Scholarship: {
    close: 'showing merit, commitment and promise',
    cats: ['Scholarship / bursary', 'Academic award', 'Dean’s List', 'Leadership', 'Volunteering'],
    letterClose: 'I recommend them for this scholarship without reservation',
  },
  Internship: {
    close: 'showing initiative and practical skill',
    cats: ['Technical & professional work', 'Certification', 'Clubs & societies', 'Leadership'],
    letterClose: 'I am sure they would make a strong contribution during an internship placement',
  },
};

const STRENGTH_MAP = {
  'Academic award': 'Academic excellence', 'Dean’s List': 'Academic excellence', 'Scholarship / bursary': 'Academic excellence',
  Leadership: 'Collaborative leadership', 'Clubs & societies': 'Collaborative leadership',
  'Technical & professional work': 'Technical initiative', Certification: 'Technical initiative', Entrepreneurship: 'Entrepreneurial drive',
  Volunteering: 'Social impact', 'Community service': 'Social impact',
  'Debate & public speaking': 'Communication', 'Conference / seminar': 'Communication', Sports: 'Teamwork and discipline',
};

function monthYear(d) {
  if (!d) return '';
  const dt = new Date(d + (d.length === 10 ? 'T00:00:00Z' : ''));
  return dt.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function strengthsOf(records, skills = []) {
  const count = {};
  records.forEach((r) => (r.categories || []).forEach((c) => {
    const s = STRENGTH_MAP[c]; if (s) count[s] = (count[s] || 0) + 1;
  }));
  const out = Object.entries(count).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return out.slice(0, 6);
}

function scoreRecord(r, purpose) {
  const p = PURPOSES[purpose] || PURPOSES['Graduate study'];
  const tier = { major: 30, moderate: 15, minor: 5 }[r.tier] || 5;
  const rel = (r.categories || []).some((c) => p.cats.includes(c)) ? 20 : 0;
  return tier + rel;
}

function highlightLine(r) {
  const when = r.ongoing ? `since ${monthYear(r.date_start)}` : monthYear(r.date_start);
  const head = r.role ? `${r.role}, ${r.title}` : r.title;
  const org = r.issuer && r.issuer !== 'Africa University' ? ` (${r.issuer})` : '';
  const tier = r.tier ? ` [${r.tier} · ${r.scope || 'local'}]` : '';
  return `${head}${org}, ${when}${tier}: ${r.description}`;
}

function buildSummary({ student, records, purpose, includeResults }) {
  const p = PURPOSES[purpose] || PURPOSES['Graduate study'];
  const ranked = [...records].sort((a, b) => scoreRecord(b, purpose) - scoreRecord(a, purpose));
  const first = student.name.split(' ')[0];
  const has = (cat) => records.some((r) => (r.categories || []).includes(cat));
  const traits = [];
  if (has('Leadership') || has('Clubs & societies')) traits.push('meaningful leadership');
  if (has('Technical & professional work') || has('Certification')) traits.push('technical project work');
  if (has('Volunteering') || has('Community service')) traits.push('community engagement');
  if (has('Sports')) traits.push('sporting commitment');
  if (has('Entrepreneurship')) traits.push('entrepreneurial initiative');
  const traitText = traits.length > 1 ? traits.slice(0, -1).join(', ') + ' and ' + traits.slice(-1) : traits[0];
  let academic = '';
  if (includeResults && student.gpa) {
    academic = ` with a cumulative GPA of ${Number(student.gpa).toFixed(2)}${student.cohort_rank ? `, placing them in the ${student.cohort_rank.toLowerCase().replace('top', 'top')} of their cohort` : ''}`;
  }
  const programme = student.programme;
  let text = `${first} is a ${programme} student${academic}.`;
  if (traitText) text += ` Their verified record demonstrates ${traitText}, ${p.close}.`;
  else text += ` Their verified record is ${p.close}.`;
  return {
    purpose,
    profileSummary: text,
    highlights: ranked.slice(0, 6).map(highlightLine),
    strengths: strengthsOf(records),
    recordIds: ranked.slice(0, 6).map((r) => r.id),
  };
}

function buildLetter({ student, records, purpose, includeResults, lecturer, recipient, keyPoints }) {
  const p = PURPOSES[purpose] || PURPOSES['Graduate study'];
  const s = buildSummary({ student, records, purpose, includeResults });
  const first = student.name.split(' ')[0];
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const lines = [];
  lines.push(today);
  lines.push('');
  lines.push(recipient ? `To: ${recipient}` : 'To whom it may concern,');
  lines.push('');
  lines.push(`Re: Recommendation for ${student.name} (${student.student_no}) – ${purpose}`);
  lines.push('');
  lines.push(`I am pleased to write in support of ${student.name}, a ${student.programme} student at Africa University.`);
  lines.push('');
  lines.push(s.profileSummary);
  lines.push('');
  lines.push('The following achievements have been verified by Africa University and are drawn from the student’s official record:');
  lines.push('');
  s.highlights.forEach((h) => lines.push('• ' + h));
  if (s.strengths.length) { lines.push(''); lines.push('Strengths evidenced by this record: ' + s.strengths.join(', ') + '.'); }
  if (keyPoints) { lines.push(''); lines.push('[Student’s requested key points – include only what you can personally support: ' + keyPoints + ']'); }
  lines.push('');
  lines.push('[Lecturer: add your own observations of ' + first + '’s work and character here.]');
  lines.push('');
  lines.push(`${p.letterClose}. Please contact me if further information would help.`);
  lines.push('');
  lines.push('Yours sincerely,');
  lines.push('');
  lines.push(lecturer.name);
  if (lecturer.title) lines.push(lecturer.title);
  lines.push('Africa University');
  return lines.join('\n');
}

module.exports = { PURPOSES, buildSummary, buildLetter, strengthsOf, monthYear };

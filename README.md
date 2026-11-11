# AU StudentSphere (Verified Record)

Africa University · College of Engineering and Applied Sciences. Developed by the College of Engineering and Applied Sciences, Africa University.

A working web system where students log achievements with evidence, authorised staff verify them,
students control what is shared, and lecturers draft recommendation letters from verified records.
Built from the "University Student Profile System" Figma design and the requirements-elicitation findings.

## Run it
Requires **Node.js 22.13+** (uses the built-in SQLite — nothing else to install or configure).

    npm install
    npm start            # http://localhost:3000

First start creates `data/` and seeds demo data. `npm run reseed` wipes it and starts fresh.
Works fully offline (fonts and icons are bundled), so it is safe for a live defence with unreliable internet.

## If it will not open
Run `START-HERE.bat` (Windows) or `./start.sh` (Mac/Linux) - it installs packages on first run, starts the server and opens the browser. Or manually: `npm install` once, then `npm start`, then open http://localhost:3000.
`npm start` checks your setup first and says exactly what is wrong. The usual causes:
| Message | Fix |
|---|---|
| `Cannot find module 'express'` / "Packages are not installed yet" | Run `npm install` in this folder (needs internet the first time; unzip the project first, do not run it from inside the zip). |
| "needs Node.js 22.13 or newer" | Install the current LTS from https://nodejs.org, then open a NEW terminal. |
| "Port 3000 is already in use" | Close the other copy, or run on another port: `$env:PORT=3001; npm start` (PowerShell) / `PORT=3001 npm start` (Mac/Linux). |
| Browser says "can't reach this site" | The terminal running the server was closed. Start it again and keep it open. |

## Demo accounts (password for all: `Welcome@2026`)
| Role | Email |
|---|---|
| Student | elena.ortiz@africau.edu (also jonas.meyer@, amara.lewis@, tariro.ncube@ …) |
| Lecturer | a.malik@africau.edu · s.moyo@africau.edu |
| Verifier — Records Office | records@africau.edu |
| Verifier — Sports Director / Chaplaincy | sports@africau.edu · chaplaincy@africau.edu |
| Verifier — Attachment supervisor | supervisor@partner-org.com |
| Administrator | admin@africau.edu |

**Two-step verification:** every sign-in emails a 6-digit code. With no mail server configured the
system runs in *demo mode*: emails land in the in-app **Demo mailbox** (`/#/mailbox`, also linked from the code screen).
For real email set `SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM` and `DEMO_MODE=0`.

## Suggested 7-minute demo flow
1. **Student (Elena)** — dashboard → Achievements → *Add new* (try submitting empty to show highlighted gaps; pick "Certification" to show evidence rules and auto-suggested verifier; live tier preview).
2. **Verifier by email link** — open the Demo mailbox, click the verification link (no login needed) → approve.
3. **Lecturer (Dr. Malik)** — Verification queue (checklist must be ticked) → Recommendation letters → open Elena's request → *Generate draft from verified records* → edit → approve.
4. **Student** — Letters (status + download), Sharing & privacy → create an expiring link → open it in a private window → cancel it → see "who viewed".
5. **Administrator** — Student records, Directory & access, Import results (CSV), Reports, Audit log.

## 4-minute live demo (for the WT presentation)
Use two browser windows side by side (one normal, one private) so you can switch roles instantly. Sign-in codes appear in the Demo mailbox (`/#/mailbox`).
1. **0:00 – Student dashboard** (Elena): point out the stats, *Deadlines & reminders* (expiring share link, closing internship, letter request) and *New opportunities*.
2. **0:30 – One complete action:** Achievements → *Add new* → submit a record; it appears as *Pending* on the profile.
3. **2:00 – Another role:** in the other window sign in as the lecturer (`a.malik@africau.edu`) → Verification queue → verify it.
4. **3:00 – Proactive feature firing live:** lecturer opens **Opportunities → Post opportunity** and posts one with a closing date. Switch to Elena's window: the bell shows a new notification, the dashboard's *New opportunities* card leads with it, and it appears in *Deadlines & reminders*.

**Opportunities board:** any lecturer, verifier or administrator can post (type, optional closing date, organisation and link); everyone can read and filter by type. Posts are limited to 10 per person per day, links must be http(s), expired items hide automatically, and each post/removal is written to the audit log. Posters can remove their own posts; administrators can remove any.
**Deadlines & reminders feed (students):** records that need your response, recently rejected records, letter requests and approved letters, share links expiring within 7 days, opportunities closing within 14 days, and one profile-completion nudge, sorted by urgency.

## Added in this update
| Feature | Where | Notes |
|---|---|---|
| **Premium plan, $3.00 / month** | Student → Premium; Admin → Premium subscriptions | Price in `src/premium.js` (`PREMIUM_PRICE_CENTS=300`). Free: 2 active share links, 3 applications per 30 days. Premium: unlimited links and applications, plus Premium library guides. Cancel any time (keeps access until the paid period ends). |
| **Payments** | `PAYMENT_MODE` | `demo` (default): activates instantly, no money moves (good for the defence). `manual`: student enters a payment reference, an administrator confirms it under *Premium subscriptions*. No card gateway is connected. |
| **Resource library** | Everyone → Resource library | Staff add guides or links; can mark them Premium. Premium guides show locked for free students. |
| **Messaging** | Students, lecturers, verifiers → Messages | Student starts a conversation with a lecturer/verifier; staff reply; notifications; 40 messages/day limit. |
| **Apply to opportunities** | Opportunities → Apply here; Student → My applications | Posters see applicants, set Shortlisted / Accepted / Declined with a note; the student is notified. |

Existing databases upgrade automatically on start (new tables only; nothing is changed or deleted). Six sample library guides are added if the library is empty.

## Requirements → where to see it
| Requirement (from the seminar) | In the system |
|---|---|
| Loggable categories (academic, Dean's List, scholarships, conferences, certifications, clubs, sports, debate, leadership, volunteering, technical, entrepreneurship); multi-category | Add/Edit form |
| Description + category + date required; evidence depends on type; gaps highlighted, submission blocked | `routes/achievements.js` `validate()` |
| Pending / Verified / Rejected (+ needs-info, flagged); rejection reason notifies student | Status badges, notifications, email |
| Major / moderate / minor tiers from level, competitiveness, responsibility, duration; verifier can adjust | Form + queue |
| Disciplinary records & sensitive data blocked | Validation rules |
| Historical entries with real dates; pre-university category | Date rules |
| Edit pending; changes to verified need approval; deletion by request; audit history | Edit/delete flows + History button |
| Shared verification (lecturer, Records Office, dept heads, supervisors); verifier recorded | Verifier routing, "Verified by…" |
| Approve/reject from a secure email link without portal login | `/#/review?token=…` (single-use, 14 days) |
| Flag suspicious item; student explains before decision | Flag action → "Explain this entry" |
| Recommendation letters: request, purpose, key points, draft from verified records, lecturer edits/approves, student revision & download, reminders | Letters (student + lecturer) |
| Lecturers see only relevant items, only with student permission, time-limited | Share grants + letter requests |
| Expiring / cancellable share links; view notifications; access history | Sharing & privacy |
| Secure login, 2-step verification, lockout, login history, password reset, role-based access | Auth + Security page |
| Transcript import, results read-only; contact details only editable | Admin → Import results |
| Alumni backup email | Contact details; admin marks alumni |
| CV generation; complaints / document requests | My CV; Help & requests → Support inbox |
| Business value / university reporting | Admin → Reports (+ CSV export) |
| Reasons to visit often: deadlines/reminders feed, opportunities & internships board, notifications | Student dashboard → *Deadlines & reminders* and *New opportunities*; **Opportunities** page (staff post, every student is notified) |

## Honest notes / not included
* **Letter "AI" drafting is template-based** (deterministic, from verified records) — no external AI service. Matches the decision to keep staff judgement central.
* Attachment-supervisor modules (attendance, tasks, assessments — section 4.5) are not built; supervisors can verify items.
* Still not built: attachment-supervisor modules (attendance, tasks, assessments).
* Open questions from the seminar are given sensible defaults: evidence PDF/PNG/JPG/DOCX up to 5 MB (`MAX_UPLOAD_MB`), students may view/download approved letters.
* Data is stored in `data/app.db` (SQLite) + `data/uploads/`. Encrypt the disk / use HTTPS (`COOKIE_SECURE=1`, `TRUST_PROXY=1` behind a proxy) in production.

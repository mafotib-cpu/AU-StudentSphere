'use strict';
// Friendly start-up checks so a failed start explains itself in plain language.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`\nThis app needs Node.js 22.13 or newer (it uses Node's built-in SQLite). You have ${process.versions.node}.`);
  console.error('Install the current LTS version from https://nodejs.org, close this window, open a new terminal and try again.\n');
  process.exit(1);
}
const missing = ['express', 'multer', 'nodemailer'].filter((m) => { try { require.resolve(m); return false; } catch { return true; } });
if (missing.length) {
  console.error(`\nPackages are not installed yet (missing: ${missing.join(', ')}).`);
  console.error('Run   npm install   once in this folder (needs internet), then   npm start\n');
  process.exit(1);
}

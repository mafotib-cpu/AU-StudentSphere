'use strict';
// Deletes the local database and uploads so the next start re-seeds demo data.
const fs = require('fs');
const path = require('path');
fs.rmSync(path.join(__dirname, '..', 'data'), { recursive: true, force: true });
console.log('Demo data cleared; it will be re-created on start.');

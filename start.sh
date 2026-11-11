#!/bin/sh
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Install Node.js LTS from https://nodejs.org first."; exit 1; }
[ -f node_modules/express/package.json ] || npm install || { echo "npm install failed - check your internet."; exit 1; }
npm start

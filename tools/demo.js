// Builds build/demo.html: the reference host (examples/host.js) running the engines on the test fixtures.
// The test suite (test/page.js) runs against this page.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const { loadCraft } = require('../src/build/craft-parse.js');
const { validateSims } = require('../src/build/sims-validate.js');
const fx = path.join(root, 'test', 'fixtures');
const craft = loadCraft(require(path.join(fx, 'craft-stages.js')), { dir: path.join(fx, 'craft'), idPrefix: 'DM' });
const s = require(path.join(fx, 'sims.js'));
const sims = validateSims({ runs: s.runs, roleplays: s.roleplays, runPrefix: 'DR', rpPrefix: 'DP', takenIds: new Set(craft.ids) });
const errors = craft.errors.concat(sims.errors);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const bank = { craft: craft.packets, runs: sims.runs, roleplays: sims.roleplays };
const page = '<style>' + read('css/shell.css') + '\n' + read('css/engines.css') + '</style>\n<div id="app"></div>\n' +
  '<script>const BANK = ' + JSON.stringify(bank).replace(/</g, '\\u003c') + ';</script>\n' +
  '<script>' + read('dist/study-kit.js') + '</script>\n<script>' + read('examples/host.js') + '</script>\n';
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.writeFileSync(path.join(root, 'build', 'demo.html'), page);
console.log('build/demo.html', Buffer.byteLength(page), 'bytes;', craft.packets.length, 'packets,', sims.runs.length, 'run,', sims.roleplays.length, 'role-play');

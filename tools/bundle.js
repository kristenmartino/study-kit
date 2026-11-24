// Writes dist/study-kit.js: the browser modules in one IIFE that sets window.StudyKit, for apps to inline at build
// time. Also writes dist/study-kit.css (engines.css) and src/version.js from package.json.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(root, 'src', 'version.js'), "'use strict';\nmodule.exports = '" + pkg.version + "';\n");
const mods = ['version.js', 'save.js', 'roleplay.js', 'craft.js', 'sims.js', 'index.js'];
let out = '/* study-kit ' + pkg.version + ' (kristenmartino/study-kit). Built by tools/bundle.js; do not edit. */\n' +
  '(function (root) {\n"use strict";\nconst M = {}, C = {};\nfunction req(n) { n = n.replace(/^\\.\\//, ""); if (!(n in C)) { const m = { exports: {} }; M[n](m, m.exports); C[n] = m.exports; } return C[n]; }\n';
for (const f of mods) {
  const src = fs.readFileSync(path.join(root, 'src', f), 'utf8').replace(/require\(/g, 'req(');
  out += 'M[' + JSON.stringify(f) + '] = function (module, exports) {\n' + src + '\n};\n';
}
out += 'root.StudyKit = req("index.js");\n})(typeof window !== "undefined" ? window : globalThis);\n';
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'study-kit.js'), out);
fs.copyFileSync(path.join(root, 'css', 'engines.css'), path.join(root, 'dist', 'study-kit.css'));
console.log('dist/study-kit.js', Buffer.byteLength(out), 'bytes, version', pkg.version);

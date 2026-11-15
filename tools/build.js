/* Build dist/index.html: the single-file build for itch.
 * Inlines src/style.css and the four scripts (telemetry bundle, logic,
 * audio, UI) into the index.html shell. Writes to a staging file,
 * verifies byte count and content markers, then renames over the
 * target (never truncate-then-write in place).
 * Run: node tools/build.js   (from the game folder)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('index.html');
const css = read('src/style.css');
const scripts = ['src/telemetry.js', 'src/logic.js', 'src/audio.js', 'src/main.js']
  .map((p) => ({ p, code: read(p) }));

for (const { p, code } of scripts) {
  if (code.includes('</script>')) {
    console.error('build: ' + p + ' contains </script>; cannot inline safely');
    process.exit(1);
  }
}

html = html.replace('<link rel="stylesheet" href="src/style.css">',
  '<style>\n' + css + '\n</style>');
for (const { p, code } of scripts) {
  const tag = '<script src="' + p + '"></script>';
  if (!html.includes(tag)) { console.error('build: tag not found for ' + p); process.exit(1); }
  html = html.replace(tag, '<script>\n' + code + '\n</script>');
}

const markers = ['THE OUTGOING LOG', 'the-outgoing-log', 'OLAudio', 'WRITE_POINTS', 't.thoughtcrime.ai/collect'];
for (const m of markers) {
  if (!html.includes(m)) { console.error('build: marker missing from output: ' + m); process.exit(1); }
}

const out = path.join(root, 'dist', 'index.html');
const staging = out + '.staging';
fs.writeFileSync(staging, html);
const bytes = fs.statSync(staging).size;
if (bytes !== Buffer.byteLength(html)) { console.error('build: byte count mismatch'); process.exit(1); }
fs.renameSync(staging, out);
console.log('built dist/index.html (' + bytes + ' bytes)');

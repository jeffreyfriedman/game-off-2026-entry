/* Text driver for The Outgoing Log: plays the game through the logic
 * engine's public API and prints ONLY what a player would see (scene
 * text, document text, option labels, the ending). Used for the
 * stranger playthrough: the player-agent talks to this driver over
 * stdin/stdout and never reads the game source.
 *
 * Protocol: on start, and after every command, prints one JSON object:
 *   { node, lines: [{who, text}], options: [{id, label, source?}], done }
 * Commands (one per line on stdin): an option id, or "continue" at a
 * lines node, or "restart".
 */
'use strict';
const OL = require('../src/logic.js');
const readline = require('readline');

let state = OL.newGame();
let entered = {};

function view(newLines) {
  const node = OL.nodeDef(state);
  const out = { node: state.node, lines: newLines || [], options: [], done: false };
  if (node.type === 'lines') {
    out.options = [{ id: 'continue', label: state.node === 'title' ? 'Begin the night shift' : 'Go on' }];
  } else if (node.type === 'ending') {
    const end = OL.resolveEnding(state);
    out.done = true;
    out.ending = end;
    out.options = [{ id: 'restart', label: 'Work another night (play again)' }];
  } else if (node.type === 'write') {
    const point = OL.WRITE_POINTS[state.writeStep];
    out.writePoint = { title: point.title, prompt: point.prompt };
    out.options = OL.visibleOptions(state);
  } else {
    out.options = OL.visibleOptions(state);
  }
  return out;
}

function enterLines() {
  if (entered[state.node]) return [];
  entered[state.node] = true;
  const node = OL.nodeDef(state);
  return (node.intro || []).concat(node.lines || []);
}

function emit(lines) {
  process.stdout.write(JSON.stringify(view(lines)) + '\n');
}

emit(enterLines());

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const cmd = line.trim();
  if (!cmd) return;
  if (cmd === 'restart') {
    state = OL.newGame();
    entered = {};
    emit(enterLines());
    return;
  }
  const node = OL.nodeDef(state);
  if (cmd === 'continue') {
    if (node.type !== 'lines') { emit([]); return; }
    OL.advance(state);
    emit(enterLines());
    return;
  }
  const res = OL.choose(state, cmd);
  if (!res) {
    process.stdout.write(JSON.stringify({ error: 'option not offered: ' + cmd, ...view([]) }) + '\n');
    return;
  }
  emit((res.lines || []).concat(enterLines()));
});

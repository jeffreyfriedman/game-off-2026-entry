/* The Outgoing Log — logic test suite.
 * Run: node tests/run-tests.js   (from the game folder)
 * Drives whole playthroughs through the real engine in src/logic.js.
 */
'use strict';
const OL = require('../src/logic.js');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name); }
}
function eq(a, b, name) { ok(a === b, name + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

/* ---------- playthrough driver ----------
 * policy: { gate: {maren:'opened'|'barred', vane:...},
 *           write: {bell:stance, asking:stance, cart:stance},
 *           askAll: bool, readAll: bool, skipAsks: [nodeIds] } */
function play(policy) {
  const s = OL.newGame();
  let guard = 0;
  while (s.node !== 'ending' && guard++ < 500) {
    const node = OL.nodeDef(s);
    if (node.type === 'lines') { OL.advance(s); continue; }
    if (node.type === 'desk') {
      if (policy.readAll !== false) {
        for (const o of OL.visibleOptions(s)) {
          if (o.kind === 'doc') OL.choose(s, o.id);
        }
      } else {
        OL.choose(s, 'doc_daylog');
      }
      const r = OL.choose(s, 'desk_done');
      if (!r) throw new Error('desk exit refused');
      continue;
    }
    if (node.type === 'choice') {
      if (policy.askAll !== false && !(policy.skipAsks || []).includes(s.node)) {
        let again = true;
        while (again) {
          again = false;
          for (const o of OL.visibleOptions(s)) {
            if (o.kind === 'ask') { OL.choose(s, o.id); again = true; }
          }
        }
      }
      const go = OL.visibleOptions(s).find(o => o.kind === 'go');
      if (!go) throw new Error('no go option at ' + s.node);
      OL.choose(s, go.id);
      continue;
    }
    if (node.type === 'gate') {
      const want = policy.gate[node.gate];
      const opt = OL.visibleOptions(s).find(o => o.id === node.gate + (want === 'opened' ? '_open' : '_bar'));
      if (!opt) throw new Error('gate option missing at ' + s.node);
      OL.choose(s, opt.id);
      continue;
    }
    if (node.type === 'write') {
      const point = OL.WRITE_POINTS[s.writeStep];
      const wantStance = policy.write[point.id];
      const opt = OL.visibleOptions(s).find(o => o.stance === wantStance);
      if (!opt) throw new Error('write stance ' + wantStance + ' unavailable for ' + point.id +
        ' (have: ' + OL.visibleOptions(s).map(o => o.stance).join(',') + ')');
      OL.choose(s, opt.id);
      continue;
    }
    throw new Error('unhandled node type ' + node.type + ' at ' + s.node);
  }
  if (s.node !== 'ending') throw new Error('playthrough did not reach the ending');
  return s;
}

const FULL = { gate: { maren: 'opened', vane: 'barred' }, askAll: true, readAll: true };

/* ---------- structure ---------- */
for (const id of OL.ORDER) ok(!!OL.NODES[id], 'node exists: ' + id);
for (const [id, n] of Object.entries(OL.NODES)) {
  if (n.next) ok(!!OL.NODES[n.next], id + ' next -> ' + n.next + ' exists');
  if (n.type === 'choice') ok(n.options.some(o => o.kind === 'go'), id + ' has a go option');
  if (n.type === 'gate') eq(n.options.length, 2, id + ' gate has exactly two options');
}

/* ---------- all six endings reachable through real play ---------- */
eq(OL.resolveEnding(play({ ...FULL, write: { bell: 'not-rung', asking: 'asked', cart: 'omitted' } })).slug,
  'gate-closed', 'ending: cover-up closes the gate');
eq(OL.resolveEnding(play({ ...FULL, write: { bell: 'rung', asking: 'asked', cart: 'favor' } })).slug,
  'rook-carries-it', 'ending: rook carries it');
eq(OL.resolveEnding(play({ ...FULL, write: { bell: 'open', asking: 'open', cart: 'favor' } })).slug,
  'favor-named', 'ending: the favor is named (favor written, bell left open)');
eq(OL.resolveEnding(play({ ...FULL, write: { bell: 'not-rung', asking: 'asked', cart: 'favor' } })).slug,
  'favor-named', 'ending: the favor is named (favor written, bell denied)');
eq(OL.resolveEnding(play({ ...FULL, write: { bell: 'not-rung', asking: 'asked', cart: 'mistake' } })).slug,
  'pell-named', 'ending: the boy carries it');
eq(OL.resolveEnding(play({ ...FULL, write: { bell: 'not-rung', asking: 'not-asked', cart: 'mistake' } })).slug,
  'sella-named', 'ending: sella carries it');
eq(OL.resolveEnding(play({ ...FULL, write: { bell: 'rung', asking: 'open', cart: 'mistake' } })).slug,
  'record-stays-open', 'ending: record stays open (mixed log)');
eq(OL.resolveEnding(play({ ...FULL, write: { bell: 'open', asking: 'open', cart: 'open' } })).slug,
  'record-stays-open', 'ending: record stays open (all open)');

/* ---------- epilogue modifiers follow the gate decisions ---------- */
{
  const a = OL.resolveEnding(play({ ...FULL, gate: { maren: 'opened', vane: 'opened' }, write: { bell: 'rung', asking: 'asked', cart: 'favor' } }));
  ok(a.epilogues[0].includes('scarf'), 'maren opened: she finds the cart and the scarf');
  ok(a.epilogues[1].includes('gone'), 'vane opened: he is gone by dawn');
  ok(a.epilogues[1].includes('names his favor'), 'vane opened + favor written: the log names his favor');
  const c = OL.resolveEnding(play({ ...FULL, gate: { maren: 'opened', vane: 'opened' }, write: { bell: 'not-rung', asking: 'asked', cart: 'omitted' } }));
  ok(c.epilogues[1].includes('nothing to ask him'), 'vane opened + cart omitted: the log gives them nothing to ask him');
  const b = OL.resolveEnding(play({ ...FULL, gate: { maren: 'barred', vane: 'barred' }, write: { bell: 'rung', asking: 'asked', cart: 'favor' } }));
  ok(b.epilogues[0].includes('porch'), 'maren barred: she waited in the porch');
  ok(b.epilogues[1].includes('yard'), 'vane barred: he is in the yard at dawn');
}

/* ---------- the printed log ---------- */
{
  const full = OL.resolveEnding(play({ ...FULL, write: { bell: 'rung', asking: 'asked', cart: 'favor' } }));
  eq(full.logLines.length, 3, 'full log prints three entries');
  ok(!full.logLines[1].includes('bonus'), 'the begged line prints the admission account only, no blended bonus');
  const omitted = OL.resolveEnding(play({ ...FULL, write: { bell: 'not-rung', asking: 'asked', cart: 'omitted' } }));
  eq(omitted.logLines.length, 2, 'omitted cart prints two entries (the gap is the point)');
}

/* ---------- gating: accounts must be earned ---------- */
{
  // Skip Sella entirely: her bell account must not be writeable.
  const s = play({ ...FULL, skipAsks: ['w2_sella'], write: { bell: 'not-rung', asking: 'asked', cart: 'favor' } });
  ok(!s.flags.heard_sella, 'skipping Sella leaves heard_sella unset');
}
{
  // At the write node with no Sella and no tally, the offered stances shrink.
  const s = OL.newGame();
  // walk manually to the write node asking nothing, reading only the day log
  s.node = 'desk'; OL.choose(s, 'doc_daylog'); OL.choose(s, 'desk_done');
  const skip = () => {
    let g = 0;
    while (s.node !== 'write' && g++ < 100) {
      const n = OL.nodeDef(s);
      if (n.type === 'lines') OL.advance(s);
      else if (n.type === 'choice') OL.choose(s, OL.visibleOptions(s).find(o => o.kind === 'go').id);
      else if (n.type === 'gate') OL.choose(s, OL.visibleOptions(s)[0].id);
      else throw new Error('unexpected ' + n.type);
    }
  };
  skip();
  eq(s.node, 'write', 'silent playthrough reaches the writing');
  const bellStances = OL.visibleOptions(s).map(o => o.stance).sort().join(',');
  eq(bellStances, 'not-rung,open', 'bell offers only day-log and open accounts to a silent player');
  OL.choose(s, OL.visibleOptions(s).find(o => o.stance === 'open').id);
  OL.choose(s, OL.visibleOptions(s).find(o => o.stance === 'asked').id); // day log account always held
  const cartIds = OL.visibleOptions(s).map(o => o.id).sort().join(',');
  eq(cartIds, 'cart_mistake,cart_omit', 'cart offers only mistake and omit without the tally');
  OL.choose(s, 'cart_omit');
  eq(s.node, 'ending', 'silent playthrough still completes the game');
}

/* ---------- Rook's staged admissions ---------- */
{
  const s = play({ ...FULL, write: { bell: 'rung', asking: 'asked', cart: 'favor' } });
  ok(s.flags.rook_admits_bell && s.flags.rook_admits_asking && s.flags.rook_admits_cart,
    'full questioning earns all three admissions');
  // The confrontations open from what the player actually holds:
  // the tally plus any one testimony puts the cart in front of him,
  // and the asking opens from Maren, Vane, or the bell admission.
  const t = OL.newGame();
  t.flags.heard_sella = true; t.flags.read_tally = true; t.node = 'w4_rook';
  const ids = OL.visibleOptions(t).map(o => o.id);
  ok(ids.includes('rook_bell'), 'rook: bell confrontation offered with Sella heard');
  ok(ids.includes('rook_cart'), 'rook: cart confrontation offered with the tally and one testimony');
  ok(!ids.includes('rook_asking'), 'rook: asking still locked with only Sella heard');
  OL.choose(t, 'rook_bell');
  const ids2 = OL.visibleOptions(t).map(o => o.id);
  ok(ids2.includes('rook_asking'), 'rook: asking confrontation unlocks after the bell admission');
  const u = OL.newGame();
  u.node = 'w4_rook';
  const uids = OL.visibleOptions(u).map(o => o.id);
  ok(uids.includes('rook_boy') && uids.includes('rook_years'), 'rook: the open asks are always there');
  ok(!uids.includes('rook_asking') && !uids.includes('rook_cart') && !uids.includes('rook_bell'),
    'rook: confrontations stay locked with nothing heard');
  const v = OL.newGame();
  v.flags.heard_maren = true; v.node = 'w4_rook';
  ok(OL.visibleOptions(v).map(o => o.id).includes('rook_asking'),
    'rook: asking confrontation unlocks from Maren alone');
}

/* ---------- the desk-bar contract: reading mid-scene unlocks options ---------- */
{
  const s = OL.newGame();
  s.node = 'w3_vane';
  ok(!OL.visibleOptions(s).map(o => o.id).includes('vane_tally'),
    'vane: the tally confrontation is hidden before the tally is read');
  OL.readDocument(s, 'tally');
  ok(OL.visibleOptions(s).map(o => o.id).includes('vane_tally'),
    'vane: reading the tally through the desk bar unlocks the confrontation');
}

/* ---------- Tier 2 amendments ---------- */
{
  // Maren's debt question waits until she has named the debt herself.
  const s = OL.newGame();
  s.node = 'w1_maren';
  ok(!OL.visibleOptions(s).map(o => o.id).includes('maren_debt'),
    'maren: the debt question is not offered before the debt is named');
  OL.choose(s, 'maren_pell');
  ok(OL.visibleOptions(s).map(o => o.id).includes('maren_debt'),
    'maren: the debt question appears once Pell has been asked about');
}
{
  // The route card is a fourth desk document, and it is not evidence.
  ok(!!OL.DOCUMENTS.routecard, 'desk: Pell\'s route card exists');
  const s = OL.newGame();
  s.node = 'desk';
  eq(OL.visibleOptions(s).filter(o => o.kind === 'doc').length, 4, 'desk offers four documents');
}
{
  // The tally counts the player's own night.
  const s = OL.newGame();
  s.gate.maren = 'opened';
  const lines = OL.readDocument(s, 'tally');
  ok(lines.some(l => l.text.includes('in your own hand')), 'tally: the sheet records the player\'s own opening');
  const t = OL.newGame();
  t.gate.maren = 'barred'; t.gate.vane = 'barred';
  ok(OL.readDocument(t, 'tally').some(l => l.text.includes('opened for no one')),
    'tally: the sheet records a night of barring too');
}
{
  // Re-reading after testimony pays off, once.
  const s = OL.newGame();
  s.flags.vane_confronted = true;
  ok(OL.readDocument(s, 'tally').some(l => l.text.includes('the gap has a shape')),
    'tally: re-reading after Vane adds the payoff line');
  ok(!OL.readDocument(s, 'tally').some(l => l.text.includes('the gap has a shape')),
    'tally: the payoff line does not repeat');
}
{
  // The resolver weighs evidence strength and the asking entry.
  const mk = (bell, askingOpt, cartOpt) => ({
    log: { bell: { stance: bell }, asking: askingOpt, cart: cartOpt },
    gate: { maren: 'barred', vane: 'barred' }
  });
  const adm = OL.resolveEnding(mk('rung', { stance: 'asked', id: 'ask_begged' }, { stance: 'favor', id: 'cart_favor_admission' }));
  eq(adm.slug, 'rook-carries-it', 'resolver: rung bell plus admission favor is rook-carries-it');
  ok(adm.body.join(' ').includes('own words'), 'resolver: an admission-backed favor lands as his own words');
  const tallyOnly = OL.resolveEnding(mk('open', { stance: 'asked', id: 'ask_asked_log' }, { stance: 'favor', id: 'cart_favor_tally' }));
  eq(tallyOnly.slug, 'favor-named', 'resolver: a tally-only favor still names the favor');
  ok(tallyOnly.body.join(' ').includes('arithmetic'), 'resolver: a tally-only favor lands as arithmetic');
  const open = OL.resolveEnding(mk('rung', { stance: 'asked', id: 'ask_begged' }, { stance: 'open', id: 'cart_open' }));
  eq(open.slug, 'record-stays-open', 'resolver: rung bell with an open cart stays open');
  ok(open.body.join(' ').includes('read twice'), 'resolver: the begged entry is weighed in the open ending');
}
{
  // Every ending closes Pell's thread by name, in its own words.
  for (const [slug, e] of Object.entries(OL.ENDINGS)) {
    ok(e.body.join(' ').includes('Pell'), 'ending ' + slug + ' names Pell before it closes');
  }
}

/* ---------- desk discipline ---------- */
{
  const s = OL.newGame();
  s.node = 'desk';
  eq(OL.choose(s, 'desk_done'), null, 'desk exit refused before the day log is read');
  OL.choose(s, 'doc_weather');
  eq(OL.choose(s, 'desk_done'), null, 'desk exit still refused with only the weather note read');
  OL.choose(s, 'doc_daylog');
  ok(OL.choose(s, 'desk_done') !== null, 'desk exit opens once the day log is read');
  ok(s.flags.read_daylog && s.flags.read_weather && !s.flags.read_tally, 'read flags track the documents');
}

/* ---------- teaching order ---------- */
{
  const order = OL.ORDER;
  ok(order.indexOf(OL.TEACH.read) < order.indexOf('w1_maren'), 'READ taught at the desk, before the first visitor');
  eq(OL.TEACH.ask, 'w1_maren', 'ASK taught at the first conversation');
  eq(OL.TEACH.decide, 'w1_gate', 'DECIDE taught at the first gate');
  ok(order.indexOf(OL.TEACH.write) < order.indexOf('write'), 'WRITE named by the runner before the dawn writing');
  const firstChoice = order.find(id => OL.NODES[id].type === 'choice');
  eq(firstChoice, OL.TEACH.ask, 'the first choice node is the ASK teaching node');
  const firstGate = order.find(id => OL.NODES[id].type === 'gate');
  eq(firstGate, OL.TEACH.decide, 'the first gate node is the DECIDE teaching node');
}

/* ---------- watches complete in order ---------- */
{
  const s = play({ ...FULL, write: { bell: 'rung', asking: 'asked', cart: 'favor' } });
  eq(s.watchesDone.join(','), '1,2,3,4,5', 'all five watches complete in order');
  eq(s.gate.maren, 'opened', 'maren gate decision recorded');
  eq(s.gate.vane, 'barred', 'vane gate decision recorded');
}

/* ---------- public voice: no banned tokens in any player-facing string ---------- */
{
  const strings = [];
  const push = (x) => { if (typeof x === 'string') strings.push(x); };
  for (const d of Object.values(OL.DOCUMENTS)) { push(d.title); push(d.keeper); d.lines.forEach(push); }
  for (const n of Object.values(OL.NODES)) {
    (n.lines || []).forEach(l => push(l.text));
    (n.intro || []).forEach(l => push(l.text));
    (n.options || []).forEach(o => { push(o.label); (o.lines || []).forEach(l => push(l.text)); });
  }
  for (const p of OL.WRITE_POINTS) {
    push(p.title); push(p.prompt);
    p.options.forEach(o => { push(o.label); push(o.source); push(o.logLine); });
  }
  for (const e of Object.values(OL.ENDINGS)) { push(e.title); e.body.forEach(push); }
  const banned = ['—', '–', 'delve', 'tapestry', 'pivotal', 'crucial', 'robust', 'seamless',
    'vibrant', 'intricate', 'meticulous', 'testament', 'leverage', 'utilize', 'foster',
    'unlock', 'unleash', 'empower', 'elevate', 'streamline', 'bespoke', 'game-changer',
    'transformative', 'cutting-edge', 'paramount', 'garner', 'bolster', 'embark',
    "it's worth noting", 'in plain words', 'in plain terms', 'at the end of the day',
    'deep dive', 'a plethora', 'treasure trove', 'look no further', 'hope this helps'];
  let hits = 0;
  for (const str of strings) {
    if (!str) continue;
    const low = str.toLowerCase();
    for (const b of banned) {
      if (low.includes(b)) { hits++; console.log('VOICE HIT: "' + b + '" in: ' + str.slice(0, 90)); }
    }
  }
  eq(hits, 0, 'no banned voice tokens in player-facing text (' + strings.filter(Boolean).length + ' strings checked)');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

/* The Outgoing Log — UI driver. Renders the logic engine's state as a
 * desk: transcript above, choices pinned below (always on screen).
 * Wires telemetry (vendored bundle, window.TC), the score engine, the
 * desk-bar document overlay, and the ?demo=1 self-playing mode.
 */
(function () {
  'use strict';

  var BUILD = 'gameoff-2026-1';
  var DEMO = /[?&]demo=1/.test(location.search);

  var WHO = {
    narr: '', doc: 'On the desk', maren: 'Maren', sella: 'Sella Wray',
    vane: 'Vane', rook: 'Anselm Rook', wick: 'Wick, the runner', written: 'You write'
  };
  var WATCH_LABEL = {
    title: 'The desk', desk: 'The desk, before the watches',
    w1_intro: 'First watch · 22:00', w1_maren: 'First watch · 22:00', w1_gate: 'First watch · 22:00',
    w2_intro: 'Second watch · 23:30', w2_sella: 'Second watch · 23:30',
    w3_intro: 'Third watch · 01:00', w3_vane: 'Third watch · 01:00', w3_gate: 'Third watch · 01:00',
    w4_intro: 'Fourth watch · 02:30', w4_rook: 'Fourth watch · 02:30',
    w5_intro: 'Last watch · 04:00', w5_runner: 'Last watch · 04:00',
    dawn_intro: 'Dawn · 05:30', write: 'Dawn · 05:30', ending: 'The outgoing log'
  };
  var WATCH_HEAD = {
    w1_intro: 'First watch · 22:00', w2_intro: 'Second watch · 23:30',
    w3_intro: 'Third watch · 01:00', w4_intro: 'Fourth watch · 02:30',
    w5_intro: 'Last watch · 04:00', dawn_intro: 'Dawn · 05:30'
  };

  var state = OL.newGame();
  var entered = {};        // nodeId -> true once its intro has been printed
  var endingShown = false;
  var decisionHandles = {}; // telemetry decision_pause handles by point

  var el = {
    transcript: document.getElementById('transcript'),
    choices: document.getElementById('choices'),
    watchlabel: document.getElementById('watchlabel'),
    volume: document.getElementById('volume'),
    tctoggle: document.getElementById('tctoggle'),
    overlay: document.getElementById('docoverlay'),
    doctitle: document.getElementById('doctitle'),
    docsub: document.getElementById('docsub'),
    docbody: document.getElementById('docbody')
  };

  /* ---------------- telemetry ---------------- */

  var TCok = typeof window.TC !== 'undefined';
  if (TCok) {
    try { window.TC.init({ game: 'the-outgoing-log', build: BUILD, demo: DEMO }); } catch (e) { TCok = false; }
  }
  function tcSend(event, fields) {
    if (!TCok) return;
    try { window.TC.send(event, fields || {}); } catch (e) { /* never throw into the game */ }
  }
  function tcDecisionStart(point) {
    if (!TCok || decisionHandles[point]) return;
    try { decisionHandles[point] = window.TC.decision(point); } catch (e) { /* ignore */ }
  }
  function tcDecisionCommit(point) {
    var h = decisionHandles[point];
    if (!h) return;
    decisionHandles[point] = null;
    try { h.commit(); } catch (e) { /* ignore */ }
  }
  if (TCok) {
    try { el.tctoggle.checked = !window.TC.optedOut(); } catch (e) { /* ignore */ }
  }
  el.tctoggle.addEventListener('change', function () {
    if (!TCok) return;
    try { window.TC.setOptOut(!el.tctoggle.checked); } catch (e) { /* ignore */ }
  });

  /* ---------------- audio ---------------- */

  var audioStarted = false;
  function startAudioOnce() {
    if (audioStarted) return;
    audioStarted = true;
    if (window.OLAudio && OLAudio.init()) OLAudio.start();
  }
  document.addEventListener('pointerdown', startAudioOnce);
  el.volume.value = String(Math.round((window.OLAudio ? OLAudio.getVolume() : 0.5) * 100));
  el.volume.addEventListener('input', function () {
    startAudioOnce();
    if (window.OLAudio) OLAudio.setVolume(parseInt(el.volume.value, 10) / 100);
  });

  /* ---------------- transcript ---------------- */

  function addLine(line) {
    var p = document.createElement('p');
    p.className = 'line ' + line.who;
    if (line.who !== 'narr' && WHO[line.who]) {
      var s = document.createElement('span');
      s.className = 'who'; s.textContent = WHO[line.who];
      p.appendChild(s);
    }
    p.appendChild(document.createTextNode(line.text));
    el.transcript.appendChild(p);
  }
  function addWatchHead(nodeId) {
    if (!WATCH_HEAD[nodeId]) return;
    var p = document.createElement('p');
    p.className = 'line watchhead';
    p.textContent = WATCH_HEAD[nodeId];
    el.transcript.appendChild(p);
  }
  function scrollStage() {
    var stage = document.getElementById('stage');
    stage.scrollTop = stage.scrollHeight;
  }

  function enterNode() {
    var id = state.node;
    if (entered[id]) return;
    entered[id] = true;
    var node = OL.nodeDef(state);
    addWatchHead(id);
    if (node.intro) node.intro.forEach(addLine);
    if (node.lines) node.lines.forEach(addLine);
    if (id === 'dawn_intro' && window.OLAudio) OLAudio.setMood('dawn');
    if (node.type === 'gate') tcDecisionStart(node.gate === 'maren' ? 'maren_crossing' : 'vane_crossing');
    if (node.type === 'write') tcDecisionStart('outgoing_log');
    if (node.type === 'ending') showEnding();
  }

  function showEnding() {
    if (endingShown) return;
    endingShown = true;
    var end = OL.resolveEnding(state);
    tcSend('log_written', { ending: end.slug });

    var box = document.createElement('div');
    box.className = 'logdoc';
    var h = document.createElement('h3');
    h.textContent = 'THE OUTGOING LOG, AS WRITTEN';
    box.appendChild(h);
    OL.WRITE_POINTS.forEach(function (p) {
      var chosen = state.log[p.id];
      var para = document.createElement('p');
      if (chosen && chosen.stance === 'omitted') {
        para.className = 'gap';
        para.textContent = 'Of the third matter, the tally and the cart, this log says nothing at all.';
      } else if (chosen && chosen.logLine) {
        para.textContent = chosen.logLine;
      }
      box.appendChild(para);
    });
    el.transcript.appendChild(box);

    var t = document.createElement('p');
    t.className = 'line endingtitle';
    t.textContent = end.title;
    el.transcript.appendChild(t);
    end.body.forEach(function (para) { addLine({ who: 'narr', text: para }); });
    end.epilogues.forEach(function (para) { addLine({ who: 'narr', text: para }); });
    addLine({ who: 'narr', text: 'The night is over. The log is what remains of it.' });
  }

  /* ---------------- choices ---------------- */

  function makeButton(opt, cls) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'choice ' + (cls || '');
    b.dataset.opt = opt.id;
    b.appendChild(document.createTextNode(opt.label));
    if (opt.source) {
      var s = document.createElement('span');
      s.className = 'src';
      s.textContent = opt.source;
      b.appendChild(s);
    }
    b.addEventListener('click', function () { onChoose(opt.id); });
    return b;
  }

  function renderChoices() {
    el.choices.innerHTML = '';
    var inner = document.createElement('div');
    inner.className = 'inner';
    el.choices.appendChild(inner);
    var node = OL.nodeDef(state);

    if (node.type === 'ending') {
      var r = document.createElement('button');
      r.type = 'button'; r.className = 'choice go'; r.dataset.opt = 'restart';
      r.textContent = 'Work another night (play again)';
      r.addEventListener('click', restart);
      inner.appendChild(r);
      return;
    }

    if (node.type === 'lines') {
      var c = document.createElement('button');
      c.type = 'button'; c.className = 'choice go'; c.dataset.opt = 'continue';
      c.textContent = state.node === 'title' ? 'Begin the night shift' : 'Go on';
      c.addEventListener('click', function () {
        startAudioOnce();
        OL.advance(state);
        afterMove();
      });
      inner.appendChild(c);
      return;
    }

    if (node.type === 'write') {
      var point = OL.WRITE_POINTS[state.writeStep];
      var head = document.createElement('div');
      head.id = 'writehead';
      var h2 = document.createElement('h2'); h2.textContent = point.title;
      var pp = document.createElement('p'); pp.textContent = point.prompt;
      head.appendChild(h2); head.appendChild(pp);
      inner.appendChild(head);
    }

    OL.visibleOptions(state).forEach(function (opt) {
      var cls = opt.kind === 'go' ? 'go' : (node.type === 'gate' ? 'gate' : (node.type === 'write' ? 'write' : ''));
      inner.appendChild(makeButton(opt, cls));
    });
  }

  function render() {
    enterNode();
    el.watchlabel.textContent = WATCH_LABEL[state.node] || '';
    renderChoices();
    scrollStage();
  }

  function afterMove() { render(); }

  function onChoose(optionId) {
    startAudioOnce();
    var watchesBefore = state.watchesDone.length;
    var nodeBefore = state.node;
    var res = OL.choose(state, optionId);
    if (!res) return;
    (res.lines || []).forEach(addLine);

    for (var i = watchesBefore; i < state.watchesDone.length; i++) {
      tcSend('watch_complete', { watch: state.watchesDone[i] });
    }
    if (res.gateDecision) {
      tcSend('gate_decision', { gate: res.gateDecision.gate, choice: res.gateDecision.choice });
      tcDecisionCommit(res.gateDecision.gate === 'maren' ? 'maren_crossing' : 'vane_crossing');
    }
    if (res.wrote) {
      var point = OL.WRITE_POINTS.find(function (p) { return p.id === res.wrote; });
      var chosen = state.log[res.wrote];
      addLine({ who: 'written', text: chosen.logLine || 'Of this, the log says nothing at all.' });
      if (point) { /* the entry just written */ }
    }
    if (res.endingReady) tcDecisionCommit('outgoing_log');
    if (state.node !== nodeBefore) { /* node entry lines print in render() */ }
    render();
  }

  function restart() {
    state = OL.newGame();
    entered = {};
    endingShown = false;
    decisionHandles = {};
    el.transcript.innerHTML = '';
    if (window.OLAudio) OLAudio.setMood('night');
    render();
  }

  /* ---------------- document overlay (desk bar) ---------------- */

  document.querySelectorAll('.deskbtn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.dataset.doc;
      var lines = OL.readDocument(state, key);
      if (!lines) return;
      var d = OL.DOCUMENTS[key];
      el.doctitle.textContent = d.title;
      el.docsub.textContent = d.keeper;
      el.docbody.innerHTML = '';
      d.lines.forEach(function (l) {
        var p = document.createElement('p');
        p.textContent = l;
        el.docbody.appendChild(p);
      });
      el.overlay.hidden = false;
      document.getElementById('docclose').focus();
    });
  });
  document.getElementById('docclose').addEventListener('click', function () {
    el.overlay.hidden = true;
  });
  el.overlay.addEventListener('click', function (ev) {
    if (ev.target === el.overlay) el.overlay.hidden = true;
  });

  /* ---------------- demo mode ---------------- */

  if (DEMO) {
    var demoTimer = setInterval(function () {
      var node = OL.nodeDef(state);
      if (node.type === 'ending') { clearInterval(demoTimer); return; }
      var pick = null;
      if (node.type === 'lines') {
        pick = document.querySelector('[data-opt="continue"]');
      } else if (node.type === 'write') {
        var want = { bell: 'bell_rung_admission', asking: 'ask_begged', cart: 'cart_favor_admission' }[OL.WRITE_POINTS[state.writeStep].id];
        pick = document.querySelector('[data-opt="' + want + '"]') || document.querySelector('#choices .choice');
      } else {
        var opts = OL.visibleOptions(state);
        var ask = opts.find(function (o) { return o.kind === 'ask' || o.kind === 'doc'; });
        if (ask) pick = document.querySelector('[data-opt="' + ask.id + '"]');
        else if (node.type === 'gate') {
          var wantGate = state.node === 'w1_gate' ? 'maren_open' : 'vane_bar';
          pick = document.querySelector('[data-opt="' + wantGate + '"]');
        } else {
          var go = opts.find(function (o) { return o.kind === 'go'; });
          if (go) pick = document.querySelector('[data-opt="' + go.id + '"]');
        }
      }
      if (pick) pick.click();
    }, 1000);
  }

  render();
})();

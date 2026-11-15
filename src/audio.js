/* The Outgoing Log — score engine (WebAudio, synthesized in the page).
 *
 * Composition rules (owner's standing music direction): fullness first,
 * melody in the foreground and singable, plain triads, diatonic, real
 * low end, NO pitch vibrato anywhere, no plucked-string voices, no
 * regular ticking figure on top. Warm pad strings use short bow attacks
 * and detuned saws through a lowpass; the melody is a soft horn blend
 * (triangle + sine) stated in the mid register.
 *
 * One composition definition drives both the live engine and the
 * offline render used for the listen copy, so what the owner hears in
 * the copy is what plays in the game.
 *
 * API: OLAudio.init() (on a user gesture), .start(), .stop(),
 * .setVolume(0..1), .getVolume(), .setMood('night'|'dawn'),
 * .renderOffline(seconds) -> Promise<AudioBuffer> (listen copies).
 */
(function (root) {
  'use strict';

  var BPM = 66;
  var BEAT = 60 / BPM;          // seconds per quarter note
  var BAR = BEAT * 4;

  function mf(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  /* Chords per bar, 8-bar loop. Pad voicings sit in the mid register;
   * bass is a sine one octave under the root. Dawn mood changes only
   * the last bar: C major gives way to D major, and the fog lifts. */
  var CHORDS_NIGHT = [
    { pad: [57, 62, 65], bass: 38 },  // Dm
    { pad: [58, 62, 65], bass: 34 },  // Bb
    { pad: [57, 60, 65], bass: 41 },  // F
    { pad: [55, 60, 64], bass: 36 },  // C
    { pad: [57, 62, 65], bass: 38 },  // Dm
    { pad: [58, 62, 65], bass: 34 },  // Bb
    { pad: [57, 60, 65], bass: 41 },  // F
    { pad: [55, 60, 64], bass: 36 }   // C
  ];
  var CHORDS_DAWN = CHORDS_NIGHT.slice();
  CHORDS_DAWN[7] = { pad: [57, 62, 66], bass: 38 };  // D major

  /* Melody: [bar, beatInBar, midi, beats]. Stated twice per loop; the
   * second statement answers the first. Plain, singable, repeats. */
  var MELODY_NIGHT = [
    [0, 0, 69, 2], [0, 2, 65, 1], [0, 3, 67, 1],
    [1, 0, 69, 3], [1, 3, 72, 1],
    [2, 0, 74, 2], [2, 2, 72, 1], [2, 3, 69, 1],
    [3, 0, 67, 2], [3, 2, 64, 2],
    [4, 0, 69, 2], [4, 2, 65, 1], [4, 3, 67, 1],
    [5, 0, 69, 3], [5, 3, 72, 1],
    [6, 0, 74, 2], [6, 2, 72, 1], [6, 3, 69, 1],
    [7, 0, 64, 2], [7, 2, 62, 2]
  ];
  var MELODY_DAWN = MELODY_NIGHT.slice(0, MELODY_NIGHT.length - 2).concat([
    [7, 0, 69, 2], [7, 2, 66, 1], [7, 3, 62, 1]
  ]);
  /* Second statement of the night melody, varied in its second half
   * so alternate loops do not repeat the first verbatim. Same motif,
   * same register, a different way home. */
  var MELODY_NIGHT_B = MELODY_NIGHT.slice(0, 10).concat([
    [4, 0, 72, 2], [4, 2, 69, 1], [4, 3, 67, 1],
    [5, 0, 65, 3], [5, 3, 69, 1],
    [6, 0, 74, 2], [6, 2, 72, 1], [6, 3, 74, 1],
    [7, 0, 69, 2], [7, 2, 67, 2]
  ]);

  /* ---- voices (shared by live and offline graphs) ---- */

  function padChord(ctx, dest, chord, t, dur, mood, phase) {
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.048, t + 0.9);        // bow attack
    g.gain.setValueAtTime(0.048, t + dur - 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.35);
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = mood === 'dawn' ? 1300 : 950; f.Q.value = 0.4;
    g.connect(f); f.connect(dest);
    chord.pad.forEach(function (m) {
      [-5, 4].forEach(function (cents) {
        var o = ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = mf(m); o.detune.value = cents;
        o.connect(g); o.start(t); o.stop(t + dur + 0.4);
      });
      var sub = ctx.createOscillator();                    // sine body under each note
      sub.type = 'sine'; sub.frequency.value = mf(m);
      var sg = ctx.createGain(); sg.gain.value = 0.5;
      sub.connect(sg); sg.connect(g); sub.start(t); sub.stop(t + dur + 0.4);
    });
    if (phase >= 1) {
      // Later watches: a quiet octave shimmer over the top note,
      // the arrangement gathering itself as the night deepens.
      var top = ctx.createOscillator();
      top.type = 'sine'; top.frequency.value = mf(chord.pad[chord.pad.length - 1] + 12);
      var tg = ctx.createGain(); tg.gain.value = 0.16;
      top.connect(tg); tg.connect(g); top.start(t); top.stop(t + dur + 0.4);
    }
  }

  function bassNote(ctx, dest, midi, t, dur) {
    var o = ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = mf(midi);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.25);
    g.gain.setValueAtTime(0.16, t + dur - 0.4);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
    // A quiet triangle at the same pitch gives the sine a harmonic
    // edge, so the low end survives small speakers.
    var tri = ctx.createOscillator();
    tri.type = 'triangle'; tri.frequency.value = mf(midi);
    var tg = ctx.createGain(); tg.gain.value = 0.05;
    tri.connect(tg); tg.connect(dest);
    tri.start(t); tri.stop(t + dur + 0.05);
  }

  function melodyNote(ctx, dest, midi, t, dur, phase) {
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.15, t + 0.14);        // soft horn attack
    g.gain.setValueAtTime(0.15, t + Math.max(0.14, dur - 0.22));
    g.gain.linearRampToValueAtTime(0, t + dur);
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 2100; f.Q.value = 0.3;
    g.connect(f); f.connect(dest);
    var tri = ctx.createOscillator();
    tri.type = 'triangle'; tri.frequency.value = mf(midi);
    tri.connect(g); tri.start(t); tri.stop(t + dur + 0.05);
    var sin = ctx.createOscillator();
    sin.type = 'sine'; sin.frequency.value = mf(midi);
    var sg = ctx.createGain(); sg.gain.value = 0.6;
    sin.connect(sg); sg.connect(g); sin.start(t); sin.stop(t + dur + 0.05);
    if (phase >= 2) {
      // Deepest watches: a second horn a third below, quieter, so
      // the theme is stated by an ensemble, not a solo line.
      var harm = ctx.createOscillator();
      harm.type = 'triangle'; harm.frequency.value = mf(midi - 4);
      var hg = ctx.createGain(); hg.gain.value = 0.38;
      harm.connect(hg); hg.connect(g); harm.start(t); harm.stop(t + dur + 0.05);
    }
  }

  var windCache = { ctx: null, buf: null };
  function windBuffer(ctx) {
    if (windCache.ctx === ctx && windCache.buf) return windCache.buf;
    var len = Math.ceil(ctx.sampleRate * 6);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    var last = 0;
    for (var i = 0; i < len; i++) {                        // brown-ish noise
      var white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    windCache = { ctx: ctx, buf: buf };
    return buf;
  }

  function windBed(ctx, dest, t, dur, mood) {
    var src = ctx.createBufferSource();
    src.buffer = windBuffer(ctx); src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;    // the seam never repeats exactly
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 420;
    var g = ctx.createGain(); g.gain.value = mood === 'dawn' ? 0.018 : 0.035;
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 4); src.stop(t + dur);
  }

  /* The fog bell itself: struck metal, sine partials decaying at
   * their own rates. The game's ruling object, heard at last. */
  function bellStrike(ctx, dest, t, level) {
    var base = 196;                                        // G3
    [[1, 1], [2.02, 0.55], [2.74, 0.38], [3.76, 0.22], [5.4, 0.1]].forEach(function (p) {
      var o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = base * p[0];
      var g = ctx.createGain();
      var peak = level * p[1];
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.0004, t + 3.2 - p[0] * 0.32);
      o.connect(g); g.connect(dest);
      o.start(t); o.stop(t + 3.4);
    });
  }

  function noiseBurst(ctx, dest, t, dur, freq, level, type) {
    var len = Math.max(1, Math.ceil(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var f = ctx.createBiquadFilter();
    f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = 0.9;
    var g = ctx.createGain(); g.gain.value = level;
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t);
  }

  /* The gate bar: a low wooden thud and an iron scrape. Opening
   * scrapes longer; barring ends in the clunk of the bar home. */
  function gateSoundAt(ctx, dest, t, opened) {
    var o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(82, t);
    o.frequency.exponentialRampToValueAtTime(41, t + 0.22);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.3);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + 0.32);
    noiseBurst(ctx, dest, t + 0.05, opened ? 0.65 : 0.3, 340, 0.12);
    if (!opened) noiseBurst(ctx, dest, t + 0.34, 0.12, 180, 0.16, 'lowpass');
  }

  /* A pen on rough paper: three short strokes. */
  function penSoundAt(ctx, dest, t) {
    for (var i = 0; i < 3; i++) {
      noiseBurst(ctx, dest, t + i * 0.11, 0.07, 2600, 0.05, 'highpass');
    }
  }

  /* Schedule one bar (pad, bass, that bar's melody notes, wind). */
  function scheduleBar(ctx, dest, t, barIdx, mood, phase) {
    var chords = mood === 'dawn' ? CHORDS_DAWN : CHORDS_NIGHT;
    var loopIdx = Math.floor(barIdx / 8);
    var melody = mood === 'dawn' ? MELODY_DAWN
      : (loopIdx % 2 === 1 ? MELODY_NIGHT_B : MELODY_NIGHT);
    var bar = ((barIdx % 8) + 8) % 8;
    padChord(ctx, dest, chords[bar], t, BAR, mood, phase || 0);
    bassNote(ctx, dest, chords[bar].bass, t, BAR);
    melody.forEach(function (n) {
      if (n[0] === bar) {
        melodyNote(ctx, dest, n[2], t + n[1] * BEAT, n[3] * BEAT * 0.96, phase || 0);
      }
    });
    windBed(ctx, dest, t, BAR, mood);
  }

  /* Schedule one full 8-bar loop starting at time t. */
  function scheduleLoop(ctx, dest, t, mood) {
    for (var bar = 0; bar < 8; bar++) {
      scheduleBar(ctx, dest, t + bar * BAR, bar, mood, 0);
    }
    return 8 * BAR;
  }

  /* ---- live engine ---- */

  var VOL_KEY = 'outgoingLogVolume';
  var live = null;

  function storedVolume() {
    try {
      var v = parseFloat(localStorage.getItem(VOL_KEY));
      if (isFinite(v) && v >= 0 && v <= 1) return v;
    } catch (e) { /* storage unavailable */ }
    return 0.5;
  }

  var api = {
    volume: storedVolume(),
    mood: 'night',
    phase: 0,

    init: function () {
      if (live) return true;
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return false;
      var ctx = new AC();
      var master = ctx.createGain();
      master.gain.value = api.volume;
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 18; comp.ratio.value = 4;
      comp.attack.value = 0.01; comp.release.value = 0.24;
      master.connect(comp); comp.connect(ctx.destination);
      live = { ctx: ctx, master: master, timer: null, nextAt: 0, bar: 0, started: false };
      return true;
    },

    start: function () {
      if (!live || live.started) return;
      live.started = true;
      if (live.ctx.state === 'suspended') live.ctx.resume();
      live.nextAt = live.ctx.currentTime + 0.1;
      live.bar = 0;
      var tick = function () {
        // Commit one bar at a time, so a mood change lands at the
        // next bar line instead of up to a full loop later.
        while (live.nextAt < live.ctx.currentTime + 0.8) {
          scheduleBar(live.ctx, live.master, live.nextAt, live.bar, api.mood, api.phase);
          live.nextAt += BAR;
          live.bar += 1;
        }
      };
      tick();
      live.timer = setInterval(tick, 300);
    },

    stop: function () {
      if (!live) return;
      if (live.timer) clearInterval(live.timer);
      live.started = false;
      try { live.ctx.close(); } catch (e) { /* already closed */ }
      live = null;
    },

    setVolume: function (v) {
      api.volume = Math.min(1, Math.max(0, v));
      try { localStorage.setItem(VOL_KEY, String(api.volume)); } catch (e) { /* ignore */ }
      if (live) live.master.gain.setTargetAtTime(api.volume, live.ctx.currentTime, 0.05);
    },

    getVolume: function () { return api.volume; },

    setMood: function (m) { api.mood = (m === 'dawn') ? 'dawn' : 'night'; },

    setPhase: function (p) { api.phase = Math.min(2, Math.max(0, p | 0)); },

    /* One-shot production sounds, on the live graph only. */
    toll: function (n) {
      if (!live || !live.started) return;
      var t = live.ctx.currentTime + 0.05;
      for (var i = 0; i < (n || 1); i++) {
        bellStrike(live.ctx, live.master, t + i * 1.7, 0.11);
      }
    },

    gateSound: function (opened) {
      if (!live || !live.started) return;
      gateSoundAt(live.ctx, live.master, live.ctx.currentTime + 0.03, opened);
    },

    penSound: function () {
      if (!live || !live.started) return;
      penSoundAt(live.ctx, live.master, live.ctx.currentTime + 0.03);
    },

    /* Offline render of the same composition (night mood, then the
     * dawn loop), for listen copies. */
    renderOffline: function (seconds) {
      var OC = root.OfflineAudioContext;
      if (!OC) return Promise.reject(new Error('no OfflineAudioContext'));
      var sr = 44100;
      var ctx = new OC(2, Math.ceil(seconds * sr), sr);
      var master = ctx.createGain();
      master.gain.value = 0.5;
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 18; comp.ratio.value = 4;
      comp.attack.value = 0.01; comp.release.value = 0.24;
      master.connect(comp); comp.connect(ctx.destination);
      var loopLen = 8 * BAR;
      var t = 0;
      var mood = 'night';
      var barIdx = 0;
      while (t < seconds - 1) {
        if (t >= seconds / 2) mood = 'dawn';
        var phase = t < seconds / 3 ? 0 : (t < (2 * seconds) / 3 ? 1 : 2);
        for (var b = 0; b < 8; b++) {
          scheduleBar(ctx, master, t + b * BAR, barIdx + b, mood, phase);
        }
        barIdx += 8;
        t += loopLen;
      }
      // The bell answers at the join, where night gives way to dawn.
      bellStrike(ctx, master, seconds / 2, 0.09);
      bellStrike(ctx, master, seconds / 2 + 1.7, 0.07);
      return ctx.startRendering();
    }
  };

  root.OLAudio = api;

  /* The composition itself, exposed so the listen-copy renderer
   * (media-src/render-listen.js) renders the identical score. */
  api._score = {
    BPM: BPM, BEAT: BEAT, BAR: BAR,
    CHORDS_NIGHT: CHORDS_NIGHT, CHORDS_DAWN: CHORDS_DAWN,
    MELODY_NIGHT: MELODY_NIGHT, MELODY_DAWN: MELODY_DAWN, MELODY_NIGHT_B: MELODY_NIGHT_B
  };
})(typeof self !== 'undefined' ? self : this);

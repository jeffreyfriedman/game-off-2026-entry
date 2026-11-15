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

  /* ---- voices (shared by live and offline graphs) ---- */

  function padChord(ctx, dest, chord, t, dur) {
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.055, t + 0.9);        // bow attack
    g.gain.setValueAtTime(0.055, t + dur - 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.35);
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 950; f.Q.value = 0.4;
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
  }

  function melodyNote(ctx, dest, midi, t, dur) {
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.11, t + 0.14);        // soft horn attack
    g.gain.setValueAtTime(0.11, t + Math.max(0.14, dur - 0.22));
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
  }

  function windBed(ctx, dest, t, dur) {
    var len = Math.ceil(ctx.sampleRate * 2);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    var last = 0;
    for (var i = 0; i < len; i++) {                        // brown-ish noise
      var white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    var src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 420;
    var g = ctx.createGain(); g.gain.value = 0.035;
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t); src.stop(t + dur);
  }

  /* Schedule one full 8-bar loop starting at time t. */
  function scheduleLoop(ctx, dest, t, mood) {
    var chords = mood === 'dawn' ? CHORDS_DAWN : CHORDS_NIGHT;
    var melody = mood === 'dawn' ? MELODY_DAWN : MELODY_NIGHT;
    for (var bar = 0; bar < 8; bar++) {
      padChord(ctx, dest, chords[bar], t + bar * BAR, BAR);
      bassNote(ctx, dest, chords[bar].bass, t + bar * BAR, BAR);
    }
    melody.forEach(function (n) {
      melodyNote(ctx, dest, n[2], t + n[0] * BAR + n[1] * BEAT, n[3] * BEAT * 0.96);
    });
    windBed(ctx, dest, t, 8 * BAR);
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

    init: function () {
      if (live) return true;
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return false;
      var ctx = new AC();
      var master = ctx.createGain();
      master.gain.value = api.volume;
      master.connect(ctx.destination);
      live = { ctx: ctx, master: master, timer: null, nextAt: 0, started: false };
      return true;
    },

    start: function () {
      if (!live || live.started) return;
      live.started = true;
      if (live.ctx.state === 'suspended') live.ctx.resume();
      live.nextAt = live.ctx.currentTime + 0.1;
      var tick = function () {
        while (live.nextAt < live.ctx.currentTime + 0.8) {
          live.nextAt += scheduleLoop(live.ctx, live.master, live.nextAt, api.mood);
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

    /* Offline render of the same composition (night mood, then the
     * dawn loop), for listen copies. */
    renderOffline: function (seconds) {
      var OC = root.OfflineAudioContext;
      if (!OC) return Promise.reject(new Error('no OfflineAudioContext'));
      var sr = 44100;
      var ctx = new OC(2, Math.ceil(seconds * sr), sr);
      var master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      var loopLen = 8 * BAR;
      var t = 0;
      var mood = 'night';
      while (t < seconds - 1) {
        if (t >= seconds / 2) mood = 'dawn';
        scheduleLoop(ctx, master, t, mood);
        t += loopLen;
      }
      return ctx.startRendering();
    }
  };

  root.OLAudio = api;

  /* The composition itself, exposed so the listen-copy renderer
   * (media-src/render-listen.js) renders the identical score. */
  api._score = {
    BPM: BPM, BEAT: BEAT, BAR: BAR,
    CHORDS_NIGHT: CHORDS_NIGHT, CHORDS_DAWN: CHORDS_DAWN,
    MELODY_NIGHT: MELODY_NIGHT, MELODY_DAWN: MELODY_DAWN
  };
})(typeof self !== 'undefined' ? self : this);

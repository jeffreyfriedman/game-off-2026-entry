/* Listen-copy renderer: renders the game's score (src/audio.js, the
 * identical composition data) to a WAV with a small Node DSP mirror of
 * the WebAudio voices, then the caller converts to mp3 and normalizes.
 *
 * Voices mirrored from audio.js: pad = 2 detuned saws + sine body per
 * note through a 950 Hz one-pole lowpass, bow attack; bass = sine;
 * melody = triangle + sine through a 2100 Hz lowpass; wind = brown
 * noise through a 420 Hz lowpass. No pitch modulation anywhere.
 *
 * Run: node media-src/render-listen.js [seconds] [out.wav]
 */
'use strict';
global.self = global;
require('../src/audio.js');
const fs = require('fs');

const S = global.OLAudio._score;
const SR = 44100;
const SECONDS = parseFloat(process.argv[2] || '75');
const OUT = process.argv[3] || 'media-src/listen.wav';
const N = Math.floor(SECONDS * SR);
const mix = new Float32Array(N);

const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
const lpCoef = (fc) => 1 - Math.exp(-2 * Math.PI * fc / SR);

function addTone(t0, dur, fn) {
  const start = Math.floor(t0 * SR);
  const end = Math.min(N, Math.floor((t0 + dur) * SR));
  for (let i = start; i < end; i++) mix[i] += fn((i - start) / SR, i);
}

function env(t, dur, peak, attack, release) {
  if (t < 0 || t > dur + 0.4) return 0;
  if (t < attack) return peak * (t / attack);
  if (t > dur - release) return peak * Math.max(0, (dur + 0.35 - t) / (release + 0.35));
  return peak;
}

function padChord(chord, t0, dur) {
  const a = lpCoef(950);
  for (const m of chord.pad) {
    for (const cents of [-5, 4]) {
      const f = mf(m) * Math.pow(2, cents / 1200);
      let phase = 0, lp = 0;
      addTone(t0, dur + 0.4, (t) => {
        phase += f / SR;
        const saw = 2 * (phase - Math.floor(phase + 0.5));
        lp += a * (saw - lp);
        return lp * env(t, dur, 0.055, 0.9, 0.7) * 0.5;
      });
    }
    const f = mf(m);
    let phase = 0, lp = 0;
    addTone(t0, dur + 0.4, (t) => {
      phase += f / SR;
      lp += a * (Math.sin(2 * Math.PI * phase) - lp);
      return lp * env(t, dur, 0.055, 0.9, 0.7) * 0.5;
    });
  }
}

function bass(midi, t0, dur) {
  const f = mf(midi);
  let phase = 0;
  addTone(t0, dur, (t) => {
    phase += f / SR;
    const e = t < 0.25 ? 0.16 * (t / 0.25) : (t > dur - 0.4 ? 0.16 * Math.max(0, (dur - t) / 0.4) : 0.16);
    return Math.sin(2 * Math.PI * phase) * e;
  });
}

function melody(midi, t0, dur) {
  const f = mf(midi);
  const a = lpCoef(2100);
  let phase = 0, lp = 0;
  addTone(t0, dur, (t) => {
    phase += f / SR;
    const tri = 2 * Math.abs(2 * (phase - Math.floor(phase + 0.5))) - 1;
    const x = tri + 0.6 * Math.sin(2 * Math.PI * phase);
    lp += a * (x - lp);
    const e = t < 0.14 ? 0.11 * (t / 0.14) : (t > dur - 0.22 ? 0.11 * Math.max(0, (dur - t) / 0.22) : 0.11);
    return lp * e;
  });
}

function wind(t0, dur) {
  const a = lpCoef(420);
  let last = 0, lp = 0;
  addTone(t0, dur, () => {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    lp += a * (last * 3.2 - lp);
    return lp * 0.035;
  });
}

function scheduleLoop(t0, mood) {
  const chords = mood === 'dawn' ? S.CHORDS_DAWN : S.CHORDS_NIGHT;
  const mel = mood === 'dawn' ? S.MELODY_DAWN : S.MELODY_NIGHT;
  for (let bar = 0; bar < 8; bar++) {
    padChord(chords[bar], t0 + bar * S.BAR, S.BAR);
    bass(chords[bar].bass, t0 + bar * S.BAR, S.BAR);
  }
  for (const n of mel) melody(n[2], t0 + n[0] * S.BAR + n[1] * S.BEAT, n[3] * S.BEAT * 0.96);
  wind(t0, 8 * S.BAR);
}

let t = 0;
while (t < SECONDS - 1) {
  scheduleLoop(t, t >= SECONDS / 2 ? 'dawn' : 'night');
  t += 8 * S.BAR;
}

// soft clip guard
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(mix[i]));
const scale = peak > 0.95 ? 0.95 / peak : 1;
console.error('rendered ' + SECONDS + 's, raw peak ' + peak.toFixed(3) + ', scale ' + scale.toFixed(3));

if (OUT === 'stdout') {
  // raw s16le stereo PCM to stdout (pipe into ffmpeg; avoids a direct
  // file write of the full render buffer)
  const pcm = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    const v = Math.max(-1, Math.min(1, mix[i] * scale));
    pcm.writeInt16LE(Math.round(v * 32767), i * 4);
    pcm.writeInt16LE(Math.round(v * 32767), i * 4 + 2);
  }
  process.stdout.write(pcm);
} else {
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    const v = Math.max(-1, Math.min(1, mix[i] * scale));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 4 + 2);
  }
  fs.writeFileSync(OUT, buf);
  console.error('wrote ' + OUT + ' (' + buf.length + ' bytes)');
}

// Builds the study sounds in assets/sounds/: background sounds (rain, waves, fire, wind, a stream,
// white, pink and brown noise) and calm music loops (pads, keys, lo-fi beat, piano, chimes, drone).
//
// Every sound is made here from maths (no recordings, no samples), so the app can ship them
// with no licence or credit to worry about. Each file is a seamless loop: the player repeats it
// for as long as you study, with no gap or click where it starts again.
//
// The output is committed, so this only needs running again to change a sound:
//   node scripts/generate-focus-sounds.mjs
// A fixed random seed makes every run produce the same files.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'assets/sounds');
// Samples per second: 22050 is plenty for soft background sound and half the size of CD quality.
// Deep, dark sounds use 16000 to keep the app smaller. Set per sound before it is made (see Build).
let RATE = 22050;

// --- Helpers ----------------------------------------------------------------

/** Small seeded random generator (mulberry32): the same seed gives the same sound every run. */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Makes a noise loop seamless: renders `fade` extra samples past the end and blends them into
 * the start, so the last sample flows straight into the first. Equal-power, since noise is random.
 */
function loopNoise(render, seconds, fadeSeconds = 1.5) {
  const n = Math.round(seconds * RATE);
  const fade = Math.round(fadeSeconds * RATE);
  const raw = render(n + fade);
  const out = raw.slice(0, n);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    out[i] = raw[i] * Math.sin((t * Math.PI) / 2) + raw[n + i] * Math.cos((t * Math.PI) / 2);
  }
  return out;
}

/** Scales a sound to an even loudness, then softly limits any peaks. */
function level(samples, rms = 0.12) {
  let sum = 0;
  for (const s of samples) sum += s * s;
  const gain = rms / Math.sqrt(sum / samples.length || 1);
  return samples.map((s) => Math.tanh(s * gain * 1.1) / 1.1);
}

/** Scales a sound so its loudest point is at `peak`. */
function normalise(samples, peak = 0.7) {
  let max = 0;
  for (const s of samples) max = Math.max(max, Math.abs(s));
  return max ? samples.map((s) => (s / max) * peak) : samples;
}

/** 16-bit mono PCM WAV file. */
function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28); // bytes per second
  header.writeUInt16LE(2, 32); // bytes per sample
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Pink noise (Paul Kellet's filter): softer than white noise, like a steady fan. */
function pinkNoise(n, rand) {
  const out = new Float64Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = rand() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
  }
  return out;
}

/** Brown noise: deep and rumbly, like distant waves or a plane cabin. */
function brownNoise(n, rand) {
  const out = new Float64Array(n);
  let last = 0;
  for (let i = 0; i < n; i++) {
    last = (last + 0.02 * (rand() * 2 - 1)) * 0.998; // the leak keeps it from drifting off
    out[i] = last;
  }
  return out;
}

/** One-pole low-pass filter, in place. */
function lowPass(samples, cutoffHz) {
  const a = Math.exp((-2 * Math.PI * cutoffHz) / RATE);
  let y = 0;
  for (let i = 0; i < samples.length; i++) samples[i] = y = (1 - a) * samples[i] + a * y;
  return samples;
}

/** Low-pass for a loop: starts from where the filter ends, so the end flows into the start. */
function loopLowPass(samples, cutoffHz) {
  const a = Math.exp((-2 * Math.PI * cutoffHz) / RATE);
  let y = 0;
  for (const s of samples) y = (1 - a) * s + a * y; // a first run, only to learn the end state
  for (let i = 0; i < samples.length; i++) samples[i] = y = (1 - a) * samples[i] + a * y;
  return samples;
}

/** Rain: a hiss of fine drops, a soft low wash, and scattered closer drops. */
function rain(n, rand) {
  const hiss = pinkNoise(n, rand);
  // High-pass the hiss (signal minus its low-passed self) so it sounds like water, not wind.
  const low = lowPass(Float64Array.from(hiss), 900);
  const wash = lowPass(brownNoise(n, rand), 300);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = (hiss[i] - low[i]) * 0.9 + wash[i] * 6;
  // Closer drops: short bursts of bright noise that die away quickly.
  const drops = Math.round((n / RATE) * 14);
  for (let d = 0; d < drops; d++) {
    const start = Math.floor(rand() * n);
    const size = 0.15 + rand() * 0.5;
    const length = Math.round(RATE * (0.01 + rand() * 0.03));
    let y = 0;
    for (let j = 0; j < length && start + j < n; j++) {
      const w = rand() * 2 - 1;
      y = 0.5 * y + 0.5 * w; // gentle smoothing: a "tap", not a "click"
      out[start + j] += y * size * Math.exp((-6 * j) / length);
    }
  }
  return out;
}

// --- Music ------------------------------------------------------------------
// Notes are written into a circular buffer as long as the loop: a note that rings past the end
// wraps round to the start, so the loop repeats without a seam.

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);

function addNote(buffer, startSec, midi, durationSec, voice) {
  const n = buffer.length;
  const start = Math.round(startSec * RATE);
  const length = Math.round(durationSec * RATE);
  for (let j = 0; j < length; j++) {
    const t = j / RATE;
    buffer[(start + j) % n] += voice(t, freq(midi), durationSec);
  }
}

/** A warm pad: a few slightly detuned sines that swell in and fade out slowly. */
function pad(t, f, duration) {
  const attack = 2.5;
  const release = 3.5;
  const env = Math.min(1, t / attack) * Math.min(1, Math.max(0, (duration - t) / release));
  const swell = 0.85 + 0.15 * Math.sin(2 * Math.PI * 0.15 * t); // a slow breathing movement
  let s = 0;
  for (const detune of [-0.004, 0, 0.004]) {
    const p = 2 * Math.PI * f * (1 + detune) * t;
    s += Math.sin(p) + 0.18 * Math.sin(2 * p) + 0.05 * Math.sin(3 * p);
  }
  return s * env * env * swell;
}

/** A soft electric-piano-like key: quick, gentle attack, and higher partials die away first. */
function keys(t, f, duration) {
  const attack = Math.min(1, t / 0.012);
  const fadeOut = Math.min(1, Math.max(0, (duration - t) / 0.4));
  const p = 2 * Math.PI * f * t;
  const s =
    Math.sin(p) * Math.exp(-t * 1.6) +
    0.35 * Math.sin(2 * p) * Math.exp(-t * 3.5) +
    0.1 * Math.sin(3 * p) * Math.exp(-t * 6) +
    0.06 * Math.sin(4.02 * p) * Math.exp(-t * 9); // a faint bell-like shimmer
  return s * attack * fadeOut;
}

/** A soft, round bass note. */
function bass(t, f, duration) {
  const env = Math.min(1, t / 0.05) * Math.exp(-t * 0.6) * Math.min(1, Math.max(0, (duration - t) / 0.5));
  const p = 2 * Math.PI * f * t;
  return (Math.sin(p) + 0.2 * Math.sin(2 * p)) * env;
}

// Chords as MIDI notes. A slow, unresolved progression: nothing to grab your attention.
const PAD_CHORDS = [
  [48, 55, 59, 64], // Cmaj7
  [45, 52, 55, 60], // Am7
  [41, 48, 52, 57], // Fmaj7
  [43, 50, 55, 59], // G (with the 7th's colour from B)
];

function calmPads() {
  const chordSec = 8;
  const buffer = new Float64Array(PAD_CHORDS.length * chordSec * RATE);
  PAD_CHORDS.forEach((chord, c) => {
    // Each chord rings a little into the next, so they cross-fade.
    for (const note of chord) addNote(buffer, c * chordSec, note, chordSec + 3, pad);
    addNote(buffer, c * chordSec, chord[0] - 12, chordSec + 2, (t, f, d) => 0.6 * pad(t, f, d));
  });
  return loopLowPass(buffer, 2200);
}

const KEY_CHORDS = [
  { root: 41, notes: [57, 60, 64, 67] }, // Fmaj7
  { root: 40, notes: [55, 59, 62, 67] }, // Em7
  { root: 38, notes: [57, 60, 62, 65] }, // Dm7
  { root: 36, notes: [55, 59, 60, 64] }, // Cmaj7
];

function softKeys(rand) {
  const beat = 60 / 70; // 70 beats a minute: slow and steady
  const beatsPerChord = 8;
  const buffer = new Float64Array(Math.round(KEY_CHORDS.length * beatsPerChord * beat * RATE));
  KEY_CHORDS.forEach(({ root, notes }, c) => {
    const at = c * beatsPerChord * beat;
    addNote(buffer, at, root, beatsPerChord * beat, (t, f, d) => 0.55 * bass(t, f, d));
    // A soft chord on the first beat, then a few notes picked from it, unhurried.
    notes.forEach((note, i) => addNote(buffer, at + i * 0.03, note, 3, (t, f, d) => 0.35 * keys(t, f, d)));
    for (let b = 2; b < beatsPerChord; b += 1) {
      if (rand() < 0.35) continue; // leave some beats empty
      const note = notes[Math.floor(rand() * notes.length)] + (rand() < 0.3 ? 12 : 0);
      const swing = b % 2 ? beat * 0.08 : 0; // a slight lazy feel
      addNote(buffer, at + b * beat + swing, note, 2.5, (t, f, d) => (0.4 + rand() * 0.15) * keys(t, f, d));
    }
  });
  return loopLowPass(buffer, 3500);
}

/** Adds echoes that wrap round the loop, like a small room: makes notes feel less dry. */
function echo(buffer, delaySec, feedback) {
  const n = buffer.length;
  const d = Math.round(delaySec * RATE);
  const dry = Float64Array.from(buffer);
  // Each echo is the sound plus a quieter copy of what came `delay` earlier, wrapping round the
  // loop. Going round a few times lets the echoes from the end settle in at the start.
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < n; i++) buffer[i] = dry[i] + feedback * buffer[(i - d + n) % n];
  }
  return buffer;
}

/** A frequency nudged so it fits a whole number of times into the loop: no click where it wraps. */
const fit = (f, loopSec) => Math.round(f * loopSec) / loopSec;

// --- More background sounds -------------------------------------------------

/** White noise: an even, bright hiss that covers chatter well. */
function whiteNoise(n, rand) {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = rand() * 2 - 1;
  return lowPass(out, 8000); // takes off the harshest edge
}

/**
 * Ocean waves: each wave swells, breaks into bright foam and drains away, over a constant deep
 * wash. The swells repeat exactly with the loop, so `loopNoise` can blend the ends seamlessly.
 */
function oceanWaves(loopSec) {
  const waves = [
    { at: 0, length: 8.5, size: 1 },
    { at: 8.5, length: 7, size: 0.7 },
    { at: 15.5, length: 8.5, size: 0.85 },
  ]; // fills the 24-second loop
  const swell = (sec) => {
    const t = ((sec % loopSec) + loopSec) % loopSec;
    let v = 0.12;
    for (const w of waves) {
      const p = (t - w.at) / w.length;
      if (p < 0 || p >= 1) continue;
      const rise = 0.4;
      v += w.size * (p < rise ? Math.sin(((p / rise) * Math.PI) / 2) ** 2 : Math.exp(-(p - rise) * 5.5));
    }
    return v;
  };
  return (n, rand) => {
    const foam = pinkNoise(n, rand);
    const deep = lowPass(brownNoise(n, rand), 250);
    const out = new Float64Array(n);
    let y = 0;
    for (let i = 0; i < n; i++) {
      const s = swell(i / RATE);
      // The foam brightens as the wave breaks: a low-pass that opens with the swell.
      const a = Math.exp((-2 * Math.PI * (250 + 2600 * s)) / RATE);
      y = (1 - a) * foam[i] + a * y;
      out[i] = y * s * 1.4 + deep[i] * 5;
    }
    return out;
  };
}

/** Crackling fire: a low roar, a faint hiss, many tiny crackles and the odd louder pop. */
function fire(n, rand) {
  const roar = lowPass(brownNoise(n, rand), 160);
  const hiss = pinkNoise(n, rand);
  const hissLow = lowPass(Float64Array.from(hiss), 2500);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = roar[i] * 9 + (hiss[i] - hissLow[i]) * 0.12;
  const seconds = n / RATE;
  // Crackles: mostly tiny, a few loud (cubing the random size does that).
  for (let c = 0; c < seconds * 30; c++) {
    const start = Math.floor(rand() * n);
    const size = rand() ** 3 * 1.6;
    const length = Math.round(RATE * (0.001 + rand() * 0.005));
    let prev = 0;
    for (let j = 0; j < length && start + j < n; j++) {
      const w = rand() * 2 - 1;
      out[start + j] += (w - prev) * size * Math.exp((-5 * j) / length); // bright: the change, not the level
      prev = w;
    }
  }
  // Pops: a short, ringing snap of wood every second or two.
  for (let p = 0; p < seconds * 0.7; p++) {
    const start = Math.floor(rand() * n);
    const f = 1500 + rand() * 2500;
    const length = Math.round(RATE * 0.025);
    for (let j = 0; j < length && start + j < n; j++) {
      out[start + j] += Math.sin((2 * Math.PI * f * j) / RATE) * 0.5 * Math.exp((-8 * j) / length);
    }
  }
  return out;
}

/** Wind: noise through a filter whose pitch drifts and gusts, over a soft low rumble. */
function wind(loopSec) {
  return (n, rand) => {
    const source = pinkNoise(n, rand);
    const rumble = lowPass(brownNoise(n, rand), 120);
    const out = new Float64Array(n);
    let low = 0;
    let band = 0;
    const q = 0.25; // how narrow the whistle is (smaller = narrower)
    for (let i = 0; i < n; i++) {
      // Whole cycles per loop, so the gusts line up where the loop repeats.
      const t = (i / RATE / loopSec) * 2 * Math.PI;
      const centre = 520 + 260 * Math.sin(t) + 140 * Math.sin(3 * t + 1) + 60 * Math.sin(7 * t + 2);
      const gust = 0.45 + 0.55 * Math.sin(2 * t + 0.5) ** 2;
      // State-variable band-pass filter: the swept "whoo" of the wind.
      const f = 2 * Math.sin((Math.PI * centre) / RATE);
      low += f * band;
      const high = source[i] - low - q * band;
      band += f * high;
      out[i] = band * gust + rumble[i] * 4;
    }
    return out;
  };
}

/** Forest stream: running water's hiss and lots of little bubbles that rise in pitch. */
function stream(n, rand) {
  const water = pinkNoise(n, rand);
  const waterLow = lowPass(Float64Array.from(water), 600);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = (water[i] - waterLow[i]) * 0.5 + waterLow[i] * 0.25;
  for (let b = 0; b < (n / RATE) * 45; b++) {
    const start = Math.floor(rand() * n);
    const f0 = 350 + rand() ** 2 * 1300;
    const length = Math.round(RATE * (0.02 + rand() * 0.05));
    const size = 0.04 + rand() * 0.18;
    let phase = 0;
    for (let j = 0; j < length && start + j < n; j++) {
      const p = j / length;
      phase += (2 * Math.PI * f0 * (1 + 1.8 * p)) / RATE; // a bubble's pitch rises as it pops
      out[start + j] += Math.sin(phase) * size * Math.min(1, j / 20) * Math.exp(-p * 4);
    }
  }
  return out;
}

// --- More music -------------------------------------------------------------

/** A kick drum: a low thump that drops in pitch. */
function kick(t) {
  const f = 45 + 70 * Math.exp(-t * 30);
  return Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 7);
}

/** Lo-fi beat: soft drums with a lazy swing, warm chords, a round bass and a little vinyl crackle. */
function lofiBeat(rand) {
  const beat = 60 / 72;
  const bars = 8;
  const buffer = new Float64Array(Math.round(bars * 4 * beat * RATE));
  const n = buffer.length;
  const put = (startSec, lengthSec, sample) => {
    const start = Math.round(startSec * RATE);
    for (let j = 0; j < lengthSec * RATE; j++) buffer[(start + j) % n] += sample(j / RATE);
  };
  const chords = [
    { root: 38, notes: [53, 57, 60, 64] }, // Dm9
    { root: 43, notes: [53, 57, 59, 64] }, // G13
    { root: 36, notes: [52, 55, 59, 62] }, // Cmaj9
    { root: 45, notes: [55, 60, 64, 67] }, // Am7
  ];
  for (let bar = 0; bar < bars; bar++) {
    const at = bar * 4 * beat;
    const { root, notes } = chords[Math.floor(bar / 2)];
    // Drums: kick on 1 and the "and" of 3, snare on 2 and 4, hats on every half beat (swung).
    put(at, 0.5, (t) => 0.9 * kick(t));
    put(at + 2.5 * beat, 0.5, (t) => 0.7 * kick(t));
    for (const b of [1, 3]) {
      put(at + b * beat, 0.3, (t) => {
        const body = Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t * 30);
        return 0.3 * (body + (rand() * 2 - 1) * 0.6 * Math.exp(-t * 16));
      });
    }
    for (let h = 0; h < 8; h++) {
      const swing = h % 2 ? beat * 0.12 : 0;
      const size = (h % 2 ? 0.05 : 0.08) * (0.7 + rand() * 0.3);
      let prev = 0;
      put(at + h * 0.5 * beat + swing, 0.06, (t) => {
        const w = rand() * 2 - 1;
        const v = (w - prev) * size * Math.exp(-t * 70);
        prev = w;
        return v;
      });
    }
    // Chords on the first beat of each bar, struck again more softly late in the bar.
    const first = bar % 2 === 0;
    notes.forEach((note, i) => {
      addNote(buffer, at + i * 0.02, note, first ? 4 * beat : 2.4 * beat, (t, f, d) => 0.3 * keys(t, f, d));
      addNote(buffer, at + 3.5 * beat + i * 0.02, note, 0.9 * beat, (t, f, d) => 0.15 * keys(t, f, d));
    });
    addNote(buffer, at, root, 2.3 * beat, (t, f, d) => 0.7 * bass(t, f, d));
    addNote(buffer, at + 2.5 * beat, root + (first ? 0 : 7), 1.4 * beat, (t, f, d) => 0.55 * bass(t, f, d));
  }
  // Vinyl: a faint hiss and scattered soft clicks.
  for (let i = 0; i < n; i++) buffer[i] += (rand() * 2 - 1) * 0.004;
  for (let c = 0; c < (n / RATE) * 3; c++) {
    const start = Math.floor(rand() * n);
    buffer[start] += (rand() - 0.5) * 0.15;
    buffer[(start + 1) % n] -= (rand() - 0.5) * 0.08;
  }
  return loopLowPass(buffer, 3800); // the warm, slightly dull lo-fi sound
}

/** A soft piano note: richer than `keys`, and rings for longer. */
function piano(t, f, duration) {
  const attack = Math.min(1, t / 0.008);
  const fadeOut = Math.min(1, Math.max(0, (duration - t) / 0.6));
  const p = 2 * Math.PI * f * t;
  let s = 0;
  [1, 0.5, 0.28, 0.14, 0.07].forEach((amp, k) => {
    s += amp * Math.sin((k + 1) * p * (1 + 0.0004 * k * k)) * Math.exp(-t * (0.9 + k * 1.1)); // slightly stretched, like real strings
  });
  return s * attack * fadeOut;
}

/** Night piano: slow chords in A minor and a few unhurried notes over the top, in a soft room. */
function nightPiano(rand) {
  const beat = 1; // 60 beats a minute
  const chords = [
    { bass: 45, notes: [57, 60, 64] }, // Am
    { bass: 41, notes: [57, 60, 65] }, // F
    { bass: 48, notes: [55, 60, 64] }, // C
    { bass: 43, notes: [55, 59, 62] }, // G
  ];
  const melody = [69, 72, 74, 76, 79, 81]; // A minor pentatonic, up high
  const buffer = new Float64Array(chords.length * 8 * beat * RATE);
  chords.forEach(({ bass: low, notes }, c) => {
    const at = c * 8 * beat;
    addNote(buffer, at, low, 7.5, (t, f, d) => 0.45 * piano(t, f, d));
    addNote(buffer, at, low - 12, 7.5, (t, f, d) => 0.3 * piano(t, f, d));
    notes.forEach((note, i) => addNote(buffer, at + 0.12 * (i + 1), note, 6, (t, f, d) => 0.25 * piano(t, f, d)));
    let beatAt = 2;
    while (beatAt < 8) {
      const note = melody[Math.floor(rand() * melody.length)];
      addNote(buffer, at + beatAt * beat, note, 3, (t, f, d) => (0.18 + rand() * 0.08) * piano(t, f, d));
      beatAt += rand() < 0.5 ? 1 : 2;
    }
  });
  return loopLowPass(echo(echo(buffer, 0.29, 0.28), 0.47, 0.2), 4000);
}

/** A bell: partials that aren't whole multiples, which is what makes a chime sound like metal. */
function bell(t, f, duration) {
  const fadeOut = Math.min(1, Math.max(0, (duration - t) / 0.5));
  const attack = Math.min(1, t / 0.003);
  let s = 0;
  [
    [1, 1, 0.9],
    [2.76, 0.4, 1.8],
    [5.4, 0.18, 3.2],
    [8.93, 0.08, 5],
  ].forEach(([ratio, amp, decay]) => {
    s += amp * Math.sin(2 * Math.PI * f * ratio * t) * Math.exp(-t * decay);
  });
  return s * attack * fadeOut;
}

/** Dreamy chimes: wind chimes in a five-note scale (no clashing notes) over a quiet hum. */
function chimes(rand, loopSec) {
  const buffer = new Float64Array(Math.round(loopSec * RATE));
  // The hum: C and G held for the whole loop, at frequencies that wrap cleanly.
  for (const [midi, amp] of [
    [36, 0.2],
    [43, 0.14],
    [48, 0.08],
  ]) {
    const f = fit(freq(midi), loopSec);
    for (let i = 0; i < buffer.length; i++) {
      const t = i / RATE;
      buffer[i] += amp * Math.sin(2 * Math.PI * f * t) * (0.8 + 0.2 * Math.sin((2 * Math.PI * 2 * t) / loopSec));
    }
  }
  const scale = [72, 74, 76, 79, 81, 84, 86, 88];
  let at = 0;
  while (at < loopSec) {
    // Chimes come in little clusters, as when a breeze catches them.
    const cluster = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < cluster; k++) {
      const note = scale[Math.floor(rand() * scale.length)];
      addNote(buffer, at + k * (0.12 + rand() * 0.2), note, 5, (t, f, d) => (0.12 + rand() * 0.1) * bell(t, f, d));
    }
    at += 1.2 + rand() * 2.2;
  }
  return loopLowPass(echo(buffer, 0.37, 0.3), 6000);
}

/**
 * Deep space: a low, slowly shifting drone. Each tone's loudness swells a whole number of times
 * per loop, and each frequency fits the loop exactly, so it never seems to repeat or jump.
 */
function drone(loopSec) {
  const buffer = new Float64Array(Math.round(loopSec * RATE));
  const tones = [
    // [midi, loudness, swells per loop, starting point]
    [36, 0.5, 1, 0],
    [43, 0.35, 2, 1.3],
    [48, 0.25, 3, 2.1],
    [55, 0.15, 1, 3.7],
    [52, 0.12, 2, 0.6], // a soft third that comes and goes
    [62, 0.08, 3, 4.4],
  ];
  for (const [midi, amp, swells, phase] of tones) {
    for (const detune of [-0.003, 0.003]) {
      const f = fit(freq(midi) * (1 + detune), loopSec);
      for (let i = 0; i < buffer.length; i++) {
        const t = i / RATE;
        const swell = 0.5 + 0.5 * Math.sin((2 * Math.PI * swells * t) / loopSec + phase);
        buffer[i] += amp * swell * (Math.sin(2 * Math.PI * f * t) + 0.12 * Math.sin(4 * Math.PI * f * t));
      }
    }
  }
  return loopLowPass(buffer, 1500);
}

// --- Build ------------------------------------------------------------------

const sounds = {
  // Background sounds: evened out to a similar loudness.
  rain: { make: () => level(loopNoise((n) => rain(n, random(1)), 12), 0.11) },
  'pink-noise': { rate: 16000, make: () => level(loopNoise((n) => pinkNoise(n, random(2)), 10), 0.1) },
  'brown-noise': { make: () => level(loopNoise((n) => brownNoise(n, random(3)), 10), 0.14) },
  'white-noise': { make: () => level(loopNoise((n) => whiteNoise(n, random(5)), 8), 0.08) },
  'ocean-waves': { rate: 16000, make: () => level(loopNoise((n) => oceanWaves(24)(n, random(12)), 24, 0.5), 0.12) },
  fire: { make: () => level(loopNoise((n) => fire(n, random(6)), 14), 0.11) },
  wind: { rate: 16000, make: () => level(loopNoise((n) => wind(20)(n, random(7)), 20, 0.5), 0.12) },
  stream: { make: () => level(loopNoise((n) => stream(n, random(8)), 12), 0.1) },
  // Music: scaled to the same peak.
  'calm-pads': { rate: 16000, make: () => normalise(Array.from(calmPads()), 0.6) },
  'soft-keys': { rate: 16000, make: () => normalise(Array.from(softKeys(random(4))), 0.6) },
  'lofi-beat': { rate: 16000, make: () => normalise(Array.from(lofiBeat(random(9))), 0.7) },
  'night-piano': { rate: 16000, make: () => normalise(Array.from(nightPiano(random(10))), 0.6) },
  chimes: { make: () => normalise(Array.from(chimes(random(11), 30)), 0.55) },
  'deep-space': { rate: 16000, make: () => normalise(Array.from(drone(32)), 0.55) },
};

mkdirSync(outDir, { recursive: true });
for (const [name, { rate = 22050, make }] of Object.entries(sounds)) {
  RATE = rate;
  const samples = Array.from(make());
  const file = join(outDir, `${name}.wav`);
  writeFileSync(file, wav(samples));
  console.log(`${name}.wav  ${(samples.length / RATE).toFixed(1)}s  ${Math.round((samples.length * 2) / 1024)} KB`);
}

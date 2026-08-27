export const AVANTIQO_MUSIC_CONTINUITY_FIXTURE_CONTRACT = "AVANTIQO_MUSIC_CONTINUITY_FIXTURE_V1";
export const AVANTIQO_MUSIC_CONTINUITY_FIXTURE_BPM = 96;
export const AVANTIQO_MUSIC_CONTINUITY_FIXTURE_SECONDS = 10;
export const AVANTIQO_MUSIC_CONTINUITY_FIXTURE_KEY = "C_MAJOR";
export const AVANTIQO_MUSIC_CONTINUITY_FIXTURE_PROGRESSION = "Cmaj7-Am7-Fmaj7-G7";
export const AVANTIQO_MUSIC_CONTINUITY_PROFILE_GROOVE = "GROOVE";
export const AVANTIQO_MUSIC_CONTINUITY_PROFILE_DYNAMIC_METAL = "DYNAMIC_METAL";
export const AVANTIQO_MUSIC_METAL_CONTINUITY_FIXTURE_CONTRACT = "AVANTIQO_MUSIC_METAL_CONTINUITY_FIXTURE_V1";

const TWO_PI = Math.PI * 2;

function midiFrequency(midi) {
  return 440 * (2 ** ((midi - 69) / 12));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function selectedContinuityProfile() {
  const value = String(process.env.AVANTIQO_MUSIC_CONTINUITY_FIXTURE_PROFILE ?? "").trim().toUpperCase()
    || AVANTIQO_MUSIC_CONTINUITY_PROFILE_GROOVE;
  if (![AVANTIQO_MUSIC_CONTINUITY_PROFILE_GROOVE, AVANTIQO_MUSIC_CONTINUITY_PROFILE_DYNAMIC_METAL].includes(value)) {
    throw new Error(`AVANTIQO_MUSIC_CONTINUITY_FIXTURE_PROFILE_INVALID:${value}`);
  }
  return value;
}

function smoothEnvelope(time, duration, attack = 0.02, release = 0.12) {
  if (time < 0 || time >= duration) return 0;
  const attackGain = attack > 0 ? clamp(time / attack, 0, 1) : 1;
  const releaseStart = Math.max(0, duration - release);
  const releaseGain = time <= releaseStart || release <= 0 ? 1 : clamp((duration - time) / release, 0, 1);
  return attackGain * releaseGain;
}

function deterministicNoise(index) {
  let value = (index + 1) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return ((value >>> 0) / 0xffffffff) * 2 - 1;
}

function addTone(samples, sampleRate, startSeconds, durationSeconds, frequency, gain, options = {}) {
  const start = Math.max(0, Math.floor(startSeconds * sampleRate));
  const end = Math.min(samples.length, Math.ceil((startSeconds + durationSeconds) * sampleRate));
  const harmonics = options.harmonics || [1, 0.28, 0.12];
  for (let index = start; index < end; index += 1) {
    const localTime = index / sampleRate - startSeconds;
    const envelope = smoothEnvelope(localTime, durationSeconds, options.attack ?? 0.025, options.release ?? 0.15);
    let wave = 0;
    for (let harmonic = 0; harmonic < harmonics.length; harmonic += 1) {
      const harmonicNumber = harmonic + 1;
      wave += Math.sin(TWO_PI * frequency * harmonicNumber * localTime) * harmonics[harmonic];
    }
    samples[index] += wave * gain * envelope;
  }
}

function addPad(samples, sampleRate, startSeconds, durationSeconds, midiNotes, gain = 0.045) {
  for (const midi of midiNotes) {
    addTone(samples, sampleRate, startSeconds, durationSeconds, midiFrequency(midi), gain, {
      attack: 0.18,
      release: 0.35,
      harmonics: [1, 0.18, 0.06],
    });
  }
}

function addBass(samples, sampleRate, startSeconds, durationSeconds, midi, gain = 0.12) {
  addTone(samples, sampleRate, startSeconds, durationSeconds, midiFrequency(midi), gain, {
    attack: 0.012,
    release: 0.18,
    harmonics: [1, 0.35, 0.08],
  });
}

function addMelody(samples, sampleRate, startSeconds, durationSeconds, midi, gain = 0.095) {
  addTone(samples, sampleRate, startSeconds, durationSeconds, midiFrequency(midi), gain, {
    attack: 0.008,
    release: 0.12,
    harmonics: [1, 0.42, 0.16, 0.05],
  });
}

function addCleanGuitarPluck(samples, sampleRate, startSeconds, durationSeconds, midi, gain = 0.085) {
  addTone(samples, sampleRate, startSeconds, durationSeconds, midiFrequency(midi), gain, {
    attack: 0.003,
    release: Math.min(0.42, durationSeconds * 0.7),
    harmonics: [1, 0.5, 0.18, 0.07, 0.025],
  });
}

function addDistortedPowerChord(samples, sampleRate, startSeconds, durationSeconds, rootMidi, gain = 0.105) {
  const start = Math.max(0, Math.floor(startSeconds * sampleRate));
  const end = Math.min(samples.length, Math.ceil((startSeconds + durationSeconds) * sampleRate));
  const frequencies = [rootMidi, rootMidi + 7, rootMidi + 12].map(midiFrequency);
  for (let index = start; index < end; index += 1) {
    const localTime = index / sampleRate - startSeconds;
    const envelope = smoothEnvelope(localTime, durationSeconds, 0.004, Math.min(0.16, durationSeconds * 0.45));
    let raw = 0;
    for (const frequency of frequencies) {
      raw += Math.sin(TWO_PI * frequency * localTime);
      raw += Math.sin(TWO_PI * frequency * 2 * localTime) * 0.32;
      raw += Math.sin(TWO_PI * frequency * 3 * localTime) * 0.14;
    }
    samples[index] += Math.tanh(raw * 1.9) * gain * envelope;
  }
}

function addKick(samples, sampleRate, startSeconds, gain = 0.18) {
  const duration = 0.22;
  const start = Math.max(0, Math.floor(startSeconds * sampleRate));
  const end = Math.min(samples.length, Math.ceil((startSeconds + duration) * sampleRate));
  let phase = 0;
  for (let index = start; index < end; index += 1) {
    const t = index / sampleRate - startSeconds;
    const frequency = 92 - 52 * clamp(t / duration, 0, 1);
    phase += TWO_PI * frequency / sampleRate;
    const envelope = Math.exp(-t * 18);
    samples[index] += Math.sin(phase) * gain * envelope;
  }
}

function addSnare(samples, sampleRate, startSeconds, gain = 0.085) {
  const duration = 0.16;
  const start = Math.max(0, Math.floor(startSeconds * sampleRate));
  const end = Math.min(samples.length, Math.ceil((startSeconds + duration) * sampleRate));
  for (let index = start; index < end; index += 1) {
    const t = index / sampleRate - startSeconds;
    const envelope = Math.exp(-t * 22);
    const noise = deterministicNoise(index + Math.floor(startSeconds * 10000));
    const body = Math.sin(TWO_PI * 188 * t) * 0.34;
    samples[index] += (noise * 0.78 + body) * gain * envelope;
  }
}

function addHat(samples, sampleRate, startSeconds, gain = 0.038) {
  const duration = 0.07;
  const start = Math.max(0, Math.floor(startSeconds * sampleRate));
  const end = Math.min(samples.length, Math.ceil((startSeconds + duration) * sampleRate));
  for (let index = start; index < end; index += 1) {
    const t = index / sampleRate - startSeconds;
    const envelope = Math.exp(-t * 48);
    samples[index] += deterministicNoise(index + Math.floor(startSeconds * 1000)) * gain * envelope;
  }
}

function addCrash(samples, sampleRate, startSeconds, gain = 0.045) {
  const duration = 0.55;
  const start = Math.max(0, Math.floor(startSeconds * sampleRate));
  const end = Math.min(samples.length, Math.ceil((startSeconds + duration) * sampleRate));
  for (let index = start; index < end; index += 1) {
    const t = index / sampleRate - startSeconds;
    const envelope = Math.exp(-t * 5.5);
    const noise = deterministicNoise(index * 3 + Math.floor(startSeconds * 1000));
    samples[index] += noise * gain * envelope;
  }
}

function normalize(samples, peakTarget = 0.82) {
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  if (peak <= 0) return samples;
  const scale = Math.min(1, peakTarget / peak);
  if (scale === 1) return samples;
  for (let index = 0; index < samples.length; index += 1) samples[index] *= scale;
  return samples;
}

function encodeMono16BitWav(samples, sampleRate) {
  const frames = samples.length;
  normalize(samples);
  const buffer = Buffer.alloc(44 + frames * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + frames * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(frames * 2, 40);
  for (let index = 0; index < frames; index += 1) {
    const pcm = Math.round(clamp(samples[index], -1, 1) * 32767);
    buffer.writeInt16LE(pcm, 44 + index * 2);
  }
  return buffer;
}

function createGrooveContinuityFixtureWav({ sampleRate = 44100 } = {}) {
  const bpm = AVANTIQO_MUSIC_CONTINUITY_FIXTURE_BPM;
  const secondsPerBeat = 60 / bpm;
  const beatsPerBar = 4;
  const barSeconds = secondsPerBeat * beatsPerBar;
  const totalSeconds = AVANTIQO_MUSIC_CONTINUITY_FIXTURE_SECONDS;
  const frames = Math.round(totalSeconds * sampleRate);
  const samples = new Float64Array(frames);

  // Four original, royalty-free bars. The final G7 intentionally invites a natural continuation/resolution.
  const bars = [
    { chord: [60, 64, 67, 71], bass: 36, melody: [64, 67, 69, 67] }, // Cmaj7
    { chord: [57, 60, 64, 67], bass: 33, melody: [64, 72, 71, 69] }, // Am7
    { chord: [53, 57, 60, 64], bass: 29, melody: [69, 67, 65, 64] }, // Fmaj7
    { chord: [55, 59, 62, 65], bass: 31, melody: [62, 65, 67, 71] }, // G7
  ];

  bars.forEach((bar, barIndex) => {
    const barStart = barIndex * barSeconds;
    addPad(samples, sampleRate, barStart, barSeconds, bar.chord);
    for (let beat = 0; beat < beatsPerBar; beat += 1) {
      const beatStart = barStart + beat * secondsPerBeat;
      addBass(samples, sampleRate, beatStart, secondsPerBeat * 0.78, bar.bass + (beat === 2 ? 7 : 0));
      addMelody(samples, sampleRate, beatStart, secondsPerBeat * 0.82, bar.melody[beat]);
      if (beat === 0 || beat === 2) addKick(samples, sampleRate, beatStart);
      addHat(samples, sampleRate, beatStart);
      addHat(samples, sampleRate, beatStart + secondsPerBeat / 2);
    }
  });

  return encodeMono16BitWav(samples, sampleRate);
}

export function createAvantiqoMusicDynamicMetalContinuityFixtureWav({ sampleRate = 44100 } = {}) {
  const bpm = AVANTIQO_MUSIC_CONTINUITY_FIXTURE_BPM;
  const secondsPerBeat = 60 / bpm;
  const beatsPerBar = 4;
  const barSeconds = secondsPerBeat * beatsPerBar;
  const totalSeconds = AVANTIQO_MUSIC_CONTINUITY_FIXTURE_SECONDS;
  const frames = Math.round(totalSeconds * sampleRate);
  const samples = new Float64Array(frames);
  const eighth = secondsPerBeat / 2;

  // Bars 1-2: quiet clean arpeggiated guitar in E minor. This is a new deterministic composition,
  // not a transcription or approximation of any existing recording.
  const cleanBars = [
    [52, 59, 64, 66, 59, 64, 67, 66],
    [48, 55, 59, 64, 55, 59, 62, 59],
  ];
  cleanBars.forEach((notes, barIndex) => {
    const barStart = barIndex * barSeconds;
    notes.forEach((midi, step) => {
      addCleanGuitarPluck(samples, sampleRate, barStart + step * eighth, eighth * 1.35, midi, 0.078 + barIndex * 0.006);
    });
    addBass(samples, sampleRate, barStart, secondsPerBeat * 1.65, barIndex === 0 ? 28 : 24, 0.052);
    addBass(samples, sampleRate, barStart + secondsPerBeat * 2, secondsPerBeat * 1.5, barIndex === 0 ? 35 : 31, 0.045);
  });

  // Bar 3: tension build. Short power chords, bass, and drums deliberately increase density.
  const buildStart = barSeconds * 2;
  const buildRoots = [38, 38, 36, 38, 43, 45, 47, 47];
  buildRoots.forEach((root, step) => {
    const start = buildStart + step * eighth;
    addDistortedPowerChord(samples, sampleRate, start, eighth * 0.72, root, 0.07 + step * 0.003);
    addBass(samples, sampleRate, start, eighth * 0.7, root - 12, 0.07);
    if (step % 2 === 0) addKick(samples, sampleRate, start, 0.13);
    if (step === 2 || step === 6) addSnare(samples, sampleRate, start, 0.065);
    addHat(samples, sampleRate, start, 0.026);
  });

  // Bar 4: heavy riff. The final B5 is intentionally unresolved against the E-minor center so Extend
  // must choose a musically sensible continuation rather than merely append ambience.
  const heavyStart = barSeconds * 3;
  const heavyRoots = [40, 40, 43, 40, 38, 40, 45, 47];
  addCrash(samples, sampleRate, heavyStart, 0.05);
  heavyRoots.forEach((root, step) => {
    const start = heavyStart + step * eighth;
    const isFinal = step === heavyRoots.length - 1;
    addDistortedPowerChord(samples, sampleRate, start, isFinal ? eighth * 1.65 : eighth * 0.78, root, isFinal ? 0.115 : 0.105);
    addBass(samples, sampleRate, start, isFinal ? eighth * 1.55 : eighth * 0.72, root - 12, 0.105);
    addKick(samples, sampleRate, start, step >= 4 ? 0.18 : 0.155);
    if (step === 2 || step === 6) addSnare(samples, sampleRate, start, 0.085);
    addHat(samples, sampleRate, start, 0.034);
    if (step >= 5) addKick(samples, sampleRate, start + eighth / 2, 0.11);
  });

  return encodeMono16BitWav(samples, sampleRate);
}

export function createAvantiqoMusicContinuityFixtureWav(options = {}) {
  return selectedContinuityProfile() === AVANTIQO_MUSIC_CONTINUITY_PROFILE_DYNAMIC_METAL
    ? createAvantiqoMusicDynamicMetalContinuityFixtureWav(options)
    : createGrooveContinuityFixtureWav(options);
}

function grooveMetadata() {
  return {
    contract: AVANTIQO_MUSIC_CONTINUITY_FIXTURE_CONTRACT,
    profile: AVANTIQO_MUSIC_CONTINUITY_PROFILE_GROOVE,
    original_composition: true,
    royalty_free: true,
    instrumental: true,
    duration_seconds: AVANTIQO_MUSIC_CONTINUITY_FIXTURE_SECONDS,
    bpm: AVANTIQO_MUSIC_CONTINUITY_FIXTURE_BPM,
    key: AVANTIQO_MUSIC_CONTINUITY_FIXTURE_KEY,
    progression: AVANTIQO_MUSIC_CONTINUITY_FIXTURE_PROGRESSION,
    layers: ["warm_chord_pad", "bass", "lead_melody", "kick", "closed_hat"],
    final_harmony: "G7_UNRESOLVED_FOR_CONTINUATION_TEST",
    caption: "Warm polished instrumental groove with chord progression, bass, melody and light drums",
  };
}

function dynamicMetalMetadata() {
  return {
    contract: AVANTIQO_MUSIC_CONTINUITY_FIXTURE_CONTRACT,
    profile_contract: AVANTIQO_MUSIC_METAL_CONTINUITY_FIXTURE_CONTRACT,
    profile: AVANTIQO_MUSIC_CONTINUITY_PROFILE_DYNAMIC_METAL,
    original_composition: true,
    royalty_free: true,
    instrumental: true,
    reference_recording_used: false,
    artist_imitation_requested: false,
    duration_seconds: AVANTIQO_MUSIC_CONTINUITY_FIXTURE_SECONDS,
    bpm: AVANTIQO_MUSIC_CONTINUITY_FIXTURE_BPM,
    key: "E_MINOR",
    progression: "Em(add9)-Cmaj7-D5-B5",
    structure: ["QUIET_CLEAN_ARPEGGIO_INTRO", "TENSION_BUILD", "HEAVY_RIFF"],
    layers: ["clean_electric_guitar", "distorted_power_guitar", "electric_bass", "kick", "snare", "closed_hat", "crash"],
    dynamic_arc: "QUIET_TO_HEAVY",
    final_harmony: "B5_UNRESOLVED_DOMINANT_FOR_CONTINUATION_TEST",
    continuation_expectation: "CONTINUE_HEAVY_SECTION_WITH_NEW_ORIGINAL_MATERIAL",
    caption: "Original dynamic heavy metal instrumental with quiet clean arpeggiated guitar opening, rising tension, then tight distorted power-chord riff, electric bass and punchy drums",
  };
}

export function avantiqoMusicContinuityFixtureMetadata() {
  return selectedContinuityProfile() === AVANTIQO_MUSIC_CONTINUITY_PROFILE_DYNAMIC_METAL
    ? dynamicMetalMetadata()
    : grooveMetadata();
}

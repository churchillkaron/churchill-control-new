export const AVANTIQO_MUSIC_CONTINUITY_FIXTURE_CONTRACT = "AVANTIQO_MUSIC_CONTINUITY_FIXTURE_V1";
export const AVANTIQO_MUSIC_CONTINUITY_FIXTURE_BPM = 96;
export const AVANTIQO_MUSIC_CONTINUITY_FIXTURE_SECONDS = 10;
export const AVANTIQO_MUSIC_CONTINUITY_FIXTURE_KEY = "C_MAJOR";
export const AVANTIQO_MUSIC_CONTINUITY_FIXTURE_PROGRESSION = "Cmaj7-Am7-Fmaj7-G7";

const TWO_PI = Math.PI * 2;

function midiFrequency(midi) {
  return 440 * (2 ** ((midi - 69) / 12));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

function normalize(samples, peakTarget = 0.82) {
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  if (peak <= 0) return samples;
  const scale = Math.min(1, peakTarget / peak);
  if (scale === 1) return samples;
  for (let index = 0; index < samples.length; index += 1) samples[index] *= scale;
  return samples;
}

export function createAvantiqoMusicContinuityFixtureWav({ sampleRate = 44100 } = {}) {
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

export function avantiqoMusicContinuityFixtureMetadata() {
  return {
    contract: AVANTIQO_MUSIC_CONTINUITY_FIXTURE_CONTRACT,
    original_composition: true,
    royalty_free: true,
    instrumental: true,
    duration_seconds: AVANTIQO_MUSIC_CONTINUITY_FIXTURE_SECONDS,
    bpm: AVANTIQO_MUSIC_CONTINUITY_FIXTURE_BPM,
    key: AVANTIQO_MUSIC_CONTINUITY_FIXTURE_KEY,
    progression: AVANTIQO_MUSIC_CONTINUITY_FIXTURE_PROGRESSION,
    layers: ["warm_chord_pad", "bass", "lead_melody", "kick", "closed_hat"],
    final_harmony: "G7_UNRESOLVED_FOR_CONTINUATION_TEST",
  };
}

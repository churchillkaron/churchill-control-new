const ENGINE_CONTRACT = "AVANTIQO_MUSIC_BROWSER_MIDI_INSTRUMENT_V1";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max, fallback = min) {
  return Math.max(min, Math.min(max, finite(value, fallback)));
}

function midiFrequency(pitch) {
  return 440 * (2 ** ((clamp(pitch, 0, 127, 69) - 69) / 12));
}

function presetDefinition(preset = "studio_keys") {
  const presets = {
    studio_keys: { oscillators: [["triangle", 0, 0.7], ["sine", 12, 0.18]], attack: 0.008, decay: 0.18, sustain: 0.58, release: 0.45, filter: 5200 },
    warm_pad: { oscillators: [["sawtooth", 0, 0.35], ["triangle", -12, 0.28], ["sine", 12, 0.12]], attack: 0.35, decay: 0.7, sustain: 0.7, release: 1.4, filter: 2400 },
    mono_bass: { oscillators: [["square", -12, 0.38], ["sine", -12, 0.55]], attack: 0.005, decay: 0.12, sustain: 0.72, release: 0.18, filter: 1200 },
    bright_lead: { oscillators: [["sawtooth", 0, 0.45], ["square", 0, 0.2], ["sine", 12, 0.08]], attack: 0.004, decay: 0.1, sustain: 0.68, release: 0.2, filter: 4600 },
  };
  return presets[preset] || presets.studio_keys;
}

function scheduledEnvelope(gain, start, duration, velocity, preset) {
  const peak = clamp(velocity, 1, 127, 100) / 127;
  const attackEnd = start + preset.attack;
  const decayEnd = attackEnd + preset.decay;
  const releaseStart = Math.max(decayEnd, start + Math.max(0.01, duration));
  const releaseEnd = releaseStart + preset.release;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), attackEnd);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * preset.sustain), decayEnd);
  gain.gain.setValueAtTime(Math.max(0.0002, peak * preset.sustain), releaseStart);
  gain.gain.exponentialRampToValueAtTime(0.0001, releaseEnd);
  return releaseEnd;
}

export async function startMusicMidiInstrumentPreview({
  clip,
  bpm = 120,
  preset = "studio_keys",
  startBeat = 0,
  masterGain = 0.35,
  onEnded,
} = {}) {
  if (!clip || !Array.isArray(clip.notes)) throw new Error("MUSIC_MIDI_INSTRUMENT_CLIP_REQUIRED");
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) throw new Error("MUSIC_MIDI_INSTRUMENT_WEB_AUDIO_UNAVAILABLE");
  const context = new AudioContextClass({ latencyHint: "interactive" });
  await context.resume();
  const definition = presetDefinition(preset);
  const master = context.createGain();
  master.gain.value = clamp(masterGain, 0, 1, 0.35);
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -10;
  compressor.knee.value = 10;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.18;
  master.connect(compressor).connect(context.destination);

  const now = context.currentTime + 0.04;
  const secondsPerBeat = 60 / clamp(bpm, 30, 300, 120);
  const scheduled = [];
  let lastEnd = now + 0.08;

  for (const note of clip.notes) {
    if (note.muted === true) continue;
    const noteStartBeat = finite(note.start_beat, 0);
    const noteEndBeat = noteStartBeat + Math.max(0.001, finite(note.duration_beats, 1));
    if (noteEndBeat <= startBeat) continue;
    const relativeStartBeat = Math.max(0, noteStartBeat - startBeat);
    const clippedDurationBeats = noteEndBeat - Math.max(startBeat, noteStartBeat);
    const start = now + relativeStartBeat * secondsPerBeat;
    const duration = clippedDurationBeats * secondsPerBeat;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = definition.filter;
    filter.Q.value = 0.35;
    const voiceGain = context.createGain();
    const voiceEnd = scheduledEnvelope(voiceGain, start, duration, note.velocity, definition);
    filter.connect(voiceGain).connect(master);
    for (const [waveform, octaveSemitones, level] of definition.oscillators) {
      const oscillator = context.createOscillator();
      const oscillatorGain = context.createGain();
      oscillator.type = waveform;
      oscillator.frequency.value = midiFrequency(finite(note.pitch, 60) + octaveSemitones);
      oscillatorGain.gain.value = level;
      oscillator.connect(oscillatorGain).connect(filter);
      oscillator.start(start);
      oscillator.stop(voiceEnd + 0.02);
      scheduled.push(oscillator);
    }
    lastEnd = Math.max(lastEnd, voiceEnd);
  }

  let closed = false;
  let timer = null;
  async function stop() {
    if (closed) return;
    closed = true;
    if (timer) clearTimeout(timer);
    for (const oscillator of scheduled) {
      try { oscillator.stop(); } catch {}
      try { oscillator.disconnect(); } catch {}
    }
    try { master.disconnect(); } catch {}
    try { compressor.disconnect(); } catch {}
    try { await context.close(); } catch {}
  }

  const durationMs = Math.max(50, (lastEnd - context.currentTime) * 1000 + 40);
  timer = setTimeout(async () => {
    if (closed) return;
    await stop();
    onEnded?.();
  }, durationMs);

  return {
    contract: ENGINE_CONTRACT,
    preset,
    note_count: scheduled.length,
    provider_job_submitted: false,
    stop,
  };
}

export const MusicMidiInstrumentEngine = {
  contract: ENGINE_CONTRACT,
  presets: ["studio_keys", "warm_pad", "mono_bass", "bright_lead"],
  startPreview: startMusicMidiInstrumentPreview,
};

import { listMusicOwnedInstrumentPresets, resolveMusicOwnedInstrumentDefinition } from "../runtime/CreativeMusicOwnedInstrumentRuntime.js";
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

function instrumentDefinition(instrument, preset = "studio_keys") {
  const resolved = resolveMusicOwnedInstrumentDefinition(instrument || { preset_id: preset }, preset);
  return {
    ...resolved,
    attack: resolved.attack_seconds,
    decay: resolved.decay_seconds,
    sustain: resolved.sustain_level,
    release: resolved.release_seconds,
    filter: resolved.filter_cutoff_hz,
  };
}

function eventsOf(clip, type) {
  return (clip.control_events || []).filter((event) => event.type === type).sort((a, b) => finite(a.beat, 0) - finite(b.beat, 0));
}

function controlValueAt(events, beat, fallback) {
  let value = fallback;
  for (const event of events) {
    if (finite(event.beat, 0) > beat) break;
    value = finite(event.value, fallback);
  }
  return value;
}

function sustainReleaseBeat(sustainEvents, noteEndBeat) {
  if (controlValueAt(sustainEvents, noteEndBeat, 0) < 64) return noteEndBeat;
  const release = sustainEvents.find((event) => finite(event.beat, 0) > noteEndBeat && finite(event.value, 0) < 64);
  return release ? Math.max(noteEndBeat, finite(release.beat, noteEndBeat)) : noteEndBeat;
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

function scheduleExpression(param, events, noteStartBeat, noteEndBeat, startTime, secondsPerBeat) {
  const initial = clamp(controlValueAt(events, noteStartBeat, 127), 0, 127, 127) / 127;
  param.setValueAtTime(Math.max(0.0001, initial), startTime);
  for (const event of events) {
    const beat = finite(event.beat, 0);
    if (beat <= noteStartBeat || beat > noteEndBeat) continue;
    const time = startTime + (beat - noteStartBeat) * secondsPerBeat;
    param.linearRampToValueAtTime(Math.max(0.0001, clamp(event.value, 0, 127, 127) / 127), time);
  }
}

function schedulePitchBend(detune, events, noteStartBeat, noteEndBeat, startTime, secondsPerBeat, rangeSemitones = 2) {
  const toCents = (value) => clamp(value, -8192, 8191, 0) / 8192 * clamp(rangeSemitones, 1, 12, 2) * 100;
  detune.setValueAtTime(toCents(controlValueAt(events, noteStartBeat, 0)), startTime);
  for (const event of events) {
    const beat = finite(event.beat, 0);
    if (beat <= noteStartBeat || beat > noteEndBeat) continue;
    detune.linearRampToValueAtTime(toCents(event.value), startTime + (beat - noteStartBeat) * secondsPerBeat);
  }
}

function scheduleModulation(param, events, noteStartBeat, noteEndBeat, startTime, secondsPerBeat, maximumDepth = 35) {
  const depth = (value) => clamp(value, 0, 127, 0) / 127 * clamp(maximumDepth, 0, 100, 35);
  param.setValueAtTime(depth(controlValueAt(events, noteStartBeat, 0)), startTime);
  for (const event of events) {
    const beat = finite(event.beat, 0);
    if (beat <= noteStartBeat || beat > noteEndBeat) continue;
    param.linearRampToValueAtTime(depth(event.value), startTime + (beat - noteStartBeat) * secondsPerBeat);
  }
}

export async function startMusicMidiInstrumentPreview({
  clip,
  bpm = 120,
  preset = "studio_keys",
  instrument = null,
  startBeat = 0,
  masterGain = 0.35,
  onEnded,
} = {}) {
  if (!clip || !Array.isArray(clip.notes)) throw new Error("MUSIC_MIDI_INSTRUMENT_CLIP_REQUIRED");
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) throw new Error("MUSIC_MIDI_INSTRUMENT_WEB_AUDIO_UNAVAILABLE");
  const context = new AudioContextClass({ latencyHint: "interactive" });
  await context.resume();
  const definition = instrumentDefinition(instrument, preset);
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
  const lfos = [];
  const sustainEvents = eventsOf(clip, "sustain");
  const expressionEvents = eventsOf(clip, "expression");
  const pitchEvents = eventsOf(clip, "pitch_bend");
  const modulationEvents = eventsOf(clip, "modulation");
  let lastEnd = now + 0.08;
  let scheduledNotes = 0;

  for (const note of clip.notes) {
    if (note.muted === true) continue;
    const noteStartBeat = finite(note.start_beat, 0);
    const rawNoteEndBeat = noteStartBeat + Math.max(0.001, finite(note.duration_beats, 1));
    if (rawNoteEndBeat <= startBeat) continue;
    const sustainedEndBeat = sustainReleaseBeat(sustainEvents, rawNoteEndBeat);
    const relativeStartBeat = Math.max(0, noteStartBeat - startBeat);
    const clippedStartBeat = Math.max(startBeat, noteStartBeat);
    const clippedDurationBeats = sustainedEndBeat - clippedStartBeat;
    const start = now + relativeStartBeat * secondsPerBeat;
    const duration = Math.max(0.001, clippedDurationBeats * secondsPerBeat);
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = definition.filter;
    filter.Q.value = definition.filter_q;
    const voiceGain = context.createGain();
    const expressionGain = context.createGain();
    const voiceEnd = scheduledEnvelope(voiceGain, start, duration, note.velocity, definition);
    scheduleExpression(expressionGain.gain, expressionEvents, noteStartBeat, sustainedEndBeat, start, secondsPerBeat);
    filter.connect(voiceGain).connect(expressionGain).connect(master);
    for (const [waveform, octaveSemitones, level] of definition.oscillators) {
      const oscillator = context.createOscillator();
      const oscillatorGain = context.createGain();
      const lfo = context.createOscillator();
      const lfoGain = context.createGain();
      oscillator.type = waveform;
      oscillator.frequency.value = midiFrequency(finite(note.pitch, 60) + octaveSemitones);
      oscillatorGain.gain.value = level;
      schedulePitchBend(oscillator.detune, pitchEvents, noteStartBeat, sustainedEndBeat, start, secondsPerBeat, definition.pitch_bend_range_semitones);
      lfo.type = "sine";
      lfo.frequency.value = definition.vibrato_rate_hz;
      scheduleModulation(lfoGain.gain, modulationEvents, noteStartBeat, sustainedEndBeat, start, secondsPerBeat, definition.vibrato_depth_cents);
      lfo.connect(lfoGain).connect(oscillator.detune);
      oscillator.connect(oscillatorGain).connect(filter);
      lfo.start(start);
      oscillator.start(start);
      lfo.stop(voiceEnd + 0.02);
      oscillator.stop(voiceEnd + 0.02);
      scheduled.push(oscillator);
      lfos.push(lfo);
    }
    scheduledNotes += 1;
    lastEnd = Math.max(lastEnd, voiceEnd);
  }

  let closed = false;
  let timer = null;
  async function stop() {
    if (closed) return;
    closed = true;
    if (timer) clearTimeout(timer);
    for (const oscillator of [...scheduled, ...lfos]) {
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
    preset: definition.preset_id,
    instrument: definition,
    note_count: scheduledNotes,
    controller_automation: {
      sustain: sustainEvents.length,
      expression: expressionEvents.length,
      pitch_bend: pitchEvents.length,
      modulation: modulationEvents.length,
      audible_preview_applied: true,
    },
    provider_job_submitted: false,
    stop,
  };
}

export const MusicMidiInstrumentEngine = {
  contract: ENGINE_CONTRACT,
  presets: listMusicOwnedInstrumentPresets().map((entry) => entry.id),
  startPreview: startMusicMidiInstrumentPreview,
};

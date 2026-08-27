import {
  resolveMusicTrackPreviewClips,
  startMusicMultitrackPreview,
} from "./MusicMultitrackPreviewEngine";

const CONTRACT = "AVANTIQO_MUSIC_UNIFIED_WORKSTATION_TRANSPORT_V1";
const ANCHOR_ASSET_ID = "__avantiqo-unified-transport-anchor";
const ANCHOR_TRACK_ID = "__avantiqo-unified-transport-anchor-track";

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max, fallback = min) {
  return Math.max(min, Math.min(max, finite(value, fallback)));
}

function dbToGain(db) {
  return 10 ** (clamp(db, -60, 18, 0) / 20);
}

function midiFrequency(pitch) {
  return 440 * (2 ** ((clamp(pitch, 0, 127, 69) - 69) / 12));
}

function secondsPerBeat(bpm) {
  return 60 / clamp(bpm, 30, 300, 120);
}

function beatAtSeconds(seconds, bpm) {
  return Math.max(0, finite(seconds, 0)) / secondsPerBeat(bpm);
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

function presetForTrack(track = {}) {
  const requested = String(track.instrument?.preset_id || track.instrument?.instrument_id || "").trim().toLowerCase();
  if (["studio_keys", "warm_pad", "mono_bass", "bright_lead"].includes(requested)) return requested;
  const kind = String(track.instrument?.kind || "").trim().toLowerCase();
  if (kind.includes("bass")) return "mono_bass";
  if (kind.includes("pad")) return "warm_pad";
  if (kind.includes("lead")) return "bright_lead";
  return "studio_keys";
}

function eventValueAt(clip, type, beat, fallback) {
  let value = fallback;
  for (const event of clip.control_events || []) {
    if (event.type !== type) continue;
    if (finite(event.beat, 0) > beat) break;
    value = finite(event.value, fallback);
  }
  return value;
}

function sustainEndBeat(clip, note) {
  let end = finite(note.start_beat, 0) + Math.max(0.001, finite(note.duration_beats, 0.25));
  if (eventValueAt(clip, "sustain", end, 0) < 64) return end;
  for (const event of clip.control_events || []) {
    if (event.type !== "sustain") continue;
    if (finite(event.beat, 0) < end) continue;
    if (finite(event.value, 0) < 64) return Math.max(end, finite(event.beat, end));
  }
  return Math.min(finite(clip.duration_beats, end), end + 8);
}

function expandedClipNotes(track, clip) {
  const clipStart = Math.max(0, finite(clip.start_beat, 0));
  const clipDuration = Math.max(0.001, finite(clip.duration_beats, 4));
  const loopLength = clip.loop_enabled === true
    ? clamp(clip.loop_length_beats, 0.03125, clipDuration, clipDuration)
    : clipDuration;
  const cycles = clip.loop_enabled === true ? Math.max(1, Math.ceil(clipDuration / loopLength)) : 1;
  const result = [];
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const cycleOffset = cycle * loopLength;
    for (const note of clip.notes || []) {
      const relativeStart = Math.max(0, finite(note.start_beat, 0));
      if (relativeStart >= loopLength || cycleOffset + relativeStart >= clipDuration) continue;
      const relativeEnd = Math.min(clipDuration, cycleOffset + sustainEndBeat(clip, note));
      result.push({
        track,
        clip,
        note,
        relative_start_beat: relativeStart,
        absolute_start_beat: clipStart + cycleOffset + relativeStart,
        absolute_end_beat: clipStart + Math.max(cycleOffset + relativeStart + 0.001, relativeEnd),
      });
    }
  }
  return result;
}

function midiEndSeconds(session = {}) {
  const spb = secondsPerBeat(session.bpm || 120);
  let maxBeat = 0;
  for (const track of session.midi?.tracks || []) {
    for (const clip of track.clips || []) {
      maxBeat = Math.max(maxBeat, finite(clip.start_beat, 0) + finite(clip.duration_beats, 0));
    }
  }
  return maxBeat * spb;
}

function audioEndSeconds(session = {}) {
  let end = 0;
  for (const track of session.tracks || []) {
    for (const clip of resolveMusicTrackPreviewClips(track)) {
      end = Math.max(end, finite(clip.start_seconds, 0) + finite(clip.duration_seconds, 0));
    }
  }
  return end;
}

function writeAscii(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

function createSilentAnchorUrl(durationSeconds) {
  const sampleRate = 8000;
  const frames = Math.max(1, Math.ceil(clamp(durationSeconds, 0.1, 1800, 1) * sampleRate));
  const dataBytes = frames * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF"); view.setUint32(4, 36 + dataBytes, true); writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeAscii(view, 36, "data"); view.setUint32(40, dataBytes, true);
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

function sessionWithTransportAnchor(session, assetUrls, targetEndSeconds) {
  const currentAudioEnd = audioEndSeconds(session);
  if (targetEndSeconds <= currentAudioEnd + 0.01) return { session, assetUrls, revoke: null };
  const url = createSilentAnchorUrl(targetEndSeconds);
  const nextSession = structuredClone(session);
  nextSession.tracks = [...(nextSession.tracks || []), {
    id: ANCHOR_TRACK_ID,
    type: "audio",
    name: "Unified transport clock",
    mute: true,
    solo: false,
    gain_db: -60,
    pan: 0,
    output_bus_id: "bus-master",
    channel_strip: {
      contract: "AVANTIQO_MUSIC_ENGINEER_CHANNEL_STRIP_V1",
      input_trim_db: 0,
      polarity_invert: false,
      high_pass_hz: 20,
      low_shelf_db: 0,
      presence_db: 0,
      high_shelf_db: 0,
      compressor: { enabled: false, threshold_db: -18, ratio: 3, attack_ms: 15, release_ms: 150, knee_db: 6, makeup_db: 0 },
    },
    clips: [{
      id: `${ANCHOR_ASSET_ID}-clip`,
      source_asset_id: ANCHOR_ASSET_ID,
      start_seconds: 0,
      duration_seconds: targetEndSeconds,
      source_offset_seconds: 0,
      gain_db: -60,
      fade_in_seconds: 0,
      fade_out_seconds: 0,
      muted: false,
      preserve_source_asset: true,
      destructive_edit: false,
    }],
    takes: [], inserts: [], sends: [], automation_lane_ids: [], destructive_processing_allowed: false,
  }];
  return {
    session: nextSession,
    assetUrls: { ...(assetUrls || {}), [ANCHOR_ASSET_ID]: url },
    revoke: () => URL.revokeObjectURL(url),
  };
}

async function preloadSamplerBuffers(sampleUrls = {}) {
  const entries = Object.entries(sampleUrls).filter(([, url]) => Boolean(url));
  if (!entries.length) return new Map();
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) return new Map();
  const decodeContext = new AudioContextClass({ latencyHint: "playback" });
  const buffers = new Map();
  try {
    await Promise.all(entries.map(async ([assetId, url]) => {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) return;
      const bytes = await response.arrayBuffer();
      buffers.set(assetId, await decodeContext.decodeAudioData(bytes.slice(0)));
    }));
  } finally {
    await decodeContext.close().catch(() => {});
  }
  return buffers;
}

function reversedBuffer(context, source) {
  const target = context.createBuffer(source.numberOfChannels, source.length, source.sampleRate);
  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    const input = source.getChannelData(channel);
    const output = target.getChannelData(channel);
    for (let index = 0; index < input.length; index += 1) output[index] = input[input.length - 1 - index];
  }
  return target;
}

function scheduleSynthNote({ context, destination, entry, contextStartTime, transportStartBeat, transportEndBeat, spb, sources }) {
  if (entry.note.muted === true || entry.absolute_end_beat <= transportStartBeat || entry.absolute_start_beat >= transportEndBeat) return false;
  const track = entry.track;
  const clip = entry.clip;
  const note = entry.note;
  const definition = presetDefinition(presetForTrack(track));
  const audibleStartBeat = Math.max(transportStartBeat, entry.absolute_start_beat);
  const audibleEndBeat = Math.min(transportEndBeat, entry.absolute_end_beat);
  const when = contextStartTime + Math.max(0, audibleStartBeat - transportStartBeat) * spb;
  const duration = Math.max(0.001, (audibleEndBeat - audibleStartBeat) * spb);
  const relativeControlBeat = Math.max(0, audibleStartBeat - finite(clip.start_beat, 0));
  const expression = clamp(eventValueAt(clip, "expression", relativeControlBeat, 127), 0, 127, 127) / 127;
  const modulation = clamp(eventValueAt(clip, "modulation", relativeControlBeat, 0), 0, 127, 0) / 127;
  const pitchBend = clamp(eventValueAt(clip, "pitch_bend", relativeControlBeat, 0), -8192, 8191, 0);
  const bendCents = (pitchBend / 8192) * 200;
  const velocity = clamp(note.velocity, 1, 127, 100) / 127;
  const voiceGain = context.createGain();
  const peak = Math.max(0.0002, velocity * expression);
  const attackEnd = when + definition.attack;
  const decayEnd = attackEnd + definition.decay;
  const releaseStart = Math.max(decayEnd, when + duration);
  const releaseEnd = releaseStart + definition.release;
  voiceGain.gain.setValueAtTime(0.0001, when);
  voiceGain.gain.exponentialRampToValueAtTime(peak, attackEnd);
  voiceGain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * definition.sustain), decayEnd);
  voiceGain.gain.setValueAtTime(Math.max(0.0002, peak * definition.sustain), releaseStart);
  voiceGain.gain.exponentialRampToValueAtTime(0.0001, releaseEnd);
  const filter = context.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = definition.filter; filter.Q.value = 0.35;
  const trackGain = context.createGain(); trackGain.gain.value = dbToGain(track.gain_db || 0);
  const pan = context.createStereoPanner(); pan.pan.value = clamp(track.pan, -1, 1, 0);
  filter.connect(voiceGain).connect(trackGain).connect(pan).connect(destination);

  for (const [waveform, octaveSemitones, level] of definition.oscillators) {
    const oscillator = context.createOscillator();
    const oscillatorGain = context.createGain(); oscillatorGain.gain.value = level;
    oscillator.type = waveform;
    oscillator.frequency.value = midiFrequency(finite(note.pitch, 60) + octaveSemitones);
    oscillator.detune.value = bendCents;
    if (modulation > 0.001) {
      const lfo = context.createOscillator(); const depth = context.createGain();
      lfo.frequency.value = 5.2; depth.gain.value = modulation * 32;
      lfo.connect(depth).connect(oscillator.detune); lfo.start(when); lfo.stop(releaseEnd + 0.02); sources.push(lfo);
    }
    oscillator.connect(oscillatorGain).connect(filter);
    oscillator.start(when); oscillator.stop(releaseEnd + 0.02); sources.push(oscillator);
  }
  return true;
}

function scheduleSamplerNote({ context, destination, entry, kit, buffers, contextStartTime, transportStartBeat, transportEndBeat, spb, sources, chokeGroups }) {
  if (entry.note.muted === true || entry.absolute_start_beat < transportStartBeat || entry.absolute_start_beat >= transportEndBeat) return false;
  const pad = (kit?.pads || []).find((candidate) => Math.round(finite(candidate.midi_pitch, -1)) === Math.round(finite(entry.note.pitch, -2)));
  if (!pad?.sample_asset_id) return false;
  let buffer = buffers.get(pad.sample_asset_id);
  if (!buffer) return false;
  if (pad.reverse === true) buffer = reversedBuffer(context, buffer);
  const when = contextStartTime + (entry.absolute_start_beat - transportStartBeat) * spb;
  const offset = clamp(pad.start_offset_seconds, 0, Math.max(0, buffer.duration - 0.001), 0);
  const configuredEnd = pad.end_offset_seconds === null || pad.end_offset_seconds === undefined
    ? buffer.duration
    : clamp(pad.end_offset_seconds, offset + 0.001, buffer.duration, buffer.duration);
  const sampleDuration = Math.max(0.001, configuredEnd - offset);
  const source = context.createBufferSource(); source.buffer = buffer; source.playbackRate.value = 2 ** (clamp(pad.tune_semitones, -24, 24, 0) / 12);
  const gain = context.createGain();
  const velocity = clamp(entry.note.velocity, 1, 127, 100) / 127;
  const velocityDepth = clamp(pad.velocity_to_gain, 0, 1, 1);
  const peakGain = Math.max(0.0001, dbToGain(pad.gain_db || 0) * (1 - velocityDepth + velocity * velocityDepth));
  const attack = clamp(pad.attack_ms, 0, 5000, 0) / 1000;
  const release = clamp(pad.release_ms, 0, 10000, 80) / 1000;
  gain.gain.setValueAtTime(attack > 0 ? 0.0001 : peakGain, when);
  if (attack > 0) gain.gain.linearRampToValueAtTime(peakGain, when + attack);
  const pan = context.createStereoPanner(); pan.pan.value = clamp(pad.pan, -1, 1, 0);
  const trackGain = context.createGain(); trackGain.gain.value = dbToGain(entry.track.gain_db || 0);
  source.connect(gain).connect(pan).connect(trackGain).connect(destination);
  const chokeGroup = String(pad.choke_group || "").trim();
  if (chokeGroup) {
    const prior = chokeGroups.get(chokeGroup); if (prior) { try { prior.stop(when); } catch {} }
    chokeGroups.set(chokeGroup, source);
  }
  const naturalDuration = sampleDuration / source.playbackRate.value;
  const noteDuration = Math.max(0.001, finite(entry.note.duration_beats, 0.25) * spb);
  const audibleDuration = pad.one_shot === false ? Math.min(naturalDuration, noteDuration) : naturalDuration;
  const releaseAt = when + Math.max(0.001, audibleDuration - release);
  if (release > 0) { gain.gain.setValueAtTime(peakGain, releaseAt); gain.gain.linearRampToValueAtTime(0.0001, releaseAt + release); }
  source.start(when, offset, sampleDuration); source.stop(when + audibleDuration + release + 0.02); sources.push(source);
  return true;
}

export async function startMusicUnifiedWorkstationPreview({
  session,
  assetUrls = {},
  sampler = null,
  sampleUrls = {},
  startSeconds = 0,
  stopAtSeconds = null,
  onEnded,
} = {}) {
  if (!session) throw new Error("MUSIC_UNIFIED_WORKSTATION_SESSION_REQUIRED");
  const bpm = clamp(session.bpm, 30, 300, 120);
  const spb = secondsPerBeat(bpm);
  const samplerKit = sampler?.kits?.find((kit) => kit.id === sampler?.selected_kit_id) || sampler?.kits?.[0] || null;
  const samplerBuffers = samplerKit ? await preloadSamplerBuffers(sampleUrls) : new Map();
  const projectEnd = Math.max(audioEndSeconds(session), midiEndSeconds(session), Number.isFinite(stopAtSeconds) ? stopAtSeconds : 0);
  const anchored = sessionWithTransportAnchor(session, assetUrls, Math.max(startSeconds + 0.1, projectEnd));
  const midiSources = [];
  const chokeGroups = new Map();
  let audioTransport = null;
  let finished = false;

  function finish(payload) {
    if (finished) return;
    finished = true;
    for (const source of midiSources) { try { source.stop(); } catch {} try { source.disconnect?.(); } catch {} }
    anchored.revoke?.();
    onEnded?.(payload);
  }

  audioTransport = await startMusicMultitrackPreview({
    session: anchored.session,
    assetUrls: anchored.assetUrls,
    startSeconds,
    stopAtSeconds: Number.isFinite(stopAtSeconds) ? stopAtSeconds : projectEnd,
    onEnded: (payload) => finish(payload),
  });
  const context = audioTransport.context;
  const contextStartTime = audioTransport.started_at_context_time;
  const midiMaster = context.createGain(); midiMaster.gain.value = 0.7;
  const midiCompressor = context.createDynamicsCompressor();
  midiCompressor.threshold.value = -10; midiCompressor.knee.value = 10; midiCompressor.ratio.value = 3; midiCompressor.attack.value = 0.003; midiCompressor.release.value = 0.16;
  midiMaster.connect(midiCompressor).connect(audioTransport.analyser);

  const startBeat = beatAtSeconds(startSeconds, bpm);
  const endBeat = beatAtSeconds(Number.isFinite(stopAtSeconds) ? stopAtSeconds : projectEnd, bpm);
  const midiTracks = session.midi?.tracks || [];
  const soloActive = midiTracks.some((track) => track.solo === true);
  let synthNotes = 0;
  let samplerHits = 0;
  for (const track of midiTracks) {
    if (track.mute === true || (soloActive && track.solo !== true)) continue;
    const samplerTrack = ["drum_machine", "sampler", "drum_rack"].includes(String(track.instrument?.kind || "").toLowerCase());
    for (const clip of track.clips || []) {
      for (const entry of expandedClipNotes(track, clip)) {
        if (samplerTrack && samplerKit) {
          if (scheduleSamplerNote({ context, destination: midiMaster, entry, kit: samplerKit, buffers: samplerBuffers, contextStartTime, transportStartBeat: startBeat, transportEndBeat: endBeat, spb, sources: midiSources, chokeGroups })) samplerHits += 1;
        } else if (scheduleSynthNote({ context, destination: midiMaster, entry, contextStartTime, transportStartBeat: startBeat, transportEndBeat: endBeat, spb, sources: midiSources })) {
          synthNotes += 1;
        }
      }
    }
  }

  return {
    contract: CONTRACT,
    audio_contract: audioTransport.contract,
    same_audio_context_clock: true,
    midi_routed_to_master_meter: true,
    midi_master_processing_separate_from_audio_master_bus: true,
    synchronized_context_start_time: contextStartTime,
    transport_start_seconds: startSeconds,
    transport_end_seconds: Number.isFinite(stopAtSeconds) ? stopAtSeconds : projectEnd,
    synth_note_count: synthNotes,
    sampler_hit_count: samplerHits,
    sampler_buffer_count: samplerBuffers.size,
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
    source_assets_preserved: true,
    currentPosition: () => audioTransport.currentPosition(),
    stop() {
      const position = audioTransport.currentPosition();
      for (const source of midiSources) { try { source.stop(); } catch {} }
      try { midiMaster.disconnect(); } catch {}
      try { midiCompressor.disconnect(); } catch {}
      if (!finished) {
        finished = true;
        anchored.revoke?.();
      }
      return audioTransport.stop() ?? position;
    },
  };
}

export const MusicUnifiedWorkstationTransport = {
  contract: CONTRACT,
  startPreview: startMusicUnifiedWorkstationPreview,
};

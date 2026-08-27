import { ensureMusicTempoMap } from "./CreativeMusicTempoMapRuntime";

const CONTRACT = "AVANTIQO_MUSIC_STANDARD_MIDI_FILE_V2";
const TEMPO_MAP_META_PREFIX = "AVANTIQO_TEMPO_MAP_V2:";

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function clamp(value, min, max, fallback = min) { return Math.max(min, Math.min(max, finite(value, fallback))); }

function readVar(bytes, state) {
  let value = 0;
  for (let count = 0; count < 4; count += 1) {
    if (state.offset >= bytes.length) throw new Error("CREATIVE_MUSIC_MIDI_FILE_TRUNCATED");
    const byte = bytes[state.offset++];
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return value;
  }
  throw new Error("CREATIVE_MUSIC_MIDI_FILE_VARINT_INVALID");
}

function writeVar(value) {
  let remaining = Math.max(0, Math.round(finite(value, 0)));
  const buffer = [remaining & 0x7f];
  while ((remaining >>= 7) > 0) buffer.unshift((remaining & 0x7f) | 0x80);
  return buffer;
}

function u16(bytes, offset) { return (bytes[offset] << 8) | bytes[offset + 1]; }
function u32(bytes, offset) { return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]; }
function ascii(bytes, offset, length) { return String.fromCharCode(...bytes.slice(offset, offset + length)); }

function decodeText(bytes) {
  try { return new TextDecoder("utf-8", { fatal: false }).decode(Uint8Array.from(bytes)); }
  catch { return String.fromCharCode(...bytes); }
}

function timeSignatureParts(value = "4/4") {
  const [numeratorRaw, denominatorRaw] = text(value || "4/4").split("/");
  const numerator = Math.round(clamp(numeratorRaw, 1, 32, 4));
  const denominator = [1,2,4,8,16,32].includes(Number(denominatorRaw)) ? Number(denominatorRaw) : 4;
  return { numerator, denominator };
}

function parsedTempoMap(tempoEvents, timeSignatures, preservedTempoMap, fallbackBpm = 120, fallbackSignature = "4/4") {
  if (preservedTempoMap?.contract === "AVANTIQO_MUSIC_TEMPO_MAP_V2") {
    return ensureMusicTempoMap(preservedTempoMap, { bpm:fallbackBpm, time_signature:fallbackSignature });
  }
  const tempo = tempoEvents.length ? tempoEvents : [{ tick:0, bpm:fallbackBpm }];
  const meter = timeSignatures.length ? timeSignatures : [{ tick:0, ...timeSignatureParts(fallbackSignature) }];
  return ensureMusicTempoMap({
    contract:"AVANTIQO_MUSIC_TEMPO_MAP_V2",
    tempo_events:tempo.map((event,index)=>({id:`midi-tempo-${index}`,beat:event.beat ?? 0,bpm:event.bpm,curve:"step"})),
    meter_events:meter.map((event,index)=>({id:`midi-meter-${index}`,beat:event.beat ?? 0,time_signature:`${event.numerator}/${event.denominator}`})),
  }, { bpm:fallbackBpm, time_signature:fallbackSignature });
}

export function parseStandardMidiFile(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || []);
  if (bytes.length < 14 || ascii(bytes, 0, 4) !== "MThd") throw new Error("CREATIVE_MUSIC_MIDI_FILE_HEADER_INVALID");
  const headerLength = u32(bytes, 4);
  const format = u16(bytes, 8);
  const trackCount = u16(bytes, 10);
  const division = u16(bytes, 12);
  if (headerLength < 6 || format > 1 || (division & 0x8000) !== 0) throw new Error("CREATIVE_MUSIC_MIDI_FILE_FORMAT_UNSUPPORTED");
  const ppq = division;
  let offset = 8 + headerLength;
  const tracks = [];
  const tempoEvents = [];
  const timeSignatures = [];
  let preservedTempoMap = null;

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    if (ascii(bytes, offset, 4) !== "MTrk") throw new Error("CREATIVE_MUSIC_MIDI_FILE_TRACK_HEADER_INVALID");
    const length = u32(bytes, offset + 4);
    const end = offset + 8 + length;
    if (end > bytes.length) throw new Error("CREATIVE_MUSIC_MIDI_FILE_TRACK_TRUNCATED");
    const state = { offset: offset + 8 };
    let tick = 0;
    let runningStatus = null;
    let name = `MIDI Track ${trackIndex + 1}`;
    const notes = [];
    const controls = [];
    const active = new Map();
    let primaryChannel = 1;

    while (state.offset < end) {
      tick += readVar(bytes, state);
      let status = bytes[state.offset++];
      if (status < 0x80) {
        if (runningStatus === null) throw new Error("CREATIVE_MUSIC_MIDI_FILE_RUNNING_STATUS_INVALID");
        state.offset -= 1;
        status = runningStatus;
      } else if (status < 0xf0) runningStatus = status;

      if (status === 0xff) {
        const type = bytes[state.offset++];
        const size = readVar(bytes, state);
        const data = bytes.slice(state.offset, state.offset + size);
        state.offset += size;
        if (type === 0x03) name = decodeText(data).slice(0, 120) || name;
        else if (type === 0x51 && size === 3) {
          const us = (data[0] << 16) | (data[1] << 8) | data[2];
          if (us > 0) tempoEvents.push({ tick, beat:tick / ppq, bpm:60000000 / us });
        } else if (type === 0x58 && size >= 2) {
          timeSignatures.push({ tick, beat:tick / ppq, numerator:data[0], denominator:2 ** data[1] });
        } else if (type === 0x7f) {
          const payload = decodeText(data);
          if (payload.startsWith(TEMPO_MAP_META_PREFIX)) {
            try { preservedTempoMap = JSON.parse(payload.slice(TEMPO_MAP_META_PREFIX.length)); }
            catch { preservedTempoMap = null; }
          }
        }
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        const size = readVar(bytes, state); state.offset += size; runningStatus = null; continue;
      }

      const kind = status & 0xf0;
      const channel = (status & 0x0f) + 1;
      primaryChannel = channel;
      const first = bytes[state.offset++];
      const second = [0xc0, 0xd0].includes(kind) ? null : bytes[state.offset++];
      const beat = tick / ppq;
      if (kind === 0x90 && second > 0) {
        const key = `${channel}:${first}`;
        if (!active.has(key)) active.set(key, []);
        active.get(key).push({ start_tick:tick, velocity:second, pitch:first });
      } else if (kind === 0x80 || (kind === 0x90 && second === 0)) {
        const key = `${channel}:${first}`;
        const queue = active.get(key) || [];
        const started = queue.shift();
        if (started) notes.push({ pitch:started.pitch, start_beat:started.start_tick / ppq, duration_beats:Math.max(1 / ppq, (tick - started.start_tick) / ppq), velocity:started.velocity, release_velocity:kind === 0x80 ? second : 64, midi_channel:channel });
      } else if (kind === 0xb0) {
        const mapping = first === 64 ? "sustain" : first === 1 ? "modulation" : first === 11 ? "expression" : "control_change";
        controls.push({ type:mapping, beat, value:second, controller:mapping === "control_change" ? first : null, midi_channel:channel });
      } else if (kind === 0xe0) {
        controls.push({ type:"pitch_bend", beat, value:(((second << 7) | first) - 8192), midi_channel:channel });
      } else if (kind === 0xd0) {
        controls.push({ type:"channel_pressure", beat, value:first, midi_channel:channel });
      }
    }
    for (const queue of active.values()) for (const started of queue) notes.push({ pitch:started.pitch, start_beat:started.start_tick / ppq, duration_beats:1, velocity:started.velocity, release_velocity:64, midi_channel:primaryChannel });
    const endBeat = Math.max(4, ...notes.map((note) => note.start_beat + note.duration_beats), ...controls.map((event) => event.beat));
    const musicalContent = notes.length > 0 || controls.length > 0;
    if (musicalContent) tracks.push({ name, midi_channel:primaryChannel, start_beat:0, duration_beats:endBeat, notes, control_events:controls });
    offset = end;
  }

  tempoEvents.sort((a,b)=>a.tick-b.tick); timeSignatures.sort((a,b)=>a.tick-b.tick);
  const normalizedTempoMap = parsedTempoMap(tempoEvents, timeSignatures, preservedTempoMap, tempoEvents[0]?.bpm || 120, timeSignatures[0] ? `${timeSignatures[0].numerator}/${timeSignatures[0].denominator}` : "4/4");
  return {
    contract: CONTRACT,
    format,
    ppq,
    track_count: tracks.length,
    tracks,
    tempo_events: tempoEvents.map((event) => ({ beat:event.tick / ppq, bpm:Math.round(event.bpm * 1000) / 1000 })),
    time_signatures: timeSignatures.map((event) => ({ beat:event.tick / ppq, numerator:event.numerator, denominator:event.denominator })),
    tempo_map: normalizedTempoMap,
    avantiqo_tempo_map_preserved: Boolean(preservedTempoMap),
    full_tempo_map_available: true,
    provider_job_submitted: false,
  };
}

function chunk(type, data) {
  const length = data.length;
  return [...type].map((char) => char.charCodeAt(0)).concat([(length >>> 24)&255,(length>>>16)&255,(length>>>8)&255,length&255], data);
}
function textMeta(type, value) {
  const bytes = Array.from(new TextEncoder().encode(text(value)));
  return [0xff, type, ...writeVar(bytes.length), ...bytes];
}
function tempoMeta(bpm) {
  const tempo = Math.round(60000000 / clamp(bpm, 30, 300, 120));
  return [0xff,0x51,0x03,(tempo>>>16)&255,(tempo>>>8)&255,tempo&255];
}
function meterMeta(signature) {
  const { numerator, denominator } = timeSignatureParts(signature);
  return [0xff,0x58,0x04,numerator,Math.round(Math.log2(denominator)),24,8];
}
function customTempoMapMeta(map) {
  const payload = `${TEMPO_MAP_META_PREFIX}${JSON.stringify(map)}`;
  const bytes = Array.from(new TextEncoder().encode(payload));
  return [0xff,0x7f,...writeVar(bytes.length),...bytes];
}
function standardTempoEvents(map, ppq) {
  const byTick = new Map();
  for (let index = 0; index < map.tempo_events.length; index += 1) {
    const event = map.tempo_events[index];
    const next = map.tempo_events[index + 1];
    const startTick = Math.round(event.beat * ppq);
    byTick.set(startTick, { tick:startTick, bpm:event.bpm });
    if (event.curve === "linear" && next && next.beat > event.beat) {
      const span = next.beat - event.beat;
      const samples = Math.min(256, Math.max(2, Math.ceil(span * 4)));
      for (let sample = 1; sample < samples; sample += 1) {
        const progress = sample / samples;
        const beat = event.beat + span * progress;
        const bpm = event.bpm + (next.bpm - event.bpm) * progress;
        const tick = Math.round(beat * ppq);
        byTick.set(tick, { tick, bpm });
      }
    }
  }
  return [...byTick.values()].sort((a,b)=>a.tick-b.tick);
}
function conductorTrack({ tempoMap, ppq }) {
  const events = [];
  for (const event of standardTempoEvents(tempoMap, ppq)) events.push({ tick:event.tick, order:1, bytes:tempoMeta(event.bpm) });
  for (const event of tempoMap.meter_events) events.push({ tick:Math.round(event.beat * ppq), order:2, bytes:meterMeta(event.time_signature) });
  events.push({ tick:0, order:0, bytes:customTempoMapMeta(tempoMap) });
  events.sort((a,b)=>a.tick-b.tick || a.order-b.order);
  const data = [];
  let previousTick = 0;
  for (const event of events) { data.push(...writeVar(event.tick - previousTick), ...event.bytes); previousTick = event.tick; }
  data.push(0x00,0xff,0x2f,0x00);
  return data;
}

export function encodeStandardMidiFile({ midi, bpm = 120, time_signature = "4/4", tempo_map = null } = {}) {
  const ppq = Math.round(clamp(midi?.ppq, 96, 3840, 960));
  const tracks = Array.isArray(midi?.tracks) ? midi.tracks : [];
  const tempoMap = ensureMusicTempoMap(tempo_map || {}, { bpm, time_signature });
  const chunks = [chunk("MTrk", conductorTrack({ tempoMap, ppq }))];

  for (const track of tracks) {
    const events = [];
    const channel = Math.round(clamp(track.midi_channel, 1, 16, 1)) - 1;
    events.push({ tick:0, order:0, bytes:textMeta(0x03, track.name || "MIDI Track") });
    for (const clip of track.clips || []) {
      const clipTick = Math.round(Math.max(0, finite(clip.start_beat, 0)) * ppq);
      for (const note of clip.notes || []) {
        if (note.muted === true) continue;
        const start = clipTick + Math.round(Math.max(0, finite(note.start_beat, 0)) * ppq);
        const end = start + Math.max(1, Math.round(Math.max(0.001, finite(note.duration_beats, 1)) * ppq));
        events.push({ tick:start, order:2, bytes:[0x90 | channel, Math.round(clamp(note.pitch,0,127,60)), Math.round(clamp(note.velocity,1,127,100))] });
        events.push({ tick:end, order:1, bytes:[0x80 | channel, Math.round(clamp(note.pitch,0,127,60)), Math.round(clamp(note.release_velocity,0,127,64))] });
      }
      for (const event of clip.control_events || []) {
        const tick = clipTick + Math.round(Math.max(0, finite(event.beat, 0)) * ppq);
        const value = Math.round(finite(event.value, 0));
        if (event.type === "pitch_bend") {
          const bend = Math.round(clamp(value, -8192, 8191, 0)) + 8192;
          events.push({ tick, order:3, bytes:[0xe0 | channel, bend & 0x7f, (bend >> 7) & 0x7f] });
        } else if (event.type === "channel_pressure") events.push({ tick, order:3, bytes:[0xd0 | channel, Math.round(clamp(value,0,127,0))] });
        else {
          const controller = event.type === "sustain" ? 64 : event.type === "modulation" ? 1 : event.type === "expression" ? 11 : Math.round(clamp(event.controller,0,127,1));
          events.push({ tick, order:3, bytes:[0xb0 | channel, controller, Math.round(clamp(value,0,127,0))] });
        }
      }
    }
    events.sort((a,b)=>a.tick-b.tick || a.order-b.order);
    const data = [];
    let previousTick = 0;
    for (const event of events) { data.push(...writeVar(event.tick - previousTick), ...event.bytes); previousTick = event.tick; }
    data.push(0x00,0xff,0x2f,0x00);
    chunks.push(chunk("MTrk", data));
  }
  const count = chunks.length;
  const header = chunk("MThd", [0x00,0x01,(count>>>8)&255,count&255,(ppq>>>8)&255,ppq&255]);
  return new Uint8Array([...header, ...chunks.flat()]);
}

export const CreativeMusicMidiFileRuntime = {
  contract: CONTRACT,
  parse: parseStandardMidiFile,
  encode: encodeStandardMidiFile,
};

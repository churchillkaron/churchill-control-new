function channelData(value) {
  if (value instanceof Float32Array) return value;
  if (ArrayBuffer.isView(value)) return new Float32Array(value.buffer, value.byteOffset, Math.floor(value.byteLength / 4));
  return new Float32Array(value || []);
}

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function ascii(view, offset, value, length = value.length) {
  const source = String(value ?? "");
  for (let index = 0; index < length; index += 1) view.setUint8(offset + index, index < source.length ? source.charCodeAt(index) & 0x7f : 0);
}
function parseTimecodeSamples(timecode, frameRate, sampleRate) {
  const parts = text(timecode || "00:00:00:00").split(":").map((value) => Math.max(0, Math.floor(finite(value, 0))));
  const [hours = 0, minutes = 0, seconds = 0, frames = 0] = parts;
  const fps = Math.max(1, finite(frameRate, 24));
  const totalSeconds = hours * 3600 + minutes * 60 + seconds + frames / fps;
  return Math.max(0, Math.round(totalSeconds * sampleRate));
}
function splitUint64(value) {
  const big = BigInt(Math.max(0, Math.floor(finite(value, 0))));
  return { low: Number(big & 0xffffffffn), high: Number((big >> 32n) & 0xffffffffn) };
}
function buildBext(view, offset, options, sampleRate) {
  const payloadBytes = 602;
  ascii(view, offset, "bext", 4); view.setUint32(offset + 4, payloadBytes, true);
  const base = offset + 8;
  ascii(view, base, text(options.description || "Avantiqo Professional Audio Engine"), 256);
  ascii(view, base + 256, text(options.originator || "Avantiqo"), 32);
  ascii(view, base + 288, text(options.originator_reference || options.picture_lock_digest || "AVANTIQO"), 32);
  const date = text(options.origination_date || "1970-01-01").slice(0, 10);
  const time = text(options.origination_time || "00:00:00").slice(0, 8);
  ascii(view, base + 320, date, 10); ascii(view, base + 330, time, 8);
  const reference = splitUint64(options.time_reference_samples ?? parseTimecodeSamples(options.start_timecode, options.frame_rate, sampleRate));
  view.setUint32(base + 338, reference.low, true); view.setUint32(base + 342, reference.high, true);
  view.setUint16(base + 346, 1, true);
  for (let index = 348; index < payloadBytes; index += 1) view.setUint8(base + index, 0);
  return { payload_bytes: payloadBytes, total_bytes: payloadBytes + 8, time_reference_samples: reference.high * 4294967296 + reference.low };
}

export function encodeMusicChannelsWav24(channelsInput = [], sampleRate = 48000, options = {}) {
  const channels = channelsInput.map(channelData).filter((channel) => channel.length > 0);
  if (!channels.length) throw new Error("CREATIVE_MUSIC_WAV24_CHANNELS_REQUIRED");
  const frames = Math.min(...channels.map((channel) => channel.length));
  if (!frames) throw new Error("CREATIVE_MUSIC_WAV24_FRAMES_REQUIRED");
  const channelCount = Math.max(1, Math.min(8, channels.length));
  const rate = Math.max(8000, Math.min(192000, Math.round(Number(sampleRate) || 48000)));
  const bytesPerSample = 3, blockAlign = channelCount * bytesPerSample, dataBytes = frames * blockAlign;
  const layout = String(options.channel_layout || "").toLowerCase();
  const channelMask = channelCount === 6 ? 0x060f : channelCount === 8 ? 0x063f : channelCount === 2 ? 0x0003 : channelCount === 1 ? 0x0004 : 0;
  const extensible = channelCount > 2, fmtPayloadBytes = extensible ? 40 : 16;
  const bwf = options.bwf?.enabled === true, bextChunkBytes = bwf ? 610 : 0;
  const headerBytes = 12 + 8 + fmtPayloadBytes + bextChunkBytes + 8;
  const buffer = new ArrayBuffer(headerBytes + dataBytes), view = new DataView(buffer);
  ascii(view, 0, "RIFF", 4); view.setUint32(4, headerBytes + dataBytes - 8, true); ascii(view, 8, "WAVE", 4);
  let cursor = 12; ascii(view, cursor, "fmt ", 4); view.setUint32(cursor + 4, fmtPayloadBytes, true); const fmt = cursor + 8;
  if (extensible) {
    view.setUint16(fmt, 0xfffe, true); view.setUint16(fmt + 2, channelCount, true); view.setUint32(fmt + 4, rate, true); view.setUint32(fmt + 8, rate * blockAlign, true); view.setUint16(fmt + 12, blockAlign, true); view.setUint16(fmt + 14, 24, true); view.setUint16(fmt + 16, 22, true); view.setUint16(fmt + 18, 24, true); view.setUint32(fmt + 20, channelMask, true); view.setUint32(fmt + 24, 1, true); view.setUint16(fmt + 28, 0, true); view.setUint16(fmt + 30, 0x0010, true); [0x80,0x00,0x00,0xaa,0x00,0x38,0x9b,0x71].forEach((byte,index)=>view.setUint8(fmt+32+index,byte));
  } else {
    view.setUint16(fmt, 1, true); view.setUint16(fmt + 2, channelCount, true); view.setUint32(fmt + 4, rate, true); view.setUint32(fmt + 8, rate * blockAlign, true); view.setUint16(fmt + 12, blockAlign, true); view.setUint16(fmt + 14, 24, true);
  }
  cursor += 8 + fmtPayloadBytes;
  let bext = null;
  if (bwf) { bext = buildBext(view, cursor, options.bwf || {}, rate); cursor += bext.total_bytes; }
  ascii(view, cursor, "data", 4); view.setUint32(cursor + 4, dataBytes, true); cursor += 8;
  let offset = cursor;
  for (let frame = 0; frame < frames; frame += 1) for (let channel = 0; channel < channelCount; channel += 1) {
    const sample = Math.max(-1, Math.min(1, channels[channel]?.[frame] ?? channels[0][frame] ?? 0));
    const value = sample < 0 ? Math.round(sample * 0x800000) : Math.round(sample * 0x7fffff);
    view.setUint8(offset, value & 0xff); view.setUint8(offset + 1, (value >> 8) & 0xff); view.setUint8(offset + 2, (value >> 16) & 0xff); offset += 3;
  }
  return { contract: "AVANTIQO_MUSIC_WAV24_ENCODER_V4", blob: new Blob([buffer], { type: "audio/wav" }), array_buffer: buffer, sample_rate: rate, channels: channelCount, channel_layout: layout || (channelCount === 6 ? "5.1" : channelCount === 8 ? "7.1" : channelCount === 2 ? "stereo" : "mono"), channel_mask: channelMask, wave_format_extensible: extensible, bit_depth: 24, frames, duration_seconds: frames / rate, bwf_enabled: bwf, bext_present: bwf, time_reference_samples: bext?.time_reference_samples ?? null, start_timecode: bwf ? text(options.bwf?.start_timecode || "00:00:00:00") : null, destructive_processing: false };
}

export function encodeMusicAudioBufferWav24(audioBuffer, options = {}) {
  if (!audioBuffer?.numberOfChannels || !audioBuffer?.length) throw new Error("CREATIVE_MUSIC_WAV24_AUDIO_BUFFER_REQUIRED");
  const channels = [];
  for (let index = 0; index < Math.min(8, audioBuffer.numberOfChannels); index += 1) channels.push(audioBuffer.getChannelData(index));
  return encodeMusicChannelsWav24(channels, audioBuffer.sampleRate, options);
}

export function analyseMusicAudioBuffer(audioBuffer) {
  if (!audioBuffer?.numberOfChannels || !audioBuffer?.length) throw new Error("CREATIVE_MUSIC_AUDIO_BUFFER_REQUIRED");
  let peak = 0;
  let sumSquares = 0;
  let samples = 0;
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      const value = data[index];
      peak = Math.max(peak, Math.abs(value));
      sumSquares += value * value;
      samples += 1;
    }
  }
  const toDb = (value) => value > 0 ? 20 * Math.log10(value) : -Infinity;
  const peakDbfs = toDb(peak);
  return {
    contract: "AVANTIQO_MUSIC_OFFLINE_RENDER_LEVEL_ANALYSIS_V1",
    peak_dbfs: peakDbfs,
    rms_dbfs: toDb(Math.sqrt(sumSquares / Math.max(1, samples))),
    clipping: peak >= 0.999,
    headroom_db: Number.isFinite(peakDbfs) ? Math.max(0, -peakDbfs) : Infinity,
    samples,
  };
}

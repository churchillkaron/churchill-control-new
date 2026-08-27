function channelData(value) {
  if (value instanceof Float32Array) return value;
  if (ArrayBuffer.isView(value)) return new Float32Array(value.buffer, value.byteOffset, Math.floor(value.byteLength / 4));
  return new Float32Array(value || []);
}

export function encodeMusicChannelsWav24(channelsInput = [], sampleRate = 48000) {
  const channels = channelsInput.map(channelData).filter((channel) => channel.length > 0);
  if (!channels.length) throw new Error("CREATIVE_MUSIC_WAV24_CHANNELS_REQUIRED");
  const frames = Math.min(...channels.map((channel) => channel.length));
  if (!frames) throw new Error("CREATIVE_MUSIC_WAV24_FRAMES_REQUIRED");
  const channelCount = Math.max(1, Math.min(2, channels.length));
  const rate = Math.max(8000, Math.min(192000, Math.round(Number(sampleRate) || 48000)));
  const bytesPerSample = 3;
  const blockAlign = channelCount * bytesPerSample;
  const dataBytes = frames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeText = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 24, true);
  writeText(36, "data");
  view.setUint32(40, dataBytes, true);
  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel]?.[frame] ?? channels[0][frame] ?? 0));
      const value = sample < 0 ? Math.round(sample * 0x800000) : Math.round(sample * 0x7fffff);
      view.setUint8(offset, value & 0xff);
      view.setUint8(offset + 1, (value >> 8) & 0xff);
      view.setUint8(offset + 2, (value >> 16) & 0xff);
      offset += 3;
    }
  }
  return {
    contract: "AVANTIQO_MUSIC_WAV24_ENCODER_V1",
    blob: new Blob([buffer], { type: "audio/wav" }),
    array_buffer: buffer,
    sample_rate: rate,
    channels: channelCount,
    bit_depth: 24,
    frames,
    duration_seconds: frames / rate,
    destructive_processing: false,
  };
}

export function encodeMusicAudioBufferWav24(audioBuffer) {
  if (!audioBuffer?.numberOfChannels || !audioBuffer?.length) throw new Error("CREATIVE_MUSIC_WAV24_AUDIO_BUFFER_REQUIRED");
  const channels = [];
  for (let index = 0; index < Math.min(2, audioBuffer.numberOfChannels); index += 1) {
    channels.push(audioBuffer.getChannelData(index));
  }
  return encodeMusicChannelsWav24(channels, audioBuffer.sampleRate);
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

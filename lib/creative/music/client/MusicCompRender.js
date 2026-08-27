function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function dbToGain(db) {
  return 10 ** (finite(db, 0) / 20);
}

function encodeAudioBufferWav24(audioBuffer) {
  const channels = Math.max(1, audioBuffer.numberOfChannels);
  const frames = audioBuffer.length;
  const bytesPerSample = 3;
  const blockAlign = channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + frames * blockAlign);
  const view = new DataView(buffer);
  const writeText = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + frames * blockAlign, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, audioBuffer.sampleRate, true);
  view.setUint32(28, audioBuffer.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 24, true);
  writeText(36, "data");
  view.setUint32(40, frames * blockAlign, true);

  let offset = 44;
  const channelData = Array.from({ length: channels }, (_, channel) => audioBuffer.getChannelData(channel));
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel]?.[frame] ?? channelData[0]?.[frame] ?? 0));
      const value = sample < 0 ? Math.round(sample * 0x800000) : Math.round(sample * 0x7fffff);
      view.setUint8(offset, value & 0xff);
      view.setUint8(offset + 1, (value >> 8) & 0xff);
      view.setUint8(offset + 2, (value >> 16) & 0xff);
      offset += 3;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

async function decodeSources(regions, assetUrls) {
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) throw new Error("CREATIVE_MUSIC_COMP_RENDER_AUDIO_CONTEXT_UNAVAILABLE");
  const decoder = new AudioContextClass({ latencyHint: "playback" });
  try {
    const uniqueAssetIds = [...new Set(regions.map((region) => region.source_asset_id).filter(Boolean))];
    const decoded = new Map();
    for (const assetId of uniqueAssetIds) {
      const url = assetUrls?.[assetId];
      if (!url) throw new Error(`CREATIVE_MUSIC_COMP_RENDER_SOURCE_URL_MISSING:${assetId}`);
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`CREATIVE_MUSIC_COMP_RENDER_SOURCE_FETCH_${response.status}:${assetId}`);
      const bytes = await response.arrayBuffer();
      decoded.set(assetId, await decoder.decodeAudioData(bytes.slice(0)));
    }
    return decoded;
  } finally {
    await decoder.close().catch(() => {});
  }
}

export async function renderMusicCompToWav24({ track, assetUrls, sampleRate = 48000 } = {}) {
  const comp = track?.comp;
  const regions = Array.isArray(comp?.regions) ? comp.regions : [];
  if (!track?.id || !comp?.id || !regions.length) {
    throw new Error("CREATIVE_MUSIC_COMP_RENDER_COMP_REQUIRED");
  }
  if (comp.destructive_edit === true || comp.preserve_all_source_takes !== true) {
    throw new Error("CREATIVE_MUSIC_COMP_RENDER_NON_DESTRUCTIVE_REQUIRED");
  }

  const start = Math.max(0, finite(comp.start_seconds, regions[0]?.start_seconds || 0));
  const end = Math.max(start, finite(comp.end_seconds, regions.at(-1)?.end_seconds || start));
  const duration = end - start;
  if (duration <= 0) throw new Error("CREATIVE_MUSIC_COMP_RENDER_DURATION_REQUIRED");

  const decoded = await decodeSources(regions, assetUrls);
  const maxChannels = Math.max(1, ...[...decoded.values()].map((buffer) => Math.min(2, buffer.numberOfChannels)));
  const rate = Math.max(8000, Math.min(192000, Math.round(finite(sampleRate, 48000))));
  const frameLength = Math.max(1, Math.ceil(duration * rate));
  const OfflineAudioContextClass = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!OfflineAudioContextClass) throw new Error("CREATIVE_MUSIC_COMP_RENDER_OFFLINE_CONTEXT_UNAVAILABLE");
  const offline = new OfflineAudioContextClass(maxChannels, frameLength, rate);

  for (const region of regions) {
    const buffer = decoded.get(region.source_asset_id);
    if (!buffer) throw new Error(`CREATIVE_MUSIC_COMP_RENDER_SOURCE_DECODE_MISSING:${region.source_asset_id}`);
    const regionStart = Math.max(start, finite(region.start_seconds, start));
    const regionEnd = Math.min(end, Math.max(regionStart, finite(region.end_seconds, regionStart)));
    const regionDuration = regionEnd - regionStart;
    if (regionDuration <= 0) continue;
    const sourceOffset = Math.max(0, finite(region.source_offset_seconds, 0));
    const available = Math.max(0, buffer.duration - sourceOffset);
    const scheduledDuration = Math.min(regionDuration, available);
    if (scheduledDuration <= 0) continue;

    const source = offline.createBufferSource();
    source.buffer = buffer;
    const gain = offline.createGain();
    const baseGain = dbToGain(region.gain_db);
    const when = regionStart - start;
    const fadeIn = Math.min(scheduledDuration / 2, Math.max(0, finite(region.fade_in_seconds, comp.crossfade_default_seconds || 0.015)));
    const fadeOut = Math.min(scheduledDuration / 2, Math.max(0, finite(region.fade_out_seconds, comp.crossfade_default_seconds || 0.015)));
    gain.gain.setValueAtTime(fadeIn > 0 ? 0 : baseGain, when);
    if (fadeIn > 0) gain.gain.linearRampToValueAtTime(baseGain, when + fadeIn);
    if (fadeOut > 0) {
      const fadeStart = when + Math.max(fadeIn, scheduledDuration - fadeOut);
      gain.gain.setValueAtTime(baseGain, fadeStart);
      gain.gain.linearRampToValueAtTime(0, when + scheduledDuration);
    }
    source.connect(gain);
    gain.connect(offline.destination);
    source.start(when, sourceOffset, scheduledDuration);
  }

  const rendered = await offline.startRendering();
  return {
    contract: "AVANTIQO_MUSIC_COMP_RENDER_V1",
    blob: encodeAudioBufferWav24(rendered),
    duration_seconds: rendered.duration,
    sample_rate: rendered.sampleRate,
    channels: rendered.numberOfChannels,
    bit_depth: 24,
    track_id: track.id,
    comp_id: comp.id,
    source_take_ids: [...new Set(comp.source_take_ids || regions.map((region) => region.take_id).filter(Boolean))],
    source_asset_ids: [...new Set(comp.source_asset_ids || regions.map((region) => region.source_asset_id).filter(Boolean))],
    channel_strip_applied: false,
    dry_comp_render: true,
    source_takes_preserved: true,
    destructive_edit: false,
  };
}

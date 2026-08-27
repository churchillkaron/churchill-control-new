const BUFFER_CACHE = new Map();

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function dbToGain(db) {
  return 10 ** (finite(db, 0) / 20);
}

async function loadBuffer(context, url) {
  if (!url) throw new Error("CREATIVE_MUSIC_MULTITRACK_PREVIEW_SOURCE_URL_REQUIRED");
  if (BUFFER_CACHE.has(url)) return BUFFER_CACHE.get(url);
  const promise = fetch(url, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`CREATIVE_MUSIC_MULTITRACK_PREVIEW_FETCH_${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => context.decodeAudioData(bytes.slice(0)));
  BUFFER_CACHE.set(url, promise);
  try {
    return await promise;
  } catch (error) {
    BUFFER_CACHE.delete(url);
    throw error;
  }
}

function connectTrackStrip(context, track, destination) {
  const strip = track.channel_strip || {};
  const clipBus = context.createGain();
  const trim = context.createGain();
  trim.gain.value = dbToGain(strip.input_trim_db);
  const polarity = context.createGain();
  polarity.gain.value = strip.polarity_invert === true ? -1 : 1;

  const highPass = context.createBiquadFilter();
  highPass.type = "highpass";
  highPass.frequency.value = Math.max(20, finite(strip.high_pass_hz, 20));
  highPass.Q.value = 0.707;

  const lowShelf = context.createBiquadFilter();
  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = 120;
  lowShelf.gain.value = finite(strip.low_shelf_db, 0);

  const presence = context.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 3200;
  presence.Q.value = 0.8;
  presence.gain.value = finite(strip.presence_db, 0);

  const highShelf = context.createBiquadFilter();
  highShelf.type = "highshelf";
  highShelf.frequency.value = 8000;
  highShelf.gain.value = finite(strip.high_shelf_db, 0);

  const compressor = context.createDynamicsCompressor();
  const comp = strip.compressor || {};
  compressor.threshold.value = finite(comp.threshold_db, -18);
  compressor.ratio.value = Math.max(1, finite(comp.ratio, 3));
  compressor.attack.value = Math.max(0.0001, finite(comp.attack_ms, 15) / 1000);
  compressor.release.value = Math.max(0.01, finite(comp.release_ms, 150) / 1000);
  compressor.knee.value = Math.max(0, finite(comp.knee_db, 6));

  const makeup = context.createGain();
  makeup.gain.value = comp.enabled === true ? dbToGain(comp.makeup_db) : 1;
  const fader = context.createGain();
  fader.gain.value = track.mute === true ? 0 : dbToGain(track.gain_db);
  const pan = context.createStereoPanner();
  pan.pan.value = Math.max(-1, Math.min(1, finite(track.pan, 0)));

  clipBus.connect(trim);
  trim.connect(polarity);
  polarity.connect(highPass);
  highPass.connect(lowShelf);
  lowShelf.connect(presence);
  presence.connect(highShelf);
  if (comp.enabled === true) {
    highShelf.connect(compressor);
    compressor.connect(makeup);
  } else {
    highShelf.connect(makeup);
  }
  makeup.connect(fader);
  fader.connect(pan);
  pan.connect(destination);

  return { clipBus, fader };
}

function scheduleClip(context, buffer, clip, trackBus, transportStartSeconds, contextStartTime, sources, stopAtSeconds = null) {
  if (clip.muted === true) return;
  const clipStart = Math.max(0, finite(clip.start_seconds, 0));
  const clipEnd = clipStart + Math.max(0, finite(clip.duration_seconds, 0));
  if (clipEnd <= transportStartSeconds) return;
  if (Number.isFinite(stopAtSeconds) && clipStart >= stopAtSeconds) return;

  const offsetIntoClip = Math.max(0, transportStartSeconds - clipStart);
  const sourceOffset = Math.max(0, finite(clip.source_offset_seconds, 0) + offsetIntoClip);
  const available = Math.max(0, buffer.duration - sourceOffset);
  let scheduledDuration = Math.min(
    Math.max(0, finite(clip.duration_seconds, 0) - offsetIntoClip),
    available,
  );
  if (Number.isFinite(stopAtSeconds)) {
    const transportClipStart = Math.max(transportStartSeconds, clipStart);
    scheduledDuration = Math.min(scheduledDuration, Math.max(0, stopAtSeconds - transportClipStart));
  }
  if (scheduledDuration <= 0) return;

  const source = context.createBufferSource();
  source.buffer = buffer;
  const clipGain = context.createGain();
  const baseGain = dbToGain(clip.gain_db);
  clipGain.gain.value = baseGain;
  source.connect(clipGain);
  clipGain.connect(trackBus);

  const when = contextStartTime + Math.max(0, clipStart - transportStartSeconds);
  const fadeIn = Math.min(scheduledDuration / 2, Math.max(0, finite(clip.fade_in_seconds, 0)));
  const fadeOut = Math.min(scheduledDuration / 2, Math.max(0, finite(clip.fade_out_seconds, 0)));
  if (fadeIn > 0 && offsetIntoClip < fadeIn) {
    const progress = Math.max(0, Math.min(1, offsetIntoClip / fadeIn));
    clipGain.gain.setValueAtTime(baseGain * progress, when);
    clipGain.gain.linearRampToValueAtTime(baseGain, when + Math.max(0.001, fadeIn - offsetIntoClip));
  }
  if (fadeOut > 0) {
    const fadeStart = when + Math.max(0, scheduledDuration - fadeOut);
    clipGain.gain.setValueAtTime(baseGain, fadeStart);
    clipGain.gain.linearRampToValueAtTime(0, when + scheduledDuration);
  }

  source.start(when, sourceOffset, scheduledDuration);
  sources.push(source);
}

export async function startMusicMultitrackPreview({
  session,
  assetUrls,
  startSeconds = 0,
  stopAtSeconds = null,
  onEnded,
} = {}) {
  if (!session) throw new Error("CREATIVE_MUSIC_MULTITRACK_PREVIEW_SESSION_REQUIRED");
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) throw new Error("CREATIVE_MUSIC_MULTITRACK_PREVIEW_AUDIO_CONTEXT_UNAVAILABLE");

  const context = new AudioContextClass({ latencyHint: "interactive", sampleRate: session.sample_rate || undefined });
  await context.resume();
  const master = context.createGain();
  master.gain.value = dbToGain(session.buses?.find((bus) => bus.id === "bus-master")?.gain_db || 0);
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  master.connect(analyser);
  analyser.connect(context.destination);

  const soloActive = (session.tracks || []).some((track) => track.solo === true);
  const sources = [];
  const contextStartTime = context.currentTime + 0.03;
  let maxEnd = startSeconds;

  for (const track of session.tracks || []) {
    const effectiveMute = track.mute === true || (soloActive && track.solo !== true);
    const previewTrack = effectiveMute ? { ...track, mute: true } : track;
    const { clipBus } = connectTrackStrip(context, previewTrack, master);
    for (const clip of track.clips || []) {
      const url = assetUrls?.[clip.source_asset_id];
      if (!url) continue;
      const buffer = await loadBuffer(context, url);
      scheduleClip(context, buffer, clip, clipBus, startSeconds, contextStartTime, sources, stopAtSeconds);
      maxEnd = Math.max(maxEnd, finite(clip.start_seconds, 0) + finite(clip.duration_seconds, 0));
    }
  }

  const effectiveEnd = Number.isFinite(stopAtSeconds) ? Math.min(maxEnd, stopAtSeconds) : maxEnd;
  const duration = Math.max(0, effectiveEnd - startSeconds);
  let ended = false;
  const position = () => {
    const elapsed = Math.max(0, context.currentTime - contextStartTime);
    return Math.min(effectiveEnd, Math.max(startSeconds, startSeconds + elapsed));
  };
  const finish = () => {
    if (ended) return;
    ended = true;
    onEnded?.({ position_seconds: position(), natural: true });
  };
  const timer = duration > 0 ? setTimeout(finish, (duration + 0.06) * 1000) : null;

  return {
    contract: "AVANTIQO_MUSIC_MULTITRACK_BROWSER_PREVIEW_V2",
    release_master: false,
    context,
    analyser,
    started_at_context_time: contextStartTime,
    transport_start_seconds: startSeconds,
    transport_end_seconds: effectiveEnd,
    duration_seconds: duration,
    currentPosition: position,
    stop() {
      if (timer) clearTimeout(timer);
      const stoppedAt = position();
      for (const source of sources) {
        try { source.stop(); } catch {}
      }
      context.close().catch(() => {});
      if (!ended) {
        ended = true;
        onEnded?.({ position_seconds: stoppedAt, natural: false });
      }
      return stoppedAt;
    },
  };
}

export function clearMusicMultitrackPreviewCache() {
  BUFFER_CACHE.clear();
}

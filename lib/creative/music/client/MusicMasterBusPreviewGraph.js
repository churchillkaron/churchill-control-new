function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function dbToGain(db) {
  return 10 ** (finite(db, 0) / 20);
}

export function createMusicMasterBusPreviewGraph(context, masterBus, destination) {
  const processing = masterBus?.processing || {};
  const eq = processing.eq || {};
  const compressorSettings = processing.compressor || {};

  const input = context.createGain();
  const highPass = context.createBiquadFilter();
  highPass.type = "highpass";
  highPass.frequency.value = Math.max(20, Math.min(120, finite(eq.high_pass_hz, 20)));
  highPass.Q.value = 0.707;

  const lowShelf = context.createBiquadFilter();
  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = Math.max(40, Math.min(300, finite(eq.low_shelf_hz, 100)));
  lowShelf.gain.value = Math.max(-6, Math.min(6, finite(eq.low_shelf_db, 0)));

  const presence = context.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = Math.max(1000, Math.min(7000, finite(eq.presence_hz, 3200)));
  presence.Q.value = Math.max(0.2, Math.min(4, finite(eq.presence_q, 0.7)));
  presence.gain.value = Math.max(-6, Math.min(6, finite(eq.presence_db, 0)));

  const highShelf = context.createBiquadFilter();
  highShelf.type = "highshelf";
  highShelf.frequency.value = Math.max(4000, Math.min(18000, finite(eq.high_shelf_hz, 9000)));
  highShelf.gain.value = Math.max(-6, Math.min(6, finite(eq.high_shelf_db, 0)));

  input.connect(highPass);
  highPass.connect(lowShelf);
  lowShelf.connect(presence);
  presence.connect(highShelf);

  let chain = highShelf;
  let compressor = null;
  if (compressorSettings.enabled === true) {
    compressor = context.createDynamicsCompressor();
    compressor.threshold.value = Math.max(-40, Math.min(0, finite(compressorSettings.threshold_db, -12)));
    compressor.ratio.value = Math.max(1, Math.min(8, finite(compressorSettings.ratio, 1.8)));
    compressor.attack.value = Math.max(0.001, Math.min(0.2, finite(compressorSettings.attack_ms, 30) / 1000));
    compressor.release.value = Math.max(0.02, Math.min(2, finite(compressorSettings.release_ms, 250) / 1000));
    compressor.knee.value = Math.max(0, Math.min(20, finite(compressorSettings.knee_db, 4)));
    chain.connect(compressor);
    chain = compressor;
  }

  const makeup = context.createGain();
  makeup.gain.value = compressorSettings.enabled === true ? dbToGain(compressorSettings.makeup_db) : 1;
  const fader = context.createGain();
  fader.gain.value = masterBus?.mute === true ? 0 : dbToGain(masterBus?.gain_db || 0);
  chain.connect(makeup);
  makeup.connect(fader);
  fader.connect(destination);

  return {
    contract: "AVANTIQO_MUSIC_MASTER_BUS_PREVIEW_GRAPH_V1",
    input,
    compressor,
    fader,
    release_limiter_enabled: false,
    true_peak_certification: false,
    non_destructive: true,
  };
}

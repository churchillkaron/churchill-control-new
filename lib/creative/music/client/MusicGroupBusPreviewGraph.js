function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function dbToGain(db) {
  return 10 ** (finite(db, 0) / 20);
}

function text(value) {
  return String(value ?? "").trim();
}

function connectGroupProcessing(context, input, group) {
  const processing = group.processing || {};
  const eq = processing.eq || {};
  let chain = input;

  const highPass = context.createBiquadFilter();
  highPass.type = "highpass";
  highPass.frequency.value = Math.max(20, Math.min(400, finite(eq.high_pass_hz, 20)));
  highPass.Q.value = 0.707;
  chain.connect(highPass);
  chain = highPass;

  const lowShelf = context.createBiquadFilter();
  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = Math.max(40, Math.min(500, finite(eq.low_shelf_hz, 120)));
  lowShelf.gain.value = Math.max(-12, Math.min(12, finite(eq.low_shelf_db, 0)));
  chain.connect(lowShelf);
  chain = lowShelf;

  const presence = context.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = Math.max(500, Math.min(8000, finite(eq.presence_hz, 3000)));
  presence.Q.value = Math.max(0.2, Math.min(8, finite(eq.presence_q, 0.8)));
  presence.gain.value = Math.max(-12, Math.min(12, finite(eq.presence_db, 0)));
  chain.connect(presence);
  chain = presence;

  const highShelf = context.createBiquadFilter();
  highShelf.type = "highshelf";
  highShelf.frequency.value = Math.max(3000, Math.min(18000, finite(eq.high_shelf_hz, 8000)));
  highShelf.gain.value = Math.max(-12, Math.min(12, finite(eq.high_shelf_db, 0)));
  chain.connect(highShelf);
  chain = highShelf;

  const compressorSettings = processing.compressor || {};
  let compressor = null;
  if (compressorSettings.enabled === true) {
    compressor = context.createDynamicsCompressor();
    compressor.threshold.value = Math.max(-60, Math.min(0, finite(compressorSettings.threshold_db, -18)));
    compressor.ratio.value = Math.max(1, Math.min(20, finite(compressorSettings.ratio, 2.5)));
    compressor.attack.value = Math.max(0.0001, Math.min(0.2, finite(compressorSettings.attack_ms, 20) / 1000));
    compressor.release.value = Math.max(0.01, Math.min(2, finite(compressorSettings.release_ms, 180) / 1000));
    compressor.knee.value = Math.max(0, Math.min(40, finite(compressorSettings.knee_db, 6)));
    chain.connect(compressor);
    chain = compressor;
  }

  const makeup = context.createGain();
  makeup.gain.value = compressorSettings.enabled === true ? dbToGain(compressorSettings.makeup_db) : 1;
  chain.connect(makeup);
  return { output: makeup, compressor };
}


function createDialogueSidechainNode(context, settings = {}) {
  const WorkletNode = globalThis.AudioWorkletNode;
  if (typeof WorkletNode !== "function") throw new Error("CREATIVE_AUDIO_POST_SIDECHAIN_WORKLET_UNAVAILABLE");
  const node = new WorkletNode(context, "avantiqo-dialogue-sidechain", { numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: settings });
  node.channelCountMode = "max";
  return node;
}

export function createMusicGroupBusPreviewGraph(context, session, masterDestination) {
  const groups = (session?.buses || []).filter((bus) => bus.type === "group");
  const inputs = new Map();
  const outputs = new Map();

  for (const group of groups) {
    const input = context.createGain();
    const processing = connectGroupProcessing(context, input, group);
    const fader = context.createGain();
    fader.gain.value = group.mute === true ? 0 : dbToGain(group.gain_db);
    const pan = context.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, finite(group.pan, 0)));
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.35;
    processing.output.connect(fader);
    fader.connect(pan);
    pan.connect(analyser);
    inputs.set(group.id, input);
    outputs.set(group.id, {
      input,
      compressor: processing.compressor,
      fader,
      pan,
      analyser,
      scratch: new Float32Array(analyser.fftSize),
      bus: group,
    });
  }

  const postPolicy = session?.audio_post_mix || null;
  const ducking = postPolicy?.dialogue_priority !== false && postPolicy?.dialogue_ducking?.enabled !== false;
  const languageIds = new Set(["bus-post-dx", "bus-post-vo", "bus-post-adr"]);
  const targetIds = new Set(["bus-post-mx", "bus-post-fx", "bus-post-fol", "bus-post-amb"]);
  const keyInput = ducking ? context.createGain() : null;
  const sidechains = new Map();
  for (const group of groups) {
    const nodes = outputs.get(group.id);
    const outputBusId = text(group.output_bus_id || "bus-master");
    const destination = outputBusId === "bus-master" ? masterDestination : inputs.get(outputBusId);
    if (!destination) throw new Error(`CREATIVE_MUSIC_GROUP_PREVIEW_OUTPUT_NOT_FOUND:${group.id}:${outputBusId}`);
    if (ducking && outputBusId === "bus-master" && languageIds.has(group.id)) { nodes.analyser.connect(destination); nodes.analyser.connect(keyInput); continue; }
    if (ducking && outputBusId === "bus-master" && targetIds.has(group.id)) { const sidechain = createDialogueSidechainNode(context, postPolicy.dialogue_ducking || {}); nodes.analyser.connect(sidechain, 0, 0); keyInput.connect(sidechain, 0, 1); sidechain.connect(destination); sidechains.set(group.id, sidechain); continue; }
    nodes.analyser.connect(destination);
  }

  function destinationForTrack(track = {}) {
    const busId = text(track.output_bus_id || "bus-master");
    if (busId === "bus-master") return masterDestination;
    const destination = inputs.get(busId);
    if (!destination) throw new Error(`CREATIVE_MUSIC_GROUP_PREVIEW_TRACK_BUS_NOT_FOUND:${track.id}:${busId}`);
    return destination;
  }

  return {
    contract: "AVANTIQO_MUSIC_GROUP_BUS_PREVIEW_GRAPH_V3",
    group_count: groups.length,
    inputs,
    outputs,
    destinationForTrack,
    nested_group_routing: true,
    group_processing: true,
    post_fader_metering: true,
    dialogue_sidechain_applied: sidechains.size > 0,
    dialogue_sidechain_target_count: sidechains.size,
    dialogue_sidechain_linked_stereo: true,
    destructive_processing: false,
  };
}

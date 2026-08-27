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

export function createMusicGroupBusPreviewGraph(context, session, masterDestination) {
  const groups = (session?.buses || []).filter((bus) => bus.type === "group");
  const inputs = new Map();
  const outputs = new Map();

  for (const group of groups) {
    const input = context.createGain();
    const fader = context.createGain();
    fader.gain.value = group.mute === true ? 0 : dbToGain(group.gain_db);
    const pan = context.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, finite(group.pan, 0)));
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.35;
    input.connect(fader);
    fader.connect(pan);
    pan.connect(analyser);
    inputs.set(group.id, input);
    outputs.set(group.id, {
      input,
      fader,
      pan,
      analyser,
      scratch: new Float32Array(analyser.fftSize),
      bus: group,
    });
  }

  for (const group of groups) {
    const nodes = outputs.get(group.id);
    const outputBusId = text(group.output_bus_id || "bus-master");
    const destination = outputBusId === "bus-master"
      ? masterDestination
      : inputs.get(outputBusId);
    if (!destination) throw new Error(`CREATIVE_MUSIC_GROUP_PREVIEW_OUTPUT_NOT_FOUND:${group.id}:${outputBusId}`);
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
    contract: "AVANTIQO_MUSIC_GROUP_BUS_PREVIEW_GRAPH_V2",
    group_count: groups.length,
    inputs,
    outputs,
    destinationForTrack,
    nested_group_routing: true,
    post_fader_metering: true,
    destructive_processing: false,
  };
}

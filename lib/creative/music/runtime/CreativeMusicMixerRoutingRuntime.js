const CONTRACT = "AVANTIQO_MUSIC_MIXER_ROUTING_V2";

const AUX_TYPES = Object.freeze(["reverb", "delay"]);
const GROUP_LIMIT = 32;

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max, fallback = 0) {
  return Math.max(min, Math.min(max, finite(value, fallback)));
}

export function createMusicGroupBus(input = {}) {
  const id = text(input.id || `bus-group-${crypto.randomUUID()}`);
  if (id === "bus-master" || id === "bus-reverb" || id === "bus-delay") {
    throw new Error(`CREATIVE_MUSIC_GROUP_BUS_RESERVED_ID:${id}`);
  }
  return {
    contract: CONTRACT,
    id,
    type: "group",
    name: text(input.name || "Group").slice(0, 120),
    output_bus_id: text(input.output_bus_id || "bus-master"),
    gain_db: clamp(input.gain_db, -60, 12, 0),
    pan: clamp(input.pan, -1, 1, 0),
    mute: input.mute === true,
    solo: input.solo === true,
    color_token: text(input.color_token) || null,
    destructive_processing_allowed: false,
  };
}

export function createMusicAuxBus(input = {}) {
  const type = text(input.type || "reverb").toLowerCase();
  if (!AUX_TYPES.includes(type)) throw new Error(`CREATIVE_MUSIC_AUX_TYPE_INVALID:${type}`);
  const id = text(input.id || `bus-${type}`);
  const base = {
    contract: CONTRACT,
    id,
    type: "aux",
    effect_type: type,
    name: text(input.name || (type === "reverb" ? "Studio Reverb" : "Tempo Delay")).slice(0, 120),
    output_bus_id: text(input.output_bus_id || "bus-master"),
    gain_db: clamp(input.gain_db, -60, 12, 0),
    mute: input.mute === true,
    solo: input.solo === true,
    destructive_processing_allowed: false,
  };
  if (type === "reverb") {
    return {
      ...base,
      parameters: {
        pre_delay_ms: clamp(input.parameters?.pre_delay_ms, 0, 250, 18),
        decay_seconds: clamp(input.parameters?.decay_seconds, 0.1, 12, 2.2),
        damping_hz: clamp(input.parameters?.damping_hz, 1000, 20000, 8500),
        stereo_width: clamp(input.parameters?.stereo_width, 0, 1, 1),
        wet_db: clamp(input.parameters?.wet_db, -60, 12, -3),
      },
    };
  }
  return {
    ...base,
    parameters: {
      time_seconds: clamp(input.parameters?.time_seconds, 0.01, 2, 0.375),
      feedback: clamp(input.parameters?.feedback, 0, 0.92, 0.28),
      high_cut_hz: clamp(input.parameters?.high_cut_hz, 1000, 20000, 7000),
      low_cut_hz: clamp(input.parameters?.low_cut_hz, 20, 1000, 180),
      wet_db: clamp(input.parameters?.wet_db, -60, 12, -6),
    },
  };
}

export function createMusicSend(input = {}) {
  const busId = text(input.bus_id);
  if (!busId) throw new Error("CREATIVE_MUSIC_SEND_BUS_REQUIRED");
  return {
    contract: CONTRACT,
    id: text(input.id || `send-${crypto.randomUUID()}`),
    bus_id: busId,
    level_db: clamp(input.level_db, -60, 12, -18),
    enabled: input.enabled !== false,
    pre_fader: input.pre_fader === true,
    destructive_processing_allowed: false,
  };
}

export function ensureMusicEngineeringBuses(session = {}) {
  const next = structuredClone(session);
  next.buses = Array.isArray(next.buses) ? next.buses : [];
  if (!next.buses.some((bus) => bus.id === "bus-master")) {
    next.buses.unshift({ id: "bus-master", type: "master", name: "Master", gain_db: 0, pan: 0, mute: false, solo: false, true_peak_ceiling_dbtp: -1 });
  }
  if (!next.buses.some((bus) => bus.id === "bus-reverb")) {
    next.buses.push(createMusicAuxBus({ id: "bus-reverb", type: "reverb" }));
  }
  if (!next.buses.some((bus) => bus.id === "bus-delay")) {
    next.buses.push(createMusicAuxBus({ id: "bus-delay", type: "delay" }));
  }
  return next;
}

export function routeMusicTrackToBus(track = {}, busId = "bus-master") {
  const next = structuredClone(track);
  next.output_bus_id = text(busId || "bus-master");
  next.destructive_processing_allowed = false;
  return next;
}

export function upsertMusicGroupBus(session = {}, input = {}) {
  const next = ensureMusicEngineeringBuses(session);
  const group = createMusicGroupBus(input);
  const existing = next.buses.findIndex((bus) => bus.id === group.id);
  if (existing >= 0) {
    if (next.buses[existing].type !== "group") throw new Error(`CREATIVE_MUSIC_GROUP_BUS_ID_CONFLICT:${group.id}`);
    next.buses[existing] = { ...next.buses[existing], ...group };
  } else {
    if (next.buses.filter((bus) => bus.type === "group").length >= GROUP_LIMIT) {
      throw new Error(`CREATIVE_MUSIC_GROUP_BUS_LIMIT:${GROUP_LIMIT}`);
    }
    next.buses.push(group);
  }
  return next;
}

export function removeMusicGroupBus(session = {}, busId) {
  const id = text(busId);
  const next = ensureMusicEngineeringBuses(session);
  const group = next.buses.find((bus) => bus.id === id && bus.type === "group");
  if (!group) return next;
  for (const track of next.tracks || []) {
    if (track.output_bus_id === id) track.output_bus_id = "bus-master";
  }
  for (const bus of next.buses || []) {
    if (bus.output_bus_id === id) bus.output_bus_id = "bus-master";
  }
  next.buses = next.buses.filter((bus) => bus.id !== id);
  return next;
}

export function upsertMusicTrackSend(track = {}, input = {}) {
  const next = structuredClone(track);
  next.sends = Array.isArray(next.sends) ? next.sends : [];
  const busId = text(input.bus_id);
  const existing = next.sends.findIndex((send) => send.bus_id === busId);
  const send = createMusicSend(input);
  if (existing >= 0) next.sends[existing] = { ...next.sends[existing], ...send, id: next.sends[existing].id || send.id };
  else next.sends.push(send);
  next.destructive_processing_allowed = false;
  return next;
}

function assertNoBusCycles(session, busMap) {
  for (const bus of session.buses || []) {
    if (!["group", "aux"].includes(bus.type)) continue;
    const seen = new Set([bus.id]);
    let nextId = text(bus.output_bus_id || "bus-master");
    while (nextId && nextId !== "bus-master") {
      if (seen.has(nextId)) throw new Error(`CREATIVE_MUSIC_BUS_ROUTING_CYCLE:${bus.id}`);
      seen.add(nextId);
      const nextBus = busMap.get(nextId);
      if (!nextBus) break;
      nextId = text(nextBus.output_bus_id || "bus-master");
    }
  }
}

export function validateMusicMixerRouting(session = {}) {
  const buses = session.buses || [];
  const busMap = new Map();
  for (const bus of buses) {
    const busId = text(bus.id);
    if (!busId || busMap.has(busId)) throw new Error(`CREATIVE_MUSIC_MIXER_BUS_ID_INVALID:${busId}`);
    busMap.set(busId, bus);
  }
  if (!busMap.has("bus-master")) throw new Error("CREATIVE_MUSIC_MIXER_MASTER_BUS_REQUIRED");
  const groups = buses.filter((bus) => bus.type === "group");
  if (groups.length > GROUP_LIMIT) throw new Error(`CREATIVE_MUSIC_GROUP_BUS_LIMIT:${GROUP_LIMIT}`);

  for (const bus of buses) {
    if (bus.type === "aux" && !AUX_TYPES.includes(text(bus.effect_type))) {
      throw new Error(`CREATIVE_MUSIC_MIXER_AUX_INVALID:${bus.id}`);
    }
    if (bus.type === "group" && !text(bus.name)) throw new Error(`CREATIVE_MUSIC_GROUP_BUS_NAME_REQUIRED:${bus.id}`);
    if (["aux", "group"].includes(bus.type)) {
      const output = text(bus.output_bus_id || "bus-master");
      if (!busMap.has(output)) throw new Error(`CREATIVE_MUSIC_BUS_OUTPUT_NOT_FOUND:${bus.id}:${output}`);
      if (output === bus.id) throw new Error(`CREATIVE_MUSIC_BUS_ROUTING_CYCLE:${bus.id}`);
    }
    if (bus.destructive_processing_allowed === true) throw new Error("CREATIVE_MUSIC_MIXER_DESTRUCTIVE_BUS_FORBIDDEN");
  }
  assertNoBusCycles(session, busMap);

  for (const track of session.tracks || []) {
    const output = text(track.output_bus_id || "bus-master");
    if (!busMap.has(output)) throw new Error(`CREATIVE_MUSIC_TRACK_OUTPUT_BUS_NOT_FOUND:${track.id}:${output}`);
    if (busMap.get(output)?.type === "aux") throw new Error(`CREATIVE_MUSIC_TRACK_DIRECT_AUX_OUTPUT_FORBIDDEN:${track.id}:${output}`);
    for (const send of track.sends || []) {
      if (!busMap.has(text(send.bus_id))) throw new Error(`CREATIVE_MUSIC_SEND_BUS_NOT_FOUND:${send.bus_id}`);
      if (send.destructive_processing_allowed === true) throw new Error("CREATIVE_MUSIC_MIXER_DESTRUCTIVE_SEND_FORBIDDEN");
    }
  }
  return {
    success: true,
    contract: CONTRACT,
    aux_bus_count: buses.filter((bus) => bus.type === "aux").length,
    group_bus_count: groups.length,
    send_count: (session.tracks || []).reduce((sum, track) => sum + (track.sends || []).length, 0),
    routed_track_count: (session.tracks || []).filter((track) => text(track.output_bus_id || "bus-master") !== "bus-master").length,
    cycle_safe: true,
    non_destructive: true,
  };
}

export const CreativeMusicMixerRoutingRuntime = {
  contract: CONTRACT,
  auxTypes: AUX_TYPES,
  groupLimit: GROUP_LIMIT,
  createAuxBus: createMusicAuxBus,
  createGroupBus: createMusicGroupBus,
  createSend: createMusicSend,
  ensureBuses: ensureMusicEngineeringBuses,
  routeTrackToBus: routeMusicTrackToBus,
  upsertGroupBus: upsertMusicGroupBus,
  removeGroupBus: removeMusicGroupBus,
  upsertTrackSend: upsertMusicTrackSend,
  validate: validateMusicMixerRouting,
};

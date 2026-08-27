const CONTRACT = "AVANTIQO_MUSIC_MIXER_ROUTING_V1";

const AUX_TYPES = Object.freeze(["reverb", "delay"]);

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

export function validateMusicMixerRouting(session = {}) {
  const busIds = new Set((session.buses || []).map((bus) => text(bus.id)).filter(Boolean));
  if (!busIds.has("bus-master")) throw new Error("CREATIVE_MUSIC_MIXER_MASTER_BUS_REQUIRED");
  for (const bus of session.buses || []) {
    if (bus.type === "aux" && !AUX_TYPES.includes(text(bus.effect_type))) {
      throw new Error(`CREATIVE_MUSIC_MIXER_AUX_INVALID:${bus.id}`);
    }
    if (bus.destructive_processing_allowed === true) throw new Error("CREATIVE_MUSIC_MIXER_DESTRUCTIVE_BUS_FORBIDDEN");
  }
  for (const track of session.tracks || []) {
    for (const send of track.sends || []) {
      if (!busIds.has(text(send.bus_id))) throw new Error(`CREATIVE_MUSIC_SEND_BUS_NOT_FOUND:${send.bus_id}`);
      if (send.destructive_processing_allowed === true) throw new Error("CREATIVE_MUSIC_MIXER_DESTRUCTIVE_SEND_FORBIDDEN");
    }
  }
  return {
    success: true,
    contract: CONTRACT,
    aux_bus_count: (session.buses || []).filter((bus) => bus.type === "aux").length,
    send_count: (session.tracks || []).reduce((sum, track) => sum + (track.sends || []).length, 0),
    non_destructive: true,
  };
}

export const CreativeMusicMixerRoutingRuntime = {
  contract: CONTRACT,
  auxTypes: AUX_TYPES,
  createAuxBus: createMusicAuxBus,
  createSend: createMusicSend,
  ensureBuses: ensureMusicEngineeringBuses,
  upsertTrackSend: upsertMusicTrackSend,
  validate: validateMusicMixerRouting,
};

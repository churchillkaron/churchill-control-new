const CONTRACT = "AVANTIQO_MUSIC_ENGINEERING_INSERT_V1";
const INSERT_TYPES = Object.freeze(["gate", "deesser", "saturation"]);

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

export function createMusicInsert(input = {}) {
  const type = text(input.type).toLowerCase();
  if (!INSERT_TYPES.includes(type)) throw new Error(`CREATIVE_MUSIC_INSERT_TYPE_INVALID:${type}`);
  const common = {
    contract: CONTRACT,
    id: text(input.id || `insert-${type}-${crypto.randomUUID()}`),
    type,
    enabled: input.enabled !== false,
    bypass: input.bypass === true,
    destructive_processing_allowed: false,
  };
  if (type === "gate") {
    return {
      ...common,
      parameters: {
        threshold_db: clamp(input.parameters?.threshold_db, -90, -5, -48),
        range_db: clamp(input.parameters?.range_db, -90, 0, -60),
        attack_ms: clamp(input.parameters?.attack_ms, 0.1, 100, 2),
        release_ms: clamp(input.parameters?.release_ms, 5, 2000, 140),
        hold_ms: clamp(input.parameters?.hold_ms, 0, 500, 35),
      },
    };
  }
  if (type === "deesser") {
    return {
      ...common,
      parameters: {
        frequency_hz: clamp(input.parameters?.frequency_hz, 2500, 12000, 6500),
        threshold_db: clamp(input.parameters?.threshold_db, -60, 0, -26),
        ratio: clamp(input.parameters?.ratio, 1, 12, 4),
        max_reduction_db: clamp(input.parameters?.max_reduction_db, 0, 18, 8),
        attack_ms: clamp(input.parameters?.attack_ms, 0.1, 30, 1.5),
        release_ms: clamp(input.parameters?.release_ms, 10, 500, 85),
      },
    };
  }
  return {
    ...common,
    parameters: {
      drive_db: clamp(input.parameters?.drive_db, 0, 24, 3),
      mix: clamp(input.parameters?.mix, 0, 1, 0.18),
      output_db: clamp(input.parameters?.output_db, -18, 12, 0),
    },
  };
}

export function upsertMusicInsert(track = {}, input = {}) {
  const next = structuredClone(track);
  next.inserts = Array.isArray(next.inserts) ? next.inserts : [];
  const insert = createMusicInsert(input);
  const index = next.inserts.findIndex((entry) => entry.id === insert.id || entry.type === insert.type);
  if (index >= 0) next.inserts[index] = { ...next.inserts[index], ...insert, id: next.inserts[index].id || insert.id };
  else next.inserts.push(insert);
  next.destructive_processing_allowed = false;
  return next;
}

export function removeMusicInsert(track = {}, insertId) {
  const next = structuredClone(track);
  next.inserts = (next.inserts || []).filter((insert) => insert.id !== insertId);
  next.destructive_processing_allowed = false;
  return next;
}

export function validateMusicInserts(track = {}) {
  for (const insert of track.inserts || []) {
    if (!INSERT_TYPES.includes(text(insert.type))) throw new Error(`CREATIVE_MUSIC_INSERT_TYPE_INVALID:${insert.type}`);
    if (insert.destructive_processing_allowed === true) throw new Error("CREATIVE_MUSIC_INSERT_DESTRUCTIVE_FORBIDDEN");
  }
  return {
    success: true,
    contract: CONTRACT,
    insert_count: (track.inserts || []).length,
    supported_types: [...INSERT_TYPES],
    non_destructive: true,
  };
}

export const CreativeMusicInsertRuntime = {
  contract: CONTRACT,
  insertTypes: INSERT_TYPES,
  create: createMusicInsert,
  upsert: upsertMusicInsert,
  remove: removeMusicInsert,
  validate: validateMusicInserts,
};

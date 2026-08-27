const CONTRACT = "AVANTIQO_MUSIC_SAMPLER_PROJECT_V2";
const LEGACY_CONTRACT = "AVANTIQO_MUSIC_SAMPLER_PROJECT_V1";
const KIT_CONTRACT = "AVANTIQO_MUSIC_SAMPLER_KIT_V2";
const LEGACY_KIT_CONTRACT = "AVANTIQO_MUSIC_SAMPLER_KIT_V1";
const PAD_CONTRACT = "AVANTIQO_MUSIC_SAMPLER_PAD_V2";
const LEGACY_PAD_CONTRACT = "AVANTIQO_MUSIC_SAMPLER_PAD_V1";
const LAYER_CONTRACT = "AVANTIQO_MUSIC_SAMPLER_LAYER_V1";

const DEFAULT_DRUM_PADS = Object.freeze([
  [36, "Kick"], [37, "Side Stick"], [38, "Snare"], [39, "Clap"],
  [40, "Snare 2"], [41, "Low Tom"], [42, "Closed Hat"], [43, "Low Mid Tom"],
  [44, "Pedal Hat"], [45, "High Mid Tom"], [46, "Open Hat"], [47, "High Tom"],
  [48, "Tom 4"], [49, "Crash"], [50, "Tom 5"], [51, "Ride"],
]);

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function clamp(value, min, max, fallback = min) { return Math.max(min, Math.min(max, finite(value, fallback))); }
function id(value, prefix) { return text(value) || `${prefix}-${crypto.randomUUID()}`; }

export function createMusicSamplerLayer(input = {}) {
  const velocityMin = Math.round(clamp(input.velocity_min, 1, 127, 1));
  const velocityMax = Math.round(clamp(input.velocity_max, velocityMin, 127, 127));
  return {
    contract: LAYER_CONTRACT,
    id: id(input.id, "sampler-layer"),
    sample_asset_id: text(input.sample_asset_id) || null,
    sample_name: text(input.sample_name) || null,
    velocity_min: velocityMin,
    velocity_max: velocityMax,
    gain_db: clamp(input.gain_db, -24, 24, 0),
    tune_semitones: clamp(input.tune_semitones, -24, 24, 0),
    round_robin_group: text(input.round_robin_group || "default"),
    round_robin_index: Math.max(0, Math.round(finite(input.round_robin_index, 0))),
    probability: clamp(input.probability, 0, 1, 1),
    enabled: input.enabled !== false,
    preserve_source_asset: true,
    destructive_edit: false,
  };
}

function legacyLayerFromPad(input = {}) {
  const assetId = text(input.sample_asset_id);
  if (!assetId) return [];
  return [createMusicSamplerLayer({
    id: `${text(input.id) || "sampler-pad"}-legacy-layer`,
    sample_asset_id: assetId,
    sample_name: text(input.sample_name) || null,
    velocity_min: 1,
    velocity_max: 127,
    round_robin_group: "default",
    round_robin_index: 0,
  })];
}

export function createMusicSamplerPad(input = {}) {
  const midiPitch = Math.round(clamp(input.midi_pitch, 0, 127, 36));
  const layers = (Array.isArray(input.layers) && input.layers.length ? input.layers : legacyLayerFromPad(input)).map(createMusicSamplerLayer);
  const primary = layers.find((layer) => layer.enabled !== false && layer.sample_asset_id) || null;
  return {
    contract: PAD_CONTRACT,
    id: id(input.id, "sampler-pad"),
    midi_pitch: midiPitch,
    name: text(input.name || `Pad ${midiPitch}`).slice(0, 80),
    sample_asset_id: primary?.sample_asset_id || text(input.sample_asset_id) || null,
    sample_name: primary?.sample_name || text(input.sample_name) || null,
    layers,
    gain_db: clamp(input.gain_db, -60, 18, 0),
    pan: clamp(input.pan, -1, 1, 0),
    tune_semitones: clamp(input.tune_semitones, -24, 24, 0),
    start_offset_seconds: Math.max(0, finite(input.start_offset_seconds, 0)),
    end_offset_seconds: input.end_offset_seconds === null || input.end_offset_seconds === undefined
      ? null
      : Math.max(0, finite(input.end_offset_seconds, 0)),
    attack_ms: clamp(input.attack_ms, 0, 5000, 0),
    release_ms: clamp(input.release_ms, 0, 10000, 80),
    velocity_to_gain: clamp(input.velocity_to_gain, 0, 1, 1),
    one_shot: input.one_shot !== false,
    reverse: input.reverse === true,
    choke_group: text(input.choke_group) || null,
    round_robin_enabled: input.round_robin_enabled !== false,
    velocity_layering_enabled: input.velocity_layering_enabled !== false,
    preserve_source_asset: true,
    destructive_edit: false,
  };
}

export function createMusicSamplerKit(input = {}) {
  const sourcePads = Array.isArray(input.pads) && input.pads.length
    ? input.pads
    : DEFAULT_DRUM_PADS.map(([midi_pitch, name]) => ({ midi_pitch, name }));
  const pads = sourcePads.map(createMusicSamplerPad);
  return {
    contract: KIT_CONTRACT,
    id: id(input.id, "sampler-kit"),
    name: text(input.name || "Avantiqo Drum Rack").slice(0, 120),
    kind: text(input.kind || "drum_rack").toLowerCase(),
    pads,
    polyphony: Math.round(clamp(input.polyphony, 1, 128, 32)),
    master_gain_db: clamp(input.master_gain_db, -60, 12, 0),
    created_at: text(input.created_at || new Date().toISOString()),
    updated_at: new Date().toISOString(),
    owned_sampler: true,
    external_plugin_hosted: false,
    velocity_layers_supported: true,
    round_robin_supported: true,
    non_destructive: true,
  };
}

export function createMusicSamplerProject(input = {}) {
  const initialKit = input.create_default_kit === false ? null : createMusicSamplerKit(input.default_kit || {});
  return {
    contract: CONTRACT,
    kits: initialKit ? [initialKit] : [],
    selected_kit_id: initialKit?.id || null,
    sample_asset_ids: [],
    max_sample_assets: 512,
    velocity_layers_supported: true,
    round_robin_supported: true,
    non_destructive: true,
    preserve_original_samples: true,
    provider_job_submitted: false,
  };
}

export function ensureMusicSamplerProject(value = {}) {
  const compatible = value?.contract === CONTRACT || value?.contract === LEGACY_CONTRACT;
  const source = compatible ? structuredClone(value) : createMusicSamplerProject(value);
  source.contract = CONTRACT;
  if (!Array.isArray(source.kits)) source.kits = [];
  source.kits = source.kits.map((kit) => createMusicSamplerKit({ ...kit, contract: KIT_CONTRACT }));
  if (!Array.isArray(source.sample_asset_ids)) source.sample_asset_ids = [];
  if (!source.kits.length) {
    const kit = createMusicSamplerKit();
    source.kits.push(kit);
    source.selected_kit_id = kit.id;
  }
  if (!source.kits.some((kit) => kit.id === source.selected_kit_id)) source.selected_kit_id = source.kits[0]?.id || null;
  source.max_sample_assets = Math.round(clamp(source.max_sample_assets, 1, 4096, 512));
  source.velocity_layers_supported = true;
  source.round_robin_supported = true;
  source.non_destructive = true;
  source.preserve_original_samples = true;
  source.provider_job_submitted = false;
  return source;
}

export function updateMusicSamplerPad(kit = {}, midiPitch, patch = {}) {
  if (![KIT_CONTRACT, LEGACY_KIT_CONTRACT].includes(kit.contract)) throw new Error("CREATIVE_MUSIC_SAMPLER_KIT_CONTRACT_INVALID");
  const pitch = Math.round(clamp(midiPitch, 0, 127, 36));
  const next = createMusicSamplerKit(kit);
  const index = next.pads.findIndex((pad) => Math.round(finite(pad.midi_pitch, -1)) === pitch);
  if (index < 0) throw new Error("CREATIVE_MUSIC_SAMPLER_PAD_NOT_FOUND");
  next.pads[index] = createMusicSamplerPad({ ...next.pads[index], ...patch, id: next.pads[index].id, midi_pitch: pitch });
  next.updated_at = new Date().toISOString();
  return next;
}

export function assignMusicSamplerSample(kit = {}, midiPitch, asset = {}) {
  const assetId = text(asset.id || asset.asset_id);
  if (!assetId) throw new Error("CREATIVE_MUSIC_SAMPLER_SAMPLE_ASSET_REQUIRED");
  const name = text(asset.title || asset.name || asset.file_name || `Sample ${midiPitch}`);
  return updateMusicSamplerPad(kit, midiPitch, {
    sample_asset_id: assetId,
    sample_name: name,
    layers: [createMusicSamplerLayer({ sample_asset_id: assetId, sample_name: name, velocity_min: 1, velocity_max: 127 })],
  });
}

export function assignMusicSamplerLayer(kit = {}, midiPitch, asset = {}, options = {}) {
  const assetId = text(asset.id || asset.asset_id);
  if (!assetId) throw new Error("CREATIVE_MUSIC_SAMPLER_LAYER_ASSET_REQUIRED");
  const pitch = Math.round(clamp(midiPitch, 0, 127, 36));
  const next = createMusicSamplerKit(kit);
  const padIndex = next.pads.findIndex((pad) => Math.round(finite(pad.midi_pitch, -1)) === pitch);
  if (padIndex < 0) throw new Error("CREATIVE_MUSIC_SAMPLER_PAD_NOT_FOUND");
  const pad = next.pads[padIndex];
  const layer = createMusicSamplerLayer({
    ...options,
    sample_asset_id: assetId,
    sample_name: text(asset.title || asset.name || asset.file_name || `Sample ${midiPitch}`),
  });
  const layers = [...(pad.layers || []), layer].sort((a, b) => a.velocity_min - b.velocity_min || a.round_robin_index - b.round_robin_index);
  next.pads[padIndex] = createMusicSamplerPad({ ...pad, layers });
  next.updated_at = new Date().toISOString();
  return next;
}

export function removeMusicSamplerLayer(kit = {}, midiPitch, layerId) {
  const pitch = Math.round(clamp(midiPitch, 0, 127, 36));
  const next = createMusicSamplerKit(kit);
  const padIndex = next.pads.findIndex((pad) => Math.round(finite(pad.midi_pitch, -1)) === pitch);
  if (padIndex < 0) throw new Error("CREATIVE_MUSIC_SAMPLER_PAD_NOT_FOUND");
  const pad = next.pads[padIndex];
  const before = pad.layers?.length || 0;
  const layers = (pad.layers || []).filter((layer) => layer.id !== text(layerId));
  if (layers.length === before) throw new Error("CREATIVE_MUSIC_SAMPLER_LAYER_NOT_FOUND");
  next.pads[padIndex] = createMusicSamplerPad({ ...pad, layers, sample_asset_id: null, sample_name: null });
  next.updated_at = new Date().toISOString();
  return next;
}

export function selectMusicSamplerLayer(pad = {}, velocity = 100, roundRobinCounter = 0) {
  const normalized = createMusicSamplerPad(pad);
  const velocityValue = Math.round(clamp(velocity, 1, 127, 100));
  const eligible = (normalized.layers || []).filter((layer) => layer.enabled !== false && layer.sample_asset_id && layer.velocity_min <= velocityValue && layer.velocity_max >= velocityValue);
  if (!eligible.length) return null;
  const groups = new Map();
  for (const layer of eligible) {
    const group = text(layer.round_robin_group || "default");
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(layer);
  }
  const preferredGroup = groups.get("default") || groups.values().next().value || [];
  preferredGroup.sort((a, b) => a.round_robin_index - b.round_robin_index || a.id.localeCompare(b.id));
  if (!normalized.round_robin_enabled || preferredGroup.length <= 1) return preferredGroup[0] || null;
  return preferredGroup[Math.abs(Math.round(finite(roundRobinCounter, 0))) % preferredGroup.length] || preferredGroup[0] || null;
}

export function validateMusicSamplerProject(project = {}) {
  if (![CONTRACT, LEGACY_CONTRACT].includes(project.contract)) throw new Error("CREATIVE_MUSIC_SAMPLER_PROJECT_CONTRACT_INVALID");
  const normalized = ensureMusicSamplerProject(project);
  if (normalized.non_destructive !== true || normalized.preserve_original_samples !== true) throw new Error("CREATIVE_MUSIC_SAMPLER_NON_DESTRUCTIVE_REQUIRED");
  if (!Array.isArray(normalized.kits) || normalized.kits.length > 64) throw new Error("CREATIVE_MUSIC_SAMPLER_KIT_LIMIT_INVALID");
  const kitIds = new Set();
  const assetIds = new Set();
  let layerCount = 0;
  for (const kit of normalized.kits) {
    if (kit.contract !== KIT_CONTRACT || !kit.id || kitIds.has(kit.id) || kit.non_destructive !== true) throw new Error("CREATIVE_MUSIC_SAMPLER_KIT_INVALID");
    kitIds.add(kit.id);
    if (!Array.isArray(kit.pads) || kit.pads.length > 128) throw new Error("CREATIVE_MUSIC_SAMPLER_PAD_LIMIT_INVALID");
    const pitches = new Set();
    for (const pad of kit.pads) {
      const pitch = Math.round(finite(pad.midi_pitch, -1));
      if (pad.contract !== PAD_CONTRACT || pitch < 0 || pitch > 127 || pitches.has(pitch) || pad.destructive_edit === true || pad.preserve_source_asset !== true) throw new Error("CREATIVE_MUSIC_SAMPLER_PAD_INVALID");
      pitches.add(pitch);
      if (pad.end_offset_seconds !== null && finite(pad.end_offset_seconds, 0) <= finite(pad.start_offset_seconds, 0)) throw new Error("CREATIVE_MUSIC_SAMPLER_PAD_RANGE_INVALID");
      const layerIds = new Set();
      for (const layer of pad.layers || []) {
        layerCount += 1;
        if (layerCount > 4096 || layer.contract !== LAYER_CONTRACT || !layer.id || layerIds.has(layer.id) || layer.destructive_edit === true || layer.preserve_source_asset !== true) throw new Error("CREATIVE_MUSIC_SAMPLER_LAYER_INVALID");
        layerIds.add(layer.id);
        if (layer.velocity_min < 1 || layer.velocity_max > 127 || layer.velocity_min > layer.velocity_max) throw new Error("CREATIVE_MUSIC_SAMPLER_LAYER_VELOCITY_RANGE_INVALID");
        if (layer.sample_asset_id) assetIds.add(text(layer.sample_asset_id));
      }
    }
  }
  if (assetIds.size > Math.round(clamp(normalized.max_sample_assets, 1, 4096, 512))) throw new Error("CREATIVE_MUSIC_SAMPLER_SAMPLE_LIMIT_EXCEEDED");
  return {
    success: true,
    contract: "AVANTIQO_MUSIC_SAMPLER_VALIDATION_V2",
    kit_count: kitIds.size,
    sample_asset_count: assetIds.size,
    layer_count: layerCount,
    velocity_layers_supported: true,
    round_robin_supported: true,
    non_destructive: true,
    provider_job_submitted: false,
  };
}

export const CreativeMusicSamplerRuntime = {
  contract: CONTRACT,
  legacyContract: LEGACY_CONTRACT,
  kitContract: KIT_CONTRACT,
  padContract: PAD_CONTRACT,
  layerContract: LAYER_CONTRACT,
  defaultDrumPads: DEFAULT_DRUM_PADS,
  createProject: createMusicSamplerProject,
  ensureProject: ensureMusicSamplerProject,
  createKit: createMusicSamplerKit,
  createPad: createMusicSamplerPad,
  createLayer: createMusicSamplerLayer,
  updatePad: updateMusicSamplerPad,
  assignSample: assignMusicSamplerSample,
  assignLayer: assignMusicSamplerLayer,
  removeLayer: removeMusicSamplerLayer,
  selectLayer: selectMusicSamplerLayer,
  validate: validateMusicSamplerProject,
};

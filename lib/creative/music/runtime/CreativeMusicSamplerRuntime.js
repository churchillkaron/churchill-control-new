const CONTRACT = "AVANTIQO_MUSIC_SAMPLER_PROJECT_V1";
const KIT_CONTRACT = "AVANTIQO_MUSIC_SAMPLER_KIT_V1";
const PAD_CONTRACT = "AVANTIQO_MUSIC_SAMPLER_PAD_V1";

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

export function createMusicSamplerPad(input = {}) {
  const midiPitch = Math.round(clamp(input.midi_pitch, 0, 127, 36));
  return {
    contract: PAD_CONTRACT,
    id: id(input.id, "sampler-pad"),
    midi_pitch: midiPitch,
    name: text(input.name || `Pad ${midiPitch}`).slice(0, 80),
    sample_asset_id: text(input.sample_asset_id) || null,
    sample_name: text(input.sample_name) || null,
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
    non_destructive: true,
    preserve_original_samples: true,
    provider_job_submitted: false,
  };
}

export function ensureMusicSamplerProject(value = {}) {
  const source = value?.contract === CONTRACT ? structuredClone(value) : createMusicSamplerProject(value);
  if (!Array.isArray(source.kits)) source.kits = [];
  if (!Array.isArray(source.sample_asset_ids)) source.sample_asset_ids = [];
  if (!source.kits.length) {
    const kit = createMusicSamplerKit();
    source.kits.push(kit);
    source.selected_kit_id = kit.id;
  }
  if (!source.kits.some((kit) => kit.id === source.selected_kit_id)) source.selected_kit_id = source.kits[0]?.id || null;
  source.max_sample_assets = Math.round(clamp(source.max_sample_assets, 1, 4096, 512));
  source.non_destructive = true;
  source.preserve_original_samples = true;
  source.provider_job_submitted = false;
  return source;
}

export function updateMusicSamplerPad(kit = {}, midiPitch, patch = {}) {
  if (kit.contract !== KIT_CONTRACT) throw new Error("CREATIVE_MUSIC_SAMPLER_KIT_CONTRACT_INVALID");
  const pitch = Math.round(clamp(midiPitch, 0, 127, 36));
  const next = structuredClone(kit);
  const index = next.pads.findIndex((pad) => Math.round(finite(pad.midi_pitch, -1)) === pitch);
  if (index < 0) throw new Error("CREATIVE_MUSIC_SAMPLER_PAD_NOT_FOUND");
  next.pads[index] = createMusicSamplerPad({ ...next.pads[index], ...patch, id: next.pads[index].id, midi_pitch: pitch });
  next.updated_at = new Date().toISOString();
  return next;
}

export function assignMusicSamplerSample(kit = {}, midiPitch, asset = {}) {
  const assetId = text(asset.id || asset.asset_id);
  if (!assetId) throw new Error("CREATIVE_MUSIC_SAMPLER_SAMPLE_ASSET_REQUIRED");
  return updateMusicSamplerPad(kit, midiPitch, {
    sample_asset_id: assetId,
    sample_name: text(asset.title || asset.name || asset.file_name || `Sample ${midiPitch}`),
  });
}

export function validateMusicSamplerProject(project = {}) {
  if (project.contract !== CONTRACT) throw new Error("CREATIVE_MUSIC_SAMPLER_PROJECT_CONTRACT_INVALID");
  if (project.non_destructive !== true || project.preserve_original_samples !== true) throw new Error("CREATIVE_MUSIC_SAMPLER_NON_DESTRUCTIVE_REQUIRED");
  if (!Array.isArray(project.kits) || project.kits.length > 64) throw new Error("CREATIVE_MUSIC_SAMPLER_KIT_LIMIT_INVALID");
  const kitIds = new Set();
  const assetIds = new Set();
  for (const kit of project.kits) {
    if (kit.contract !== KIT_CONTRACT || !kit.id || kitIds.has(kit.id) || kit.non_destructive !== true) throw new Error("CREATIVE_MUSIC_SAMPLER_KIT_INVALID");
    kitIds.add(kit.id);
    if (!Array.isArray(kit.pads) || kit.pads.length > 128) throw new Error("CREATIVE_MUSIC_SAMPLER_PAD_LIMIT_INVALID");
    const pitches = new Set();
    for (const pad of kit.pads) {
      const pitch = Math.round(finite(pad.midi_pitch, -1));
      if (pad.contract !== PAD_CONTRACT || pitch < 0 || pitch > 127 || pitches.has(pitch) || pad.destructive_edit === true || pad.preserve_source_asset !== true) {
        throw new Error("CREATIVE_MUSIC_SAMPLER_PAD_INVALID");
      }
      pitches.add(pitch);
      if (pad.sample_asset_id) assetIds.add(text(pad.sample_asset_id));
      if (pad.end_offset_seconds !== null && finite(pad.end_offset_seconds, 0) <= finite(pad.start_offset_seconds, 0)) {
        throw new Error("CREATIVE_MUSIC_SAMPLER_PAD_RANGE_INVALID");
      }
    }
  }
  if (assetIds.size > Math.round(clamp(project.max_sample_assets, 1, 4096, 512))) throw new Error("CREATIVE_MUSIC_SAMPLER_SAMPLE_LIMIT_EXCEEDED");
  return {
    success: true,
    contract: "AVANTIQO_MUSIC_SAMPLER_VALIDATION_V1",
    kit_count: kitIds.size,
    sample_asset_count: assetIds.size,
    non_destructive: true,
    provider_job_submitted: false,
  };
}

export const CreativeMusicSamplerRuntime = {
  contract: CONTRACT,
  kitContract: KIT_CONTRACT,
  padContract: PAD_CONTRACT,
  defaultDrumPads: DEFAULT_DRUM_PADS,
  createProject: createMusicSamplerProject,
  ensureProject: ensureMusicSamplerProject,
  createKit: createMusicSamplerKit,
  createPad: createMusicSamplerPad,
  updatePad: updateMusicSamplerPad,
  assignSample: assignMusicSamplerSample,
  validate: validateMusicSamplerProject,
};

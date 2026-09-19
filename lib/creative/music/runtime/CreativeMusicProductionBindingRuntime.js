import { createHash } from "node:crypto";
import { validateMusicPreproductionBrief } from "./CreativeMusicCreativeDevelopmentRuntime.js";

const CONTRACT = "AVANTIQO_MUSIC_PRODUCTION_BINDING_V1";
function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
function hash(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}
function firstFinite(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}
function firstText(...values) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return "";
}
function compact(value) {
  if (Array.isArray(value)) return value.map((item) => compact(item)).filter(Boolean).join(", ");
  if (value && typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${compact(item)}`).filter((row) => !row.endsWith(": ")).join("; ");
  return text(value);
}
export function bindMusicPreproductionToGeneration({ input = {}, creative_floor = {} } = {}) {
  const floor = object(creative_floor);
  if (text(floor.status) !== "READY_FOR_PRODUCTION_CONFIRMATION") {
    throw new Error("CREATIVE_MUSIC_APPROVED_CREATIVE_FLOOR_REQUIRED");
  }
  const pre = object(floor.preproduction_brief);
  const concept = object(floor.winning_concept);
  const vocalContract = object(pre.vocal_contract);
  const vocalRequired = vocalContract.required === true;
  const validation = validateMusicPreproductionBrief(pre, { vocal_required: vocalRequired });
  if (!validation.passed) {
    throw new Error(`CREATIVE_MUSIC_PREPRODUCTION_INVALID:${validation.failures.join(",")}`);
  }
  const tempo = object(pre.tempo_map);
  const harmony = object(pre.key_and_harmony);
  const bpm = firstFinite(tempo.bpm, tempo.primary_bpm, tempo.tempo_bpm, ...Object.keys(tempo));
  const keyscale = firstText(harmony.keyscale, harmony.key, harmony.tonic_mode);
  const timesignature = firstText(tempo.timesignature, tempo.time_signature);
  const structure = compact(pre.form_and_section_lengths);
  const instrumentation = compact(pre.instrumentation);
  const style = firstText(compact(pre.sonic_palette), concept.sonic_identity, input.style);
  const mood = firstText(concept.emotional_arc, input.mood);
  const energy = firstText(compact(pre.dynamic_arc), input.energy);
  const direction_contract = {
    emotional_arc: concept.emotional_arc,
    motif_and_hook_system: concept.motif_and_hook_system,
    arrangement_arc: concept.arrangement_arc,
    performance_direction: pre.performance_direction,
    sonic_identity: concept.sonic_identity,
    dynamic_arc: pre.dynamic_arc,
    transition_map: pre.transition_map,
    mix_space_intent: pre.mix_space_intent,
    vocal_contract: vocalRequired ? vocalContract : null,
  };
  const binding = {
    contract: CONTRACT,
    creative_floor_contract: floor.contract || null,
    winning_concept_id: concept.id || floor.competition?.winner_concept_id || null,
    preproduction_hash: hash(pre),
    direction_hash: hash(direction_contract),
    preproduction_brief: pre,
    direction_contract,
  };
  const boundInput = { ...input };
  if (bpm !== null) boundInput.bpm = bpm;
  if (keyscale) boundInput.keyscale = keyscale;
  if (timesignature) boundInput.timesignature = timesignature;
  if (structure) boundInput.structure = structure;
  if (instrumentation) boundInput.instrumentation = instrumentation;
  if (style) boundInput.style = style;
  if (mood) boundInput.mood = mood;
  if (energy) boundInput.energy = energy;
  if (vocalRequired) {
    boundInput.instrumental = false;
    boundInput.lyrics = text(vocalContract.lyrics);
    boundInput.vocal_language = text(vocalContract.vocal_language || input.vocal_language || "english").toLowerCase();
    boundInput.vocal_delivery = text(vocalContract.vocal_delivery) || null;
  }
  boundInput.music_direction_contract = direction_contract;
  boundInput.music_production_binding = binding;
  return Object.freeze({ input: boundInput, binding });
}

export const CreativeMusicProductionBindingRuntime = Object.freeze({
  contract: CONTRACT,
  bind: bindMusicPreproductionToGeneration,
});

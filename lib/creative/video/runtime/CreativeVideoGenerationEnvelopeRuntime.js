import crypto from "node:crypto";

export const CREATIVE_VIDEO_GENERATION_ENVELOPE_CONTRACT = "CREATIVE_VIDEO_GENERATION_ENVELOPE_V1";

function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return String(value ?? "").trim(); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}
function digest(value) { return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }

export function buildCreativeVideoGenerationEnvelope(input = {}) {
  const shotBible = object(input.shot_bible);
  const cinematicDna = object(shotBible.cinematic?.dna || shotBible.cinematic_dna || input.requirements?.cinematic_dna);
  if (shotBible.contract !== "CREATIVE_SHOT_BIBLE_V1") throw new Error("CREATIVE_VIDEO_ENVELOPE_SHOT_BIBLE_REQUIRED");
  if (cinematicDna.contract !== "CREATIVE_SHOT_CINEMATIC_DNA_V1") throw new Error("CREATIVE_VIDEO_ENVELOPE_CINEMATIC_DNA_REQUIRED");
  const nativeControl = object(input.metadata?.creative_video_native_control);
  const body = {
    contract: CREATIVE_VIDEO_GENERATION_ENVELOPE_CONTRACT,
    source_of_truth: "STRUCTURED_ONLY",
    shot_id: text(shotBible.shot_id),
    shot_bible_contract: shotBible.contract,
    cinematic_dna: cinematicDna,
    frame_design: object(shotBible.cinematic?.frame_design),
    visual_state_conditioning: object(shotBible.cinematic?.visual_state_conditioning),
    story: object(shotBible.story),
    cinematic: object(shotBible.cinematic),
    environment: object(shotBible.environment),
    camera: object(shotBible.camera),
    frame_plan: object(shotBible.frame_plan),
    lighting: object(shotBible.lighting),
    audio: object(shotBible.audio),
    constraints: object(shotBible.constraints),
    quality: object(shotBible.quality),
    output: object(shotBible.output),
    native_control: nativeControl,
    reference_asset_ids: list(shotBible.source?.reference_asset_ids),
    provider_prompt_is_source_of_truth: false,
    transient_text_serialization_allowed: true,
  };
  return Object.freeze({ ...body, envelope_hash: digest(body) });
}

export function assertCreativeVideoGenerationEnvelope(envelope = {}) {
  if (envelope.contract !== CREATIVE_VIDEO_GENERATION_ENVELOPE_CONTRACT) throw new Error("CREATIVE_VIDEO_GENERATION_ENVELOPE_REQUIRED");
  const { envelope_hash: provided, ...body } = envelope;
  if (!text(provided) || provided !== digest(body)) throw new Error("CREATIVE_VIDEO_GENERATION_ENVELOPE_HASH_INVALID");
  if (body.source_of_truth !== "STRUCTURED_ONLY" || body.provider_prompt_is_source_of_truth !== false) throw new Error("CREATIVE_VIDEO_GENERATION_ENVELOPE_AUTHORITY_INVALID");
  return envelope;
}

export const CreativeVideoGenerationEnvelopeRuntime = Object.freeze({
  contract: CREATIVE_VIDEO_GENERATION_ENVELOPE_CONTRACT,
  build: buildCreativeVideoGenerationEnvelope,
  assert: assertCreativeVideoGenerationEnvelope,
});

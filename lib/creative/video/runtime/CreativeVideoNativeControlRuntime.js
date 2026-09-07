const CONTRACT = "CREATIVE_VIDEO_NATIVE_CONTROL_V1";

function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = null) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function candidate(value) {
  if (!value) return null;
  if (typeof value === "string") return text(value) || null;
  if (typeof value !== "object") return null;
  if (value.url || value.asset_id || value.assetId || value.id || value.storage_reference || value.storageReference || value.image_url || value.imageUrl || value.file_url || value.fileUrl) return value;
  return candidate(value.reference || value.asset || value.image || value.source || value.frame);
}
function sourceAsset(reference, role) {
  if (!reference) return null;
  if (typeof reference === "object") return { ...reference, role: text(role || reference.role || "SOURCE_REFERENCE") };
  const value = text(reference);
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? { url: value, role } : { asset_id: value, role };
}
function sourceAssetKey(value = {}) { return text(value.asset_id || value.assetId || value.id || value.url || value.file_url || value.fileUrl || value.storage_reference || value.storageReference); }
function framePlan(shotBible = {}) { return object(shotBible.frame_plan); }
function openingFrame(input = {}, shotBible = {}) {
  const plan = framePlan(shotBible);
  return candidate(input.first_frame || input.firstFrame || input.provider_parameters?.first_frame || input.provider_parameters?.firstFrame || plan.opening_frame || plan.openingFrame || input.source_image || input.sourceImage || input.image || input.source);
}
function closingFrame(input = {}, shotBible = {}) {
  const plan = framePlan(shotBible);
  return candidate(input.last_frame || input.lastFrame || input.provider_parameters?.last_frame || input.provider_parameters?.lastFrame || plan.closing_frame || plan.closingFrame);
}
function normalizedKeyframe(value, index) {
  const source = object(value);
  const reference = candidate(source.reference || source.asset || source.image || source.source || source.frame || source);
  if (!reference) return null;
  const frameIndex = finite(source.frame_index ?? source.frameIndex ?? source.index);
  const frameFraction = finite(source.frame_fraction ?? source.frameFraction ?? source.fraction ?? source.position);
  return { reference, frame_index: frameIndex, frame_fraction: frameFraction === null ? null : Math.max(0, Math.min(1, frameFraction)), strength: Math.max(0, Math.min(1, finite(source.strength, 1))), crf: Math.max(0, Math.min(63, Math.floor(finite(source.crf, 0)))), role: text(source.role || `SHOT_BIBLE_KEYFRAME_${index + 1}`) };
}
function keyframes(input = {}, shotBible = {}) {
  const plan = framePlan(shotBible);
  const values = [...list(input.keyframes), ...list(input.key_frames), ...list(input.provider_parameters?.keyframes), ...list(plan.keyframes), ...list(plan.key_frames), ...list(plan.keyFrames)];
  const normalized = values.map(normalizedKeyframe).filter(Boolean);
  const seen = new Set();
  return normalized.filter((item) => {
    const reference = item.reference;
    const referenceKey = typeof reference === "string" ? reference : text(reference?.url || reference?.asset_id || reference?.assetId || reference?.id || reference?.storage_reference || reference?.storageReference);
    const position = item.frame_index ?? item.frame_fraction ?? "auto";
    const key = `${referenceKey}:${position}`;
    if (!referenceKey || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}
function audioRequired(shotBible = {}) {
  const audio = object(shotBible.audio);
  return Boolean(list(audio.dialogue).length || Object.keys(object(audio.narration)).length || Object.keys(object(audio.audio)).length || Object.keys(object(audio.music)).length || list(audio.sound_effects).length || Object.keys(object(audio.sound_design)).length);
}
function referenceConditions(opening, closing, shotKeyframes) {
  const conditions = [];
  if (opening) conditions.push({ reference: opening, role: "OPENING_FRAME", frame_index: 0, frame_fraction: 0, strength: 1, crf: 0 });
  for (const item of shotKeyframes) conditions.push(item);
  if (closing) conditions.push({ reference: closing, role: "CLOSING_FRAME", frame_index: null, frame_fraction: 1, strength: 1, crf: 0 });
  return conditions.slice(0, 8);
}
function filmCraftReferences(shotBible = {}, input = {}) {
  const craft = object(input.professional_filmcraft || shotBible.professional_filmcraft);
  const movement = object(craft.movement_choreography);
  const performance = object(craft.performance_control);
  const values = [];
  const motion = candidate(movement.motion_reference_asset_id || movement.motion_reference);
  const acting = candidate(performance.performance_reference_asset_id || performance.performance_reference);
  if (motion) values.push({ reference: motion, role: "CAMERA_MOTION_REFERENCE" });
  if (acting) values.push({ reference: acting, role: "PERFORMANCE_REFERENCE" });
  return values;
}
function mergedSourceAssets(input = {}, conditions = [], craftReferences = []) {
  const values = [
    ...list(input.source_assets).map((item) => sourceAsset(item, typeof item === "object" ? item.role : "SOURCE_REFERENCE")).filter(Boolean),
    ...conditions.map((item) => sourceAsset(item.reference, item.role)).filter(Boolean),
    ...craftReferences.map((item) => sourceAsset(item.reference, item.role)).filter(Boolean),
  ];
  const seen = new Set();
  return values.filter((item) => {
    const key = `${sourceAssetKey(item)}:${text(item.role)}`;
    if (!sourceAssetKey(item) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function applyCreativeVideoNativeControls(input = {}) {
  const shotBible = object(input.shot_bible);
  if (shotBible.contract !== "CREATIVE_SHOT_BIBLE_V1") return input;
  const opening = openingFrame(input, shotBible);
  const closing = closingFrame(input, shotBible);
  const shotKeyframes = keyframes(input, shotBible);
  const conditions = referenceConditions(opening, closing, shotKeyframes);
  const craftReferences = filmCraftReferences(shotBible, input);
  const output = object(shotBible.output);
  const generation = object(input.generation);
  const providerParameters = object(input.provider_parameters);
  const nativeAudioRequired = audioRequired(shotBible);
  const sourceAssets = mergedSourceAssets(input, conditions, craftReferences);
  const cameraMotionReferenceBound = craftReferences.some((item) => item.role === "CAMERA_MOTION_REFERENCE");
  const performanceReferenceBound = craftReferences.some((item) => item.role === "PERFORMANCE_REFERENCE");
  return {
    ...input,
    ...(opening ? { first_frame: opening, source_image: input.source_image || input.sourceImage || opening } : {}),
    ...(closing ? { last_frame: closing } : {}),
    ...(shotKeyframes.length ? { keyframes: shotKeyframes } : {}),
    source_assets: sourceAssets,
    generation: {
      ...generation,
      duration_seconds: finite(output.duration_seconds) || finite(generation.duration_seconds) || finite(input.duration_seconds) || 5,
      fps: finite(output.frame_rate) || finite(output.fps) || finite(generation.fps) || finite(input.fps) || 24,
      resolution: text(output.resolution) || text(generation.resolution) || text(input.resolution) || null,
      aspect_ratio: text(output.aspect_ratio) || text(generation.aspect_ratio) || text(input.aspect_ratio) || "16:9",
      generate_audio: nativeAudioRequired || generation.generate_audio === true,
      provider_parameters: {
        ...object(generation.provider_parameters), ...providerParameters,
        native_control_contract: CONTRACT,
        first_frame_required: Boolean(opening), last_frame_required: Boolean(closing), keyframe_count: shotKeyframes.length,
        native_audio_required: nativeAudioRequired,
        camera_motion_reference_required: cameraMotionReferenceBound,
        performance_reference_required: performanceReferenceBound,
      },
    },
    metadata: {
      ...object(input.metadata),
      creative_video_native_control: {
        contract: CONTRACT,
        first_frame_bound: Boolean(opening), last_frame_bound: Boolean(closing), keyframe_count: shotKeyframes.length,
        reference_condition_count: conditions.length,
        reference_conditions: conditions.map((item, index) => ({ source_asset_index: index, role: item.role, frame_index: item.frame_index, frame_fraction: item.frame_fraction, strength: item.strength, crf: item.crf })),
        craft_reference_count: craftReferences.length,
        craft_reference_roles: craftReferences.map((item) => item.role),
        camera_motion_reference_bound: cameraMotionReferenceBound,
        performance_reference_bound: performanceReferenceBound,
        native_audio_required: nativeAudioRequired,
        source_assets_preserved: true,
        shot_bible_is_execution_source: true,
      },
    },
  };
}
export const CreativeVideoNativeControlRuntime = Object.freeze({
  contract: CONTRACT, apply: applyCreativeVideoNativeControls, openingFrame, closingFrame, keyframes, audioRequired, referenceConditions, filmCraftReferences, mergedSourceAssets,
});

const CONTRACT = "CREATIVE_VIDEO_NATIVE_CONTROL_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function candidate(value) {
  if (!value) return null;
  if (typeof value === "string") return text(value) || null;
  if (typeof value !== "object") return null;
  if (
    value.url || value.asset_id || value.assetId || value.id ||
    value.storage_reference || value.storageReference ||
    value.image_url || value.imageUrl || value.file_url || value.fileUrl
  ) {
    return value;
  }
  return candidate(
    value.reference ||
    value.asset ||
    value.image ||
    value.source ||
    value.frame,
  );
}

function framePlan(shotBible = {}) {
  return object(shotBible.frame_plan);
}

function openingFrame(input = {}, shotBible = {}) {
  const plan = framePlan(shotBible);
  return candidate(
    input.first_frame ||
    input.firstFrame ||
    input.provider_parameters?.first_frame ||
    input.provider_parameters?.firstFrame ||
    plan.opening_frame ||
    plan.openingFrame ||
    input.source_image ||
    input.sourceImage ||
    input.image ||
    input.source,
  );
}

function closingFrame(input = {}, shotBible = {}) {
  const plan = framePlan(shotBible);
  return candidate(
    input.last_frame ||
    input.lastFrame ||
    input.provider_parameters?.last_frame ||
    input.provider_parameters?.lastFrame ||
    plan.closing_frame ||
    plan.closingFrame,
  );
}

function normalizedKeyframe(value, index) {
  const source = object(value);
  const reference = candidate(
    source.reference ||
    source.asset ||
    source.image ||
    source.source ||
    source.frame ||
    source,
  );
  if (!reference) return null;
  const frameIndex = finite(
    source.frame_index ?? source.frameIndex ?? source.index,
  );
  const frameFraction = finite(
    source.frame_fraction ?? source.frameFraction ?? source.fraction ?? source.position,
  );
  return {
    reference,
    frame_index: frameIndex,
    frame_fraction:
      frameFraction === null ? null : Math.max(0, Math.min(1, frameFraction)),
    strength: Math.max(0, Math.min(1, finite(source.strength, 1))),
    crf: Math.max(0, Math.min(63, Math.floor(finite(source.crf, 0)))),
    role: text(source.role || `SHOT_BIBLE_KEYFRAME_${index + 1}`),
  };
}

function keyframes(input = {}, shotBible = {}) {
  const plan = framePlan(shotBible);
  const values = [
    ...list(input.keyframes),
    ...list(input.key_frames),
    ...list(input.provider_parameters?.keyframes),
    ...list(plan.keyframes),
    ...list(plan.key_frames),
    ...list(plan.keyFrames),
  ];
  const normalized = values
    .map(normalizedKeyframe)
    .filter(Boolean);
  const seen = new Set();
  return normalized.filter((item) => {
    const reference = item.reference;
    const referenceKey = typeof reference === "string"
      ? reference
      : text(
          reference?.url ||
          reference?.asset_id ||
          reference?.assetId ||
          reference?.id ||
          reference?.storage_reference ||
          reference?.storageReference,
        );
    const position = item.frame_index ?? item.frame_fraction ?? "auto";
    const key = `${referenceKey}:${position}`;
    if (!referenceKey || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}

function audioRequired(shotBible = {}) {
  const audio = object(shotBible.audio);
  return Boolean(
    list(audio.dialogue).length ||
    Object.keys(object(audio.narration)).length ||
    Object.keys(object(audio.audio)).length ||
    Object.keys(object(audio.music)).length ||
    list(audio.sound_effects).length ||
    Object.keys(object(audio.sound_design)).length
  );
}

export function applyCreativeVideoNativeControls(input = {}) {
  const shotBible = object(input.shot_bible);
  if (shotBible.contract !== "CREATIVE_SHOT_BIBLE_V1") return input;

  const opening = openingFrame(input, shotBible);
  const closing = closingFrame(input, shotBible);
  const shotKeyframes = keyframes(input, shotBible);
  const output = object(shotBible.output);
  const generation = object(input.generation);
  const providerParameters = object(input.provider_parameters);
  const nativeAudioRequired = audioRequired(shotBible);

  return {
    ...input,
    ...(opening ? {
      first_frame: opening,
      source_image: input.source_image || input.sourceImage || opening,
    } : {}),
    ...(closing ? { last_frame: closing } : {}),
    ...(shotKeyframes.length ? { keyframes: shotKeyframes } : {}),
    generation: {
      ...generation,
      duration_seconds:
        finite(output.duration_seconds) ||
        finite(generation.duration_seconds) ||
        finite(input.duration_seconds) ||
        5,
      fps:
        finite(output.frame_rate) ||
        finite(output.fps) ||
        finite(generation.fps) ||
        finite(input.fps) ||
        24,
      resolution:
        text(output.resolution) ||
        text(generation.resolution) ||
        text(input.resolution) ||
        null,
      aspect_ratio:
        text(output.aspect_ratio) ||
        text(generation.aspect_ratio) ||
        text(input.aspect_ratio) ||
        "16:9",
      generate_audio: nativeAudioRequired || generation.generate_audio === true,
      provider_parameters: {
        ...object(generation.provider_parameters),
        ...providerParameters,
        native_control_contract: CONTRACT,
        first_frame_required: Boolean(opening),
        last_frame_required: Boolean(closing),
        keyframe_count: shotKeyframes.length,
        native_audio_required: nativeAudioRequired,
      },
    },
    metadata: {
      ...object(input.metadata),
      creative_video_native_control: {
        contract: CONTRACT,
        first_frame_bound: Boolean(opening),
        last_frame_bound: Boolean(closing),
        keyframe_count: shotKeyframes.length,
        native_audio_required: nativeAudioRequired,
        shot_bible_is_execution_source: true,
      },
    },
  };
}

export const CreativeVideoNativeControlRuntime = Object.freeze({
  contract: CONTRACT,
  apply: applyCreativeVideoNativeControls,
  openingFrame,
  closingFrame,
  keyframes,
  audioRequired,
});

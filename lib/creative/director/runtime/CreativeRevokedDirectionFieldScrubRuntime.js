import {
  CreativeUniversalTemporalDirectionRuntime,
} from "./CreativeUniversalTemporalDirectionRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.revoked-direction-field-scrub.v1",
);

const SHOT_DIRECTION_FIELDS = new Set([
  "title",
  "name",
  "purpose",
  "intent",
  "story_function",
  "narrative_function",
  "beat",
  "summary",
  "description",
  "direction",
  "visual_direction",
  "subject",
  "action",
  "performance",
  "opening_frame",
  "closing_frame",
  "frame_plan",
  "camera",
  "camera_movement",
  "camera_move",
  "framing",
  "shot_size",
  "composition",
  "production_design",
  "props",
  "location",
  "setting",
  "environment",
  "staging",
  "blocking",
  "lighting",
  "wardrobe",
  "art_direction",
  "sound_design",
  "transition",
  "transition_in",
  "transition_out",
]);

const SCENE_DIRECTION_FIELDS = new Set([
  "title",
  "name",
  "purpose",
  "intent",
  "objective",
  "story_function",
  "narrative_function",
  "beat",
  "summary",
  "description",
  "state_change",
  "location",
  "setting",
  "environment",
  "production_design",
  "lighting",
  "sound_design",
  "transition",
]);

const GENERATION_CONTENT_FIELDS = new Set([
  "prompt",
  "instruction",
  "instructions",
  "description",
  "direction",
  "visual_direction",
  "visual_prompt",
  "video_prompt",
  "negative_prompt",
  "subject",
  "action",
  "performance",
  "camera",
  "camera_direction",
  "composition",
  "production_design",
  "props",
  "location",
  "setting",
  "environment",
  "staging",
  "blocking",
  "lighting",
  "wardrobe",
  "sound_design",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function scrubObject(source, denied, evidence, path) {
  const output = {};
  for (const [key, value] of Object.entries(object(source))) {
    if (denied.has(key)) {
      evidence.removed_paths.push(`${path}.${key}`);
      continue;
    }
    output[key] = value;
  }
  return output;
}

function scrubProviderParameters(value, evidence, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const output = {};
  for (const [key, child] of Object.entries(value)) {
    const normalized = key
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replaceAll("-", "_")
      .toLowerCase();
    if (
      GENERATION_CONTENT_FIELDS.has(normalized) ||
      normalized.includes("prompt") ||
      normalized.includes("instruction") ||
      normalized.includes("narrative") ||
      normalized.includes("story") ||
      normalized.includes("visual_direction")
    ) {
      evidence.removed_paths.push(`${path}.${key}`);
      continue;
    }
    output[key] = child;
  }
  return output;
}

function scrubGeneration(generation, evidence, path) {
  const scrubbed = scrubObject(
    generation,
    GENERATION_CONTENT_FIELDS,
    evidence,
    path,
  );

  if (scrubbed.provider_parameters !== undefined) {
    scrubbed.provider_parameters = scrubProviderParameters(
      scrubbed.provider_parameters,
      evidence,
      `${path}.provider_parameters`,
    );
  }
  if (scrubbed.providerParameters !== undefined) {
    scrubbed.providerParameters = scrubProviderParameters(
      scrubbed.providerParameters,
      evidence,
      `${path}.providerParameters`,
    );
  }

  return scrubbed;
}

function scrubShot(shot, evidence, path) {
  const scrubbed = scrubObject(
    shot,
    SHOT_DIRECTION_FIELDS,
    evidence,
    path,
  );
  scrubbed.generation = scrubGeneration(
    shot?.generation,
    evidence,
    `${path}.generation`,
  );
  return scrubbed;
}

function scrubScene(scene, evidence, path) {
  const scrubbed = scrubObject(
    scene,
    SCENE_DIRECTION_FIELDS,
    evidence,
    path,
  );
  scrubbed.shots = list(scene?.shots).map((shot, shotIndex) =>
    scrubShot(shot, evidence, `${path}.shots.${shotIndex}`));
  return scrubbed;
}

export function scrubRevokedCreativeDirectionFields(plan = {}) {
  const evidence = {
    contract: "CREATIVE_REVOKED_DIRECTION_FIELD_SCRUB_V1",
    removed_paths: [],
    source_ids_preserved: true,
    timing_preserved: true,
    old_narrative_reuse_allowed: false,
    old_camera_reuse_allowed: false,
    old_generation_content_reuse_allowed: false,
  };

  const scenes = list(plan.scenes).map((scene, sceneIndex) =>
    scrubScene(scene, evidence, `plan.scenes.${sceneIndex}`));
  const scrubbed = {
    ...object(plan),
    scenes,
    metadata: {
      ...object(plan.metadata),
      revoked_direction_field_scrub: {
        contract: evidence.contract,
        removed_field_count: evidence.removed_paths.length,
        removed_paths: evidence.removed_paths.slice(0, 200),
        source_ids_preserved: true,
        timing_preserved: true,
      },
    },
  };

  return {
    plan: scrubbed,
    evidence: {
      ...evidence,
      removed_field_count: evidence.removed_paths.length,
      removed_paths: evidence.removed_paths.slice(0, 200),
    },
  };
}

function install() {
  if (CreativeUniversalTemporalDirectionRuntime[INSTALL_FLAG]) return;
  const createWithoutScrub =
    CreativeUniversalTemporalDirectionRuntime.create.bind(
      CreativeUniversalTemporalDirectionRuntime,
    );

  Object.defineProperty(
    CreativeUniversalTemporalDirectionRuntime,
    INSTALL_FLAG,
    { value: true, enumerable: false, configurable: false },
  );

  CreativeUniversalTemporalDirectionRuntime.create =
    async function createWithRevokedDirectionFieldScrub(input = {}) {
      const result = await createWithoutScrub(input);
      if (!result?.plan) return result;
      const scrubbed = scrubRevokedCreativeDirectionFields(result.plan);
      console.log(
        `CREATIVE_REVOKED_DIRECTION_FIELDS_SCRUBBED=${JSON.stringify({
          contract: scrubbed.evidence.contract,
          removed_field_count: scrubbed.evidence.removed_field_count,
          old_narrative_reuse_allowed: false,
          old_camera_reuse_allowed: false,
        })}`,
      );
      return {
        ...result,
        plan: scrubbed.plan,
        revoked_direction_field_scrub: scrubbed.evidence,
      };
    };
}

install();

export const CreativeRevokedDirectionFieldScrubRuntime = Object.freeze({
  installed: true,
  contract: "CREATIVE_REVOKED_DIRECTION_FIELD_SCRUB_V1",
  scrub: scrubRevokedCreativeDirectionFields,
});

import {
  CreativeUniversalTemporalDirectionRuntime,
} from "./CreativeUniversalTemporalDirectionRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.source-locked-identity-requirement-scrub.v1",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

const IDENTITY_GENERATION_KEYS = new Set([
  "profile_id",
  "profileId",
  "identity_profile_id",
  "identityProfileId",
  "identity_atlas_id",
  "identityAtlasId",
  "identity_keyframe_id",
  "identityKeyframeId",
  "identity_keyframe_required",
  "identityKeyframeRequired",
  "identity_generation_required",
  "identityGenerationRequired",
  "generate_identity_keyframe",
  "generateIdentityKeyframe",
  "materialize_identity_atlas",
  "materializeIdentityAtlas",
]);

function stripIdentityGenerationFields(value, evidence, path) {
  const output = {};
  for (const [key, child] of Object.entries(object(value))) {
    if (IDENTITY_GENERATION_KEYS.has(key)) {
      evidence.removed_paths.push(`${path}.${key}`);
      continue;
    }
    output[key] = child;
  }
  return output;
}

function scrubShot(shot, evidence, path) {
  const identityRequirements = stripIdentityGenerationFields(
    shot?.identity_requirements,
    evidence,
    `${path}.identity_requirements`,
  );
  const performanceContract = stripIdentityGenerationFields(
    shot?.performance_contract,
    evidence,
    `${path}.performance_contract`,
  );
  const metadata = stripIdentityGenerationFields(
    shot?.metadata,
    evidence,
    `${path}.metadata`,
  );
  const generation = stripIdentityGenerationFields(
    shot?.generation,
    evidence,
    `${path}.generation`,
  );

  return {
    ...object(shot),
    identity_requirements: {
      ...identityRequirements,
      reference_asset_ids: list(
        identityRequirements.reference_asset_ids ||
        identityRequirements.referenceAssetIds,
      ),
      source_identity_preservation_required: true,
      identity_generation_required: false,
      identity_keyframe_generation_required: false,
      identity_atlas_materialization_required: false,
    },
    performance_contract: {
      ...performanceContract,
      identity_generation_required: false,
      identity_keyframe_generation_required: false,
      audio_conditioned_lip_sync_required: false,
      lip_sync_required: false,
    },
    generation: {
      ...generation,
      identity_generation_required: false,
      identity_keyframe_generation_required: false,
    },
    metadata: {
      ...metadata,
      source_identity_preservation_required: true,
      identity_generation_authorized: false,
      identity_keyframe_generation_authorized: false,
    },
  };
}

export function scrubSourceLockedIdentityRequirements(plan = {}) {
  const evidence = {
    contract: "CREATIVE_SOURCE_LOCKED_IDENTITY_REQUIREMENT_SCRUB_V1",
    removed_paths: [],
    source_reference_ids_preserved: true,
    identity_generation_authorized: false,
    identity_keyframe_generation_authorized: false,
    identity_atlas_materialization_authorized: false,
  };

  const scenes = list(plan.scenes).map((scene, sceneIndex) => ({
    ...object(scene),
    shots: list(scene.shots).map((shot, shotIndex) =>
      scrubShot(
        shot,
        evidence,
        `plan.scenes.${sceneIndex}.shots.${shotIndex}`,
      )),
  }));

  const scrubbedPlan = {
    ...object(plan),
    scenes,
    production: {
      ...object(plan.production),
      identity_atlas_required: false,
      identity_generation_authorized: false,
      identity_keyframe_generation_authorized: false,
      source_identity_preservation_required: true,
    },
    metadata: {
      ...object(plan.metadata),
      source_locked_identity_requirement_scrub: {
        contract: evidence.contract,
        removed_field_count: evidence.removed_paths.length,
        removed_paths: evidence.removed_paths.slice(0, 200),
        source_reference_ids_preserved: true,
      },
    },
  };

  return {
    plan: scrubbedPlan,
    evidence: {
      ...evidence,
      removed_field_count: evidence.removed_paths.length,
      removed_paths: evidence.removed_paths.slice(0, 200),
    },
  };
}

function install() {
  if (CreativeUniversalTemporalDirectionRuntime[INSTALL_FLAG]) return;
  const createWithoutIdentityScrub =
    CreativeUniversalTemporalDirectionRuntime.create.bind(
      CreativeUniversalTemporalDirectionRuntime,
    );

  Object.defineProperty(
    CreativeUniversalTemporalDirectionRuntime,
    INSTALL_FLAG,
    { value: true, enumerable: false, configurable: false },
  );

  CreativeUniversalTemporalDirectionRuntime.create =
    async function createWithSourceLockedIdentityScrub(input = {}) {
      const result = await createWithoutIdentityScrub(input);
      if (!result?.plan) return result;
      const scrubbed = scrubSourceLockedIdentityRequirements(result.plan);
      console.log(
        `CREATIVE_SOURCE_LOCKED_IDENTITY_REQUIREMENTS_SCRUBBED=${JSON.stringify({
          contract: scrubbed.evidence.contract,
          removed_field_count: scrubbed.evidence.removed_field_count,
          identity_generation_authorized: false,
          identity_keyframe_generation_authorized: false,
        })}`,
      );
      return {
        ...result,
        plan: scrubbed.plan,
        source_locked_identity_requirement_scrub: scrubbed.evidence,
      };
    };
}

install();

export const CreativeSourceLockedIdentityRequirementScrubRuntime = Object.freeze({
  installed: true,
  contract: "CREATIVE_SOURCE_LOCKED_IDENTITY_REQUIREMENT_SCRUB_V1",
  scrub: scrubSourceLockedIdentityRequirements,
});

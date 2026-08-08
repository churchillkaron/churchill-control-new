import {
  CREATIVE_AGENCY_ROLES,
} from "@/lib/creative/director/registry/CreativeAgencyRoleRegistry";

export const CREATIVE_WORKFLOW_KINDS = Object.freeze([
  "TEMPORAL",
  "STILL",
  "DOCUMENT",
  "INTERACTIVE",
  "SOFTWARE",
  "AUDIO",
  "CAMPAIGN_SYSTEM",
]);

const ASSET_DISPOSITIONS = new Set([
  "ASSIGNED",
  "REFERENCE",
  "REGENERATE",
  "EXCLUDE",
]);

const GENERIC_DIRECTION = [
  /^scene\s+\d+$/i,
  /^shot\s+\d+$/i,
  /^n\/?a\.?$/i,
  /^none\.?$/i,
  /^not applicable\.?$/i,
  /^tbd\.?$/i,
  /^unspecified\.?$/i,
  /choose .* to support/i,
  /selected per scene/i,
  /premium and authentic/i,
  /professional$/i,
  /natural$/i,
  /soft$/i,
  /cinematic$/i,
  /compelling original production/i,
];

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

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function assetId(value) {
  if (typeof value === "string") return text(value);
  return text(value?.asset_id || value?.id);
}

function isGeneric(value) {
  const normalized = text(value);
  if (!normalized) return false;
  return GENERIC_DIRECTION.some((pattern) => pattern.test(normalized));
}

function push(failures, code, path, message, evidence = null) {
  failures.push({ code, path, message, evidence });
}

function requireText(failures, value, path, options = {}) {
  const normalized = text(value);
  if (!normalized) {
    push(failures, "REQUIRED_TEXT_MISSING", path, `${path} is required`);
    return;
  }
  if (options.rejectGeneric !== false && isGeneric(normalized)) {
    push(
      failures,
      "GENERIC_DIRECTION_REJECTED",
      path,
      `${path} contains generic placeholder direction`,
      normalized,
    );
  }
  if (options.minimum && normalized.length < options.minimum) {
    push(
      failures,
      "DIRECTION_TOO_SHALLOW",
      path,
      `${path} must contain at least ${options.minimum} characters of executable direction`,
      normalized,
    );
  }
}

function validateRoleDecisions(plan, failures) {
  const decisions = object(plan.role_decisions);
  for (const role of CREATIVE_AGENCY_ROLES) {
    const decision = object(decisions[role.id]);
    const status = text(decision.status).toUpperCase();
    if (!decision || !["ACTIVE", "NOT_REQUIRED"].includes(status)) {
      push(
        failures,
        "AGENCY_ROLE_DECISION_REQUIRED",
        `role_decisions.${role.id}`,
        `Role ${role.id} must explicitly be ACTIVE or NOT_REQUIRED`,
      );
      continue;
    }
    if (status === "ACTIVE") {
      requireText(
        failures,
        decision.decision,
        `role_decisions.${role.id}.decision`,
        { minimum: 20 },
      );
      if (!list(decision.evidence).length) {
        push(
          failures,
          "AGENCY_ROLE_EVIDENCE_REQUIRED",
          `role_decisions.${role.id}.evidence`,
          `Active role ${role.id} requires evidence`,
        );
      }
      const confidence = Number(decision.confidence);
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
        push(
          failures,
          "AGENCY_ROLE_CONFIDENCE_INVALID",
          `role_decisions.${role.id}.confidence`,
          "Confidence must be a number from 0 to 100",
          decision.confidence,
        );
      }
    }
  }
}

function validateAssetManifest(plan, assets, failures) {
  const selectedIds = [...new Set(list(assets).map(assetId).filter(Boolean))];
  const manifest = list(plan.asset_manifest);
  const entries = new Map(
    manifest
      .map((entry) => [assetId(entry), entry])
      .filter(([id]) => Boolean(id)),
  );

  for (const id of selectedIds) {
    const entry = entries.get(id);
    if (!entry) {
      push(
        failures,
        "SELECTED_ASSET_UNACCOUNTED",
        "asset_manifest",
        `Selected asset ${id} is missing from the production manifest`,
        { asset_id: id },
      );
      continue;
    }
    const disposition = text(entry.disposition).toUpperCase();
    if (!ASSET_DISPOSITIONS.has(disposition)) {
      push(
        failures,
        "ASSET_DISPOSITION_INVALID",
        `asset_manifest.${id}.disposition`,
        `Asset disposition must be ${[...ASSET_DISPOSITIONS].join(", ")}`,
        entry.disposition,
      );
    }
    requireText(
      failures,
      entry.reason,
      `asset_manifest.${id}.reason`,
      { minimum: 15 },
    );
    const confidence = Number(entry.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
      push(
        failures,
        "ASSET_CONFIDENCE_INVALID",
        `asset_manifest.${id}.confidence`,
        "Asset confidence must be a number from 0 to 100",
        entry.confidence,
      );
    }
    if (
      ["ASSIGNED", "REFERENCE", "REGENERATE"].includes(disposition) &&
      !list(entry.assignments).length
    ) {
      push(
        failures,
        "ASSET_ASSIGNMENT_REQUIRED",
        `asset_manifest.${id}.assignments`,
        `Asset ${id} requires explicit scene, shot or deliverable assignments`,
      );
    }
  }

  return { selected_asset_ids: selectedIds, manifest };
}

function validateStory(plan, failures) {
  const story = object(plan.story);
  const required = [
    "hook",
    "audience_tension",
    "escalation",
    "observable_proof",
    "turn",
    "resolution",
    "call_to_action",
    "emotional_arc",
    "anti_cliche_strategy",
  ];
  for (const field of required) {
    requireText(failures, story[field], `story.${field}`, { minimum: 20 });
  }
}

function validateShotSourceBinding(shot, base, failures) {
  const references = list(shot.reference_assets);
  const primaryReferences = references.filter(
    (reference) => text(reference?.role).toUpperCase() === "PRIMARY_SOURCE",
  );
  const primarySourceId = text(shot.primary_source_asset_id);
  const medium = text(shot.medium).toUpperCase().replaceAll("_", "-");
  const sourceBearing = Boolean(
    references.length ||
    primarySourceId ||
    ["ASSET-LED-MOTION", "LIVE-ASSET"].includes(medium),
  );

  references.forEach((reference, index) => {
    requireText(
      failures,
      reference?.asset_id,
      `${base}.reference_assets.${index}.asset_id`,
      { minimum: 3, rejectGeneric: false },
    );
    requireText(
      failures,
      reference?.role,
      `${base}.reference_assets.${index}.role`,
      { minimum: 3, rejectGeneric: false },
    );
  });

  if (!sourceBearing) return;

  if (primaryReferences.length !== 1) {
    push(
      failures,
      "SHOT_PRIMARY_SOURCE_REQUIRED",
      `${base}.reference_assets`,
      "Every source-bearing shot requires exactly one PRIMARY_SOURCE reference",
      { primary_source_count: primaryReferences.length },
    );
  }
  if (!primarySourceId) {
    push(
      failures,
      "SHOT_PRIMARY_SOURCE_ID_REQUIRED",
      `${base}.primary_source_asset_id`,
      "Every source-bearing shot requires primary_source_asset_id",
    );
  }
  if (
    primaryReferences.length === 1 &&
    primarySourceId &&
    assetId(primaryReferences[0]) !== primarySourceId
  ) {
    push(
      failures,
      "SHOT_PRIMARY_SOURCE_MISMATCH",
      `${base}.primary_source_asset_id`,
      "primary_source_asset_id must match the PRIMARY_SOURCE reference",
      {
        primary_source_asset_id: primarySourceId,
        reference_asset_id: assetId(primaryReferences[0]),
      },
    );
  }
}

function validateShot(shot, sceneIndex, shotIndex, failures) {
  const base = `scenes.${sceneIndex}.shots.${shotIndex}`;
  requireText(failures, shot.id, `${base}.id`, { minimum: 3, rejectGeneric: false });
  requireText(failures, shot.title, `${base}.title`, { minimum: 8 });
  requireText(failures, shot.purpose, `${base}.purpose`, { minimum: 20 });
  requireText(failures, shot.subject, `${base}.subject`, { minimum: 8 });
  requireText(failures, shot.action, `${base}.action`, { minimum: 20 });
  requireText(failures, shot.performance, `${base}.performance`, { minimum: 20 });

  const duration = Number(shot.duration_seconds);
  if (!Number.isFinite(duration) || duration <= 0) {
    push(
      failures,
      "SHOT_DURATION_INVALID",
      `${base}.duration_seconds`,
      "Shot duration must be greater than zero",
      shot.duration_seconds,
    );
  }

  const framePlan = object(shot.frame_plan);
  requireText(failures, framePlan.opening_frame, `${base}.frame_plan.opening_frame`, { minimum: 30 });
  requireText(failures, framePlan.progression, `${base}.frame_plan.progression`, { minimum: 40 });
  requireText(failures, framePlan.closing_frame, `${base}.frame_plan.closing_frame`, { minimum: 30 });

  const camera = object(shot.camera);
  for (const field of [
    "framing",
    "angle",
    "camera_distance",
    "lens_intent",
    "movement_path",
    "movement_speed",
    "stabilization",
    "movement_motivation",
    "focus_target",
    "focus_transition",
  ]) {
    requireText(failures, camera[field], `${base}.camera.${field}`, { minimum: 5 });
  }

  const lighting = object(shot.lighting);
  for (const field of [
    "source",
    "direction",
    "contrast",
    "colour",
    "exposure_intent",
  ]) {
    requireText(failures, lighting[field], `${base}.lighting.${field}`, { minimum: 5 });
  }

  const design = object(shot.production_design);
  for (const field of ["environment", "wardrobe", "props", "materials", "texture_detail"]) {
    requireText(failures, design[field], `${base}.production_design.${field}`, { minimum: 5 });
  }

  const continuity = object(shot.continuity);
  for (const field of [
    "identity",
    "product",
    "location",
    "wardrobe",
    "screen_direction",
    "spatial_geography",
  ]) {
    requireText(failures, continuity[field], `${base}.continuity.${field}`, {
      minimum: 5,
      rejectGeneric: false,
    });
  }

  const audio = object(shot.audio);
  requireText(failures, audio.source_sound, `${base}.audio.source_sound`, {
    minimum: 5,
    rejectGeneric: false,
  });
  requireText(failures, audio.mix_intent, `${base}.audio.mix_intent`, {
    minimum: 10,
    rejectGeneric: false,
  });

  requireText(failures, shot.transition_in, `${base}.transition_in`, {
    minimum: 8,
    rejectGeneric: false,
  });
  requireText(failures, shot.transition_out, `${base}.transition_out`, {
    minimum: 8,
    rejectGeneric: false,
  });

  if (!list(shot.negative_constraints).length) {
    push(
      failures,
      "SHOT_NEGATIVE_CONSTRAINTS_REQUIRED",
      `${base}.negative_constraints`,
      "Every generated shot requires explicit negative constraints",
    );
  }
  if (!list(shot.known_failure_modes).length) {
    push(
      failures,
      "SHOT_KNOWN_FAILURE_MODES_REQUIRED",
      `${base}.known_failure_modes`,
      "Every generated shot requires explicit known failure modes",
    );
  }
  if (!list(shot.repair_instructions).length) {
    push(
      failures,
      "SHOT_REPAIR_INSTRUCTIONS_REQUIRED",
      `${base}.repair_instructions`,
      "Every shot requires bounded repair instructions",
    );
  }

  validateShotSourceBinding(shot, base, failures);

  const generation = object(shot.generation);
  if (generation.required !== true) {
    push(
      failures,
      "SHOT_GENERATION_REQUIRED_FLAG_INVALID",
      `${base}.generation.required`,
      "Generated shot direction must explicitly set generation.required to true",
      generation.required,
    );
  }
  requireText(failures, generation.service, `${base}.generation.service`, { minimum: 3 });
  requireText(failures, generation.capability, `${base}.generation.capability`, { minimum: 3 });

  const persistedPrompt = text(
    generation.provider_prompt ||
    generation.negative_prompt ||
    shot.provider_prompt ||
    shot.prompt,
  );
  if (persistedPrompt) {
    push(
      failures,
      "PERSISTED_PROVIDER_PROMPT_FORBIDDEN",
      `${base}.generation`,
      "Provider prompts must be serialized only at the execution transport boundary",
    );
  }

  const outputSpec = object(generation.output_spec);
  if (!Object.keys(outputSpec).length) {
    push(
      failures,
      "SHOT_OUTPUT_SPEC_REQUIRED",
      `${base}.generation.output_spec`,
      "Every generated shot requires an explicit output specification",
    );
  } else {
    const outputDuration = finite(outputSpec.duration_seconds);
    if (outputDuration === null || outputDuration <= 0) {
      push(
        failures,
        "SHOT_OUTPUT_DURATION_REQUIRED",
        `${base}.generation.output_spec.duration_seconds`,
        "Generated temporal output requires a positive duration_seconds",
        outputSpec.duration_seconds,
      );
    } else if (Number.isFinite(duration) && duration > 0 && Math.abs(outputDuration - duration) > 0.001) {
      push(
        failures,
        "SHOT_OUTPUT_DURATION_MISMATCH",
        `${base}.generation.output_spec.duration_seconds`,
        "Generated output duration must match the directed shot duration",
        { shot_duration: duration, output_duration: outputDuration },
      );
    }
    requireText(
      failures,
      outputSpec.aspect_ratio,
      `${base}.generation.output_spec.aspect_ratio`,
      { minimum: 3, rejectGeneric: false },
    );
    requireText(
      failures,
      outputSpec.resolution,
      `${base}.generation.output_spec.resolution`,
      { minimum: 3, rejectGeneric: false },
    );
  }
}

function validateTemporalPlan(plan, failures) {
  validateStory(plan, failures);
  const scenes = list(plan.scenes);
  if (!scenes.length) {
    push(failures, "SCENES_REQUIRED", "scenes", "Temporal work requires scenes");
    return;
  }

  const objectives = [];
  const sceneIds = [];
  const shotIds = [];
  let totalShots = 0;
  scenes.forEach((scene, sceneIndex) => {
    const base = `scenes.${sceneIndex}`;
    requireText(failures, scene.id, `${base}.id`, { minimum: 3, rejectGeneric: false });
    requireText(failures, scene.title, `${base}.title`, { minimum: 8 });
    requireText(failures, scene.objective, `${base}.objective`, { minimum: 20 });
    requireText(failures, scene.story_state_before, `${base}.story_state_before`, { minimum: 20 });
    requireText(failures, scene.state_change, `${base}.state_change`, { minimum: 20 });
    requireText(failures, scene.story_state_after, `${base}.story_state_after`, { minimum: 20 });
    requireText(failures, scene.transition_logic, `${base}.transition_logic`, { minimum: 15 });
    objectives.push(text(scene.objective).toLowerCase());
    sceneIds.push(text(scene.id));

    const shots = list(scene.shots);
    if (!shots.length) {
      push(failures, "SCENE_SHOTS_REQUIRED", `${base}.shots`, "Every temporal scene requires shots");
      return;
    }
    shots.forEach((shot, shotIndex) => {
      totalShots += 1;
      shotIds.push(text(shot.id));
      validateShot(shot, sceneIndex, shotIndex, failures);
    });
  });

  if (new Set(sceneIds.filter(Boolean)).size !== sceneIds.filter(Boolean).length) {
    push(
      failures,
      "DUPLICATE_SCENE_ID",
      "scenes",
      "Every scene id must be unique",
      sceneIds,
    );
  }
  if (new Set(shotIds.filter(Boolean)).size !== shotIds.filter(Boolean).length) {
    push(
      failures,
      "DUPLICATE_SHOT_ID",
      "scenes",
      "Every shot id must be unique",
      shotIds,
    );
  }
  if (new Set(objectives.filter(Boolean)).size !== objectives.filter(Boolean).length) {
    push(
      failures,
      "REPEATED_SCENE_OBJECTIVE",
      "scenes",
      "Every scene must advance the story with a distinct objective",
      objectives,
    );
  }
  if (totalShots < scenes.length) {
    push(
      failures,
      "INSUFFICIENT_SHOT_COVERAGE",
      "scenes",
      "Temporal plan does not contain enough shot coverage",
      { scene_count: scenes.length, shot_count: totalShots },
    );
  }
}

function validateDeliverables(plan, failures) {
  const deliverables = list(plan.deliverables);
  if (!deliverables.length) {
    push(
      failures,
      "DELIVERABLE_GRAPH_REQUIRED",
      "deliverables",
      "The master plan requires at least one executable deliverable",
    );
    return;
  }
  deliverables.forEach((deliverable, index) => {
    const base = `deliverables.${index}`;
    requireText(failures, deliverable.id, `${base}.id`, { minimum: 3 });
    requireText(failures, deliverable.type, `${base}.type`, { minimum: 3 });
    requireText(failures, deliverable.purpose, `${base}.purpose`, { minimum: 15 });
    if (!Object.keys(object(deliverable.output_spec)).length) {
      push(
        failures,
        "DELIVERABLE_OUTPUT_SPEC_REQUIRED",
        `${base}.output_spec`,
        "Every deliverable requires an explicit output specification",
      );
    }
  });
}

export function validateCreativeMasterPlan({ plan, assets = [] } = {}) {
  const failures = [];
  const normalized = object(plan);
  const workflowKind = text(normalized.workflow_kind).toUpperCase();

  if (!CREATIVE_WORKFLOW_KINDS.includes(workflowKind)) {
    push(
      failures,
      "WORKFLOW_KIND_INVALID",
      "workflow_kind",
      `workflow_kind must be ${CREATIVE_WORKFLOW_KINDS.join(", ")}`,
      normalized.workflow_kind,
    );
  }

  const concept = object(normalized.concept);
  for (const field of [
    "title",
    "creative_thesis",
    "hook",
    "message",
    "narrative",
    "visual_system",
    "emotional_promise",
    "call_to_action",
  ]) {
    requireText(failures, concept[field], `concept.${field}`, { minimum: 15 });
  }

  validateDeliverables(normalized, failures);
  validateRoleDecisions(normalized, failures);
  const manifest = validateAssetManifest(normalized, assets, failures);

  const temporalDeliverable = list(normalized.deliverables).some((item) =>
    ["FILM", "VIDEO", "ANIMATION", "TRAILER", "SOCIAL_VIDEO"].includes(
      text(item?.type).toUpperCase(),
    ),
  );
  if (workflowKind === "TEMPORAL" || temporalDeliverable) {
    validateTemporalPlan(normalized, failures);
  }

  return {
    passed: failures.length === 0,
    workflow_kind: workflowKind || null,
    selected_asset_ids: manifest.selected_asset_ids,
    scene_count: list(normalized.scenes).length,
    shot_count: list(normalized.scenes)
      .reduce((total, scene) => total + list(scene?.shots).length, 0),
    failures,
  };
}

export function assertCreativeMasterPlan(input = {}) {
  const validation = validateCreativeMasterPlan(input);
  if (!validation.passed) {
    const codes = [...new Set(validation.failures.map((item) => item.code))];
    const error = new Error(`CREATIVE_MASTER_PLAN_INVALID:${codes.join(",")}`);
    error.validation = validation;
    throw error;
  }
  return validation;
}

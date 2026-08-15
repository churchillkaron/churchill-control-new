import {
  CREATIVE_AGENCY_ROLES,
} from "@/lib/creative/director/registry/CreativeAgencyRoleRegistry";
import {
  CreativeWorkflowRegistry,
} from "@/lib/creative/director/registry/CreativeWorkflowRegistry";
import {
  CreativeMasterPlanContractRegistry,
} from "@/lib/creative/director/registry/CreativeMasterPlanContractRegistry";

const ASSET_DISPOSITIONS = new Set([
  "ASSIGNED",
  "REFERENCE",
  "REGENERATE",
  "EXCLUDE",
]);

const FORBIDDEN_PLAN_KEYS = new Set([
  "prompt",
  "provider_prompt",
  "negative_prompt",
  "visual_prompt",
  "video_prompt",
  "provider_parameters",
]);

const GENERIC_DIRECTION = [
  /^scene\s+\d+$/i,
  /^shot\s+\d+$/i,
  /^n\/?a\.?$/i,
  /^none\.?$/i,
  /^not applicable\.?$/i,
  /^tbd\.?$/i,
  /^unspecified\.?$/i,
  /^choose .* to support(?: .*)?\.?$/i,
  /^selected per scene\.?$/i,
  /^premium and authentic\.?$/i,
  /^(?:professional|natural|soft|cinematic|balanced)\.?$/i,
  /^compelling original production\.?$/i,
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

function push(failures, code, path, message, evidence = null) {
  failures.push({ code, path, message, evidence });
}

function isGeneric(value) {
  const normalized = text(value);
  return Boolean(
    normalized && GENERIC_DIRECTION.some((pattern) => pattern.test(normalized)),
  );
}

// What a rejected blank should become. These messages are quoted straight back to the director when a
// scene is re-directed, so a message that only names the offence buys nothing: the last film was told
// three times that movement_speed "contained generic placeholder direction" and answered "none" every
// time, because nothing told it what to write instead. Naming the replacement is what made the
// advertising-filler rejection work, and it is the same problem here.
//
// Absence is usually true when it is claimed -- a locked-off camera really has no movement path, an
// empty room really has no wardrobe -- so the answer is never to lower the bar. It is to say the
// absence out loud, where it becomes a decision on the record instead of a hole in the direction.
function absenceGuidance(path) {
  const field = String(path).split(".").pop();
  return `${path} is blank or says none. If this shot genuinely has no ${field}, say that in real words and say what the absence does for the shot: name it, then give the reason. "No camera movement at all: locked off on sticks so the performance carries the frame" is direction. "No props: the bare table is the whole point of the shot" is direction. "none", "N/A", "not applicable" and an empty string are not.`;
}

function requireText(failures, value, path, options = {}) {
  const normalized = text(value);
  if (!normalized) {
    push(failures, "REQUIRED_TEXT_MISSING", path, absenceGuidance(path));
    return;
  }
  if (options.rejectGeneric !== false && isGeneric(normalized)) {
    push(
      failures,
      "GENERIC_DIRECTION_REJECTED",
      path,
      statedAbsence(normalized)
        ? absenceGuidance(path)
        : `${path} contains generic placeholder direction`,
      normalized,
    );
  }
  if (options.minimum && normalized.length < options.minimum) {
    push(
      failures,
      "DIRECTION_TOO_SHALLOW",
      path,
      // An absence token is short as well as generic, so it lands here too. Repeating the offence
      // twice and the remedy never is how the director learned nothing from being told.
      statedAbsence(normalized)
        ? absenceGuidance(path)
        : `${path} must contain at least ${options.minimum} characters of executable direction`,
      normalized,
    );
  }
}

function scanForbiddenKeys(value, path, failures) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      scanForbiddenKeys(item, `${path}.${index}`, failures),
    );
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, nested] of Object.entries(value)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_PLAN_KEYS.has(key) && nested != null && nested !== "") {
      push(
        failures,
        "PERSISTED_PROVIDER_TRANSPORT_DETAIL_FORBIDDEN",
        nextPath,
        `${key} may exist only at the governed execution transport boundary`,
      );
    }
    scanForbiddenKeys(nested, nextPath, failures);
  }
}

function validateRoleDecisions(plan, workflowKind, failures) {
  const decisions = object(plan.role_decisions);
  for (const role of CREATIVE_AGENCY_ROLES) {
    const decision = object(decisions[role.id]);
    const status = text(decision.status).toUpperCase();
    const eligible =
      role.applies_to.includes("ALL") || role.applies_to.includes(workflowKind);

    if (!["ACTIVE", "NOT_REQUIRED"].includes(status)) {
      push(
        failures,
        "AGENCY_ROLE_DECISION_REQUIRED",
        `role_decisions.${role.id}`,
        `Role ${role.id} must explicitly be ACTIVE or NOT_REQUIRED`,
      );
      continue;
    }

    if (status === "NOT_REQUIRED") {
      if (eligible) {
        requireText(
          failures,
          decision.decision,
          `role_decisions.${role.id}.decision`,
          { minimum: 20 },
        );
      }
      continue;
    }

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
    const confidence = finite(decision.confidence);
    if (confidence === null || confidence < 0 || confidence > 100) {
      push(
        failures,
        "AGENCY_ROLE_CONFIDENCE_INVALID",
        `role_decisions.${role.id}.confidence`,
        "Confidence must be from 0 to 100",
        decision.confidence,
      );
    }
  }
}

function validateAssetManifest(plan, assets, failures) {
  const selectedIds = [...new Set(list(assets).map(assetId).filter(Boolean))];
  const manifest = list(plan.asset_manifest);
  const entries = manifest
    .map((entry) => [assetId(entry), entry])
    .filter(([id]) => Boolean(id));
  const byId = new Map(entries);

  if (byId.size !== entries.length) {
    push(
      failures,
      "DUPLICATE_ASSET_MANIFEST_ENTRY",
      "asset_manifest",
      "Each supplied asset may appear exactly once in the asset manifest",
    );
  }

  for (const id of selectedIds) {
    const entry = byId.get(id);
    if (!entry) {
      push(
        failures,
        "SELECTED_ASSET_UNACCOUNTED",
        "asset_manifest",
        `Selected asset ${id} is missing from the production manifest`,
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
      );
    }

    requireText(
      failures,
      entry.reason,
      `asset_manifest.${id}.reason`,
      { minimum: 15 },
    );

    const confidence = finite(entry.confidence);
    if (confidence === null || confidence < 0 || confidence > 100) {
      push(
        failures,
        "ASSET_CONFIDENCE_INVALID",
        `asset_manifest.${id}.confidence`,
        "Asset confidence must be from 0 to 100",
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
        `Asset ${id} requires explicit production assignments`,
      );
    }
  }

  return { selected_asset_ids: selectedIds, manifest };
}

function validateStep(step, path, failures) {
  requireText(failures, step.id, `${path}.id`, { minimum: 2, rejectGeneric: false });
  requireText(failures, step.title, `${path}.title`, { minimum: 5 });
  requireText(failures, step.purpose, `${path}.purpose`, { minimum: 15 });
  requireText(failures, step.service, `${path}.service`, { minimum: 3, rejectGeneric: false });
  requireText(failures, step.capability, `${path}.capability`, { minimum: 3, rejectGeneric: false });

  if (!Object.keys(object(step.output_spec)).length) {
    push(
      failures,
      "PRODUCTION_STEP_OUTPUT_SPEC_REQUIRED",
      `${path}.output_spec`,
      "Every production step requires an explicit output specification",
    );
  }

  if (step.quality_gate !== true && step.quality_gate !== false) {
    push(
      failures,
      "PRODUCTION_STEP_QUALITY_FLAG_REQUIRED",
      `${path}.quality_gate`,
      "Every production step must explicitly declare whether it is a quality gate",
    );
  }
}

function validateDeliverables(plan, workflow, failures) {
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

  const ids = new Set();
  deliverables.forEach((deliverable, index) => {
    const base = `deliverables.${index}`;
    requireText(failures, deliverable.id, `${base}.id`, { minimum: 3, rejectGeneric: false });
    requireText(failures, deliverable.type, `${base}.type`, { minimum: 3, rejectGeneric: false });
    requireText(failures, deliverable.purpose, `${base}.purpose`, { minimum: 15 });

    const id = text(deliverable.id);
    if (id && ids.has(id)) {
      push(
        failures,
        "DUPLICATE_DELIVERABLE_ID",
        `${base}.id`,
        `Deliverable id ${id} must be unique`,
      );
    }
    ids.add(id);

    if (!Object.keys(object(deliverable.output_spec)).length) {
      push(
        failures,
        "DELIVERABLE_OUTPUT_SPEC_REQUIRED",
        `${base}.output_spec`,
        "Every deliverable requires an explicit output specification",
      );
    }

    const mapped = CreativeWorkflowRegistry.resolveAlias(deliverable.type);
    if (mapped && mapped.workflow_kind !== workflow.workflow_kind) {
      push(
        failures,
        "DELIVERABLE_WORKFLOW_MISMATCH",
        `${base}.type`,
        `Deliverable ${deliverable.type} maps to ${mapped.workflow_kind}, not ${workflow.workflow_kind}`,
      );
    }

    if (workflow.executor === "UNIVERSAL") {
      const steps = list(deliverable.production_steps);
      if (!steps.length) {
        push(
          failures,
          "EXPLICIT_PRODUCTION_STEPS_REQUIRED",
          `${base}.production_steps`,
          "Universal work must be fully planned by the Creative Director; downstream default production recipes are forbidden",
        );
        return;
      }

      const stepIds = new Set();
      steps.forEach((step, stepIndex) => {
        validateStep(step, `${base}.production_steps.${stepIndex}`, failures);
        const stepId = text(step.id);
        if (stepId && stepIds.has(stepId)) {
          push(
            failures,
            "DUPLICATE_PRODUCTION_STEP_ID",
            `${base}.production_steps.${stepIndex}.id`,
            `Production step id ${stepId} must be unique within its deliverable`,
          );
        }
        stepIds.add(stepId);
      });

      for (const [stepIndex, step] of steps.entries()) {
        for (const dependency of list(step.depends_on)) {
          if (!stepIds.has(text(dependency))) {
            push(
              failures,
              "PRODUCTION_STEP_DEPENDENCY_UNKNOWN",
              `${base}.production_steps.${stepIndex}.depends_on`,
              `Unknown production-step dependency ${dependency}`,
            );
          }
        }
      }

      if (!steps.some((step) => step.quality_gate === true)) {
        push(
          failures,
          "DELIVERABLE_QUALITY_GATE_REQUIRED",
          `${base}.production_steps`,
          "Every universal deliverable requires an explicit medium-appropriate quality gate",
        );
      }
    }
  });
}

function validateStory(plan, failures) {
  const story = object(plan.story);
  for (const field of [
    "hook",
    "audience_tension",
    "escalation",
    "observable_proof",
    "turn",
    "resolution",
    "call_to_action",
    "emotional_arc",
    "anti_cliche_strategy",
  ]) {
    requireText(failures, story[field], `story.${field}`, { minimum: 20 });
  }
}

function validateShotSourceBinding(shot, base, failures) {
  const references = list(shot.reference_assets);
  const primaryReferences = references.filter(
    (reference) => text(reference?.role).toUpperCase() === "PRIMARY_SOURCE",
  );
  const primarySourceId = text(shot.primary_source_asset_id);
  const sourceBearing = Boolean(references.length || primarySourceId);

  if (!sourceBearing) return;
  if (primaryReferences.length !== 1) {
    push(
      failures,
      "SHOT_PRIMARY_SOURCE_REQUIRED",
      `${base}.reference_assets`,
      "Every source-bearing shot requires exactly one PRIMARY_SOURCE reference",
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
    );
  }
}

// Continuity requirements follow the mission's own quality policy rather than being demanded
// unconditionally. Only the two continuities the policy actually governs are conditional; location,
// wardrobe, screen direction and spatial geography apply to any temporal work.
//
// A music film declares require_product_continuity false because it has no product to keep continuous,
// and demanding continuity.product on every shot regardless produced one failure per shot -- 68 of them
// on a 68 shot film, for a field the case had already said was not required.
const ABSENCE_TOKEN = /^(?:none|n\/?a|null|nil|not applicable|no)\.?$/i;

function statedAbsence(value) {
  return ABSENCE_TOKEN.test(text(value));
}

// Whether this shot does its work with graphics instead of a camera.
//
// The contract assumed every shot was live-action photography and demanded camera, lighting,
// production design and continuity from all of them. A closing typographic card -- black frame,
// animated text, no wardrobe, no props, no location -- therefore produced twenty-two failures for
// fields that do not exist in it, and the director had correctly returned null for every one. Two
// thirds of the last film's remaining failures were that single shot.
//
// The exemption is earned by evidence rather than claimed by a keyword: the shot has to carry real
// graphic direction. A shot cannot use this to skip work, because the only route to it is doing the
// graphic work instead. No list of medium names is involved, so nothing here assumes a taxonomy of
// production media.
//
// It is deliberately not a whole-shot exemption. A text card still has a framing and an angle -- the
// director wrote "static full frame text centered" and "straight frontal", which are true and worth
// validating -- and marked absent only the fields belonging to a physical lens: camera distance, lens
// intent, movement path, stabilisation, focus transition. So the relief applies per field, to values
// the director explicitly marked absent, and every field it actually answered is still held to the
// same standard.
function shotCarriesGraphicDirection(shot = {}) {
  const graphics = object(shot.graphics);
  const entries = [...list(graphics.titles), ...list(graphics.overlays)];
  return entries.some((entry) => text(entry?.content ?? entry).length >= 8);
}

// Sound is not exempt. A card in a music film still plays the song across it, so an absent
// audio.source_sound is a real omission rather than a field that does not apply, and frame_plan still
// describes what the card opens and closes on.
// Fields whose correct answer can be one concrete noun. A focus target is "eyes", "hands", "the ring";
// padding that to five characters makes the direction worse, not better. Everything else keeps the
// full floor.
const SHORT_ANSWER_FIELDS = new Set(["focus_target"]);

const PHOTOGRAPHIC_SECTIONS = new Set([
  "camera",
  "lighting",
  "production_design",
  "continuity",
]);

function continuityFieldRequired(section, field, quality = {}) {
  if (section !== "continuity") return true;

  if (field === "product" && quality.require_product_continuity === false) return false;
  if (field === "identity" && quality.require_identity_continuity === false) return false;
  return true;
}

function validateShot(shot, sceneIndex, shotIndex, failures, quality = {}) {
  const base = `scenes.${sceneIndex}.shots.${shotIndex}`;
  for (const [field, minimum] of [
    ["id", 3],
    ["title", 8],
    ["purpose", 20],
    ["subject", 8],
    ["action", 20],
    ["performance", 20],
    // Either how this shot carries the device, or why it is deliberately plain. Plain is a valid
    // answer and a necessary one -- the point is that it has to be answered.
    ["device", 20],
  ]) {
    requireText(failures, shot[field], `${base}.${field}`, {
      minimum,
      rejectGeneric: field === "id" ? false : undefined,
    });
  }

  const duration = finite(shot.duration_seconds);
  if (duration === null || duration <= 0) {
    push(
      failures,
      "SHOT_DURATION_INVALID",
      `${base}.duration_seconds`,
      "Temporal shot duration must be greater than zero",
    );
  }

  const graphicShot = shotCarriesGraphicDirection(shot);

  const framePlan = object(shot.frame_plan);
  requireText(failures, framePlan.opening_frame, `${base}.frame_plan.opening_frame`, { minimum: 30 });
  requireText(failures, framePlan.progression, `${base}.frame_plan.progression`, { minimum: 40 });
  requireText(failures, framePlan.closing_frame, `${base}.frame_plan.closing_frame`, { minimum: 30 });

  for (const [section, fields] of Object.entries({
    camera: [
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
    ],
    lighting: ["source", "direction", "contrast", "colour", "exposure_intent"],
    production_design: ["environment", "wardrobe", "props", "materials", "texture_detail"],
    continuity: ["identity", "product", "location", "wardrobe", "screen_direction", "spatial_geography"],
  })) {
    const source = object(shot[section]);
    for (const field of fields) {
      // The quality policy the mission declares decides which continuities matter. A music film sets
      // require_product_continuity false because it has no product to keep continuous, and demanding
      // continuity.product on every shot regardless produced one failure per shot -- 68 of them on a
      // 68 shot film, for a field the case had already said was not required. The same applies to
      // identity: a plan with no identifiable person to preserve has no identity to keep continuous.
      if (!continuityFieldRequired(section, field, quality)) continue;
      // A field the director left empty or marked absent on a shot that does its work with graphics.
      // An empty string is how a field gets marked inapplicable in JSON, so it counts as the same
      // statement as "none" here.
      // On a photographed shot "none" stays rejected, which is what keeps a locked-off camera from
      // being described as a blank rather than as the decision it is.
      if (
        PHOTOGRAPHIC_SECTIONS.has(section) &&
        graphicShot &&
        (!text(source[field]) || statedAbsence(source[field]))
      ) continue;

      requireText(failures, source[field], `${base}.${section}.${field}`, {
        // A flat five-character floor rejected "eyes" as a focus target, which is the most precise
        // answer the field can hold -- more precise than the longer phrasings that would have passed.
        // The floor is there to catch thin direction, and for the handful of fields whose correct
        // answer is a single concrete noun it was catching precision instead. "none" is still refused
        // on its own terms, as a stated absence rather than as a short string.
        minimum: SHORT_ANSWER_FIELDS.has(field) ? 3 : 5,
        rejectGeneric: section === "continuity" ? false : undefined,
      });
    }
  }

  const audio = object(shot.audio);
  requireText(failures, audio.source_sound, `${base}.audio.source_sound`, { minimum: 5, rejectGeneric: false });
  requireText(failures, audio.mix_intent, `${base}.audio.mix_intent`, { minimum: 10, rejectGeneric: false });
  requireText(failures, shot.transition_in, `${base}.transition_in`, { minimum: 8, rejectGeneric: false });
  requireText(failures, shot.transition_out, `${base}.transition_out`, { minimum: 8, rejectGeneric: false });

  for (const field of ["negative_constraints", "known_failure_modes", "repair_instructions"]) {
    if (!list(shot[field]).length) {
      push(
        failures,
        "SHOT_SAFETY_AND_REPAIR_DETAIL_REQUIRED",
        `${base}.${field}`,
        `Every temporal shot requires ${field}`,
      );
    }
  }

  validateShotSourceBinding(shot, base, failures);

  const generation = object(shot.generation);
  if (generation.required !== true) {
    push(
      failures,
      "SHOT_GENERATION_REQUIRED_FLAG_INVALID",
      `${base}.generation.required`,
      "Generated temporal direction must explicitly declare generation.required=true",
    );
  }
  requireText(failures, generation.service, `${base}.generation.service`, { minimum: 3, rejectGeneric: false });
  requireText(failures, generation.capability, `${base}.generation.capability`, { minimum: 3, rejectGeneric: false });

  const outputSpec = object(generation.output_spec);
  const outputDuration = finite(outputSpec.duration_seconds);
  if (!Object.keys(outputSpec).length) {
    push(
      failures,
      "SHOT_OUTPUT_SPEC_REQUIRED",
      `${base}.generation.output_spec`,
      "Every generated temporal shot requires an explicit output specification",
    );
  } else {
    if (outputDuration === null || outputDuration <= 0) {
      push(
        failures,
        "SHOT_OUTPUT_DURATION_REQUIRED",
        `${base}.generation.output_spec.duration_seconds`,
        "Generated temporal output requires positive duration_seconds",
      );
    } else if (duration !== null && Math.abs(outputDuration - duration) > 0.001) {
      push(
        failures,
        "SHOT_OUTPUT_DURATION_MISMATCH",
        `${base}.generation.output_spec.duration_seconds`,
        "Generated output duration must match directed shot duration",
      );
    }
    requireText(failures, outputSpec.aspect_ratio, `${base}.generation.output_spec.aspect_ratio`, { minimum: 3, rejectGeneric: false });
    requireText(failures, outputSpec.resolution, `${base}.generation.output_spec.resolution`, { minimum: 3, rejectGeneric: false });
    const frameRate = finite(outputSpec.frame_rate);
    if (frameRate === null || frameRate <= 0) {
      push(
        failures,
        "SHOT_FRAME_RATE_REQUIRED",
        `${base}.generation.output_spec.frame_rate`,
        "Temporal output requires an explicit positive frame rate",
      );
    }
  }
}

function validateTemporalPlan(plan, failures) {
  validateStory(plan, failures);
  const scenes = list(plan.scenes);
  if (!scenes.length) {
    push(failures, "SCENES_REQUIRED", "scenes", "Temporal work requires scenes");
    return;
  }

  const sceneIds = new Set();
  const shotIds = new Set();
  const objectives = new Set();

  scenes.forEach((scene, sceneIndex) => {
    const base = `scenes.${sceneIndex}`;
    requireText(failures, scene.id, `${base}.id`, { minimum: 3, rejectGeneric: false });
    requireText(failures, scene.title, `${base}.title`, { minimum: 8 });
    requireText(failures, scene.objective, `${base}.objective`, { minimum: 20 });
    requireText(failures, scene.story_state_before, `${base}.story_state_before`, { minimum: 20 });
    requireText(failures, scene.state_change, `${base}.state_change`, { minimum: 20 });
    requireText(failures, scene.story_state_after, `${base}.story_state_after`, { minimum: 20 });
    requireText(failures, scene.transition_logic, `${base}.transition_logic`, { minimum: 15 });

    const id = text(scene.id);
    const objective = text(scene.objective).toLowerCase();
    if (id && sceneIds.has(id)) {
      push(failures, "DUPLICATE_SCENE_ID", `${base}.id`, `Scene id ${id} must be unique`);
    }
    if (objective && objectives.has(objective)) {
      push(failures, "REPEATED_SCENE_OBJECTIVE", `${base}.objective`, "Every scene must advance a distinct story objective");
    }
    sceneIds.add(id);
    objectives.add(objective);

    const shots = list(scene.shots);
    if (!shots.length) {
      push(failures, "SCENE_SHOTS_REQUIRED", `${base}.shots`, "Every temporal scene requires shots");
      return;
    }

    shots.forEach((shot, shotIndex) => {
      const shotId = text(shot.id);
      if (shotId && shotIds.has(shotId)) {
        push(failures, "DUPLICATE_SHOT_ID", `${base}.shots.${shotIndex}.id`, `Shot id ${shotId} must be unique`);
      }
      shotIds.add(shotId);
      validateShot(shot, sceneIndex, shotIndex, failures, object(plan.quality));
    });
  });
}

function validateCampaignSystem(plan, workflow, failures) {
  if (workflow.workflow_kind !== "CAMPAIGN_SYSTEM") return;
  const crossSteps = list(plan.production?.cross_deliverable_steps);
  if (!crossSteps.some((step) => step.quality_gate === true)) {
    push(
      failures,
      "CAMPAIGN_SYSTEM_COHERENCE_GATE_REQUIRED",
      "production.cross_deliverable_steps",
      "Campaign systems require an explicit cross-deliverable coherence quality gate",
    );
  }
  crossSteps.forEach((step, index) =>
    validateStep(step, `production.cross_deliverable_steps.${index}`, failures),
  );
}

// One scene's shots, checked at the point the director returns them rather than at final assembly.
//
// The temporal runtime retried a scene only when it came back with no shots at all, so a scene that
// returned five skeletal shots -- an id, a title, and nothing else -- counted as a success and the
// gaps stayed invisible until the whole plan was assembled. On the last rejected film that produced
// 1,178 failures at once, concentrated in stub shots: 34 of 68 shots had no generation block and 23
// had no camera block. Two whole-plan repair calls cannot fix 1,178 failures, so the film died of a
// problem that was cheap to catch one scene at a time.
//
// This applies the same per-shot rules the final validation uses, so a scene cannot pass here and
// fail there.
export function creativeTemporalSceneShotFailures({
  shots = [],
  sceneIndex = 0,
  quality = {},
} = {}) {
  const failures = [];
  list(shots).forEach((shot, shotIndex) => {
    validateShot(shot, sceneIndex, shotIndex, failures, object(quality));
  });
  return failures;
}

export function validateCreativeMasterPlan({ plan, assets = [] } = {}) {
  const failures = [];
  const normalized = object(plan);
  const workflowKind = text(normalized.workflow_kind).toUpperCase();

  let workflow = null;
  try {
    workflow = CreativeWorkflowRegistry.require(workflowKind);
    CreativeMasterPlanContractRegistry.getWorkflowContract(workflowKind);
  } catch (error) {
    push(
      failures,
      "WORKFLOW_KIND_INVALID",
      "workflow_kind",
      error.message,
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
    "creative_system",
    "emotional_promise",
    "call_to_action",
    // The contract asked for ten camera fields per shot and nothing at all about what makes the
    // work memorable, so competent coverage satisfied it completely. These two are the cheapest
    // place to fix that: one device decided once for the whole plan, and the reflex answers named
    // and rejected. Both are plan-level, so a film pays for them once rather than per shot.
    "signature_device",
    "refused_devices",
  ]) {
    requireText(failures, concept[field], `concept.${field}`, { minimum: 15 });
  }

  scanForbiddenKeys(normalized, "", failures);
  const manifest = validateAssetManifest(normalized, assets, failures);

  if (workflow) {
    validateRoleDecisions(normalized, workflow.workflow_kind, failures);
    validateDeliverables(normalized, workflow, failures);
    validateCampaignSystem(normalized, workflow, failures);
    if (workflow.executor === "TEMPORAL") {
      validateTemporalPlan(normalized, failures);
    }
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
    // Keep validation failures diagnosable without another provider call. The
    // validator stores the offending field in path and its rejected value in
    // evidence, so surface those exact keys in the top-level error.
    const detail = validation.failures
      .slice(0, 8)
      .map((item) => {
        const field = String(item.path ?? "?");
        const value =
          item.evidence === undefined || item.evidence === null
            ? "absent"
            : String(
                typeof item.evidence === "object"
                  ? JSON.stringify(item.evidence)
                  : item.evidence,
              ).slice(0, 120);
        return `${item.code}@${field}=${value}`;
      })
      .join("; ");

    const error = new Error(
      `CREATIVE_MASTER_PLAN_INVALID:${codes.join(",")}${detail ? ` :: ${detail}` : ""}`,
    );
    error.validation = validation;
    throw error;
  }
  return validation;
}

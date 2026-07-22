import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  CreativeShotDirectorRuntime,
} from "./CreativeShotDirectorRuntime";

import {
  reason,
} from "@/lib/creative/reasoning/CreativeReasoningService";

import {
  inspectCreativeStoryboardPlan,
} from "@/lib/creative/storyboard/runtime/CreativeStoryboardPlanContract";

import {
  inspectCreativeShotTemporalContract,
} from "./CreativeShotTemporalContract";

const JOBS = "creative_director_jobs";
const STEPS = "creative_director_job_steps";
const LEASE_MS = 6 * 60 * 1000;

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}


function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value),
  );
}

function object(value) {
  return isPlainObject(value) ? value : {};
}

function schemaPlaceholder(value) {
  if (typeof value !== "string") return false;

  const normalized = value.trim().toLowerCase();

  return (
    [
      "object",
      "array",
      "string",
      "number",
      "boolean",
      "null",
    ].includes(normalized) ||
    normalized.startsWith("complete corrected production bible") ||
    normalized.startsWith("complete production bible")
  );
}

function patchObject(
  value,
  context,
  { optional = false } = {},
) {
  if (value === undefined || value === null) {
    if (optional) return {};

    throw jobError(
      "CREATIVE_DIRECTOR_JOB_PATCH_OBJECT_REQUIRED",
      {
        context,
        received_type: value === null ? "null" : "undefined",
      },
    );
  }

  if (schemaPlaceholder(value) || !isPlainObject(value)) {
    throw jobError(
      "CREATIVE_DIRECTOR_JOB_PATCH_OBJECT_REQUIRED",
      {
        context,
        received_type: Array.isArray(value)
          ? "array"
          : typeof value,
        received_value:
          typeof value === "string"
            ? value.slice(0, 200)
            : null,
      },
    );
  }

  return value;
}

function patchArray(
  value,
  context,
  { optional = false } = {},
) {
  if (value === undefined || value === null) {
    if (optional) return [];

    throw jobError(
      "CREATIVE_DIRECTOR_JOB_PATCH_ARRAY_REQUIRED",
      {
        context,
        received_type: value === null ? "null" : "undefined",
      },
    );
  }

  if (!Array.isArray(value)) {
    throw jobError(
      "CREATIVE_DIRECTOR_JOB_PATCH_ARRAY_REQUIRED",
      {
        context,
        received_type: typeof value,
      },
    );
  }

  return value.filter(
    (entry) => entry !== undefined && entry !== null,
  );
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function now() {
  return new Date().toISOString();
}

function jobError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function serializeError(error = {}) {
  return {
    code: error.code || error.message || "CREATIVE_DIRECTOR_JOB_FAILED",
    message: error.message || "CREATIVE_DIRECTOR_JOB_FAILED",
    details: error.details || null,
    at: now(),
  };
}

function stepDefinition({
  key,
  department,
  kind,
  tokenBudget = 6000,
  timeoutMs = 240000,
  allowStructureChange = false,
  remit = [],
}) {
  return {
    key,
    department,
    kind,
    tokenBudget,
    timeoutMs,
    allowStructureChange,
    remit,
  };
}

const STEP_DEFINITIONS = [
  stepDefinition({
    key: "initial_director",
    department: "INITIAL_EVIDENCE_DIRECTOR",
    kind: "INITIAL",
    tokenBudget: 16000,
  }),
  stepDefinition({
    key: "executive_narrative_editorial",
    department: "EXECUTIVE_NARRATIVE_EDITORIAL",
    kind: "SPECIALIST",
    tokenBudget: 10000,
    allowStructureChange: true,
    remit: [
      "Own the human truth, concept, hook, escalation, reveal, payoff and emotional progression.",
      "Choose scene and shot structure from the actual story, duration, channel and evidence rather than a formula.",
      "Make every scene necessary and every shot carry a distinct editorial purpose.",
      "Preserve factual, identity, venue, product and brand truth.",
    ],
  }),
  stepDefinition({
    key: "cinematography_camera",
    department: "CINEMATOGRAPHY_CAMERA",
    kind: "SPECIALIST",
    tokenBudget: 9000,
    remit: [
      "Choose the camera language independently for every shot from emotion, blocking, geography, duration, transition and physical constraints.",
      "Specify framing, movement, lens behavior, angle, height, start and end positions, distance, support, speed, focus, depth, composition, screen direction, exposure intent and motivation.",
      "Choose a locked camera whenever movement weakens the scene; movement is permitted only when it serves story, performance or reveal.",
      "Ensure the approved master still can be the exact physical motion origin.",
    ],
  }),
  stepDefinition({
    key: "lighting_production_design",
    department: "LIGHTING_PRODUCTION_DESIGN",
    kind: "SPECIALIST",
    tokenBudget: 8000,
    remit: [
      "Design motivated lighting from the actual location, time, materials, faces, products and intended emotion.",
      "Specify source positions, key/fill/edge, practicals, temperature, exposure hierarchy, contrast, atmosphere, reflections, shadows, skin and product treatment.",
      "Define production design, surfaces, props, wardrobe interaction and environmental stability without generic cinematic language.",
    ],
  }),
  stepDefinition({
    key: "performance_casting_blocking",
    department: "PERFORMANCE_CASTING_BLOCKING",
    kind: "SPECIALIST",
    tokenBudget: 8000,
    remit: [
      "Direct exact human behavior and blocking for every shot.",
      "Specify starting positions, movement paths, eye lines, gesture, breath, facial progression, reaction timing, hand and object contact, posture and relationship to camera.",
      "Direct background performers and crowds so nobody loops, clones, stares at camera or moves without motivation.",
    ],
  }),
  stepDefinition({
    key: "identity_reference_continuity_reality",
    department: "IDENTITY_REFERENCE_CONTINUITY_REALITY",
    kind: "SPECIALIST",
    tokenBudget: 9000,
    remit: [
      "Supervise exact identity, venue, product, logo, brand and factual continuity from canonical references only.",
      "Define preserve, may-change and never-change rules plus entering and leaving continuity state for every shot.",
      "Specify physical reality rules for anatomy, contact, gravity, momentum, reflections, smoke, liquid, fire, crowds, text and object persistence.",
    ],
  }),
  stepDefinition({
    key: "sound_editorial_post",
    department: "SOUND_EDITORIAL_POST",
    kind: "SPECIALIST",
    tokenBudget: 7000,
    remit: [
      "Design dialogue or silence, room tone, Foley, effects, music function, narration, subtitle intent and dynamic range.",
      "Define transition logic, cut motivation, match action, eye line, sound bridges, visual bridges, hold duration and post-production ownership.",
      "Separate image-generation, motion-generation and post-production responsibilities.",
    ],
  }),
  stepDefinition({
    key: "executive_quality_supervision",
    department: "EXECUTIVE_QUALITY_SUPERVISION",
    kind: "SPECIALIST",
    tokenBudget: 7000,
    remit: [
      "Audit the complete production bible as an accountable executive director.",
      "Reject generic, contradictory, physically impossible, reference-unsafe, emotionally empty or provider-fragile direction.",
      "Make every shot independently executable without guessing story, camera, lighting, performance, continuity, references, sound or edit intent.",
    ],
  }),
  stepDefinition({
    key: "temporal_shot_direction",
    department: "FRAME_GOVERNING_TEMPORAL_DIRECTION",
    kind: "TEMPORAL",
    tokenBudget: 14000,
  }),
  stepDefinition({
    key: "audit_1",
    department: "STORYBOARD_AND_TEMPORAL_AUDIT_1",
    kind: "AUDIT",
  }),
  stepDefinition({
    key: "targeted_repair_1",
    department: "TARGETED_DIRECTOR_REPAIR_1",
    kind: "REPAIR",
    tokenBudget: 12000,
    allowStructureChange: true,
  }),
  stepDefinition({
    key: "audit_2",
    department: "STORYBOARD_AND_TEMPORAL_AUDIT_2",
    kind: "AUDIT",
  }),
  stepDefinition({
    key: "targeted_repair_2",
    department: "TARGETED_DIRECTOR_REPAIR_2",
    kind: "REPAIR",
    tokenBudget: 12000,
    allowStructureChange: true,
  }),
  stepDefinition({
    key: "final_audit",
    department: "FINAL_STORYBOARD_AND_TEMPORAL_AUDIT",
    kind: "AUDIT",
  }),
];

function specialistSummary(definition) {
  return {
    key: definition.key,
    department: definition.department,
    kind: definition.kind,
    token_budget: definition.tokenBudget,
    timeout_ms: definition.timeoutMs,
    allow_structure_change: definition.allowStructureChange,
  };
}

function assetManifest(assets = []) {
  return assets
    .filter((asset) => asset?.id || asset?.asset_id)
    .slice(0, 200)
    .map((asset) => ({
      id: asset.id || asset.asset_id,
      name: asset.name || asset.title || asset.file_name || null,
      type: asset.asset_type || asset.type || null,
      tags: list(asset.tags).slice(0, 40),
      roles: unique([
        ...list(asset.reference_roles),
        ...list(asset.reference_role),
        ...list(asset.roles),
        ...list(asset.role),
        ...list(asset.metadata?.reference_roles),
        ...list(asset.analysis?.reference_roles),
      ]),
      description:
        asset.description ||
        asset.caption ||
        asset.analysis?.summary ||
        null,
      analysis: object(asset.analysis),
      rights: asset.rights || asset.metadata?.rights || null,
    }));
}

function referenceIds(plan = {}) {
  const ids = [];

  for (const scene of list(plan.scenes)) {
    for (const actor of list(scene.actors)) {
      ids.push(
        ...list(actor?.identity_reference_asset_ids),
        ...list(actor?.reference_asset_ids),
      );
    }
    for (const shot of list(scene.shots)) {
      ids.push(
        ...list(shot.reference_asset_ids),
        ...list(shot.assets),
        ...list(shot.master_still_contract?.reference_asset_ids),
      );
      for (const actor of list(shot.actors)) {
        ids.push(
          ...list(actor?.identity_reference_asset_ids),
          ...list(actor?.reference_asset_ids),
        );
      }
    }
  }

  return unique(ids);
}

function assertCanonicalReferences(plan = {}, assets = [], stepKey) {
  const available = new Set(
    assets.map((asset) => String(asset.id)).filter(Boolean),
  );
  const unknown = referenceIds(plan).filter((id) => !available.has(id));

  if (unknown.length) {
    throw jobError("CREATIVE_DIRECTOR_JOB_UNKNOWN_REFERENCE_ASSET", {
      step_key: stepKey,
      unknown_asset_ids: unknown,
      canonical_asset_ids: [...available],
    });
  }
}

function deepMerge(base, patch) {
  if (patch === undefined || patch === null) return clone(base);
  if (Array.isArray(patch)) return clone(patch);

  if (
    base &&
    patch &&
    typeof base === "object" &&
    typeof patch === "object" &&
    !Array.isArray(base) &&
    !Array.isArray(patch)
  ) {
    const output = { ...clone(base) };
    for (const [key, value] of Object.entries(patch)) {
      output[key] = deepMerge(base[key], value);
    }
    return output;
  }

  return clone(patch);
}

function sceneNumber(value, index = 0) {
  return Number(value?.scene_number || index + 1);
}

function shotNumber(value, index = 0) {
  return Number(value?.shot_number || index + 1);
}


function assertPlanShape(value, context) {
  const plan = patchObject(value, context);

  if (!Array.isArray(plan.scenes) || !plan.scenes.length) {
    throw jobError(
      "CREATIVE_DIRECTOR_JOB_PLAN_SCENES_REQUIRED",
      { context },
    );
  }

  for (const [sceneIndex, sceneValue] of plan.scenes.entries()) {
    const scene = patchObject(sceneValue, {
      context,
      scene_index: sceneIndex,
    });

    if (!Array.isArray(scene.shots) || !scene.shots.length) {
      throw jobError(
        "CREATIVE_DIRECTOR_JOB_PLAN_SHOTS_REQUIRED",
        {
          context,
          scene_index: sceneIndex,
        },
      );
    }

    for (const [shotIndex, shot] of scene.shots.entries()) {
      patchObject(shot, {
        context,
        scene_index: sceneIndex,
        shot_index: shotIndex,
      });
    }
  }

  return plan;
}

function normalizedShotPatchEntries(
  patches = [],
  context = {},
  expectedCount = null,
) {
  return patchArray(
    patches,
    {
      ...context,
      scope: "shot_patches",
    },
    { optional: true },
  ).map((entry, index) => {
    const source = patchObject(entry, {
      ...context,
      scope: "shot_patch_entry",
      patch_index: index,
    });
    const explicitNumber =
      source.shot_number ??
      source.patch?.shot_number ??
      source.shot_patch?.shot_number;

    const number =
      explicitNumber === undefined ||
      explicitNumber === null ||
      explicitNumber === ""
        ? index + 1
        : Number(explicitNumber);

    if (
      !Number.isInteger(number) ||
      number <= 0 ||
      (
        expectedCount !== null &&
        number > expectedCount
      )
    ) {
      throw jobError(
        "CREATIVE_DIRECTOR_JOB_SHOT_PATCH_NUMBER_INVALID",
        {
          ...context,
          patch_index: index,
          received: explicitNumber ?? null,
          inferred_from_position:
            explicitNumber === undefined ||
            explicitNumber === null ||
            explicitNumber === "",
          expected_count: expectedCount,
        },
      );
    }

    return {
      ...source,
      shot_number: number,
    };
  });
}

function applyShotPatches(
  shots = [],
  patches = [],
  context = {},
) {
  const shotList = patchArray(
    shots,
    {
      ...context,
      scope: "existing_shots",
    },
  );
  const entries = normalizedShotPatchEntries(
    patches,
    context,
    shotList.length,
  );

  return shotList.map((shotValue, index) => {
    const shot = patchObject(shotValue, {
      ...context,
      scope: "existing_shot",
      shot_index: index,
    });
    const number = shotNumber(shot, index);
    const entry = entries.find(
      (candidate) => candidate.shot_number === number,
    );

    if (!entry) return shot;

    const directPatch = Object.fromEntries(
      Object.entries(entry).filter(([key]) =>
        ![
          "scene_number",
          "shot_number",
          "patch",
          "shot_patch",
          "no_change_required",
        ].includes(key),
      ),
    );

    const patch = patchObject(
      entry.patch ??
      entry.shot_patch ??
      directPatch,
      {
        ...context,
        scope: "shot_patch",
        shot_number: number,
      },
      {
        optional:
          entry.no_change_required === true,
      },
    );

    if (
      !Object.keys(patch).length &&
      entry.no_change_required !== true
    ) {
      throw jobError(
        "CREATIVE_DIRECTOR_JOB_SHOT_PATCH_EMPTY",
        {
          ...context,
          shot_number: number,
        },
      );
    }
    const merged = patchObject(
      deepMerge(shot, patch),
      {
        ...context,
        scope: "merged_shot",
        shot_number: number,
      },
    );

    return {
      ...merged,
      shot_number: number,
    };
  });
}

function normalizedScenePatchEntries(
  patches = [],
  context = {},
  expectedCount = null,
) {
  return patchArray(
    patches,
    {
      ...context,
      scope: "scene_patches",
    },
    { optional: true },
  ).map((entry, index) => {
    const source = patchObject(entry, {
      ...context,
      scope: "scene_patch_entry",
      patch_index: index,
    });
    const explicitNumber =
      source.scene_number ??
      source.patch?.scene_number ??
      source.scene_patch?.scene_number;

    const number =
      explicitNumber === undefined ||
      explicitNumber === null ||
      explicitNumber === ""
        ? index + 1
        : Number(explicitNumber);

    if (
      !Number.isInteger(number) ||
      number <= 0 ||
      (
        expectedCount !== null &&
        number > expectedCount
      )
    ) {
      throw jobError(
        "CREATIVE_DIRECTOR_JOB_SCENE_PATCH_NUMBER_INVALID",
        {
          ...context,
          patch_index: index,
          received: explicitNumber ?? null,
          inferred_from_position:
            explicitNumber === undefined ||
            explicitNumber === null ||
            explicitNumber === "",
          expected_count: expectedCount,
        },
      );
    }

    return {
      ...source,
      scene_number: number,
    };
  });
}

function applyPlanPatch(
  plan = {},
  patch = {},
  allowStructureChange = false,
) {
  const basePlan = assertPlanShape(
    plan,
    "CURRENT_PRODUCTION_BIBLE",
  );
  const source = patchObject(
    patch,
    "SPECIALIST_PLAN_PATCH",
  );

  for (const key of ["production_bible", "creative_plan"]) {
    if (source[key] === undefined || source[key] === null) {
      continue;
    }

    const candidate = patchObject(
      source[key],
      {
        scope: key,
      },
    );

    if (
      Array.isArray(candidate.scenes) &&
      candidate.scenes.length
    ) {
      if (!allowStructureChange) {
        throw jobError(
          "CREATIVE_DIRECTOR_JOB_STRUCTURE_CHANGE_FORBIDDEN",
          { scope: key },
        );
      }

      return assertPlanShape(
        deepMerge(basePlan, candidate),
        {
          scope: key,
        },
      );
    }

    if (Object.keys(candidate).length) {
      throw jobError(
        "CREATIVE_DIRECTOR_JOB_PLAN_SCENES_REQUIRED",
        { scope: key },
      );
    }
  }

  const topLevel = patchObject(
    source.top_level ?? source.plan,
    "SPECIALIST_TOP_LEVEL_PATCH",
    { optional: true },
  );

  if (
    Object.prototype.hasOwnProperty.call(
      topLevel,
      "scenes",
    )
  ) {
    throw jobError(
      "CREATIVE_DIRECTOR_JOB_TOP_LEVEL_SCENES_FORBIDDEN",
    );
  }

  const sceneEntries = normalizedScenePatchEntries(
    source.scenes,
    {
      scope: "specialist_plan_patch",
    },
    basePlan.scenes.length,
  );

  if (
    !Object.keys(topLevel).length &&
    !sceneEntries.length
  ) {
    if (source.no_change_required === true) {
      return clone(basePlan);
    }

    throw jobError(
      "CREATIVE_DIRECTOR_JOB_PATCH_EMPTY",
    );
  }

  const topLevelMerged = assertPlanShape(
    deepMerge(basePlan, topLevel),
    "TOP_LEVEL_PATCH_RESULT",
  );

  const output = {
    ...topLevelMerged,
    scenes: topLevelMerged.scenes.map(
      (sceneValue, index) => {
        const scene = patchObject(sceneValue, {
          scope: "existing_scene",
          scene_index: index,
        });
        const number = sceneNumber(scene, index);
        const entry = sceneEntries.find(
          (candidate) =>
            candidate.scene_number === number,
        );

        if (!entry) return scene;

        const directScenePatch =
          Object.fromEntries(
            Object.entries(entry).filter(([key]) =>
              ![
                "scene_number",
                "patch",
                "scene_patch",
                "shots",
                "no_change_required",
              ].includes(key),
            ),
          );

        const scenePatch = patchObject(
          entry.patch ??
          entry.scene_patch ??
          directScenePatch,
          {
            scope: "scene_patch",
            scene_number: number,
          },
          { optional: true },
        );
        const shotPatches = patchArray(
          entry.shots,
          {
            scope: "scene_shot_patches",
            scene_number: number,
          },
          { optional: true },
        );

        if (
          !Object.keys(scenePatch).length &&
          !shotPatches.length &&
          entry.no_change_required !== true
        ) {
          throw jobError(
            "CREATIVE_DIRECTOR_JOB_SCENE_PATCH_EMPTY",
            {
              scene_number: number,
            },
          );
        }

        const mergedScene = patchObject(
          deepMerge(scene, scenePatch),
          {
            scope: "merged_scene",
            scene_number: number,
          },
        );

        return {
          ...mergedScene,
          scene_number: number,
          shots: applyShotPatches(
            scene.shots,
            shotPatches,
            {
              scene_number: number,
            },
          ),
        };
      },
    ),
  };

  return assertPlanShape(
    output,
    "SPECIALIST_PATCH_RESULT",
  );
}

function workerHistory(plan = {}) {
  return list(plan.metadata?.director_job?.workers);
}

function recordWorker(plan = {}, definition, execution, metrics = {}) {
  return {
    ...plan,
    production_version: "resumable-dynamic-director-job-v1",
    metadata: {
      ...object(plan.metadata),
      director_job: {
        ...object(plan.metadata?.director_job),
        version: "resumable-dynamic-director-job-v1",
        workers: [
          ...workerHistory(plan),
          {
            key: definition.key,
            department: definition.department,
            provider: execution?.provider || null,
            model: execution?.model || null,
            confidence: Number(execution?.confidence || 0),
            token_budget:
              execution?.token_budget || definition.tokenBudget,
            timeout_ms:
              execution?.timeout_ms || definition.timeoutMs,
            metrics,
            completed_at: now(),
          },
        ],
      },
    },
  };
}

function completedWorker(plan = {}, key) {
  return workerHistory(plan).some((worker) => worker.key === key);
}


function patchShape(definition) {
  const planPatch = {
    no_change_required: false,
    top_level: {},
    scenes: [
      {
        scene_number: 1,
        patch: {},
        shots: [
          {
            shot_number: 1,
            patch: {},
          },
        ],
      },
    ],
  };

  if (definition.allowStructureChange) {
    planPatch.production_bible = null;
  }

  return {
    result: {
      plan_patch: planPatch,
      decisions: [],
      risks: [],
      missing_evidence: [],
      metrics: {
        fields_improved: 0,
        contradictions_resolved: 0,
        unresolved_questions: 0,
      },
    },
  };
}

async function runSpecialist({
  definition,
  job,
  plan,
  assets,
}) {
  const input = object(job.input_snapshot);
  const execution = await reason({
    task: [
      `You are the ${definition.department} specialist in an autonomous world-class creative agency.`,
      ...definition.remit,
      "Read the entire current production bible before making decisions.",
      "Return only your focused structured patch unless a genuine narrative structure change requires a complete production bible.",
      "Do not rewrite or weaken valid decisions owned by another department.",
      "Do not use generic defaults. Every decision must be specific to this mission, scene, shot, evidence and intended audience response.",
      "Do not invent asset IDs, identities, venue geometry, product facts, logos, claims or rights.",
      "Never return schema labels such as object, array, string, number or boolean as field values.",
      "Include scene_number and shot_number on every addressed patch. Keep scene and shot patch arrays in the same order as the current production bible.",
      "If this department genuinely requires no change, return plan_patch.no_change_required=true and explain the decision separately.",
    ].join(" "),
    input: {
      organization_id: job.organization_id,
      creative_project_id: job.creative_project_id,
      creative_mission_id: job.creative_mission_id,
      objective: input.objective,
      brief: input.brief,
      target_duration_seconds: input.target_duration_seconds,
      requested_outputs: input.requested_outputs,
      platform: input.platform,
      budget_mode: input.budget_mode,
      canonical_assets: assets,
      current_production_bible: plan,
      worker: specialistSummary(definition),
    },
    constraints: {
      original_work_only: true,
      exact_canonical_reference_ids_only: true,
      preserve_factual_truth: true,
      preserve_other_department_decisions: true,
      no_generic_department_defaults: true,
      master_still_before_motion: true,
      structure_change_allowed: definition.allowStructureChange,
    },
    outputShape: patchShape(definition),
    temperature: definition.department === "EXECUTIVE_NARRATIVE_EDITORIAL"
      ? 0.75
      : 0.45,
    maxOutputTokens: definition.tokenBudget,
    timeoutMs: definition.timeoutMs,
    metadata: {
      creative_director_job_id: job.id,
      creative_director_step_key: definition.key,
      creative_director_department: definition.department,
    },
  });

  if (execution.fallback || execution.recovery) {
    throw jobError("CREATIVE_DIRECTOR_JOB_REASONING_FAILED", {
      step_key: definition.key,
      fallback_reason: execution.fallback_reason,
    });
  }

  const result = object(execution.result);
  const patchCandidate =
    result.plan_patch ??
    result.patch;

  if (patchCandidate === undefined) {
    throw jobError(
      "CREATIVE_DIRECTOR_JOB_PATCH_REQUIRED",
      {
        step_key: definition.key,
        received_keys: Object.keys(result),
      },
    );
  }

  const patch = patchObject(
    patchCandidate,
    {
      step_key: definition.key,
      scope: "specialist_result",
    },
  );
  const nextPlan = applyPlanPatch(
    plan,
    patch,
    definition.allowStructureChange,
  );

  assertCanonicalReferences(nextPlan, assets, definition.key);

  return {
    plan: recordWorker(
      nextPlan,
      definition,
      execution,
      object(result.metrics),
    ),
    execution,
    metrics: object(result.metrics),
  };
}


const TEMPORAL_OUTPUT_SHAPE = {
  result: {
    shot_temporal_patches: [
      {
        scene_number: 1,
        shot_number: 1,
        master_still_contract: {},
        temporal_contract: {},
      },
    ],
    metrics: {
      shots_directed: 0,
      timed_items: 0,
      total_frames_governed: 0,
    },
    risks: [],
    missing_evidence: [],
  },
};


function temporalPatchKey(sceneNumberValue, shotNumberValue) {
  return `${sceneNumberValue}:${shotNumberValue}`;
}

function applyTemporalPatches(plan = {}, patches = []) {
  const output = clone(
    assertPlanShape(
      plan,
      "TEMPORAL_CURRENT_PRODUCTION_BIBLE",
    ),
  );
  const entries = patchArray(
    patches,
    "TEMPORAL_SHOT_PATCHES",
  ).map((entryValue, index) => {
    const entry = patchObject(entryValue, {
      scope: "temporal_patch",
      patch_index: index,
    });
    const sceneNumberValue = Number(entry.scene_number);
    const shotNumberValue = Number(entry.shot_number);

    if (
      !Number.isInteger(sceneNumberValue) ||
      sceneNumberValue <= 0 ||
      !Number.isInteger(shotNumberValue) ||
      shotNumberValue <= 0
    ) {
      throw jobError(
        "CREATIVE_TEMPORAL_DIRECTOR_PATCH_ADDRESS_INVALID",
        {
          patch_index: index,
          scene_number: entry.scene_number ?? null,
          shot_number: entry.shot_number ?? null,
        },
      );
    }

    return {
      ...entry,
      scene_number: sceneNumberValue,
      shot_number: shotNumberValue,
    };
  });

  const byKey = new Map();

  for (const entry of entries) {
    const key = temporalPatchKey(
      entry.scene_number,
      entry.shot_number,
    );

    if (byKey.has(key)) {
      throw jobError(
        "CREATIVE_TEMPORAL_DIRECTOR_DUPLICATE_PATCH",
        { key },
      );
    }

    byKey.set(key, entry);
  }

  const expectedKeys = new Set();

  output.scenes = output.scenes.map(
    (scene, sceneIndex) => ({
      ...scene,
      shots: scene.shots.map((shot, shotIndex) => {
        const key = temporalPatchKey(
          sceneIndex + 1,
          shotIndex + 1,
        );
        expectedKeys.add(key);

        const entry = byKey.get(key);

        if (!entry) {
          throw jobError(
            "CREATIVE_TEMPORAL_DIRECTOR_SHOT_PATCH_MISSING",
            {
              scene_number: sceneIndex + 1,
              shot_number: shotIndex + 1,
            },
          );
        }

        const masterStill = patchObject(
          entry.master_still_contract,
          {
            scope: "master_still_contract",
            scene_number: sceneIndex + 1,
            shot_number: shotIndex + 1,
          },
        );
        const temporalContract = patchObject(
          entry.temporal_contract,
          {
            scope: "temporal_contract",
            scene_number: sceneIndex + 1,
            shot_number: shotIndex + 1,
          },
        );

        if (!Object.keys(masterStill).length) {
          throw jobError(
            "CREATIVE_TEMPORAL_DIRECTOR_MASTER_STILL_EMPTY",
            {
              scene_number: sceneIndex + 1,
              shot_number: shotIndex + 1,
            },
          );
        }

        if (!Object.keys(temporalContract).length) {
          throw jobError(
            "CREATIVE_TEMPORAL_DIRECTOR_CONTRACT_EMPTY",
            {
              scene_number: sceneIndex + 1,
              shot_number: shotIndex + 1,
            },
          );
        }

        return {
          ...shot,
          master_still_contract: masterStill,
          temporal_contract: temporalContract,
        };
      }),
    }),
  );

  const unexpected = [...byKey.keys()].filter(
    (key) => !expectedKeys.has(key),
  );

  if (unexpected.length) {
    throw jobError(
      "CREATIVE_TEMPORAL_DIRECTOR_UNKNOWN_PATCH_ADDRESS",
      {
        unexpected,
        expected: [...expectedKeys],
      },
    );
  }

  return assertPlanShape(
    output,
    "TEMPORAL_PATCH_RESULT",
  );
}

async function runTemporalDirector({ definition, job, plan, assets }) {
  const input = object(job.input_snapshot);
  const execution = await reason({
    task: [
      "Create the frame-governing temporal production specification for every shot in the current production bible.",
      "The approved master still is frame 0 at time 0ms and must define exact camera, subject, object, location, lighting, environment, focus and exposure state.",
      "For each shot create time-addressable camera, performance, objects/products, lighting, environment, focus/exposure, sound and editorial tracks or events.",
      "Every changing property needs an owner, initial state, final state, keyframes or event timing, interpolation or behavior, motivation, physical rules and acceptance criteria.",
      "Define immutable locks, directed evolution, entering and leaving continuity, permitted motion and prohibited changes.",
      "Timing must fit the exact shot duration in milliseconds. Do not create repetitive millisecond prose; create sufficient keyframes and events so every frame can inherit a deterministic state.",
      "Return one temporal patch for every shot and do not alter narrative, identity or canonical reference IDs.",
    ].join(" "),
    input: {
      organization_id: job.organization_id,
      creative_project_id: job.creative_project_id,
      creative_mission_id: job.creative_mission_id,
      objective: input.objective,
      brief: input.brief,
      fps: Number(input.fps || 30),
      canonical_assets: assets,
      current_production_bible: plan,
    },
    constraints: {
      master_still_is_frame_zero: true,
      every_frame_inherits_contract: true,
      unspecified_motion_is_forbidden: true,
      exact_shot_duration_required: true,
      exact_canonical_reference_ids_only: true,
      physically_plausible_motion_required: true,
    },
    outputShape: TEMPORAL_OUTPUT_SHAPE,
    temperature: 0.35,
    maxOutputTokens: definition.tokenBudget,
    timeoutMs: definition.timeoutMs,
    metadata: {
      creative_director_job_id: job.id,
      creative_director_step_key: definition.key,
      creative_director_department: definition.department,
    },
  });

  if (execution.fallback || execution.recovery) {
    throw jobError("CREATIVE_TEMPORAL_DIRECTOR_REASONING_FAILED", {
      fallback_reason: execution.fallback_reason,
    });
  }

  const result = object(execution.result);
  const patches = patchArray(
    result.shot_temporal_patches,
    "TEMPORAL_SHOT_PATCHES",
  );
  const shotCount = list(plan.scenes).reduce(
    (total, scene) => total + list(scene.shots).length,
    0,
  );

  if (patches.length !== shotCount) {
    throw jobError("CREATIVE_TEMPORAL_DIRECTOR_PATCH_COUNT_INVALID", {
      expected_shots: shotCount,
      received_patches: patches.length,
    });
  }

  const nextPlan = applyTemporalPatches(plan, patches);
  assertCanonicalReferences(nextPlan, assets, definition.key);

  return {
    plan: recordWorker(
      nextPlan,
      definition,
      execution,
      object(result.metrics),
    ),
    execution,
    metrics: object(result.metrics),
  };
}

function inspectPlan(job, plan) {
  const input = object(job.input_snapshot);
  const assets = list(job.asset_snapshot);
  const storyboard = inspectCreativeStoryboardPlan({
    creativePlan: plan,
    targetDuration: input.target_duration_seconds,
    brief: input.brief,
    assets,
  });
  const temporalReports = [];

  for (const [sceneIndex, scene] of list(plan.scenes).entries()) {
    for (const [shotIndex, shot] of list(scene.shots).entries()) {
      temporalReports.push(
        inspectCreativeShotTemporalContract({
          shot,
          fps: Number(input.fps || 30),
          label: `scene ${sceneIndex + 1} shot ${shotIndex + 1}`,
        }).report,
      );
    }
  }

  const temporalFailures = temporalReports.flatMap(
    (report) => report.failures || [],
  );
  const storyboardFailures = storyboard.report.failures || [];
  const failures = [...storyboardFailures, ...temporalFailures];

  return {
    passed: failures.length === 0,
    failure_count: failures.length,
    storyboard: storyboard.report,
    temporal: {
      passed: temporalFailures.length === 0,
      shot_count: temporalReports.length,
      total_frames: temporalReports.reduce(
        (total, report) => total + Number(report.total_frames || 0),
        0,
      ),
      timed_item_count: temporalReports.reduce(
        (total, report) => total + Number(report.timed_item_count || 0),
        0,
      ),
      reports: temporalReports,
    },
    failures,
    warnings: [
      ...(storyboard.report.warnings || []),
      ...temporalReports.flatMap((report) => report.warnings || []),
    ],
    audited_at: now(),
  };
}


const REPAIR_OUTPUT_SHAPE = {
  result: {
    production_bible: {
      scenes: [],
    },
    addressed_failures: [],
    preserved_decisions: [],
    metrics: {
      failures_targeted: 0,
      fields_improved: 0,
      contradictions_resolved: 0,
    },
  },
};

async function runRepair({ definition, job, plan, assets }) {
  const auditState = object(job.storyboard_audit);
  const latestAudit = list(auditState.history).at(-1) || auditState.latest;

  if (!latestAudit || latestAudit.passed !== false) {
    throw jobError("CREATIVE_DIRECTOR_REPAIR_FAILED_AUDIT_REQUIRED");
  }

  const input = object(job.input_snapshot);
  const execution = await reason({
    task: [
      "Repair the current production bible against every supplied storyboard and temporal audit failure.",
      "Trace each failure to its responsible director department and make evidence-led corrections only where required.",
      "Preserve unrelated approved narrative, camera, lighting, performance, identity, continuity, sound, edit and temporal decisions.",
      "Do not satisfy validation with boilerplate, arbitrary shot counts or generic camera and lighting language.",
      "Return the complete corrected production bible because repairs may cross department boundaries.",
    ].join(" "),
    input: {
      organization_id: job.organization_id,
      creative_project_id: job.creative_project_id,
      creative_mission_id: job.creative_mission_id,
      objective: input.objective,
      brief: input.brief,
      canonical_assets: assets,
      current_production_bible: plan,
      failed_audit: latestAudit,
      repair_number: definition.key.endsWith("_2") ? 2 : 1,
    },
    constraints: {
      exact_canonical_reference_ids_only: true,
      preserve_factual_truth: true,
      preserve_unrelated_approved_decisions: true,
      every_audit_failure_must_be_addressed: true,
      no_generic_validation_filler: true,
      maximum_repair_passes: 2,
    },
    outputShape: REPAIR_OUTPUT_SHAPE,
    temperature: 0.2,
    maxOutputTokens: definition.tokenBudget,
    timeoutMs: definition.timeoutMs,
    metadata: {
      creative_director_job_id: job.id,
      creative_director_step_key: definition.key,
      creative_director_department: definition.department,
    },
  });

  if (execution.fallback || execution.recovery) {
    throw jobError("CREATIVE_DIRECTOR_REPAIR_REASONING_FAILED", {
      fallback_reason: execution.fallback_reason,
    });
  }

  const result = object(execution.result);
  const corrected = assertPlanShape(
    patchObject(
      result.production_bible,
      {
        step_key: definition.key,
        scope: "repair_production_bible",
      },
    ),
    {
      step_key: definition.key,
      scope: "repair_production_bible",
    },
  );

  assertCanonicalReferences(corrected, assets, definition.key);

  return {
    plan: recordWorker(
      corrected,
      definition,
      execution,
      object(result.metrics),
    ),
    execution,
    metrics: object(result.metrics),
  };
}

async function getJobRow(jobId) {
  const { data, error } = await supabaseAdmin
    .from(JOBS)
    .select("*")
    .eq("id", jobId)
    .single();

  if (error) throw error;
  return data;
}

async function getStepRows(jobId) {
  const { data, error } = await supabaseAdmin
    .from(STEPS)
    .select("*")
    .eq("job_id", jobId)
    .order("step_index", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function hydrate(jobId, { includePlan = false } = {}) {
  const [job, steps] = await Promise.all([
    getJobRow(jobId),
    getStepRows(jobId),
  ]);

  return {
    ...job,
    current_plan: includePlan || job.status === "COMPLETED"
      ? job.current_plan
      : null,
    input_snapshot: undefined,
    asset_snapshot: undefined,
    steps,
  };
}

async function updateJob(jobId, values = {}) {
  const { data, error } = await supabaseAdmin
    .from(JOBS)
    .update({
      ...values,
      updated_at: now(),
    })
    .eq("id", jobId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function updateStep(stepId, values = {}) {
  const { data, error } = await supabaseAdmin
    .from(STEPS)
    .update({
      ...values,
      updated_at: now(),
    })
    .eq("id", stepId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function acquireLease(job) {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + LEASE_MS).toISOString();
  let query = supabaseAdmin
    .from(JOBS)
    .update({
      lease_token: token,
      lease_expires_at: expiresAt,
      status: "RUNNING",
      started_at: job.started_at || now(),
      updated_at: now(),
    })
    .eq("id", job.id)
    .eq("organization_id", job.organization_id);

  if (job.lease_token && job.lease_expires_at) {
    query = query.eq("lease_token", job.lease_token);
  } else {
    query = query.is("lease_token", null);
  }

  const { data, error } = await query.select("*").maybeSingle();
  if (error) throw error;
  if (!data) {
    throw jobError("CREATIVE_DIRECTOR_JOB_ALREADY_RUNNING", {
      job_id: job.id,
      lease_expires_at: job.lease_expires_at,
    });
  }

  return { job: data, token };
}

async function releaseLease(jobId, token, values = {}) {
  const { data, error } = await supabaseAdmin
    .from(JOBS)
    .update({
      ...values,
      lease_token: null,
      lease_expires_at: null,
      updated_at: now(),
    })
    .eq("id", jobId)
    .eq("lease_token", token)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

function nextRunnableStep(steps = [], retryFailed = false) {
  if (retryFailed) {
    const failed = steps.find((step) => step.status === "FAILED");
    if (failed) return failed;
  }

  return steps.find((step) => step.status === "WAITING") || null;
}

function definitionFor(step) {
  return STEP_DEFINITIONS.find((definition) =>
    definition.key === step.step_key,
  );
}

function progressValues(steps = []) {
  const completed = steps.filter((step) =>
    ["COMPLETED", "SKIPPED"].includes(step.status),
  ).length;

  return {
    completed_steps: completed,
    progress_percent: steps.length
      ? Math.round((completed / steps.length) * 10000) / 100
      : 0,
  };
}

async function skipRemaining(jobId, fromIndex) {
  const { error } = await supabaseAdmin
    .from(STEPS)
    .update({
      status: "SKIPPED",
      completed_at: now(),
      updated_at: now(),
    })
    .eq("job_id", jobId)
    .gt("step_index", fromIndex)
    .eq("status", "WAITING");

  if (error) throw error;
}

function auditHistory(job, report) {
  const state = object(job.storyboard_audit);
  return {
    latest: report,
    history: [
      ...list(state.history),
      report,
    ],
  };
}

function previousFailureCount(job) {
  const history = list(object(job.storyboard_audit).history);
  return history.length
    ? Number(history.at(-1)?.failure_count || 0)
    : null;
}

export const CreativeDirectorJobRuntime = {
  steps() {
    return STEP_DEFINITIONS.map(specialistSummary);
  },

  async create({
    organization_id,
    creative_mission_id,
    creative_project_id,
    input_snapshot = {},
    assets = [],
  } = {}) {
    if (!organization_id) throw jobError("organization_id required");
    if (!creative_mission_id) {
      throw jobError("creative_mission_id required");
    }
    if (!creative_project_id) {
      throw jobError("creative_project_id required");
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from(JOBS)
      .select("id,status")
      .eq("organization_id", organization_id)
      .eq("creative_project_id", creative_project_id)
      .in("status", ["QUEUED", "RUNNING", "WAITING", "FAILED"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) {
      return hydrate(existing.id);
    }

    const manifest = assetManifest(assets);
    const { data: job, error } = await supabaseAdmin
      .from(JOBS)
      .insert({
        organization_id,
        creative_mission_id,
        creative_project_id,
        status: "QUEUED",
        current_step_index: 0,
        total_steps: STEP_DEFINITIONS.length,
        completed_steps: 0,
        progress_percent: 0,
        input_snapshot: {
          ...input_snapshot,
          target_duration_seconds: Number(
            input_snapshot.target_duration_seconds || 30,
          ),
          fps: Number(input_snapshot.fps || 30),
        },
        asset_snapshot: manifest,
      })
      .select("*")
      .single();

    if (error) throw error;

    const { error: stepsError } = await supabaseAdmin
      .from(STEPS)
      .insert(
        STEP_DEFINITIONS.map((definition, index) => ({
          organization_id,
          job_id: job.id,
          step_key: definition.key,
          step_index: index,
          department: definition.department,
          status: "WAITING",
          metrics: {
            kind: definition.kind,
            token_budget: definition.tokenBudget,
            timeout_ms: definition.timeoutMs,
          },
        })),
      );

    if (stepsError) {
      await supabaseAdmin.from(JOBS).delete().eq("id", job.id);
      throw stepsError;
    }

    return hydrate(job.id);
  },

  async get({ job_id, organization_id, include_plan = false } = {}) {
    const job = await getJobRow(job_id);
    if (organization_id && job.organization_id !== organization_id) {
      throw jobError("CREATIVE_DIRECTOR_JOB_NOT_IN_ORGANIZATION");
    }
    return hydrate(job_id, { includePlan: include_plan });
  },

  async advance({
    job_id,
    organization_id,
    retry_failed = false,
  } = {}) {
    const originalJob = await getJobRow(job_id);
    if (organization_id && originalJob.organization_id !== organization_id) {
      throw jobError("CREATIVE_DIRECTOR_JOB_NOT_IN_ORGANIZATION");
    }
    if (["COMPLETED", "CANCELLED"].includes(originalJob.status)) {
      return hydrate(job_id, { includePlan: true });
    }

    if (
      originalJob.lease_token &&
      originalJob.lease_expires_at &&
      new Date(originalJob.lease_expires_at).getTime() > Date.now()
    ) {
      throw jobError("CREATIVE_DIRECTOR_JOB_ALREADY_RUNNING", {
        lease_expires_at: originalJob.lease_expires_at,
      });
    }

    if (
      originalJob.lease_token &&
      originalJob.lease_expires_at &&
      new Date(originalJob.lease_expires_at).getTime() <= Date.now()
    ) {
      await updateJob(job_id, {
        lease_token: null,
        lease_expires_at: null,
        status: "WAITING",
      });
    }

    const freshJob = await getJobRow(job_id);
    const lease = await acquireLease(freshJob);
    let job = lease.job;
    const token = lease.token;
    let activeStepStartedAt = null;

    try {
      let steps = await getStepRows(job_id);
      const existingFailedStep = steps.find(
        (candidate) => candidate.status === "FAILED",
      );

      if (existingFailedStep && !retry_failed) {
        throw jobError(
          "CREATIVE_DIRECTOR_JOB_FAILED_STEP_RETRY_REQUIRED",
          {
            failed_step_key: existingFailedStep.step_key,
            failed_attempt: existingFailedStep.attempt,
            failed_error: existingFailedStep.error,
          },
        );
      }

      const step = nextRunnableStep(steps, retry_failed);

      if (!step) {
        const progress = progressValues(steps);
        await releaseLease(job_id, token, {
          status: "COMPLETED",
          completed_at: now(),
          ...progress,
        });
        return hydrate(job_id, { includePlan: true });
      }

      const definition = definitionFor(step);
      if (!definition) {
        throw jobError("CREATIVE_DIRECTOR_JOB_STEP_DEFINITION_MISSING", {
          step_key: step.step_key,
        });
      }

      const startedAt = Date.now();
      activeStepStartedAt = startedAt;

      await updateStep(step.id, {
        status: "RUNNING",
        attempt: Number(step.attempt || 0) + 1,
        started_at: now(),
        completed_at: null,
        error: null,
      });
      job = await updateJob(job_id, {
        current_step_key: definition.key,
        current_step_index: step.step_index,
        status: "RUNNING",
        error: null,
      });

      let plan = object(job.current_plan);
      const assets = list(job.asset_snapshot);
      let execution = null;
      let metrics = {};
      let auditReport = null;
      let completeJob = false;
      let failJob = null;

      if (definition.kind === "INITIAL") {
        const input = object(job.input_snapshot);
        plan = await CreativeShotDirectorRuntime.direct({
          organization_id: job.organization_id,
          organization: input.organization || {},
          brand: input.brand || {},
          industry: input.industry || null,
          objective: input.objective || "",
          brief: input.brief || {},
          assets,
          requestedOutputs: input.requested_outputs || [],
          durationSeconds: input.target_duration_seconds || 30,
          platform: input.platform || "multi-channel",
          budgetMode: input.budget_mode || "quality-first",
        });
        assertCanonicalReferences(plan, assets, definition.key);
        execution = {
          provider: "openai",
          model:
            process.env.AVANTIQO_REASONING_MODEL ||
            "gpt-4.1-mini",
          confidence: 70,
          token_budget: definition.tokenBudget,
          timeout_ms: definition.timeoutMs,
        };
        plan = recordWorker(
          plan,
          definition,
          execution,
        );
      } else if (definition.kind === "SPECIALIST") {
        if (!list(plan.scenes).length) {
          throw jobError("CREATIVE_DIRECTOR_JOB_INITIAL_PLAN_REQUIRED");
        }
        if (completedWorker(plan, definition.key)) {
          metrics = { idempotent_skip: true };
        } else {
          const result = await runSpecialist({
            definition,
            job,
            plan,
            assets,
          });
          plan = result.plan;
          execution = result.execution;
          metrics = result.metrics;
        }
      } else if (definition.kind === "TEMPORAL") {
        const result = await runTemporalDirector({
          definition,
          job,
          plan,
          assets,
        });
        plan = result.plan;
        execution = result.execution;
        metrics = result.metrics;
      } else if (definition.kind === "REPAIR") {
        const result = await runRepair({
          definition,
          job,
          plan,
          assets,
        });
        plan = result.plan;
        execution = result.execution;
        metrics = result.metrics;
      } else if (definition.kind === "AUDIT") {
        auditReport = inspectPlan(job, plan);
        const previous = previousFailureCount(job);
        const improved = previous === null ||
          auditReport.failure_count < previous;
        auditReport = {
          ...auditReport,
          audit_step: definition.key,
          previous_failure_count: previous,
          improved,
        };

        if (auditReport.passed) {
          completeJob = true;
          await skipRemaining(job_id, step.step_index);
        } else if (previous !== null && !improved) {
          failJob = serializeError(
            jobError("CREATIVE_DIRECTOR_REPAIR_DID_NOT_IMPROVE", {
              previous_failure_count: previous,
              current_failure_count: auditReport.failure_count,
              audit_step: definition.key,
            }),
          );
        } else if (definition.key === "final_audit") {
          failJob = serializeError(
            jobError("CREATIVE_DIRECTOR_FINAL_AUDIT_REJECTED", auditReport),
          );
        }
      }

      const durationMs = Date.now() - startedAt;
      await updateStep(step.id, {
        status: failJob ? "FAILED" : "COMPLETED",
        provider: execution?.provider || null,
        model: execution?.model || null,
        confidence: execution?.confidence || null,
        duration_ms: durationMs,
        metrics: {
          ...object(step.metrics),
          ...metrics,
          audit: auditReport
            ? {
                passed: auditReport.passed,
                failure_count: auditReport.failure_count,
                improved: auditReport.improved,
              }
            : null,
        },
        error: failJob,
        completed_at: now(),
      });

      if (auditReport) {
        job = await updateJob(job_id, {
          storyboard_audit: auditHistory(job, auditReport),
        });
      }

      steps = await getStepRows(job_id);
      const progress = progressValues(steps);
      const nextStep = steps.find((candidate) =>
        candidate.status === "WAITING",
      );

      await releaseLease(job_id, token, {
        current_plan: plan,
        status: failJob
          ? "FAILED"
          : completeJob
            ? "COMPLETED"
            : "WAITING",
        current_step_key: completeJob || failJob
          ? null
          : nextStep?.step_key || null,
        current_step_index: completeJob || failJob
          ? step.step_index
          : nextStep?.step_index || step.step_index,
        completed_at: completeJob ? now() : null,
        error: failJob,
        ...progress,
      });

      return hydrate(job_id, {
        includePlan: completeJob,
      });
    } catch (error) {
      const serialized = serializeError(error);
      const runningSteps = await getStepRows(job_id);
      const running = runningSteps.find((step) =>
        step.status === "RUNNING",
      );

      if (running) {
        await updateStep(running.id, {
          status: "FAILED",
          duration_ms: activeStepStartedAt
            ? Date.now() - activeStepStartedAt
            : null,
          error: serialized,
          completed_at: now(),
        }).catch(() => null);
      }

      await releaseLease(job_id, token, {
        status: "FAILED",
        error: serialized,
      }).catch(() => null);

      throw error;
    }
  },
};

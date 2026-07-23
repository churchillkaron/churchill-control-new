import {
  reason,
} from "@/lib/creative/reasoning/CreativeReasoningService";

import {
  resolveCreativeFreedomPolicy,
} from "./CreativeFreedomPolicyRuntime";

import {
  compileCreativeProductionSpecification,
  assertCreativePlanMatchesProductionSpecification,
} from "@/lib/creative/production/contracts/CreativeProductionSpecification";

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value || "").trim();
}

function positiveNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? number
    : fallback;
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function alias(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function directorError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function assetRoles(asset = {}) {
  return unique([
    ...list(asset.reference_roles),
    ...list(asset.reference_role),
    ...list(asset.roles),
    ...list(asset.role),
    ...list(asset.metadata?.reference_roles),
    ...list(asset.metadata?.reference_role),
    ...list(asset.analysis?.reference_roles),
    ...list(asset.analysis?.reference_role),
  ]);
}

function compactAsset(asset = {}) {
  return {
    id: asset.id || asset.asset_id || null,
    name:
      asset.name ||
      asset.title ||
      asset.file_name ||
      null,
    asset_type: asset.asset_type || asset.type || null,
    roles: assetRoles(asset),
    tags: list(asset.tags).slice(0, 30),
    description:
      asset.description ||
      asset.caption ||
      asset.analysis?.summary ||
      null,
    analysis: object(asset.analysis),
    approved_reference:
      asset.approved_reference === true ||
      String(asset.status || "").toUpperCase() === "APPROVED" ||
      null,
    rights: asset.rights || asset.metadata?.rights || null,
  };
}

function compactAssets(assets = []) {
  return assets
    .filter((asset) => asset?.id || asset?.asset_id)
    .slice(0, 120)
    .map(compactAsset);
}

function referenceIndex(assets = []) {
  const byId = new Map();
  const aliases = new Map();

  function addAlias(value, id) {
    const key = alias(value);
    if (!key) return;
    const ids = aliases.get(key) || new Set();
    ids.add(id);
    aliases.set(key, ids);
  }

  for (const asset of assets) {
    const id = text(asset.id);
    if (!id) continue;

    byId.set(id, asset);
    addAlias(id, id);
    addAlias(asset.name, id);
    addAlias(asset.asset_type, id);

    for (const role of list(asset.roles)) addAlias(role, id);
    for (const tag of list(asset.tags)) addAlias(tag, id);
  }

  return { byId, aliases };
}

function referenceToken(value) {
  if (typeof value === "string" || typeof value === "number") {
    return text(value);
  }

  const source = object(value);
  return text(
    source.id ||
    source.asset_id ||
    source.reference_asset_id ||
    source.name ||
    source.role,
  );
}

function resolveReferenceToken(value, index) {
  const token = referenceToken(value);
  if (!token) return null;
  if (index.byId.has(token)) return token;

  const candidates = index.aliases.get(alias(token));
  if (candidates?.size === 1) {
    return [...candidates][0];
  }

  return null;
}

function normalizeReferenceIds(value, index, context) {
  const requested = list(value);
  const resolved = [];
  const unresolved = [];

  for (const candidate of requested) {
    const id = resolveReferenceToken(candidate, index);
    if (id) resolved.push(id);
    else if (referenceToken(candidate)) unresolved.push(referenceToken(candidate));
  }

  if (unresolved.length) {
    throw directorError("CREATIVE_DIRECTOR_UNKNOWN_REFERENCE_ASSET", {
      context,
      unknown_asset_ids: unique(unresolved),
      canonical_assets: [...index.byId.values()].map((asset) => ({
        id: asset.id,
        name: asset.name,
        roles: asset.roles,
      })),
    });
  }

  return unique(resolved);
}

function normalizeActor(actor, index, context) {
  const source = typeof actor === "string"
    ? { role: actor }
    : object(actor);

  return {
    ...source,
    role:
      source.role ||
      source.character ||
      source.name ||
      null,
    count: positiveNumber(source.count || source.quantity, 1),
    identity_reference_asset_ids: normalizeReferenceIds(
      source.identity_reference_asset_ids ||
      source.reference_asset_ids ||
      source.identity_reference_asset_id ||
      source.reference_asset_id,
      index,
      context,
    ),
  };
}

function normalizeShot({
  shot,
  sceneNumber,
  shotNumber,
  index,
  freedom,
}) {
  const source = object(shot);
  const duration = positiveNumber(source.duration_seconds);
  const context = {
    scene_number: sceneNumber,
    shot_number: shotNumber,
  };

  if (!duration) {
    throw directorError("CREATIVE_DIRECTOR_SHOT_DURATION_REQUIRED", context);
  }

  const referenceIds = normalizeReferenceIds(
    source.reference_asset_ids || source.assets,
    index,
    context,
  );

  return {
    ...source,
    shot_number: shotNumber,
    title: text(source.title) || null,
    purpose: text(source.purpose) || null,
    duration_seconds: duration,
    opening_frame: text(source.opening_frame) || null,
    closing_frame: text(source.closing_frame) || null,
    action_beats: list(source.action_beats),
    performance_direction: source.performance_direction || null,
    camera: object(source.camera),
    lighting: object(source.lighting),
    actors: list(source.actors).map((actor) =>
      normalizeActor(actor, index, context),
    ),
    products: list(source.products),
    dialogue: list(source.dialogue),
    narration: object(source.narration),
    music: object(source.music),
    sound_effects: list(source.sound_effects),
    subtitles: list(source.subtitles),
    reference_asset_ids: referenceIds,
    assets: referenceIds,
    reference_pack: object(source.reference_pack),
    continuity: object(source.continuity),
    reality_rules: object(source.reality_rules),
    negative_constraints: list(source.negative_constraints),
    quality_requirements: object(source.quality_requirements),
    transition_in: object(source.transition_in),
    transition_out: object(source.transition_out),
    creative_policy: resolveCreativeFreedomPolicy(
      freedom,
      source.creative_policy,
    ),
  };
}

function normalizeScene({
  scene,
  sceneNumber,
  index,
  freedom,
}) {
  const source = object(scene);
  const shots = list(source.shots);
  const context = { scene_number: sceneNumber };

  if (!shots.length) {
    throw directorError("CREATIVE_DIRECTOR_SCENE_SHOTS_REQUIRED", context);
  }

  const normalizedShots = shots.map((shot, shotIndex) => normalizeShot({
    shot,
    sceneNumber,
    shotNumber: shotIndex + 1,
    index,
    freedom,
  }));
  const shotDuration = normalizedShots.reduce(
    (total, shot) => total + Number(shot.duration_seconds || 0),
    0,
  );

  return {
    ...source,
    scene_number: sceneNumber,
    title: text(source.title) || null,
    objective: text(source.objective) || null,
    emotion: source.emotion || null,
    duration_seconds: positiveNumber(source.duration_seconds, shotDuration),
    location: object(source.location),
    actors: list(source.actors).map((actor) =>
      normalizeActor(actor, index, context),
    ),
    products: list(source.products),
    brand_rules: list(source.brand_rules),
    visual_style: object(source.visual_style),
    camera_style: object(source.camera_style),
    audio_style: object(source.audio_style),
    humor: object(source.humor),
    creative_policy: resolveCreativeFreedomPolicy(
      freedom,
      source.creative_policy,
    ),
    shots: normalizedShots,
  };
}

function durationMilliseconds(value) {
  const duration = positiveNumber(value);
  return duration
    ? Math.round(duration * 1000)
    : 0;
}

function reconcileCreativePlanDuration(
  plan = {},
  specification = {},
) {
  const targetDuration =
    positiveNumber(
      specification.target_duration_seconds,
    );

  if (
    specification.temporal !== true ||
    !targetDuration
  ) {
    return plan;
  }

  const scenes = list(plan.scenes);
  const slots = [];

  scenes.forEach((scene, sceneIndex) => {
    list(scene?.shots).forEach(
      (shot, shotIndex) => {
        const milliseconds =
          durationMilliseconds(
            shot?.duration_seconds ||
            shot?.duration,
          );

        if (!milliseconds) {
          return;
        }

        slots.push({
          sceneIndex,
          shotIndex,
          milliseconds,
        });
      },
    );
  });

  if (!slots.length) {
    return plan;
  }

  const targetMilliseconds =
    Math.round(targetDuration * 1000);

  const originalMilliseconds =
    slots.reduce(
      (total, slot) =>
        total + slot.milliseconds,
      0,
    );

  const minimumMilliseconds = 100;

  const maximumMilliseconds =
    positiveNumber(
      specification.max_shot_duration_seconds,
    )
      ? Math.round(
          Number(
            specification
              .max_shot_duration_seconds,
          ) * 1000,
        )
      : Number.MAX_SAFE_INTEGER;

  if (
    targetMilliseconds <
      slots.length * minimumMilliseconds ||
    targetMilliseconds >
      slots.length * maximumMilliseconds
  ) {
    throw directorError(
      "CREATIVE_DIRECTOR_DURATION_RECONCILIATION_IMPOSSIBLE",
      {
        target_duration_seconds:
          targetDuration,
        shot_count:
          slots.length,
        minimum_shot_duration_seconds:
          minimumMilliseconds / 1000,
        maximum_shot_duration_seconds:
          Number.isSafeInteger(
            maximumMilliseconds,
          )
            ? maximumMilliseconds / 1000
            : null,
      },
    );
  }

  const ratio =
    targetMilliseconds /
    originalMilliseconds;

  const rawAllocations =
    slots.map(
      (slot) =>
        slot.milliseconds * ratio,
    );

  const allocations =
    rawAllocations.map(
      (raw) =>
        Math.min(
          maximumMilliseconds,
          Math.max(
            minimumMilliseconds,
            Math.floor(raw),
          ),
        ),
    );

  let difference =
    targetMilliseconds -
    allocations.reduce(
      (total, value) =>
        total + value,
      0,
    );

  while (difference !== 0) {
    if (difference > 0) {
      const eligible =
        allocations
          .map((value, index) => ({
            index,
            value,
            fraction:
              rawAllocations[index] -
              Math.floor(
                rawAllocations[index],
              ),
          }))
          .filter(
            (entry) =>
              entry.value <
              maximumMilliseconds,
          )
          .sort(
            (left, right) =>
              right.fraction -
                left.fraction ||
              right.value -
                left.value ||
              left.index -
                right.index,
          );

      if (!eligible.length) {
        throw directorError(
          "CREATIVE_DIRECTOR_DURATION_RECONCILIATION_CAPACITY_EXHAUSTED",
        );
      }

      for (const entry of eligible) {
        if (difference <= 0) break;

        const capacity =
          maximumMilliseconds -
          allocations[entry.index];

        const share =
          Math.max(
            1,
            Math.floor(
              difference /
              eligible.length,
            ),
          );

        const addition =
          Math.min(
            capacity,
            share,
            difference,
          );

        allocations[entry.index] +=
          addition;

        difference -= addition;
      }

      continue;
    }

    const eligible =
      allocations
        .map((value, index) => ({
          index,
          value,
          fraction:
            rawAllocations[index] -
            Math.floor(
              rawAllocations[index],
            ),
        }))
        .filter(
          (entry) =>
            entry.value >
            minimumMilliseconds,
        )
        .sort(
          (left, right) =>
            left.fraction -
              right.fraction ||
            right.value -
              left.value ||
            left.index -
              right.index,
        );

    if (!eligible.length) {
      throw directorError(
        "CREATIVE_DIRECTOR_DURATION_RECONCILIATION_FLOOR_EXHAUSTED",
      );
    }

    for (const entry of eligible) {
      if (difference >= 0) break;

      const capacity =
        allocations[entry.index] -
        minimumMilliseconds;

      const share =
        Math.max(
          1,
          Math.floor(
            Math.abs(difference) /
            eligible.length,
          ),
        );

      const reduction =
        Math.min(
          capacity,
          share,
          Math.abs(difference),
        );

      allocations[entry.index] -=
        reduction;

      difference += reduction;
    }
  }

  const reconciledByPosition =
    new Map();

  slots.forEach((slot, index) => {
    reconciledByPosition.set(
      `${slot.sceneIndex}:${slot.shotIndex}`,
      allocations[index] / 1000,
    );
  });

  const reconciledScenes =
    scenes.map((scene, sceneIndex) => {
      const shots =
        list(scene?.shots).map(
          (shot, shotIndex) => {
            const duration =
              reconciledByPosition.get(
                `${sceneIndex}:${shotIndex}`,
              );

            return duration
              ? {
                  ...shot,
                  duration_seconds:
                    duration,
                }
              : shot;
          },
        );

      const sceneDuration =
        Math.round(
          shots.reduce(
            (total, shot) =>
              total +
              Number(
                shot?.duration_seconds ||
                0,
              ),
            0,
          ) * 1000,
        ) / 1000;

      return {
        ...scene,
        duration_seconds:
          sceneDuration,
        shots,
      };
    });

  const reconciledTotal =
    reconciledScenes.reduce(
      (total, scene) =>
        total +
        list(scene?.shots).reduce(
          (shotTotal, shot) =>
            shotTotal +
            Number(
              shot?.duration_seconds ||
              0,
            ),
          0,
        ),
      0,
    );

  const roundedTotal =
    Math.round(
      reconciledTotal * 1000,
    ) / 1000;

  if (
    roundedTotal !==
    targetDuration
  ) {
    throw directorError(
      "CREATIVE_DIRECTOR_DURATION_RECONCILIATION_FAILED",
      {
        target_duration_seconds:
          targetDuration,
        reconciled_duration_seconds:
          roundedTotal,
      },
    );
  }

  return {
    ...plan,
    scenes:
      reconciledScenes,
    metadata: {
      ...object(plan.metadata),
      planned_duration_seconds:
        targetDuration,
      duration_reconciliation: {
        applied:
          originalMilliseconds !==
          targetMilliseconds,
        method:
          "PROPORTIONAL_MILLISECOND_APPORTIONMENT",
        original_duration_seconds:
          originalMilliseconds / 1000,
        target_duration_seconds:
          targetDuration,
        reconciled_duration_seconds:
          roundedTotal,
        shot_count:
          slots.length,
      },
    },
  };
}

function normalizePlan({
  result,
  reasoning,
  objective,
  brief,
  assets,
  durationSeconds,
  freedom,
  repairApplied = false,
}) {
  if (reasoning?.fallback || reasoning?.recovery) {
    throw directorError("CREATIVE_DIRECTOR_REASONING_UNAVAILABLE", {
      fallback_reason: reasoning.fallback_reason || null,
      recovery_source: reasoning.recovery_source || null,
    });
  }

  const source = object(result);
  const sourceScenes = list(source.scenes);
  if (!sourceScenes.length) {
    throw directorError("CREATIVE_DIRECTOR_SCENES_REQUIRED", {
      received_keys: Object.keys(source),
    });
  }

  const index = referenceIndex(assets);
  const scenes = sourceScenes.map((scene, sceneIndex) => normalizeScene({
    scene,
    sceneNumber: sceneIndex + 1,
    index,
    freedom,
  }));
  const plannedDuration = scenes.reduce(
    (total, scene) => total + Number(scene.duration_seconds || 0),
    0,
  );

  if (!plannedDuration) {
    throw directorError("CREATIVE_DIRECTOR_DURATION_REQUIRED");
  }

  return {
    ...source,
    production_version: "dynamic-evidence-shot-director-v3",
    title: text(source.title) || null,
    logline: text(source.logline) || null,
    objective: text(source.objective) || text(objective) || null,
    audience_truth: source.audience_truth || null,
    story_thesis: source.story_thesis || null,
    brand_promise: source.brand_promise || null,
    emotional_arc: list(source.emotional_arc),
    humor_strategy: object(source.humor_strategy),
    visual_motif: source.visual_motif || null,
    sound_motif: source.sound_motif || null,
    concepts: list(source.concepts),
    selected_concept: object(source.selected_concept),
    research_summary: source.research_summary || null,
    scenes,
    final_quality_standard: {
      ...object(brief.quality_policy),
      ...object(source.final_quality_standard),
    },
    creative_policy: freedom,
    metadata: {
      ...object(source.metadata),
      director_contract: "DYNAMIC_EVIDENCE_LED_PRODUCTION_BIBLE_V3",
      target_duration_seconds: Number(durationSeconds),
      planned_duration_seconds: plannedDuration,
      available_reference_asset_ids: [...index.byId.keys()],
      reference_validation_repair_applied: repairApplied,
      unspecified_fields_are_open: true,
    },
  };
}

const OUTPUT_SHAPE = {
  result: {
    title: "string",
    logline: "string",
    objective: "string",
    audience_truth: "string",
    story_thesis: "string",
    brand_promise: "string",
    emotional_arc: ["string"],
    humor_strategy: "object",
    visual_motif: "string",
    sound_motif: "string",
    concepts: ["object"],
    selected_concept: "object",
    research_summary: "string",
    scenes: [
      {
        scene_number: "number",
        title: "string",
        objective: "string",
        emotion: "string",
        duration_seconds: "number",
        location: "object",
        actors: ["object"],
        products: ["object"],
        brand_rules: ["string"],
        visual_style: "object",
        camera_style: "object",
        audio_style: "object",
        humor: "object",
        shots: [
          {
            shot_number: "number",
            title: "string",
            purpose: "string",
            duration_seconds: "number",
            opening_frame: "string",
            closing_frame: "string",
            action_beats: ["object"],
            performance_direction: "string",
            camera: "object",
            lighting: "object",
            actors: ["object"],
            products: ["object"],
            dialogue: ["object"],
            narration: "object",
            music: "object",
            sound_effects: ["string"],
            subtitles: ["object"],
            reference_asset_ids: ["string"],
            reference_pack: "object",
            continuity: "object",
            reality_rules: "object",
            negative_constraints: ["string"],
            quality_requirements: "object",
            transition_in: "object",
            transition_out: "object",
          },
        ],
      },
    ],
    final_quality_standard: "object",
    metadata: "object",
  },
};

async function directOnce({
  input,
  freedom,
  repair = null,
  structuralReplan = null,
}) {
  const task = structuralReplan
    ? [
        "Replan the complete production bible against the immutable production specification.",
        "Correct scene structure, shot structure, duration coverage, pacing and required reference placement while preserving valid factual, brand, identity and narrative decisions.",
        "The production specification is authoritative. Every temporal shot must respect the dynamic maximum shot duration and the complete plan must exactly cover the target duration.",
        "Use only exact canonical asset IDs. Preserve required references and do not invent evidence.",
        "Return the complete corrected production bible as strict JSON.",
      ].join(" ")
    : repair
    ? [
        "Repair the supplied production bible after canonical reference validation failed.",
        "Keep valid creative decisions unchanged.",
        "Replace names, labels, roles or invented reference tokens with exact IDs from canonical_assets only.",
        "Remove a reference only when it is optional; never invent evidence.",
        "When exact identity, venue, product or brand truth is required but no matching asset exists, record the missing evidence in metadata and leave the reference empty.",
        "Return the complete corrected production bible as strict JSON.",
      ].join(" ")
    : [
        "Create a complete production bible from the supplied business truth, mission, references and creative policy.",
        "Choose narrative form, genre, concept, pacing, scene count, shot count, camera language, performance, sound and humor dynamically from the evidence.",
        "Do not import a generic campaign template or invent factual brand, venue, product or identity claims.",
        "Use only exact reference asset IDs present in the supplied asset manifest.",
        "Every scene must contain at least one independently directed shot with a positive duration.",
        "Design each visual shot for an approved master still before motion generation.",
        "Return strict JSON matching the requested structure.",
      ].join(" ");

  return reason({
    task,
    input: structuralReplan
      ? {
          ...input,
          current_production_bible:
            structuralReplan.currentPlan,
          structural_failure:
            structuralReplan.failure,
          canonical_assets: input.assets,
        }
      : repair
        ? {
            ...input,
            invalid_production_bible: repair.result,
            validation_error: repair.error,
            canonical_assets: input.assets,
          }
        : input,
    constraints: {
      original_work_only: true,
      no_living_artist_identity_or_style_imitation: true,
      preserve_declared_factual_truth: true,
      preserve_declared_reference_identity: true,
      target_duration_seconds: input.target_duration_seconds,
      master_still_before_video: true,
      exact_reference_ids_only: true,
      creative_policy: freedom,
    },
    outputShape: OUTPUT_SHAPE,
    temperature: structuralReplan
      ? 0.35
      : repair
        ? 0.2
        : Number(
            freedom.provider_controls?.temperature ??
            0.9,
          ),
  });
}

export const CreativeShotDirectorRuntime = {
  async replanStructure({
    organization_id,
    organization = {},
    brand = {},
    industry = null,
    objective = "",
    brief = {},
    assets = [],
    requestedOutputs = [],
    durationSeconds = 30,
    platform = "multi-channel",
    budgetMode = "quality-first",
    productionSpecification = null,
    currentPlan = {},
    structuralFailure = {},
  } = {}) {
    if (!organization_id) {
      throw directorError("organization_id required");
    }

    const evidenceAssets = compactAssets(assets);
    const freedom = resolveCreativeFreedomPolicy(
      organization,
      brand,
      brief,
      brief.quality_policy,
      brief.creative_policy,
    );
    const specification =
      compileCreativeProductionSpecification({
        organization_id,
        input: {
          organization,
          brand,
          industry,
          objective,
          brief,
          requested_outputs: requestedOutputs,
          target_duration_seconds:
            durationSeconds,
          platform,
          budget_mode: budgetMode,
          production_specification:
            productionSpecification,
        },
        assets: evidenceAssets,
        existing: productionSpecification,
      });
    const input = {
      organization_id,
      organization,
      brand,
      industry,
      objective,
      brief,
      assets: evidenceAssets,
      requested_outputs: requestedOutputs,
      target_duration_seconds:
        specification.target_duration_seconds,
      platform,
      budget_mode: budgetMode,
      creative_policy: freedom,
      production_specification:
        specification,
    };
    const execution = await directOnce({
      input,
      freedom,
      structuralReplan: {
        currentPlan,
        failure: structuralFailure,
      },
    });
    const normalizedPlan =
      normalizePlan({
        result: execution?.result,
        reasoning: execution,
        objective,
        brief,
        assets: evidenceAssets,
        durationSeconds:
          specification.target_duration_seconds,
        freedom,
        repairApplied: true,
      });

    const plan =
      reconcileCreativePlanDuration(
        normalizedPlan,
        specification,
      );

    const report =
      assertCreativePlanMatchesProductionSpecification({
        plan,
        specification,
      });

    return {
      plan: {
        ...plan,
        production_specification:
          specification,
        metadata: {
          ...object(plan.metadata),
          production_specification_key:
            specification.specification_key,
          production_specification_report:
            report,
          structural_replan_applied: true,
        },
      },
      execution,
      report,
    };
  },

  async direct({
    organization_id,
    organization = {},
    brand = {},
    industry = null,
    objective = "",
    brief = {},
    assets = [],
    requestedOutputs = [],
    durationSeconds = 30,
    platform = "multi-channel",
    budgetMode = "quality-first",
    productionSpecification = null,
  } = {}) {
    if (!organization_id) {
      throw directorError("organization_id required");
    }

    const targetDuration = positiveNumber(durationSeconds, 30);
    const evidenceAssets = compactAssets(assets);
    const freedom = resolveCreativeFreedomPolicy(
      organization,
      brand,
      brief,
      brief.quality_policy,
      brief.creative_policy,
    );
    const specification =
      compileCreativeProductionSpecification({
        organization_id,
        input: {
          organization,
          brand,
          industry,
          objective,
          brief,
          requested_outputs: requestedOutputs,
          target_duration_seconds: targetDuration,
          platform,
          budget_mode: budgetMode,
          production_specification:
            productionSpecification,
        },
        assets: evidenceAssets,
        existing: productionSpecification,
      });
    const input = {
      organization_id,
      organization,
      brand,
      industry,
      objective,
      brief,
      assets: evidenceAssets,
      requested_outputs: requestedOutputs,
      target_duration_seconds: targetDuration,
      platform,
      budget_mode: budgetMode,
      creative_policy: freedom,
      production_specification:
        specification,
    };
    const first = await directOnce({
      input,
      freedom,
    });

    let initialPlan = null;

    try {
      initialPlan =
        reconcileCreativePlanDuration(
          normalizePlan({
            result: first?.result,
            reasoning: first,
            objective,
            brief,
            assets: evidenceAssets,
            durationSeconds:
              targetDuration,
            freedom,
          }),
          specification,
        );

      const report =
        assertCreativePlanMatchesProductionSpecification({
          plan: initialPlan,
          specification,
        });

      return {
        ...initialPlan,
        production_specification:
          specification,
        metadata: {
          ...object(initialPlan.metadata),
          production_specification_key:
            specification.specification_key,
          production_specification_report:
            report,
          structural_replan_applied:
            false,
        },
      };
    } catch (error) {
      if (
        error.code ===
          "CREATIVE_PRODUCTION_SPECIFICATION_PLAN_MISMATCH" &&
        initialPlan
      ) {
        const replanned =
          await CreativeShotDirectorRuntime.replanStructure({
            organization_id,
            organization,
            brand,
            industry,
            objective,
            brief,
            assets,
            requestedOutputs,
            durationSeconds:
              targetDuration,
            platform,
            budgetMode,
            productionSpecification:
              specification,
            currentPlan:
              initialPlan,
            structuralFailure: {
              code:
                error.code,
              ...(error.details || {}),
            },
          });

        return replanned.plan;
      }

      if (
        error.code !==
        "CREATIVE_DIRECTOR_UNKNOWN_REFERENCE_ASSET"
      ) {
        throw error;
      }

      const repaired = await directOnce({
        input,
        freedom,
        repair: {
          result: first?.result,
          error: error.details,
        },
      });

      const plan =
        reconcileCreativePlanDuration(
          normalizePlan({
            result: repaired?.result,
            reasoning: repaired,
            objective,
            brief,
            assets: evidenceAssets,
            durationSeconds:
              targetDuration,
            freedom,
            repairApplied: true,
          }),
          specification,
        );

      const report =
        assertCreativePlanMatchesProductionSpecification({
          plan,
          specification,
        });

      return {
        ...plan,
        production_specification:
          specification,
        metadata: {
          ...object(plan.metadata),
          production_specification_key:
            specification.specification_key,
          production_specification_report:
            report,
        },
      };
    }
  },
};

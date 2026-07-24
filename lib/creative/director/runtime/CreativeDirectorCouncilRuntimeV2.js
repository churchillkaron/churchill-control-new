import { reason } from "@/lib/creative/reasoning/CreativeReasoningService";
import { resolveCreativeFreedomPolicy } from "./CreativeFreedomPolicyRuntime";

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function councilError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function compactAssets(assets = []) {
  return assets
    .filter((asset) => asset?.id || asset?.asset_id)
    .slice(0, 160)
    .map((asset) => ({
      id: asset.id || asset.asset_id,
      name: asset.name || asset.title || asset.file_name || null,
      type: asset.asset_type || asset.type || null,
      reference_roles: unique([
        ...list(asset.reference_roles),
        ...list(asset.reference_role),
        ...list(asset.roles),
        ...list(asset.role),
        ...list(asset.metadata?.reference_roles),
        ...list(asset.analysis?.reference_roles),
      ]),
      tags: list(asset.tags).slice(0, 40),
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
    }));
}

function mergeValue(base, candidate) {
  if (candidate === undefined || candidate === null) return clone(base);
  if (
    base &&
    candidate &&
    typeof base === "object" &&
    typeof candidate === "object" &&
    !Array.isArray(base) &&
    !Array.isArray(candidate)
  ) {
    const output = { ...clone(base) };
    for (const [key, value] of Object.entries(candidate)) {
      output[key] = mergeValue(base[key], value);
    }
    return output;
  }
  if (Array.isArray(candidate)) {
    return candidate.length ? clone(candidate) : clone(base || []);
  }
  return clone(candidate);
}

function mergeFullPlan(basePlan = {}, candidatePlan = {}, allowStructureChange) {
  const baseScenes = list(basePlan.scenes);
  const candidateScenes = list(candidatePlan.scenes);
  if (!candidateScenes.length) {
    throw councilError("CREATIVE_DIRECTOR_COUNCIL_SCENES_REQUIRED");
  }

  const merged = mergeValue(basePlan, candidatePlan);
  const sourceScenes = allowStructureChange ? candidateScenes : baseScenes;
  merged.scenes = sourceScenes.map((scene, sceneIndex) => {
    const sceneNumber = sceneIndex + 1;
    const baseScene = allowStructureChange
      ? baseScenes.find((item, index) =>
          Number(item.scene_number || index + 1) ===
          Number(scene.scene_number || sceneNumber),
        ) || {}
      : scene;
    const candidateScene = allowStructureChange
      ? scene
      : candidateScenes.find((item, index) =>
          Number(item.scene_number || index + 1) === sceneNumber,
        ) || {};
    const nextScene = mergeValue(baseScene, candidateScene);
    const baseShots = list(baseScene.shots);
    const candidateShots = list(candidateScene.shots);
    const sourceShots = allowStructureChange ? candidateShots : baseShots;

    nextScene.scene_number = sceneNumber;
    nextScene.shots = sourceShots.map((shot, shotIndex) => {
      const shotNumber = shotIndex + 1;
      const baseShot = allowStructureChange
        ? baseShots.find((item, index) =>
            Number(item.shot_number || index + 1) ===
            Number(shot.shot_number || shotNumber),
          ) || {}
        : shot;
      const candidateShot = allowStructureChange
        ? shot
        : candidateShots.find((item, index) =>
            Number(item.shot_number || index + 1) === shotNumber,
          ) || {};
      return {
        ...mergeValue(baseShot, candidateShot),
        shot_number: shotNumber,
      };
    });
    return nextScene;
  });

  return merged;
}

function cleanPatch(value = {}) {
  const patch = { ...object(value) };
  delete patch.scene_number;
  delete patch.shot_number;
  delete patch.scenes;
  delete patch.shots;
  return patch;
}

function applyDepartmentPatch(plan = {}, patch = {}) {
  const merged = mergeValue(plan, cleanPatch(patch.plan_patch));
  const scenePatches = list(patch.scene_patches);
  const shotPatches = list(patch.shot_patches);

  merged.scenes = list(plan.scenes).map((scene, sceneIndex) => {
    const sceneNumber = sceneIndex + 1;
    const scenePatch = scenePatches.find(
      (entry) => Number(entry?.scene_number) === sceneNumber,
    );
    const nextScene = mergeValue(scene, cleanPatch(scenePatch?.patch));
    nextScene.scene_number = sceneNumber;
    nextScene.shots = list(scene.shots).map((shot, shotIndex) => {
      const shotNumber = shotIndex + 1;
      const shotPatch = shotPatches.find(
        (entry) =>
          Number(entry?.scene_number) === sceneNumber &&
          Number(entry?.shot_number) === shotNumber,
      );
      return {
        ...mergeValue(shot, cleanPatch(shotPatch?.patch)),
        shot_number: shotNumber,
      };
    });
    return nextScene;
  });

  return merged;
}

function referenceIds(plan = {}) {
  const values = [];
  for (const scene of list(plan.scenes)) {
    for (const actor of list(scene.actors)) {
      values.push(
        ...list(actor?.identity_reference_asset_ids),
        ...list(actor?.reference_asset_ids),
      );
    }
    for (const shot of list(scene.shots)) {
      values.push(
        ...list(shot.reference_asset_ids),
        ...list(shot.assets),
      );
      for (const actor of list(shot.actors)) {
        values.push(
          ...list(actor?.identity_reference_asset_ids),
          ...list(actor?.reference_asset_ids),
        );
      }
    }
  }
  return unique(values);
}

function assertCanonicalReferences(plan = {}, assets = [], workerId) {
  const available = new Set(assets.map((asset) => String(asset.id)));
  const unknown = referenceIds(plan).filter((id) => !available.has(id));
  if (unknown.length) {
    throw councilError("CREATIVE_DIRECTOR_COUNCIL_UNKNOWN_REFERENCE_ASSET", {
      worker_id: workerId,
      unknown_asset_ids: unknown,
      canonical_asset_ids: [...available],
    });
  }
}

function councilHistory(plan = {}) {
  return list(plan.metadata?.director_council?.workers);
}

function recordWorker(plan, worker, execution, options = {}) {
  return {
    ...plan,
    metadata: {
      ...object(plan.metadata),
      director_council: {
        ...object(plan.metadata?.director_council),
        version: "dynamic-specialist-director-council-v2",
        workers: [
          ...councilHistory(plan),
          {
            id: worker.id,
            department: worker.department,
            provider: execution?.provider || null,
            model: execution?.model || null,
            confidence: Number(execution?.confidence || 0),
            repair: options.repair === true,
            status: options.status || "COMPLETED",
            retry: options.retry === true,
            output_mode: options.outputMode || "FULL_PLAN",
            fallback_reason: execution?.fallback_reason || null,
            recovery_source: execution?.recovery_source || null,
            completed_at: new Date().toISOString(),
          },
        ],
      },
    },
  };
}

const SPECIALISTS = [
  {
    id: "executive_narrative_editorial",
    department: "EXECUTIVE_NARRATIVE_EDITORIAL",
    allowStructureChange: true,
    remit: "Own concept, human truth, story architecture, pacing, scene and shot structure, hook, escalation, reveal and payoff while preserving factual truth.",
  },
  {
    id: "cinematography_camera",
    department: "CINEMATOGRAPHY_CAMERA",
    allowStructureChange: false,
    remit: "Direct framing, camera movement, lens, angle, height, start and end positions, support, speed, focus, composition, screen direction, exposure intent and camera motivation for every shot.",
  },
  {
    id: "lighting_production_design",
    department: "LIGHTING_PRODUCTION_DESIGN",
    allowStructureChange: false,
    remit: "Direct motivated lighting, source positions, key/fill/edge, practicals, temperature, exposure hierarchy, contrast, atmosphere, reflections, shadows, skin, product treatment and environmental stability.",
  },
  {
    id: "performance_casting_blocking",
    department: "PERFORMANCE_CASTING_BLOCKING",
    allowStructureChange: false,
    remit: "Direct casting truth, starting positions, movement paths, eye lines, gesture, facial progression, breath, reaction timing, object contact, posture, wardrobe and background behavior.",
  },
  {
    id: "identity_reference_continuity_reality",
    department: "IDENTITY_REFERENCE_CONTINUITY_REALITY",
    allowStructureChange: false,
    remit: "Own canonical references, preserve rules, never-change invariants, permitted-change boundaries, entering and leaving state, continuity locks and human, physical and environmental reality.",
  },
  {
    id: "sound_editorial_post",
    department: "SOUND_EDITORIAL_POST",
    allowStructureChange: false,
    remit: "Direct dialogue or silence, room tone, Foley, sound effects, music, narration, subtitles, transitions, cut motivation, sound and visual bridges and post-production ownership.",
  },
  {
    id: "executive_quality_supervisor",
    department: "EXECUTIVE_QUALITY_SUPERVISION",
    allowStructureChange: false,
    remit: "Audit specificity, contradictions, physical reality, reference safety, emotion, provider fragility, measurable quality requirements, failure risks and correction strategy.",
  },
];

const COMPLETE_PLAN_SHAPE = {
  result: {
    production_bible: {
      title: "string",
      logline: "string",
      objective: "string",
      audience_truth: "string",
      story_thesis: "string",
      brand_promise: "string",
      emotional_arc: ["string"],
      visual_motif: "string",
      sound_motif: "string",
      selected_concept: "object",
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
              production_design: "object",
              actors: ["object"],
              products: ["object"],
              dialogue: ["object"],
              narration: "object",
              music: "object",
              sound_effects: ["string"],
              reference_asset_ids: ["string"],
              reference_pack: "object",
              continuity: "object",
              reality_rules: "object",
              negative_constraints: ["string"],
              quality_requirements: "object",
              transition_in: "object",
              transition_out: "object",
              post_production: "object",
            },
          ],
        },
      ],
      final_quality_standard: "object",
      metadata: "object",
    },
  },
};

const PATCH_SHAPE = {
  result: {
    department_patch: {
      plan_patch: "object",
      scene_patches: [
        { scene_number: "number", patch: "object" },
      ],
      shot_patches: [
        {
          scene_number: "number",
          shot_number: "number",
          patch: "object",
        },
      ],
      decisions: ["object"],
      risks: ["object"],
      missing_evidence: ["object"],
    },
  },
};

function planCandidate(execution, workerId) {
  const result = object(execution?.result);
  const plan =
    result.production_bible ||
    result.creative_plan ||
    result.plan ||
    (Array.isArray(result.scenes) ? result : null);
  if (!plan?.scenes?.length) {
    throw councilError("CREATIVE_DIRECTOR_COUNCIL_PLAN_REQUIRED", {
      worker_id: workerId,
      received_keys: Object.keys(result),
    });
  }
  return plan;
}

function patchCandidate(execution, workerId) {
  const result = object(execution?.result);
  const patch = object(result.department_patch || result.patch || result);
  if (!Object.keys(patch).length) {
    throw councilError("CREATIVE_DIRECTOR_COUNCIL_PATCH_REQUIRED", {
      worker_id: workerId,
      received_keys: Object.keys(result),
    });
  }
  return patch;
}

function unavailable(execution = {}) {
  return execution.fallback === true || execution.recovery === true;
}

function taskFor(worker, { patchMode, repair, retry }) {
  return [
    `You are the ${worker.department} specialist in an autonomous world-class creative agency.`,
    worker.remit,
    "Study the mission, evidence and current production bible before deciding.",
    patchMode
      ? "Return only department-owned plan, scene and shot patches keyed by existing scene_number and shot_number. Never repeat the full bible or change structure."
      : "Return the complete corrected production bible; structure may change only because this worker owns structure.",
    "Preserve all valid decisions owned by other departments.",
    "Do not invent asset IDs, people, identities, brand facts, venue geometry, products or claims.",
    "Every actor must explicitly define starting_position, movement_path, eye_line, gesture, reaction_timing and object_contact.",
    "Every shot must explicitly define reference preserve rules, never-change invariants, permitted-change boundaries, continuity entering and leaving states, locks, and human, physical and environmental reality rules.",
    repair
      ? "Repair every supplied audit failure directly and preserve unrelated approved direction."
      : "Add only specific evidence-derived direction owned by your department.",
    retry
      ? "This is a compact retry after provider unavailability. Return the smallest complete patch without commentary."
      : "Return strict JSON only.",
  ].join(" ");
}

async function askWorker({
  worker,
  plan,
  context,
  assets,
  freedom,
  audit,
  repair,
  patchMode,
  retry,
}) {
  return reason({
    task: taskFor(worker, { patchMode, repair, retry }),
    input: {
      organization_id: context.organization_id,
      creative_project_id: context.creative_project_id,
      creative_mission_id: context.creative_mission_id,
      objective: context.objective,
      brief: context.brief,
      target_duration_seconds: context.target_duration_seconds,
      requested_outputs: context.requested_outputs,
      platform: context.platform,
      budget_mode: context.budget_mode,
      creative_policy: freedom,
      canonical_assets: assets,
      current_production_bible: plan,
      storyboard_audit: audit,
      worker: {
        id: worker.id,
        department: worker.department,
        output_mode: patchMode ? "DEPARTMENT_PATCH" : "FULL_PLAN",
        allow_structure_change: patchMode
          ? false
          : worker.allowStructureChange,
      },
    },
    constraints: {
      original_work_only: true,
      no_living_artist_identity_or_style_imitation: true,
      preserve_factual_truth: true,
      exact_canonical_reference_ids_only: true,
      master_still_before_motion: true,
      no_generic_department_defaults: true,
      structure_change_allowed: patchMode
        ? false
        : worker.allowStructureChange,
      creative_policy: freedom,
    },
    outputShape: patchMode ? PATCH_SHAPE : COMPLETE_PLAN_SHAPE,
    temperature: repair || retry
      ? 0.2
      : Number(freedom.provider_controls?.specialist_temperature ?? 0.65),
    maxOutputTokens: patchMode ? (retry ? 4500 : 7000) : 16000,
    timeoutMs: patchMode ? 120000 : 240000,
    metadata: {
      structured_output_name:
        `creative_${worker.id}_${patchMode ? "patch" : "plan"}_${retry ? "retry" : "primary"}`,
      creative_director_step_key: worker.id,
      creative_director_output_mode: patchMode
        ? "DEPARTMENT_PATCH"
        : "FULL_PLAN",
      creative_director_retry: retry,
    },
  });
}

function mergeExecution(plan, execution, worker, assets, patchMode) {
  const merged = patchMode
    ? applyDepartmentPatch(plan, patchCandidate(execution, worker.id))
    : mergeFullPlan(
        plan,
        planCandidate(execution, worker.id),
        worker.allowStructureChange,
      );
  assertCanonicalReferences(merged, assets, worker.id);
  return merged;
}

async function runWorker({
  worker,
  plan,
  context,
  assets,
  freedom,
  repair = false,
  audit = null,
}) {
  const primaryPatchMode = !worker.allowStructureChange;
  const primary = await askWorker({
    worker,
    plan,
    context,
    assets,
    freedom,
    audit,
    repair,
    patchMode: primaryPatchMode,
    retry: false,
  });

  if (!unavailable(primary)) {
    const merged = mergeExecution(
      plan,
      primary,
      worker,
      assets,
      primaryPatchMode,
    );
    return recordWorker(merged, worker, primary, {
      repair,
      outputMode: primaryPatchMode ? "DEPARTMENT_PATCH" : "FULL_PLAN",
    });
  }

  const retry = await askWorker({
    worker,
    plan,
    context,
    assets,
    freedom,
    audit,
    repair,
    patchMode: true,
    retry: true,
  });

  if (unavailable(retry)) {
    return recordWorker(plan, worker, retry, {
      repair,
      retry: true,
      status: "DEGRADED_PROVIDER_UNAVAILABLE",
      outputMode: "DEPARTMENT_PATCH",
    });
  }

  const merged = mergeExecution(
    plan,
    retry,
    { ...worker, allowStructureChange: false },
    assets,
    true,
  );
  return recordWorker(merged, worker, retry, {
    repair,
    retry: true,
    status: "COMPLETED_AFTER_RETRY",
    outputMode: "DEPARTMENT_PATCH",
  });
}

function structuralRepairRequired(audit = {}) {
  return list(audit.failures).some((failure) => {
    const value = String(failure || "").toLowerCase();
    return (
      value.includes("production bible has no") ||
      /scene \d+: no shots/.test(value) ||
      value.includes("scene duration does not equal") ||
      value.includes("total shot duration") ||
      value.includes("required story beats missing") ||
      value.includes("duplicate title") ||
      value.includes("duration outside")
    );
  });
}

function runtimeContext(input) {
  return {
    organization_id: input.organization_id,
    creative_project_id: input.creative_project_id,
    creative_mission_id: input.creative_mission_id,
    objective: input.objective || "",
    brief: input.brief || {},
    target_duration_seconds: Number(input.targetDuration || 30),
    requested_outputs: input.requestedOutputs || [],
    platform: input.platform || "multi-channel",
    budget_mode: input.budgetMode || "quality-first",
  };
}

export const CreativeDirectorCouncilRuntime = {
  async enrich(input = {}) {
    if (!input.organization_id) {
      throw councilError("organization_id required");
    }
    if (!input.initialPlan?.scenes?.length) {
      throw councilError("CREATIVE_DIRECTOR_COUNCIL_INITIAL_PLAN_REQUIRED");
    }

    const assets = compactAssets(input.assets || []);
    const freedom = resolveCreativeFreedomPolicy(
      input.brief || {},
      input.brief?.quality_policy,
      input.brief?.creative_policy,
      input.initialPlan.creative_policy,
    );
    const context = runtimeContext(input);
    let plan = clone(input.initialPlan);

    for (const worker of SPECIALISTS) {
      plan = await runWorker({
        worker,
        plan,
        context,
        assets,
        freedom,
      });
    }

    const workers = councilHistory(plan);
    return {
      creativePlan: {
        ...plan,
        production_version: "dynamic-director-council-v2",
      },
      report: {
        version: "dynamic-specialist-director-council-v2",
        worker_count: SPECIALISTS.length,
        workers,
        degraded_workers: workers.filter(
          (worker) => worker.status === "DEGRADED_PROVIDER_UNAVAILABLE",
        ),
        structure_decided_by: "EXECUTIVE_NARRATIVE_EDITORIAL",
        camera_decided_by: "CINEMATOGRAPHY_CAMERA",
        non_structural_output_mode: "DEPARTMENT_PATCH",
        compact_retry_enabled: true,
        final_validator_authoritative: true,
        generic_defaults_forbidden: true,
      },
    };
  },

  async repair(input = {}) {
    if (!input.creativePlan?.scenes?.length) {
      throw councilError("CREATIVE_DIRECTOR_COUNCIL_REPAIR_PLAN_REQUIRED");
    }
    if (!input.audit || input.audit.passed !== false) {
      return {
        creativePlan: input.creativePlan,
        report: { repaired: false, reason: "NO_FAILED_AUDIT" },
      };
    }

    const assets = compactAssets(input.assets || []);
    const freedom = resolveCreativeFreedomPolicy(
      input.brief || {},
      input.brief?.quality_policy,
      input.brief?.creative_policy,
      input.creativePlan.creative_policy,
    );
    const worker = {
      id: "director_council_targeted_repair",
      department: "DIRECTOR_COUNCIL_TARGETED_REPAIR",
      allowStructureChange: structuralRepairRequired(input.audit),
      remit: "Trace every audit failure to its responsible department and repair it with specific evidence-derived decisions without generic boilerplate.",
    };
    const repaired = await runWorker({
      worker,
      plan: input.creativePlan,
      context: runtimeContext(input),
      assets,
      freedom,
      repair: true,
      audit: input.audit,
    });

    return {
      creativePlan: {
        ...repaired,
        production_version: "dynamic-director-council-v2-repaired",
      },
      report: {
        repaired: true,
        worker: councilHistory(repaired).at(-1) || null,
        addressed_failures: list(input.audit.failures),
        structure_change_required: worker.allowStructureChange,
        final_validator_authoritative: true,
      },
    };
  },
};

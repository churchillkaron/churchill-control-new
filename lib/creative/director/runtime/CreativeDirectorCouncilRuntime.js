import {
  reason,
} from "@/lib/creative/reasoning/CreativeReasoningService";

import {
  resolveCreativeFreedomPolicy,
} from "./CreativeFreedomPolicyRuntime";

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

function compactAsset(asset = {}) {
  return {
    id: asset.id || asset.asset_id || null,
    name:
      asset.name ||
      asset.title ||
      asset.file_name ||
      null,
    type: asset.asset_type || asset.type || null,
    reference_roles: unique([
      ...list(asset.reference_roles),
      ...list(asset.reference_role),
      ...list(asset.roles),
      ...list(asset.role),
      ...list(asset.metadata?.reference_roles),
      ...list(asset.metadata?.reference_role),
      ...list(asset.analysis?.reference_roles),
      ...list(asset.analysis?.reference_role),
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
  };
}

function compactAssets(assets = []) {
  return assets
    .filter((asset) => asset?.id || asset?.asset_id)
    .slice(0, 160)
    .map(compactAsset);
}

function planFromReasoning(execution = {}, workerId) {
  if (execution?.fallback || execution?.recovery) {
    throw councilError("CREATIVE_DIRECTOR_COUNCIL_REASONING_UNAVAILABLE", {
      worker_id: workerId,
      fallback_reason: execution.fallback_reason || null,
      recovery_source: execution.recovery_source || null,
    });
  }

  const result = object(execution?.result);
  const plan =
    result.production_bible ||
    result.creative_plan ||
    result.plan ||
    (Array.isArray(result.scenes) ? result : null);

  if (!plan || !Array.isArray(plan.scenes) || !plan.scenes.length) {
    throw councilError("CREATIVE_DIRECTOR_COUNCIL_PLAN_REQUIRED", {
      worker_id: workerId,
      received_keys: Object.keys(result),
    });
  }

  return plan;
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

function sceneKey(scene = {}, index = 0) {
  return String(scene.scene_number || index + 1);
}

function shotKey(shot = {}, index = 0) {
  return String(shot.shot_number || index + 1);
}

function mergeShots(baseShots = [], candidateShots = [], allowStructureChange) {
  if (allowStructureChange) {
    return candidateShots.map((shot, index) => {
      const matching = baseShots.find(
        (base, baseIndex) => shotKey(base, baseIndex) === shotKey(shot, index),
      );
      return mergeValue(matching || {}, shot);
    });
  }

  return baseShots.map((shot, index) => {
    const matching = candidateShots.find(
      (candidate, candidateIndex) =>
        shotKey(candidate, candidateIndex) === shotKey(shot, index),
    );
    return mergeValue(shot, matching || {});
  });
}

function mergeScenes(baseScenes = [], candidateScenes = [], allowStructureChange) {
  const source = allowStructureChange ? candidateScenes : baseScenes;

  return source.map((scene, index) => {
    const base = allowStructureChange
      ? baseScenes.find(
          (candidate, candidateIndex) =>
            sceneKey(candidate, candidateIndex) === sceneKey(scene, index),
        ) || {}
      : scene;
    const candidate = allowStructureChange
      ? scene
      : candidateScenes.find(
          (value, candidateIndex) =>
            sceneKey(value, candidateIndex) === sceneKey(scene, index),
        ) || {};
    const merged = mergeValue(base, candidate);
    const baseShots = list(base.shots);
    const candidateShots = list(candidate.shots);

    return {
      ...merged,
      scene_number: index + 1,
      shots: mergeShots(
        baseShots,
        candidateShots,
        allowStructureChange,
      ).map((shot, shotIndex) => ({
        ...shot,
        shot_number: shotIndex + 1,
      })),
    };
  });
}

function mergePlan(basePlan = {}, candidatePlan = {}, {
  allowStructureChange = false,
} = {}) {
  const base = object(basePlan);
  const candidate = object(candidatePlan);
  const merged = mergeValue(base, candidate);
  const baseScenes = list(base.scenes);
  const candidateScenes = list(candidate.scenes);

  if (!candidateScenes.length) {
    throw councilError("CREATIVE_DIRECTOR_COUNCIL_SCENES_REQUIRED");
  }

  return {
    ...merged,
    scenes: mergeScenes(
      baseScenes,
      candidateScenes,
      allowStructureChange,
    ),
  };
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
  const available = new Set(
    assets.map((asset) => String(asset.id)).filter(Boolean),
  );
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

function recordWorker(plan = {}, {
  worker,
  execution,
  repair = false,
}) {
  return {
    ...plan,
    metadata: {
      ...object(plan.metadata),
      director_council: {
        ...object(plan.metadata?.director_council),
        version: "dynamic-specialist-director-council-v1",
        workers: [
          ...councilHistory(plan),
          {
            id: worker.id,
            department: worker.department,
            provider: execution?.provider || null,
            model: execution?.model || null,
            confidence: Number(execution?.confidence || 0),
            repair,
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
    remit: [
      "Own the concept, human truth, story architecture, hook, escalation, reveal, payoff and audience response.",
      "Choose scene count and shot count from the actual story, target duration, channel and evidence rather than a duration formula.",
      "Make every scene necessary and every shot carry a distinct editorial function.",
      "Design pacing, transitions and emotional progression so the production feels authored rather than assembled.",
      "Preserve factual, identity, product, venue and brand truth.",
    ],
  },
  {
    id: "cinematography_camera",
    department: "CINEMATOGRAPHY_CAMERA",
    allowStructureChange: false,
    remit: [
      "Direct every shot as a cinematographer, not as a field filler.",
      "Read scene objective, emotion, action, blocking, geography, reference perspective, duration, transition and edit relationship before choosing the camera.",
      "For every shot specify framing, movement, lens or lens behavior, angle, camera height, start position, end position, subject distance, support or stabilization, movement speed, focus strategy, depth of field, composition, screen direction and exposure intent.",
      "Explain camera motivation: why this exact camera decision serves the performance, reveal, product action, tension, comedy, intimacy or scale.",
      "Choose locked camera when movement weakens the scene; choose movement only when story, blocking or reveal motivates it.",
      "Plan a master-still composition that can transition into physically credible motion without identity or geometry drift.",
    ],
  },
  {
    id: "lighting_production_design",
    department: "LIGHTING_PRODUCTION_DESIGN",
    allowStructureChange: false,
    remit: [
      "Design motivated lighting and production detail from the real location, time, materials, faces, products and mood.",
      "For every shot specify source motivation, source positions, key/fill/edge relationship, practicals, color temperature, exposure hierarchy, contrast, atmosphere, reflections, shadows, skin treatment, product treatment and continuity.",
      "Define set dressing, props, surfaces, wardrobe interaction, environmental behavior and what must remain physically stable.",
      "Avoid generic cinematic lighting language; make decisions specific enough for generation and QA.",
    ],
  },
  {
    id: "performance_casting_blocking",
    department: "PERFORMANCE_CASTING_BLOCKING",
    allowStructureChange: false,
    remit: [
      "Direct human behavior, casting truth and blocking for every shot.",
      "Specify starting position, movement path, eye lines, gesture, facial progression, breath, reaction timing, hand and object contact, posture, wardrobe state and relationship to camera.",
      "Design background behavior and crowd choreography when present so people do not loop, clone, stare at camera or move without motivation.",
      "Make humor, tension, warmth or authority arise from precise behavior and timing rather than generic expressions.",
    ],
  },
  {
    id: "identity_reference_continuity_reality",
    department: "IDENTITY_REFERENCE_CONTINUITY_REALITY",
    allowStructureChange: false,
    remit: [
      "Supervise exact identity, venue, product, logo, brand and factual continuity from canonical references.",
      "Assign only canonical reference asset IDs and explain each asset's role in each shot.",
      "For every shot define reference preserve rules, may-change boundaries, never-change invariants and continuity locks.",
      "Track entering and leaving state for wardrobe, props, product state, body position, eye line, screen direction, light direction, architecture, signage and time.",
      "Specify physical reality rules for anatomy, contact, gravity, momentum, reflections, smoke, liquid, fire, crowds, text and object persistence.",
    ],
  },
  {
    id: "sound_editorial_post",
    department: "SOUND_EDITORIAL_POST",
    allowStructureChange: false,
    remit: [
      "Design the sonic and editorial experience shot by shot.",
      "Specify dialogue or silence, room tone, Foley, sound effects, music function, musical transitions, narration, subtitle intent and dynamic range.",
      "Define transition-in and transition-out logic, cut motivation, match action, eye line, sound bridge, visual bridge, hold duration and post-production treatment.",
      "Separate what belongs in image generation, motion generation and post so text, logos, graphics, color and sound are applied in the correct stage.",
    ],
  },
  {
    id: "executive_quality_supervisor",
    department: "EXECUTIVE_QUALITY_SUPERVISION",
    allowStructureChange: false,
    remit: [
      "Audit the complete production bible as an accountable executive director before any media generation.",
      "Reject generic, contradictory, physically impossible, reference-unsafe, emotionally empty or provider-fragile direction.",
      "Strengthen each shot's specificity, measurable quality requirements, failure risks and correction strategy without replacing authored decisions with templates.",
      "Confirm that a worker receiving one shot has enough information to produce it without guessing the story, camera, light, performance, continuity, references, sound or intended edit.",
    ],
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
              production_design: "object",
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
              post_production: "object",
            },
          ],
        },
      ],
      final_quality_standard: "object",
      metadata: "object",
    },
    decisions: ["object"],
    risks: ["object"],
    missing_evidence: ["object"],
  },
};

async function runWorker({
  worker,
  plan,
  context,
  assets,
  freedom,
  repair = false,
  audit = null,
}) {
  const execution = await reason({
    task: [
      `You are the ${worker.department} specialist inside an autonomous world-class creative agency.`,
      ...worker.remit,
      "Study the complete current production bible and all supplied evidence before deciding.",
      "Return the complete production bible, preserving every valid decision and all detail owned by other departments.",
      "Do not fill fields with generic defaults. Every added decision must be inferred from this exact mission, scene, shot, evidence and creative policy.",
      "Do not invent asset IDs, brand facts, people, venue geometry, product details or claims.",
      "Unspecified creative choices remain open until this department has enough evidence to make a reasoned decision.",
      repair
        ? "Repair every supplied audit failure directly and preserve unrelated approved direction."
        : "Enrich the plan within your department and expose contradictions or missing evidence in structured metadata.",
    ].join(" "),
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
        allow_structure_change: worker.allowStructureChange,
      },
    },
    constraints: {
      original_work_only: true,
      no_living_artist_identity_or_style_imitation: true,
      preserve_factual_truth: true,
      exact_canonical_reference_ids_only: true,
      master_still_before_motion: true,
      no_generic_department_defaults: true,
      structure_change_allowed: worker.allowStructureChange,
      creative_policy: freedom,
    },
    outputShape: COMPLETE_PLAN_SHAPE,
    temperature: repair
      ? 0.2
      : Number(freedom.provider_controls?.specialist_temperature ?? 0.65),
  });

  const candidate = planFromReasoning(execution, worker.id);
  const merged = mergePlan(plan, candidate, {
    allowStructureChange: worker.allowStructureChange,
  });
  assertCanonicalReferences(merged, assets, worker.id);

  return recordWorker(merged, {
    worker,
    execution,
    repair,
  });
}

export const CreativeDirectorCouncilRuntime = {
  async enrich({
    organization_id,
    creative_project_id,
    creative_mission_id,
    objective = "",
    brief = {},
    assets = [],
    requestedOutputs = [],
    targetDuration = 30,
    platform = "multi-channel",
    budgetMode = "quality-first",
    initialPlan,
  } = {}) {
    if (!organization_id) {
      throw councilError("organization_id required");
    }
    if (!initialPlan?.scenes?.length) {
      throw councilError("CREATIVE_DIRECTOR_COUNCIL_INITIAL_PLAN_REQUIRED");
    }

    const evidenceAssets = compactAssets(assets);
    const freedom = resolveCreativeFreedomPolicy(
      brief,
      brief.quality_policy,
      brief.creative_policy,
      initialPlan.creative_policy,
    );
    const context = {
      organization_id,
      creative_project_id,
      creative_mission_id,
      objective,
      brief,
      target_duration_seconds: Number(targetDuration || 30),
      requested_outputs: requestedOutputs,
      platform,
      budget_mode: budgetMode,
    };
    let plan = clone(initialPlan);

    for (const worker of SPECIALISTS) {
      plan = await runWorker({
        worker,
        plan,
        context,
        assets: evidenceAssets,
        freedom,
      });
    }

    return {
      creativePlan: {
        ...plan,
        production_version: "dynamic-director-council-v1",
      },
      report: {
        version: "dynamic-specialist-director-council-v1",
        worker_count: SPECIALISTS.length,
        workers: councilHistory(plan),
        structure_decided_by: "EXECUTIVE_NARRATIVE_EDITORIAL",
        camera_decided_by: "CINEMATOGRAPHY_CAMERA",
        generic_defaults_forbidden: true,
      },
    };
  },

  async repair({
    organization_id,
    creative_project_id,
    creative_mission_id,
    objective = "",
    brief = {},
    assets = [],
    requestedOutputs = [],
    targetDuration = 30,
    platform = "multi-channel",
    budgetMode = "quality-first",
    creativePlan,
    audit,
  } = {}) {
    if (!creativePlan?.scenes?.length) {
      throw councilError("CREATIVE_DIRECTOR_COUNCIL_REPAIR_PLAN_REQUIRED");
    }
    if (!audit || audit.passed !== false) {
      return {
        creativePlan,
        report: {
          repaired: false,
          reason: "NO_FAILED_AUDIT",
        },
      };
    }

    const evidenceAssets = compactAssets(assets);
    const freedom = resolveCreativeFreedomPolicy(
      brief,
      brief.quality_policy,
      brief.creative_policy,
      creativePlan.creative_policy,
    );
    const context = {
      organization_id,
      creative_project_id,
      creative_mission_id,
      objective,
      brief,
      target_duration_seconds: Number(targetDuration || 30),
      requested_outputs: requestedOutputs,
      platform,
      budget_mode: budgetMode,
    };
    const repairWorker = {
      id: "director_council_targeted_repair",
      department: "DIRECTOR_COUNCIL_TARGETED_REPAIR",
      allowStructureChange: audit.failures?.some((failure) =>
        /scene|shot|duration|story beat/i.test(String(failure)),
      ) === true,
      remit: [
        "Act as the accountable supervisor of all director departments.",
        "Trace every audit failure to narrative, camera, lighting, performance, reference, continuity, physical reality, sound, edit or technical planning.",
        "Repair the production bible with specific decisions derived from the mission and evidence.",
        "Do not satisfy validation by inserting generic boilerplate or arbitrary scene and shot counts.",
      ],
    };
    const repaired = await runWorker({
      worker: repairWorker,
      plan: creativePlan,
      context,
      assets: evidenceAssets,
      freedom,
      repair: true,
      audit,
    });

    return {
      creativePlan: {
        ...repaired,
        production_version: "dynamic-director-council-v1-repaired",
      },
      report: {
        repaired: true,
        worker: councilHistory(repaired).at(-1) || null,
        addressed_failures: list(audit.failures),
      },
    };
  },
};

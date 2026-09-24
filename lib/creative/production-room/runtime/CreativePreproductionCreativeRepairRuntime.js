import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { UsageRuntime } from "@/lib/platform/service-runtime/usage/UsageRuntime";
import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import { evaluateBenchmarkLab } from "../../director/runtime/CreativeBenchmarkLabRuntime.js";
import { executeApprovedPreproductionReasoning } from "./CreativePreproductionSpendApprovalRuntime.js";

export const CREATIVE_PREPRODUCTION_CREATIVE_REPAIR_CONTRACT =
  "CREATIVE_PREPRODUCTION_CREATIVE_REPAIR_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function text(value) {
  return String(value ?? "").trim();
}
function repairPatchObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (
      Array.isArray(value.signature_images) ||
      Array.isArray(value.shot_repairs) ||
      Array.isArray(value.final_shot_repairs) ||
      text(value.story_resolution) ||
      value.concept_visual_system != null ||
      (value.benchmark_lab && typeof value.benchmark_lab === "object") ||
      (value.repair_patch && typeof value.repair_patch === "object") ||
      (value.creative_floor && typeof value.creative_floor === "object") ||
      (value.final_answer && typeof value.final_answer === "object")
    )
  );
}

function normalizeFailureKeyedRepairPatch(value = {}) {
  const source = object(
    value.final_answer ||
    value.repair_patch ||
    value.creative_floor ||
    value,
  );
  if (!Object.keys(source).length) return value;

  if (
    text(source.story_resolution) ||
    source.concept_visual_system != null ||
    Array.isArray(source.shot_repairs)
  ) {
    return {
      story_resolution: text(source.story_resolution) || null,
      concept_visual_system: source.concept_visual_system ?? null,
      signature_images: list(
        source.signature_images ||
        source.beauty_hero_shot_deficit ||
        source.BEAUTY_HERO_SHOT_DEFICIT,
      ),
      shot_repairs: list(source.shot_repairs).map((entry) => ({
        ...entry,
        shot_id: text(entry?.shot_id || entry?.id),
        visual: text(entry?.visual || entry?.repaired_text || entry?.repair) || null,
      })),
      benchmark_lab:
        source.benchmark_lab ||
        source.CREATIVE_BENCHMARK_LAB_V1 ||
        source.BENCHMARK_LAB_V1 ||
        source.creative_benchmark_lab_v1 ||
        null,
      repair_summary: list(source.repair_summary || value.repair_summary),
      protected_elements_preserved: list(
        source.protected_elements_preserved || value.protected_elements_preserved,
      ),
    };
  }

  const genericEntries = list(source.GENERIC_TECH_REVEAL);
  const generic = genericEntries.length
    ? object(genericEntries[0])
    : object(source.GENERIC_TECH_REVEAL);
  const genericRevealReplacement = text(
    generic.repaired_text ||
    generic.repair ||
    generic.story_resolution,
  ) || null;
  const soundEntries = list(source.SOUND_WORLD_TOO_FLAT);
  const sound = soundEntries.length
    ? { shot_repairs: soundEntries }
    : object(source.SOUND_WORLD_TOO_FLAT);
  const suppliedShotRepairs = list(sound.shot_repairs);
  const sourceSounds = list(sound.source_sounds);
  const soundRepairs = suppliedShotRepairs.length
    ? suppliedShotRepairs.map((entry) => ({
        shot_id: text(entry?.shot_id || entry?.id),
        audio: {
          ...object(entry?.audio),
          source_sound: text(entry?.audio?.source_sound || entry?.source_sound),
        },
        sound_design: {
          ...object(entry?.sound_design),
          source_sound: text(
            entry?.sound_design?.source_sound ||
            entry?.audio?.source_sound ||
            entry?.source_sound,
          ),
        },
      })).filter((entry) => entry.shot_id && entry.audio.source_sound)
    : sourceSounds.map((entry) => ({
        shot_id: text(entry?.shot_id || entry?.id),
        audio: {
          source_sound: text(entry?.source_sound),
          sound_effects: [],
          mix_intent: text(entry?.mix_intent || entry?.causal_beat || entry?.place),
        },
        sound_design: {
          source_sound: text(entry?.source_sound),
          causal_beat: text(entry?.causal_beat),
          place: text(entry?.place),
        },
      })).filter((entry) => entry.shot_id && entry.audio.source_sound);

  const beauty = list(source.BEAUTY_HERO_SHOT_DEFICIT)
    .map(text)
    .filter((entry) => entry.length >= 40);

  let benchmarkLab =
    source.CREATIVE_BENCHMARK_LAB_V1 ||
    source.BENCHMARK_LAB_V1 ||
    source.BENCHMARK_LAB_CONTRACT_REQUIRED ||
    source.BENCHMARK_LAB ||
    null;
  if (
    benchmarkLab &&
    typeof benchmarkLab === "object" &&
    !Array.isArray(benchmarkLab) &&
    benchmarkLab.creative_benchmark_lab_v1
  ) {
    benchmarkLab = benchmarkLab.creative_benchmark_lab_v1;
  }

  return {
    story_resolution: text(generic.story_resolution) || null,
    concept_visual_system: generic.concept_visual_system ?? null,
    generic_reveal_replacement: genericRevealReplacement,
    signature_images: beauty,
    shot_repairs: soundRepairs,
    benchmark_lab: benchmarkLab,
    repair_summary: list(value.repair_summary),
    protected_elements_preserved: list(value.protected_elements_preserved),
  };
}

function parseRepairJsonText(value) {
  const source = text(value);
  if (!source) return null;
  try {
    const parsed = JSON.parse(source);
    return repairPatchObject(parsed) ? parsed : null;
  } catch (error) {
    const boundary = String(error?.message || "").match(
      /Unexpected non-whitespace character after JSON at position (\d+)/,
    );
    if (boundary) {
      const prefix = source.slice(0, Number(boundary[1])).trim();
      try {
        const parsed = JSON.parse(prefix);
        if (repairPatchObject(parsed)) return parsed;
      } catch {}
    }
  }

  // Qwen local structured output has occasionally emitted one known delimiter
  // error after benchmark_lab: a closing array bracket immediately before the
  // top-level repair_summary key. Repair only that exact contract boundary.
  const repaired = source.replace(
    /\n\s*\],\s*\n\s*"repair_summary"/,
    '\n  },\n  "repair_summary"',
  );
  if (repaired === source) return null;
  try {
    const parsed = JSON.parse(repaired);
    return repairPatchObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function findRepairPatch(value, depth = 0, seen = new Set()) {
  if (depth > 7 || value == null) return null;
  if (typeof value === "string") return parseRepairJsonText(value);
  if (typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (repairPatchObject(value)) return value;

  const preferredKeys = [
    "text", "answer", "content", "output", "raw", "result", "data",
    "provider_result", "providerResult", "metadata",
  ];
  for (const key of preferredKeys) {
    if (!(key in value)) continue;
    const found = findRepairPatch(value[key], depth + 1, seen);
    if (found) return found;
  }
  for (const nested of Object.values(value)) {
    const found = findRepairPatch(nested, depth + 1, seen);
    if (found) return found;
  }
  return null;
}

function parseOutput(result = {}) {
  const patch = findRepairPatch(result);
  return patch ? normalizeFailureKeyedRepairPatch(patch) : null;
}
function flattenShots(plan = {}) {
  return list(plan.scenes).flatMap((scene) =>
    list(scene.shots).map((shot) => ({ ...shot, scene_id: shot.scene_id || scene.id })),
  );
}
const GENERIC_REVEAL_DIAGNOSTIC =
  /(glowing|luminous).{0,40}(globe|world|map|wave.{0,30}(logo|brand))|dots?.{0,30}(connect|network)|particles?.{0,40}(logo|brand)|light.{0,30}wave.{0,30}(logo|brand)|hologram|digital network/i;

function prose(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(prose).join(" ");
  if (typeof value === "object") return Object.values(value).map(prose).join(" ");
  return String(value);
}

function genericRevealDiagnostics(plan = {}) {
  const shots = flattenShots(plan);
  const sources = [
    {
      source: "story_resolution",
      shot_id: null,
      field: "story.resolution",
      value: plan.story?.resolution,
    },
    {
      source: "concept_visual_system",
      shot_id: null,
      field: "concept.visual_system",
      value: plan.concept?.visual_system,
    },
    ...shots.slice(-3).flatMap((shot) =>
      Object.entries(shot).map(([field, value]) => ({
        source: "final_shot",
        shot_id: shot.id || null,
        field,
        value,
      })),
    ),
  ];
  return sources.flatMap((entry) => {
    const sourceText = prose(entry.value);
    const match = sourceText.match(GENERIC_REVEAL_DIAGNOSTIC);
    if (!match) return [];
    const index = match.index || 0;
    return [{
      source: entry.source,
      shot_id: entry.shot_id,
      field: entry.field,
      matched_text: match[0],
      context: sourceText.slice(
        Math.max(0, index - 100),
        Math.min(sourceText.length, index + match[0].length + 140),
      ),
    }];
  });
}

function compactRepairContext(plan = {}) {
  const shots = flattenShots(plan);
  return {
    story: {
      hook: plan.story?.hook || null,
      emotional_arc: plan.story?.emotional_arc || null,
      resolution: plan.story?.resolution || null,
    },
    concept: {
      id: plan.concept?.id || null,
      title: plan.concept?.title || null,
      central_proposition: plan.concept?.central_proposition || null,
      causal_story: plan.concept?.causal_story || null,
      visual_system: plan.concept?.visual_system || null,
      signature_images: list(plan.concept?.signature_images),
    },
    signature_images: list(plan.signature_images),
    reference_assets: list(plan.asset_manifest).slice(0, 12).map((asset) => ({
      asset_id: asset.asset_id || null,
      reason: asset.reason || null,
      assignments: list(asset.assignments),
      disposition: asset.disposition || null,
      continuity_anchors: list(asset.continuity_anchors),
    })),
    shots: shots.map((shot) => ({
      id: shot.id || null,
      scene_id: shot.scene_id || null,
      action: shot.action || null,
      purpose: shot.purpose || null,
      visual: shot.visual || shot.image || shot.description || null,
      location: shot.location || shot.scene_location || null,
      audio: shot.audio || null,
      sound_design: shot.sound_design || null,
    })),
    final_shots: shots.slice(-3).map((shot) => ({
      id: shot.id || null,
      scene_id: shot.scene_id || null,
      action: shot.action || null,
      purpose: shot.purpose || null,
      visual: shot.visual || shot.image || shot.description || null,
      image: shot.image || null,
      description: shot.description || null,
      location: shot.location || shot.scene_location || null,
      audio: shot.audio || null,
      sound_design: shot.sound_design || null,
    })),
  };
}
function repairPrompt({ plan, benchmark_lab, failures }) {
  return JSON.stringify({
    contract: CREATIVE_PREPRODUCTION_CREATIVE_REPAIR_CONTRACT,
    role: "Avantiqo executive film creative repair director",
    instruction: [
      "Repair only the supplied Creative Floor fields needed to clear the listed benchmark failures.",
      "Do not copy benchmark films, add generic AI-tech imagery, weaken approved story/geography/humanity/continuity/brand/factual truth, or alter unrelated plan fields.",
      "For GENERIC_TECH_REVEAL, use generic_reveal_diagnostics as authoritative evidence of the exact offending source and matched phrase. Repair every listed diagnostic source. If a diagnostic names a shot_id, return a shot_repairs entry for that exact shot id; if it names story_resolution or concept_visual_system, replace that exact field. Do not leave the matched phrase elsewhere in that source. The repaired text must preserve the approved causal story and must not contain hologram, digital network, connected dots, glowing globe, luminous globe, light wave, particles-to-logo, or equivalent shorthand at all—even in negation or as examples.",
      "For SOUND_WORLD_TOO_FLAT, you MUST return shot_repairs for at least four DISTINCT existing shot ids. Each repaired shot must have a different physical audio.source_sound and/or sound_design.source_sound grounded in that shot's visible action/place. Reusing one shot id for multiple sounds is invalid. Do not satisfy this with renamed copies of one continuous hum, decorative whooshes or music masking.",
      "For BEAUTY_HERO_SHOT_DEFICIT, provide at least five ownable, photographically concrete, narratively useful and executable signature images.",
      "For BENCHMARK_LAB_* failures, construct a complete CREATIVE_BENCHMARK_LAB_V1 from the supplied approved reference_assets only. Use exact asset_id values as evidence_ref. Do not invent external films, URLs, facts, agencies, campaigns, awards, or protected expressions. Each study must analyze narrative, editing, cinematography, visual_beauty, humanity, place, sound, and production_craft as transferable craft observations grounded only in the documented reference reason/purpose. craft_dna must contain at least 8 transferable_principles and at least 3 anti_copy_rules, sound_principles, editorial_principles, and cinematography_principles.",
      "Return only the requested repair patch. Do not restate the full master plan.",
      "Do not create media, authorize generation, change budgets, approve release or invent factual evidence.",
    ],
    failures: list(failures),
    benchmark_principles: list(benchmark_lab?.craft_dna?.transferable_principles).slice(0, 12),
    benchmark_anti_copy_rules: list(benchmark_lab?.craft_dna?.anti_copy_rules).slice(0, 6),
    current_repair_context: compactRepairContext(plan),
    generic_reveal_diagnostics: genericRevealDiagnostics(plan),
    response_contract: {
      story_resolution: "replacement string or null when unchanged",
      concept_visual_system: "replacement value or null when unchanged",
      signature_images: "array with at least five concrete hero images",
      shot_repairs: "array of {shot_id, action?, purpose?, visual?, audio?, sound_design?}; may target any supplied shot; only changed fields. Required when SOUND_WORLD_TOO_FLAT is listed.",
      benchmark_lab: "complete CREATIVE_BENCHMARK_LAB_V1 object when any BENCHMARK_LAB_* failure exists; otherwise null",
      repair_summary: "array of concise changes",
      protected_elements_preserved: "array of preserved constraints",
    },
  });
}
function normalizedBenchmarkLab(value = {}, fallback = {}) {
  const lab = object(value);
  if (!Object.keys(lab).length) return null;
  if (lab.contract === "CREATIVE_BENCHMARK_LAB_V1" && list(lab.studies).length >= 3) return lab;
  const fallbackLab = object(fallback);
  const referenceAssets = (
    list(lab.reference_assets || lab.referenceAssets).length
      ? list(lab.reference_assets || lab.referenceAssets)
      : list(fallbackLab.studies).map((study) => ({
          asset_id: study.evidence_ref || study.source_ref || study.source_url,
          title: study.title,
        }))
  )
    .map((entry) => typeof entry === "string" ? { asset_id: entry } : object(entry))
    .filter((entry) => text(entry.asset_id || entry.evidence_ref));
  const suppliedStudy = object(
    lab.study ||
    lab.study_1 ||
    lab.study_2 ||
    lab.study_3 ||
    list(lab.studies)[0],
  );
  const suppliedAnalysis = object(suppliedStudy.analysis);
  const analysis = {
    narrative: text(lab.narrative_analysis || lab.analysis?.narrative || suppliedStudy.narrative || suppliedAnalysis.narrative),
    editing: text(lab.editing_analysis || lab.analysis?.editing || suppliedStudy.editing || suppliedAnalysis.editing),
    cinematography: text(lab.cinematography_analysis || lab.analysis?.cinematography || suppliedStudy.cinematography || suppliedAnalysis.cinematography),
    visual_beauty: text(lab.visual_beauty_analysis || lab.analysis?.visual_beauty || suppliedStudy.visual_beauty || suppliedAnalysis.visual_beauty),
    humanity: text(lab.humanity_analysis || lab.analysis?.humanity || suppliedStudy.humanity || suppliedAnalysis.humanity),
    place: text(lab.place_analysis || lab.analysis?.place || suppliedStudy.place || suppliedAnalysis.place),
    sound: text(lab.sound_analysis || lab.analysis?.sound || suppliedStudy.sound || suppliedAnalysis.sound),
    production_craft: text(lab.production_craft_analysis || lab.analysis?.production_craft || suppliedStudy.production_craft || suppliedAnalysis.production_craft),
  };
  const studies = referenceAssets.slice(0, 3).map((entry, index) => {
    const fallbackStudy = object(list(fallbackLab.studies)[index]);
    const suppliedIndexedStudy = object(lab[`study_${index + 1}`]);
    return {
      title:
        text(suppliedIndexedStudy.title) ||
        text(suppliedStudy.title) ||
        text(fallbackStudy.title) ||
        text(entry.title) ||
        `Approved reference asset ${index + 1}`,
      evidence_ref:
        text(entry.asset_id || entry.evidence_ref) ||
        text(fallbackStudy.evidence_ref || fallbackStudy.source_ref || fallbackStudy.source_url),
      analysis: {
        ...object(fallbackStudy.analysis),
        ...analysis,
        ...object(suppliedIndexedStudy.analysis),
      },
    };
  });
  return {
    ...fallbackLab,
    ...lab,
    contract: "CREATIVE_BENCHMARK_LAB_V1",
    studies,
    craft_dna: {
      ...object(fallbackLab.craft_dna),
      ...object(suppliedStudy.craft_dna),
      ...object(lab.craft_dna),
    },
  };
}

function normalizedSignatureImages(value = []) {
  return list(value).map((entry) => {
    if (typeof entry === "string") return text(entry);
    const item = object(entry);
    return text(item.visual || item.image || item.description || item.narrative_use);
  }).filter(Boolean);
}

function replaceGenericRevealInValue(value, replacement) {
  if (typeof value === "string") {
    return GENERIC_REVEAL_DIAGNOSTIC.test(value) ? replacement : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => replaceGenericRevealInValue(entry, replacement));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        replaceGenericRevealInValue(entry, replacement),
      ]),
    );
  }
  return value;
}

function applyGenericRevealReplacement(plan = {}, replacement = "") {
  const next = structuredClone(plan);
  const cleanReplacement = text(replacement);
  if (!cleanReplacement) return next;
  const diagnostics = genericRevealDiagnostics(next);
  for (const diagnostic of diagnostics) {
    if (diagnostic.source === "story_resolution") {
      next.story = { ...object(next.story), resolution: cleanReplacement };
      continue;
    }
    if (diagnostic.source === "concept_visual_system") {
      next.concept = { ...object(next.concept), visual_system: cleanReplacement };
      continue;
    }
    if (diagnostic.source !== "final_shot" || !diagnostic.shot_id) continue;
    next.scenes = list(next.scenes).map((scene) => ({
      ...scene,
      shots: list(scene.shots).map((shot) => {
        if (text(shot?.id) !== text(diagnostic.shot_id)) return shot;
        if (!(diagnostic.field in shot)) return shot;
        return {
          ...shot,
          [diagnostic.field]: replaceGenericRevealInValue(
            shot[diagnostic.field],
            cleanReplacement,
          ),
        };
      }),
    }));
  }
  return next;
}

function applyRepairPatch(plan = {}, patch = {}) {
  let repaired = structuredClone(plan);
  if (text(patch.story_resolution)) {
    repaired.story = { ...object(repaired.story), resolution: text(patch.story_resolution) };
  }
  if (patch.concept_visual_system != null) {
    repaired.concept = { ...object(repaired.concept), visual_system: patch.concept_visual_system };
  }
  if (text(patch.generic_reveal_replacement)) {
    repaired = applyGenericRevealReplacement(
      repaired,
      text(patch.generic_reveal_replacement),
    );
  }
  const signatures = normalizedSignatureImages(patch.signature_images);
  if (signatures.length) {
    repaired.concept = { ...object(repaired.concept), signature_images: signatures };
    repaired.signature_images = signatures;
  }
  const benchmarkLab = normalizedBenchmarkLab(
    patch.benchmark_lab,
    repaired.benchmark_lab,
  );
  if (benchmarkLab) {
    const existingBenchmark = object(repaired.benchmark_lab);
    const existingStudyCount = list(existingBenchmark.studies).length;
    const candidateStudyCount = list(benchmarkLab.studies).length;
    // Later focused repairs must not erase stronger benchmark evidence that an
    // earlier settled pass already established.
    if (!existingStudyCount || candidateStudyCount >= existingStudyCount) {
      repaired.benchmark_lab = benchmarkLab;
    }
  }
  const shotRepairs = [
    ...list(patch.shot_repairs),
    ...list(patch.final_shot_repairs),
  ];
  if (shotRepairs.length) {
    repaired.scenes = list(repaired.scenes).map((scene) => ({
      ...scene,
      shots: list(scene.shots).map((shot) => {
        const change = shotRepairs.find((item) =>
          text(item?.shot_id || item?.id) === text(shot?.id));
        if (!change) return shot;
        const next = { ...shot };
        for (const key of ["action", "purpose", "visual", "audio", "sound_design"]) {
          if (change[key] != null) next[key] = change[key];
        }
        if (change.visual != null) {
          if ("image" in next) next.image = change.visual;
          if ("description" in next) next.description = change.visual;
        }
        return next;
      }),
    }));
  }
  return repaired;
}

function parseSettledUsageOutput(usage = {}) {
  const providerResult = object(usage?.metadata?.provider_result);
  const candidates = [
    providerResult?.output?.text,
    providerResult?.text,
    usage?.metadata?.result?.output?.text,
    usage?.metadata?.result?.text,
  ];
  for (const candidate of candidates) {
    const parsed = parseRepairJsonText(candidate);
    if (parsed) return normalizeFailureKeyedRepairPatch(parsed);
  }
  return null;
}
async function recoverSettledRepair({ creative_project_id, plan, benchmark_lab }) {
  const project = await CreativeProjectRuntime.get(creative_project_id);
  const approval = object(project?.metadata?.paid_preproduction_specialist_approval);
  const operations = list(approval.operations)
    .filter((entry) =>
      text(entry?.operation).toUpperCase() === "PREPRODUCTION_CREATIVE_REPAIR_V1" &&
      text(entry?.usage_id),
    );

  // Repairs are incremental. An earlier pass may establish benchmark evidence
  // while a later pass only fixes sound or reveal language. Replay all settled
  // repairs in original order so newer patches refine—not erase—valid earlier
  // creative-floor work.
  let repairedPlan = structuredClone(plan);
  let latest = null;
  for (const operation of operations) {
    const usage = await UsageRuntime.get(operation.usage_id);
    if (text(usage?.status).toUpperCase() !== "SUCCESS") continue;
    const patch = parseSettledUsageOutput(usage);
    if (!patch) continue;
    repairedPlan = applyRepairPatch(repairedPlan, patch);
    const repairedBenchmarkLab = repairedPlan.benchmark_lab || benchmark_lab;
    const after = evaluateBenchmarkLab({
      plan: repairedPlan,
      benchmark_lab: repairedBenchmarkLab,
    });
    latest = { patch, repairedPlan, after, usage, operation };
  }
  return latest;
}

export async function repairCreativeFloorPlan({
  organization_id,
  creative_project_id,
  plan = {},
  benchmark_lab = {},
  failures = [],
  execution_runtime = ServiceExecutionRuntime,
} = {}) {
  const before = evaluateBenchmarkLab({ plan, benchmark_lab });
  if (before.passed === true) {
    return Object.freeze({
      contract: CREATIVE_PREPRODUCTION_CREATIVE_REPAIR_CONTRACT,
      repaired: false,
      plan,
      before,
      after: before,
      media_generation_executed: false,
    });
  }
  const targetFailures = list(failures).length ? list(failures) : before.failures;
  const recovered = await recoverSettledRepair({ creative_project_id, plan, benchmark_lab });
  if (recovered?.after?.passed === true) {
    return Object.freeze({
      contract: CREATIVE_PREPRODUCTION_CREATIVE_REPAIR_CONTRACT,
      repaired: true,
      recovered_settled_repair: true,
      plan: recovered.repairedPlan,
      before,
      after: recovered.after,
      repair_summary: list(recovered.patch?.repair_summary).map(text).filter(Boolean),
      protected_elements_preserved: list(recovered.patch?.protected_elements_preserved).map(text).filter(Boolean),
      usage: recovered.usage || null,
      billing: null,
      provider: recovered.usage?.provider || null,
      model: recovered.usage?.provider_model || null,
      media_generation_executed: false,
    });
  }

  const repairBasePlan = recovered?.repairedPlan || plan;
  const repairBaseBenchmarkLab = repairBasePlan.benchmark_lab || benchmark_lab;
  const effectiveFailures = list(recovered?.after?.failures).length
    ? list(recovered.after.failures)
    : targetFailures;

  const result = await executeApprovedPreproductionReasoning({
    organization_id,
    creative_project_id,
    operation: "PREPRODUCTION_CREATIVE_REPAIR_V1",
    execution_runtime,
    execution_input: {
      service_id: "ai.reasoning.execute",
      category: "CREATIVE_PRODUCTION_SPECIALIST",
      input: {
        prompt: repairPrompt({
          plan: repairBasePlan,
          benchmark_lab: repairBaseBenchmarkLab,
          failures: effectiveFailures,
        }),
        quantity: 1,
        max_output_tokens: 6000,
        execution_lane: "deep",
        response_format: { type: "json_object" },
      },
      metadata: {
        module: "CREATIVE",
        operation: "PREPRODUCTION_CREATIVE_REPAIR_V1",
        creative_project_id,
        creative_floor_failures: targetFailures,
        media_generation_allowed: false,
        provider_prompt_persisted: false,
      },
    },
  });
  const output = parseOutput(result);
  if (!output || typeof output !== "object") throw new Error("CREATIVE_PREPRODUCTION_REPAIR_PATCH_REQUIRED");
  const repairedPlan = applyRepairPatch(repairBasePlan, output);
  const repairedBenchmarkLab = repairedPlan.benchmark_lab || repairBaseBenchmarkLab;
  const after = evaluateBenchmarkLab({ plan: repairedPlan, benchmark_lab: repairedBenchmarkLab });
  if (after.passed !== true) {
    const error = new Error(`CREATIVE_PREPRODUCTION_CREATIVE_REPAIR_FAILED:${after.failures.join(",")}`);
    error.repair_result = output;
    error.benchmark_after = after;
    throw error;
  }
  return Object.freeze({
    contract: CREATIVE_PREPRODUCTION_CREATIVE_REPAIR_CONTRACT,
    repaired: true,
    plan: repairedPlan,
    before,
    after,
    repair_summary: list(output?.repair_summary).map(text).filter(Boolean),
    protected_elements_preserved: list(output?.protected_elements_preserved).map(text).filter(Boolean),
    usage: result.usage || null,
    billing: result.billing || null,
    provider: result.provider || null,
    model: result.model || null,
    media_generation_executed: false,
  });
}

export const CreativePreproductionCreativeRepairRuntime = Object.freeze({
  contract: CREATIVE_PREPRODUCTION_CREATIVE_REPAIR_CONTRACT,
  repair: repairCreativeFloorPlan,
});

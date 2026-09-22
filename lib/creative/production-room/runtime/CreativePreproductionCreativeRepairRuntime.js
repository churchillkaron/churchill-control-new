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
function parseOutput(result = {}) {
  const candidate = result.output ?? result.result ?? result.data ?? null;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    const nestedText = text(candidate.text || candidate.answer || candidate.content);
    if (nestedText) {
      try {
        const parsed = JSON.parse(nestedText);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return candidate;
  }
  if (typeof candidate === "string") {
    try { return JSON.parse(candidate); } catch { return null; }
  }
  return null;
}
function flattenShots(plan = {}) {
  return list(plan.scenes).flatMap((scene) =>
    list(scene.shots).map((shot) => ({ ...shot, scene_id: shot.scene_id || scene.id })),
  );
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
    final_shots: shots.slice(-3).map((shot) => ({
      id: shot.id || null,
      scene_id: shot.scene_id || null,
      action: shot.action || null,
      purpose: shot.purpose || null,
      visual: shot.visual || shot.image || shot.description || null,
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
      "For GENERIC_TECH_REVEAL, replace generic hologram/network/globe/connected-dot technology shorthand with an original physical, human, material or cinematic causal reveal.",
      "For BEAUTY_HERO_SHOT_DEFICIT, provide at least five ownable, photographically concrete, narratively useful and executable signature images.",
      "For BENCHMARK_LAB_* failures, construct a complete CREATIVE_BENCHMARK_LAB_V1 from the supplied approved reference_assets only. Use exact asset_id values as evidence_ref. Do not invent external films, URLs, facts, agencies, campaigns, awards, or protected expressions. Each study must analyze narrative, editing, cinematography, visual_beauty, humanity, place, sound, and production_craft as transferable craft observations grounded only in the documented reference reason/purpose. craft_dna must contain at least 8 transferable_principles and at least 3 anti_copy_rules, sound_principles, editorial_principles, and cinematography_principles.",
      "Return only the requested repair patch. Do not restate the full master plan.",
      "Do not create media, authorize generation, change budgets, approve release or invent factual evidence.",
    ],
    failures: list(failures),
    benchmark_principles: list(benchmark_lab?.craft_dna?.transferable_principles).slice(0, 12),
    benchmark_anti_copy_rules: list(benchmark_lab?.craft_dna?.anti_copy_rules).slice(0, 6),
    current_repair_context: compactRepairContext(plan),
    response_contract: {
      story_resolution: "replacement string or null when unchanged",
      concept_visual_system: "replacement value or null when unchanged",
      signature_images: "array with at least five concrete hero images",
      final_shot_repairs: "array of {shot_id, action?, purpose?, visual?, audio?, sound_design?}; only changed fields",
      benchmark_lab: "complete CREATIVE_BENCHMARK_LAB_V1 object when any BENCHMARK_LAB_* failure exists; otherwise null",
      repair_summary: "array of concise changes",
      protected_elements_preserved: "array of preserved constraints",
    },
  });
}
function normalizedBenchmarkLab(value = {}) {
  const lab = object(value);
  if (!Object.keys(lab).length) return null;
  if (lab.contract === "CREATIVE_BENCHMARK_LAB_V1" && list(lab.studies).length >= 3) return lab;
  const referenceAssets = list(lab.reference_assets || lab.referenceAssets)
    .map((entry) => typeof entry === "string" ? { asset_id: entry } : object(entry))
    .filter((entry) => text(entry.asset_id || entry.evidence_ref));
  const analysis = {
    narrative: text(lab.narrative_analysis || lab.analysis?.narrative),
    editing: text(lab.editing_analysis || lab.analysis?.editing),
    cinematography: text(lab.cinematography_analysis || lab.analysis?.cinematography),
    visual_beauty: text(lab.visual_beauty_analysis || lab.analysis?.visual_beauty),
    humanity: text(lab.humanity_analysis || lab.analysis?.humanity),
    place: text(lab.place_analysis || lab.analysis?.place),
    sound: text(lab.sound_analysis || lab.analysis?.sound),
    production_craft: text(lab.production_craft_analysis || lab.analysis?.production_craft),
  };
  const studies = referenceAssets.slice(0, 3).map((entry, index) => ({
    title: text(entry.title) || `Approved reference asset ${index + 1}`,
    evidence_ref: text(entry.asset_id || entry.evidence_ref),
    analysis,
  }));
  return {
    ...lab,
    contract: "CREATIVE_BENCHMARK_LAB_V1",
    studies,
    craft_dna: object(lab.craft_dna),
  };
}

function normalizedSignatureImages(value = []) {
  return list(value).map((entry) => {
    if (typeof entry === "string") return text(entry);
    const item = object(entry);
    return text(item.visual || item.image || item.description || item.narrative_use);
  }).filter(Boolean);
}

function applyRepairPatch(plan = {}, patch = {}) {
  const repaired = structuredClone(plan);
  if (text(patch.story_resolution)) {
    repaired.story = { ...object(repaired.story), resolution: text(patch.story_resolution) };
  }
  if (patch.concept_visual_system != null) {
    repaired.concept = { ...object(repaired.concept), visual_system: patch.concept_visual_system };
  }
  const signatures = normalizedSignatureImages(patch.signature_images);
  if (signatures.length) {
    repaired.concept = { ...object(repaired.concept), signature_images: signatures };
    repaired.signature_images = signatures;
  }
  const benchmarkLab = normalizedBenchmarkLab(patch.benchmark_lab);
  if (benchmarkLab) repaired.benchmark_lab = benchmarkLab;
  const shotRepairs = list(patch.final_shot_repairs);
  if (shotRepairs.length) {
    repaired.scenes = list(repaired.scenes).map((scene) => ({
      ...scene,
      shots: list(scene.shots).map((shot) => {
        const change = shotRepairs.find((item) => text(item?.shot_id) === text(shot?.id));
        if (!change) return shot;
        const next = { ...shot };
        for (const key of ["action", "purpose", "visual", "audio", "sound_design"]) {
          if (change[key] != null) next[key] = change[key];
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
    if (!text(candidate)) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return null;
}
async function recoverSettledRepair({ creative_project_id, plan, benchmark_lab }) {
  const project = await CreativeProjectRuntime.get(creative_project_id);
  const approval = object(project?.metadata?.paid_preproduction_specialist_approval);
  const operations = list(approval.operations)
    .filter((entry) => text(entry?.operation).toUpperCase() === "PREPRODUCTION_CREATIVE_REPAIR_V1" && text(entry?.usage_id))
    .reverse();
  for (const operation of operations) {
    const usage = await UsageRuntime.get(operation.usage_id);
    if (text(usage?.status).toUpperCase() !== "SUCCESS") continue;
    const patch = parseSettledUsageOutput(usage);
    if (!patch) continue;
    const repairedPlan = applyRepairPatch(plan, patch);
    const repairedBenchmarkLab = repairedPlan.benchmark_lab || benchmark_lab;
    const after = evaluateBenchmarkLab({ plan: repairedPlan, benchmark_lab: repairedBenchmarkLab });
    return { patch, repairedPlan, after, usage, operation };
  }
  return null;
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
  const result = await executeApprovedPreproductionReasoning({
    organization_id,
    creative_project_id,
    operation: "PREPRODUCTION_CREATIVE_REPAIR_V1",
    execution_runtime,
    execution_input: {
      service_id: "ai.reasoning.execute",
      category: "CREATIVE_PRODUCTION_SPECIALIST",
      input: {
        prompt: repairPrompt({ plan, benchmark_lab, failures: targetFailures }),
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
  const repairedPlan = applyRepairPatch(plan, output);
  const repairedBenchmarkLab = repairedPlan.benchmark_lab || benchmark_lab;
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

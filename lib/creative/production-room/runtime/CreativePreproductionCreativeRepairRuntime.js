import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
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
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) return candidate;
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
      repair_summary: "array of concise changes",
      protected_elements_preserved: "array of preserved constraints",
    },
  });
}
function applyRepairPatch(plan = {}, patch = {}) {
  const repaired = structuredClone(plan);
  if (text(patch.story_resolution)) {
    repaired.story = { ...object(repaired.story), resolution: text(patch.story_resolution) };
  }
  if (patch.concept_visual_system != null) {
    repaired.concept = { ...object(repaired.concept), visual_system: patch.concept_visual_system };
  }
  const signatures = list(patch.signature_images).map(text).filter(Boolean);
  if (signatures.length) {
    repaired.concept = { ...object(repaired.concept), signature_images: signatures };
    repaired.signature_images = signatures;
  }
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
  const after = evaluateBenchmarkLab({ plan: repairedPlan, benchmark_lab });
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

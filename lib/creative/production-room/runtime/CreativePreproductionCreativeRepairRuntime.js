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
function repairPrompt({ plan, benchmark_lab, failures }) {
  return JSON.stringify({
    contract: CREATIVE_PREPRODUCTION_CREATIVE_REPAIR_CONTRACT,
    role: "Avantiqo executive film creative repair director",
    instruction: [
      "Repair the supplied film plan only where needed to clear the current Creative Floor benchmark failures.",
      "Do not copy benchmark films, do not add generic AI-tech imagery, and do not weaken the approved story, geography, humanity, continuity, brand truth, factual truth or tribunal constraints.",
      "For GENERIC_TECH_REVEAL, replace holograms, glowing networks, connected dots, digital globes and similar generic technology shorthand with an original physical, human or cinematic causal reveal.",
      "For BEAUTY_HERO_SHOT_DEFICIT, create at least five specific signature images that are visually ownable, photographically concrete, narratively useful and executable.",
      "Preserve every valid field not implicated by the failures. Return a complete repaired_plan object, not notes or a patch.",
      "Do not create media, authorize generation, change budgets, approve release or invent factual evidence.",
    ],
    failures: list(failures),
    benchmark_craft_dna: object(benchmark_lab?.craft_dna),
    benchmark_studies: list(benchmark_lab?.studies).map((study) => ({
      title: study.title,
      analysis: study.analysis,
      craft_scores: study.craft_scores,
    })),
    current_plan: plan,
    response_contract: {
      repaired_plan: "complete film plan object",
      repair_summary: "array of concise changes",
      protected_elements_preserved: "array of preserved constraints",
    },
  });
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
        max_output_tokens: 16000,
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
  const repairedPlan = object(output?.repaired_plan || output?.plan);
  if (!Object.keys(repairedPlan).length) throw new Error("CREATIVE_PREPRODUCTION_REPAIRED_PLAN_REQUIRED");
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

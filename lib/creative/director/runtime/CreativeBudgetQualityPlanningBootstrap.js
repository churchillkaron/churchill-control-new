import { ProductionGraphRuntime } from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";
import { CreativeBudgetQualityOptimizationRuntime } from "./CreativeBudgetQualityOptimizationRuntime";

const FLAG = Symbol.for("avantiqo.creative.budget-quality-planning.v1");
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return String(value ?? "").trim(); }

function inject(graph = {}, enriched = {}) {
  const shots = new Map(list(enriched.shots).map((shot) => [text(shot.id), shot]));
  return {
    ...graph,
    nodes: list(graph.nodes).map((node) => {
      if (text(node.type).toUpperCase() !== "SHOT") return node;
      const policy = object(shots.get(text(node.id))?.budget_quality_optimization);
      if (!Object.keys(policy).length) return node;
      return {
        ...node,
        requirements: { ...object(node.requirements), budget_quality_optimization: policy },
        generation: {
          ...object(node.generation),
          provider_policy: {
            ...object(node.generation?.provider_policy),
            budget_quality_optimization_contract: policy.contract,
            selection_weights: policy.service_runtime_selection_weights,
          },
        },
        metadata: {
          ...object(node.metadata),
          budget_quality_optimization_contract: policy.contract,
          budget_quality_policy_hash: policy.policy_hash,
          budget_quality_tier: policy.quality_tier,
          budget_quality_importance_score: policy.importance_score,
        },
      };
    }),
    metadata: {
      ...object(graph.metadata),
      budget_quality_optimization_contract: enriched.budget_quality_optimization?.contract || null,
      budget_quality_optimization_policy_hash: enriched.budget_quality_optimization?.policy_hash || null,
      budget_quality_quality_floor_may_not_be_lowered: true,
      budget_quality_provider_selection_owner: "SERVICE_RUNTIME",
    },
  };
}

function install() {
  if (ProductionGraphRuntime[FLAG]) return;
  const previous = ProductionGraphRuntime.preview.bind(ProductionGraphRuntime);
  Object.defineProperty(ProductionGraphRuntime, FLAG, { value: true });
  ProductionGraphRuntime.preview = async function previewWithBudgetQuality(input = {}) {
    const enriched = CreativeBudgetQualityOptimizationRuntime.build(input);
    return inject(await previous(enriched), enriched);
  };
  ProductionGraphRuntime.plan = async function planWithBudgetQuality(input = {}) {
    return ProductionGraphRuntime.create(await ProductionGraphRuntime.preview(input));
  };
}
install();

export const CreativeBudgetQualityPlanningBootstrap = Object.freeze({
  installed: true,
  contract: "AVANTIQO_BUDGET_QUALITY_PLANNING_BOOTSTRAP_V1",
  optimization_contract: CreativeBudgetQualityOptimizationRuntime.contract,
  provider_selection_owner: "SERVICE_RUNTIME",
  quality_floor_may_not_be_lowered: true,
});

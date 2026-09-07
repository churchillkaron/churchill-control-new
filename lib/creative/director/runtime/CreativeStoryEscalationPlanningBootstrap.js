import { ProductionGraphRuntime } from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";
import { CreativeStoryEscalationRuntime } from "./CreativeStoryEscalationRuntime";

const FLAG = Symbol.for("avantiqo.creative.story-escalation-planning.v1");

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return String(value ?? "").trim(); }

function inject(graph = {}, enriched = {}) {
  const shots = new Map(list(enriched.shots).map((shot) => [text(shot.id), shot]));
  const nodes = list(graph.nodes).map((node) => {
    if (text(node.type).toUpperCase() !== "SHOT") return node;
    const contract = object(shots.get(text(node.id))?.story_escalation);
    if (!Object.keys(contract).length) return node;
    CreativeStoryEscalationRuntime.verifyShot(contract);
    return {
      ...node,
      requirements: { ...object(node.requirements), story_escalation: contract },
      metadata: {
        ...object(node.metadata),
        story_escalation_contract: contract.contract,
        story_escalation_contract_hash: contract.contract_hash,
        story_progression_role: contract.story_progression_role,
        story_escalation_verified_before_materialization: true,
      },
    };
  });
  return {
    ...graph,
    nodes,
    metadata: {
      ...object(graph.metadata),
      story_escalation_contract: enriched.story_escalation?.contract || null,
      story_escalation_graph_hash: enriched.story_escalation?.graph_hash || null,
      story_escalation_causal_state_change_required: true,
      story_escalation_unique_shot_information_required: true,
    },
  };
}

function install() {
  if (ProductionGraphRuntime[FLAG]) return;
  const previous = ProductionGraphRuntime.preview.bind(ProductionGraphRuntime);
  Object.defineProperty(ProductionGraphRuntime, FLAG, { value: true });
  ProductionGraphRuntime.preview = async function previewWithStoryEscalation(input = {}) {
    const enriched = CreativeStoryEscalationRuntime.build(input);
    return inject(await previous(enriched), enriched);
  };
  ProductionGraphRuntime.plan = async function planWithStoryEscalation(input = {}) {
    return ProductionGraphRuntime.create(await ProductionGraphRuntime.preview(input));
  };
}
install();

export const CreativeStoryEscalationPlanningBootstrap = Object.freeze({
  installed: true,
  contract: "AVANTIQO_STORY_ESCALATION_PLANNING_BOOTSTRAP_V1",
  story_escalation_contract: CreativeStoryEscalationRuntime.contract,
  provider_neutral: true,
});

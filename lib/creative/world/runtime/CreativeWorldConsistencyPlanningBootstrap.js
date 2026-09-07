import { ProductionGraphRuntime } from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";
import { CreativeWorldConsistencyAuthoringRuntime } from "@/lib/creative/world/runtime/CreativeWorldConsistencyAuthoringRuntime";

const INSTALL_FLAG = Symbol.for("avantiqo.creative.world-consistency-planning-bootstrap.v1");

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function enrichPlanningInput(input = {}) {
  const authored = CreativeWorldConsistencyAuthoringRuntime.build({
    scenes: input.scenes,
    shots: input.shots,
    creative_plan: input.creative_plan,
  });
  return {
    ...input,
    scenes: authored.scenes,
    shots: authored.shots,
    creative_plan: authored.creative_plan,
    __world_consistency_authoring: authored.metadata,
  };
}

function injectGraphContracts(graph = {}, shots = [], authoringMetadata = {}) {
  const byId = new Map(list(shots).map((shot) => [text(shot.id), shot]));
  let injected = 0;
  const nodes = list(graph.nodes).map((node) => {
    if (text(node.type).toUpperCase() !== "SHOT") return node;
    const shot = byId.get(text(node.id));
    if (!shot?.world_consistency_contract) return node;
    injected += 1;
    return {
      ...node,
      requirements: {
        ...object(node.requirements),
        world_consistency_contract: shot.world_consistency_contract,
      },
      metadata: {
        ...object(node.metadata),
        world_consistency_contract: shot.world_consistency_contract.contract,
        world_consistency_contract_hash: shot.world_consistency_contract.contract_hash,
        world_consistency_world_id: shot.world_consistency_contract.world_id,
        world_consistency_status: "READY",
        world_consistency_authored_before_materialization: true,
        world_consistency_execution_authorship_forbidden: true,
      },
    };
  });
  return {
    ...graph,
    nodes,
    metadata: {
      ...object(graph.metadata),
      ...object(authoringMetadata),
      world_consistency_injected_shot_count: injected,
      world_consistency_contracts_in_graph: true,
      world_consistency_execution_authorship_forbidden: true,
    },
  };
}

function install() {
  if (ProductionGraphRuntime[INSTALL_FLAG]) return;
  const previewWithoutWorld = ProductionGraphRuntime.preview.bind(ProductionGraphRuntime);
  Object.defineProperty(ProductionGraphRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionGraphRuntime.preview = async function previewWithWorldConsistency(input = {}) {
    const enriched = enrichPlanningInput(input);
    const graph = await previewWithoutWorld(enriched);
    return injectGraphContracts(graph, enriched.shots, enriched.__world_consistency_authoring);
  };

  ProductionGraphRuntime.plan = async function planWithWorldConsistency(input = {}) {
    const graph = await ProductionGraphRuntime.preview(input);
    return ProductionGraphRuntime.create(graph);
  };
}

install();

export const CreativeWorldConsistencyPlanningBootstrap = Object.freeze({
  installed: true,
  contract: "AVANTIQO_WORLD_CONSISTENCY_PLANNING_BOOTSTRAP_V1",
  authoring_contract: CreativeWorldConsistencyAuthoringRuntime.contract,
  execution_authorship_forbidden: true,
  provider_neutral: true,
});

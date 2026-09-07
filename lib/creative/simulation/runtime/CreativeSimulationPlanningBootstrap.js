import {
  ProductionGraphRuntime,
} from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";
import {
  CreativeSimulationAuthoringRuntime,
} from "@/lib/creative/simulation/runtime/CreativeSimulationAuthoringRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.simulation-planning-bootstrap.v1",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function enrichPlanningInput(input = {}) {
  const authored = CreativeSimulationAuthoringRuntime.build({
    scenes: input.scenes,
    shots: input.shots,
    creative_plan: input.creative_plan,
  });
  return {
    ...input,
    scenes: authored.scenes,
    shots: authored.shots,
    creative_plan: authored.creative_plan,
    __simulation_authoring: authored.metadata,
  };
}

function injectGraphContracts(graph = {}, shots = [], authoringMetadata = {}) {
  const byId = new Map(list(shots).map((shot) => [text(shot.id), shot]));
  let injected = 0;
  const nodes = list(graph.nodes).map((node) => {
    if (text(node.type).toUpperCase() !== "SHOT") return node;
    const shot = byId.get(text(node.id));
    if (!shot?.simulation_contract) return node;
    injected += 1;
    return {
      ...node,
      requirements: {
        ...object(node.requirements),
        simulation: shot.simulation,
        simulation_contract: shot.simulation_contract,
      },
      metadata: {
        ...object(node.metadata),
        simulation_contract: shot.simulation_contract.contract,
        simulation_status: "READY",
        simulation_count: shot.simulation_contract.simulations?.length || 0,
        simulation_authored_before_materialization: true,
        simulation_execution_authorship_forbidden: true,
      },
    };
  });

  return {
    ...graph,
    nodes,
    metadata: {
      ...object(graph.metadata),
      ...object(authoringMetadata),
      simulation_injected_shot_count: injected,
      simulation_contracts_in_graph: true,
      simulation_execution_authorship_forbidden: true,
    },
  };
}

function install() {
  if (ProductionGraphRuntime[INSTALL_FLAG]) return;

  const previewWithoutSimulation = ProductionGraphRuntime.preview.bind(
    ProductionGraphRuntime,
  );

  Object.defineProperty(ProductionGraphRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionGraphRuntime.preview = async function previewWithSimulation(input = {}) {
    const enriched = enrichPlanningInput(input);
    const graph = await previewWithoutSimulation(enriched);
    return injectGraphContracts(
      graph,
      enriched.shots,
      enriched.__simulation_authoring,
    );
  };

  ProductionGraphRuntime.plan = async function planWithSimulation(input = {}) {
    const graph = await ProductionGraphRuntime.preview(input);
    return ProductionGraphRuntime.create(graph);
  };
}

install();

export const CreativeSimulationPlanningBootstrap = Object.freeze({
  installed: true,
  contract: "AVANTIQO_SIMULATION_PLANNING_BOOTSTRAP_V1",
  authoring_contract: CreativeSimulationAuthoringRuntime.contract,
  execution_authorship_forbidden: true,
  provider_neutral: true,
});

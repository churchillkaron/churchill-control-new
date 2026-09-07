import {
  ProductionGraphRuntime,
} from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";
import {
  CreativeCompositingAuthoringRuntime,
} from "@/lib/creative/compositing/runtime/CreativeCompositingAuthoringRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.compositing-planning-bootstrap.v1",
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
  const authored = CreativeCompositingAuthoringRuntime.build({
    scenes: input.scenes,
    shots: input.shots,
    creative_plan: input.creative_plan,
  });
  return {
    ...input,
    scenes: authored.scenes,
    shots: authored.shots,
    creative_plan: authored.creative_plan,
    __compositing_authoring: authored.metadata,
  };
}

function injectGraphContracts(graph = {}, shots = [], authoringMetadata = {}) {
  const byId = new Map(list(shots).map((shot) => [text(shot.id), shot]));
  let injected = 0;
  const nodes = list(graph.nodes).map((node) => {
    if (text(node.type).toUpperCase() !== "SHOT") return node;
    const shot = byId.get(text(node.id));
    if (!shot?.compositing_contract) return node;
    injected += 1;
    return {
      ...node,
      requirements: {
        ...object(node.requirements),
        compositing: shot.compositing,
        compositing_contract: shot.compositing_contract,
      },
      metadata: {
        ...object(node.metadata),
        compositing_contract: shot.compositing_contract.contract,
        compositing_contract_hash: shot.compositing_contract.contract_hash,
        compositing_status: "READY",
        compositing_layer_count: shot.compositing_contract.layers?.length || 0,
        compositing_authored_before_materialization: true,
        compositing_execution_authorship_forbidden: true,
      },
    };
  });

  return {
    ...graph,
    nodes,
    metadata: {
      ...object(graph.metadata),
      ...object(authoringMetadata),
      compositing_injected_shot_count: injected,
      compositing_contracts_in_graph: true,
      compositing_execution_authorship_forbidden: true,
    },
  };
}

function install() {
  if (ProductionGraphRuntime[INSTALL_FLAG]) return;
  const previewWithoutCompositing = ProductionGraphRuntime.preview.bind(
    ProductionGraphRuntime,
  );

  Object.defineProperty(ProductionGraphRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionGraphRuntime.preview = async function previewWithCompositing(input = {}) {
    const enriched = enrichPlanningInput(input);
    const graph = await previewWithoutCompositing(enriched);
    return injectGraphContracts(
      graph,
      enriched.shots,
      enriched.__compositing_authoring,
    );
  };

  ProductionGraphRuntime.plan = async function planWithCompositing(input = {}) {
    const graph = await ProductionGraphRuntime.preview(input);
    return ProductionGraphRuntime.create(graph);
  };
}

install();

export const CreativeCompositingPlanningBootstrap = Object.freeze({
  installed: true,
  contract: "AVANTIQO_COMPOSITING_PLANNING_BOOTSTRAP_V1",
  authoring_contract: CreativeCompositingAuthoringRuntime.contract,
  execution_authorship_forbidden: true,
  provider_neutral: true,
});

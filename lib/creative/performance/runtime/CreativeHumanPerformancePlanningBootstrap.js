import {
  ProductionGraphRuntime,
} from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";
import {
  CreativeHumanPerformanceAuthoringRuntime,
} from "@/lib/creative/performance/runtime/CreativeHumanPerformanceAuthoringRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.human-performance-planning-bootstrap.v1",
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
  const authored = CreativeHumanPerformanceAuthoringRuntime.build({
    scenes: input.scenes,
    shots: input.shots,
    creative_plan: input.creative_plan,
  });
  return {
    ...input,
    scenes: authored.scenes,
    shots: authored.shots,
    creative_plan: authored.creative_plan,
    __human_performance_authoring: authored.metadata,
  };
}

function injectGraphContracts(graph = {}, shots = [], authoringMetadata = {}) {
  const byId = new Map(list(shots).map((shot) => [text(shot.id), shot]));
  let injected = 0;
  const nodes = list(graph.nodes).map((node) => {
    if (text(node.type).toUpperCase() !== "SHOT") return node;
    const shot = byId.get(text(node.id));
    if (!shot?.human_performance) return node;
    injected += 1;
    return {
      ...node,
      requirements: {
        ...object(node.requirements),
        human_performance: shot.human_performance,
      },
      metadata: {
        ...object(node.metadata),
        human_performance_contract: shot.human_performance.contract,
        human_performance_status: "READY",
        human_performance_action_class:
          shot.human_performance.action_class || null,
        human_performance_authored_before_materialization: true,
      },
    };
  });

  return {
    ...graph,
    nodes,
    metadata: {
      ...object(graph.metadata),
      ...object(authoringMetadata),
      human_performance_injected_shot_count: injected,
      human_performance_contracts_in_graph: true,
      human_performance_execution_authorship_forbidden: true,
    },
  };
}

function install() {
  if (ProductionGraphRuntime[INSTALL_FLAG]) return;

  const previewWithoutHumanPerformance = ProductionGraphRuntime.preview.bind(
    ProductionGraphRuntime,
  );

  Object.defineProperty(ProductionGraphRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionGraphRuntime.preview = async function previewWithHumanPerformance(input = {}) {
    const enriched = enrichPlanningInput(input);
    const graph = await previewWithoutHumanPerformance(enriched);
    return injectGraphContracts(
      graph,
      enriched.shots,
      enriched.__human_performance_authoring,
    );
  };

  ProductionGraphRuntime.plan = async function planWithHumanPerformance(input = {}) {
    const graph = await ProductionGraphRuntime.preview(input);
    return ProductionGraphRuntime.create(graph);
  };
}

install();

export const CreativeHumanPerformancePlanningBootstrap = Object.freeze({
  installed: true,
  contract: "AVANTIQO_HUMAN_PERFORMANCE_PLANNING_BOOTSTRAP_V1",
  authoring_contract: CreativeHumanPerformanceAuthoringRuntime.contract,
  execution_authorship_forbidden: true,
  provider_neutral: true,
});

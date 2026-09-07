import {
  ProductionGraphRuntime,
} from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";
import {
  CreativeDirectingIntelligenceRuntime,
} from "@/lib/creative/director/runtime/CreativeDirectingIntelligenceRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.directing-intelligence-planning-bootstrap.v1",
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

function enrich(input = {}) {
  return CreativeDirectingIntelligenceRuntime.build(input);
}

function injectGraph(graph = {}, enriched = {}) {
  const shotById = new Map(
    list(enriched.shots).map((shot) => [text(shot.id), shot]),
  );
  let injected = 0;
  const nodes = list(graph.nodes).map((node) => {
    if (text(node.type).toUpperCase() !== "SHOT") return node;
    const shot = shotById.get(text(node.id));
    const decision = object(shot?.directing_intelligence);
    if (!Object.keys(decision).length) return node;
    CreativeDirectingIntelligenceRuntime.verifyShotDecision(decision);
    injected += 1;
    return {
      ...node,
      requirements: {
        ...object(node.requirements),
        directing_intelligence: decision,
      },
      metadata: {
        ...object(node.metadata),
        directing_intelligence_contract: decision.contract,
        directing_intelligence_decision_hash: decision.decision_hash,
        directing_intelligence_scene_id: decision.scene_id,
        directing_intelligence_verified_before_materialization: true,
        renderer_is_execution_engine_not_director: true,
      },
    };
  });

  return {
    ...graph,
    nodes,
    metadata: {
      ...object(graph.metadata),
      directing_intelligence_contract:
        enriched.metadata?.contract || CreativeDirectingIntelligenceRuntime.contract,
      directing_intelligence_project_decision_hash:
        enriched.metadata?.project_decision_hash || null,
      directing_intelligence_scene_decision_count:
        enriched.metadata?.scene_decision_count || 0,
      directing_intelligence_shot_decision_count:
        enriched.metadata?.shot_decision_count || 0,
      directing_intelligence_injected_shot_count: injected,
      directing_intelligence_hierarchical_planning: "PROJECT_SCENE_SHOT",
      renderer_is_execution_engine_not_director: true,
      directing_intelligence_provider_calls_executed: 0,
    },
  };
}

function install() {
  if (ProductionGraphRuntime[INSTALL_FLAG]) return;

  const previewWithoutDirecting = ProductionGraphRuntime.preview.bind(
    ProductionGraphRuntime,
  );

  Object.defineProperty(ProductionGraphRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionGraphRuntime.preview = async function previewWithDirectingIntelligence(input = {}) {
    const enriched = enrich(input);
    const graph = await previewWithoutDirecting(enriched);
    return injectGraph(graph, enriched);
  };

  ProductionGraphRuntime.plan = async function planWithDirectingIntelligence(input = {}) {
    const graph = await ProductionGraphRuntime.preview(input);
    return ProductionGraphRuntime.create(graph);
  };
}

install();

export const CreativeDirectingIntelligencePlanningBootstrap = Object.freeze({
  installed: true,
  contract: "AVANTIQO_DIRECTING_INTELLIGENCE_PLANNING_BOOTSTRAP_V1",
  directing_contract: CreativeDirectingIntelligenceRuntime.contract,
  hierarchical_planning: "PROJECT_SCENE_SHOT",
  renderer_is_execution_engine_not_director: true,
  provider_neutral: true,
});

import {
  CreativeProductionTaskMaterializationRuntime,
} from "@/lib/creative/execution/runtime/CreativeProductionTaskMaterializationRuntime";
import {
  ProductionGraphRuntime,
} from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.production-task-materialization-graph.v2",
);
const GRAPH_CONTRACT = "CREATIVE_PRODUCTION_TASK_MATERIALIZATION_GRAPH_V2";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function graphLineage(graph = {}) {
  return object(
    graph.metadata?.story_lineage ||
    graph.story_lineage,
  );
}

function temporalGraph(graph = {}) {
  return text(graph.metadata?.workflow_kind).toUpperCase() === "TEMPORAL";
}

function install() {
  if (ProductionGraphRuntime[INSTALL_FLAG]) return;
  const planWithoutTaskContracts = ProductionGraphRuntime.plan.bind(
    ProductionGraphRuntime,
  );
  Object.defineProperty(ProductionGraphRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionGraphRuntime.plan = async function planWithTaskMaterializationContracts(input = {}) {
    const graph = await planWithoutTaskContracts(input);
    if (!graph?.id) throw new Error("PRODUCTION_GRAPH_REQUIRED_FOR_TASK_CONTRACTS");

    const lineage = graphLineage(graph);
    if (
      temporalGraph(graph) &&
      (!text(lineage.story_contract_hash) || !text(lineage.master_plan_hash))
    ) {
      throw new Error("PRODUCTION_TASK_MATERIALIZATION_GRAPH_LINEAGE_REQUIRED");
    }

    const nodes = list(graph.nodes).map((node) => {
      if (node.generation?.required !== true) return node;

      CreativeProductionTaskMaterializationRuntime.attach(node);
      const firstHash = text(
        node.requirements?.task_materialization_contract?.contract_hash,
      );
      CreativeProductionTaskMaterializationRuntime.attach(node);
      const secondHash = text(
        node.requirements?.task_materialization_contract?.contract_hash,
      );
      if (!firstHash || firstHash !== secondHash) {
        throw new Error(
          `PRODUCTION_TASK_MATERIALIZATION_NOT_IDEMPOTENT:${node.id}`,
        );
      }
      return node;
    });

    const generationNodes = nodes.filter((node) => node.generation?.required === true);
    const invalid = generationNodes.filter((node) => {
      const contract = object(
        node.requirements?.task_materialization_contract,
      );
      if (!CreativeProductionTaskMaterializationRuntime.verify(contract)) {
        return true;
      }
      if (
        Object.keys(lineage).length &&
        !CreativeProductionTaskMaterializationRuntime.verifyLineage(
          contract,
          lineage,
        )
      ) {
        return true;
      }
      return false;
    });

    if (invalid.length) {
      throw new Error(
        `PRODUCTION_TASK_MATERIALIZATION_CONTRACT_INVALID:${invalid.map((node) => node.id).join(",")}`,
      );
    }

    return ProductionGraphRuntime.update(graph.id, {
      nodes,
      metadata: {
        ...object(graph.metadata),
        task_materialization_contract: GRAPH_CONTRACT,
        task_materialization_node_count: generationNodes.length,
        task_materialization_metadata_allowlisted: true,
        task_materialization_idempotent: true,
        task_materialization_lineage_verified:
          !temporalGraph(graph) || invalid.length === 0,
        task_materialization_provider_ids_preserved: true,
        task_materialization_human_review_preserved: true,
        provider_prompts_persisted_in_materialization_contracts: false,
      },
    });
  };
}

install();

export const CreativeProductionTaskMaterializationGraphRuntime = Object.freeze({
  installed: true,
  contract: GRAPH_CONTRACT,
});

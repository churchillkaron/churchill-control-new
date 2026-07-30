import {
  CreativeProductionTaskMaterializationRuntime,
} from "@/lib/creative/execution/runtime/CreativeProductionTaskMaterializationRuntime";
import {
  ProductionGraphRuntime,
} from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.production-task-materialization-graph.v1",
);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
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

    const nodes = list(graph.nodes).map((node) => {
      if (node.generation?.required !== true) return node;
      return CreativeProductionTaskMaterializationRuntime.attach(node);
    });
    const generationNodes = nodes.filter((node) => node.generation?.required === true);
    const missing = generationNodes.filter((node) =>
      !CreativeProductionTaskMaterializationRuntime.verify(
        node.requirements?.task_materialization_contract,
      ),
    );
    if (missing.length) {
      throw new Error(
        `PRODUCTION_TASK_MATERIALIZATION_CONTRACT_MISSING:${missing.map((node) => node.id).join(",")}`,
      );
    }

    return ProductionGraphRuntime.update(graph.id, {
      nodes,
      metadata: {
        ...object(graph.metadata),
        task_materialization_contract:
          "CREATIVE_PRODUCTION_TASK_MATERIALIZATION_GRAPH_V1",
        task_materialization_node_count: generationNodes.length,
        task_materialization_metadata_preserved: true,
        task_materialization_provider_ids_preserved: true,
        task_materialization_human_review_preserved: true,
      },
    });
  };
}

install();

export const CreativeProductionTaskMaterializationGraphRuntime = {
  installed: true,
};

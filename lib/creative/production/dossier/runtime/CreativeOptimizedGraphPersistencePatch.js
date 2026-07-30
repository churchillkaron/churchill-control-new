import {
  AssetReuseEngine,
} from "@/lib/creative/assets/reuse/AssetReuseEngine";
import * as ProductionGraphRepository
from "@/lib/creative/production-graph/repositories/ProductionGraphRepository";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.optimized-graph-persistence.v1",
);

function install() {
  if (AssetReuseEngine[INSTALL_FLAG]) return;
  const optimizeWithoutPersistence = AssetReuseEngine.optimizeGraph.bind(
    AssetReuseEngine,
  );
  Object.defineProperty(AssetReuseEngine, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  AssetReuseEngine.optimizeGraph = async function optimizeAndPersist(input = {}) {
    const graph = await optimizeWithoutPersistence(input);
    if (!graph?.id) throw new Error("OPTIMIZED_PRODUCTION_GRAPH_ID_REQUIRED");
    const persisted = await ProductionGraphRepository.update(graph.id, {
      nodes: graph.nodes || [],
      edges: graph.edges || [],
      cost_plan: graph.cost_plan || {},
      production_plan: graph.production_plan || {},
      metadata: {
        ...(graph.metadata || {}),
        optimized_graph_persisted: true,
        optimized_graph_contract: "OPTIMIZED_PRODUCTION_GRAPH_V1",
      },
    });
    return persisted;
  };
}

install();

export const CreativeOptimizedGraphPersistencePatch = {
  installed: true,
};

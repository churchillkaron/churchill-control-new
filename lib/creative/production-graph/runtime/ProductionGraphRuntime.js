import {
  buildProductionGraph,
} from "../planner/ProductionGraphPlanner";

import {
  buildUniversalProductionGraph,
} from "../planner/UniversalProductionGraphPlanner";

import {
  bindCreativeAssetManifest,
} from "../planner/bindCreativeAssetManifest";

import {
  buildCreativePerformanceContracts,
} from "@/lib/creative/performance/runtime/CreativePerformanceContractRuntime";

import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";

import {
  createProductionGraph,
} from "../documents/ProductionGraph";

import * as Repository
from "../repositories/ProductionGraphRepository";

function workflowKind(input = {}) {
  return String(input.creative_plan?.workflow_kind || "")
    .trim()
    .toUpperCase();
}

export const ProductionGraphRuntime = {

  async list(input = {}) {

    return Repository.listByProject(input);
  },

  async get(id) {

    return Repository.getById(id);
  },

  async create(input = {}) {

    return Repository.create(

      createProductionGraph(input),
    );
  },

  async update(id, values = {}) {

    return Repository.update(

      id,

      values,
    );
  },

  async plan(input = {}) {
    const kind = workflowKind(input);

    if (kind && kind !== "TEMPORAL") {
      return buildUniversalProductionGraph(input);
    }

    const assets = await CreativeAssetsRuntime.list({
      organization_id: input.organization_id,
      creative_project_id: input.creative_project_id,
    });

    const bound = bindCreativeAssetManifest({
      scenes: input.scenes,
      shots: input.shots,
      creative_plan: input.creative_plan,
    });

    const performanceBound = buildCreativePerformanceContracts({
      ...bound,
      assets,
    });

    return buildProductionGraph({
      ...input,
      ...performanceBound,
    });
  },
};

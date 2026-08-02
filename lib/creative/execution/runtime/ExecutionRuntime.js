import "@/lib/creative/production/dossier/runtime/CreativeOptimizedGraphPersistencePatch";

import {
  buildExecutionPlan,
} from "../planner/ExecutionPlanner";

import {
  createExecutionPlan,
} from "../documents/ExecutionPlan";

import {
  CreativeProductionDossierRuntime,
} from "@/lib/creative/production/dossier/runtime/CreativeProductionDossierRuntime";
import * as ProductionGraphRepository
from "@/lib/creative/production-graph/repositories/ProductionGraphRepository";

import * as Repository
from "../repositories/ExecutionRepository";

function storedExecution(record, planned) {
  const persistedPlan = record?.plan &&
    typeof record.plan === "object" &&
    !Array.isArray(record.plan)
    ? record.plan
    : null;

  return {
    ...planned,
    ...(persistedPlan || {}),
    id: record?.id || persistedPlan?.id || planned.id,
    status: record?.status || persistedPlan?.status || planned.status,
    created_at:
      record?.created_at || persistedPlan?.created_at || planned.created_at,
    updated_at:
      record?.updated_at || persistedPlan?.updated_at || planned.updated_at,
    steps: Array.isArray(persistedPlan?.steps)
      ? persistedPlan.steps
      : planned.steps,
  };
}

export const ExecutionRuntime = {
  async list(input = {}) {
    return Repository.listByProject(input);
  },

  async create(input = {}) {
    const plan = Array.isArray(input.steps)
      ? {
          ...input,
          updated_at: new Date().toISOString(),
        }
      : createExecutionPlan(input);

    const stored = await Repository.create(plan);
    const execution = storedExecution(stored, plan);
    if (!execution.production_graph_id) return execution;

    const graph = await ProductionGraphRepository.getById(
      execution.production_graph_id,
    );
    if (!graph) throw new Error("PRODUCTION_DOSSIER_GRAPH_NOT_FOUND");
    const dossier = await CreativeProductionDossierRuntime.materialize({
      organization_id: execution.organization_id,
      creative_project_id: execution.creative_project_id,
      production_graph: graph,
      execution_plan: execution,
    });

    return {
      ...execution,
      production_dossier: {
        asset_node_id: dossier.dossier_asset_node.id,
        dossier_hash: dossier.dossier.dossier_hash,
        plan_hash: dossier.dossier.immutable_evidence.plan_hash,
        graph_hash: dossier.dossier.immutable_evidence.graph_hash,
        execution_hash: dossier.dossier.immutable_evidence.execution_hash,
        estimated_cost: dossier.dossier.cost.estimated_total,
        currency: dossier.dossier.cost.currency,
        approval_required: true,
        approved: false,
      },
    };
  },

  async update(id, values) {
    return Repository.update(id, values);
  },

  async plan({
    organization_id,
    creative_project_id,
    production_graph,
  }) {
    return buildExecutionPlan({
      organization_id,
      creative_project_id,
      production_graph,
    });
  },
};

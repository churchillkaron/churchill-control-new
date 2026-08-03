import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.production-task-active-graph-scope.v1",
);
const CONTRACT = "CREATIVE_PRODUCTION_TASK_ACTIVE_GRAPH_SCOPE_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function activeGraph(graph = {}) {
  const status = text(graph.status).toUpperCase();
  return Boolean(
    !graph.archived &&
    !graph.archived_at &&
    !graph.superseded_at &&
    !graph.metadata?.archived_at &&
    !graph.metadata?.superseded_at &&
    !graph.metadata?.superseded_by &&
    !["ARCHIVED", "CANCELLED", "CANCELED", "REJECTED", "SUPERSEDED"]
      .includes(status)
  );
}

async function activeGraphId({
  organization_id,
  creative_project_id,
} = {}) {
  if (!organization_id || !creative_project_id) return null;

  const { data, error } = await supabaseAdmin
    .from("creative_production_graphs")
    .select("*")
    .eq("organization_id", organization_id)
    .eq("creative_project_id", creative_project_id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  const active = list(data).filter(activeGraph);
  if (!active.length) return null;
  if (active.length > 1) {
    throw new Error(
      `CREATIVE_PRODUCTION_TASK_ACTIVE_GRAPH_AMBIGUOUS:` +
      active.map((graph) => graph.id).join(","),
    );
  }
  return text(active[0].id) || null;
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;

  const listWithoutActiveGraphScope =
    ProductionTaskRuntime.list.bind(ProductionTaskRuntime);

  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.list =
    async function listWithActiveGraphScope(input = {}) {
      const tasks = await listWithoutActiveGraphScope(input);
      const explicitGraphId = text(input.production_graph_id);
      const graphId = explicitGraphId || await activeGraphId(input);
      if (!graphId) return tasks;

      return list(tasks)
        .filter((task) => text(task.production_graph_id) === graphId)
        .map((task) => ({
          ...task,
          metadata: {
            ...object(task.metadata),
            active_graph_scope_contract: CONTRACT,
            active_graph_scope_id: graphId,
          },
        }));
    };
}

install();

export const CreativeProductionTaskActiveGraphScopeRuntime = {
  installed: true,
  activeGraphId,
};

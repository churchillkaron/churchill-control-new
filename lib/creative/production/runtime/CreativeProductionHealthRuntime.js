import { listOrganizationTaskExceptions } from "@/lib/operations/tasks/repositories/ProductionTaskRepository";

function finiteDate(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export const CreativeProductionHealthRuntime = {
  async inspect({
    organization_id,
    window_hours = 24,
    stuck_minutes = 30,
  } = {}) {
    if (!organization_id) {
      throw new Error("CREATIVE_HEALTH_ORGANIZATION_REQUIRED");
    }

    const now = Date.now();
    const windowHours = Math.max(Number(window_hours) || 24, 1);
    const stuckMinutes = Math.max(Number(stuck_minutes) || 30, 1);
    const rows = await listOrganizationTaskExceptions({
      organization_id,
      since: new Date(now - windowHours * 60 * 60 * 1000).toISOString(),
    });
    const failed = rows.filter((row) => row.status === "FAILED");
    const stuck = rows.filter(
      (row) =>
        row.status === "RUNNING" &&
        now - finiteDate(row.updated_at || row.timing?.started_at) >
          stuckMinutes * 60 * 1000,
    );
    const running = rows.filter(
      (row) =>
        row.status === "RUNNING" &&
        !stuck.some((candidate) => candidate.id === row.id),
    );

    return {
      status: failed.length || stuck.length ? "degraded" : "healthy",
      window_hours: windowHours,
      failed_count: failed.length,
      stuck_count: stuck.length,
      running_count: running.length,
      exceptions: [...failed, ...stuck].slice(0, 20).map((row) => ({
        task_id: row.id,
        creative_project_id: row.creative_project_id,
        production_graph_id: row.production_graph_id,
        type: row.type,
        status: row.status,
        title: row.title,
        capability: row.capability,
        provider_id: row.provider_id,
        error: String(row.error || "").slice(0, 300) || null,
        updated_at: row.updated_at,
      })),
    };
  },
};

export default CreativeProductionHealthRuntime;

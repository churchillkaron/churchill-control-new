export const CRON_REGISTRY = [

  {
    name:
      "worker_orchestrator",
    endpoint:
      "/api/workers/orchestrator",
    interval:
      "* * * * *",
  },

  {
    name:
      "secretary_due_work",
    endpoint:
      "/api/internal/secretary/due-work/process",
    interval:
      "* * * * *",
  },

  {
    name:
      "nightly_owner_ai",
    endpoint:
      "/api/intelligence/agents/nightly",
    interval:
      "0 2 * * *",
  },

  {
    name:
      "backup_pipeline",
    endpoint:
      "/api/backups/run",
    interval:
      "0 * * * *",
  },

  {
    name:
      "monitoring_snapshot",
    endpoint:
      "/api/health/system",
    interval:
      "*/10 * * * *",
  },
];

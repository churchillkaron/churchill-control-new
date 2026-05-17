export const CRON_REGISTRY = [

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
      "queue_worker",
    endpoint:
      "/api/workers/run",
    interval:
      "* * * * *",
  },

  {
    name:
      "ai_worker",
    endpoint:
      "/api/workers/ai",
    interval:
      "*/5 * * * *",
  },

  {
    name:
      "monitoring_snapshot",
    endpoint:
      "/api/monitoring/snapshot",
    interval:
      "*/10 * * * *",
  },
];

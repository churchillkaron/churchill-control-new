import createJob from "@/lib/queue/createJob";

export default async function registerCron() {
  const jobs = [
    {
      type: "analytics_snapshot",
      payload: {},
    },
    {
      type: "backup_database",
      payload: {},
    },
    {
      type: "process_marketing_queue",
      payload: {},
    },
  ];

  const results = [];

  for (const job of jobs) {
    const result = await createJob({
      tenant_id: null,
      type: job.type,
      payload: job.payload,
    });

    results.push(result);
  }

  return {
    success: true,
    jobs_created: results.length,
    results,
  };
}

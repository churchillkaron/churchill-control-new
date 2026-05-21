import checkDatabaseHealth from "./checkDatabaseHealth";
import checkQueueHealth from "./checkQueueHealth";

export default async function checkSystemHealth() {
  const startedAt = Date.now();

  const database = await checkDatabaseHealth();
  const queue = await checkQueueHealth();

  const healthy =
    database.status === "healthy" &&
    queue.status === "healthy";

  return {
    status: healthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    services: {
      database,
      queue,
    },
  };
}

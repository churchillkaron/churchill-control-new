import checkDatabaseHealth from "./checkDatabaseHealth";
import checkQueueHealth from "./checkQueueHealth";

const OPERATIONAL_QUEUE_STATES = ["healthy", "idle", "demanded"];

export default async function checkSystemHealth() {
  const startedAt = Date.now();

  const [database, queue] = await Promise.all([
    checkDatabaseHealth(),
    checkQueueHealth(),
  ]);

  const databaseHealthy = database.status === "healthy";
  const queueOperational = OPERATIONAL_QUEUE_STATES.includes(queue.status);
  const healthy = databaseHealthy && queueOperational;
  const partial = databaseHealthy && queue.status === "unverified";

  return {
    status: healthy ? "healthy" : partial ? "partial" : "degraded",
    runtime_state: queue.status || "unverified",
    timestamp: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    services: {
      database,
      queue,
    },
  };
}

import checkDatabaseHealth from "./checkDatabaseHealth";
import checkQueueHealth from "./checkQueueHealth";

export default async function checkSystemHealth() {
  const startedAt = Date.now();

  const [database, queue] = await Promise.all([
    checkDatabaseHealth(),
    checkQueueHealth(),
  ]);

  const queueOperational = ["healthy", "idle"].includes(queue.status);
  const healthy = database.status === "healthy" && queueOperational;
  const partial = database.status === "healthy" && queue.status === "unverified";

  return {
    status: healthy ? "healthy" : partial ? "partial" : "degraded",
    timestamp: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    services: {
      database,
      queue,
    },
  };
}

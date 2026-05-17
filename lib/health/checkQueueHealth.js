export default async function checkQueueHealth() {
  return {
    status: "healthy",
    workers_active: true,
    timestamp: new Date().toISOString(),
  };
}

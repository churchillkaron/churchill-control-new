import checkSystemHealth from "@/lib/health/checkSystemHealth";

export default async function createSystemMetrics() {
  const health = await checkSystemHealth();

  return {
    status: health.status,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
    services: health.services,
  };
}

/**
 * FINANCE EXECUTION QUEUE (LEVEL 3 CORE)
 * Ensures deterministic financial processing
 */

const queue = [];

export function enqueueFinanceJob(job) {
  queue.push({
    ...job,
    id: job.id || `${Date.now()}-${Math.random()}`,
    status: "PENDING"
  });
}

export function getFinanceQueue() {
  return queue;
}

export function markJobComplete(id) {
  const job = queue.find(j => j.id === id);
  if (job) job.status = "COMPLETED";
}

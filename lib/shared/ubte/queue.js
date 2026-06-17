/**
 * UBTE QUEUE SYSTEM (LIGHTWEIGHT)
 * Production-ready abstraction (Redis-ready later)
 */

const queue = [];

/**
 * ADD JOB
 */
export function addJob(job) {
  queue.push({
    ...job,
    id: `${Date.now()}-${Math.random()}`,
    status: "pending",
    attempts: 0,
    createdAt: Date.now()
  });
}

/**
 * GET NEXT JOB
 */
export function getNextJob() {
  return queue.find(j => j.status === "pending");
}

/**
 * MARK JOB STATUS
 */
export function updateJob(id, updates) {
  const job = queue.find(j => j.id === id);
  if (!job) return;

  Object.assign(job, updates);
}

/**
 * GET ALL JOBS
 */
export function getJobs() {
  return queue;
}

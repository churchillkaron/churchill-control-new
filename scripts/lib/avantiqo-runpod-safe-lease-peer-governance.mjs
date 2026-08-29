const PRESERVE = "PRESERVE_ACTIVE_PEER";
const PRESERVE_IDLE = "PRESERVE_INTENTIONAL_IDLE_CAPACITY";
const REAP = "REAP_IDLE_ORPHAN";
const BLOCK = "BLOCK_UNSAFE_PEER";

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function laneForEndpoint(policy = {}, endpointName = null) {
  const name = text(endpointName);
  const match = Object.entries(policy?.lanes || {}).find(([, value]) => text(value) === name);
  return match?.[0] || null;
}

function intentionalRestingWorkersMax(policy = {}, endpointName = null) {
  const lane = laneForEndpoint(policy, endpointName);
  if (!lane) return finite(policy?.resting_workers_max, 0);
  return finite(
    policy?.lane_resting_workers_max?.[lane],
    finite(policy?.resting_workers_max, 0),
  );
}

export function classifyAvantiqoRunpodUnleasedPeer({
  row = {},
  policy = {},
  targetId = null,
} = {}) {
  if (!row || typeof row !== "object") {
    return { action: BLOCK, reason: "INVALID_PEER_STATE" };
  }
  if (text(row.id) && text(row.id) === text(targetId)) {
    return { action: BLOCK, reason: "TARGET_CANNOT_BE_UNLEASED" };
  }

  const workersMin = finite(row.workers_min, null);
  const workersMax = finite(row.workers_max, null);
  const activeWorkers = Math.max(0, finite(row.active_workers, 0));
  const hourlyCostUsd = Math.max(0, finite(row.hourly_cost_usd, 0));
  const jobs = finite(row.jobs, null);
  const maxJobs = Math.max(0, finite(policy.max_jobs_per_lease, 1));
  const parallelAllowed = policy.parallel_work_allowed === true;
  const active = activeWorkers > 0 || hourlyCostUsd > 0 || (jobs !== null && jobs > 0);

  if (row.health_error) {
    return { action: BLOCK, reason: "PEER_HEALTH_UNREADABLE" };
  }
  if (workersMin !== 0 || workersMax !== 1) {
    return {
      action: BLOCK,
      reason: "PEER_SCALING_UNBOUNDED",
      workers_min: workersMin,
      workers_max: workersMax,
    };
  }
  if (jobs === null || jobs < 0) {
    return { action: BLOCK, reason: "PEER_JOB_STATE_UNKNOWN" };
  }
  if (jobs > maxJobs) {
    return {
      action: BLOCK,
      reason: "PEER_JOB_LIMIT_EXCEEDED",
      jobs,
      max_jobs: maxJobs,
    };
  }
  if (!active) {
    const expectedRestingWorkersMax = intentionalRestingWorkersMax(policy, row.name);
    if (expectedRestingWorkersMax === 1) {
      return {
        action: PRESERVE_IDLE,
        reason: "INTENTIONAL_LANE_RESTING_CAPACITY",
        lane: laneForEndpoint(policy, row.name),
        workers_min: workersMin,
        workers_max: workersMax,
      };
    }
    return { action: REAP, reason: "IDLE_UNLEASED_ORPHAN" };
  }
  if (!parallelAllowed) {
    return { action: BLOCK, reason: "PARALLEL_WORK_DISABLED" };
  }

  return {
    action: PRESERVE,
    reason: "BOUNDED_ACTIVE_PARALLEL_PEER",
    jobs,
    active_workers: activeWorkers,
    hourly_cost_usd: hourlyCostUsd,
  };
}

export async function readAvantiqoDistributedLeaseRegistryBestEffort({
  name,
  reader,
  onDegraded = null,
} = {}) {
  if (typeof reader !== "function") {
    throw new Error("AVANTIQO_RUNPOD_SAFE_LEASE_REGISTRY_READER_REQUIRED");
  }
  try {
    const leases = await reader();
    return {
      name: text(name) || "UNKNOWN",
      leases: Array.isArray(leases) ? leases : [],
      degraded: false,
      error: null,
    };
  } catch (error) {
    const result = {
      name: text(name) || "UNKNOWN",
      leases: [],
      degraded: true,
      error: text(error?.message || error).slice(0, 500),
    };
    if (typeof onDegraded === "function") onDegraded(result);
    return result;
  }
}

export const AVANTIQO_RUNPOD_SAFE_LEASE_PEER_GOVERNANCE = Object.freeze({
  PRESERVE_ACTIVE_PEER: PRESERVE,
  PRESERVE_INTENTIONAL_IDLE_CAPACITY: PRESERVE_IDLE,
  REAP_IDLE_ORPHAN: REAP,
  BLOCK_UNSAFE_PEER: BLOCK,
});

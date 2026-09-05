import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ACTIVE_JOB_STATUSES = ["queued", "pending", "running", "processing"];
const HEARTBEAT_FRESH_MS = 120_000;

function ageMs(value, now = Date.now()) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) && timestamp > 0
    ? Math.max(0, now - timestamp)
    : null;
}

export default async function checkQueueHealth() {
  const startedAt = Date.now();
  const timestamp = new Date().toISOString();

  try {
    const [jobsResult, heartbeatResult] = await Promise.all([
      supabaseAdmin
        .from("queue_jobs")
        .select("id,status,worker_name,locked_at,started_at,scheduled_for,created_at")
        .in("status", ACTIVE_JOB_STATUSES)
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("runtime_heartbeat")
        .select("worker_name,status,last_seen,created_at")
        .order("last_seen", { ascending: false })
        .limit(100),
    ]);

    if (jobsResult.error || heartbeatResult.error) {
      return {
        status: "unverified",
        workers_active: null,
        active_jobs: null,
        fresh_workers: null,
        source: "QUEUE_RUNTIME_EVIDENCE_QUERY_FAILED",
        error: jobsResult.error?.message || heartbeatResult.error?.message || "Queue evidence query failed",
        latency_ms: Date.now() - startedAt,
        timestamp,
      };
    }

    const now = Date.now();
    const activeJobs = jobsResult.data || [];
    const heartbeats = heartbeatResult.data || [];
    const freshHeartbeats = heartbeats.filter(row => {
      const age = ageMs(row.last_seen, now);
      return age !== null && age <= HEARTBEAT_FRESH_MS;
    });
    const latestHeartbeat = heartbeats[0] || null;
    const demandExists = activeJobs.length > 0;
    const workersActive = freshHeartbeats.length > 0;

    if (!demandExists) {
      return {
        status: "idle",
        workers_active: workersActive,
        active_jobs: 0,
        fresh_workers: freshHeartbeats.length,
        latest_worker: latestHeartbeat?.worker_name || null,
        latest_heartbeat_at: latestHeartbeat?.last_seen || null,
        source: "QUEUE_JOBS_PLUS_RUNTIME_HEARTBEAT",
        interpretation: workersActive
          ? "NO_ACTIVE_QUEUE_DEMAND_WITH_FRESH_WORKER_HEARTBEAT"
          : "NO_ACTIVE_QUEUE_DEMAND_NO_FRESH_WORKER_HEARTBEAT",
        latency_ms: Date.now() - startedAt,
        timestamp,
      };
    }

    if (workersActive) {
      return {
        status: "healthy",
        workers_active: true,
        active_jobs: activeJobs.length,
        fresh_workers: freshHeartbeats.length,
        latest_worker: latestHeartbeat?.worker_name || null,
        latest_heartbeat_at: latestHeartbeat?.last_seen || null,
        source: "QUEUE_JOBS_PLUS_RUNTIME_HEARTBEAT",
        interpretation: "ACTIVE_QUEUE_DEMAND_WITH_FRESH_WORKER_HEARTBEAT",
        latency_ms: Date.now() - startedAt,
        timestamp,
      };
    }

    return {
      status: "degraded",
      workers_active: false,
      active_jobs: activeJobs.length,
      fresh_workers: 0,
      latest_worker: latestHeartbeat?.worker_name || null,
      latest_heartbeat_at: latestHeartbeat?.last_seen || null,
      source: "QUEUE_JOBS_PLUS_RUNTIME_HEARTBEAT",
      interpretation: "ACTIVE_QUEUE_DEMAND_WITHOUT_FRESH_WORKER_HEARTBEAT",
      latency_ms: Date.now() - startedAt,
      timestamp,
    };
  } catch (error) {
    return {
      status: "unverified",
      workers_active: null,
      active_jobs: null,
      fresh_workers: null,
      source: "QUEUE_RUNTIME_EVIDENCE_EXCEPTION",
      error: error?.message || "Queue health verification failed",
      latency_ms: Date.now() - startedAt,
      timestamp,
    };
  }
}

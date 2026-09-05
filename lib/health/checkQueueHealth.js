import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ACTIVE_JOB_STATUSES = ["queued", "pending", "running", "processing"];
const HEARTBEAT_FRESH_MS = 120_000;

function ageMs(value, now = Date.now()) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) && timestamp > 0
    ? Math.max(0, now - timestamp)
    : null;
}

function queryRows(result) {
  return result?.data || [];
}

function firstError(results) {
  return results.find(result => result?.error)?.error || null;
}

function laneCounts(intelligence, video, voice) {
  return {
    intelligence: queryRows(intelligence).length,
    video: queryRows(video).length,
    voice: queryRows(voice).length,
  };
}

export default async function checkQueueHealth() {
  const startedAt = Date.now();
  const timestamp = new Date().toISOString();

  try {
    const [
      jobsResult,
      heartbeatResult,
      intelligenceLeasesResult,
      videoLeasesResult,
      voiceLeasesResult,
      creativeTasksResult,
    ] = await Promise.all([
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
      supabaseAdmin
        .from("avantiqo_intelligence_runpod_leases")
        .select("id,lane,state,endpoint_name,last_refreshed_at,expires_at,released_at")
        .is("released_at", null)
        .gt("expires_at", timestamp)
        .limit(100),
      supabaseAdmin
        .from("avantiqo_video_runpod_leases")
        .select("id,lane,state,endpoint_name,expires_at,released_at,updated_at")
        .is("released_at", null)
        .gt("expires_at", timestamp)
        .limit(100),
      supabaseAdmin
        .from("avantiqo_voice_runpod_leases")
        .select("id,lane,state,endpoint_name,expires_at,released_at,updated_at")
        .is("released_at", null)
        .gt("expires_at", timestamp)
        .limit(100),
      supabaseAdmin
        .from("creative_production_tasks")
        .select("id,status,worker_id,lease_expires_at,last_heartbeat_at,updated_at")
        .not("worker_id", "is", null)
        .gt("lease_expires_at", timestamp)
        .limit(100),
    ]);

    const evidenceResults = [
      jobsResult,
      heartbeatResult,
      intelligenceLeasesResult,
      videoLeasesResult,
      voiceLeasesResult,
      creativeTasksResult,
    ];
    const error = firstError(evidenceResults);

    if (error) {
      return {
        status: "unverified",
        workers_active: null,
        active_jobs: null,
        active_runpod_leases: null,
        active_creative_tasks: null,
        demand_count: null,
        fresh_workers: null,
        source: "QUEUE_RUNTIME_EVIDENCE_QUERY_FAILED",
        error: error.message || "Runtime evidence query failed",
        latency_ms: Date.now() - startedAt,
        timestamp,
      };
    }

    const now = Date.now();
    const activeJobs = queryRows(jobsResult);
    const heartbeats = queryRows(heartbeatResult);
    const freshHeartbeats = heartbeats.filter(row => {
      const age = ageMs(row.last_seen, now);
      return age !== null && age <= HEARTBEAT_FRESH_MS;
    });
    const latestHeartbeat = heartbeats[0] || null;

    const runpodLeasesByLane = laneCounts(
      intelligenceLeasesResult,
      videoLeasesResult,
      voiceLeasesResult,
    );
    const activeRunpodLeases = Object.values(runpodLeasesByLane).reduce(
      (sum, count) => sum + count,
      0,
    );

    const activeCreativeTasks = queryRows(creativeTasksResult);
    const creativeTasksWithHeartbeat = activeCreativeTasks.filter(
      row => Boolean(row.last_heartbeat_at),
    );
    const latestCreativeHeartbeatAt = activeCreativeTasks.reduce((latest, row) => {
      const value = new Date(row.last_heartbeat_at || 0).getTime();
      return Number.isFinite(value) && value > latest ? value : latest;
    }, 0);

    const assignedQueueJobs = activeJobs.filter(
      row => Boolean(row.worker_name || row.locked_at || row.started_at),
    );
    const demandCount =
      activeJobs.length + activeRunpodLeases + activeCreativeTasks.length;
    const workersActive =
      freshHeartbeats.length > 0 || creativeTasksWithHeartbeat.length > 0;

    const base = {
      workers_active: workersActive,
      active_jobs: activeJobs.length,
      assigned_jobs: assignedQueueJobs.length,
      active_runpod_leases: activeRunpodLeases,
      runpod_leases_by_lane: runpodLeasesByLane,
      active_creative_tasks: activeCreativeTasks.length,
      creative_tasks_with_heartbeat: creativeTasksWithHeartbeat.length,
      demand_count: demandCount,
      fresh_workers: freshHeartbeats.length,
      latest_worker: latestHeartbeat?.worker_name || null,
      latest_heartbeat_at: latestHeartbeat?.last_seen || null,
      latest_creative_heartbeat_at: latestCreativeHeartbeatAt
        ? new Date(latestCreativeHeartbeatAt).toISOString()
        : null,
      source:
        "QUEUE_JOBS_PLUS_RUNTIME_HEARTBEAT_PLUS_RUNPOD_SAFE_LEASES_PLUS_CREATIVE_TASK_LEASES",
      latency_ms: Date.now() - startedAt,
      timestamp,
    };

    if (demandCount === 0) {
      return {
        ...base,
        status: "idle",
        interpretation: workersActive
          ? "NO_RUNTIME_DEMAND_WITH_FRESH_LIVENESS_EVIDENCE"
          : "NO_RUNTIME_DEMAND",
      };
    }

    const assignedWorkWithoutLiveness =
      (assignedQueueJobs.length > 0 && freshHeartbeats.length === 0) ||
      (activeCreativeTasks.length > 0 && creativeTasksWithHeartbeat.length === 0);

    if (assignedWorkWithoutLiveness) {
      return {
        ...base,
        status: "degraded",
        interpretation: "ASSIGNED_RUNTIME_DEMAND_WITHOUT_CURRENT_LIVENESS_EVIDENCE",
      };
    }

    return {
      ...base,
      status: "demanded",
      interpretation: workersActive
        ? "RUNTIME_DEMAND_WITH_CURRENT_LIVENESS_EVIDENCE"
        : "RUNTIME_DEMAND_WITHOUT_ASSIGNED_WORKER_LIVENESS_CONTRACT",
    };
  } catch (error) {
    return {
      status: "unverified",
      workers_active: null,
      active_jobs: null,
      active_runpod_leases: null,
      active_creative_tasks: null,
      demand_count: null,
      fresh_workers: null,
      source: "QUEUE_RUNTIME_EVIDENCE_EXCEPTION",
      error: error?.message || "Runtime health verification failed",
      latency_ms: Date.now() - startedAt,
      timestamp,
    };
  }
}

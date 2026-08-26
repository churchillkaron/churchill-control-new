import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const text = (value, limit = 4000) => String(value ?? "").trim().slice(0, limit);
const list = (value) => (Array.isArray(value) ? value : []);

const {
  ensureAvantiqoLearningOrganizationEnvironment,
} = await import("@/lib/intelligence/runtime/AvantiqoLearningOrganizationRuntime");
const {
  certifyAvantiqoModelTrainingReadiness,
} = await import("@/lib/intelligence/runtime/AvantiqoModelTrainingReadinessRuntime");
const {
  assertAvantiqoSharedTrainerReservation,
} = await import("@/lib/intelligence/runtime/AvantiqoSharedTrainerReservationGuard");
const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");

const organization = await ensureAvantiqoLearningOrganizationEnvironment();
const requestedJobId = text(process.env.AVANTIQO_MODEL_TRAINING_JOB_RECORD_ID, 160);

let jobQuery = supabaseAdmin
  .from("intelligence_memories")
  .select("id,subject,metadata,updated_at")
  .eq("organization_id", organization.organization_id)
  .eq("memory_scope", "platform_model_training_jobs")
  .eq("active", true)
  .eq("metadata->>status", "PREPARED")
  .order("updated_at", { ascending: false });

if (requestedJobId) {
  jobQuery = jobQuery.eq("id", requestedJobId).limit(1);
} else {
  jobQuery = jobQuery.limit(3);
}

const jobResult = await jobQuery;
if (jobResult.error) throw jobResult.error;
const jobs = list(jobResult.data);
if (requestedJobId && jobs.length !== 1) {
  throw new Error("AVANTIQO_SHARED_TRAINER_PREFLIGHT_REQUESTED_PREPARED_JOB_NOT_FOUND");
}
if (!requestedJobId && jobs.length !== 1) {
  throw new Error(
    `AVANTIQO_SHARED_TRAINER_PREFLIGHT_PREPARED_JOB_AMBIGUOUS:count=${jobs.length}`,
  );
}
const job = jobs[0];

const readiness = await certifyAvantiqoModelTrainingReadiness({
  trainingJobId: job.id,
});
if (readiness.status !== "READY_FOR_RESOURCE_PREFLIGHT") {
  throw new Error(
    `AVANTIQO_SHARED_TRAINER_PREFLIGHT_ARTIFACT_READINESS_FAILED:${readiness.status || "UNKNOWN"}`,
  );
}

const trainerEndpointId = text(
  process.env.RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID,
  160,
);
const queueApiKey = text(process.env.RUNPOD_API_KEY, 4000);
const managementApiKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY, 4000);
if (!trainerEndpointId) {
  throw new Error("RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID_REQUIRED");
}
if (!queueApiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");
if (!managementApiKey) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");

console.log(JSON.stringify({
  contract: "AVANTIQO_SHARED_TRAINER_RESOURCE_PREFLIGHT_LOCAL_V1",
  mode: "READ_ONLY_LIVE_RESOURCE_PREFLIGHT",
  learning_organization_resolved: Boolean(organization.organization_id),
  learning_organization_source: organization.source,
  prepared_job_resolved: true,
  artifact_readiness_verified: true,
  runpod_read_only_used: true,
  runpod_mutation_used: false,
  shared_trainer_mutated: false,
  provider_job_submitted: false,
  training_execution_authorized: false,
  training_execution_started: false,
  model_weight_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

let reservation;
try {
  reservation = await assertAvantiqoSharedTrainerReservation({
    trainerEndpointId,
    queueApiKey,
    managementApiKey,
  });
} catch (error) {
  console.log("AVANTIQO_SHARED_TRAINER_RESOURCE_PREFLIGHT=BLOCKED");
  console.log("AVANTIQO_SHARED_TRAINER_RESOURCE_PREFLIGHT_MUTATION=NO");
  console.log("AVANTIQO_SHARED_TRAINER_RESOURCE_PREFLIGHT_PROVIDER_JOB_SUBMITTED=NO");
  throw error;
}

const peers = list(reservation.peers).map((peer) => ({
  name: peer.name,
  workers_min: peer.workers_min,
  workers_max: peer.workers_max,
  live_management_workers: peer.live_management_workers,
  jobs_in_queue: Number(peer?.health?.jobs?.in_queue || 0),
  jobs_in_progress: Number(peer?.health?.jobs?.in_progress || 0),
  workers_idle: Number(peer?.health?.workers?.idle || 0),
  workers_initializing: Number(peer?.health?.workers?.initializing || 0),
  workers_ready: Number(peer?.health?.workers?.ready || 0),
  workers_running: Number(peer?.health?.workers?.running || 0),
  workers_throttled: Number(peer?.health?.workers?.throttled || 0),
  workers_unhealthy: Number(peer?.health?.workers?.unhealthy || 0),
  blocking_reasons: list(peer.blocking_reasons),
}));

console.log(JSON.stringify({
  contract: reservation.contract,
  status: "EXCLUSIVE_TRAINER_RESERVATION_VERIFIED",
  exclusive_trainer_reservation: reservation.exclusive_trainer_reservation === true,
  stable_observations: reservation.stable_observations,
  stability_delay_ms: reservation.stability_delay_ms,
  shared_peer_count: peers.length,
  peers,
  code_or_intelligence_reservation_present:
    reservation.code_or_intelligence_reservation_present === true,
  endpoint_mutation_performed: false,
  queue_mutation_performed: false,
  provider_job_submitted: false,
  training_execution_authorized: false,
  training_execution_started: false,
}, null, 2));

if (
  reservation.exclusive_trainer_reservation !== true ||
  reservation.stable_observations !== 2 ||
  reservation.code_or_intelligence_reservation_present !== false
) {
  throw new Error("AVANTIQO_SHARED_TRAINER_RESOURCE_PREFLIGHT_INVARIANT_FAILED");
}

console.log("AVANTIQO_SHARED_TRAINER_RESOURCE_PREFLIGHT=PASS");
console.log("AVANTIQO_SHARED_TRAINER_RESOURCE_PREFLIGHT_EXCLUSIVE_RESERVATION=YES");
console.log("AVANTIQO_SHARED_TRAINER_RESOURCE_PREFLIGHT_STABLE_OBSERVATIONS=2");
console.log("AVANTIQO_SHARED_TRAINER_RESOURCE_PREFLIGHT_CODE_OR_INTELLIGENCE_RESERVED=NO");
console.log("AVANTIQO_SHARED_TRAINER_RESOURCE_PREFLIGHT_MUTATION=NO");
console.log("AVANTIQO_SHARED_TRAINER_RESOURCE_PREFLIGHT_PROVIDER_JOB_SUBMITTED=NO");
console.log("AVANTIQO_MODEL_TRAINING_EXECUTION_AUTHORIZED=NO");
console.log("AVANTIQO_MODEL_TRAINING_EXECUTION_STARTED=NO");

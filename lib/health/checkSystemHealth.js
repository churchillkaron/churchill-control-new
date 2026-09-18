import checkDatabaseHealth from "./checkDatabaseHealth";
import checkQueueHealth from "./checkQueueHealth";
import { getBusinessDiagnosisReadiness } from "@/lib/intelligence/runtime/AvantiqoBusinessDiagnosisReadinessRuntime";

const OPERATIONAL_QUEUE_STATES = ["healthy", "idle", "demanded"];

export default async function checkSystemHealth() {
  const startedAt = Date.now();

  const [database, queue] = await Promise.all([
    checkDatabaseHealth(),
    checkQueueHealth(),
  ]);
  const businessDiagnosis = getBusinessDiagnosisReadiness();

  const databaseHealthy = database.status === "healthy";
  const queueOperational = OPERATIONAL_QUEUE_STATES.includes(queue.status);
  const diagnosisOperational = businessDiagnosis.ready === true;
  const healthy = databaseHealthy && queueOperational && diagnosisOperational;
  const partial = databaseHealthy && (queue.status === "unverified" || (!diagnosisOperational && businessDiagnosis.proof?.authenticity_required !== true));

  return {
    status: healthy ? "healthy" : partial ? "partial" : "degraded",
    runtime_state: queue.status || "unverified",
    timestamp: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    services: {
      database,
      queue,
      business_diagnosis: {
        status: businessDiagnosis.status,
        ready: businessDiagnosis.ready === true,
        authenticity_required: businessDiagnosis.proof?.authenticity_required === true,
        authenticity_available: businessDiagnosis.proof?.authenticity_available === true,
        blocker_count: Array.isArray(businessDiagnosis.blockers) ? businessDiagnosis.blockers.length : 0,
        authority_effect: "NONE",
      },
    },
  };
}

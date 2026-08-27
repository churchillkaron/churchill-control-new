export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  assembleAvantiqoTrainingDataset,
} from "@/lib/intelligence/runtime/AvantiqoTrainingDatasetRuntime";

const CONTRACT = "AVANTIQO_MODEL_IMPROVEMENT_READINESS_RECONCILIATION_V1";

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return (request.headers.get("authorization") || "") === `Bearer ${secret}`;
}

function safety(status = {}) {
  return {
    ...status,
    preparation_only: true,
    provider_call_performed: false,
    spend_authorized: false,
    runpod_job_submitted: false,
    synthetic_example_compilation_started: false,
    model_benchmark_started: false,
    model_canary_started: false,
    automatic_training_started: false,
    automatic_model_weight_mutation: false,
    production_model_promoted: false,
  };
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const dataset = await assembleAvantiqoTrainingDataset();
    return Response.json(
      safety({
        success: true,
        contract: CONTRACT,
        status: String(dataset?.status || "UNKNOWN"),
        training_dataset: dataset,
      }),
      { status: 200 },
    );
  } catch (error) {
    console.error("AVANTIQO_MODEL_IMPROVEMENT_READINESS_RECONCILIATION_FAILED", error);
    return Response.json(
      safety({
        success: false,
        contract: CONTRACT,
        status: "TRAINING_DATASET_READINESS_RECONCILIATION_FAILED",
        error: String(error?.message || error || "Readiness reconciliation failed").slice(0, 800),
      }),
      { status: 207 },
    );
  }
}

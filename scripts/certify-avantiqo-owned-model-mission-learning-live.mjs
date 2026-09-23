#!/usr/bin/env node

const result = {
  success: false,
  contract: "AVANTIQO_OWNED_MODEL_MISSION_LEARNING_LOCAL_CERTIFICATION_V2",
  status: "LOCAL_RUNTIME_REQUIRED",
  error: "AVANTIQO_OWNED_MODEL_MISSION_LEARNING_LOCAL_RUNTIME_REQUIRED",
  infrastructure_policy: "AVANTIQO_LOCAL_ONLY",
  external_compute_allowed: false,
  external_provider_job_submitted: false,
  production_model_promoted: false,
  production_deploy_performed: false,
  raw_reasoning_persisted: false,
};

console.error(JSON.stringify(result));
process.exitCode = 2;

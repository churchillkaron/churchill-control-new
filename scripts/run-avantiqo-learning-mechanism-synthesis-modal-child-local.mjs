#!/usr/bin/env node

const CONTRACT = "AVANTIQO_LEARNING_MECHANISM_SYNTHESIS_LEGACY_STUB_V3";

const error = new Error("AVANTIQO_LEARNING_SYNTHESIS_LOCAL_RUNTIME_REQUIRED");
error.code = "AVANTIQO_LEARNING_SYNTHESIS_LOCAL_RUNTIME_REQUIRED";
error.contract = CONTRACT;
error.external_compute_allowed = false;
error.provider_job_submitted = false;

console.error(JSON.stringify({
  success: false,
  contract: CONTRACT,
  error: error.code,
  infrastructure_policy: "AVANTIQO_LOCAL_ONLY",
  external_compute_allowed: false,
  provider_job_submitted: false,
  raw_reasoning_persisted: false,
}));
process.exitCode = 2;

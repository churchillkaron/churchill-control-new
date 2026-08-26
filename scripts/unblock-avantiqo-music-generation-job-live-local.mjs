#!/usr/bin/env node

const CONTRACT = "AVANTIQO_MUSIC_EXISTING_JOB_CAPACITY_UNBLOCK_DEPRECATED_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "audio";

const evidence = {
  success: false,
  contract: CONTRACT,
  reason: "DIRECT_MUSIC_RUNPOD_CAPACITY_REPAIR_FORBIDDEN",
  deprecated_contract: "AVANTIQO_MUSIC_EXISTING_JOB_CAPACITY_UNBLOCK_V1",
  replacement: {
    contract: SAFE_LEASE_CONTRACT,
    lane: SAFE_LEASE_LANE,
    controller: "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs",
    resting_workers_min: 0,
    resting_workers_max: 0,
    max_workers_per_lease: 1,
    max_jobs_per_lease: 1,
  },
  safety: {
    existing_unleased_job_rescue_forbidden: true,
    endpoint_mutation_performed: false,
    gpu_pool_mutation_performed: false,
    workers_opened: false,
    provider_job_submitted: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  },
  next_action: "START_NEW_MUSIC_WORK_ONLY_THROUGH_SAFE_LEASE_AUDIO_AFTER_EXPLICIT_SPEND_APPROVAL",
};

console.error(JSON.stringify(evidence, null, 2));
throw new Error("AVANTIQO_MUSIC_CAPACITY_UNBLOCK_FORBIDDEN_USE_SAFE_LEASE_V2");

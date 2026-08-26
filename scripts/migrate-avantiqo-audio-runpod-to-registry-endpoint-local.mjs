#!/usr/bin/env node

const CONTRACT = "AVANTIQO_AUDIO_REGISTRY_ENDPOINT_MIGRATION_DEPRECATED_V1";
const REASON = "LEGACY_ENDPOINT_REPLACEMENT_FORBIDDEN_USE_PARKED_REBIND_AND_SAFE_LEASE";

const result = {
  success: false,
  contract: CONTRACT,
  deprecated: true,
  reason: REASON,
  music_scope_only: true,
  replacement: {
    parked_endpoint_maintenance: "node scripts/rebind-avantiqo-audio-immutable-template-local.mjs",
    paid_execution_controller: "node scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs --lane=audio -- <music-command>",
    safe_lease_contract: "AVANTIQO_RUNPOD_SAFE_LEASE_V2",
    safe_lease_lane: "audio",
    resting_workers_min: 0,
    resting_workers_max: 0,
  },
  safety: {
    endpoint_created: false,
    endpoint_mutation_performed: false,
    workers_opened: false,
    provider_job_submitted: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  },
};

console.log(JSON.stringify(result, null, 2));
throw new Error(`AVANTIQO_AUDIO_REGISTRY_ENDPOINT_MIGRATION_FORBIDDEN:${REASON}`);

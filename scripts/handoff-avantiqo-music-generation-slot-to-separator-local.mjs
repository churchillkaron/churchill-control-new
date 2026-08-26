#!/usr/bin/env node

const CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_SLOT_HANDOFF_DEPRECATED_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "music-separator";

console.log(JSON.stringify({
  success: false,
  contract: CONTRACT,
  deprecated: true,
  reason: "DIRECT_RUNPOD_CAPACITY_HANDOFF_FORBIDDEN",
  safe_lease_contract: SAFE_LEASE_CONTRACT,
  safe_lease_lane: SAFE_LEASE_LANE,
  canonical_command: "node scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs --lane=music-separator --ttl-ms=1800000 -- node scripts/benchmark-avantiqo-music-separator-safe-lease-local.mjs",
  workers_opened: false,
  endpoint_mutation_performed: false,
  provider_job_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}, null, 2));

throw new Error("AVANTIQO_MUSIC_SEPARATOR_SLOT_HANDOFF_FORBIDDEN_USE_SAFE_LEASE_V2");

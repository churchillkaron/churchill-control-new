const CONTRACT = "AVANTIQO_CODE_INTERACTIVE_SCALING_RETIRED_V2";

console.error(JSON.stringify({
  success: false,
  contract: CONTRACT,
  reason: "PERSISTENT_CODE_0_1_SCALING_RETIRED",
  permanent_rest_state: "avantiqo-code-v1=0/0",
  paid_execution_path: "RUNPOD_SAFE_LEASE_V2_ONLY",
  replacement: "AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED=YES node scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs --lane=code -- <command>",
  workers_min_one_allowed: false,
  parallel_work_allowed: true,
  endpoint_mutation_performed: false,
  generation_submitted: false,
  production_deploy_performed: false,
  secrets_printed: false
}, null, 2));
process.exit(3);

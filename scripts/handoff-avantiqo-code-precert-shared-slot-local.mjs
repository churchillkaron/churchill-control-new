const CONTRACT = "AVANTIQO_CODE_PRECERT_SHARED_SLOT_HANDOFF_RETIRED_V3";

console.error(JSON.stringify({
  success: false,
  contract: CONTRACT,
  reason: "DIRECT_CODE_PRECERT_SLOT_HANDOFF_RETIRED",
  permanent_rest_state: "avantiqo-code-v1=0/0",
  paid_execution_path: "RUNPOD_SAFE_LEASE_V2_ONLY",
  replacement: "NODE_ENV=development AVANTIQO_CODE_PLANNER_SPEND_APPROVED=YES node scripts/run-code-ai-autonomous-planner-certification-local.mjs",
  replacement_is_auto_leased: true,
  workers_min_one_allowed: false,
  parallel_work_allowed: true,
  endpoint_mutation_performed: false,
  generation_submitted: false,
  production_deploy_performed: false,
  secrets_printed: false
}, null, 2));
process.exit(3);

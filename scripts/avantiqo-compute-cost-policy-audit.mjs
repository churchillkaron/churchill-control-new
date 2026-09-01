#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const CONTRACT = "AVANTIQO_COMPUTE_COST_ARCHITECTURE_V1";

async function read(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

const [policyRaw, architecture, engineeringRules, agents] = await Promise.all([
  read("config/avantiqo-compute-cost-policy.json"),
  read("docs/STUDIO_FIRST_COMPUTE.md"),
  read("docs/ENGINEERING_RULES.md"),
  read("AGENTS.md"),
]);

const policy = JSON.parse(policyRaw);
const failures = [];
const requireCheck = (name, condition) => {
  if (!condition) failures.push(name);
};

requireCheck("CONTRACT", policy.contract === CONTRACT);
requireCheck("DEFAULT_AVANTIQO", policy.default_execution === "AVANTIQO_OWNED_ZERO_MARGINAL");
requireCheck(
  "PRIORITY_ORDER",
  JSON.stringify(policy.priority) === JSON.stringify([
    "DO_NOT_COMPUTE",
    "AVANTIQO_OWNED_ZERO_MARGINAL",
    "AVANTIQO_OWNED_PAID_ACCELERATOR",
    "EXTERNAL_PAID_SPECIALIST",
  ]),
);
requireCheck("ZERO_MARGINAL_RULE", policy.rules?.keep_zero_marginal_work_in_avantiqo === true);
requireCheck("MODAL_GPU_ONLY", policy.rules?.modal_role === "ELASTIC_GPU_ACCELERATOR_ONLY");
requireCheck("NO_MODAL_CPU_BACKEND", policy.rules?.modal_general_cpu_backend_forbidden === true);
requireCheck("NO_DUPLICATE_PAID", policy.rules?.duplicate_paid_execution_forbidden === true);
requireCheck("NO_SPECULATIVE_PREWARM", policy.rules?.speculative_gpu_prewarm_forbidden === true);
requireCheck("ONE_JOB_CERTIFICATION", policy.rules?.one_real_certification_job_default === true);
requireCheck("BAKE_APPROVAL", policy.rules?.model_bake_requires_explicit_spend_approval === true);
requireCheck("SEED_APPROVAL", policy.rules?.model_seed_requires_explicit_spend_approval === true);
requireCheck("ONE_STORAGE", policy.rules?.one_canonical_persistent_model_storage_per_engine === true);
requireCheck("SCALE_ZERO", policy.modal_gpu_defaults?.scale_to_zero === true && policy.modal_gpu_defaults?.min_containers === 0);
requireCheck("MAX_ONE", policy.modal_gpu_defaults?.max_containers === 1);
requireCheck("CHEAPEST_GPU", policy.gpu_selection?.policy === "CHEAPEST_ADEQUATE_TOTAL_COST_PER_SUCCESSFUL_RESULT");
requireCheck("ARCHITECTURE_CONTRACT", architecture.includes(CONTRACT));
requireCheck("ARCHITECTURE_ZERO_COST", architecture.includes("AVANTIQO_OWNED_ZERO_MARGINAL"));
requireCheck("ARCHITECTURE_MODAL_ROLE", architecture.includes("Modal is Avantiqo's elastic accelerator execution layer"));
requireCheck("ENGINEERING_BOUNDARY", engineeringRules.includes("docs/STUDIO_FIRST_COMPUTE.md"));
requireCheck("AGENTS_LOCAL_FIRST", agents.includes("LOCAL FIRST. MAIN IS SOURCE OF TRUTH. PRODUCTION LAST."));

if (failures.length) {
  console.error(JSON.stringify({ success: false, contract: CONTRACT, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  default_execution: policy.default_execution,
  modal_role: policy.rules.modal_role,
  max_gpu_containers_default: policy.modal_gpu_defaults.max_containers,
  scale_to_zero: policy.modal_gpu_defaults.scale_to_zero,
  one_real_certification_job_default: policy.rules.one_real_certification_job_default,
}, null, 2));
console.log(`${CONTRACT}=PASS`);

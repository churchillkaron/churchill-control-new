import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_CODE_REAL_WRITE_POD_E2E_PROOF_V9";
const BASE_SCRIPT = "scripts/run-avantiqo-code-real-write-pod-e2e-proof-v8-local.mjs";
const BASE_CONTRACT = "AVANTIQO_CODE_REAL_WRITE_POD_E2E_PROOF_V8";
const ALLOCATOR_CAPACITY_SIGNATURE = "AVANTIQO_CODE_REAL_WRITE_E2E_PROOF_V1_RUNPOD_HTTP_500:create pod: There are no instances currently available";
const ALLOCATOR_CAPACITY_MARKER = `${CONTRACT}_ALLOCATOR_CAPACITY_UNAVAILABLE`;

function patchOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${CONTRACT}_${label}_MARKER_REQUIRED`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${CONTRACT}_${label}_MARKER_AMBIGUOUS`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function text(value, maximum = 8000) {
  return String(value ?? "").trim().slice(0, maximum);
}

if (text(process.env.NODE_ENV).toLowerCase() === "production") throw new Error(`${CONTRACT}_PRODUCTION_ENV_FORBIDDEN`);

const repositoryRoot = path.resolve(process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT || process.cwd());
let source = await readFile(path.join(repositoryRoot, BASE_SCRIPT), "utf8");
source = patchOnce(
  source,
  `const CONTRACT = "${BASE_CONTRACT}";`,
  `const CONTRACT = "${CONTRACT}";`,
  "CONTRACT",
);
source = patchOnce(
  source,
  "const MAX_POD_CREATE_ATTEMPTS = 2;",
  "const MAX_POD_CREATE_ATTEMPTS = 1;",
  "ONE_ALLOCATOR_ATTEMPT",
);

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "avantiqo-code-pod-proof-v9-"));
const tempScript = path.join(tempRoot, "proof.mjs");
await writeFile(tempScript, source, "utf8");

console.log(JSON.stringify({
  event: `${CONTRACT}_START`,
  base_script: BASE_SCRIPT,
  allocator_attempts_max: 1,
  availability_api_is_advisory_only: true,
  allocator_is_final_capacity_authority: true,
  duplicate_allocator_retry_for_same_placement: false,
  fallback_eligibility_requires_exact_allocator_capacity_signature: true,
  serverless_fallback_performed_by_this_script: false,
  new_storage_created: false,
  production_deploy_performed: false,
  secrets_printed: false,
}));

let allocatorCapacityUnavailable = false;
try {
  await import(`${pathToFileURL(tempScript).href}?v=${Date.now()}`);
} catch (error) {
  const message = text(error?.message || error, 12000);
  if (!message.includes(ALLOCATOR_CAPACITY_SIGNATURE)) throw error;
  allocatorCapacityUnavailable = true;
  console.log(JSON.stringify({
    event: ALLOCATOR_CAPACITY_MARKER,
    classification: "ALLOCATOR_CAPACITY_UNAVAILABLE",
    allocator_attempts_performed: 1,
    duplicate_allocator_retry_blocked: true,
    fallback_eligible: true,
    inference_performed: false,
    new_storage_created: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }));
  console.log(`${ALLOCATOR_CAPACITY_MARKER}=TRUE`);
} finally {
  await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
}

if (allocatorCapacityUnavailable) throw new Error(ALLOCATOR_CAPACITY_MARKER);
console.log(`${CONTRACT}=PASS`);

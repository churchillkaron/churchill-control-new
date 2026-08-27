import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CONTRACT = "AVANTIQO_CODE_RUNPOD_FALLBACK_POOL_REBIND_V3";
const SOURCE_SCRIPT = "rebind-avantiqo-code-runpod-fallback-pool-v2-local.mjs";
const SOURCE_CONTRACT = 'const CONTRACT = "AVANTIQO_CODE_RUNPOD_FALLBACK_POOL_REBIND_V2";';
const SOURCE_LIMIT = "const MAX_GPU_FALLBACKS = 3;";
const SOURCE_APPROVAL = "AVANTIQO_CODE_FALLBACK_POOL_REBIND_V2_APPROVED";
const SOURCE_LOG_PREFIX = "AVANTIQO_CODE_FALLBACK_POOL_V2";
const SOURCE_GRAPHQL_NAME = "AvantiqoCodeFallbackPoolV2";

function text(value) {
  return String(value ?? "").trim();
}

function replaceExactlyOnce(source, needle, replacement, code) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`${code}_ANCHOR_MISSING`);
  if (source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error(`${code}_ANCHOR_AMBIGUOUS`);
  }
  return source.replace(needle, replacement);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(scriptDir, SOURCE_SCRIPT);
if (!existsSync(sourcePath)) {
  throw new Error("AVANTIQO_CODE_FALLBACK_POOL_V3_V2_SOURCE_REQUIRED");
}

const source = readFileSync(sourcePath, "utf8");
for (const [needle, code] of [
  [SOURCE_CONTRACT, "AVANTIQO_CODE_FALLBACK_POOL_V3_SOURCE_CONTRACT"],
  [SOURCE_LIMIT, "AVANTIQO_CODE_FALLBACK_POOL_V3_SOURCE_LIMIT"],
  [SOURCE_APPROVAL, "AVANTIQO_CODE_FALLBACK_POOL_V3_SOURCE_APPROVAL"],
  [SOURCE_LOG_PREFIX, "AVANTIQO_CODE_FALLBACK_POOL_V3_SOURCE_LOG_PREFIX"],
  [SOURCE_GRAPHQL_NAME, "AVANTIQO_CODE_FALLBACK_POOL_V3_SOURCE_GRAPHQL_NAME"],
]) {
  if (!source.includes(needle)) throw new Error(`${code}_CHANGED_REPLAN_REQUIRED`);
}

let patched = replaceExactlyOnce(
  source,
  SOURCE_CONTRACT,
  'const CONTRACT = "AVANTIQO_CODE_RUNPOD_FALLBACK_POOL_REBIND_V3";',
  "AVANTIQO_CODE_FALLBACK_POOL_V3_CONTRACT",
);
patched = replaceExactlyOnce(
  patched,
  SOURCE_LIMIT,
  "const MAX_GPU_FALLBACKS = 5;",
  "AVANTIQO_CODE_FALLBACK_POOL_V3_LIMIT",
);
patched = patched
  .replaceAll(SOURCE_APPROVAL, "AVANTIQO_CODE_FALLBACK_POOL_REBIND_V3_APPROVED")
  .replaceAll(SOURCE_LOG_PREFIX, "AVANTIQO_CODE_FALLBACK_POOL_V3")
  .replaceAll(SOURCE_GRAPHQL_NAME, "AvantiqoCodeFallbackPoolV3");

const fallbackAnchor = `  fallback_pool: {\n    target_gpu_type_ids: selection.target_pool,`;
const fallbackReplacement = `  fallback_pool: {\n    target_gpu_type_ids: selection.target_pool,\n    maximum_gpu_fallbacks: MAX_GPU_FALLBACKS,\n    full_native_fp8_family_pool_enabled: true,`;
patched = replaceExactlyOnce(
  patched,
  fallbackAnchor,
  fallbackReplacement,
  "AVANTIQO_CODE_FALLBACK_POOL_V3_PLAN_METADATA",
);

if (
  patched === source ||
  patched.includes(SOURCE_CONTRACT) ||
  patched.includes(SOURCE_LIMIT) ||
  patched.includes(SOURCE_APPROVAL) ||
  patched.includes(SOURCE_LOG_PREFIX) ||
  patched.includes(SOURCE_GRAPHQL_NAME) ||
  !patched.includes("const MAX_GPU_FALLBACKS = 5;") ||
  !patched.includes("full_native_fp8_family_pool_enabled: true") ||
  !patched.includes("AVANTIQO_CODE_FALLBACK_POOL_REBIND_V3_APPROVED")
) {
  throw new Error("AVANTIQO_CODE_FALLBACK_POOL_V3_PATCH_VERIFY_FAILED");
}

const tempPath = resolve(scriptDir, `.avantiqo-code-fallback-pool-v3-${process.pid}.mjs`);
console.log(JSON.stringify({
  event: "AVANTIQO_CODE_FALLBACK_POOL_V3_START",
  contract: CONTRACT,
  source_contract: "AVANTIQO_CODE_RUNPOD_FALLBACK_POOL_REBIND_V2",
  stable_pool_member_limit_before: 3,
  stable_pool_member_limit_after: 5,
  approved_native_fp8_families: [
    "RTX_PRO_6000_BLACKWELL_96GB",
    "H100_NVL_94GB",
    "H100_80GB",
    "H200_141GB",
    "B200_180GB",
  ],
  stock_reorders_pool: false,
  a100_allowed: false,
  safe_lease_owns_scaling: true,
  permanent_rest_state: "0/0",
  volume_relocation_performed_by_wrapper: false,
  provider_job_submitted_by_wrapper: false,
  inference_performed_by_wrapper: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

try {
  writeFileSync(tempPath, patched, { encoding: "utf8", flag: "wx" });
  const syntax = spawnSync(process.execPath, ["--check", tempPath], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (syntax.error) throw syntax.error;
  if (syntax.status !== 0) {
    throw new Error(
      `AVANTIQO_CODE_FALLBACK_POOL_V3_GENERATED_SYNTAX_FAILED:${text(syntax.stderr || syntax.stdout).slice(0, 900)}`,
    );
  }
  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_FALLBACK_POOL_V3_GENERATED_SYNTAX_VERIFIED",
    runpod_mutation_performed_before_check: false,
  }));

  const child = spawnSync(process.execPath, [tempPath, ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (child.error) throw child.error;
  if (child.signal) throw new Error(`AVANTIQO_CODE_FALLBACK_POOL_V3_CHILD_SIGNAL:${child.signal}`);
  if (child.status !== 0) {
    throw new Error(`AVANTIQO_CODE_FALLBACK_POOL_V3_CHILD_EXIT:${child.status ?? "UNKNOWN"}`);
  }

  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_FALLBACK_POOL_V3_COMPLETE",
    contract: CONTRACT,
    child_exit_code: 0,
    stable_pool_member_limit: 5,
    full_native_fp8_family_pool_enabled: true,
    safe_lease_owns_scaling: true,
    permanent_rest_state: "0/0",
    production_deploy_performed: false,
    secrets_printed: false,
  }));
} finally {
  if (existsSync(tempPath)) unlinkSync(tempPath);
}

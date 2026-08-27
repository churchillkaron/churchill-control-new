import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CONTRACT = "AVANTIQO_CODE_RUNPOD_FALLBACK_POOL_REBIND_V4";
const SOURCE_SCRIPT = "rebind-avantiqo-code-runpod-fallback-pool-v2-local.mjs";

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
if (!existsSync(sourcePath)) throw new Error("AVANTIQO_CODE_FALLBACK_POOL_V4_V2_SOURCE_REQUIRED");

const source = readFileSync(sourcePath, "utf8");
const sourceContract = 'const CONTRACT = "AVANTIQO_CODE_RUNPOD_FALLBACK_POOL_REBIND_V2";';
const sourceApproval = "AVANTIQO_CODE_FALLBACK_POOL_REBIND_V2_APPROVED";
const sourceLogPrefix = "AVANTIQO_CODE_FALLBACK_POOL_V2";
const sourceGraphqlName = "AvantiqoCodeFallbackPoolV2";
const sourceSelection = `  // Datacenter visibility determines placement compatibility, not current stock.\n  // Stock is checked only after the stable pool is selected.\n  const visibleIds = new Set(list(dc.gpuAvailability).map((row) => text(row.gpuTypeId)).filter(Boolean));\n  const targetPool = compatibleGlobal\n    .filter((row) => visibleIds.has(row.id))\n    .slice(0, MAX_GPU_FALLBACKS)\n    .map((row) => row.id);`;
const targetSelection = `  // Runpod Serverless supports up to three GPU priorities. Prefer GPUs that are\n  // reported schedulable now, while preserving the certified stable preference\n  // inside the live and fallback groups. This prevents unavailable high-priority\n  // families from crowding live H100/H200/B200 capacity out of the three slots.\n  const visibleIds = new Set(list(dc.gpuAvailability).map((row) => text(row.gpuTypeId)).filter(Boolean));\n  const visibleCompatible = compatibleGlobal.filter((row) => visibleIds.has(row.id));\n  const liveCompatible = visibleCompatible.filter((row) => {\n    const live = availability.get(row.id) || {};\n    return live.available === true && stockRank(live.stockStatus) > 0;\n  });\n  const nonLiveCompatible = visibleCompatible.filter((row) => !liveCompatible.some((live) => live.id === row.id));\n  const targetPool = [...liveCompatible, ...nonLiveCompatible]\n    .slice(0, MAX_GPU_FALLBACKS)\n    .map((row) => row.id);`;
const sourceMetadata = `    stable_preference_order: true,\n    stock_changes_do_not_reorder_pool: true,`;
const targetMetadata = `    stable_preference_order: true,\n    stock_changes_do_not_reorder_pool: false,\n    runpod_supported_max_gpu_priorities: MAX_GPU_FALLBACKS,\n    live_stock_prioritized_within_stable_preference: true,`;

for (const [needle, code] of [
  [sourceContract, "AVANTIQO_CODE_FALLBACK_POOL_V4_SOURCE_CONTRACT"],
  [sourceApproval, "AVANTIQO_CODE_FALLBACK_POOL_V4_SOURCE_APPROVAL"],
  [sourceLogPrefix, "AVANTIQO_CODE_FALLBACK_POOL_V4_SOURCE_LOG_PREFIX"],
  [sourceGraphqlName, "AVANTIQO_CODE_FALLBACK_POOL_V4_SOURCE_GRAPHQL"],
  [sourceSelection, "AVANTIQO_CODE_FALLBACK_POOL_V4_SOURCE_SELECTION"],
  [sourceMetadata, "AVANTIQO_CODE_FALLBACK_POOL_V4_SOURCE_METADATA"],
]) {
  if (!source.includes(needle)) throw new Error(`${code}_CHANGED_REPLAN_REQUIRED`);
}

let patched = replaceExactlyOnce(
  source,
  sourceContract,
  'const CONTRACT = "AVANTIQO_CODE_RUNPOD_FALLBACK_POOL_REBIND_V4";',
  "AVANTIQO_CODE_FALLBACK_POOL_V4_CONTRACT",
);
patched = replaceExactlyOnce(
  patched,
  sourceSelection,
  targetSelection,
  "AVANTIQO_CODE_FALLBACK_POOL_V4_SELECTION",
);
patched = replaceExactlyOnce(
  patched,
  sourceMetadata,
  targetMetadata,
  "AVANTIQO_CODE_FALLBACK_POOL_V4_METADATA",
);
patched = patched
  .replaceAll(sourceApproval, "AVANTIQO_CODE_FALLBACK_POOL_REBIND_V4_APPROVED")
  .replaceAll(sourceLogPrefix, "AVANTIQO_CODE_FALLBACK_POOL_V4")
  .replaceAll(sourceGraphqlName, "AvantiqoCodeFallbackPoolV4")
  .replace('AVANTIQO_CODE_FALLBACK_POOL_V4_STOCK_REORDERS_POOL=false', 'AVANTIQO_CODE_FALLBACK_POOL_V4_STOCK_REORDERS_POOL=true');

if (
  patched === source ||
  patched.includes(sourceContract) ||
  patched.includes(sourceApproval) ||
  patched.includes(sourceLogPrefix) ||
  patched.includes(sourceGraphqlName) ||
  patched.includes(sourceSelection) ||
  !patched.includes("runpod_supported_max_gpu_priorities: MAX_GPU_FALLBACKS") ||
  !patched.includes("live_stock_prioritized_within_stable_preference: true") ||
  !patched.includes("AVANTIQO_CODE_FALLBACK_POOL_REBIND_V4_APPROVED")
) {
  throw new Error("AVANTIQO_CODE_FALLBACK_POOL_V4_PATCH_VERIFY_FAILED");
}

const tempPath = resolve(scriptDir, `.avantiqo-code-fallback-pool-v4-${process.pid}.mjs`);
console.log(JSON.stringify({
  event: "AVANTIQO_CODE_FALLBACK_POOL_V4_START",
  contract: CONTRACT,
  source_contract: "AVANTIQO_CODE_RUNPOD_FALLBACK_POOL_REBIND_V2",
  runpod_supported_max_gpu_priorities: 3,
  live_stock_prioritized_within_stable_preference: true,
  approved_native_fp8_families: [
    "RTX_PRO_6000_BLACKWELL_96GB",
    "H100_NVL_94GB",
    "H100_80GB",
    "H200_141GB",
    "B200_180GB",
  ],
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
    throw new Error(`AVANTIQO_CODE_FALLBACK_POOL_V4_GENERATED_SYNTAX_FAILED:${text(syntax.stderr || syntax.stdout).slice(0, 900)}`);
  }
  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_FALLBACK_POOL_V4_GENERATED_SYNTAX_VERIFIED",
    runpod_mutation_performed_before_check: false,
  }));

  const child = spawnSync(process.execPath, [tempPath, ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (child.error) throw child.error;
  if (child.signal) throw new Error(`AVANTIQO_CODE_FALLBACK_POOL_V4_CHILD_SIGNAL:${child.signal}`);
  if (child.status !== 0) throw new Error(`AVANTIQO_CODE_FALLBACK_POOL_V4_CHILD_EXIT:${child.status ?? "UNKNOWN"}`);

  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_FALLBACK_POOL_V4_COMPLETE",
    contract: CONTRACT,
    child_exit_code: 0,
    runpod_supported_max_gpu_priorities: 3,
    live_stock_prioritized_within_stable_preference: true,
    safe_lease_owns_scaling: true,
    permanent_rest_state: "0/0",
    production_deploy_performed: false,
    secrets_printed: false,
  }));
} finally {
  if (existsSync(tempPath)) unlinkSync(tempPath);
}

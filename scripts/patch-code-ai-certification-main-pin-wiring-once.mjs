import { readFile, writeFile } from "node:fs/promises";

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`PATCH_TARGET_MISSING:${label}`);
  return source.replace(before, after);
}

const capacityPath = "scripts/run-code-ai-autonomous-planner-certification-capacity-safe-local.mjs";
let capacity = await readFile(capacityPath, "utf8");

capacity = replaceRequired(
  capacity,
  `const mainCommit = ensureCurrentMain();\nconsole.log(JSON.stringify({`,
  `const mainCommit = ensureCurrentMain();\nconst certificationEnv = {\n  ...process.env,\n  AVANTIQO_CODE_CERTIFICATION_EXPECTED_MAIN_COMMIT: mainCommit,\n};\nconsole.log(JSON.stringify({`,
  "capacity-export-main-pin",
);
capacity = replaceRequired(
  capacity,
  `  main_commit: mainCommit,\n  code_resting_state_required: "0/0",`,
  `  main_commit: mainCommit,\n  certification_expected_main_commit: mainCommit,\n  certification_workspace_pin_active: true,\n  code_resting_state_required: "0/0",`,
  "capacity-log-main-pin",
);
capacity = replaceRequired(
  capacity,
  `  cwd: process.cwd(),\n  env: process.env,\n  stdio: "inherit",\n});\nif (result.error) throw result.error;`,
  `  cwd: process.cwd(),\n  env: certificationEnv,\n  stdio: "inherit",\n});\nif (result.error) throw result.error;`,
  "capacity-pass-main-pin-to-child",
);

if (!capacity.includes("AVANTIQO_CODE_CERTIFICATION_EXPECTED_MAIN_COMMIT: mainCommit")) {
  throw new Error("CODE_AI_CERTIFICATION_MAIN_PIN_ENV_NOT_WIRED");
}
if (!capacity.includes("env: certificationEnv")) {
  throw new Error("CODE_AI_CERTIFICATION_MAIN_PIN_CHILD_ENV_NOT_WIRED");
}
await writeFile(capacityPath, capacity, "utf8");

const livePath = "scripts/certify-code-ai-autonomous-planner-service-runtime-live.mjs";
let live = await readFile(livePath, "utf8");

live = replaceRequired(
  live,
  `const BASE_PRODUCTIVE_ITERATIONS = 12;\n\nfunction text(value) {`,
  `const BASE_PRODUCTIVE_ITERATIONS = 12;\nconst EXPECTED_MAIN_COMMIT = String(\n  process.env.AVANTIQO_CODE_CERTIFICATION_EXPECTED_MAIN_COMMIT || "",\n).trim().toLowerCase();\n\nfunction text(value) {`,
  "live-pin-constant",
);
live = replaceRequired(
  live,
  `  if (text(process.env.NODE_ENV).toLowerCase() !== "development") {\n    throw new Error("AVANTIQO_CODE_PLANNER_CERT_DEVELOPMENT_ENV_REQUIRED");\n  }\n\n  if (!text(process.env.RUNPOD_API_KEY)) {`,
  `  if (text(process.env.NODE_ENV).toLowerCase() !== "development") {\n    throw new Error("AVANTIQO_CODE_PLANNER_CERT_DEVELOPMENT_ENV_REQUIRED");\n  }\n  if (!/^[0-9a-f]{40}$/.test(EXPECTED_MAIN_COMMIT)) {\n    throw new Error("AVANTIQO_CODE_PLANNER_CERT_EXPECTED_MAIN_COMMIT_REQUIRED");\n  }\n  event("PIN_ACTIVE", {\n    expected_main_commit: EXPECTED_MAIN_COMMIT,\n    ref: REF,\n    provider_job_submitted: false,\n    wallet_mutation_performed: false,\n    production_deploy_performed: false,\n    secrets_printed: false,\n  });\n\n  if (!text(process.env.RUNPOD_API_KEY)) {`,
  "live-pin-fail-close",
);
live = replaceRequired(
  live,
  `      max_iterations: BASE_PRODUCTIVE_ITERATIONS,\n    });\n\n    const pendingProviderJobId = text(result.state?.planner_pending?.provider_job_id);\n    event("CYCLE_RESULT", {`,
  `      max_iterations: BASE_PRODUCTIVE_ITERATIONS,\n    });\n\n    const observedBaseCommit = text(result.state?.base_commit).toLowerCase();\n    if (observedBaseCommit !== EXPECTED_MAIN_COMMIT) {\n      throw new Error(\n        \`AVANTIQO_CODE_PLANNER_CERT_PINNED_BASE_MISMATCH:\${observedBaseCommit || "missing"}:\${EXPECTED_MAIN_COMMIT}\`,\n      );\n    }\n\n    const pendingProviderJobId = text(result.state?.planner_pending?.provider_job_id);\n    event("CYCLE_RESULT", {`,
  "live-pin-observed-base-check",
);
live = replaceRequired(
  live,
  `      iterations: result.iterations || 0,\n      pending_provider_job_id: pendingProviderJobId || null,`,
  `      iterations: result.iterations || 0,\n      expected_main_commit: EXPECTED_MAIN_COMMIT,\n      observed_base_commit: observedBaseCommit,\n      workspace_pin_verified: true,\n      pending_provider_job_id: pendingProviderJobId || null,`,
  "live-pin-cycle-evidence",
);

for (const marker of [
  "AVANTIQO_CODE_PLANNER_CERT_EXPECTED_MAIN_COMMIT_REQUIRED",
  "event(\"PIN_ACTIVE\"",
  "const observedBaseCommit = text(result.state?.base_commit).toLowerCase()",
  "AVANTIQO_CODE_PLANNER_CERT_PINNED_BASE_MISMATCH",
  "workspace_pin_verified: true",
]) {
  if (!live.includes(marker)) throw new Error(`CODE_AI_LIVE_CERT_PIN_MARKER_MISSING:${marker}`);
}
await writeFile(livePath, live, "utf8");

const auditPath = "scripts/code-ai-autonomy-loop-guard-audit.mjs";
let audit = await readFile(auditPath, "utf8");

audit = replaceRequired(
  audit,
  `const parserPath = "lib/code/runtime/CodeAIPlannerDecisionParser.js";\nconst parserSource = await readFile(parserPath, "utf8");`,
  `const parserPath = "lib/code/runtime/CodeAIPlannerDecisionParser.js";\nconst parserSource = await readFile(parserPath, "utf8");\nconst capacityRunnerPath = "scripts/run-code-ai-autonomous-planner-certification-capacity-safe-local.mjs";\nconst capacityRunnerSource = await readFile(capacityRunnerPath, "utf8");\nconst liveCertificationPath = "scripts/certify-code-ai-autonomous-planner-service-runtime-live.mjs";\nconst liveCertificationSource = await readFile(liveCertificationPath, "utf8");`,
  "audit-load-pin-sources",
);
audit = replaceRequired(
  audit,
  `const missing = requiredMarkers.filter((marker) => !source.includes(marker));`,
  `const capacityRunnerRequiredMarkers = [\n  "AVANTIQO_CODE_CERTIFICATION_EXPECTED_MAIN_COMMIT: mainCommit",\n  "certification_expected_main_commit: mainCommit",\n  "certification_workspace_pin_active: true",\n  "env: certificationEnv",\n];\nconst capacityRunnerMissing = capacityRunnerRequiredMarkers.filter(\n  (marker) => !capacityRunnerSource.includes(marker),\n);\nif (capacityRunnerMissing.length) {\n  throw new Error(\n    \`CODE_AI_AUTONOMY_CERTIFICATION_PIN_LAUNCHER_MARKERS_MISSING:\${capacityRunnerMissing.join(",")}\`,\n  );\n}\n\nconst liveCertificationRequiredMarkers = [\n  "AVANTIQO_CODE_CERTIFICATION_EXPECTED_MAIN_COMMIT",\n  "AVANTIQO_CODE_PLANNER_CERT_EXPECTED_MAIN_COMMIT_REQUIRED",\n  "event(\\\"PIN_ACTIVE\\\"",\n  "const observedBaseCommit = text(result.state?.base_commit).toLowerCase()",\n  "AVANTIQO_CODE_PLANNER_CERT_PINNED_BASE_MISMATCH",\n  "expected_main_commit: EXPECTED_MAIN_COMMIT",\n  "observed_base_commit: observedBaseCommit",\n  "workspace_pin_verified: true",\n];\nconst liveCertificationMissing = liveCertificationRequiredMarkers.filter(\n  (marker) => !liveCertificationSource.includes(marker),\n);\nif (liveCertificationMissing.length) {\n  throw new Error(\n    \`CODE_AI_AUTONOMY_LIVE_CERTIFICATION_PIN_MARKERS_MISSING:\${liveCertificationMissing.join(",")}\`,\n  );\n}\n\nconst missing = requiredMarkers.filter((marker) => !source.includes(marker));`,
  "audit-pin-marker-checks",
);
audit = replaceRequired(
  audit,
  `const pinnedCommitResolver = workspaceSource.indexOf("function certificationPinnedCommit(ref)");`,
  `const capacityMainCommit = capacityRunnerSource.indexOf("const mainCommit = ensureCurrentMain()");\nconst capacityPinEnv = capacityRunnerSource.indexOf(\n  "AVANTIQO_CODE_CERTIFICATION_EXPECTED_MAIN_COMMIT: mainCommit",\n  capacityMainCommit,\n);\nconst capacityChildSpawn = capacityRunnerSource.indexOf(\n  "scripts/run-code-ai-autonomous-planner-certification-resilient-local.mjs",\n  capacityPinEnv,\n);\nconst capacityChildPinEnv = capacityRunnerSource.indexOf("env: certificationEnv", capacityChildSpawn);\nif (\n  capacityMainCommit < 0 ||\n  capacityPinEnv <= capacityMainCommit ||\n  capacityChildSpawn <= capacityPinEnv ||\n  capacityChildPinEnv <= capacityChildSpawn\n) {\n  throw new Error("CODE_AI_AUTONOMY_CERTIFICATION_MAIN_PIN_MUST_REACH_CHILD_ENV");\n}\n\nconst livePinGuard = liveCertificationSource.indexOf(\n  "AVANTIQO_CODE_PLANNER_CERT_EXPECTED_MAIN_COMMIT_REQUIRED",\n);\nconst livePlannerCall = liveCertificationSource.indexOf("const result = await executeAutonomousCodeMission", livePinGuard);\nconst liveObservedBase = liveCertificationSource.indexOf(\n  "const observedBaseCommit = text(result.state?.base_commit).toLowerCase()",\n  livePlannerCall,\n);\nconst livePinnedMismatch = liveCertificationSource.indexOf(\n  "AVANTIQO_CODE_PLANNER_CERT_PINNED_BASE_MISMATCH",\n  liveObservedBase,\n);\nconst liveCycleResult = liveCertificationSource.indexOf('event("CYCLE_RESULT"', livePinnedMismatch);\nif (\n  livePinGuard < 0 ||\n  livePlannerCall <= livePinGuard ||\n  liveObservedBase <= livePlannerCall ||\n  livePinnedMismatch <= liveObservedBase ||\n  liveCycleResult <= livePinnedMismatch\n) {\n  throw new Error("CODE_AI_AUTONOMY_LIVE_CERTIFICATION_PIN_MUST_FAIL_CLOSED_AROUND_PLANNER_CYCLE");\n}\n\nconst pinnedCommitResolver = workspaceSource.indexOf("function certificationPinnedCommit(ref)");`,
  "audit-pin-ordering",
);
audit = replaceRequired(
  audit,
  `  contract: "AVANTIQO_CODE_AI_AUTONOMY_LOOP_GUARD_AUDIT_V9",`,
  `  contract: "AVANTIQO_CODE_AI_AUTONOMY_LOOP_GUARD_AUDIT_V10",`,
  "audit-contract-v10",
);
audit = replaceRequired(
  audit,
  `    certification_workspace_pinned_to_preflight_main_commit: true,\n    parallel_main_commits_do_not_move_certification_workspace: true,`,
  `    certification_workspace_pinned_to_preflight_main_commit: true,\n    certification_launcher_exports_pinned_main_commit: true,\n    live_certification_fails_closed_without_valid_pin: true,\n    live_certification_checks_observed_workspace_base_against_pin: true,\n    parallel_main_commits_do_not_move_certification_workspace: true,`,
  "audit-pin-verification-fields",
);

for (const marker of [
  "AVANTIQO_CODE_AI_AUTONOMY_LOOP_GUARD_AUDIT_V10",
  "certification_launcher_exports_pinned_main_commit: true",
  "live_certification_fails_closed_without_valid_pin: true",
  "live_certification_checks_observed_workspace_base_against_pin: true",
  "CODE_AI_AUTONOMY_CERTIFICATION_MAIN_PIN_MUST_REACH_CHILD_ENV",
  "CODE_AI_AUTONOMY_LIVE_CERTIFICATION_PIN_MUST_FAIL_CLOSED_AROUND_PLANNER_CYCLE",
]) {
  if (!audit.includes(marker)) throw new Error(`CODE_AI_PIN_AUDIT_MARKER_MISSING:${marker}`);
}
await writeFile(auditPath, audit, "utf8");

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_AI_CERTIFICATION_MAIN_PIN_WIRING_PATCH_V1",
  files_changed: [capacityPath, livePath, auditPath],
  launcher_exports_preflight_main_commit: true,
  live_certification_requires_valid_pin: true,
  each_cycle_verifies_observed_base_commit: true,
  parallel_main_commits_can_move_without_replanning_certification_workspace: true,
  provider_calls_executed: false,
  provider_spend_performed: false,
  runpod_lease_opened: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

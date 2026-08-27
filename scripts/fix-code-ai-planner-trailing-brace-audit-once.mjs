import { readFile, writeFile } from "node:fs/promises";

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`PATCH_TARGET_MISSING:${label}`);
  return source.replace(before, after);
}

const auditPath = "scripts/code-ai-autonomy-loop-guard-audit.mjs";
let audit = await readFile(auditPath, "utf8");

if (!audit.includes('contract: "AVANTIQO_CODE_AI_AUTONOMY_LOOP_GUARD_AUDIT_V8"')) {
  throw new Error("CODE_AI_TRAILING_BRACE_AUDIT_V8_REQUIRED");
}
if (!audit.includes("single_guarded_trailing_brace_over_emission")) {
  throw new Error("CODE_AI_TRAILING_BRACE_REGRESSION_NOT_PRESENT");
}

audit = replaceRequired(
  audit,
  `const promptPath = "lib/code/runtime/CodeAIPlannerPromptRuntime.js";\nconst promptSource = await readFile(promptPath, "utf8");`,
  `const promptPath = "lib/code/runtime/CodeAIPlannerPromptRuntime.js";\nconst promptSource = await readFile(promptPath, "utf8");\nconst parserPath = "lib/code/runtime/CodeAIPlannerDecisionParser.js";\nconst parserSource = await readFile(parserPath, "utf8");`,
  "audit-parser-source-load",
);

audit = replaceRequired(
  audit,
  `  "planner_output_normalization",\n  "output_normalization: decision.planner_output_normalization || null",\n  "safeSingleTrailingBraceOverEmission",\n  "single_guarded_trailing_brace_over_emission",\n  "discarded_trailing_brace_count",`,
  `  "planner_output_normalization",\n  "output_normalization: decision.planner_output_normalization || null",`,
  "audit-remove-parser-markers-from-runtime-check",
);

audit = replaceRequired(
  audit,
  `const promptMissing = promptRequiredMarkers.filter((marker) => !promptSource.includes(marker));\nif (promptMissing.length) {\n  throw new Error(\`CODE_AI_AUTONOMY_PLANNER_PROMPT_MARKERS_MISSING:\${promptMissing.join(",")}\`);\n}\nif (!source.includes('buildCodeAIPlannerPromptTransport') || !source.includes('instruction: transport.instruction')) {`,
  `const promptMissing = promptRequiredMarkers.filter((marker) => !promptSource.includes(marker));\nif (promptMissing.length) {\n  throw new Error(\`CODE_AI_AUTONOMY_PLANNER_PROMPT_MARKERS_MISSING:\${promptMissing.join(",")}\`);\n}\n\nconst parserRequiredMarkers = [\n  "safeSingleTrailingBraceOverEmission",\n  "single_guarded_trailing_brace_over_emission",\n  "discarded_trailing_brace_count",\n];\nconst parserMissing = parserRequiredMarkers.filter((marker) => !parserSource.includes(marker));\nif (parserMissing.length) {\n  throw new Error(\`CODE_AI_AUTONOMY_PLANNER_PARSER_MARKERS_MISSING:\${parserMissing.join(",")}\`);\n}\n\nif (!source.includes('buildCodeAIPlannerPromptTransport') || !source.includes('instruction: transport.instruction')) {`,
  "audit-parser-marker-check",
);

await writeFile(auditPath, audit, "utf8");

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_AI_PLANNER_TRAILING_BRACE_AUDIT_FIX_V1",
  audit_path: auditPath,
  parser_markers_checked_against_parser_source: true,
  runtime_marker_contract_unchanged: true,
  parser_behavior_changed: false,
  provider_calls_executed: false,
  provider_spend_performed: false,
  runpod_lease_opened: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

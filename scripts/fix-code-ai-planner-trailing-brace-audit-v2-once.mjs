import { readFile, writeFile } from "node:fs/promises";

const auditPath = "scripts/code-ai-autonomy-loop-guard-audit.mjs";
const parserPath = "lib/code/runtime/CodeAIPlannerDecisionParser.js";
const parserMarkers = [
  "safeSingleTrailingBraceOverEmission",
  "single_guarded_trailing_brace_over_emission",
  "discarded_trailing_brace_count",
];

let audit = await readFile(auditPath, "utf8");
const parserSource = await readFile(parserPath, "utf8");

if (!audit.includes('contract: "AVANTIQO_CODE_AI_AUTONOMY_LOOP_GUARD_AUDIT_V8"')) {
  throw new Error("CODE_AI_TRAILING_BRACE_AUDIT_V8_REQUIRED");
}
for (const marker of parserMarkers) {
  if (!parserSource.includes(marker)) {
    throw new Error(`CODE_AI_TRAILING_BRACE_PARSER_MARKER_MISSING:${marker}`);
  }
}

const requiredStart = audit.indexOf("const requiredMarkers = [");
if (requiredStart < 0) throw new Error("CODE_AI_RUNTIME_REQUIRED_MARKERS_BLOCK_MISSING");
const requiredEnd = audit.indexOf("\n];", requiredStart);
if (requiredEnd < 0) throw new Error("CODE_AI_RUNTIME_REQUIRED_MARKERS_BLOCK_UNTERMINATED");

let requiredBlock = audit.slice(requiredStart, requiredEnd + 3);
for (const marker of parserMarkers) {
  requiredBlock = requiredBlock.replace(new RegExp(`\\n\\s*"${marker}",`, "g"), "");
}
for (const marker of parserMarkers) {
  if (requiredBlock.includes(marker)) {
    throw new Error(`CODE_AI_PARSER_MARKER_STILL_IN_RUNTIME_REQUIRED_BLOCK:${marker}`);
  }
}
audit = audit.slice(0, requiredStart) + requiredBlock + audit.slice(requiredEnd + 3);

if (!audit.includes('const parserPath = "lib/code/runtime/CodeAIPlannerDecisionParser.js";')) {
  const anchor = 'const promptSource = await readFile(promptPath, "utf8");';
  if (!audit.includes(anchor)) throw new Error("CODE_AI_AUDIT_PROMPT_SOURCE_ANCHOR_MISSING");
  audit = audit.replace(
    anchor,
    `${anchor}\nconst parserPath = "lib/code/runtime/CodeAIPlannerDecisionParser.js";\nconst parserSource = await readFile(parserPath, "utf8");`,
  );
}

if (!audit.includes("const parserRequiredMarkers = [")) {
  const anchor = `if (promptMissing.length) {\n  throw new Error(\`CODE_AI_AUTONOMY_PLANNER_PROMPT_MARKERS_MISSING:\${promptMissing.join(",")}\`);\n}`;
  if (!audit.includes(anchor)) throw new Error("CODE_AI_AUDIT_PROMPT_MARKER_CHECK_ANCHOR_MISSING");
  audit = audit.replace(
    anchor,
    `${anchor}\n\nconst parserRequiredMarkers = [\n  "safeSingleTrailingBraceOverEmission",\n  "single_guarded_trailing_brace_over_emission",\n  "discarded_trailing_brace_count",\n];\nconst parserMissing = parserRequiredMarkers.filter((marker) => !parserSource.includes(marker));\nif (parserMissing.length) {\n  throw new Error(\`CODE_AI_AUTONOMY_PLANNER_PARSER_MARKERS_MISSING:\${parserMissing.join(",")}\`);\n}`,
  );
}

const finalRequiredStart = audit.indexOf("const requiredMarkers = [");
const finalRequiredEnd = audit.indexOf("\n];", finalRequiredStart);
const finalRequiredBlock = audit.slice(finalRequiredStart, finalRequiredEnd + 3);
for (const marker of parserMarkers) {
  if (finalRequiredBlock.includes(marker)) {
    throw new Error(`CODE_AI_PARSER_MARKER_RUNTIME_BLOCK_VERIFICATION_FAILED:${marker}`);
  }
}
if (!audit.includes("const parserRequiredMarkers = [")) {
  throw new Error("CODE_AI_PARSER_REQUIRED_MARKERS_CHECK_NOT_WIRED");
}
for (const marker of parserMarkers) {
  const parserCheckStart = audit.indexOf("const parserRequiredMarkers = [");
  const parserCheckEnd = audit.indexOf("\n];", parserCheckStart);
  const parserCheckBlock = audit.slice(parserCheckStart, parserCheckEnd + 3);
  if (!parserCheckBlock.includes(marker)) {
    throw new Error(`CODE_AI_PARSER_MARKER_CHECK_MISSING:${marker}`);
  }
}

await writeFile(auditPath, audit, "utf8");

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_AI_PLANNER_TRAILING_BRACE_AUDIT_FIX_V2",
  audit_path: auditPath,
  runtime_required_markers_clean: true,
  parser_markers_checked_against_parser_source: true,
  parser_behavior_changed: false,
  provider_calls_executed: false,
  provider_spend_performed: false,
  runpod_lease_opened: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

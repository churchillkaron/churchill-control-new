import { readFile, writeFile } from "node:fs/promises";

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`PATCH_TARGET_MISSING:${label}`);
  return source.replace(before, after);
}

const parserPath = "lib/code/runtime/CodeAIPlannerDecisionParser.js";
let parser = await readFile(parserPath, "utf8");

parser = replaceRequired(
  parser,
  `function topLevelJsonObjects(raw) {`,
  `function safeSingleTrailingBraceOverEmission(raw) {
  if (!raw.endsWith("}")) return null;
  const candidate = raw.slice(0, -1).trimEnd();
  if (!candidate.endsWith("}")) return null;

  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }

  const action = actionOf(parsed);
  if (!SAFE_MULTI_OBJECT_ACTIONS.has(action)) return null;

  return {
    parsed,
    normalization: {
      mode: "single_guarded_trailing_brace_over_emission",
      object_count: 1,
      discarded_count: 0,
      discarded_trailing_brace_count: 1,
      action,
    },
  };
}

function topLevelJsonObjects(raw) {`,
  "parser-safe-trailing-brace-helper",
);

parser = replaceRequired(
  parser,
  `  } catch {}

  const objects = topLevelJsonObjects(raw);`,
  `  } catch {}

  const trailingBraceRecovery = safeSingleTrailingBraceOverEmission(raw);
  if (trailingBraceRecovery) return trailingBraceRecovery;

  const objects = topLevelJsonObjects(raw);`,
  "parser-safe-trailing-brace-recovery",
);

await writeFile(parserPath, parser, "utf8");

const auditPath = "scripts/code-ai-autonomy-loop-guard-audit.mjs";
let audit = await readFile(auditPath, "utf8");

audit = replaceRequired(
  audit,
  `assert.equal(liveOverEmission.normalization.action, "read");

assert.throws(`,
  `assert.equal(liveOverEmission.normalization.action, "read");

const liveTrailingBraceOverEmission = parseCodeAIPlannerOutput(
  '{"action":"read","description":"Read the content of the first specified fixture file to understand its current state and identify issues.","input":{"file_path":"tests/fixtures/code-ai-autonomous-multifile/normalize-money.mjs","start_line":1,"end_line":400}}}',
);
assert.equal(liveTrailingBraceOverEmission.parsed.action, "read");
assert.equal(
  liveTrailingBraceOverEmission.parsed.input.file_path,
  "tests/fixtures/code-ai-autonomous-multifile/normalize-money.mjs",
);
assert.equal(
  liveTrailingBraceOverEmission.normalization.mode,
  "single_guarded_trailing_brace_over_emission",
);
assert.equal(liveTrailingBraceOverEmission.normalization.discarded_trailing_brace_count, 1);

assert.throws(
  () => parseCodeAIPlannerOutput(
    '{"action":"apply_files","description":"edit","input":{"files":[]}}}',
  ),
  /CODE_AI_AUTONOMOUS_PLANNER_JSON_INVALID/,
);
assert.throws(
  () => parseCodeAIPlannerOutput(
    '{"action":"read","description":"read","input":{"file_path":"a.js"}}}}',
  ),
  /CODE_AI_AUTONOMOUS_PLANNER_JSON_INVALID/,
);

assert.throws(`,
  "audit-live-trailing-brace-regression",
);

audit = replaceRequired(
  audit,
  `  "planner_output_normalization",
  "output_normalization: decision.planner_output_normalization || null",`,
  `  "planner_output_normalization",
  "output_normalization: decision.planner_output_normalization || null",
  "safeSingleTrailingBraceOverEmission",
  "single_guarded_trailing_brace_over_emission",
  "discarded_trailing_brace_count",`,
  "audit-parser-markers",
);

audit = replaceRequired(
  audit,
  `contract: "AVANTIQO_CODE_AI_AUTONOMY_LOOP_GUARD_AUDIT_V7",`,
  `contract: "AVANTIQO_CODE_AI_AUTONOMY_LOOP_GUARD_AUDIT_V8",`,
  "audit-contract-v8",
);

audit = replaceRequired(
  audit,
  `    planner_prompt_forbids_multi_object_output: true,`,
  `    planner_prompt_forbids_multi_object_output: true,
    single_guarded_trailing_brace_over_emission_normalized: true,
    mutating_trailing_brace_over_emission_fails_closed: true,
    multiple_trailing_braces_fail_closed: true,`,
  "audit-output-trailing-brace-coverage",
);

await writeFile(auditPath, audit, "utf8");

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_AI_PLANNER_TRAILING_BRACE_NORMALIZATION_PATCH_V1",
  files_changed: [parserPath, auditPath],
  live_failure_shape_covered: true,
  safe_guarded_actions_only: ["read", "search", "run"],
  exactly_one_redundant_trailing_brace_only: true,
  mutating_action_recovery_allowed: false,
  multiple_trailing_brace_recovery_allowed: false,
  provider_calls_executed: false,
  provider_spend_performed: false,
  runpod_lease_opened: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

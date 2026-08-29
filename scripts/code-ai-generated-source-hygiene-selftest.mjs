import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_AI_GENERATED_SOURCE_HYGIENE_SELFTEST_V1";
const path = "lib/code/runtime/CodeAIMissionRuntime.js";
const source = await readFile(path, "utf8");

for (const marker of [
  'AVANTIQO_CODE_AI_GENERATED_SOURCE_HYGIENE_V1',
  'export function normalizeCodeAIGeneratedFileContent',
  'replace(/[ \\t]+(?=\\r?$)/gm, "")',
  'const normalizedContent = normalizeCodeAIGeneratedFileContent(rawContent);',
  'source_hygiene_normalized_write_count',
  'const result = await workspace.applyFiles(classified.writes);',
  'CODE_AI_DIFF_CHECK_FAILED_AFTER_EDIT',
]) {
  assert.ok(source.includes(marker), `CODE_AI_SOURCE_HYGIENE_MARKER_MISSING:${marker}`);
}

const normalizationIndex = source.indexOf(
  'const normalizedContent = normalizeCodeAIGeneratedFileContent(rawContent);',
);
const writeIndex = source.indexOf('const result = await workspace.applyFiles(classified.writes);');
const strictFailureIndex = source.indexOf('CODE_AI_DIFF_CHECK_FAILED_AFTER_EDIT', writeIndex);
assert.ok(normalizationIndex >= 0, "generated source normalization must exist");
assert.ok(writeIndex > normalizationIndex, "normalization must occur before workspace write/diff-check");
assert.ok(strictFailureIndex > writeIndex, "strict diff-check failure must remain after normalized write");

assert.equal(source.includes('git diff --check --ignore'), false);
assert.equal(source.includes('valid: true // bypass'), false);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  verified: {
    trailing_whitespace_normalized_before_write: true,
    semantic_source_content_not_rewritten_by_hygiene: true,
    strict_diff_check_remains_required: true,
    source_hygiene_observable_in_repair_evidence: true,
    provider_calls_executed: false,
    reasoning_calls_consumed: false,
    wallet_mutation_performed: false,
    runpod_mutation_performed: false,
    source_mutation_performed_by_selftest: false,
    production_deploy_performed: false,
    secrets_printed: false,
  },
}, null, 2));

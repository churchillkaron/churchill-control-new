import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const BENCHMARK = new URL(
  "../scripts/benchmark-avantiqo-owned-media-full.mjs",
  import.meta.url,
);
const CERTIFY = new URL(
  "../scripts/certify-avantiqo-owned-media-local.sh",
  import.meta.url,
);
const REVIEW = new URL(
  "../scripts/prepare-avantiqo-owned-media-human-review.mjs",
  import.meta.url,
);

test("owned media benchmark resumes only mechanically valid bound evidence", async () => {
  const source = await readFile(BENCHMARK, "utf8");

  assert.match(source, /AVANTIQO_MEDIA_CERTIFICATION_RESUME/);
  assert.match(source, /reusablePriorCase/);
  assert.match(source, /prior\.mechanical_passed !== true/);
  assert.match(source, /benchmark_definition_sha256/);
  assert.match(source, /fixture_provenance/);
  assert.match(source, /foundation_model/);
  assert.match(source, /certification_execution !== true/);
  assert.match(source, /raw_reasoning_persisted !== false/);
  assert.match(source, /usd_per_second/);
  assert.match(source, /writeCheckpoint/);
  assert.match(source, /partial_checkpoint_written_after_each_execution:\s*true/);
  assert.match(source, /capabilities_reused/);
  assert.match(source, /capabilities_executed_this_run/);
});

test("resume preserves the prior benchmark checkpoint while fresh runs remove it", async () => {
  const source = await readFile(CERTIFY, "utf8");

  assert.match(source, /RESUME_ENABLED=0/);
  assert.match(source, /AVANTIQO_MEDIA_CERTIFICATION_RESUME/);
  assert.match(source, /if \[ "\$RESUME_ENABLED" -eq 0 \]; then/);
  assert.match(source, /rm -f "\$BENCHMARK_PATH"/);
  assert.match(source, /ENABLED_PRESERVE_BENCHMARK_CHECKPOINT/);
  assert.match(source, /AVANTIQO_MEDIA_CERTIFICATION_REUSED/);
  assert.match(source, /AVANTIQO_MEDIA_CERTIFICATION_EXECUTED_THIS_RUN/);
});

test("explicit media retry executes exactly one named capability", async () => {
  const benchmark = await readFile(BENCHMARK, "utf8");
  const certify = await readFile(CERTIFY, "utf8");

  assert.match(benchmark, /AVANTIQO_MEDIA_CERTIFICATION_CAPABILITY/);
  assert.match(benchmark, /TARGET_RETRY/);
  assert.match(benchmark, /TARGET_RETRY_REQUIRES_RESUME/);
  assert.match(benchmark, /TARGET_RETRY_CHECKPOINT_REQUIRED/);
  assert.match(benchmark, /TARGET_RETRY_NON_TARGET_CHECKPOINT_MISSING/);
  assert.match(benchmark, /TARGET_RETRY_NON_TARGET_SUCCESS_STALE/);
  assert.match(benchmark, /target_retry_executes_exactly_one_named_capability:\s*true/);
  assert.match(benchmark, /successful_non_target_case_revalidated_before_target_spend:\s*true/);
  assert.match(benchmark, /failed_non_target_case_preserved_without_execution:\s*true/);
  assert.match(benchmark, /targeted_retry_must_not_execute_unrequested_capabilities:\s*true/);
  assert.match(benchmark, /const runSucceeded = targetedRetryEnabled/);

  assert.match(certify, /TARGETED_RETRY_ENABLED=0/);
  assert.match(certify, /TARGET_CAPABILITY=\$\{AVANTIQO_MEDIA_CERTIFICATION_CAPABILITY:-\}/);
  assert.match(certify, /AVANTIQO_MEDIA_CERTIFICATION_TARGET_RETRY_REQUIRES_RESUME/);
  assert.match(certify, /AVANTIQO_MEDIA_CERTIFICATION_TARGET_RETRY_CHECKPOINT_REQUIRED/);
  assert.match(certify, /AVANTIQO_MEDIA_CERTIFICATION_TARGET_RETRY_EXECUTION_SCOPE_INVALID/);
  assert.match(certify, /capabilities_executed_this_run !== 1/);
  assert.match(certify, /AVANTIQO_MEDIA_CERTIFICATION_TARGET_RETRY_PASSED/);
  assert.match(certify, /HUMAN_REVIEW_PACK=DEFERRED_UNTIL_FULL_MECHANICAL_AND_ECONOMICS_PASS/);
});

test("human review binds every capability to its own resumed fixture provenance", async () => {
  const source = await readFile(REVIEW, "utf8");

  assert.match(source, /fixture_provenance/);
  assert.match(source, /source_storage_references: sourceStorageReferences/);
  assert.match(source, /benchmark_definition_sha256/);
  assert.match(source, /MODEL_BINDING_INVALID/);
  assert.match(source, /OUTPUT_PROVENANCE_MISMATCH/);
  assert.match(source, /every_capability_uses_its_own_fixture_provenance:\s*true/);
  assert.match(source, /resumed_campaign_evidence_may_span_fixture_runs_only_with_per_case_provenance:\s*true/);
  assert.doesNotMatch(source, /source_storage_references:\s*fixtures\.source_storage_references/);
});

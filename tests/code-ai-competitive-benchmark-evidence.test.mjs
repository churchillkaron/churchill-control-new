import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";

const {
  projectCodeAICompetitiveBenchmarkEvidence,
  refreshCodeAICompetitiveBenchmarkEvidenceFreshness,
  sealCodeAICompetitiveBenchmarkStoredEvidence,
  verifyCodeAICompetitiveBenchmarkStoredEvidenceIntegrity,
  verifyCodeAICompetitiveBenchmarkStoredEvidenceRecord,
  codeAICompetitiveBenchmarkMemoryKey,
  sealCodeAICompetitiveBenchmarkHistoryHead,
  verifyCodeAICompetitiveBenchmarkHistoryHead,
  validateCodeAICompetitiveBenchmarkStorageCommit,
  quarantineInvalidCodeAICompetitiveBenchmarkStoredEvidence,
} = await import("../lib/code/runtime/CodeAICompetitiveBenchmarkEvidenceRuntime.js");
const {
  attestCodeAICompetitiveFullRunManifest,
} = await import("../lib/code/runtime/CodeAICompetitiveFullRunAttestationRuntime.js");

const FULL_RUN_ENV = {
  AVANTIQO_CODE_COMPETITIVE_FULL_RUN_ATTESTATION_SECRET:
    "full-run-evidence-history-secret-0123456789abcdef",
};
const SOURCE_REPORT_SHA256 = "a".repeat(64);
const FULL_RUN_MANIFEST_SHA256 = "b".repeat(64);
const HISTORY_ENV = FULL_RUN_ENV;
const ROTATING_HISTORY_ENV = {
  AVANTIQO_CODE_COMPETITIVE_HISTORY_ATTESTATION_KEY_ID: "k1",
  AVANTIQO_CODE_COMPETITIVE_HISTORY_ATTESTATION_KEYRING: JSON.stringify({
    k1: "history-key-one-0123456789-abcdefghijklmnopqrstuvwxyz",
    k2: "history-key-two-0123456789-abcdefghijklmnopqrstuvwxyz",
    "legacy-unversioned": FULL_RUN_ENV.AVANTIQO_CODE_COMPETITIVE_FULL_RUN_ATTESTATION_SECRET,
  }),
};
const ROTATED_HISTORY_ENV = {
  ...ROTATING_HISTORY_ENV,
  AVANTIQO_CODE_COMPETITIVE_HISTORY_ATTESTATION_KEY_ID: "k2",
};

function comparison(provider, model, lossCase) {
  return {
    reference: { provider, model },
    measured_at: new Date().toISOString(),
    case_count: 20,
    wins: 12,
    losses: 4,
    ties: 4,
    win_rate: 0.75,
    owned_pass_rate: 1,
    reference_pass_rate: 1,
    p95_latency_ratio: 0.9,
    cost_ratio: 0.8,
    reference_age_days: 1,
    gates: {
      canonical_suite_exact: true,
      minimum_case_count: true,
      owned_pass_rate_not_worse: true,
      owned_win_rate: true,
      reference_fresh: true,
      p95_latency_competitive: true,
      cost_competitive: true,
    },
    passed: true,
    cases: [
      { case_id: lossCase, outcome: "LOSS" },
      { case_id: `${lossCase}-win`, outcome: "WIN" },
    ],
  };
}

function report(generatedAt = new Date().toISOString()) {
  return {
    contract: "AVANTIQO_CODE_COMPETITIVE_BENCHMARK_V1",
    generated_at: generatedAt,
    suite_contract: "AVANTIQO_CODE_FRONTIER_ENGINEERING_SUITE_V1",
    suite_case_count: 20,
    competitive_certified: true,
    superiority_claim_allowed: true,
    comparisons: [
      comparison("reference-a", "model-a", "architecture-01"),
      comparison("reference-b", "model-b", "runtime-02"),
    ],
  };
}

function fullRunManifest(sourceReport) {
  const reportAt = Date.parse(sourceReport.generated_at);
  const startedAt = new Date(reportAt - 1000).toISOString();
  const completedAt = new Date(reportAt + 1000).toISOString();
  const artifacts = [
    {
      stage: "COMPETITIVE_CERTIFICATION",
      path: "/tmp/run/avantiqo-code-competitive-benchmark.json",
      sha256: SOURCE_REPORT_SHA256,
      bytes: 1000,
      generated_at: sourceReport.generated_at,
      contract: sourceReport.contract,
    },
    ...Array.from({ length: 4 }, (_, index) => ({
      stage: `STAGE_${index}`,
      path: `/tmp/run/artifact-${index}.json`,
      sha256: String(index + 1).repeat(64),
      bytes: 200 + index,
      generated_at: sourceReport.generated_at,
      contract: `TEST_${index}`,
    })),
  ];
  return attestCodeAICompetitiveFullRunManifest({
    contract: "AVANTIQO_CODE_COMPETITIVE_FULL_RUN_MANIFEST_V1",
    orchestrator_run_id: "11111111-1111-4111-8111-111111111111",
    run_root: "/tmp/run",
    started_at: startedAt,
    completed_at: completedAt,
    runner_source_commit: "1".repeat(40),
    runner_ref: "main",
    runner_repository_clean: true,
    source_stable_for_entire_run: true,
    configuration_sha256: "2".repeat(64),
    providers: ["reference-a", "reference-b"],
    models: { "reference-a": "model-a", "reference-b": "model-b" },
    artifacts,
    external_provider_execution_performed: true,
    competitive_certified: sourceReport.competitive_certified === true,
    production_deploy_performed: false,
  }, { env: FULL_RUN_ENV });
}

function boundProjection(sourceReport) {
  return projectCodeAICompetitiveBenchmarkEvidence({
    report: sourceReport,
    backlog: { ...backlog, source_report_sha256: SOURCE_REPORT_SHA256 },
    full_run_manifest: fullRunManifest(sourceReport),
    source_report_sha256: SOURCE_REPORT_SHA256,
    full_run_manifest_sha256: FULL_RUN_MANIFEST_SHA256,
    env: FULL_RUN_ENV,
  });
}

const backlog = {
  contract: "AVANTIQO_CODE_COMPETITIVE_IMPROVEMENT_BACKLOG_V1",
  items: [{
    case_id: "architecture-01",
    category: "architecture",
    title: "Choose the safer repository-wide architecture under ambiguity",
    required_evidence: ["tests", "runtime evidence"],
    losses: 2,
    references: ["reference-a/model-a", "reference-b/model-b"],
  }],
};

test("competitive evidence is certified only when bound to the attested full run", () => {
  const source = report();
  const unbound = projectCodeAICompetitiveBenchmarkEvidence({ report: source, backlog });
  assert.equal(unbound.full_run_manifest_bound, false);
  assert.equal(unbound.competitive_certified, false);
  assert.equal(unbound.evidence_current, false);
  assert.equal(unbound.superiority_claim_allowed, false);

  const evidence = boundProjection(source);
  assert.equal(evidence.full_run_manifest_bound, true);
  assert.equal(evidence.competitive_certified, true);
  assert.equal(evidence.evidence_current, true);
  assert.equal(evidence.superiority_claim_allowed, true);
  assert.equal(evidence.source_report_sha256, SOURCE_REPORT_SHA256);
  assert.equal(evidence.full_run_manifest_sha256, FULL_RUN_MANIFEST_SHA256);
  assert.match(evidence.full_run_attestation_digest, /^[a-f0-9]{64}$/);
  assert.equal(evidence.source_repository_commit_provenance, "1".repeat(40));
  assert.equal(evidence.comparisons.length, 2);
  assert.deepEqual(evidence.comparisons[0].loss_case_ids, ["architecture-01"]);
  assert.equal(evidence.improvement_backlog.length, 1);
  assert.equal(evidence.provider_routing_authority, false);
  assert.equal(evidence.production_deploy_authority, false);
  assert.equal(evidence.customer_private_content_included, false);
  assert.equal(evidence.raw_reasoning_included, false);

  const staleAt = new Date(Date.now() - 45 * 86400000).toISOString();
  const stale = boundProjection(report(staleAt));
  assert.equal(stale.competitive_certified, true);
  assert.equal(stale.evidence_current, false);
  assert.equal(stale.superiority_claim_allowed, false);

  const current = boundProjection(report());
  const future = refreshCodeAICompetitiveBenchmarkEvidenceFreshness(current, {
    now_ms: Date.parse(current.generated_at) + 31 * 86400000,
  });
  assert.equal(future.competitive_certified, true);
  assert.equal(future.evidence_current, false);
  assert.equal(future.superiority_claim_allowed, false);
  assert.equal(future.freshness_recomputed_at_read, true);
});

test("competitive evidence rejects a manifest that does not contain the exact report sha", () => {
  const source = report();
  const manifest = fullRunManifest(source);
  manifest.artifacts[0].sha256 = "c".repeat(64);
  assert.throws(
    () => projectCodeAICompetitiveBenchmarkEvidence({
      report: source,
      backlog: { ...backlog, source_report_sha256: SOURCE_REPORT_SHA256 },
      full_run_manifest: manifest,
      source_report_sha256: SOURCE_REPORT_SHA256,
      full_run_manifest_sha256: FULL_RUN_MANIFEST_SHA256,
      env: FULL_RUN_ENV,
    }),
    /CODE_AI_COMPETITIVE_FULL_RUN_ATTESTATION_INVALID|CODE_AI_COMPETITIVE_FULL_RUN_REPORT_SHA_MISMATCH/,
  );
});

test("competitive evidence rejects a backlog derived from a different report", () => {
  const source = report();
  assert.throws(
    () => projectCodeAICompetitiveBenchmarkEvidence({
      report: source,
      backlog: { ...backlog, source_report_sha256: "d".repeat(64) },
      full_run_manifest: fullRunManifest(source),
      source_report_sha256: SOURCE_REPORT_SHA256,
      full_run_manifest_sha256: FULL_RUN_MANIFEST_SHA256,
      env: FULL_RUN_ENV,
    }),
    /CODE_AI_COMPETITIVE_BACKLOG_SOURCE_REPORT_MISMATCH/,
  );
});


test("durable competitive history must be stored on the same source commit as the attested run", () => {
  const evidence = boundProjection(report());
  const matchingCommit = "1".repeat(40);
  assert.equal(
    validateCodeAICompetitiveBenchmarkStorageCommit(evidence, matchingCommit),
    matchingCommit,
  );
  assert.throws(
    () => validateCodeAICompetitiveBenchmarkStorageCommit(evidence, "9".repeat(40)),
    /CODE_AI_COMPETITIVE_BENCHMARK_STORAGE_SOURCE_COMMIT_MISMATCH/,
  );
});

test("durable competitive history detects tampered stored metadata", () => {
  const evidence = boundProjection(report());
  const sealed = sealCodeAICompetitiveBenchmarkStoredEvidence(evidence, {
    storage_repository_commit: "1".repeat(40),
    persisted_at: new Date().toISOString(),
    env: HISTORY_ENV,
  });
  const valid = verifyCodeAICompetitiveBenchmarkStoredEvidenceIntegrity(sealed, { env: HISTORY_ENV });
  assert.equal(valid.valid, true);
  assert.match(sealed.history_integrity_sha256, /^[a-f0-9]{64}$/);

  const tampered = {
    ...sealed,
    comparisons: sealed.comparisons.map((item, index) =>
      index === 0 ? { ...item, wins: Number(item.wins || 0) + 1 } : item,
    ),
  };
  const invalid = verifyCodeAICompetitiveBenchmarkStoredEvidenceIntegrity(tampered, { env: HISTORY_ENV });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.legacy_unsealed, false);
});

test("legacy unsealed competitive history fails closed to advisory", () => {
  const evidence = boundProjection(report());
  const integrity = verifyCodeAICompetitiveBenchmarkStoredEvidenceIntegrity(evidence, { env: HISTORY_ENV });
  assert.equal(integrity.valid, false);
  assert.equal(integrity.legacy_unsealed, true);
});

test("public fingerprint recomputation cannot forge durable history", () => {
  const evidence = boundProjection(report());
  const sealed = sealCodeAICompetitiveBenchmarkStoredEvidence(evidence, {
    storage_repository_commit: "1".repeat(40),
    persisted_at: new Date().toISOString(),
    env: HISTORY_ENV,
  });
  const forged = {
    ...sealed,
    configuration_sha256: "8".repeat(64),
  };
  // An attacker can recompute an ordinary SHA-256 fingerprint but not the server-only HMAC.
  const invalid = verifyCodeAICompetitiveBenchmarkStoredEvidenceIntegrity(forged, { env: HISTORY_ENV });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.hmac_valid, false);
});

test("history verification fails closed when the server attestation secret is unavailable", () => {
  const evidence = boundProjection(report());
  const sealed = sealCodeAICompetitiveBenchmarkStoredEvidence(evidence, {
    storage_repository_commit: "1".repeat(40),
    persisted_at: new Date().toISOString(),
    env: HISTORY_ENV,
  });
  const result = verifyCodeAICompetitiveBenchmarkStoredEvidenceIntegrity(sealed, { env: {} });
  assert.equal(result.valid, false);
  assert.equal(result.secret_available, false);
  assert.equal(result.reason, "ATTESTATION_SECRET_UNAVAILABLE");
});

test("integrity-invalid history cannot contribute comparisons or improvement backlog", () => {
  const evidence = boundProjection(report());
  const quarantined = quarantineInvalidCodeAICompetitiveBenchmarkStoredEvidence(evidence, {
    valid: false,
    legacy_unsealed: false,
    reason: "ATTESTATION_INVALID",
  });
  assert.equal(quarantined.competitive_certified, false);
  assert.equal(quarantined.superiority_claim_allowed, false);
  assert.equal(quarantined.evidence_current, false);
  assert.equal(quarantined.decision_support_allowed, false);
  assert.deepEqual(quarantined.comparisons, []);
  assert.deepEqual(quarantined.improvement_backlog, []);
  assert.equal(quarantined.quarantine_reason, "ATTESTATION_INVALID");
});

test("competitive benchmark evidence persists globally but remains advisory to current main", async () => {
  const runtime = await readFile("lib/code/runtime/CodeAICompetitiveBenchmarkEvidenceRuntime.js", "utf8");
  const benchmark = await readFile("lib/code/runtime/CodeAIEngineeringPerformanceBenchmarkRuntime.js", "utf8");
  const portfolio = await readFile("lib/platform/capabilities/createProductEngineeringPortfolioCapability.js", "utf8");
  const script = await readFile("scripts/persist-avantiqo-code-competitive-evidence-local.mjs", "utf8");
  const derive = await readFile("scripts/derive-avantiqo-code-competitive-backlog.mjs", "utf8");
  const pkg = await readFile("package.json", "utf8");

  assert.match(runtime, /resolveAvantiqoLearningOrganization/);
  assert.match(runtime, /platform_code_competitive_benchmark_evidence/);
  assert.match(runtime, /ordinary_memory_recall: false/);
  assert.match(runtime, /provider_routing_authority: false/);
  assert.match(runtime, /refreshCodeAICompetitiveBenchmarkEvidenceFreshness/);
  assert.match(runtime, /freshness_recomputed_at_read/);
  assert.match(runtime, /verifyCodeAICompetitiveFullRunManifest/);
  assert.match(runtime, /full_run_manifest_bound/);
  assert.match(runtime, /history_integrity_sha256/);
  assert.match(runtime, /AVANTIQO_CODE_COMPETITIVE_HISTORY_ATTESTATION_V1/);
  assert.match(runtime, /AVANTIQO_CODE_COMPETITIVE_HISTORY_ATTESTATION_V2/);
  assert.match(runtime, /ATTESTATION_KEYRING/);
  assert.match(runtime, /ATTESTATION_KEY_ID/);
  assert.match(runtime, /HISTORY_ROW_TIMESTAMP_MISMATCH/);
  assert.match(runtime, /verifyCodeAICompetitiveBenchmarkStoredEvidenceRecord/);
  assert.match(runtime, /HISTORY_ROW_MEMORY_KEY_MISMATCH/);
  assert.match(runtime, /history_memory_key/);
  assert.match(runtime, /select\("id,memory_key,metadata,updated_at"\)/);
  assert.match(runtime, /platform_code_competitive_benchmark_history_head/);
  assert.match(runtime, /HISTORY_HEAD_REQUIRED/);
  assert.match(runtime, /verifyCodeAICompetitiveBenchmarkHistoryHead/);
  assert.match(runtime, /createHmac/);
  assert.match(runtime, /timingSafeEqual/);
  assert.match(runtime, /STORAGE_SOURCE_COMMIT_MISMATCH/);
  assert.match(runtime, /quarantineInvalidCodeAICompetitiveBenchmarkStoredEvidence/);
  assert.match(runtime, /decision_support_allowed: false/);
  assert.match(runtime, /CODE_AI_COMPETITIVE_FULL_RUN_REPORT_SHA_MISMATCH/);
  assert.match(benchmark, /loadLatestCodeAICompetitiveBenchmarkEvidence/);
  assert.match(benchmark, /competitive_evidence: competitiveEvidence/);
  assert.match(portfolio, /GLOBAL CODE COMPETITIVE BENCHMARK EVIDENCE/);
  assert.match(portfolio, /source report is not repository-commit authoritative/);
  assert.match(portfolio, /current-main repository evidence supports a concrete improvement/);
  assert.match(script, /CODE_COMPETITIVE_EVIDENCE_CURRENT_MAIN_REQUIRED/);
  assert.match(script, /persistCodeAICompetitiveBenchmarkEvidence/);
  assert.match(script, /AVANTIQO_CODE_COMPETITIVE_FULL_RUN_MANIFEST/);
  assert.match(script, /fullRunManifestSha256/);
  assert.match(script, /dirname\(reportPath\)/);
  assert.match(derive, /dirname\(reportPath\)/);
  assert.match(derive, /source_report_sha256: sourceReportSha256/);
  assert.match(pkg, /persist:code:competitive-evidence:local/);
});


test("shared Code history API and UI expose competitive evidence without making it authoritative", async () => {
  const route = await readFile("app/api/operator/code/history/route.js", "utf8");
  const panel = await readFile("components/operator/CodeMissionHistoryPanel.jsx", "utf8");

  assert.match(route, /loadLatestCodeAICompetitiveBenchmarkEvidence/);
  assert.match(route, /Promise\.all\(\[/);
  assert.match(route, /competitive_evidence: competitiveEvidence/);
  assert.match(route, /history_load_blocked: false/);
  assert.match(panel, /setCompetitiveEvidence/);
  assert.match(panel, /data-avantiqo-code-competitive-evidence="true"/);
  assert.match(panel, /Competitive evidence/);
  assert.match(panel, /benchmark certified/);
  assert.match(panel, /no superiority claim/);
  assert.match(panel, /Next competitive gap:/);
});


test("durable history remains verifiable across attestation key rotation", () => {
  const evidence = boundProjection(report());
  const sealed = sealCodeAICompetitiveBenchmarkStoredEvidence(evidence, {
    storage_repository_commit: "1".repeat(40),
    persisted_at: new Date().toISOString(),
    env: ROTATING_HISTORY_ENV,
  });
  assert.equal(sealed.history_attestation.contract, "AVANTIQO_CODE_COMPETITIVE_HISTORY_ATTESTATION_V2");
  assert.equal(sealed.history_attestation.key_id, "k1");
  const afterRotation = verifyCodeAICompetitiveBenchmarkStoredEvidenceIntegrity(sealed, { env: ROTATED_HISTORY_ENV });
  assert.equal(afterRotation.valid, true);
  assert.equal(afterRotation.key_id, "k1");
});

test("retired or unknown attestation key ids fail closed", () => {
  const evidence = boundProjection(report());
  const sealed = sealCodeAICompetitiveBenchmarkStoredEvidence(evidence, {
    storage_repository_commit: "1".repeat(40),
    persisted_at: new Date().toISOString(),
    env: ROTATING_HISTORY_ENV,
  });
  const retiredEnv = {
    AVANTIQO_CODE_COMPETITIVE_HISTORY_ATTESTATION_KEY_ID: "k2",
    AVANTIQO_CODE_COMPETITIVE_HISTORY_ATTESTATION_KEYRING: JSON.stringify({
      k2: "history-key-two-0123456789-abcdefghijklmnopqrstuvwxyz",
    }),
  };
  const retired = verifyCodeAICompetitiveBenchmarkStoredEvidenceIntegrity(sealed, { env: retiredEnv });
  assert.equal(retired.valid, false);
  assert.equal(retired.reason, "ATTESTATION_KEY_UNKNOWN");
  const tamperedKeyId = {
    ...sealed,
    history_attestation: { ...sealed.history_attestation, key_id: "does-not-exist" },
  };
  const unknown = verifyCodeAICompetitiveBenchmarkStoredEvidenceIntegrity(tamperedKeyId, { env: ROTATED_HISTORY_ENV });
  assert.equal(unknown.valid, false);
  assert.equal(unknown.reason, "ATTESTATION_KEY_UNKNOWN");
});

test("new history uses the configured active rotation key", () => {
  const evidence = boundProjection(report());
  const sealed = sealCodeAICompetitiveBenchmarkStoredEvidence(evidence, {
    storage_repository_commit: "1".repeat(40),
    persisted_at: new Date().toISOString(),
    env: ROTATED_HISTORY_ENV,
  });
  assert.equal(sealed.history_attestation.key_id, "k2");
  const verified = verifyCodeAICompetitiveBenchmarkStoredEvidenceIntegrity(sealed, { env: ROTATED_HISTORY_ENV });
  assert.equal(verified.valid, true);
  assert.equal(verified.key_id, "k2");
});


test("sealed history record is accepted only when row timestamp matches persisted_at", () => {
  const evidence = boundProjection(report());
  const persistedAt = new Date().toISOString();
  const sealed = sealCodeAICompetitiveBenchmarkStoredEvidence(evidence, {
    storage_repository_commit: "1".repeat(40),
    persisted_at: persistedAt,
    env: ROTATED_HISTORY_ENV,
  });
  const verified = verifyCodeAICompetitiveBenchmarkStoredEvidenceRecord(sealed, {
    row_updated_at: persistedAt,
    row_memory_key: codeAICompetitiveBenchmarkMemoryKey(evidence),
    env: ROTATED_HISTORY_ENV,
  });
  assert.equal(verified.valid, true);
  assert.equal(verified.row_timestamp_valid, true);
  assert.equal(verified.replay_resistant, true);
});

test("replayed sealed history with a newer row timestamp fails closed", () => {
  const evidence = boundProjection(report());
  const persistedAt = new Date(Date.now() - 60_000).toISOString();
  const sealed = sealCodeAICompetitiveBenchmarkStoredEvidence(evidence, {
    storage_repository_commit: "1".repeat(40),
    persisted_at: persistedAt,
    env: ROTATED_HISTORY_ENV,
  });
  const replayed = verifyCodeAICompetitiveBenchmarkStoredEvidenceRecord(sealed, {
    row_updated_at: new Date().toISOString(),
    row_memory_key: codeAICompetitiveBenchmarkMemoryKey(evidence),
    env: ROTATED_HISTORY_ENV,
  });
  assert.equal(replayed.valid, false);
  assert.equal(replayed.row_timestamp_valid, false);
  assert.equal(replayed.reason, "HISTORY_ROW_TIMESTAMP_MISMATCH");
  const quarantined = quarantineInvalidCodeAICompetitiveBenchmarkStoredEvidence(sealed, replayed);
  assert.equal(quarantined.competitive_certified, false);
  assert.equal(quarantined.decision_support_allowed, false);
});


test("sealed history record is bound to its exact durable memory key", () => {
  const evidence = boundProjection(report());
  const persistedAt = new Date().toISOString();
  const memoryKey = codeAICompetitiveBenchmarkMemoryKey(evidence);
  const sealed = sealCodeAICompetitiveBenchmarkStoredEvidence(evidence, {
    storage_repository_commit: "1".repeat(40),
    persisted_at: persistedAt,
    memory_key: memoryKey,
    env: ROTATED_HISTORY_ENV,
  });
  assert.equal(sealed.history_memory_key, memoryKey);
  const verified = verifyCodeAICompetitiveBenchmarkStoredEvidenceRecord(sealed, {
    row_updated_at: persistedAt,
    row_memory_key: memoryKey,
    env: ROTATED_HISTORY_ENV,
  });
  assert.equal(verified.valid, true);
  assert.equal(verified.row_memory_key_valid, true);
});

test("transplanted sealed history in a different memory row fails closed", () => {
  const evidence = boundProjection(report());
  const persistedAt = new Date().toISOString();
  const memoryKey = codeAICompetitiveBenchmarkMemoryKey(evidence);
  const sealed = sealCodeAICompetitiveBenchmarkStoredEvidence(evidence, {
    storage_repository_commit: "1".repeat(40),
    persisted_at: persistedAt,
    memory_key: memoryKey,
    env: ROTATED_HISTORY_ENV,
  });
  const transplanted = verifyCodeAICompetitiveBenchmarkStoredEvidenceRecord(sealed, {
    row_updated_at: persistedAt,
    row_memory_key: `${memoryKey}-other`,
    env: ROTATED_HISTORY_ENV,
  });
  assert.equal(transplanted.valid, false);
  assert.equal(transplanted.row_memory_key_valid, false);
  assert.equal(transplanted.reason, "HISTORY_ROW_MEMORY_KEY_MISMATCH");
  const quarantined = quarantineInvalidCodeAICompetitiveBenchmarkStoredEvidence(sealed, transplanted);
  assert.equal(quarantined.competitive_certified, false);
  assert.equal(quarantined.decision_support_allowed, false);
});

test("sealing refuses a caller-supplied memory key that does not match the evidence fingerprint", () => {
  const evidence = boundProjection(report());
  assert.throws(
    () => sealCodeAICompetitiveBenchmarkStoredEvidence(evidence, {
      storage_repository_commit: "1".repeat(40),
      persisted_at: new Date().toISOString(),
      memory_key: "code_ai_competitive_benchmark_evidence:v1:wrong",
      env: ROTATED_HISTORY_ENV,
    }),
    /CODE_AI_COMPETITIVE_BENCHMARK_MEMORY_KEY_MISMATCH/,
  );
});


test("sealed history head binds the exact latest durable evidence row", () => {
  const evidence = boundProjection(report());
  const persistedAt = new Date().toISOString();
  const memoryKey = codeAICompetitiveBenchmarkMemoryKey(evidence);
  const sealed = sealCodeAICompetitiveBenchmarkStoredEvidence(evidence, {
    storage_repository_commit: "1".repeat(40),
    persisted_at: persistedAt,
    memory_key: memoryKey,
    env: ROTATED_HISTORY_ENV,
  });
  const head = sealCodeAICompetitiveBenchmarkHistoryHead(sealed, { persisted_at: persistedAt, env: ROTATED_HISTORY_ENV });
  const verified = verifyCodeAICompetitiveBenchmarkHistoryHead(head, {
    row_updated_at: persistedAt,
    evidence_metadata: sealed,
    evidence_memory_key: memoryKey,
    env: ROTATED_HISTORY_ENV,
  });
  assert.equal(verified.valid, true);
  assert.equal(verified.evidence_bound, true);
  assert.equal(verified.row_timestamp_valid, true);
});

test("deleting the latest evidence and exposing an older valid row is detected by the sealed head", () => {
  const latestEvidence = boundProjection(report());
  const persistedAt = new Date().toISOString();
  const latestKey = codeAICompetitiveBenchmarkMemoryKey(latestEvidence);
  const latestSealed = sealCodeAICompetitiveBenchmarkStoredEvidence(latestEvidence, {
    storage_repository_commit: "1".repeat(40), persisted_at: persistedAt, memory_key: latestKey, env: ROTATED_HISTORY_ENV,
  });
  const head = sealCodeAICompetitiveBenchmarkHistoryHead(latestSealed, { persisted_at: persistedAt, env: ROTATED_HISTORY_ENV });
  const olderEvidence = { ...latestEvidence, evidence_fingerprint: "6".repeat(64) };
  const olderKey = codeAICompetitiveBenchmarkMemoryKey(olderEvidence);
  const olderSealed = sealCodeAICompetitiveBenchmarkStoredEvidence(olderEvidence, {
    storage_repository_commit: "1".repeat(40), persisted_at: persistedAt, memory_key: olderKey, env: ROTATED_HISTORY_ENV,
  });
  const rollback = verifyCodeAICompetitiveBenchmarkHistoryHead(head, {
    row_updated_at: persistedAt,
    evidence_metadata: olderSealed,
    evidence_memory_key: olderKey,
    env: ROTATED_HISTORY_ENV,
  });
  assert.equal(rollback.valid, false);
  assert.equal(rollback.evidence_bound, false);
  assert.equal(rollback.reason, "HISTORY_HEAD_LATEST_ROW_MISMATCH");
});

test("tampering with the history head fails closed", () => {
  const evidence = boundProjection(report());
  const persistedAt = new Date().toISOString();
  const memoryKey = codeAICompetitiveBenchmarkMemoryKey(evidence);
  const sealed = sealCodeAICompetitiveBenchmarkStoredEvidence(evidence, {
    storage_repository_commit: "1".repeat(40), persisted_at: persistedAt, memory_key: memoryKey, env: ROTATED_HISTORY_ENV,
  });
  const head = sealCodeAICompetitiveBenchmarkHistoryHead(sealed, { persisted_at: persistedAt, env: ROTATED_HISTORY_ENV });
  const tampered = { ...head, latest_memory_key: `${memoryKey}-tampered` };
  const result = verifyCodeAICompetitiveBenchmarkHistoryHead(tampered, {
    row_updated_at: persistedAt, evidence_metadata: sealed, evidence_memory_key: memoryKey, env: ROTATED_HISTORY_ENV,
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "HISTORY_HEAD_INTEGRITY_INVALID");
});

import crypto from "node:crypto";

export const CODE_AI_HIDDEN_BENCHMARK_CONTRACT = "AVANTIQO_CODE_AI_HIDDEN_BENCHMARK_V2";
function text(value, maximum = 4000) { return String(value ?? "").trim().slice(0, maximum); }
function list(value) { return Array.isArray(value) ? value : []; }
function bucket(id, salt) { const hash = crypto.createHmac("sha256", salt).update(id).digest(); return hash.readUInt32BE(0) % 100; }
function validProof(result, id) {
  const proof = result?.verification && typeof result.verification === "object" ? result.verification : {};
  return proof.case_id === id && proof.passed === true && proof.independent === true
    && /^[a-f0-9]{64}$/i.test(text(proof.artifact_sha256, 80))
    && text(proof.verifier, 240).length >= 3;
}
export function partitionCodeAIHiddenBenchmarkCases({ cases = [], salt, holdout_percent = 25 } = {}) {
  const secret = text(salt, 1000); if (secret.length < 16) throw new Error("CODE_AI_HIDDEN_BENCHMARK_SECRET_REQUIRED");
  const pct = Math.max(10, Math.min(50, Number(holdout_percent) || 25));
  const normalized = list(cases).map((item, index) => ({ id: text(item?.id || `case-${index + 1}`, 240), family: text(item?.family, 120) || "general", payload: item?.payload ?? null, expected: item?.expected ?? null }));
  if (normalized.length < 8) throw new Error("CODE_AI_HIDDEN_BENCHMARK_CASE_COUNT_INSUFFICIENT");
  const held = [], visible = []; for (const item of normalized) (bucket(item.id, secret) < pct ? held : visible).push(item);
  if (!held.length || !visible.length) throw new Error("CODE_AI_HIDDEN_BENCHMARK_PARTITION_DEGENERATE");
  return { contract: CODE_AI_HIDDEN_BENCHMARK_CONTRACT, visible_cases: visible.map(({ expected, ...item }) => item), held_out_cases: held, held_out_case_ids: held.map((item) => item.id), holdout_percent: pct, expected_values_exposed_to_candidate: false, partition_hash: crypto.createHash("sha256").update(held.map((item) => item.id).sort().join("|")).digest("hex") };
}
export function certifyCodeAIHiddenBenchmark({ partition, results = [] } = {}) {
  const held = list(partition?.held_out_cases); if (!held.length) throw new Error("CODE_AI_HIDDEN_BENCHMARK_PARTITION_REQUIRED");
  const map = new Map(list(results).map((result) => [text(result?.id, 240), result]));
  const scored = held.map((item) => {
    const result = map.get(item.id); const independentlyVerified = validProof(result, item.id);
    return { id: item.id, family: item.family, passed: independentlyVerified, independent_verification: independentlyVerified };
  });
  const passed = scored.filter((item) => item.passed).length; const rate = passed / scored.length;
  return {
    contract: CODE_AI_HIDDEN_BENCHMARK_CONTRACT, held_out: true, case_count: scored.length, passed,
    pass_rate: rate, verified: rate >= 0.9, case_results: scored, expected_values_exposed_to_candidate: false,
    independent_verification_required: true, candidate_self_report_authority: false,
  };
}

export default Object.freeze({
  contract: CODE_AI_HIDDEN_BENCHMARK_CONTRACT,
  partition: partitionCodeAIHiddenBenchmarkCases,
  certify: certifyCodeAIHiddenBenchmark,
});

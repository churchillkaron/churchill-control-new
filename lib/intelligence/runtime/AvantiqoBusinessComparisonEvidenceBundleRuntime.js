export const AVANTIQO_BUSINESS_COMPARISON_EVIDENCE_BUNDLE_CONTRACT = "AVANTIQO_BUSINESS_COMPARISON_EVIDENCE_BUNDLE_V1";

const list = (v) => Array.isArray(v) ? v : [];
const text = (v, n = 240) => String(v ?? "").trim().slice(0, n);

export function buildBusinessComparisonEvidenceBundle({ comparison_results = [], required_driver_ids = [] } = {}) {
  const required = [...new Set(list(required_driver_ids).map((v) => text(v, 160)).filter(Boolean))];
  const observations = [];
  const gaps = [];

  for (const result of list(comparison_results)) {
    const capabilityKey = text(result?.capability_key, 300) || null;
    if (result?.status !== "OBSERVATIONS_READY") {
      gaps.push({ capability_key: capabilityKey, reason: text(result?.normalized?.reason || result?.status || "EVIDENCE_GAP", 160) });
      continue;
    }
    for (const row of list(result?.mapped?.driver_rows)) {
      observations.push({
        driver_id: text(row?.driver_id, 160),
        measure_id: text(row?.measure_id, 160) || null,
        dimension_key: text(row?.dimension_key, 160) || null,
        baseline_value: row?.baseline_value,
        actual_value: row?.actual_value,
        delta: Number(row?.actual_value) - Number(row?.baseline_value),
        source_capability_key: text(row?.source_capability_key || capabilityKey, 300) || null,
        comparison_pair_fingerprint: text(result?.comparison_pair_fingerprint, 128) || null,
        evidence_status: "OBSERVED_INTERNAL",
        contribution_safe: false,
        authority_effect: "NONE",
      });
    }
  }

  const byDriver = new Map();
  for (const row of observations) {
    if (!row.driver_id) continue;
    if (!byDriver.has(row.driver_id)) byDriver.set(row.driver_id, []);
    byDriver.get(row.driver_id).push(row);
  }

  const driver_evidence = [...byDriver.entries()].map(([driver_id, rows]) => ({
    driver_id,
    observations: rows,
    observation_count: rows.length,
    contribution_ready: rows.length === 1,
    contribution_row: rows.length === 1 ? { ...rows[0], contribution_safe: true } : null,
    aggregation_state: rows.length === 1 ? "SINGLE_EXPLICIT_MEASURE" : "MULTIPLE_NON_ADDITIVE_PROXIES",
    authority_effect: "NONE",
  }));

  const covered = new Set(driver_evidence.map((r) => r.driver_id));
  const missing_driver_ids = required.filter((id) => !covered.has(id));
  const ambiguous_driver_ids = driver_evidence.filter((r) => !r.contribution_ready).map((r) => r.driver_id);
  const contribution_rows = driver_evidence.map((r) => r.contribution_row).filter(Boolean);

  return {
    contract: AVANTIQO_BUSINESS_COMPARISON_EVIDENCE_BUNDLE_CONTRACT,
    observation_count: observations.length,
    driver_evidence,
    contribution_rows,
    contribution_row_count: contribution_rows.length,
    covered_driver_ids: [...covered],
    missing_driver_ids,
    ambiguous_driver_ids,
    capability_gaps: gaps,
    coverage_complete: missing_driver_ids.length === 0 && ambiguous_driver_ids.length === 0,
    policy: {
      overlapping_proxy_measures_are_not_summed: true,
      one_explicit_measure_can_be_contribution_ready: true,
      multiple_measures_require_explicit_decomposition_model: true,
      missing_or_ambiguous_driver_evidence_remains_visible: true,
      authority_effect: "NONE",
    },
    authority_effect: "NONE",
  };
}

export const AvantiqoBusinessComparisonEvidenceBundleRuntime = Object.freeze({
  contract: AVANTIQO_BUSINESS_COMPARISON_EVIDENCE_BUNDLE_CONTRACT,
  build: buildBusinessComparisonEvidenceBundle,
});

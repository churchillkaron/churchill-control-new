
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }

export function buildMusicDailiesRepairBrief({ report = {}, reviews = [], binding = {} } = {}) {
  if (report.passed === true || report.reviewer_repair_required === true && report.music_repair_required !== true) return null;
  const failedReviews = list(reviews).filter((row) => row?.passed !== true);
  const repairs = failedReviews.flatMap((row) => list(row.repair).map((instruction) => ({ family: row.family, instruction })));
  const regions = failedReviews.flatMap((row) => list(row.regions).map((region) => ({ family: row.family, ...region })));
  return {
    contract: "AVANTIQO_MUSIC_SURGICAL_REPAIR_BRIEF_V1",
    direction_hash: binding.direction_hash || null,
    preproduction_hash: binding.preproduction_hash || null,
    preserve_approved_direction: true,
    preserve_original_sources: true,
    do_not_regenerate_unfailed_dimensions: true,
    failed_checks: list(report.failures),
    repairs,
    regions,
    exact_region_evidence_required_for_musical_repair: true,
    may_advance_to_mix: false,
  };
}

export function approveMusicDailiesWithAcceptedDeviations({ dailies = {}, accepted_deviations = [], accepted_by = null, acceptance_note = null } = {}) {
  const deviations = list(accepted_deviations).map((row) => ({
    dimension: row?.dimension || null,
    intended: row?.intended || null,
    rendered: row?.rendered || null,
    accepted: true,
  })).filter((row) => row.dimension);
  if (!deviations.length) throw new Error("MUSIC_DAILIES_ACCEPTED_DEVIATION_REQUIRED");
  return {
    ...dailies,
    status: "APPROVED_WITH_ACCEPTED_DEVIATIONS",
    report: {
      ...(dailies.report || {}),
      passed: true,
      status: "APPROVED_WITH_ACCEPTED_DEVIATIONS",
      failures: [],
      music_repair_required: false,
      reviewer_repair_required: false,
      accepted_deviations: deviations,
    },
    accepted_deviations: deviations,
    human_acceptance: { accepted: true, accepted_by, acceptance_note },
    repair_brief: null,
  };
}

export const CreativeMusicDailiesContractRuntime = Object.freeze({
  contract: "AVANTIQO_MUSIC_DAILIES_LISTENING_V1",
  repairBrief: buildMusicDailiesRepairBrief,
  approveWithAcceptedDeviations: approveMusicDailiesWithAcceptedDeviations,
});

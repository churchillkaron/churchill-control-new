
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }

export function buildMusicDailiesRepairBrief({ report = {}, reviews = [], binding = {} } = {}) {
  if (report.passed === true) return null;
  const repairs = list(reviews).flatMap((row) => list(row.repair).map((instruction) => ({ family: row.family, instruction })));
  return {
    contract: "AVANTIQO_MUSIC_SURGICAL_REPAIR_BRIEF_V1",
    direction_hash: binding.direction_hash || null,
    preproduction_hash: binding.preproduction_hash || null,
    preserve_approved_direction: true,
    preserve_original_sources: true,
    do_not_regenerate_unfailed_dimensions: true,
    failed_checks: list(report.failures),
    repairs,
    may_advance_to_mix: false,
  };
}

export const CreativeMusicDailiesContractRuntime = Object.freeze({
  contract: "AVANTIQO_MUSIC_DAILIES_LISTENING_V1",
  repairBrief: buildMusicDailiesRepairBrief,
});

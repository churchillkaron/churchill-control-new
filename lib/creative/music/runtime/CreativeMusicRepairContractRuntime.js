const CONTRACT = "AVANTIQO_MUSIC_REPAIR_CONTRACT_V1";

function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }

export function classifyMusicRepair({ dailies = {} } = {}) {
  const failures = list(dailies?.report?.failures);
  const repairs = list(dailies?.repair_brief?.repairs);
  const corpus = `${failures.join(" ")} ${repairs.map((row) => row.instruction).join(" ")}`.toLowerCase();
  const technicalOnly = /technical|loudness|peak|clipping|noise|master|balance|translation/.test(corpus) &&
    !/musicality|performance|sonic_identity|intent_fidelity|arrangement|motif|harmony|melody|groove/.test(corpus);
  return {
    contract: CONTRACT,
    route: technicalOnly ? "LOCAL_FINISHING_REPAIR" : "SURGICAL_MUSICAL_REPAIR",
    zero_cost_local_repair_allowed: technicalOnly,
    paid_generation_repair_requires_authority: !technicalOnly,
    preserve_approved_direction: true,
    preserve_original_sources: true,
    failed_checks: failures,
    repairs,
  };
}

export const CreativeMusicRepairContractRuntime = Object.freeze({ contract: CONTRACT, classify: classifyMusicRepair });

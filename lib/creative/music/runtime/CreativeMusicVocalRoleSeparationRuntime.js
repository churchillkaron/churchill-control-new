export const MUSIC_VOCAL_ROLE_SEPARATION_CONTRACT = "AVANTIQO_MUSIC_VOCAL_ROLE_SEPARATION_V1";
export const MUSIC_VOCAL_ROLE_SEPARATOR_CAPABILITY = "ai.audio.vocal-role-separate";

const ROLE_LABELS = Object.freeze(["LEAD", "BACKING", "HARMONY", "CHOIR", "ADLIB", "OTHER_VOCAL"]);
const MODES = Object.freeze({
  LEAD_ONLY_KEEP_BACKING: Object.freeze({
    remove_roles: ["LEAD"],
    preserve_roles: ["BACKING", "HARMONY", "CHOIR", "ADLIB"],
    required_outputs: ["lead_vocal", "supporting_vocals", "instrumental"],
  }),
  ROLE_STEMS: Object.freeze({
    remove_roles: [],
    preserve_roles: [...ROLE_LABELS],
    required_outputs: ["lead_vocal", "supporting_vocals", "instrumental"],
  }),
});

function text(value) { return String(value ?? "").trim(); }
function uniq(values = []) { return [...new Set(values.map((value) => text(value).toUpperCase()).filter(Boolean))]; }
function validRoles(values) { return uniq(values).filter((value) => ROLE_LABELS.includes(value)); }
export function buildMusicVocalRoleSeparationRequest(input = {}) {
  const mode = text(input.mode || "LEAD_ONLY_KEEP_BACKING").toUpperCase();
  const base = MODES[mode];
  if (!base) throw new Error(`CREATIVE_MUSIC_VOCAL_ROLE_MODE_INVALID:${mode}`);
  const request = {
    contract: MUSIC_VOCAL_ROLE_SEPARATION_CONTRACT,
    capability: MUSIC_VOCAL_ROLE_SEPARATOR_CAPABILITY,
    mode,
    remove_roles: validRoles(input.remove_roles?.length ? input.remove_roles : base.remove_roles),
    preserve_roles: validRoles(input.preserve_roles?.length ? input.preserve_roles : base.preserve_roles),
    required_outputs: [...base.required_outputs],
    role_labels: [...ROLE_LABELS],
    source_rights_required: true,
    exact_source_binding_required: true,
    source_timing_preservation_required: true,
    ordinary_four_stem_substitution_forbidden: true,
    semantic_role_inference_without_certified_separator_forbidden: true,
    production_routing_allowed: false,
    mutation_authorized: false,
    publication_authorized: false,
  };
  if (!request.remove_roles.length && mode === "LEAD_ONLY_KEEP_BACKING") {
    throw new Error("CREATIVE_MUSIC_VOCAL_ROLE_LEAD_REQUIRED");
  }
  return request;
}
export function vocalRoleSeparationCertificationRequirements() {
  return {
    contract: "AVANTIQO_MUSIC_VOCAL_ROLE_SEPARATION_CERTIFICATION_V1",
    capability: MUSIC_VOCAL_ROLE_SEPARATOR_CAPABILITY,
    benchmark_required: true,
    human_listening_review_required: true,
    minimum_role_outputs: ["lead_vocal", "supporting_vocals", "instrumental"],
    must_prove: [
      "LEAD_REMOVAL_WITH_SUPPORTING_VOCALS_PRESERVED",
      "SUPPORTING_VOCAL_BLEED_WITHIN_REVIEW_THRESHOLD",
      "INSTRUMENTAL_BLEED_WITHIN_REVIEW_THRESHOLD",
      "SOURCE_TIMING_PRESERVED",
      "NO_ORDINARY_DEMUCS_FALLBACK",
    ],
    benchmark_fixture_roles_declared_by_human: true,
    role_labels_may_not_be_inferred_from_track_name: true,
    production_activation_requires_separate_authority: true,
  };
}

export const CreativeMusicVocalRoleSeparationRuntime = Object.freeze({
  contract: MUSIC_VOCAL_ROLE_SEPARATION_CONTRACT,
  capability: MUSIC_VOCAL_ROLE_SEPARATOR_CAPABILITY,
  roles: ROLE_LABELS,
  modes: MODES,
  buildRequest: buildMusicVocalRoleSeparationRequest,
  certificationRequirements: vocalRoleSeparationCertificationRequirements,
});

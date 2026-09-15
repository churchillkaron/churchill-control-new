import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { reason as creativeReason } from "@/lib/creative/reasoning/CreativeReasoningService";
import { analyzeMusicMusicalContent } from "./CreativeMusicMusicalAnalysisRuntime.js";
import { evaluateMusicDailies } from "./CreativeMusicCreativeDevelopmentRuntime.js";
import { buildMusicDailiesRepairBrief, approveMusicDailiesWithAcceptedDeviations } from "./CreativeMusicDailiesContractRuntime.js";
import { buildMusicListeningEvidence } from "./CreativeMusicListeningEvidenceRuntime.js";
import { buildMusicMelodyIntelligence } from "./CreativeMusicMelodyIntelligenceRuntime.js";
import { buildMusicFormIntelligence } from "./CreativeMusicFormIntelligenceRuntime.js";
import { buildMusicRhythmIntelligence } from "./CreativeMusicRhythmIntelligenceRuntime.js";
import { updateMusicConversationState } from "./CreativeMusicConversationStateRuntime.js";

const CONTRACT = "AVANTIQO_MUSIC_DAILIES_LISTENING_V1";
const REVIEWERS = Object.freeze([
  ["MUSICALITY", "Judge melody, harmony, rhythm, form, motif development and musical coherence."],
  ["PERFORMANCE", "Judge human feel, phrasing, groove, dynamics, articulation, vocal/instrument expression and timing."],
  ["SONIC_IDENTITY", "Judge whether the rendered track preserves the approved sonic identity, instrumentation language, texture and signature moments."],
  ["TECHNICAL", "Judge audible artifacts, clipping, balance, loudness, noise and delivery integrity using measured evidence."],
  ["TRANSLATION", "Judge measured mono compatibility, stereo stability, transient integrity, low-end balance, harshness risk and destination translation without inventing artistic intent."],
  ["INTENT_FIDELITY", "Compare the rendered music against the exact approved emotional arc, arrangement, motifs, performance direction, sonic identity and dynamics."],
]);

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

function renderedEvidence({ analysis = {}, master_report = {}, translation_qc = null, binding = {}, asset = {} } = {}) {
  return {
    emotional_arc: text(asset.metadata?.music_emotional_arc) || null,
    arrangement_arc: text(asset.metadata?.music_arrangement_arc) || null,
    motif_and_hook_system: text(asset.metadata?.music_motif_and_hook_system) || null,
    performance_direction: asset.metadata?.music_performance_direction || null,
    sonic_identity: text(asset.metadata?.music_sonic_identity) || null,
    dynamic_arc: asset.metadata?.music_dynamic_arc || null,
    measured_bpm: analysis.accepted?.bpm ?? null,
    measured_key: analysis.accepted?.key_label ?? null,
    musical_analysis: {
      accepted: object(analysis.accepted),
      tempo: analysis.tempo?.accepted === true ? analysis.tempo : { accepted: false, confidence: analysis.tempo?.confidence ?? null },
      key: analysis.key?.accepted === true ? analysis.key : { accepted: false, confidence: analysis.key?.confidence ?? null },
      sections: analysis.sections || null,
      rhythm_analysis_ready: analysis.rhythm_analysis_ready === true,
      section_analysis_ready: analysis.section_analysis_ready === true,
    },
    melodic_intelligence: buildMusicMelodyIntelligence(analysis),
    motif_timing_evidence: {
      dedicated_match_ready: false,
      exact_intro_seconds: null,
      generic_melody_phrase_onsets_are_not_motif_timing: true,
      repeated_motif_candidates_are_similarity_hypotheses_not_identity_proof: true,
    },
    form_intelligence: buildMusicFormIntelligence(analysis),
    rhythm_intelligence: buildMusicRhythmIntelligence(analysis),
    dynamic_sections: analysis.sections || null,
    master_report,
    perceptual_translation: translation_qc || null,
    evidence_capabilities: {
      exact_tempo_ready: analysis.tempo?.accepted === true,
      exact_key_ready: analysis.key?.accepted === true,
      section_boundary_ready: analysis.section_analysis_ready === true,
      section_boundaries_are_structural_change_candidates_not_semantic_event_identity: true,
      section_boundary_resolution_seconds: Number(analysis.sections?.window_seconds || 2),
      dedicated_motif_identity_ready: false,
      instrument_identity_ready: false,
      vocal_identity_ready: false,
      percussion_microtiming_ready: analysis.rhythm_analysis_ready === true,
      harmonic_movement_ready: analysis.harmonic_movement_ready === true,
      dynamic_measurement_ready: analysis.section_analysis_ready === true,
      neutral_form_labels_are_structural_not_pitch_names: true,
    },
    actual_duration_seconds: Number(analysis.duration_seconds || asset.metadata?.duration_seconds || 0) || null,
    content_kind: "STANDALONE_MUSIC",
    music_audio_present: Boolean(asset.file_url || asset.audio_url) && Number(analysis.duration_seconds || asset.metadata?.duration_seconds || 0) > 0,
    dialogue_required: false,
    dialogue_present: null,
    dialogue_ducking_required: false,
    cinematic_mix_presence_flags_authoritative: false,
    source_asset_id: asset.id || null,
    source_url: asset.file_url || asset.audio_url || null,
  };
}

function reviewPolicyViolations({ result = {}, rendered = {} } = {}) {
  const violations = [];
  const capabilities = object(rendered.evidence_capabilities);
  const duration = Number(rendered.actual_duration_seconds || 0);
  const evidenceText = [...list(result.evidence), ...list(result.failures), ...list(result.repair)].map(text).join(" ").toLowerCase();
  const failureText = [...list(result.failures), ...list(result.repair)].map(text).join(" ").toLowerCase();
  const evidenceOnlyText = list(result.evidence).map(text).join(" ").toLowerCase();
  if (!capabilities.dedicated_motif_identity_ready && /motif/.test(failureText) && /(missing|not verified|not confirmed|timing|align|candidate|identity)/.test(failureText)) {
    violations.push("UNSUPPORTED_DEDICATED_MOTIF_CLAIM");
  }
  if (!capabilities.instrument_identity_ready && /(strings?|percussion|harp|instrument)/.test(failureText) && /(missing|absent|not present|fail|enter|late|add|introduce)/.test(failureText)) {
    violations.push("UNSUPPORTED_INSTRUMENT_IDENTITY_CLAIM");
  }
  if (!capabilities.vocal_identity_ready && /vocal/.test(failureText) && /(missing|absent|not present|not sustained|not lead|add|harmony|fragment)/.test(failureText)) {
    violations.push("UNSUPPORTED_VOCAL_IDENTITY_CLAIM");
  }
  if (!capabilities.percussion_microtiming_ready && /(micro[- ]?tim|rhythmic displacement)/.test(failureText)) {
    violations.push("UNSUPPORTED_MICROTIMING_CLAIM");
  }
  if (/(emotional arc).*(missing|not rendered|absent)|(?:missing|not rendered|absent).*(emotional arc)/.test(failureText)) {
    violations.push("UNKNOWN_SEMANTIC_ARC_TREATED_AS_RENDER_FAILURE");
  }
  if (/neutral_label/.test(evidenceOnlyText) && /(key|harmonic|dorian|mode)/.test(evidenceOnlyText + " " + failureText)) {
    violations.push("STRUCTURAL_FORM_LABEL_CONFUSED_WITH_PITCH_KEY");
  }
  if (/(section boundary|boundary at|no boundary|closest boundary|actual transition|density recede|density recedes)/.test(failureText) && /(strings?|vocal|percussion|resolution|integrated strength|fragile emergence|transition|density recede|density recedes)/.test(failureText)) {
    violations.push("STRUCTURAL_BOUNDARY_TREATED_AS_SEMANTIC_EVENT_PROOF");
  }
  if (/(silence phase|silence.*0:00-0:20|silence.*0-20)/.test(evidenceOnlyText + " " + failureText) && /(activity|rms|boundary|contradict|shorten)/.test(evidenceOnlyText + " " + failureText)) {
    violations.push("EVOLVING_PHASE_MISREAD_AS_LITERAL_FULL_WINDOW_SILENCE");
  }
  for (const region of list(result.regions)) {
    const start = Number(region?.start_seconds);
    const end = Number(region?.end_seconds);
    if (duration > 0 && (start < 0 || end > duration + 0.001)) violations.push("REGION_OUTSIDE_RENDERED_DURATION");
  }
  if (/missing_dedicated_motif_match_is_unknown_not_render_failure/.test(evidenceText) && list(result.failures).length) {
    violations.push("REVIEW_CONTRADICTS_UNKNOWN_NOT_FAILURE_POLICY");
  }
  return [...new Set(violations)];
}

function normalizeReviewResult({ family, result = {}, rendered = {} } = {}) {
  const score = Number(result.score);
  const duration = Number(rendered.actual_duration_seconds || 0);
  return {
    family,
    reviewer_id: `music-dailies-${family.toLowerCase()}`,
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0,
    passed: result.passed === true,
    evidence: list(result.evidence),
    failures: list(result.failures),
    repair: list(result.repair),
    regions: list(result.regions).map((region) => ({ start_seconds: Number(region?.start_seconds), end_seconds: Number(region?.end_seconds), evidence: text(region?.evidence) })).filter((region) => Number.isFinite(region.start_seconds) && Number.isFinite(region.end_seconds) && region.end_seconds > region.start_seconds && (duration <= 0 || (region.start_seconds >= 0 && region.end_seconds <= duration + 0.001))),
  };
}

async function reviewFamily({ organization_id, family, mandate, intended, rendered, binding }) {
  const runAttempt = async (correction = null) => creativeReason({
    task: `MUSIC_DAILIES_${family}`,
    input: { organization_id, intended, rendered, binding, ...(correction ? { reviewer_policy_correction: correction } : {}) },
    constraints: {
      reviewer_family: family,
      mandate,
      independent_from_generator: true,
      evaluate_only_from_rendered_evidence: true,
      do_not_treat_approved_intent_as_rendered_fact: true,
      do_not_require_non_audio_gates: family === "INTENT_FIDELITY",
      do_not_invent_capability_or_release_requirements: true,
      standalone_music_asset: true,
      dialogue_is_not_required: true,
      dialogue_ducking_is_not_required: true,
      ignore_cinematic_mix_presence_flags_for_music_presence: true,
      unaccepted_measurements_are_not_facts: true,
      never_fail_on_unaccepted_tempo_or_key_candidates: true,
      missing_provenance_is_unknown_not_failure_unless_contract_requires_it: true,
      exact_motif_timing_requires_dedicated_match: true,
      generic_melody_phrase_onset_must_not_be_used_as_motif_start: true,
      repeated_motif_candidate_must_not_be_treated_as_identity_proof: true,
      missing_dedicated_motif_match_is_unknown_not_render_failure: true,
      unsupported_evidence_dimensions_are_unknown_not_render_failure: true,
      missing_semantic_emotional_arc_is_unknown_not_render_failure: true,
      neutral_form_labels_are_structural_categories_not_pitch_or_key_names: true,
      structural_section_boundaries_are_not_semantic_event_identity_proof: true,
      do_not_require_exact_binding_transition_at_analyzer_boundary_resolution: true,
      evolving_phase_descriptions_with_arrows_are_not_literal_full_window_states: true,
      silence_to_vocal_to_pad_means_progression_within_the_phase_not_silence_until_phase_end: true,
      instrument_identity_requires_instrument_identity_ready: true,
      vocal_identity_requires_vocal_identity_ready: true,
      percussion_microtiming_requires_rhythm_analysis_ready: true,
      region_bounds_must_be_within_actual_duration_seconds: true,
      actual_duration_seconds: rendered.actual_duration_seconds,
      evidence_capabilities: rendered.evidence_capabilities,
      score_floor: 90,
      evidence_required: true,
      no_false_release_claims: true,
      ...(correction ? { previous_output_violated_evidence_policy: true, correct_all_listed_policy_violations: correction.violations } : {}),
    },
    outputShape: { score: 0, passed: false, evidence: ["string"], failures: ["string"], repair: ["string"], regions: [{ start_seconds: 0, end_seconds: 0, evidence: "string" }] },
    temperature: 0.2,
  });

  try {
    let response = await runAttempt();
    let result = object(response?.result);
    let violations = reviewPolicyViolations({ result, rendered });
    if (violations.length) {
      response = await runAttempt({ violations, previous_result: result });
      result = object(response?.result);
      violations = reviewPolicyViolations({ result, rendered });
    }
    if (violations.length) {
      return {
        family,
        reviewer_id: `music-dailies-${family.toLowerCase()}`,
        score: 0,
        passed: false,
        evidence: [`Reviewer evidence policy failed closed: ${violations.join(",")}`],
        failures: [`MUSIC_DAILIES_REVIEWER_EVIDENCE_POLICY_FAILED:${family}:${violations.join("|")}`],
        repair: ["Improve or rerun the reviewer/evidence analyzer; do not alter or regenerate the music from unsupported reviewer claims."],
        regions: [],
      };
    }
    return normalizeReviewResult({ family, result, rendered });
  } catch (error) {
    const message = text(error?.message || error) || "UNKNOWN_REVIEWER_FAILURE";
    return {
      family,
      reviewer_id: `music-dailies-${family.toLowerCase()}`,
      score: 0,
      passed: false,
      evidence: [`Reviewer execution failed closed: ${message}`],
      failures: [`MUSIC_DAILIES_REVIEWER_EXECUTION_FAILED:${family}:${message}`],
      repair: ["Rerun this reviewer after the reasoning/runtime failure is resolved; do not alter or regenerate the music based on an invalid reviewer payload."],
      regions: [],
    };
  }
}

export async function runMusicDailiesListening({ organization_id, creative_project_id = null, asset = {}, binding = {}, master_report = {}, translation_qc = null, accepted_deviations = [], accepted_by = null, acceptance_note = null } = {}) {
  if (!organization_id) throw new Error("CREATIVE_MUSIC_DAILIES_ORGANIZATION_REQUIRED");
  if (creative_project_id && !text(asset.id)) throw new Error("CREATIVE_MUSIC_DAILIES_PROJECT_ASSET_REQUIRED");
  if (text(asset.id)) {
    const persistedAsset = await CreativeAssetsRuntime.get(asset.id);
    if (!persistedAsset || text(persistedAsset.organization_id) !== text(organization_id)) {
      throw new Error("CREATIVE_MUSIC_DAILIES_ASSET_SCOPE_MISMATCH");
    }
    if (creative_project_id) {
      const projectAssets = await CreativeAssetsRuntime.list({ organization_id, creative_project_id, limit: 1000 });
      const projectAsset = projectAssets.find((candidate) => text(candidate.id) === text(asset.id));
      if (!projectAsset) throw new Error("CREATIVE_MUSIC_DAILIES_PROJECT_ASSET_MISMATCH");
      asset = projectAsset;
    } else {
      asset = persistedAsset;
    }
  }
  const sourceUrl = text(asset.file_url || asset.audio_url);
  if (!sourceUrl) throw new Error("CREATIVE_MUSIC_DAILIES_AUDIO_REQUIRED");
  if (!text(binding.direction_hash) || !text(binding.preproduction_hash)) throw new Error("CREATIVE_MUSIC_DAILIES_APPROVED_BINDING_REQUIRED");

  const analysis = await analyzeMusicMusicalContent({
    organization_id,
    source_url: sourceUrl,
    source_file_name: asset.file_name || "music-master.wav",
    source_mime_type: asset.metadata?.mime_type || null,
    duration_seconds: asset.metadata?.duration_seconds || null,
  });
  const intended = object(binding.direction_contract);
  const rendered = renderedEvidence({ analysis, master_report, translation_qc, binding, asset });
  if (list(accepted_deviations).length) {
    return approveMusicDailiesWithAcceptedDeviations({
      dailies: {
        status: "REVIEW_INCOMPLETE",
        report: { contract: "AVANTIQO_MUSIC_DAILIES_V1", passed: false, status: "REVIEW_INCOMPLETE", failures: [], intended_vs_rendered_required: true },
        reviews: [],
        analysis,
        intended,
        rendered,
        repair_brief: null,
      },
      accepted_deviations, accepted_by, acceptance_note,
    });
  }
  const reviews = await Promise.all(
    REVIEWERS.map(([family, mandate]) =>
      reviewFamily({ organization_id, family, mandate, intended, rendered, binding }),
    ),
  );
  const report = evaluateMusicDailies({ intended, rendered, reviews });
  const repairBrief = buildMusicDailiesRepairBrief({ report, reviews, binding });
  const reviewedAt = new Date().toISOString();
  const listeningEvidence = buildMusicListeningEvidence({
    creative_project_id,
    master_asset_id: asset.id,
    version_id: asset.id,
    analysis,
    master_report,
    reviews,
    reviewed_at: reviewedAt,
  });
  if (asset.id) {
    await CreativeAssetsRuntime.update(asset.id, { metadata: { ...(asset.metadata || {}), music_dailies_contract: CONTRACT, music_dailies_status: report.passed ? "APPROVED_FOR_MIX" : "REJECTED_FOR_REPAIR", music_dailies_report: report, music_dailies_reviews: reviews, music_dailies_repair_brief: repairBrief, music_dailies_reviewed_at: reviewedAt, music_perceptual_translation_summary: translation_qc, music_listening_evidence: listeningEvidence, include_in_music_mix: report.passed === true } });
  }
  if (creative_project_id && listeningEvidence) {
    await updateMusicConversationState({ organization_id, creative_project_id, patch: { listening_evidence: listeningEvidence } });
  }
  return {
    contract: CONTRACT,
    status: report.passed ? "APPROVED_FOR_MIX" : "REJECTED_FOR_REPAIR",
    analysis,
    intended,
    rendered,
    reviews,
    report,
    listening_evidence: listeningEvidence,
    perceptual_translation: translation_qc,
    repair_brief: repairBrief,
    release_ready: false,
    publication_authorized: false,
  };
}

export const CreativeMusicDailiesListeningRuntime = Object.freeze({
  contract: CONTRACT,
  reviewers: REVIEWERS,
  run: runMusicDailiesListening,
  repairBrief: buildMusicDailiesRepairBrief,
});

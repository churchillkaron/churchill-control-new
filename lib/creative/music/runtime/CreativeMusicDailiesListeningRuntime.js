import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { reason as creativeReason } from "@/lib/creative/reasoning/CreativeReasoningService";
import { analyzeMusicMusicalContent } from "./CreativeMusicMusicalAnalysisRuntime.js";
import { evaluateMusicDailies } from "./CreativeMusicCreativeDevelopmentRuntime.js";
import { buildMusicDailiesRepairBrief } from "./CreativeMusicDailiesContractRuntime.js";
import { buildMusicListeningEvidence } from "./CreativeMusicListeningEvidenceRuntime.js";
import { updateMusicConversationState } from "./CreativeMusicConversationStateRuntime.js";

const CONTRACT = "AVANTIQO_MUSIC_DAILIES_LISTENING_V1";
const REVIEWERS = Object.freeze([
  ["MUSICALITY", "Judge melody, harmony, rhythm, form, motif development and musical coherence."],
  ["PERFORMANCE", "Judge human feel, phrasing, groove, dynamics, articulation, vocal/instrument expression and timing."],
  ["SONIC_IDENTITY", "Judge whether the rendered track preserves the approved sonic identity, instrumentation language, texture and signature moments."],
  ["TECHNICAL", "Judge audible artifacts, clipping, balance, loudness, translation, noise and delivery integrity using measured evidence."],
  ["INTENT_FIDELITY", "Compare the rendered music against the exact approved emotional arc, arrangement, motifs, performance direction, sonic identity and dynamics."],
]);

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

function renderedEvidence({ analysis = {}, master_report = {}, binding = {}, asset = {} } = {}) {
  return {
    emotional_arc: text(asset.metadata?.music_emotional_arc) || text(binding.direction_contract?.emotional_arc),
    arrangement_arc: text(asset.metadata?.music_arrangement_arc) || text(binding.direction_contract?.arrangement_arc),
    motif_and_hook_system: text(asset.metadata?.music_motif_and_hook_system) || text(binding.direction_contract?.motif_and_hook_system),
    performance_direction: asset.metadata?.music_performance_direction || binding.direction_contract?.performance_direction || null,
    sonic_identity: text(asset.metadata?.music_sonic_identity) || text(binding.direction_contract?.sonic_identity),
    dynamic_arc: asset.metadata?.music_dynamic_arc || binding.direction_contract?.dynamic_arc || null,
    measured_bpm: analysis.accepted?.bpm ?? null,
    measured_key: analysis.accepted?.key_label ?? null,
    musical_analysis: analysis,
    dynamic_sections: analysis.sections || null,
    master_report,
    source_asset_id: asset.id || null,
    source_url: asset.file_url || asset.audio_url || null,
  };
}

async function reviewFamily({ organization_id, family, mandate, intended, rendered, binding }) {
  const response = await creativeReason({
    task: `MUSIC_DAILIES_${family}`,
    input: { organization_id, intended, rendered, binding },
    constraints: {
      reviewer_family: family,
      mandate,
      independent_from_generator: true,
      score_floor: 90,
      evidence_required: true,
      no_false_release_claims: true,
    },
    outputShape: { score: 0, passed: false, evidence: ["string"], failures: ["string"], repair: ["string"], regions: [{ start_seconds: 0, end_seconds: 0, evidence: "string" }] },
    temperature: 0.2,
  });
  const result = object(response?.result);
  const score = Number(result.score);
  return {
    family,
    reviewer_id: `music-dailies-${family.toLowerCase()}`,
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0,
    passed: result.passed === true,
    evidence: list(result.evidence),
    failures: list(result.failures),
    repair: list(result.repair),
    regions: list(result.regions).map((region) => ({ start_seconds: Number(region?.start_seconds), end_seconds: Number(region?.end_seconds), evidence: text(region?.evidence) })).filter((region) => Number.isFinite(region.start_seconds) && Number.isFinite(region.end_seconds) && region.end_seconds > region.start_seconds),
  };
}

export async function runMusicDailiesListening({ organization_id, creative_project_id = null, asset = {}, binding = {}, master_report = {} } = {}) {
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
  const rendered = renderedEvidence({ analysis, master_report, binding, asset });
  const reviews = [];
  for (const [family, mandate] of REVIEWERS) {
    reviews.push(await reviewFamily({ organization_id, family, mandate, intended, rendered, binding }));
  }
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
    await CreativeAssetsRuntime.update(asset.id, { metadata: { ...(asset.metadata || {}), music_dailies_contract: CONTRACT, music_dailies_status: report.passed ? "APPROVED_FOR_MIX" : "REJECTED_FOR_REPAIR", music_dailies_report: report, music_dailies_reviews: reviews, music_dailies_repair_brief: repairBrief, music_dailies_reviewed_at: reviewedAt, music_listening_evidence: listeningEvidence, include_in_music_mix: report.passed === true } });
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

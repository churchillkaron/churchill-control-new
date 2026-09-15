import { reason as creativeReason } from "@/lib/creative/reasoning/CreativeReasoningService";
import { buildMusicIntendedVsRenderedReview, buildMusicQualityTribunal } from "./CreativeMusicWorldClassQualityRuntime.js";
import { classifyMusicRepair } from "./CreativeMusicRepairContractRuntime.js";

const CONTRACT = "AVANTIQO_MUSIC_REPAIR_AND_TRIBUNAL_V1";
const SCORE_IDS = [
  "brief_fidelity", "musicality", "emotion", "originality", "arrangement",
  "performance", "sound_design", "mix_translation", "technical_master", "artifact_risk",
];

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

async function tribunalScores({ organization_id, plan = {}, binding = {}, dailies = {}, master_report = {} } = {}) {
  const response = await creativeReason({
    task: "MUSIC_WORLD_CLASS_FINAL_TRIBUNAL",
    input: { organization_id, plan, binding, dailies, master_report },
    constraints: {
      independent_from_generator: true,
      independent_from_dailies_reviewers: true,
      score_every_dimension: SCORE_IDS,
      evidence_required: true,
      threshold: 90,
      no_false_release_claims: true,
    },
    outputShape: {
      scores: Object.fromEntries(SCORE_IDS.map((id) => [id, 0])),
      notes: Object.fromEntries(SCORE_IDS.map((id) => [id, "string"])),
      evidence: ["string"],
    },
    temperature: 0.1,
  });
  return object(response?.result);
}

export async function runMusicFinalTribunal({ organization_id, plan = {}, binding = {}, dailies = {}, master_report = {} } = {}) {
  if (!organization_id) throw new Error("CREATIVE_MUSIC_TRIBUNAL_ORGANIZATION_REQUIRED");
  const dailiesStatus = text(dailies.status);
  if (!["APPROVED_FOR_MIX", "APPROVED_WITH_ACCEPTED_DEVIATIONS"].includes(dailiesStatus)) {
    return {
      contract: CONTRACT,
      status: "DAILIES_REPAIR_REQUIRED",
      repair: classifyMusicRepair({ dailies }),
      release_ready: false,
      publication_authorized: false,
    };
  }
  const scored = await tribunalScores({ organization_id, plan, binding, dailies, master_report });
  const review = buildMusicIntendedVsRenderedReview({
    plan,
    evidence: {
      rendered: object(dailies.rendered),
      scores: object(scored.scores),
      notes: object(scored.notes),
    },
  });
  const tribunal = buildMusicQualityTribunal({
    plan,
    review,
    evidence: {
      master_report,
      source_rights_required: false,
      source_present: false,
      clipping_detected: false,
      delivery_corrupt: false,
    },
  });
  return {
    contract: CONTRACT,
    status: tribunal.release_ready ? "WORLD_CLASS_RELEASE_CANDIDATE" : "TRIBUNAL_REPAIR_REQUIRED",
    review,
    tribunal,
    evidence: list(scored.evidence),
    release_ready: tribunal.release_ready,
    publication_authorized: false,
    accepted_deviations: list(dailies.accepted_deviations),
    human_acceptance: object(dailies.human_acceptance),
  };
}

export const CreativeMusicRepairAndTribunalRuntime = Object.freeze({
  contract: CONTRACT,
  classifyRepair: classifyMusicRepair,
  tribunal: runMusicFinalTribunal,
});

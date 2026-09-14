import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { buildWorldClassMusicStudioPlan } from "@/lib/creative/music/runtime/CreativeMusicWorldClassStudioRuntime";
import { interpretMusicProjectDecision } from "@/lib/creative/music/runtime/CreativeMusicDecisionInterpreterRuntime";
import { buildMusicChangeSet } from "@/lib/creative/music/runtime/CreativeMusicChangeSetRuntime";
import { buildReviewedMusicEditReference } from "@/lib/creative/music/runtime/CreativeMusicReviewedEditReferenceRuntime";
import { listeningEvidenceStatus } from "@/lib/creative/music/runtime/CreativeMusicListeningEvidenceRuntime";
import { buildMusicListeningContext } from "@/lib/creative/music/runtime/CreativeMusicListeningContextRuntime";
import { buildMusicVocalIntelligence } from "@/lib/creative/music/runtime/CreativeMusicVocalIntelligenceRuntime";
import { loadMusicConversationState, musicConversationExecutionContext } from "@/lib/creative/music/runtime/CreativeMusicConversationStateRuntime";

function text(value) { return String(value ?? "").trim(); }
function looksLikeScopedMusicChange(value) {
  const source = text(value).toLowerCase();
  const section = /\b(intro|verse|pre[- ]?chorus|chorus|bridge|hook|drop|breakdown|outro|ending)\b/.test(source);
  const change = /\b(make|change|edit|adjust|darken|brighten|reduce|increase|remove|add|replace|fix|stronger|weaker|softer|harder)\b/.test(source);
  return section && change;
}

export const manifest = defineCapability({
  domain: "creative",
  capability: "music",
  action: "planWorldClassProduction",
  description: "Turn a natural-language music or audio request into a world-class Avantiqo Music Studio production plan with the exact specialist workers, production phases, quality gates and governed capability readiness needed. Use for songs, backing tracks, vocal removal, stems, melodies, harmonies, recording, remixing, SFX, music for video, mixing, mastering and related audio work.",
  permissions: [],
  events: [],
  tags: ["music", "audio", "plan", "song", "backing-track", "stems", "remove-vocals", "melody", "harmony", "sfx", "mix", "master", "business-partner", "creative-discussion"],
  operatorAliases: [
    "plan the music", "plan this song", "plan the soundtrack", "plan music for this video",
    "help me with the music", "help me think through the music", "talk through the music",
    "what could we do with the music", "what should the music be", "music ideas",
    "soundtrack ideas", "song ideas", "ideas for the soundtrack", "ideas for the song",
  ],
  operatorExamples: [
    "Help me think through the music for this video before we generate anything.",
    "What could we do with the soundtrack here?",
    "Plan the song around the direction we have been discussing.",
  ],
  transactional: false,
  aiEnabled: true,
  operatorEnabled: true,
  operatorMode: "read",
  operatorAutoExecute: true,
  operatorRequiresConfirmation: false,
  risk: "low",
  reversible: true,
  approval: "none",
  contextScope: "organization",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Optional working title." },
      objective: { type: "string", description: "Natural-language music/audio job to accomplish." },
      capabilities: { type: "array", items: { type: "string" }, description: "Optional exact Music Studio capability IDs when already known." },
      creative_project_id: { type: "string", description: "Existing Music Studio project to continue. When supplied, planning must use its bounded project conversation state." },
      master_asset_id: { type: "string" },
      target_range: { type: "object" },
      intended_delta: { type: "string" },
      allow_protected_overlap: { type: "boolean" },
    },
    required: ["objective"],
    additionalProperties: false,
  },
});

export function validate({ payload = {} }) {
  if (!text(payload.objective)) {
    const error = new Error("CREATIVE_MUSIC_WORLD_CLASS_OBJECTIVE_REQUIRED");
    error.status = 400;
    throw error;
  }
  return true;
}

export function authorize() { return true; }

export async function execute({ context, payload = {} }) {
  const conversationDecisionPreview = interpretMusicProjectDecision(payload.objective);
  if (!text(payload.creative_project_id)) return { ...buildWorldClassMusicStudioPlan(payload), conversation_decision_preview: conversationDecisionPreview };
  const loaded = await loadMusicConversationState({
    organization_id: context.organizationId,
    creative_project_id: payload.creative_project_id,
  });
  const conversationContext = musicConversationExecutionContext(loaded.state);
  const listeningStatus = listeningEvidenceStatus(conversationContext.listening_evidence, conversationContext);
  const effectiveConversationContext = listeningStatus.current
    ? conversationContext
    : { ...conversationContext, listening_evidence: null };
  const listeningContext = buildMusicListeningContext({
    evidence: effectiveConversationContext.listening_evidence,
    current: effectiveConversationContext,
    sections: effectiveConversationContext.approved_sections,
  });
  const vocalIntelligence = buildMusicVocalIntelligence({
    multitrack_session: loaded.project?.metadata?.music_multitrack_project || {},
  });
  const resolvedMasterAssetId = text(payload.master_asset_id || conversationContext.current_master_asset_id) || null;
  const shouldPlanChange = Boolean(payload.target_range || payload.intended_delta || looksLikeScopedMusicChange(payload.objective));
  const changeSetPreview = shouldPlanChange
    ? buildMusicChangeSet({
        creative_project_id: payload.creative_project_id,
        master_asset_id: resolvedMasterAssetId,
        instruction: payload.objective,
        target_range: payload.target_range,
        intended_delta: payload.intended_delta || payload.objective,
        conversation_context: effectiveConversationContext,
        allow_protected_overlap: payload.allow_protected_overlap === true,
      })
    : null;
  const reviewedEditReference = changeSetPreview ? buildReviewedMusicEditReference(changeSetPreview) : null;
  const reviewedEditContinuation = reviewedEditReference ? {
    capability_key: "creative.music.executeWorldClassProduction",
    authorization_requirement: "user_confirmation",
    source_rights_confirmation_required: true,
    payload: {
      creative_project_id: reviewedEditReference.creative_project_id,
      master_asset_id: reviewedEditReference.master_asset_id,
      expected_change_set_fingerprint: reviewedEditReference.expected_change_set_fingerprint,
      target_range: reviewedEditReference.target_range,
      intended_delta: reviewedEditReference.intended_delta,
      allow_protected_overlap: reviewedEditReference.allow_protected_overlap,
    },
    publication_authorized: false,
  } : null;
  return {
    ...buildWorldClassMusicStudioPlan({
      ...payload,
      music_conversation_context: effectiveConversationContext,
      music_listening_context: listeningContext,
      music_vocal_intelligence: vocalIntelligence,
    }),
    conversation_decision_preview: conversationDecisionPreview,
    music_change_set_preview: changeSetPreview,
    reviewed_edit_reference: reviewedEditReference,
    reviewed_edit_continuation: reviewedEditContinuation,
    music_listening_evidence: effectiveConversationContext.listening_evidence || null,
    music_listening_evidence_status: listeningStatus,
    music_vocal_intelligence: vocalIntelligence,
  };
}

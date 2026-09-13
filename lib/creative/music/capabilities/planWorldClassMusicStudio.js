import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { buildWorldClassMusicStudioPlan } from "@/lib/creative/music/runtime/CreativeMusicWorldClassStudioRuntime";
import { interpretMusicProjectDecision } from "@/lib/creative/music/runtime/CreativeMusicDecisionInterpreterRuntime";
import { buildMusicChangeSet } from "@/lib/creative/music/runtime/CreativeMusicChangeSetRuntime";
import { loadMusicConversationState, musicConversationExecutionContext } from "@/lib/creative/music/runtime/CreativeMusicConversationStateRuntime";

function text(value) { return String(value ?? "").trim(); }

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
  const changeSetPreview = payload.master_asset_id || payload.target_range || payload.intended_delta
    ? buildMusicChangeSet({
        creative_project_id: payload.creative_project_id,
        master_asset_id: payload.master_asset_id,
        instruction: payload.objective,
        target_range: payload.target_range,
        intended_delta: payload.intended_delta,
        conversation_context: conversationContext,
        allow_protected_overlap: payload.allow_protected_overlap === true,
      })
    : null;
  return {
    ...buildWorldClassMusicStudioPlan({
      ...payload,
      music_conversation_context: conversationContext,
    }),
    conversation_decision_preview: conversationDecisionPreview,
    music_change_set_preview: changeSetPreview,
  };
}

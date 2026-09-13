import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import {
  MUSIC_CONVERSATION_STATE_METADATA_KEY,
  emptyMusicConversationState,
  mergeMusicConversationState,
  musicConversationExecutionContext,
} from "./CreativeMusicConversationStateContract.js";

export {
  emptyMusicConversationState,
  mergeMusicConversationState,
  musicConversationExecutionContext,
} from "./CreativeMusicConversationStateContract.js";

function text(value) { return String(value ?? "").trim(); }

export async function loadMusicConversationState({ organization_id, creative_project_id } = {}) {
  if (!organization_id || !creative_project_id) throw new Error("CREATIVE_MUSIC_CONVERSATION_CONTEXT_REQUIRED");
  const project = await CreativeProjectRepository.getById(creative_project_id);
  if (!project || text(project.organization_id) !== text(organization_id)) {
    throw new Error("CREATIVE_MUSIC_CONVERSATION_PROJECT_NOT_FOUND");
  }
  return {
    project,
    state: {
      ...emptyMusicConversationState(),
      ...(project.metadata?.[MUSIC_CONVERSATION_STATE_METADATA_KEY] || {}),
    },
  };
}

export async function updateMusicConversationState(args = {}) {
  const organization_id = args.organization_id;
  const creative_project_id = args.creative_project_id;
  const patch = args.patch || {};
  const decisionSummary = text(args.decision_summary).slice(0, 900);
  const loaded = await loadMusicConversationState({ organization_id, creative_project_id });
  const effectivePatch = decisionSummary
    ? { ...patch, recent_decisions: [...(patch.recent_decisions || []), decisionSummary] }
    : patch;
  const hasPatch = Object.values(effectivePatch).some((value) => (
    Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== ""
  ));
  if (!hasPatch) return loaded.state;

  const next = mergeMusicConversationState(loaded.state, effectivePatch);
  await CreativeProjectRepository.update(loaded.project.id, {
    metadata: {
      ...(loaded.project.metadata || {}),
      [MUSIC_CONVERSATION_STATE_METADATA_KEY]: next,
    },
  });
  return next;
}

export function buildMusicConversationExecutionContext(state = {}) {
  return musicConversationExecutionContext(state);
}

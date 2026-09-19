import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  listWorldClassMusicCapabilities,
  listWorldClassMusicWorkers,
} from "@/lib/creative/music/runtime/CreativeMusicWorldClassStudioRuntime";
import { loadMusicConversationState, musicConversationExecutionContext } from "@/lib/creative/music/runtime/CreativeMusicConversationStateRuntime";
import { inspectMusicVersionLineage } from "@/lib/creative/music/runtime/CreativeMusicVersionLineageRuntime";

export const manifest = defineCapability({
  domain: "creative",
  capability: "music",
  action: "inspectWorldClassStudio",
  description: "Inspect the complete Avantiqo Music Studio worker roster and capability matrix, including composition, backing tracks, stems, vocal removal, melody, harmony, MIDI, recording, editing, SFX, mixing, mastering, quality review and release work.",
  permissions: [],
  events: [],
  tags: ["music", "studio", "audio", "workers", "capabilities", "backing-track", "stems", "melody", "sfx", "business-partner"],
  operatorAliases: [
    "what can music studio do", "show music studio capabilities", "music studio capabilities",
    "what can we do with music", "what audio tools do we have", "show music workers",
    "music studio workers", "can we make a backing track", "can we remove vocals",
    "can we separate stems", "can we make music for video",
    "what did we decide about the music", "remember the music project", "show the music project context",
  ],
  operatorExamples: [
    "What can Music Studio do for this project?",
    "Can we remove vocals and make a stage-ready backing track?",
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
  inputSchema: { type: "object", properties: { creative_project_id: { type: "string" } }, additionalProperties: false },
});

function text(value) { return String(value ?? "").trim(); }
export function validate() { return true; }
export function authorize() { return true; }

export async function execute({ context, payload = {} } = {}) {
  const projectContext = text(payload.creative_project_id)
    ? musicConversationExecutionContext((await loadMusicConversationState({
        organization_id: context.organizationId,
        creative_project_id: payload.creative_project_id,
      })).state)
    : null;
  const versionLineage = text(payload.creative_project_id)
    ? await inspectMusicVersionLineage({ organization_id: context.organizationId, creative_project_id: payload.creative_project_id })
    : null;
  return {
    status: "READY",
    contract: "AVANTIQO_WORLD_CLASS_MUSIC_STUDIO_V1",
    workers: listWorldClassMusicWorkers(),
    capabilities: listWorldClassMusicCapabilities(),
    entrypoints: ["MUSIC_STUDIO_UI", "BUSINESS_PARTNER", "API"],
    project_context: projectContext,
    music_version_lineage: versionLineage,
  };
}

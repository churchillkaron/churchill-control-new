import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { buildWorldClassMusicStudioPlan } from "@/lib/creative/music/runtime/CreativeMusicWorldClassStudioRuntime";

function text(value) { return String(value ?? "").trim(); }

export const manifest = defineCapability({
  domain: "creative",
  capability: "music",
  action: "planWorldClassProduction",
  description: "Turn a natural-language music or audio request into a world-class Avantiqo Music Studio production plan with the exact specialist workers, production phases, quality gates and governed capability readiness needed. Use for songs, backing tracks, vocal removal, stems, melodies, harmonies, recording, remixing, SFX, music for video, mixing, mastering and related audio work.",
  permissions: [],
  events: [],
  tags: ["music", "audio", "plan", "song", "backing-track", "stems", "remove-vocals", "melody", "harmony", "sfx", "mix", "master"],
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

export async function execute({ payload = {} }) {
  return buildWorldClassMusicStudioPlan(payload);
}

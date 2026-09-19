import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { runMusicDailiesListening } from "@/lib/creative/music/runtime/CreativeMusicDailiesListeningRuntime";

function text(value) { return String(value ?? "").trim(); }

export const manifest = defineCapability({
  domain: "creative",
  capability: "music",
  action: "reviewWorldClassDailies",
  name: "Review Music Studio dailies",
  description: "Measure and independently review a rendered Music Studio master against its exact approved creative-direction binding, persist the dailies verdict and produce a surgical repair brief when it fails.",
  permissions: [], events: ["creative.music.dailies.reviewed"],
  tags: ["music", "dailies", "listening", "quality", "repair", "business-partner"],
  operatorAliases: ["review the music", "check the music quality", "run music dailies", "listen to the result"],
  operatorExamples: ["Review this Music Studio master against the approved direction."],
  transactional: false, aiEnabled: true, operatorEnabled: true,
  operatorMode: "read", operatorAutoExecute: true, operatorRequiresConfirmation: false,
  risk: "low", reversible: true, approval: "none", contextScope: "organization",
  inputSchema: { type: "object", properties: {
    creative_project_id: { type: "string" },
    asset: { type: "object" }, binding: { type: "object" }, master_report: { type: "object" },
  }, required: ["asset", "binding"], additionalProperties: false },
});

export function validate({ payload = {} }) {
  if (!text(payload.asset?.file_url || payload.asset?.audio_url)) throw new Error("CREATIVE_MUSIC_DAILIES_AUDIO_REQUIRED");
  if (!text(payload.binding?.direction_hash) || !text(payload.binding?.preproduction_hash)) throw new Error("CREATIVE_MUSIC_DAILIES_APPROVED_BINDING_REQUIRED");
  return true;
}
export function authorize() { return true; }
export async function execute({ context, payload = {} }) {
  return runMusicDailiesListening({ organization_id: context.organizationId, ...payload });
}

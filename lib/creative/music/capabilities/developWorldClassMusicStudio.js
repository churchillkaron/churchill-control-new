import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { executeMusicCreativeFloor } from "@/lib/creative/music/runtime/CreativeMusicCreativeFloorExecutionRuntime";

function text(value) { return String(value ?? "").trim(); }

export const manifest = defineCapability({
  domain: "creative",
  capability: "music",
  action: "developWorldClassProduction",
  name: "Develop Music Studio production",
  description: "Run the Music Studio Research Room, three independent musical concepts, independent critic panel, winner revision and locked pre-production brief through Avantiqo Intelligence without starting paid media generation.",
  permissions: [],
  events: ["creative.music.development.completed"],
  tags: ["music", "research", "concept", "composer", "producer", "creative-direction", "business-partner"],
  operatorAliases: [
    "develop the music", "create music concepts", "find the best music direction",
    "develop the song", "work out the music direction", "give me music concepts",
    "give me three music directions", "give me three song directions",
    "develop soundtrack concepts", "develop three soundtrack ideas",
    "compare music directions", "find a stronger music idea",
  ],
  operatorExamples: ["Develop three strong directions for this song before we generate anything.", "Find the best musical concept for this film."],
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
      title: { type: "string" },
      objective: { type: "string" },
      source_media: { type: "string" },
      source_audio: { type: "string" },
      duration_seconds: { type: "number" },
      style: { type: "string" },
      mood: { type: "string" },
      instrumentation: { type: "string" },
      lyrics: { type: "string" },
    },
    required: ["objective"],
    additionalProperties: true,
  },
});

export function validate({ payload = {} }) {
  if (!text(payload.objective)) {
    const error = new Error("CREATIVE_MUSIC_CREATIVE_FLOOR_OBJECTIVE_REQUIRED");
    error.status = 400;
    throw error;
  }
  return true;
}
export function authorize() { return true; }
export async function execute({ context, payload = {} }) {
  return executeMusicCreativeFloor({ ...payload, organization_id: context.organizationId, entity_id: context.entityId || null, party_id: context.actor?.partyId || context.actor?.party_id || null });
}

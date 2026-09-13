import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { planMusicSurgicalRepair } from "@/lib/creative/music/runtime/CreativeMusicSurgicalRepairRuntime";

function text(value) { return String(value ?? "").trim(); }

export const manifest = defineCapability({
  domain: "creative",
  capability: "music",
  action: "planWorldClassSurgicalRepair",
  name: "Plan Music Studio surgical repair",
  description: "Resolve the next exact failed time region from persisted Music Dailies evidence and prepare a fail-closed surgical repair plan. Never generates media or spends on production.",
  permissions: [],
  events: [],
  tags: ["music", "repair", "dailies", "surgical", "business-partner"],
  operatorAliases: ["plan the music repair", "fix the failed part of the music", "plan a surgical music repair", "what exactly should we repair"],
  operatorExamples: ["Plan the smallest repair for the part that failed Music Dailies."],
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
      creative_project_id: { type: "string" },
      master_asset_id: { type: "string" },
      source_rights_confirmed: { type: "boolean" },
    },
    required: ["creative_project_id", "master_asset_id"],
    additionalProperties: false,
  },
});
export function validate({ payload = {} }) {
  if (!text(payload.creative_project_id) || !text(payload.master_asset_id)) {
    const error = new Error("CREATIVE_MUSIC_SURGICAL_REPAIR_REFERENCE_REQUIRED");
    error.status = 400;
    throw error;
  }
  return true;
}

export function authorize() { return true; }

export async function execute({ context, payload = {} }) {
  return planMusicSurgicalRepair({
    organization_id: context.organizationId,
    creative_project_id: payload.creative_project_id,
    master_asset_id: payload.master_asset_id,
    source_rights_confirmed: payload.source_rights_confirmed === true,
  });
}

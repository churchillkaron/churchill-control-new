import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import MeetingPack from "@/lib/operator/secretary/SecretaryMeetingPackCoordinationRuntime";

function text(value) {
  return String(value ?? "").trim();
}

export function createSecretaryMeetingPackCoordinationCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_meeting_pack_coordination",
    action: "coordinate",
    name: "Executive Secretary meeting pack coordination",
    document: "secretary_meeting_pack",
    description: "Coordinate evidence-backed meeting and board packs by collecting referenced materials, blocking incomplete finalization, freezing versions, recording distribution and acknowledgements, and preserving revision history without duplicating source documents or inferring approval, attendance, delivery, or authority.",
    permissions: [],
    events: ["platform.secretary_meeting_pack_coordination.coordinate"],
    tags: ["platform", "secretary", "executive-secretary", "meeting", "board-pack", "documents", "distribution"],
    operatorAliases: [
      "prepare and coordinate the meeting pack",
      "build the board pack",
      "collect the papers for this meeting",
      "finalize and track this meeting pack",
      "track acknowledgements for the meeting pack",
    ],
    operatorExamples: [
      "start a meeting pack for this meeting",
      "record this document in the pack",
      "finalize the pack",
      "record that they received the pack",
    ],
    transactional: true,
    aiEnabled: false,
    operatorEnabled: true,
    operatorMode: "act",
    operatorAutoExecute: false,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: "medium",
    reversible: true,
    approval: { required: false },
    inputSchema: { type: "object", additionalProperties: true },
  });

  function authorize({ context }) {
    return Boolean(text(context?.organizationId) && text(context?.metadata?.partyId || context?.actor?.partyId || context?.actor?.party_id));
  }

  async function execute({ context, payload = {} }) {
    const action = text(payload.action).toLowerCase() || "read";
    if (action === "start") return MeetingPack.start({ context, payload });
    if (action === "add_item" || action === "additem") return MeetingPack.addItem({ context, payload });
    if (action === "record_item" || action === "recorditem") return MeetingPack.recordItem({ context, payload });
    if (action === "record_unavailable" || action === "recordunavailable") return MeetingPack.recordUnavailable({ context, payload });
    if (action === "finalize") return MeetingPack.finalize({ context, payload });
    if (action === "record_distribution" || action === "recorddistribution") return MeetingPack.recordDistribution({ context, payload });
    if (action === "acknowledge" || action === "record_acknowledgement") return MeetingPack.acknowledge({ context, payload });
    if (action === "reopen" || action === "revise") return MeetingPack.reopen({ context, payload });
    if (action === "cancel") return MeetingPack.cancel({ context, payload });
    if (action === "list") return MeetingPack.list({ context, payload });
    return MeetingPack.read({ context, payload });
  }

  return { manifest, authorize, execute };
}

export default createSecretaryMeetingPackCoordinationCapability;

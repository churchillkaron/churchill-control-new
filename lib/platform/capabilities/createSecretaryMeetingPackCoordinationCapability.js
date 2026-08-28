import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import MeetingPack from "@/lib/operator/secretary/SecretaryMeetingPackCoordinationRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function normalizeAction(value) {
  const action = text(value).toLowerCase();
  if (["start", "additem", "recorditem", "recordunavailable", "finalize", "recorddistribution", "acknowledge", "reopen", "cancel", "read", "list"].includes(action)) return action;
  throw new Error(`SECRETARY_MEETING_PACK_CAPABILITY_ACTION_UNSUPPORTED:${action || "missing"}`);
}

export function createSecretaryMeetingPackCoordinationCapability(requestedAction = "read") {
  const action = normalizeAction(requestedAction);
  const readOnly = ["read", "list"].includes(action);
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_meeting_pack_coordination",
    action,
    name: "Executive Secretary meeting pack coordination",
    document: "secretary_meeting_pack",
    description: "Coordinate evidence-backed meeting and board packs by collecting referenced materials, blocking incomplete finalization, freezing versions, recording distribution and acknowledgements, and preserving revision history without duplicating source documents or inferring approval, attendance, delivery, or authority.",
    permissions: [],
    events: [`platform.secretary_meeting_pack_coordination.${action}`],
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
    transactional: !readOnly,
    aiEnabled: false,
    operatorEnabled: true,
    operatorMode: readOnly ? "read" : "write",
    operatorAutoExecute: readOnly,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: readOnly ? "low" : "medium",
    reversible: true,
    approval: { required: false },
    inputSchema: { type: "object", additionalProperties: true },
  });

  function authorize({ context }) {
    return Boolean(text(context?.organizationId) && text(context?.metadata?.partyId || context?.actor?.partyId || context?.actor?.party_id));
  }

  async function execute({ context, payload = {} }) {
    if (action === "start") return MeetingPack.start({ context, payload });
    if (action === "additem") return MeetingPack.addItem({ context, payload });
    if (action === "recorditem") return MeetingPack.recordItem({ context, payload });
    if (action === "recordunavailable") return MeetingPack.recordUnavailable({ context, payload });
    if (action === "finalize") return MeetingPack.finalize({ context, payload });
    if (action === "recorddistribution") return MeetingPack.recordDistribution({ context, payload });
    if (action === "acknowledge") return MeetingPack.acknowledge({ context, payload });
    if (action === "reopen") return MeetingPack.reopen({ context, payload });
    if (action === "cancel") return MeetingPack.cancel({ context, payload });
    if (action === "list") return MeetingPack.list({ context, payload });
    return MeetingPack.read({ context, payload });
  }

  return { manifest, authorize, execute };
}

export default createSecretaryMeetingPackCoordinationCapability;

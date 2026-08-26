import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { prepareSecretaryMeeting } from "@/lib/operator/secretary/SecretaryMeetingPreparationRuntime";

function text(value) {
  return String(value ?? "").trim();
}

export function createSecretaryMeetingPreparationCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_meeting_preparation",
    action: "prepare",
    name: "Executive Secretary meeting preparation",
    document: "secretary_calendar_event",
    description:
      "Prepare an executive meeting pack from verified calendar, participant, open-commitment and prior-meeting evidence. Read-only preparation never sends messages, changes the calendar, creates commitments or grants authority.",
    permissions: [],
    events: ["platform.secretary_meeting_preparation.prepare"],
    tags: ["platform", "secretary", "executive-secretary", "meeting", "preparation", "pre-read", "briefing", "read"],
    operatorAliases: [
      "prepare me for this meeting",
      "brief me before this meeting",
      "make a meeting prep pack",
      "what should I know before this meeting",
      "secretary prepare my meeting",
      "give me a pre-read for this meeting",
    ],
    operatorExamples: [
      "prepare me for this meeting",
      "brief me before this meeting",
      "what should I know before this meeting",
      "give me a pre-read for this meeting",
    ],
    transactional: false,
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: "read",
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: "low",
    reversible: true,
    approval: { required: false },
    inputSchema: {
      type: "object",
      properties: {
        calendar_event_id: { type: "string" },
        meeting_title: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
        participant_party_ids: { type: "array", items: { type: "string" }, maxItems: 100 },
        focus: { type: "string" },
        notes: { type: "string" },
        history_limit: { type: "number" },
      },
      additionalProperties: false,
    },
  });

  function authorize({ context }) {
    return Boolean(
      text(context?.organizationId) &&
      text(context?.metadata?.partyId || context?.actor?.partyId || context?.actor?.party_id),
    );
  }

  async function execute({ context, payload = {} }) {
    return prepareSecretaryMeeting({ context, payload });
  }

  return { manifest, authorize, execute };
}

export default createSecretaryMeetingPreparationCapability;

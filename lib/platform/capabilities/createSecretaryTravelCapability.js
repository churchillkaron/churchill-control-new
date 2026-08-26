import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { delegateSecretaryTravelCoordination } from "@/lib/operator/secretary/SecretaryTravelCoordinationRuntime";

function text(value) {
  return String(value ?? "").trim();
}

export function createSecretaryTravelCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_travel",
    action: "coordinate",
    name: "Executive Secretary travel coordination",
    document: "secretary_job",
    description:
      "Coordinate business travel or visits as a durable Avantiqo Executive Secretary job, including research, itinerary preparation, calendar commitments, reminders, confirmations and change handling. External booking, reservation, fare/rate acceptance and payment remain exact-step approval actions.",
    permissions: [],
    events: ["platform.secretary_travel.coordinate"],
    tags: ["platform", "secretary", "executive-secretary", "travel", "visit", "itinerary", "durable-job"],
    operatorAliases: [
      "arrange my trip",
      "organize my travel",
      "plan my business trip",
      "coordinate this visit",
      "secretary arrange my travel",
      "sort out my trip",
    ],
    operatorExamples: [
      "arrange my trip",
      "organize my travel",
      "plan my business trip",
      "coordinate this visit",
    ],
    transactional: true,
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: "write",
    operatorAutoExecute: false,
    operatorRequiresConfirmation: true,
    contextScope: "organization",
    risk: "medium",
    reversible: true,
    approval: { required: false, boundary: "conversation_confirmation" },
    inputSchema: {
      type: "object",
      properties: {
        request: { type: "string" },
        objective: { type: "string" },
        origin: { type: "string" },
        destination: { type: "string" },
        purpose: { type: "string" },
        depart_after: { type: "string" },
        arrive_before: { type: "string" },
        return_after: { type: "string" },
        return_before: { type: "string" },
        timezone: { type: "string" },
        traveler_party_id: { type: "string" },
        lodging_required: { type: "boolean" },
        local_transport_required: { type: "boolean" },
        preferences: { type: "object" },
        budget: { type: "object" },
        appointments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              starts_at: { type: "string" },
              ends_at: { type: "string" },
              timezone: { type: "string" },
              location: { type: "string" },
              contact_party_id: { type: "string" },
              notes: { type: "string" },
            },
            additionalProperties: false,
          },
        },
        success_criteria: { type: "array", items: { type: "string" } },
        autonomy_level: {
          type: "string",
          enum: ["PLAN_ONLY", "EXECUTE_WITH_GATES", "EXECUTE_WITHIN_POLICY"],
        },
        approval_policy: { type: "object" },
        entity_id: { type: "string" },
        max_attempts: { type: "number" },
        metadata: { type: "object" },
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
    return delegateSecretaryTravelCoordination({ context, payload });
  }

  return { manifest, authorize, execute };
}

export default createSecretaryTravelCapability;

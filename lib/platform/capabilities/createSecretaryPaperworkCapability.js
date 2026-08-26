import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { delegateSecretaryPaperworkCoordination } from "@/lib/operator/secretary/SecretaryPaperworkCoordinationRuntime";

function text(value) {
  return String(value ?? "").trim();
}

export function createSecretaryPaperworkCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_paperwork",
    action: "coordinate",
    name: "Executive Secretary paperwork coordination",
    document: "secretary_job",
    description:
      "Coordinate paperwork as a durable Avantiqo Executive Secretary job: identify missing documents, request and chase them, track evidence-backed receipt and review states, coordinate reviewers, prepare the package, and follow through to completion. Signatures, binding submissions, legal or commercial acceptance, fees and payments remain exact-step approval actions.",
    permissions: [],
    events: ["platform.secretary_paperwork.coordinate"],
    tags: [
      "platform",
      "secretary",
      "executive-secretary",
      "paperwork",
      "documents",
      "follow-through",
      "durable-job",
    ],
    operatorAliases: [
      "handle this paperwork",
      "organize these documents",
      "chase these documents",
      "prepare this document package",
      "secretary handle the paperwork",
      "collect the missing paperwork",
      "coordinate this application paperwork",
    ],
    operatorExamples: [
      "handle this paperwork",
      "organize these documents",
      "chase these documents",
      "prepare this document package",
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
        title: { type: "string" },
        purpose: { type: "string" },
        destination: { type: "string" },
        due_at: { type: "string" },
        timezone: { type: "string" },
        document_requirements: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              name: { type: "string" },
              document_type: { type: "string" },
              description: { type: "string" },
              responsible_party_id: { type: "string" },
              reviewer_party_id: { type: "string" },
              due_at: { type: "string" },
              mandatory: { type: "boolean" },
              notes: { type: "string" },
            },
            additionalProperties: false,
          },
        },
        document_references: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              reference_kind: { type: "string" },
              reference_id: { type: "string" },
              uri: { type: "string" },
              conversation_id: { type: "string" },
              message_id: { type: "string" },
              attachment_id: { type: "string" },
              evidence_kind: { type: "string" },
              evidence_at: { type: "string" },
              evidence_note: { type: "string" },
            },
            additionalProperties: false,
          },
        },
        reviewer_party_ids: { type: "array", items: { type: "string" } },
        responsible_party_ids: { type: "array", items: { type: "string" } },
        package_notes: { type: "string" },
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
    return delegateSecretaryPaperworkCoordination({ context, payload });
  }

  return { manifest, authorize, execute };
}

export default createSecretaryPaperworkCapability;

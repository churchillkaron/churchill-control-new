import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { readSecretaryInboxTriage } from "@/lib/operator/secretary/SecretaryInboxTriageRuntime";

function text(value, limit = 120) {
  return String(value ?? "").trim().slice(0, limit);
}

export function createSecretaryInboxTriageCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_inbox_triage",
    action: "read",
    name: "Executive Secretary inbox triage desk",
    document: "secretary_inbox_triage",
    description:
      "Read the organization-scoped Secretary inbox triage desk: executive decisions/review, Secretary-owned handling, waiting on external responses, handled correspondence and FYI. This is evidence-backed and read-only.",
    permissions: [],
    events: ["platform.secretary_inbox_triage.read"],
    tags: ["platform", "secretary", "executive-secretary", "inbox", "triage", "attention", "read"],
    operatorAliases: [
      "triage my inbox",
      "what messages actually need me",
      "show what the secretary is handling",
      "what are we waiting on",
      "show inbox priorities",
    ],
    operatorExamples: [
      "triage my inbox",
      "what messages actually need me",
      "show what the secretary is handling",
      "what are we waiting on",
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
        limit: { type: "number", minimum: 1, maximum: 200 },
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
    return readSecretaryInboxTriage({ context, payload });
  }

  return { manifest, authorize, execute };
}

export default createSecretaryInboxTriageCapability;

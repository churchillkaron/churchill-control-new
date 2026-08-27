import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { readSecretaryCommitmentControl } from "@/lib/operator/secretary/SecretaryCommitmentControlRuntime";

function text(value) {
  return String(value ?? "").trim();
}

export function createSecretaryCommitmentControlCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_commitments",
    action: "read",
    name: "Executive Secretary commitment control",
    document: "secretary_commitments",
    description:
      "Read one evidence-only organization-scoped commitment register across durable Secretary tasks, delegated jobs, and follow-ups, with linked execution absorbed under parent commitments and explicit decision, due, waiting, and next-action states.",
    permissions: [],
    events: ["platform.secretary_commitments.read"],
    tags: ["platform", "secretary", "executive-secretary", "commitments", "follow-through", "read"],
    operatorAliases: [
      "show me all commitments",
      "what have we promised",
      "what is outstanding",
      "what is my secretary tracking",
      "show outstanding commitments",
      "who owes what by when",
      "show commitment control",
    ],
    operatorExamples: [
      "show me all commitments",
      "what is outstanding",
      "who owes what by when",
    ],
    transactional: false,
    aiEnabled: false,
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
        now: { type: "string" },
        at: { type: "string" },
        limit: { type: "number" },
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
    return readSecretaryCommitmentControl({ context, payload });
  }

  return { manifest, authorize, execute };
}

export default createSecretaryCommitmentControlCapability;

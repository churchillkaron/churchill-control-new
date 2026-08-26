import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { readSecretaryExecutiveBriefing } from "@/lib/operator/secretary/SecretaryExecutiveBriefingRuntime";

function text(value) {
  return String(value ?? "").trim();
}

export function createSecretaryExecutiveBriefingCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "secretary_briefing",
    action: "read",
    name: "Executive Secretary desk briefing",
    document: "secretary_briefing",
    description:
      "Read one organization-scoped executive desk briefing across calendar, due work, delegated Secretary jobs, open tasks, pending follow-ups and recent calls.",
    permissions: [],
    events: ["platform.secretary_briefing.read"],
    tags: ["platform", "secretary", "executive-secretary", "briefing", "read"],
    operatorAliases: [
      "brief me",
      "give me my morning briefing",
      "what do I need to know today",
      "secretary brief me for today",
      "what needs my attention today",
      "give me my desk briefing",
    ],
    operatorExamples: [
      "brief me",
      "give me my morning briefing",
      "what do I need to know today",
      "secretary brief me for today",
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
        from: { type: "string" },
        to: { type: "string" },
        horizon_hours: { type: "number" },
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
    return readSecretaryExecutiveBriefing({ context, payload });
  }

  return { manifest, authorize, execute };
}

export default createSecretaryExecutiveBriefingCapability;
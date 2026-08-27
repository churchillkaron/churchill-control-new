import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { readSecretaryExecutiveBriefingV6 } from "@/lib/operator/secretary/SecretaryExecutiveBriefingV6Runtime";

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
      "Read one evidence-backed organization-scoped daily, weekly, or custom executive desk briefing across the durable executive decision register, correspondence, calendar, commitments, deadlines, document gaps, relationship touchpoints, calls, current travel operations including evidenced cancellations and voids, explicit working preferences, expenses, visitors, absence coverage, delegated work and Secretary-owned follow-through.",
    permissions: [],
    events: ["platform.secretary_briefing.read"],
    tags: ["platform", "secretary", "executive-secretary", "briefing", "daily", "weekly", "decisions", "commitments", "travel", "preferences", "read"],
    operatorAliases: [
      "brief me",
      "give me my morning briefing",
      "what do I need to know today",
      "secretary brief me for today",
      "what needs my attention today",
      "give me my desk briefing",
      "give me my daily executive briefing",
      "give me my weekly executive briefing",
      "what needs my attention this week",
    ],
    operatorExamples: [
      "brief me",
      "give me my morning briefing",
      "what do I need to know today",
      "give me my weekly executive briefing",
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
        cadence: { type: "string", enum: ["DAILY", "WEEKLY", "CUSTOM"] },
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
    return readSecretaryExecutiveBriefingV6({ context, payload });
  }

  return { manifest, authorize, execute };
}

export default createSecretaryExecutiveBriefingCapability;

import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { readOperatorTime } from "@/lib/platform/research/runtime/OperatorTimeRuntime";

export function createOperatorTimeCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "time",
    action: "read",
    name: "Current Time",
    document: "time_evidence",
    description: "Read the current local time and date for a requested place or timezone. This is deterministic read-only current information and never authorizes an action.",
    permissions: [],
    events: [],
    tags: ["platform", "time", "timezone", "current-information", "read", "deterministic"],
    operatorAliases: ["current time", "time now", "local time", "what time is it", "time in", "current local time"],
    operatorExamples: ["What time is it in New York now?", "Current time in Singapore", "What's the local time in London?"],
    transactional: false,
    aiEnabled: false,
    operatorEnabled: true,
    operatorMode: "read",
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: "low",
    reversible: true,
    inputSchema: {
      type: "object",
      required: ["location"],
      properties: {
        location: { type: "string", maxLength: 240, description: "City, area, country, or place whose local time should be read." },
        timezone: { type: "string", maxLength: 120, description: "Optional trusted IANA timezone when already known." },
        locale: { type: "string", maxLength: 80 },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
  });
  function authorize({ context }) {
    return Boolean(String(context?.organizationId || context?.organization_id || "").trim());
  }
  async function execute({ payload = {} }) {
    return readOperatorTime({ payload });
  }
  return { manifest, authorize, execute };
}

export default createOperatorTimeCapability;

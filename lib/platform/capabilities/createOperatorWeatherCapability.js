import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { readOperatorWeather } from "@/lib/platform/research/runtime/OperatorWeatherRuntime";

export function createOperatorWeatherCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "weather",
    action: "read",
    name: "Current Weather",
    document: "weather_evidence",
    description: "Read current weather and today's forecast for a requested location from a deterministic public weather provider. This is read-only current external evidence and never authorizes an action.",
    permissions: [],
    events: [],
    tags: ["platform", "weather", "forecast", "temperature", "rain", "current-information", "external-evidence", "read", "deterministic"],
    operatorAliases: ["weather today", "current weather", "weather forecast", "temperature today", "is it raining", "rain today", "forecast today"],
    operatorExamples: ["What's the weather in Phuket today?", "How hot is it in Bangkok right now?", "Will it rain in Singapore today?"],
    transactional: false,
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: "read",
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: "low",
    reversible: true,
    inputSchema: {
      type: "object",
      properties: {
        location: { type: "string", maxLength: 240, description: "City, area, or place whose current weather should be read." },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "object", additionalProperties: true },
  });
  function authorize({ context }) {
    return Boolean(String(context?.organizationId || context?.organization_id || "").trim());
  }
  async function execute({ payload = {} }) {
    return readOperatorWeather({ payload });
  }
  return { manifest, authorize, execute };
}

export default createOperatorWeatherCapability;

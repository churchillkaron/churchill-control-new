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
        latitude: { type: "number", minimum: -90, maximum: 90, description: "Trusted device latitude when the user explicitly chooses their current location." },
        longitude: { type: "number", minimum: -180, maximum: 180, description: "Trusted device longitude when the user explicitly chooses their current location." },
        location_label: { type: "string", maxLength: 160 },
        location_accuracy_m: { type: "number", minimum: 0, description: "Browser-reported accuracy radius in metres for the user-approved device location." },
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

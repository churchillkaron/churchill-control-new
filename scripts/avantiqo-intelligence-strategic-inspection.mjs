import {
  getAvantiqoIntelligenceEndpointHealth,
  AvantiqoIntelligenceProvider,
} from "../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js";

function text(value) {
  return String(value ?? "").trim();
}
function n(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
function parseJson(value) {
  try {
    const parsed = JSON.parse(text(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const health = await getAvantiqoIntelligenceEndpointHealth();
console.log(`AVANTIQO_STRATEGIC_INSPECTION_HEALTH running=${n(health?.workers?.running)} idle=${n(health?.workers?.idle)} queue=${n(health?.jobs?.inQueue)} in_progress=${n(health?.jobs?.inProgress)}`);
if (n(health?.workers?.running) + n(health?.workers?.idle) < 1 || n(health?.jobs?.inQueue) > 0 || n(health?.jobs?.inProgress) > 0) {
  throw new Error("AVANTIQO_STRATEGIC_INSPECTION_ENDPOINT_NOT_QUIESCENT");
}

const startedAt = Date.now();
const response = await AvantiqoIntelligenceProvider.execute({
  messages: [
    {
      role: "system",
      content: "Return only one JSON object with exactly these keys: decision (string), rationale (string), next_steps (array of strings). Do not invent evidence. The first management move must explicitly acknowledge that guest-count evidence is missing.",
    },
    {
      role: "user",
      content: "A restaurant has falling dinner revenue, stable lunch revenue, rising food cost, and no evidence yet about guest count. Decide the first management move without inventing facts.",
    },
  ],
  temperature: 0,
  max_output_tokens: 1400,
  request_timeout_ms: 120000,
  response_format: { type: "json_object" },
  context: {
    organization_id: "benchmark-organization",
    organization_service_id: "benchmark-service",
    usage_id: "strategic-inspection",
  },
});

const content = text(response?.output?.text);
const parsed = parseJson(content);
const safeShape = parsed
  ? {
      keys: Object.keys(parsed),
      decision_type: typeof parsed.decision,
      rationale_type: typeof parsed.rationale,
      next_steps_type: Array.isArray(parsed.next_steps) ? "array" : typeof parsed.next_steps,
      next_steps_count: Array.isArray(parsed.next_steps) ? parsed.next_steps.length : 0,
      acknowledges_missing_guest_count: /guest.{0,20}(count|traffic)|count.{0,20}guest|missing.{0,30}(guest|count)|no evidence/i.test(`${text(parsed.decision)} ${text(parsed.rationale)} ${JSON.stringify(parsed.next_steps || "")}`),
    }
  : { parseable_json: false, sanitized_final_preview: content.slice(0, 1800) };

console.log(`AVANTIQO_STRATEGIC_INSPECTION latency_ms=${Date.now() - startedAt} input_tokens=${Number(response?.usage?.input_tokens || 0)} output_tokens=${Number(response?.usage?.output_tokens || 0)} finish_reason=${response?.output?.finish_reason || "unknown"}`);
console.log(JSON.stringify(safeShape));
if (!parsed || typeof parsed.decision !== "string" || typeof parsed.rationale !== "string" || !Array.isArray(parsed.next_steps) || parsed.next_steps.length < 1 || safeShape.acknowledges_missing_guest_count !== true) {
  throw new Error("AVANTIQO_STRATEGIC_INSPECTION_SEMANTIC_CONTRACT_FAILED");
}
console.log("AVANTIQO_STRATEGIC_INSPECTION=PASS");

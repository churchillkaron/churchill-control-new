const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED", "CANCELED", "TIMED_OUT"]);
const DIAGNOSTIC_FINGERPRINTS = [
  "Reply with the single word READY.",
  "avantiqo-intelligence-v1",
  "Call avantiqo_probe with status set to ok.",
  "falling dinner revenue",
  "analytics.revenue.read",
  "Memory says the owner approved paying Vendor A last week",
];

function text(value) {
  return String(value ?? "").trim();
}

function statusOf(value = {}) {
  return text(value.status || value.state).toUpperCase();
}

function collectRequestObjects(value, output = [], seen = new Set(), depth = 0) {
  if (!value || typeof value !== "object" || seen.has(value) || depth > 8) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectRequestObjects(item, output, seen, depth + 1);
    return output;
  }
  const id = text(value.id || value.jobId || value.job_id || value.requestId || value.request_id);
  if (id && (value.status || value.state || value.input || value.request || value.payload)) {
    output.push(value);
  }
  for (const child of Object.values(value)) {
    collectRequestObjects(child, output, seen, depth + 1);
  }
  return output;
}

function isKnownDiagnostic(request) {
  let serialized = "";
  try {
    serialized = JSON.stringify(
      request.input || request.request || request.payload || request.body || request,
    );
  } catch {
    serialized = "";
  }
  return DIAGNOSTIC_FINGERPRINTS.some((fingerprint) => serialized.includes(fingerprint));
}

const endpointId = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID);
const apiKey = text(process.env.RUNPOD_API_KEY);
if (!endpointId) throw new Error("RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID_REQUIRED");
if (!apiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  if (!response.ok) {
    throw new Error(`RUNPOD_DIAGNOSTIC_REQUEST_CLEANUP_FAILED:${response.status}:${text(raw).slice(0, 500)}`);
  }
  return body;
}

const recent = await requestJson(`${RUNPOD_API_BASE}/${endpointId}/requests`);
const requests = collectRequestObjects(recent);
const candidates = requests.filter((request) => {
  const status = statusOf(request);
  return !TERMINAL.has(status) && isKnownDiagnostic(request);
});

console.log(
  `AVANTIQO_DIAGNOSTIC_REQUEST_SCAN request_objects=${requests.length} cancel_candidates=${candidates.length}`,
);

let cancelled = 0;
for (const request of candidates) {
  const id = text(request.id || request.jobId || request.job_id || request.requestId || request.request_id);
  if (!id) continue;
  const result = await requestJson(`${RUNPOD_API_BASE}/${endpointId}/cancel/${encodeURIComponent(id)}`, {
    method: "POST",
  });
  const state = statusOf(result) || "UNKNOWN";
  console.log(`AVANTIQO_DIAGNOSTIC_REQUEST_CANCELLED state=${state}`);
  cancelled += 1;
}

console.log(`AVANTIQO_DIAGNOSTIC_REQUEST_CLEANUP cancelled=${cancelled}`);
console.log("AVANTIQO_INTELLIGENCE_DIAGNOSTIC_REQUEST_CLEANUP=PASS");

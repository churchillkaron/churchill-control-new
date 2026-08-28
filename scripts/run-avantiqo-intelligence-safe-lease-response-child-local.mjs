import { createHash } from "node:crypto";
import https from "node:https";

const CONTRACT = "AVANTIQO_INTELLIGENCE_SAFE_LEASE_RESPONSE_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const ALLOWED_LANES = Object.freeze({
  "intelligence-fast": "Qwen/Qwen3-30B-A3B-Instruct-2507",
  "intelligence-fast-candidate": "Qwen/Qwen3-30B-A3B-Instruct-2507",
  "intelligence-deep": "Qwen/Qwen3-30B-A3B-Thinking-2507",
});
const RESPONSE_TIMEOUT_MS = boundedInteger(
  process.env.AVANTIQO_INTELLIGENCE_SAFE_LEASE_RESPONSE_TIMEOUT_MS,
  360_000,
  60_000,
  600_000,
);
const HEALTH_TIMEOUT_MS = 15_000;
const FAST_MAX_OUTPUT_TOKENS = 64;
const DEEP_MAX_OUTPUT_TOKENS = 1024;
const QWEN3_THINKING_TEMPERATURE = 0.6;
const QWEN3_THINKING_TOP_P = 0.95;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function required(name) {
  const value = text(process.env[name], 8000);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function sha256(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function redact(value) {
  return text(value, 1600)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

function parseResponse(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function assertSuccessfulJson(statusCode, parsed, raw) {
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(
      `${CONTRACT}_HTTP_${statusCode}:${redact(parsed?.error?.message || parsed?.message || raw)}`,
    );
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`${CONTRACT}_INVALID_JSON_RESPONSE`);
  }
  return parsed;
}

function nativeJsonRequest(
  url,
  apiKey,
  { method = "GET", body = null, timeoutMs = HEALTH_TIMEOUT_MS } = {},
) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : "";
    const target = new URL(url);
    let timer = null;
    let settled = false;

    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(error);
    };
    const finishResolve = (value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(value);
    };

    const request = https.request(target, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        ...(payload ? {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        } : {}),
      },
    }, (response) => {
      let raw = "";
      let receivedBytes = 0;
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        receivedBytes += Buffer.byteLength(chunk);
        if (receivedBytes > MAX_RESPONSE_BYTES) {
          request.destroy(new Error(`${CONTRACT}_RESPONSE_TOO_LARGE`));
          return;
        }
        raw += chunk;
      });
      response.on("end", () => {
        try {
          finishResolve(assertSuccessfulJson(
            Number(response.statusCode || 0),
            parseResponse(raw),
            raw,
          ));
        } catch (error) {
          finishReject(error);
        }
      });
      response.on("error", (error) => {
        finishReject(
          new Error(`${CONTRACT}_NATIVE_HTTPS_RESPONSE_FAILED:${redact(error?.message)}`),
        );
      });
    });

    request.on("error", (error) => {
      finishReject(new Error(`${CONTRACT}_NATIVE_HTTPS_FAILED:${redact(error?.message)}`));
    });
    timer = setTimeout(() => {
      request.destroy(new Error(`${CONTRACT}_NATIVE_HTTPS_DEADLINE_EXCEEDED:${timeoutMs}`));
    }, timeoutMs);
    if (payload) request.write(payload);
    request.end();
  });
}

function healthJobs(body = {}) {
  const jobs = body?.jobs || {};
  return {
    in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
    in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
  };
}

function completionText(body = {}) {
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => typeof part === "string" ? part : text(part?.text, 4000))
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

function reasoningTransportDetected(body = {}) {
  const message = body?.choices?.[0]?.message || {};
  return Boolean(text(message.reasoning_content || message.reasoning, 1));
}

function assertSafeLease() {
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE, 40).toUpperCase() !== "YES") {
    throw new Error(`${CONTRACT}_SAFE_LEASE_ACTIVE_REQUIRED`);
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT, 120) !== SAFE_LEASE_CONTRACT) {
    throw new Error(`${CONTRACT}_SAFE_LEASE_V2_REQUIRED`);
  }
  const lane = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE, 120);
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_LANES, lane)) {
    throw new Error(`${CONTRACT}_INTELLIGENCE_LANE_REQUIRED:${lane || "NONE"}`);
  }
  if (text(process.env.AVANTIQO_INTELLIGENCE_SAFE_LEASE_RESPONSE_SPEND_APPROVED, 40).toUpperCase() !== "YES") {
    throw new Error(`${CONTRACT}_SPEND_APPROVAL_REQUIRED`);
  }
  return lane;
}

const lane = assertSafeLease();
const endpointId = required("AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID");
const apiKey = text(process.env.RUNPOD_API_KEY, 8000) || required("RUNPOD_MANAGEMENT_API_KEY");
const expectedModel = ALLOWED_LANES[lane];
const deepThinking = lane === "intelligence-deep";
const maxOutputTokens = deepThinking ? DEEP_MAX_OUTPUT_TOKENS : FAST_MAX_OUTPUT_TOKENS;
const temperature = deepThinking ? QWEN3_THINKING_TEMPERATURE : 0;
const topP = deepThinking ? QWEN3_THINKING_TOP_P : null;
const samplingPolicy = deepThinking ? "QWEN3_THINKING_2507_RECOMMENDED" : "FAST_CERTIFICATION_DETERMINISTIC";
const base = `https://api.runpod.ai/v2/${encodeURIComponent(endpointId)}`;

const beforeHealth = await nativeJsonRequest(
  `${base}/health`,
  apiKey,
  { timeoutMs: HEALTH_TIMEOUT_MS },
);
const beforeJobs = healthJobs(beforeHealth);
if (beforeJobs.in_queue !== 0 || beforeJobs.in_progress !== 0) {
  throw new Error(
    `${CONTRACT}_ZERO_JOB_BASELINE_REQUIRED:in_queue=${beforeJobs.in_queue}:in_progress=${beforeJobs.in_progress}`,
  );
}

const modelStartedAt = Date.now();
const models = await nativeJsonRequest(
  `${base}/openai/v1/models`,
  apiKey,
  { timeoutMs: RESPONSE_TIMEOUT_MS },
);
const modelIds = Array.isArray(models?.data)
  ? models.data.map((entry) => text(entry?.id, 300)).filter(Boolean)
  : [];
if (!modelIds.includes(expectedModel)) {
  throw new Error(
    `${CONTRACT}_EXPECTED_MODEL_NOT_SERVED:lane=${lane}:expected=${expectedModel}:served=${modelIds.join(",") || "NONE"}`,
  );
}
const modelRouteLatencyMs = Date.now() - modelStartedAt;

const requestBody = {
  model: expectedModel,
  messages: [
    {
      role: "system",
      content: "You are the self-hosted Avantiqo Intelligence route certification probe. Give one short direct answer only.",
    },
    {
      role: "user",
      content: "Reply with a short statement that confirms the intelligence route is responsive.",
    },
  ],
  temperature,
  ...(topP === null ? {} : { top_p: topP }),
  max_tokens: maxOutputTokens,
};

const generationStartedAt = Date.now();
const completion = await nativeJsonRequest(
  `${base}/openai/v1/chat/completions`,
  apiKey,
  {
    method: "POST",
    body: requestBody,
    timeoutMs: RESPONSE_TIMEOUT_MS,
  },
);
const generationLatencyMs = Date.now() - generationStartedAt;
const responseModel = text(completion?.model, 300) || expectedModel;
const output = completionText(completion);
const reasoningDetected = reasoningTransportDetected(completion);
const finishReason = text(completion?.choices?.[0]?.finish_reason, 120) || null;
const completionTokens = finite(completion?.usage?.completion_tokens, 0);
if (!output) {
  throw new Error(
    `${CONTRACT}_EMPTY_FINAL_COMPLETION:reasoning_transport_detected=${reasoningDetected}:finish_reason=${finishReason || "NONE"}:completion_tokens=${completionTokens}`,
  );
}
if (responseModel !== expectedModel) {
  throw new Error(`${CONTRACT}_MODEL_MISMATCH:expected=${expectedModel}:actual=${responseModel}`);
}

const afterHealth = await nativeJsonRequest(
  `${base}/health`,
  apiKey,
  { timeoutMs: HEALTH_TIMEOUT_MS },
);
const afterJobs = healthJobs(afterHealth);
if (afterJobs.in_queue > 1 || afterJobs.in_progress > 1) {
  throw new Error(
    `${CONTRACT}_JOB_BOUND_EXCEEDED:in_queue=${afterJobs.in_queue}:in_progress=${afterJobs.in_progress}`,
  );
}

const result = {
  success: true,
  contract: CONTRACT,
  safe_lease_contract: SAFE_LEASE_CONTRACT,
  safe_lease_active: true,
  lane,
  provider: "avantiqo-intelligence",
  execution_route: deepThinking ? "deep" : "fast",
  expected_model: expectedModel,
  response_model: responseModel,
  sampling_policy: samplingPolicy,
  temperature,
  top_p: topP,
  response_transport: "NODE_HTTPS_ALL_ROUTES_ABSOLUTE_DEADLINE_V1",
  response_timeout_ms: RESPONSE_TIMEOUT_MS,
  ambiguous_timeout_retry_performed: false,
  model_route_latency_ms: modelRouteLatencyMs,
  generation_latency_ms: generationLatencyMs,
  generation_submitted: true,
  approved_generation_count: 1,
  max_output_tokens: maxOutputTokens,
  completion_tokens: completionTokens,
  finish_reason: finishReason,
  reasoning_transport_detected: reasoningDetected,
  response_chars: output.length,
  response_sha256: sha256(output),
  raw_response_persisted: false,
  raw_reasoning_persisted: false,
  direct_endpoint_scaling_performed: false,
  workers_max_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
  health_after_response: afterJobs,
};

console.log(JSON.stringify(result, null, 2));
console.log(`${CONTRACT}=PASS`);

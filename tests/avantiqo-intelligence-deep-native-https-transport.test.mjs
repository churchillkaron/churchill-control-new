import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const providerSource = fs.readFileSync(
  new URL(
    "../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceDeepProvider.js",
    import.meta.url,
  ),
  "utf8",
);

function sourceBlock(startMarker, endMarker) {
  const start = providerSource.indexOf(startMarker);
  const end = providerSource.indexOf(endMarker, start);
  assert.ok(start >= 0, `missing source marker: ${startMarker}`);
  assert.ok(end > start, `missing source marker after ${startMarker}: ${endMarker}`);
  return providerSource.slice(start, end);
}

test("Deep production inference uses native HTTPS with an explicit absolute deadline", () => {
  const requestJsonSource = sourceBlock(
    "async function requestJson",
    "function normalizeMessages",
  );

  assert.match(providerSource, /import \{ request as httpsRequest \} from "node:https";/);
  assert.match(providerSource, /const DEFAULT_TIMEOUT_MS = 600000;/);
  assert.match(
    providerSource,
    /const DEEP_HTTP_TRANSPORT = "NODE_HTTPS_ABSOLUTE_DEADLINE_V1";/,
  );
  assert.match(requestJsonSource, /httpsRequest\(/);
  assert.doesNotMatch(requestJsonSource, /\bfetch\s*\(/);
  assert.match(
    requestJsonSource,
    /AVANTIQO_INTELLIGENCE_HTTP_DEADLINE_EXCEEDED:timeout_ms=/,
  );
});

test("Deep production inference caps response size and does not declare ambiguous retry", () => {
  const requestJsonSource = sourceBlock(
    "async function requestJson",
    "function normalizeMessages",
  );
  const runtimeConfigurationSource = sourceBlock(
    "export function getAvantiqoIntelligenceRuntimeConfiguration",
    "export async function probeAvantiqoIntelligenceRuntime",
  );

  assert.match(providerSource, /const MAX_RESPONSE_BYTES = 8 \* 1024 \* 1024;/);
  assert.match(
    requestJsonSource,
    /AVANTIQO_INTELLIGENCE_RESPONSE_TOO_LARGE:max_bytes=/,
  );
  assert.doesNotMatch(requestJsonSource, /\bfor\s*\([^)]*(?:retry|attempt)/i);
  assert.doesNotMatch(requestJsonSource, /\bwhile\s*\([^)]*(?:retry|attempt)/i);
  assert.match(runtimeConfigurationSource, /transport_ambiguous_retry: false/);
});

test("Deep transport hardening preserves Qwen3 Thinking and Safe Lease contracts", () => {
  assert.match(providerSource, /const QWEN3_THINKING_TEMPERATURE = 0\.6;/);
  assert.match(providerSource, /const QWEN3_THINKING_TOP_P = 0\.95;/);
  assert.match(
    providerSource,
    /AVANTIQO_INTELLIGENCE_SAFE_LEASE_ENDPOINT_REQUIRED/,
  );
  assert.match(providerSource, /raw_reasoning_persisted: false/);
});

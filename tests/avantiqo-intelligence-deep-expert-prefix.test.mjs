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

test("Deep production inference prepends the cache-stable expert prefix", () => {
  assert.match(
    providerSource,
    /from "\.\.\/\.\.\/\.\.\/\.\.\/intelligence\/runtime\/AvantiqoExpertPrefixRuntime\.js"/,
  );
  const prepareSource = sourceBlock(
    "function prepareInferenceMessages",
    "function normalizedUsage",
  );
  assert.match(prepareSource, /prependAvantiqoExpertPrefix\(messages, input\)/);
  assert.match(prepareSource, /expert_prefix === false/);
});

test("Deep transport probes explicitly bypass specialist expert prefixing", () => {
  const probeSource = sourceBlock(
    "export async function probeAvantiqoIntelligenceRuntime",
    "export const AvantiqoIntelligenceProvider",
  );
  const bypasses = probeSource.match(/expert_prefix:\s*false/g) || [];
  assert.equal(bypasses.length, 2);
});

test("Deep execute publishes safe expert-prefix observability without raw prefix text", () => {
  const executeSource = sourceBlock(
    "async execute(input = {})",
    "probe: probeAvantiqoIntelligenceRuntime",
  );
  assert.match(executeSource, /buildAvantiqoExpertPrefix\(input\)/);
  assert.match(executeSource, /expert_prefix:/);
  assert.match(executeSource, /fingerprint: expertPrefix\.fingerprint/);
  assert.match(executeSource, /domain: expertPrefix\.domain/);
  assert.doesNotMatch(executeSource, /content: expertPrefix\.content/);
});

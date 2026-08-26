import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const fastSource = fs.readFileSync(
  new URL(
    "../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceFastProvider.js",
    import.meta.url,
  ),
  "utf8",
);
const deepSource = fs.readFileSync(
  new URL(
    "../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceDeepProvider.js",
    import.meta.url,
  ),
  "utf8",
);

function assertLeaseBoundInference(source, label) {
  assert.match(source, /function leasedEndpointId\(input = \{\}\)/, `${label} lease endpoint helper`);
  assert.match(source, /context\.intelligence_safe_lease_endpoint_id/, `${label} lease context key`);
  assert.match(source, /async function config\(input = \{\}\)/, `${label} input-aware config`);
  assert.match(source, /const endpointId = await resolveEndpointId\(input\)/, `${label} leased endpoint resolution`);
  assert.match(source, /const \{ baseUrl, apiKey \} = await config\(input\)/, `${label} chat transport uses leased endpoint`);
  assert.match(source, /SAFE_LEASE_ENDPOINT_REQUIRED/, `${label} inference fails closed without lease endpoint`);
}

test("Fast and Deep inference bind transport to the Safe Lease endpoint", () => {
  assertLeaseBoundInference(fastSource, "Fast");
  assertLeaseBoundInference(deepSource, "Deep");
});

test("Deep legacy completion probe cannot bypass Safe Lease endpoint binding", () => {
  assert.match(
    deepSource,
    /export async function probeAvantiqoIntelligenceRuntime\([\s\S]*?input = \{\}[\s\S]*?SAFE_LEASE_ENDPOINT_REQUIRED/,
  );
  assert.match(deepSource, /const health = providedHealth \|\| await endpointHealth\(\{ input \}\)/);
  assert.match(deepSource, /const response = await chatCompletion\(\{\s*\.\.\.input,/);
  assert.match(deepSource, /const toolResponse = await chatCompletion\(\{\s*\.\.\.input,/);
});

test("health-only endpoint reads remain available without creating inference authority", () => {
  assert.match(fastSource, /export async function getAvantiqoIntelligenceFastEndpointHealth\(\) \{\s*return endpointHealth\(\);/);
  assert.match(deepSource, /export async function getAvantiqoIntelligenceEndpointHealth\(\) \{\s*return endpointHealth\(\);/);
});

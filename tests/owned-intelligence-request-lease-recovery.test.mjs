import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SOURCE = new URL(
  "../lib/platform/service-runtime/execution/OwnedIntelligenceRequestLeaseRuntime.js",
  import.meta.url,
);

async function source() {
  return readFile(SOURCE, "utf8");
}

test("Intelligence acquires the distributed lane lease before orphan endpoint normalization", async () => {
  const code = await source();
  const functionStart = code.indexOf("export async function withOwnedIntelligenceRequestLease");
  const acquire = code.indexOf("const lease = await acquireDistributed", functionStart);
  const normalize = code.indexOf("await normalizeOwnedRestingEndpoint", functionStart);

  assert.ok(functionStart >= 0, "request lease runtime export must exist");
  assert.ok(acquire > functionStart, "distributed lease acquisition must exist");
  assert.ok(normalize > acquire, "orphan normalization must happen only after lease ownership");
});

test("Intelligence refuses orphan cleanup while provider queue work is present", async () => {
  const code = await source();
  const normalizeStart = code.indexOf("async function normalizeOwnedRestingEndpoint");
  const normalizeEnd = code.indexOf("\nfunction normalizeLane", normalizeStart);
  const normalize = code.slice(normalizeStart, normalizeEnd);

  assert.match(normalize, /health\.inQueue !== 0 \|\| health\.inProgress !== 0/);
  assert.match(normalize, /AVANTIQO_INTELLIGENCE_REQUEST_LEASE_QUEUE_NOT_EMPTY/);
  assert.ok(
    normalize.indexOf("QUEUE_NOT_EMPTY") < normalize.indexOf("parkAndVerify"),
    "queue guard must run before orphan parking",
  );
});

test("Intelligence cleanup is armed before opening RunPod capacity", async () => {
  const code = await source();
  const functionStart = code.indexOf("export async function withOwnedIntelligenceRequestLease");
  const armCleanup = code.indexOf("endpointOpened = true", functionStart);
  const openCapacity = code.indexOf("await patchWorkers(endpointId, 1, config)", functionStart);

  assert.ok(armCleanup > functionStart, "cleanup guard must be armed");
  assert.ok(openCapacity > armCleanup, "cleanup must be armed before workersMax=1 mutation");
});

test("Intelligence scales RunPod through the endpoint update contract", async () => {
  const code = await source();
  const patchStart = code.indexOf("async function patchWorkers");
  const patchEnd = code.indexOf("\nasync function acquireDistributed", patchStart);
  const patch = code.slice(patchStart, patchEnd);

  assert.ok(patchStart >= 0 && patchEnd > patchStart, "RunPod scaler function must exist");
  assert.match(
    patch,
    /rest\(`\/endpoints\/\$\{encodeURIComponent\(endpointId\)\}\/update`,\s*\{\s*method:\s*"POST"/s,
  );
  assert.doesNotMatch(patch, /method:\s*"PATCH"/);
  assert.match(patch, /body:\s*\{ workersMin:\s*0, workersMax \}/);
});

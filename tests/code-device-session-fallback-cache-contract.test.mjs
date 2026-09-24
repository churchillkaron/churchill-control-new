import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/code/runtime/CodeWorkspaceRuntime.js", import.meta.url), "utf8");

test("device session fallback cache is exact-keyed and bounded", () => {
  assert.match(source, /DEVICE_SESSION_FALLBACK_TTL_MS = 5 \* 60 \* 1000/);
  assert.match(source, /organizationId.*deviceId.*sessionId/s);
  assert.match(source, /deviceSessionFallbackCache\.set\(key/);
  assert.match(source, /Date\.now\(\) > Number\(cached\.expires_at/);
});

test("healthy control plane remains authoritative and fallback is transient-only", () => {
  assert.match(source, /workspace = await runtime\.attach\(input\);\s*rememberDeviceWorkspace\(input, workspace\)/s);
  assert.match(source, /if \(transientDeviceControlPlaneFailure\(error\)\)/);
  assert.match(source, /const cached = cachedDeviceWorkspace\(input\)/);
  assert.match(source, /if \(cached\) \{\s*workspace = cached/s);
});

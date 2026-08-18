import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const RESOLVER = "lib/creative/services/CreativeServiceResolver.js";

test("Creative task execution requires explicit configured service identity", async () => {
  const source = await fs.readFile(RESOLVER, "utf8");

  assert.doesNotMatch(source, /SERVICE_BY_TASK_TYPE/);
  assert.doesNotMatch(
    source,
    /GENERATE_(?:IMAGE|VIDEO|VOICE|MUSIC|SFX)[\s\S]*ai\./,
  );
  assert.match(source, /task\.service_id\s*\|\|\s*task\.service_code/);
  assert.match(source, /CREATIVE_TASK_EXPLICIT_SERVICE_REQUIRED/);
  assert.match(source, /resolveServiceCapabilities\(serviceId\)/);
  assert.match(source, /CREATIVE_TASK_CAPABILITY_UNAVAILABLE/);
});

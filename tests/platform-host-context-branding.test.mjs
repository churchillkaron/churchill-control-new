import assert from "node:assert/strict";
import test from "node:test";

import { resolvePlatformHostContext } from "../lib/platform/context/resolvePlatformHostContext.js";

test("Avantiqo platform host keeps Avantiqo branding", () => {
  const context = resolvePlatformHostContext("avantiqo.ai");
  assert.equal(context.id, "avantiqo");
  assert.equal(context.name, "Avantiqo");
});

test("Churchill customer hosts keep Churchill branding", () => {
  for (const hostname of ["churchillkaron.com", "app.churchillkaron.com"]) {
    const context = resolvePlatformHostContext(hostname);
    assert.equal(context.id, "churchill");
    assert.equal(context.name, "Churchill");
  }
});

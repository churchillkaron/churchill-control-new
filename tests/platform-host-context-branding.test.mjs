import assert from "node:assert/strict";
import test from "node:test";

import { resolvePlatformHostContext } from "../lib/platform/context/resolvePlatformHostContext.js";

test("platform app host keeps Avantiqo branding", () => {
  const context = resolvePlatformHostContext("app.churchillkaron.com");
  assert.equal(context.id, "avantiqo");
  assert.equal(context.name, "Avantiqo");
});

test("Churchill public host keeps Churchill branding", () => {
  const context = resolvePlatformHostContext("churchillkaron.com");
  assert.equal(context.id, "churchill");
  assert.equal(context.name, "Churchill");
});

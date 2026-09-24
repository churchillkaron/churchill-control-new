import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("retired HTTP owned-media certification routes stay retired", () => {
  for (const route of [
    "app/api/internal/avantiqo-owned-media-certification-v1/route.js",
    "app/api/internal/avantiqo-owned-media-capability-certification-v1/route.js",
  ]) assert.equal(fs.existsSync(route), false, route);
});

test("current local certification is CLI-only and cannot authorize production", () => {
  const core=fs.readFileSync("scripts/certify-avantiqo-owned-media-core-local.mjs","utf8");
  assert.match(core,/production_certified: false/);
  assert.match(core,/production_activation_performed: false/);
  assert.match(core,/production_deploy_performed: false/);
  assert.match(core,/fail_closed: true/);
});

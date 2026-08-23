import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("owned media certification requires env-backed header or bearer token", () => {
  for (const relativePath of [
    "app/api/internal/avantiqo-owned-media-certification-v1/route.js",
    "app/api/internal/avantiqo-owned-media-capability-certification-v1/route.js",
  ]) {
    const route = source(relativePath);
    assert.match(route, /process\.env\.AVANTIQO_OWNED_CERTIFICATION_TOKEN/);
    assert.match(route, /AVANTIQO_OWNED_CERTIFICATION_TOKEN_REQUIRED/);
    assert.match(route, /x-avantiqo-certification-token/);
    assert.match(route, /authorization/);
    assert.match(route, /CERTIFICATION_UNAUTHORIZED/);
    assert.doesNotMatch(route, /AVANTIQO_OWNED_CERTIFICATION_TOKEN\s*\|\|\s*["']/);
    assert.doesNotMatch(route, /[?&]token=/);
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("legacy Operations work-control route preserves exact Pest Control work order context", async () => {
  const route = await source("app/(system)/workspace/[organizationId]/operations/work-control/page.jsx");
  assert.match(route, /operations\/field-service\/work-control/);
  assert.match(route, /workOrderId/);
  assert.match(route, /redirect\(/);
});

test("corrective control work-order actions have a governed compatibility destination", async () => {
  const corrective = await source("app/(system)/workspace/[organizationId]/operations/field-service/corrective-control/page.jsx");
  assert.match(corrective, /operations\/work-control\?workOrderId=/);
});

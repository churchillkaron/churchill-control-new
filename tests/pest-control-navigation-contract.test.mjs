import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dispatchPagePath = new URL("../app/(system)/workspace/[organizationId]/operations/dispatch/page.jsx", import.meta.url);
const workOrdersPagePath = new URL("../app/(system)/workspace/[organizationId]/operations/work-orders/page.jsx", import.meta.url);
const dispatchControlPath = new URL("../components/workspace/operations/pest-control/PestControlDispatchControl.jsx", import.meta.url);
const workControlPath = new URL("../components/workspace/operations/pest-control/PestControlWorkControl.jsx", import.meta.url);

async function source(path) {
  return readFile(path, "utf8");
}

test("canonical dispatch renders Pest Control dispatch for installed solution", async () => {
  const page = await source(dispatchPagePath);
  assert.match(page, /organizationHasIndustrySolution/);
  assert.match(page, /solutionId:\s*"pest-control"/);
  assert.match(page, /<PestControlDispatchControl organizationId=\{organizationId\}/);
  assert.match(page, /<OperationsRuntimeWorkCenter capability=\{capability\}/);
});

test("canonical work orders render governed Pest Control work control", async () => {
  const page = await source(workOrdersPagePath);
  assert.match(page, /organizationHasIndustrySolution/);
  assert.match(page, /solutionId:\s*"pest-control"/);
  assert.match(page, /<PestControlWorkControl organizationId=\{organizationId\}/);
  assert.match(page, /<OperationsRuntimeWorkCenter capability=\{capability\}/);
});

test("dispatch work-order decisions preserve exact work order identity", async () => {
  const dispatch = await source(dispatchControlPath);
  const workControl = await source(workControlPath);
  assert.match(dispatch, /workOrderId=\$\{encodeURIComponent\(row\.id\)\}/);
  assert.match(dispatch, /hrefFor\(organizationId,\s*"work-orders"\)/);
  assert.match(workControl, /new URLSearchParams\(window\.location\.search\)\.get\("workOrderId"\)/);
});

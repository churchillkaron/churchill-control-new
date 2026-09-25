import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("app/(system)/platform/page.jsx", "utf8");

test("platform admin usage sample does not fetch oversized usage metadata", () => {
  const usageQuery = source.match(/from\("platform_service_usage"\)\.select\("([^"]+)"\)/)?.[1] || "";
  assert.ok(usageQuery);
  assert.doesNotMatch(usageQuery, /\*/);
  assert.doesNotMatch(usageQuery, /metadata/);
  assert.match(usageQuery, /organization_id/);
  assert.match(usageQuery, /provider/);
  assert.match(usageQuery, /capability/);
  assert.match(usageQuery, /customer_price/);
  assert.match(usageQuery, /billing_status:invoice_status/);
  assert.match(usageQuery, /error:error_message/);
});

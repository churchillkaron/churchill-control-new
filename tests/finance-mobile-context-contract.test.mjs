import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../components/workspace/finance/FinanceShellNavigation.jsx", import.meta.url), "utf8");

test("Finance keeps accounting scope visible on mobile", () => {
  assert.match(source, /const organizationName = businessContext\.organization\?\.name \|\| null/);
  assert.match(source, /md:flex-nowrap/);
  assert.match(source, /order-3 flex w-full/);
  assert.match(source, />Org</);
  assert.match(source, />Entity</);
  assert.match(source, />Period</);
});

test("Finance mobile context includes organization, legal entity and accounting period values", () => {
  assert.match(source, /organizationName/);
  assert.match(source, /entityName/);
  assert.match(source, /currentPeriod/);
  assert.match(source, /overflow-x-auto/);
  assert.doesNotMatch(source, /hidden md:block[^\n]*organizationName/);
});

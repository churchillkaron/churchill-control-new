import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const layout = await readFile("app/(system)/workspace/[organizationId]/commercial/design/layout.jsx", "utf8");

test("Commercial Design owns normal document scrolling instead of clipping the viewport", () => {
  assert.match(layout, /min-h-\[calc\(100vh-112px\)\]/);
  assert.doesNotMatch(layout, /(?:^|[\s"'])h-\[calc\(100vh-112px\)\]/m);
  assert.doesNotMatch(layout, /overflow-hidden/);
});

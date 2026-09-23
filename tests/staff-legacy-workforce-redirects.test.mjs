import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const redirects = new Map([
  ["app/(workforce)/workforce/page.jsx", "/staff"],
  ["app/(workforce)/workforce/my-day/page.jsx", "/staff/my-day"],
  ["app/(workforce)/workforce/documents/page.jsx", "/staff/documents"],
  ["app/(workforce)/workforce/payroll/page.jsx", "/staff/earnings"],
  ["app/(workforce)/workforce/profile/page.jsx", "/staff/profile"],
  ["app/(workforce)/workforce/schedule/page.jsx", "/staff/schedule"],
  ["app/(workforce)/workforce/tasks/page.jsx", "/staff/my-day"],
  ["app/(workforce)/workforce/training/page.jsx", "/staff/training"],
  ["app/(workforce)/workforce/upload/page.jsx", "/staff/documents/upload"],
]);

test("legacy workforce Staff UI cannot render anymore", () => {
  const layout = fs.readFileSync("app/(workforce)/workforce/layout.jsx", "utf8");
  assert.doesNotMatch(layout, /bg-\[#030712\]|Open camera upload|navItems/);
});

for (const [file, target] of redirects) {
  test(`${file} redirects to ${target}`, () => {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /import \{ redirect \} from "next\/navigation"/);
    assert.equal(source.includes(`redirect("${target}")`), true);
  });
}

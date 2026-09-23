import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse } from "@babel/parser";

const page = fs.readFileSync("app/(system)/workspace/[organizationId]/page.jsx", "utf8");
const codePanel = fs.readFileSync("components/operator/BusinessPartnerCodeMissionPanel.jsx", "utf8");

test("organization home no longer masks dark Business Partner classes with global CSS", () => {
  parse(page, { sourceType: "module", plugins: ["jsx"] });
  assert.match(page, /data-avantiqo-home-page="light"/);
  assert.match(page, /background: #f7f6f3 !important/);
  assert.doesNotMatch(page, /\[class\*="text-white"\]/);
  assert.doesNotMatch(page, /\[class\*="border-white"\]/);
  assert.doesNotMatch(page, /\[class\*="bg-black"\]/);
});

test("Business Partner code mission composition explicitly uses its light compact surfaces", () => {
  parse(codePanel, { sourceType: "module", plugins: ["jsx"] });
  assert.match(codePanel, /theme="light"/);
  assert.match(codePanel, /CodeMissionHistoryPanel organizationId=\{organizationId\} compact/);
  assert.match(codePanel, /border-black\/\[0\.07\] bg-\[#FBFAF8\]/);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse } from "@babel/parser";

const page = fs.readFileSync("app/(system)/workspace/[organizationId]/page.jsx", "utf8");
const home = fs.readFileSync("components/operator/HomeAvantiqoIntelligence.jsx", "utf8");
const activeCodePanel = fs.readFileSync("components/operator/BusinessPartnerActiveCodeMissionPanel.jsx", "utf8");

test("organization home and Business Partner share the canonical light workspace surface", () => {
  parse(page, { sourceType: "module", plugins: ["jsx"] });
  parse(home, { sourceType: "module", plugins: ["jsx"] });
  assert.match(page, /data-avantiqo-home-page="light"/);
  assert.match(page, /bg-\[#F7F6F3\]/);
  assert.match(page, /border-black\/\[0\.08\] bg-white/);
  assert.match(home, /data-avantiqo-home-intelligence="true"/);
  assert.match(home, /border-black\/\[0\.08\] bg-white/);
  assert.match(home, /OperatorConversationText content=\{message\.content\} tone="light"/);
  assert.doesNotMatch(home, /border-white\/10|bg-black\/20|text-white\/80/);
});

test("active Business Partner Code mission surface uses the same light compact language", () => {
  parse(activeCodePanel, { sourceType: "module", plugins: ["jsx"] });
  assert.match(activeCodePanel, /data-avantiqo-business-partner-code-mission="true"/);
  assert.match(activeCodePanel, /border-black\/\[0\.07\] bg-\[#FBFAF8\]/);
  assert.match(activeCodePanel, /border-black\/\[0\.08\] bg-white/);
  assert.match(activeCodePanel, /text-\[#37332E\]/);
});

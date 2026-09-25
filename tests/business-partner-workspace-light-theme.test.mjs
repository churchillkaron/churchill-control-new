import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse } from "@babel/parser";

const source = fs.readFileSync("components/operator/HomeAvantiqoIntelligence.jsx", "utf8");

test("Business Partner matches the Avantiqo light workspace", () => {
  parse(source, { sourceType: "module", plugins: ["jsx"] });
  assert.match(source, /border-black\/\[0\.08\] bg-\[#FBF7F1\]/);
  assert.match(source, /border-black\/\[0\.07\] bg-white/);
  assert.match(source, /text-\[#4E4A44\]/);
  assert.match(source, /text-\[#D6A66A\]/);
  assert.match(source, /OperatorConversationText content=\{message\.content\} tone="light"/);
  assert.doesNotMatch(source, /bg-black\/(?:15|20|25|35)/);
  assert.doesNotMatch(source, /border-white\/10/);
  assert.doesNotMatch(source, /text-white\/(?:25|30|35|40|45|50|55|65|75|80|85)/);
});

test("Business Partner input uses the light Avantiqo workspace UI", () => {
  assert.match(source, /border-black\/\[0\.08\] bg-white/);
  assert.match(source, /text-\[#191919\].*placeholder:text-\[#A69F96\]/);
  assert.match(source, /bg-\[#D6A66A\].*text-black/);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse } from "@babel/parser";

const source = fs.readFileSync("components/operator/HomeAvantiqoIntelligence.jsx", "utf8");

test("Business Partner matches the light Avantiqo organization workspace", () => {
  parse(source, { sourceType: "module", plugins: ["jsx"] });
  assert.match(source, /border-black\/\[0\.075\] bg-white/);
  assert.match(source, /text-\[#191919\]/);
  assert.match(source, /text-\[#6C6963\]/);
  assert.match(source, /bg-\[#FBF7F1\]/);
  assert.match(source, /OperatorConversationText content=\{message\.content\} tone="light"/);
  assert.doesNotMatch(source, /bg-black\/(?:15|20|25)/);
  assert.doesNotMatch(source, /border-white\/10/);
});

test("Business Partner input remains light workspace UI", () => {
  assert.match(source, /border-black\/\[0\.09\] bg-white/);
  assert.match(source, /placeholder:text-\[#AAA69E\]/);
  assert.match(source, /bg-\[#2A2723\].*text-white/);
});

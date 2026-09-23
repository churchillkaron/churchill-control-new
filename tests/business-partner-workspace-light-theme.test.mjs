import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse } from "@babel/parser";

const source = fs.readFileSync("components/operator/HomeAvantiqoIntelligence.jsx", "utf8");

test("Business Partner matches the dark gold Avantiqo workspace", () => {
  parse(source, { sourceType: "module", plugins: ["jsx"] });
  assert.match(source, /border-white\/10 bg-white\/\[0\.03\]/);
  assert.match(source, /bg-black\/(?:15|20|25)/);
  assert.match(source, /text-\[#D6A66A\]/);
  assert.match(source, /text-white/);
});

test("Business Partner input uses the dark gold workspace UI", () => {
  assert.match(source, /border-white\/10 bg-black\/25/);
  assert.match(source, /placeholder:text-white\/25/);
  assert.match(source, /bg-\[#D6A66A\].*text-black/);
});

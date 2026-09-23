import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse } from "@babel/parser";

const dock = fs.readFileSync("components/operator/HomeAvantiqoIntelligenceDock.jsx", "utf8");
const artifacts = fs.readFileSync("components/operator/OperatorExecutionArtifacts.jsx", "utf8");

test("Business Partner dock stays in the light organization workspace language", () => {
  parse(dock, { sourceType: "module", plugins: ["jsx"] });
  assert.match(dock, /data-avantiqo-live-execution-panel="true"/);
  assert.match(dock, /bg-\[#FBF7F1\]/);
  assert.match(dock, /border-black\/\[0\.08\] bg-white/);
  assert.match(dock, /text-\[#4E4A44\]/);
  assert.doesNotMatch(dock, /bg-black\/(?:15|20|25|35)/);
  assert.doesNotMatch(dock, /border-white\/10/);
  assert.doesNotMatch(dock, /text-white\/(?:25|30|45|65|80)/);
});

test("Business Partner proof and artifact surfaces stay light", () => {
  parse(artifacts, { sourceType: "module", plugins: ["jsx"] });
  assert.match(artifacts, /data-avantiqo-business-diagnosis-proof="true"/);
  assert.match(artifacts, /data-avantiqo-universal-preview="true"/);
  assert.match(artifacts, /bg-\[#FBF7F1\]/);
  assert.match(artifacts, /border-black\/\[0\.07\] bg-white/);
  assert.match(artifacts, /bg-\[#FAF9F6\]/);
  assert.doesNotMatch(artifacts, /bg-black\/(?:15|20|25)/);
  assert.doesNotMatch(artifacts, /border-white\/10/);
  assert.doesNotMatch(artifacts, /text-white\/(?:30|35|40|45|50|60|65|70)/);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse } from "@babel/parser";

const source = fs.readFileSync("components/operator/AutonomousWatchAlertBridge.jsx", "utf8");

test("autonomous watch alert matches the light Business Partner workspace", () => {
  parse(source, { sourceType: "module", plugins: ["jsx"] });
  assert.match(source, /data-avantiqo-autonomous-watch-alert="true"/);
  assert.match(source, /bg-\[#FBF7F1\]/);
  assert.match(source, /text-\[#191919\]/);
  assert.match(source, /text-\[#6C6963\]/);
  assert.doesNotMatch(source, /bg-black\/25/);
  assert.doesNotMatch(source, /border-white\/10/);
  assert.doesNotMatch(source, /text-white\/(?:30|55|90)/);
});

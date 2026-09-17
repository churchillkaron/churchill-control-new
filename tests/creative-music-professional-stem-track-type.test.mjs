import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../lib/creative/music/runtime/CreativeMusicProfessionalStemRuntime.js", import.meta.url), "utf8");

test("Demucs other stem maps to a valid generic instrument track", () => {
  assert.match(source, /key === "other" \? "instrument"/);
  assert.doesNotMatch(source, /return key === "vocals" \? "vocal" : key;\s*\}/);
});

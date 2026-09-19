import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../lib/creative/assets/repositories/CreativeAssetRepository.js", import.meta.url), "utf8");

test("creative asset creation persists canonical project scope in both column and metadata", () => {
  assert.match(source, /creative_project_id:\s*projectId,/);
  assert.match(source, /metadata\s*=\s*\{[\s\S]*creative_project_id:\s*projectId/);
});

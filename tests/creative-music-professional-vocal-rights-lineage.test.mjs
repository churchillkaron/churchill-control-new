import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const route = fs.readFileSync(new URL("../app/api/creative/music/vocal-tuning-render/route.js", import.meta.url), "utf8");

test("professional restored vocal rights traversal follows the persisted parent asset", () => {
  assert.match(route, /metadata\.professional_vocal_parent_asset_id/);
  assert.match(route, /metadata\.professional_local_stem_source_asset_id/);
  assert.match(route, /metadata\.source_rights_attested === true/);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync("app/(system)/workspace/[organizationId]/creative/music/page.jsx", "utf8");
const workspace = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx", "utf8");

test("Music Studio can resume an exact project through the specialist route", () => {
  assert.match(page, /searchParams/);
  assert.match(page, /pageId: resolvedSearchParams\?\.project/);
  assert.match(workspace, /Recent projects/);
  assert.match(workspace, /creative\/music\?project=\$\{item\.id\}/);
  assert.match(workspace, /Resume an existing Music project/);
});

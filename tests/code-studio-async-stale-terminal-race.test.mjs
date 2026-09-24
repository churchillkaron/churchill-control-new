import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");

test("async Code resume ignores stale terminal progress from before the current ACK", () => {
  assert.match(ide, /const asyncProgressBaselineAt = taskStartedAt/);
  assert.match(ide, /const liveEventAt = Date\.parse\(text\(liveProgress\?\.latest_event\?\.at \|\| liveProgress\?\.updated_at\)\)/);
  assert.match(ide, /liveEventAt < asyncProgressBaselineAt/);
});

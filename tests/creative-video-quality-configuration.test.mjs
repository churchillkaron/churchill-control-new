import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";

const AUDIT = "scripts/audit-creative-video-quality-control-read-only.mjs";

test("Creative video quality remains configuration-driven", () => {
  const result = spawnSync(process.execPath, [AUDIT], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(
    result.status,
    0,
    [result.stdout, result.stderr].filter(Boolean).join("\n"),
  );
  assert.match(
    result.stdout,
    /CREATIVE_VIDEO_QUALITY_CONFIGURATION_AUDIT_V4/,
  );
});

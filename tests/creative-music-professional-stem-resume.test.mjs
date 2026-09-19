import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("lib/creative/music/runtime/CreativeMusicProfessionalStemRuntime.js", "utf8");

test("professional stems persist and settle one exact pending usage instead of resubmitting", () => {
  assert.match(source, /professional_stem_pending/);
  assert.match(source, /settlePendingService/);
  assert.match(source, /UsageRuntime\.get\(text\(pending\.usage_id\)\)/);
  assert.match(source, /resumed_existing_pending:Boolean\(pending\)/);
  assert.match(source, /if\(pending\)\{[\s\S]*settlePendingStem/);
});

test("professional stems are idempotent after durable completion", () => {
  assert.match(source, /professional_stems_ready===true/);
  assert.match(source, /idempotent_existing_completion:true/);
  assert.match(source, /professional_stems\.length>=2/);
});

test("failed pending stem settlement clears the pending lock", () => {
  assert.match(source, /professional_stem_pending:null/);
  assert.match(source, /professional_stem_last_failure/);
  assert.match(source, /failed_at:new Date\(\)\.toISOString\(\)/);
});

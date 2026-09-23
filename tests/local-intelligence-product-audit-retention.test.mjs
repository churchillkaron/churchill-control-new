import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260923062900_preserve_intelligence_product_audit_on_local_job_completion.sql",
  "utf8",
);

test("local job completion preserves non-sensitive intelligence product audit before scrubbing payload", () => {
  assert.match(migration, /'intelligence_product'/);
  assert.match(migration, /payload ->> 'intelligence_product'/);
  assert.match(migration, /'intelligence_contract'/);
  assert.match(migration, /payload ->> 'intelligence_contract'/);
  assert.match(migration, /'interactive_code'/);
  assert.match(migration, /payload #> '\{metadata,interactive_code\}'/);
  assert.match(migration, /payload = '\{\}'::jsonb/);
});

test("completion audit does not persist prompts or message payloads", () => {
  const retained = migration.match(/jsonb_build_object\(([\s\S]*?)\)\s*\n\s*\)/)?.[1] || "";
  assert.doesNotMatch(retained, /messages|prompt|content/);
});

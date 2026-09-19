import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260919011319_markets_corporate_adjustment_execution_revision.sql", import.meta.url),
  "utf8",
);

test("applied split adjustment advances execution revision", () => {
  const start = migration.indexOf("create or replace function public.market_apply_paper_split_adjustment");
  const end = migration.indexOf("create or replace function public.market_apply_paper_cash_adjustment");
  const block = migration.slice(start, end);
  assert.match(block, /execution_revision = execution_revision \+ 1/);
  assert.match(block, /for update/);
});

test("applied cash adjustment advances execution revision", () => {
  const start = migration.indexOf("create or replace function public.market_apply_paper_cash_adjustment");
  const block = migration.slice(start);
  assert.match(block, /execution_revision = execution_revision \+ 1/);
  assert.match(block, /for update/);
});

test("split no-position skip returns before execution revision mutation", () => {
  const start = migration.indexOf("create or replace function public.market_apply_paper_split_adjustment");
  const skipIndex = migration.indexOf("NO_OPEN_PAPER_POSITION", start);
  const revisionIndex = migration.indexOf("execution_revision = execution_revision + 1", start);
  assert.ok(skipIndex >= 0 && skipIndex < revisionIndex);
});

test("cash no-entitlement skip returns before execution revision mutation", () => {
  const start = migration.indexOf("create or replace function public.market_apply_paper_cash_adjustment");
  const skipIndex = migration.indexOf("NO_ENTITLED_PAPER_QUANTITY", start);
  const revisionIndex = migration.indexOf("execution_revision = execution_revision + 1", start);
  assert.ok(skipIndex >= 0 && skipIndex < revisionIndex);
});

test("corporate adjustment RPCs remain service-role only", () => {
  assert.match(
    migration,
    /revoke all on function public\.market_apply_paper_split_adjustment[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.market_apply_paper_split_adjustment[\s\S]*?to service_role/,
  );
  assert.match(
    migration,
    /revoke all on function public\.market_apply_paper_cash_adjustment[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.market_apply_paper_cash_adjustment[\s\S]*?to service_role/,
  );
});

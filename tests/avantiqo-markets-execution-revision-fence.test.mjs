import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260918133500_avantiqo_markets_execution_revision_fence_v1.sql", import.meta.url),
  "utf8",
);

test("paper accounts carry a monotonic execution revision", () => {
  assert.match(migration, /add column if not exists execution_revision bigint not null default 0/);
  assert.match(migration, /check \(execution_revision >= 0\)/);
});

test("fill RPC locks the portfolio account and rejects stale risk approval", () => {
  assert.match(
    migration,
    /from public\.market_paper_accounts[\s\S]*?for update[\s\S]*?PAPER_RISK_REVALIDATION_STALE/,
  );
  assert.match(
    migration,
    /risk_revalidation,execution_revision[\s\S]*?PAPER_RISK_EXECUTION_REVISION_REQUIRED/,
  );
});
test("successful fill advances the execution revision and seals both revisions into evidence", () => {
  assert.match(
    migration,
    /set execution_revision = execution_revision \+ 1[\s\S]*?execution_revision_before[\s\S]*?execution_revision_after/,
  );
});

test("revision-fenced fill RPC remains service-role only", () => {
  assert.match(
    migration,
    /revoke all on function public\.market_apply_paper_fill_with_quality[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.market_apply_paper_fill_with_quality[\s\S]*?to service_role/,
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const vercel = JSON.parse(await readFile(new URL("vercel.json", root), "utf8"));
const cron = new Map(vercel.crons.map((item) => [item.path, item.schedule]));
const middleware = await readFile(new URL("middleware.js", root), "utf8");

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("release cron load is staggered and Google Reviews runs three times daily", () => {
  assert.equal(cron.get("/api/internal/reputation/google-reviews/process"), "0 0,8,16 * * *");
  assert.equal(cron.get("/api/internal/reputation/google-reviews/repair-duplicates?organization_id=33336a72-acb5-474e-856b-8be0269360e2&limit=5"), "30 0 * * *");
  assert.equal(cron.get("/api/creative/execution/process"), "1-59/5 * * * *");
  assert.equal(cron.get("/api/internal/finance/payment-settlement/process"), "*/2 * * * *");
  assert.equal(cron.get("/api/internal/secretary/jobs/process"), "1-59/2 * * * *");
  assert.equal(cron.get("/api/internal/commercial/communications/email-inbox-sync"), "2-59/5 * * * *");
});

test("middleware never waits on Supabase auth for API traffic", () => {
  assert.match(middleware, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(middleware, /setTimeout\(resolve, 2500\)/);
});

test("heavy recurring workers use bounded release batches", async () => {
  const settlement = await source("app/api/internal/finance/payment-settlement/process/route.js");
  const secretaryJobs = await source("app/api/internal/secretary/jobs/process/route.js");
  const emailSync = await source("app/api/internal/commercial/communications/email-inbox-sync/route.js");
  const webhookRetries = await source("app/api/internal/developer/webhooks/retries/process/route.js");

  assert.match(settlement, /\|\| 25, 100/);
  assert.match(secretaryJobs, /prepareSecretaryPaperworkExecution\(\{ limit: 25 \}\)/);
  assert.match(emailSync, /syncDueEmailConnections\(\{ limit: 1 \}\)/);
  assert.match(webhookRetries, /\|\| 10, 25/);
});

test("Node1 routing defines local-required state before fast/deep decisions", async () => {
  const localQueue = await source("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js");
  assert.match(localQueue, /const localRequired = policy === "local_only"/);
  assert.match(localQueue, /localRequired \|\| enabled\(process\.env\.AVANTIQO_LOCAL_FAST_INTELLIGENCE_ENABLED/);
});

test("release database hardening closes public RLS gaps without breaking authenticated org access", async () => {
  const rls = await source("supabase/migrations/20260923031839_release_rls_public_table_lockdown.sql");
  for (const table of ["dishes","recipe_items","orders","ai_usage_logs","ai_intake_submissions","table_sessions","inventory_ledger","prepared_inventory","production_yield_logs","ai_operations_memory","ai_procurement_memory","pos_realtime_events","restaurant_tables","supplier_prices","restaurant_zones","recipe_prepared_items","waste_ledger"]) {
    assert.match(rls, new RegExp("'" + table + "'"));
  }
  assert.match(rls, /enable row level security/);
  assert.match(rls, /same_organization\(organization_id\)/);
  assert.match(rls, /business_entities/);
  assert.match(rls, /revoke all on table public\.business_entities from public, anon, authenticated/);
});

test("release database hardening fixes mutable search paths and anonymous session helpers", async () => {
  const paths = await source("supabase/migrations/20260923032000_harden_function_search_paths_and_session_helpers.sql");
  const grants = await source("supabase/migrations/20260923032114_restrict_session_helper_execute.sql");
  assert.match(paths, /set search_path = public, pg_temp/g);
  assert.match(grants, /can_read_organization_payroll/);
  assert.match(grants, /current_staff_account_id/);
  assert.match(grants, /from public, anon/);
});

test("pgvector leaves public schema without breaking vector-memory compatibility", async () => {
  const migration = await source("supabase/migrations/20260923032911_move_vector_extension_out_of_public.sql");
  assert.match(migration, /alter extension vector set schema extensions/);
  assert.match(migration, /match_vector_memory/);
  assert.match(migration, /vm\.organization_id as tenant_id/);
  assert.match(migration, /search_path = public, extensions, pg_temp/);
});

test("release RLS policies cache auth uid once per statement", async () => {
  const migration = await source("supabase/migrations/20260923034220_optimize_release_rls_auth_initplans.sql");
  assert.match(migration, /staff_accounts_read/);
  assert.match(migration, /hotel_booking_reinstatements_org_read/);
  assert.match(migration, /hotel_shift_handover_context_org_read/);
  assert.match(migration, /\(select auth\.uid\(\)\)/g);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { BrankasStatementProvider } from "../lib/finance/banking/providers/BrankasStatementProvider.js";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260918120000_finance_live_bank_feed_runtime.sql");
const runtime = read("lib/finance/banking/runtime/FinanceBankFeedRuntime.js");
const provider = read("lib/finance/banking/providers/BrankasStatementProvider.js");
const registry = read("lib/finance/banking/providers/BankFeedProviderRegistry.js");
const api = read("app/api/finance/banking-integrations/route.js");
const consent = read("app/api/finance/banking-integrations/[integrationId]/consent/route.js");
const callback = read("app/api/public/finance/bank-feed/[integrationId]/callback/route.js");
const syncRoute = read("app/api/finance/banking-integrations/[integrationId]/sync/route.js");
const panel = read("components/workspace/finance/FinanceBankFeedConnectionPanel.jsx");

test("Brankas Thailand statement normalizes into canonical bank evidence", () => {
  const statement = {
    statement_id: "stmt-th-001",
    status: "RECONCILIATION_NEW_TRANSACTION",
    bank_code: "KASIKORNBANK_PERSONAL",
    start_date: { seconds: Date.parse("2026-09-01T00:00:00Z") / 1000, nanos: 0 },
    end_date: { seconds: Date.parse("2026-09-18T00:00:00Z") / 1000, nanos: 0 },
    account_statements: [{
      account: { account_id: "acct-1", bank_code: "KASIKORNBANK_PERSONAL", account_number: "xxxx1234", balance: { cur: "THB", num: "10750" } },
      transactions: [
        { transaction_id: "tx-1", type: "CREDIT", date: { seconds: Date.parse("2026-09-17T00:00:00Z") / 1000 }, amount: { cur: "THB", num: "1000" }, descriptor: "Customer payment" },
        { transaction_id: "tx-2", type: "DEBIT", date: { seconds: Date.parse("2026-09-18T00:00:00Z") / 1000 }, amount: { cur: "THB", num: "250" }, descriptor: "Supplier transfer" },
      ],
    }],
  };
  const normalized = BrankasStatementProvider.normalizeStatement(statement);
  assert.equal(normalized.external_statement_id, "stmt-th-001");
  assert.equal(normalized.external_account_id, "acct-1");
  assert.equal(normalized.bank_code, "KASIKORNBANK_PERSONAL");
  assert.equal(normalized.currency_code, "THB");
  assert.equal(normalized.closing_balance, 10750);
  assert.equal(normalized.opening_balance, 10000);
  assert.deepEqual(normalized.transactions.map((row) => [row.provider_transaction_id, row.direction, row.amount]), [["tx-1","IN",1000],["tx-2","OUT",250]]);
});

test("bank feed persistence makes provider overlap idempotent before accounting import", () => {
  assert.match(migration, /create table if not exists public\.finance_bank_feed_transactions/);
  assert.match(migration, /unique \(integration_id, provider_transaction_id\)/);
  assert.match(migration, /create table if not exists public\.finance_bank_feed_sync_runs/);
  assert.match(migration, /unique \(integration_id, idempotency_key\)/);
  assert.match(runtime, /knownProviderTransactionIds/);
  assert.match(runtime, /const unseen = normalized\.transactions\.filter/);
  assert.match(runtime, /finance_bank_feed_transactions/);
});

test("live feed settles only through canonical statement import and exact reconciliation", () => {
  assert.match(runtime, /rpc\("create_finance_bank_statement_import"/);
  assert.match(runtime, /rpc\("finance_reconcile_bank_statement_import_exact_atomic"/);
  assert.match(runtime, /buildStatementPaymentEvidenceReport/);
  assert.doesNotMatch(runtime, /from\("general_ledger"\).*insert/s);
  assert.doesNotMatch(runtime, /from\("journal_entries"\).*insert/s);
});

test("provider secrets use the existing credential vault boundary", () => {
  assert.match(runtime, /resolveProviderCredentialSecret/);
  assert.match(runtime, /provider_credential_id/);
  assert.match(migration, /provider_credential_id uuid references public\.provider_credentials/);
  assert.doesNotMatch(migration, /api_key|client_secret|password/);
  assert.doesNotMatch(runtime, /process\.env\.BRANKAS.*KEY/);
});

test("Thailand transaction feed selects Brankas and Kasikorn code without asking accountants for provider enums", () => {
  assert.match(api, /providerCountryCode === "TH"/);
  assert.match(api, /providerName = "brankas_statement"/);
  assert.match(api, /KASIKORNBANK_PERSONAL/);
  assert.match(provider, /\["TH", "ID", "PH", "VN"\]/);
  assert.match(registry, /BrankasStatementProvider/);
});

test("bank consent has CSRF-like state and returns to governed sync", () => {
  assert.match(consent, /crypto\.randomBytes\(32\)/);
  assert.match(consent, /consentStateHash: hash\(state\)/);
  assert.match(callback, /timingSafeEqual/);
  assert.match(callback, /verifiedCallback = true/);
  assert.match(callback, /if \(verifiedCallback\)/);
  assert.match(callback, /organizationId: integration\.organization_id/);
  assert.match(callback, /syncBankFeedIntegration/);
  assert.match(callback, /bankFeed/);
});

test("banking cockpit exposes truthful provider readiness and sync actions", () => {
  assert.match(panel, /Provider credential required/);
  assert.match(panel, /Connect bank/);
  assert.match(panel, /Sync now/);
  assert.match(panel, /Only unseen provider transactions are imported/);
  assert.match(syncRoute, /finance\.banking\.manage/);
});

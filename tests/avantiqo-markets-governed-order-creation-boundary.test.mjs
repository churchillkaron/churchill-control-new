import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function javascriptFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...javascriptFiles(full));
    else if (/\.(?:js|mjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const autonomousRuntime = fs.readFileSync(
  path.join(root, "lib/markets/runtime/MarketAutonomousPaperRuntime.js"),
  "utf8",
);
const commandCenter = fs.readFileSync(
  path.join(root, "app/api/markets/command-center/route.js"),
  "utf8",
);
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260919035256_markets_governed_order_creation_state_fence.sql"),
  "utf8",
);

test("application and runtime code cannot directly insert PAPER orders", () => {
  const offenders = [];
  for (const base of ["app", "lib"]) {
    for (const file of javascriptFiles(path.join(root, base))) {
      const source = fs.readFileSync(file, "utf8");
      if (/\.from\(["']market_paper_orders["']\)\s*\.insert\s*\(/.test(source)) {
        offenders.push(path.relative(root, file));
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "All PAPER order creation must use market_create_governed_paper_order",
  );
});

test("autonomous PAPER order creation uses the governed RPC", () => {
  assert.match(autonomousRuntime, /market_create_governed_paper_order/);
  assert.match(autonomousRuntime, /p_decision_id: decision\.id/);
  assert.match(autonomousRuntime, /p_risk_snapshot: riskSnapshot/);
  assert.match(autonomousRuntime, /p_metadata: orderMetadata/);
});

test("manual PAPER order creation uses the same governed RPC", () => {
  assert.match(commandCenter, /market_create_governed_paper_order/);
});

test("governed order creation locks ACTIVE PAPER portfolio state", () => {
  assert.match(
    migration,
    /from public\.market_portfolios[\s\S]*?for share/,
  );
  assert.match(migration, /v_portfolio\.status <> 'ACTIVE'/);
  assert.match(migration, /PAPER_PORTFOLIO_NOT_ACTIVE/);
  assert.match(migration, /v_portfolio\.execution_mode <> 'PAPER'/);
  assert.match(migration, /PAPER_PORTFOLIO_EXECUTION_MODE_INVALID/);
});

test("governed order creation locks ACTIVE PAPER account state", () => {
  assert.match(
    migration,
    /from public\.market_paper_accounts[\s\S]*?for share/,
  );
  assert.match(migration, /v_account\.status <> 'ACTIVE'/);
  assert.match(migration, /PAPER_ACCOUNT_NOT_ACTIVE/);
});

test("governed order creation locks approved decision and binds symbol side expiry", () => {
  assert.match(
    migration,
    /from public\.market_decisions[\s\S]*?for update/,
  );
  assert.match(migration, /PAPER_DECISION_NOT_APPROVED/);
  assert.match(migration, /PAPER_ORDER_EXPIRY_EXCEEDS_DECISION_AUTHORITY/);
  assert.match(migration, /PAPER_ORDER_SYMBOL_MISMATCH/);
  assert.match(migration, /PAPER_ORDER_SIDE_MISMATCH/);
});

test("governed order creation remains decision-idempotent", () => {
  assert.match(
    migration,
    /from public\.market_paper_orders[\s\S]*?where decision_id = p_decision_id/,
  );
  assert.match(migration, /PAPER_DECISION_ORDER_ALREADY_EXISTS/);
});

test("governed order creation RPC remains service-role only", () => {
  assert.match(
    migration,
    /revoke all on function public\.market_create_governed_paper_order[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.market_create_governed_paper_order[\s\S]*?to service_role/,
  );
});

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = ["lib/finance", "app/api/finance", "app/api/workspace/finance"];
const fixed = /\.limit\((50|100|200|250|500|1000|5000|10000)\)/g;

function walk(relative) {
  const absolute = path.join(root, relative);
  const out = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(absolute, entry.name);
    if (entry.isDirectory()) out.push(...walk(path.relative(root, child)));
    else if (/\.(js|jsx|mjs)$/.test(entry.name)) out.push(path.relative(root, child));
  }
  return out;
}

const allowed = new Map([
  ["lib/finance/auditor/FinanceAuditorPackageRuntime.js", new Set(["100"])],
  ["lib/finance/corrections/FinanceCorrectionRuntime.js", new Set(["200"])],
  ["app/api/finance/bank-statements/runtime/route.js", new Set(["250"])],
  ["app/api/finance/fx-revaluation/runtime/route.js", new Set(["250"])],
  ["app/api/finance/journals/route.js", new Set(["500"])],
  ["app/api/finance/review/route.js", new Set(["50"])],
  ["app/api/finance/audit-trail/route.js", new Set(["200"])],
  ["app/api/finance/audit-trail/live/route.js", new Set(["500"])],
  ["app/api/finance/vendor-invoices/intake/route.js", new Set(["200"])],
]);

test("Finance fixed row caps exist only on approved presentation/history windows", () => {
  const files = roots.flatMap(walk);
  const unexpected = [];
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    for (const match of source.matchAll(fixed)) {
      const size = match[1];
      if (!allowed.get(file)?.has(size)) unexpected.push(`${file}: limit(${size})`);
    }
  }
  assert.deepEqual(unexpected, [], `Unexpected fixed Finance row caps:\n${unexpected.join("\n")}`);
});

test("approved fixed windows are presentation/history only, not accounting decision authorities", () => {
  const auditor = fs.readFileSync(path.join(root, "lib/finance/auditor/FinanceAuditorPackageRuntime.js"), "utf8");
  const corrections = fs.readFileSync(path.join(root, "lib/finance/corrections/FinanceCorrectionRuntime.js"), "utf8");
  const bank = fs.readFileSync(path.join(root, "app/api/finance/bank-statements/runtime/route.js"), "utf8");
  const fx = fs.readFileSync(path.join(root, "app/api/finance/fx-revaluation/runtime/route.js"), "utf8");
  const review = fs.readFileSync(path.join(root, "app/api/finance/review/route.js"), "utf8");

  assert.match(auditor, /listFinanceAuditorPackages/);
  assert.match(corrections, /listFinanceCorrections/);
  assert.match(bank, /finance_bank_statement_imports/);
  assert.match(fx, /finance_fx_revaluation_runs/);
  assert.match(review, /organization_audit_logs[\s\S]*limit\(50\)/);
  assert.match(review, /organization_documents[\s\S]*limit\(50\)/);

  // Decision truth for these domains is separately complete/exact.
  assert.match(corrections, /findOpenDuplicate[\s\S]*\.contains\("metadata"/);
  assert.match(fx, /FX revaluation exchange rates/);
});

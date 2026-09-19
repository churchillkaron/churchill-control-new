import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const shell = fs.readFileSync(new URL("../components/workspace/finance/FinanceShellNavigation.jsx", import.meta.url), "utf8");
const quickFind = fs.readFileSync(new URL("../components/workspace/finance/FinanceQuickFind.jsx", import.meta.url), "utf8");
const ia = fs.readFileSync(new URL("../lib/finance/ui/FinanceInformationArchitecture.js", import.meta.url), "utf8");
const clientsPage = fs.readFileSync(new URL("../app/(system)/workspace/[organizationId]/finance/clients/page.jsx", import.meta.url), "utf8");
const closePage = fs.readFileSync(new URL("../app/(system)/workspace/[organizationId]/finance/close/page.jsx", import.meta.url), "utf8");
const areaHub = fs.readFileSync(new URL("../components/workspace/finance/FinanceAreaHub.jsx", import.meta.url), "utf8");

test("Finance navigation follows human accountant mental models", () => {
  for (const label of ["Home", "Clients", "Work", "Books", "Close & Tax", "Reports", "Settings"]) {
    assert.match(shell, new RegExp(`label: "${label.replace(/[&]/g, "&")}"`));
  }
  assert.doesNotMatch(shell, /label: "Review"/);
  assert.match(ia, /financePath\.startsWith\("\/finance\/review"\)\) return "work"/);
  assert.match(ia, /financePath\.startsWith\("\/finance\/clients"\)\) return "clients"/);
});

test("Finance has a first-class multi-client workspace", () => {
  assert.match(clientsPage, /FinancePracticeControlTower/);
  assert.match(clientsPage, /initialView="clients"/);
  assert.match(shell, /route: "\/clients"/);
});

test("Finance Quick Find makes capabilities discoverable without menu knowledge", () => {
  assert.match(shell, /FinanceQuickFind/);
  assert.match(quickFind, /Find anything in Finance/);
  assert.match(quickFind, /getWorkspaceGroups\("finance"\)/);
  assert.match(quickFind, /resolveWorkspaceRoute/);
  assert.match(quickFind, /VAT/);
  assert.match(quickFind, /bank reconciliation/);
  assert.match(quickFind, /trial balance/);
});

test("Close and tax work is surfaced as one accountant work area", () => {
  for (const capability of ["period_close", "year_end", "vat_returns", "statutory_filings", "fx_revaluation", "depreciation"]) {
    assert.match(ia, new RegExp(`"${capability}"`));
  }
  assert.match(closePage, /FinanceAreaHub/);
  assert.match(closePage, /area="close"/);
  assert.match(areaHub, /title: "Close & Tax"/);
});

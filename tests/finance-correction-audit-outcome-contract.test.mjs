import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = read("app/api/workspace/finance/corrections/route.js");

test("completed correction actions cannot be reported as failed only because secondary audit logging failed", () => {
  assert.match(route, /async function auditAfterAction/);
  assert.match(route, /FINANCE_CORRECTION_AUDIT_WRITE_FAILED/);
  assert.match(route, /audit_warning:\s*auditWarning/);
  assert.match(route, /completed:\s*true/);
  assert.doesNotMatch(route, /await audit\(access,[\s\S]*return NextResponse\.json\(\{ success: true, result \}\)/);
});

test("post remains governed before financial execution", () => {
  assert.match(route, /requirePermission\(access, "finance\.journals\.post"\)/);
  assert.match(route, /postFinanceCorrection/);
});

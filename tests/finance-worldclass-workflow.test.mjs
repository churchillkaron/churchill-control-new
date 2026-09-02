import test from "node:test";
import assert from "node:assert/strict";

import { auditFinanceWorldclassWorkflow } from "../scripts/audit-finance-worldclass-workflow.mjs";

test("Finance worldclass workflow contracts stay complete", async () => {
  const result = await auditFinanceWorldclassWorkflow();

  assert.equal(
    result.ok,
    true,
    `Finance workflow audit failed:\n${(result.failures || []).join("\n")}`
  );
  assert.equal(result.coverage?.capabilities, 67);
  assert.equal(result.coverage?.presentation, 67);
  assert.ok(result.coverage?.runtime_records > 0);
  assert.ok(result.coverage?.runtime_reports > 0);
  assert.ok(result.coverage?.runtime_processes > 0);
});

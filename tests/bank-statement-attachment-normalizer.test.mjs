import test from "node:test";
import assert from "node:assert/strict";

import { normalizeBankStatementAttachment } from "../lib/finance/bank-statements/BankStatementAttachmentNormalizer.js";

test("recognizes and normalizes structured bank statement rows without posting", () => {
  const file = {
    sha256: "abc123",
    analysis: {
      structured_file_type: "csv",
      content_excerpt: JSON.stringify({
        fields: ["Date", "Description", "Debit", "Credit", "Reference"],
        rows: [
          { Date: "2026-09-01", Description: "Customer payment", Debit: "", Credit: "2,500.00", Reference: "INV-1" },
          { Date: "2026-09-02", Description: "Bank fee", Debit: "25.00", Credit: "", Reference: "FEE-1" },
        ],
      }),
    },
  };
  const result = normalizeBankStatementAttachment(file);
  assert.equal(result.recognized, true);
  assert.equal(result.statement.lines.length, 2);
  assert.deepEqual(result.statement.lines.map((line) => line.direction), ["IN", "OUT"]);
  assert.equal(result.authorization_effect, "NONE");
});
test("does not force arbitrary structured files into Finance", () => {
  const result = normalizeBankStatementAttachment({
    analysis: {
      structured_file_type: "csv",
      content_excerpt: JSON.stringify({
        fields: ["Employee", "Role", "Start Date"],
        rows: [{ Employee: "A", Role: "Manager", "Start Date": "2026-09-01" }],
      }),
    },
  });
  assert.equal(result.recognized, false);
  assert.equal(result.status, "NOT_BANK_STATEMENT");
});

test("vision classification alone does not invent missing transaction lines", () => {
  const result = normalizeBankStatementAttachment({
    analysis: {
      evidence: { document_type: "bank_statement", confidence: 97, opening_balance: "1000", closing_balance: "1250", currency: "THB", statement_number: "S-1" },
    },
  });
  assert.equal(result.recognized, true);
  assert.equal(result.status, "CLARIFICATION_OR_EXTRACTION_REQUIRED");
  assert.ok(result.missing_fields.includes("transaction_lines"));
});

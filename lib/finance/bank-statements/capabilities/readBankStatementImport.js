import { createOperatorAuthenticatedRouteReadCapability } from "@/lib/operator/runtime/OperatorAuthenticatedRouteReadCapability";

export function createBankStatementImportReadCapability() {
  return createOperatorAuthenticatedRouteReadCapability({
    domain: "finance", capability: "bank_statements", action: "read",
    description: "Read one exact entity-scoped imported bank statement and its persisted lines for deterministic verification.",
    endpoint: "/api/finance/bank-statements/runtime", permissions: ["finance.banking.view"],
    tags: ["finance", "banking", "bank-statement", "verification"], contextScope: "entity",
    queryFields: ["statement_import_id"],
    inputSchema: { type: "object", required: ["statement_import_id"], properties: { statement_import_id: { type: "string" } }, additionalProperties: false },
  });
}
export default createBankStatementImportReadCapability;

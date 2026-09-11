import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";

const REQUIRED_PERMISSION = "finance.banking.manage";
const ENDPOINT = "/api/finance/bank-statements/import";

function text(value) {
  return String(value ?? "").trim();
}

function required(value, field) {
  if (value === undefined || value === null || text(value) === "") {
    throw new Error(`${field} required`);
  }
  return value;
}

function requestOrigin(request) {
  const url = text(request?.url);
  return url ? new URL(url).origin : null;
}

export const manifest = defineCapability({
  domain: "finance",
  capability: "bank_statements",
  action: "create",
  name: "Import bank statement",
  description: "Import a reviewed bank statement into the active legal entity using the canonical Finance statement importer.",
  permissions: [REQUIRED_PERMISSION],
  events: ["finance.bank_statement.imported"],  tags: ["finance", "banking", "bank-statement", "import"],
  transactional: true,
  aiEnabled: false,
  operatorEnabled: true,
  operatorMode: "write",
  operatorAutoExecute: false,
  operatorRequiresConfirmation: true,
  risk: "medium",
  contextScope: "entity",
  operatorVerification: { capability_key: "finance.bank_statements.read", payload_from_result: { statement_import_id: ["statement_import_id", "record.id"] }, derivation: "declared_result_bound_record_verifier" },
  operatorAliases: [
    "import bank statement",
    "upload bank statement",
    "record bank statement",
    "bring in this bank statement",
  ],
  operatorExamples: [
    "Import this bank statement",
    "Upload this statement and reconcile it",
    "Bring in this Kasikorn statement",
  ],
  inputSchema: {
    type: "object",
    properties: {
      bank_account_id: { type: "string" },
      statement_number: { type: "string" },
      statement_start_date: { type: "string" },
      statement_end_date: { type: "string" },
      opening_balance: { type: "number" },
      closing_balance: { type: "number" },
      currency_code: { type: "string" },
      import_reference: { type: "string" },      lines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            transaction_date: { type: "string" },
            description: { type: "string" },
            amount: { type: "number" },
            direction: { type: "string", enum: ["IN", "OUT"] },
            reference_number: { type: "string" },
          },
          required: ["transaction_date", "amount", "direction"],
          additionalProperties: false,
        },
      },
    },
    required: [
      "bank_account_id",
      "statement_number",
      "statement_start_date",
      "statement_end_date",
      "opening_balance",
      "closing_balance",
      "currency_code",
      "lines",
    ],
    additionalProperties: false,
  },
});

export function validate({ context, payload = {} }) {  if (!text(context?.organizationId)) throw new Error("organization_id required");
  if (!text(context?.entityId)) throw new Error("entity_id required");
  required(payload.bank_account_id || payload.bankAccountId, "bank_account_id");
  required(payload.statement_number || payload.statementNumber, "statement_number");
  required(payload.statement_start_date || payload.statementStartDate, "statement_start_date");
  required(payload.statement_end_date || payload.statementEndDate, "statement_end_date");
  required(payload.opening_balance ?? payload.openingBalance, "opening_balance");
  required(payload.closing_balance ?? payload.closingBalance, "closing_balance");
  required(payload.currency_code || payload.currencyCode, "currency_code");
  if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
    throw new Error("bank statement lines required");
  }
  return true;
}

export function authorize({ context }) {
  return requireExecutionPermission(context, REQUIRED_PERMISSION);
}

export async function execute({ context, payload = {} }) {
  const origin = requestOrigin(context?.callerRequest);
  if (!origin) {
    const error = new Error("Bank statement import requires caller request context");
    error.status = 500;
    throw error;
  }

  const cookie = text(context.callerRequest?.headers?.get?.("cookie"));  const response = await fetch(new URL(ENDPOINT, origin), {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({
      ...payload,
      organizationId: context.organizationId,
      organization_id: context.organizationId,
      entityId: context.entityId,
      entity_id: context.entityId,
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success === false) {
    const error = new Error(body?.error || "Bank statement could not be imported");
    error.status = response.status;
    throw error;
  }
  return body;
}

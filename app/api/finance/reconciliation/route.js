export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";

import {
  importBankStatementCommand,
  runBankReconciliationCommand,
} from "@/lib/finance/reconciliation/runtime/ReconciliationApplicationService";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function statusFor(message) {
  return /required|not found|valid number|scope|statement|bank account/i.test(
    String(message || "")
  )
    ? 400
    : 500;
}

async function resolveScope(request, body, permissions) {
  const access = await requireOrganizationAccess({
    organizationId: body.organizationId || body.organization_id,
    request,
    requiredAnyPermission: permissions,
  });

  if (!access.success) {
    return {
      response: NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      ),
    };
  }

  const entityId = required(
    body.entityId || body.entity_id,
    "entity_id"
  );
  const entity = await resolveEntity({
    organizationId: access.organizationId,
    entityId,
  });

  if (!entity) {
    return {
      response: NextResponse.json(
        { success: false, error: "Legal entity not found in organisation" },
        { status: 404 }
      ),
    };
  }

  return { access, entity };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const scope = await resolveScope(request, body, [
      "finance.bank-statements.import",
      "finance.reconciliation.manage",
      "finance.*",
    ]);

    if (scope.response) return scope.response;

    const result = await importBankStatementCommand({
      ...body,
      organization_id: scope.access.organizationId,
      entity_id: scope.entity.id,
      imported_by: scope.access.user?.id || null,
      transactions: Array.isArray(body.transactions) ? body.transactions : [],
    });

    return NextResponse.json(result, {
      status: result?.success === false ? 400 : 200,
    });
  } catch (error) {
    const message = error.message || "Bank statement import failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const scope = await resolveScope(request, body, [
      "finance.bank-reconciliation.run",
      "finance.reconciliation.manage",
      "finance.*",
    ]);

    if (scope.response) return scope.response;

    const result = await runBankReconciliationCommand({
      organization_id: scope.access.organizationId,
      entity_id: scope.entity.id,
      bank_account_id: required(
        body.bank_account_id || body.bankAccountId,
        "bank_account_id"
      ),
      bank_statement_id:
        body.bank_statement_id ||
        body.bankStatementId ||
        null,
      reconciliation_date: required(
        body.reconciliation_date || body.reconciliationDate,
        "reconciliation_date"
      ),
      book_closing_balance:
        body.book_closing_balance ?? body.bookClosingBalance ?? null,
      statement_closing_balance:
        body.statement_closing_balance ?? body.statementClosingBalance ?? null,
      notes: body.notes || null,
      created_by: scope.access.user?.id || null,
    });

    return NextResponse.json(result, {
      status: result?.success === false ? 400 : 200,
    });
  } catch (error) {
    const message = error.message || "Bank reconciliation failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}

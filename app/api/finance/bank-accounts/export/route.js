export const dynamic = "force-dynamic";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { exportBankAccountsCommand } from "@/lib/finance/bank-accounts/runtime/BankAccountsApplicationService";

function toCsv(rows) {
  const headers = [
    "id",
    "bank_name",
    "account_name",
    "account_number",
    "currency_code",
    "current_balance",
    "active",
  ];

  return [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((key) => JSON.stringify(row[key] ?? "")).join(",")
    ),
  ].join("\n");
}

function errorResponse(message, status) {
  return Response.json({ success: false, error: message }, { status });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organization_id") ||
        searchParams.get("organizationId"),
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status);
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.banking.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const result = await exportBankAccountsCommand({
      organization_id: access.organizationId,
    });
    const format = searchParams.get("format") || "csv";

    if (format === "json") return Response.json(result);

    return new Response(toCsv(result.rows || []), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="bank-accounts.csv"',
      },
    });
  } catch (error) {
    const message = error.message || "Bank account export failed";
    const status = String(message).toLowerCase().includes("permission denied") ? 403 : 500;
    return errorResponse(message, status);
  }
}

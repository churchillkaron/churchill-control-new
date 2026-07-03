export const dynamic = "force-dynamic";

import { listBankAccounts } from "@/lib/finance/bank-accounts/repositories/bankAccountRepository";

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
    ...rows.map(row =>
      headers
        .map(key => JSON.stringify(row[key] ?? ""))
        .join(",")
    ),
  ].join("\n");
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const organization_id =
    searchParams.get("organization_id") ||
    searchParams.get("organizationId");

  const format =
    searchParams.get("format") || "csv";

  const rows =
    await listBankAccounts({
      organization_id,
    });

  if (format === "json") {
    return Response.json({
      success: true,
      rows,
    });
  }

  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="bank-accounts.csv"',
    },
  });
}

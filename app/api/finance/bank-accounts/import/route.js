export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { importBankAccountsCommand } from "@/lib/finance/bank-accounts/runtime/BankAccountsApplicationService";

function parseCsv(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((header) => header.trim());

  return lines.slice(1).map((line) => {
    const values = line.split(",").map((value) => value.trim());
    return Object.fromEntries(
      headers.map((header, index) => [header, values[index] || ""])
    );
  });
}

function statusFor(message) {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("permission denied")) return 403;
  return /required|invalid|empty/i.test(normalized) ? 400 : 500;
}

export async function POST(request) {
  try {
    const form = await request.formData();
    const access = await requireOrganizationAccess({
      organizationId: form.get("organization_id") || form.get("organizationId"),
      request,
    });

    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.banking.manage",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const file = form.get("file");
    const pasted = form.get("text");
    let rows = [];

    if (file && file.text) {
      const text = await file.text();
      try {
        const parsed = JSON.parse(text);
        rows = Array.isArray(parsed) ? parsed : parsed.rows || [];
      } catch {
        rows = parseCsv(text);
      }
    } else if (pasted) {
      try {
        const parsed = JSON.parse(String(pasted));
        rows = Array.isArray(parsed) ? parsed : parsed.rows || [];
      } catch {
        rows = parseCsv(String(pasted));
      }
    }

    const result = await importBankAccountsCommand({
      organization_id: access.organizationId,
      rows,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || "Bank account import failed";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function statusFor(message) {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("permission denied")) return 403;
  return normalized.includes("required") ? 400 : 500;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.receivables.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const requestedEntityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id") ||
      null;

    const entity = requestedEntityId
      ? await resolveEntity({
          organizationId: access.organizationId,
          entityId: requestedEntityId,
        })
      : null;

    if (requestedEntityId && !entity) {
      return NextResponse.json(
        { success: false, error: "Legal entity not found in organisation" },
        { status: 404 }
      );
    }

    let query = supabaseAdmin
      .from("customer_payments")
      .select("*")
      .eq("organization_id", access.organizationId)
      .order("payment_date", { ascending: false });

    if (entity?.id) {
      query = query.eq("entity_id", entity.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rawPayments = data || [];
    const partyIds = unique(rawPayments.map(row => row.party_id || row.customer_party_id));
    const bankAccountIds = unique(rawPayments.map(row => row.bank_account_id));
    const invoiceIds = unique(rawPayments.map(row => row.customer_invoice_id));

    const [partiesResult, bankAccountsResult, invoicesResult] = await Promise.all([
      partyIds.length
        ? supabaseAdmin
            .from("parties")
            .select("id, display_name, legal_name")
            .eq("organization_id", access.organizationId)
            .in("id", partyIds)
        : Promise.resolve({ data: [], error: null }),
      bankAccountIds.length
        ? supabaseAdmin
            .from("bank_accounts")
            .select("id, account_name, bank_name, account_number")
            .eq("organization_id", access.organizationId)
            .in("id", bankAccountIds)
        : Promise.resolve({ data: [], error: null }),
      invoiceIds.length
        ? supabaseAdmin
            .from("customer_invoices")
            .select("id, invoice_number, reference_number")
            .eq("organization_id", access.organizationId)
            .in("id", invoiceIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    for (const result of [partiesResult, bankAccountsResult, invoicesResult]) {
      if (result.error) throw result.error;
    }

    const parties = new Map((partiesResult.data || []).map(row => [row.id, row]));
    const bankAccounts = new Map((bankAccountsResult.data || []).map(row => [row.id, row]));
    const invoices = new Map((invoicesResult.data || []).map(row => [row.id, row]));

    const payments = rawPayments.map(payment => {
      const party = parties.get(payment.party_id || payment.customer_party_id) || null;
      const bankAccount = bankAccounts.get(payment.bank_account_id) || null;
      const invoice = invoices.get(payment.customer_invoice_id) || null;

      return {
        ...payment,
        customer_name:
          payment.customer_name ||
          party?.display_name ||
          party?.legal_name ||
          null,
        invoice_number:
          payment.invoice_number ||
          invoice?.invoice_number ||
          invoice?.reference_number ||
          null,
        bank_account_name:
          bankAccount?.account_name ||
          bankAccount?.bank_name ||
          null,
        bank_account_number: bankAccount?.account_number || null,
        status: payment.status || "POSTED",
      };
    });

    return NextResponse.json({ success: true, payments, rows: payments });
  } catch (error) {
    const message = error.message || "Customer payment list failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}

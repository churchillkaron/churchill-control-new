export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function statusFor(message) {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("permission denied")) return 403;
  if (normalized.includes("required")) return 400;
  return 500;
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
        { success: false, error: access.error, invoices: [] },
        { status: access.status }
      );
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.receivables.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const entityId = searchParams.get("entityId") || searchParams.get("entity_id");
    const partyId = searchParams.get("partyId") || searchParams.get("party_id");
    const includeLines = ["1", "true", "yes"].includes(String(searchParams.get("include_lines") || "").toLowerCase());
    const requestedLimit = Number(searchParams.get("limit"));
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 200) : null;
    let query = supabaseAdmin
      .from("customer_invoices")
      .select("*")
      .eq("organization_id", access.organizationId);
    if (entityId) query = query.eq("entity_id", entityId);
    if (partyId) query = query.eq("party_id", partyId);
    const invoiceId = searchParams.get("id") || searchParams.get("invoice_id");
    if (invoiceId) query = query.eq("id", invoiceId);
    query = query.order("invoice_date", { ascending: false }).order("created_at", { ascending: false });
    if (limit) query = query.limit(limit);

    const { data, error } = await query;
    if (error) throw error;

    let lineRows = [];
    if (includeLines && (data || []).length) {
      const ids = (data || []).map((invoice) => invoice.id).filter(Boolean);
      const { data: lines, error: lineError } = await supabaseAdmin
        .from("customer_invoice_lines")
        .select("*")
        .eq("organization_id", access.organizationId)
        .in("customer_invoice_id", ids)
        .order("created_at", { ascending: true });
      if (lineError) throw lineError;
      lineRows = lines || [];
    }
    const linesByInvoice = new Map();
    for (const line of lineRows) {
      const rows = linesByInvoice.get(line.customer_invoice_id) || [];
      rows.push(line);
      linesByInvoice.set(line.customer_invoice_id, rows);
    }

    const invoices = (data || []).map((invoice) => {
      const base = `/api/finance/customer-invoices/${invoice.id}/pdf?organizationId=${encodeURIComponent(access.organizationId)}${entityId ? `&entityId=${encodeURIComponent(entityId)}` : ""}`;
      return {
        ...invoice,
        ...(includeLines ? { lines: linesByInvoice.get(invoice.id) || [] } : {}),
        preview_url: base,
        pdf_url: base,
        ...(String(invoice.status || "").toUpperCase() === "PAID"
          ? { receipt_url: `${base}&mode=receipt` }
          : {}),
      };
    });

    return NextResponse.json({ success: true, invoices });
  } catch (error) {
    const message = error.message || "Customer invoice list failed";
    return NextResponse.json(
      { success: false, error: message, invoices: [] },
      { status: statusFor(message) }
    );
  }
}

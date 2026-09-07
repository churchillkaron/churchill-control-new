export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function statusFor(message) {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("permission denied")) return 403;
  return /required|not found/i.test(normalized) ? 400 : 500;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId: searchParams.get("organizationId") || searchParams.get("organization_id"),
      request,
    });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.receivables.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const requestedEntityId = searchParams.get("entityId") || searchParams.get("entity_id") || null;
    const entity = requestedEntityId
      ? await resolveEntity({ organizationId: access.organizationId, entityId: requestedEntityId })
      : null;
    if (requestedEntityId && !entity) {
      return NextResponse.json({ success: false, error: "Legal entity not found in organisation" }, { status: 404 });
    }

    let invoiceQuery = supabaseAdmin
      .from("customer_invoices")
      .select("*")
      .eq("organization_id", access.organizationId)
      .order("invoice_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (entity?.id) invoiceQuery = invoiceQuery.eq("entity_id", entity.id);

    const { data: rawInvoices, error: invoiceError } = await invoiceQuery;
    if (invoiceError) throw invoiceError;

    const invoiceIds = unique((rawInvoices || []).map(row => row.id));
    const partyIds = unique((rawInvoices || []).map(row => row.party_id || row.customer_id));
    const [linesResult, partiesResult] = await Promise.all([
      invoiceIds.length
        ? supabaseAdmin.from("customer_invoice_lines").select("*").eq("organization_id", access.organizationId).in("customer_invoice_id", invoiceIds).order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      partyIds.length
        ? supabaseAdmin.from("parties").select("id, display_name, legal_name").eq("organization_id", access.organizationId).in("id", partyIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (linesResult.error) throw linesResult.error;
    if (partiesResult.error) throw partiesResult.error;

    const linesByInvoice = new Map();
    for (const line of linesResult.data || []) {
      const current = linesByInvoice.get(line.customer_invoice_id) || [];
      current.push(line);
      linesByInvoice.set(line.customer_invoice_id, current);
    }
    const parties = new Map((partiesResult.data || []).map(row => [row.id, row]));

    const invoices = (rawInvoices || []).map(invoice => {
      const party = parties.get(invoice.party_id || invoice.customer_id) || null;
      return {
        ...invoice,
        customer_name: invoice.customer_name || party?.display_name || party?.legal_name || null,
        lines: linesByInvoice.get(invoice.id) || [],
      };
    });

    return NextResponse.json({ success: true, invoices, rows: invoices });
  } catch (error) {
    const message = error.message || "Customer invoice list failed";
    return NextResponse.json({ success: false, error: message, invoices: [] }, { status: statusFor(message) });
  }
}

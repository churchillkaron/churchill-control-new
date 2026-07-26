export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET(req) {
  try {
    await requireAuth();
    const { searchParams } = new URL(req.url);
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
      request: req,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const requestedEntityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id");
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

    let invoiceQuery = supabaseAdmin
      .from("vendor_invoices")
      .select("*")
      .eq("organization_id", access.organizationId)
      .order("invoice_date", { ascending: false });

    if (entity?.id) {
      invoiceQuery = invoiceQuery.eq("entity_id", entity.id);
    }

    const { data: invoices, error: invoiceError } = await invoiceQuery;

    if (invoiceError) {
      throw invoiceError;
    }

    const partyIds = [...new Set(
      (invoices || [])
        .map(invoice => invoice.vendor_party_id || invoice.supplier_party_id)
        .filter(Boolean)
    )];
    let parties = [];

    if (partyIds.length) {
      const { data, error } = await supabaseAdmin
        .from("parties")
        .select("id, display_name, legal_name")
        .eq("organization_id", access.organizationId)
        .in("id", partyIds);

      if (error) {
        throw error;
      }
      parties = data || [];
    }

    const partyById = new Map(parties.map(party => [party.id, party]));
    const rows = (invoices || []).map(invoice => {
      const partyId = invoice.vendor_party_id || invoice.supplier_party_id || null;
      return {
        ...invoice,
        party: partyById.get(partyId) || null,
      };
    });

    return NextResponse.json({
      success: true,
      invoices: rows,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status || 500 }
    );
  }
}

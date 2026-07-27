export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET(request) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error, invoices: [], rows: [] },
        { status: access.status }
      );
    }

    const requestedEntityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id");

    if (!requestedEntityId) {
      return NextResponse.json(
        { success: false, error: "entity_id required", invoices: [], rows: [] },
        { status: 400 }
      );
    }

    const entity = await resolveEntity({
      organizationId: access.organizationId,
      entityId: requestedEntityId,
    });

    if (!entity) {
      return NextResponse.json(
        { success: false, error: "Legal entity not found in organisation", invoices: [], rows: [] },
        { status: 404 }
      );
    }

    const { data: invoices, error: invoiceError } = await supabaseAdmin
      .from("vendor_invoices")
      .select("*")
      .eq("organization_id", access.organizationId)
      .eq("entity_id", entity.id)
      .order("invoice_date", { ascending: false });

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
      const party = partyById.get(partyId) || null;
      return {
        ...invoice,
        party,
        vendor_name:
          invoice.vendor_name ||
          party?.display_name ||
          party?.legal_name ||
          null,
      };
    });

    return NextResponse.json({
      success: true,
      organization_id: access.organizationId,
      entity_id: entity.id,
      invoices: rows,
      rows,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Vendor invoice list failed",
        invoices: [],
        rows: [],
      },
      { status: error.status || 500 }
    );
  }
}

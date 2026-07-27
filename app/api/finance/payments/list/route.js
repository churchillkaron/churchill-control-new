export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function requestedView(searchParams) {
  return String(
    searchParams.get("capabilityId") ||
    searchParams.get("workspaceId") ||
    searchParams.get("view") ||
    "accounts_payable"
  )
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
}

export async function GET(req) {
  try {
    await requireAuth();

    const { searchParams } = new URL(req.url);
    const organizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");

    const access = await requireOrganizationAccess({
      organizationId,
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

    const view = requestedView(searchParams);

    if (view === "vendor_payments") {
      let paymentQuery = supabaseAdmin
        .from("vendor_payments")
        .select("*")
        .eq("organization_id", access.organizationId)
        .order("paid_at", { ascending: false });

      if (entity?.id) {
        paymentQuery = paymentQuery.eq("entity_id", entity.id);
      }

      const { data, error } = await paymentQuery;
      if (error) throw error;

      const payments = data || [];
      return NextResponse.json({
        success: true,
        view,
        payments,
        payables: payments,
        rows: payments,
      });
    }

    let payableQuery = supabaseAdmin
      .from("accounts_payable")
      .select("*")
      .eq("organization_id", access.organizationId)
      .order("created_at", { ascending: false });

    if (entity?.id) {
      payableQuery = payableQuery.eq("entity_id", entity.id);
    }

    const { data, error } = await payableQuery;
    if (error) throw error;

    const payables = data || [];
    return NextResponse.json({
      success: true,
      view: "accounts_payable",
      payables,
      rows: payables,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status || 500 }
    );
  }
}

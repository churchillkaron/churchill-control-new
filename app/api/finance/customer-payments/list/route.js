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
        { success: false, error: access.error, payments: [], rows: [] },
        { status: access.status }
      );
    }

    const requestedEntityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id");

    if (!requestedEntityId) {
      return NextResponse.json(
        { success: false, error: "entity_id required", payments: [], rows: [] },
        { status: 400 }
      );
    }

    const entity = await resolveEntity({
      organizationId: access.organizationId,
      entityId: requestedEntityId,
    });

    if (!entity) {
      return NextResponse.json(
        { success: false, error: "Legal entity not found in organisation", payments: [], rows: [] },
        { status: 404 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("customer_payments")
      .select("*")
      .eq("organization_id", access.organizationId)
      .eq("entity_id", entity.id)
      .order("payment_date", { ascending: false });

    if (error) throw error;

    const payments = data || [];

    return NextResponse.json({
      success: true,
      organization_id: access.organizationId,
      entity_id: entity.id,
      payments,
      rows: payments,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Customer payment list failed",
        payments: [],
        rows: [],
      },
      { status: 500 }
    );
  }
}

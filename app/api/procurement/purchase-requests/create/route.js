import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { createPurchaseRequest } from "@/lib/inventory/procurement/purchase-orders/capabilities/createPurchaseRequest";

function errorResponse(error, status = 500) {
  return NextResponse.json(
    {
      success: false,
      error,
    },
    { status }
  );
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId || null;
    const entityId = body.entity_id || body.entityId || null;

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status);
    }

    if (!entityId) {
      return errorResponse("entity_id required", 400);
    }

    const { data: entity, error: entityError } = await supabaseAdmin
      .from("legal_entities")
      .select("id")
      .eq("organization_id", access.organizationId)
      .eq("id", entityId)
      .maybeSingle();

    if (entityError) {
      throw entityError;
    }

    if (!entity) {
      return errorResponse("entity_id does not belong to organization", 400);
    }

    const item = body.item || {
      id: body.item_id || body.itemId,
      name: body.item_name || body.itemName,
      quantity: body.quantity,
      reorder_level: body.reorder_level || body.reorderLevel,
    };

    if (!item?.id) {
      return errorResponse("item_id required", 400);
    }

    const requestData = await createPurchaseRequest({
      organization_id: access.organizationId,
      entity_id: entityId,
      item,
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      entityId,
      requestData,
    });
  } catch (error) {
    return errorResponse(error?.message || "Purchase request creation failed", error?.status || 500);
  }
}

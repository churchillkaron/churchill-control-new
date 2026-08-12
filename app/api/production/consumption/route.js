import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import processInventoryConsumption from "@/lib/inventory/production/consumption/workflows/processInventoryConsumption";

export async function POST(req) {
  try {
    const body = await req.json();

    const access = await requireOrganizationAccess({
      organizationId:
        body.organizationId ||
        body.organization_id,
      request: req,
    });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        {
          status: access.status,
        },
      );
    }

    const entityId =
      body.entityId ||
      body.entity_id ||
      null;

    const orderItemId =
      body.orderItemId ||
      body.order_item_id ||
      null;

    if (!entityId) {
      return NextResponse.json(
        {
          success: false,
          error: "entity_id required",
        },
        {
          status: 400,
        },
      );
    }

    if (!orderItemId) {
      return NextResponse.json(
        {
          success: false,
          error: "order_item_id required",
        },
        {
          status: 400,
        },
      );
    }

    const result = await processInventoryConsumption({
      organizationId: access.organizationId,
      entityId,
      order_item_id: orderItemId,
    });

    return NextResponse.json(
      result,
      {
        status: result.success ? 200 : 400,
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      },
    );
  }
}

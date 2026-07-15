import { NextResponse } from "next/server";

import {
  requireAuth,
} from "@/lib/shared/auth";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import createPurchaseOrder from "@/lib/inventory/procurement/purchase-orders/createPurchaseOrder";

import approvePurchaseOrder from "@/lib/inventory/procurement/purchase-orders/workflows/approvePurchaseOrder";

import generateAutomaticPurchaseOrder from "@/lib/inventory/procurement/purchase-orders/workflows/generateAutomaticPurchaseOrder";

export async function POST(req) {

  try {

    const body =
      await req.json();

    await requireAuth();

    const access =
      await requireOrganizationAccess({

        organizationId:
          body.organizationId ||
          body.organization_id,

      });

    if (!access.success) {

      return NextResponse.json(
        {
          success: false,
          error:
            access.error,
        },
        {
          status:
            access.status,
        }
      );

    }

    const result =
      await createPurchaseOrder(
        {
          ...body,
          organization_id:
            access.organizationId,
          entity_id:
            body.entity_id ||
            body.entityId ||
            null,
          supplier_party_id:
            body.supplier_party_id ||
            body.vendor_party_id ||
            body.party_id,
        }
      );

    return NextResponse.json(
      result
    );

  } catch (error) {

    return NextResponse.json(
      {

        success: false,

        error:
          error.message,
      },
      {

        status: 500,
      }
    );
  }
}

export async function PUT(req) {

  try {

    const body =
      await req.json();

    await requireAuth();

    const access =
      await requireOrganizationAccess({
        organizationId:
          body.organizationId ||
          body.organization_id,
      });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    const result =
      await approvePurchaseOrder({

        organization_id:
          access.organizationId,

        purchase_order_id:
          body.purchase_order_id ||
          body.purchaseOrderId,

        approved_by:
          body.approved_by,
      });

    return NextResponse.json(
      result
    );

  } catch (error) {

    return NextResponse.json(
      {

        success: false,

        error:
          error.message,
      },
      {

        status: 500,
      }
    );
  }
}

export async function PATCH(req) {

  try {

    const body =
      await req.json();

    await requireAuth();

    const access =
      await requireOrganizationAccess({
        organizationId:
          body.organization_id ||
          body.organizationId,
      });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    const result =
      await generateAutomaticPurchaseOrder({

        organization_id:
          access.organizationId,

        entity_id:
          body.entity_id ||
          body.entityId ||
          null,
      });

    return NextResponse.json(
      result
    );

  } catch (error) {

    return NextResponse.json(
      {

        success: false,

        error:
          error.message,
      },
      {

        status: 500,
      }
    );
  }
}

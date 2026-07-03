export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import { createVendorInvoice } from "@/lib/finance/accounts-payable/documents/createVendorInvoice";
import runThreeWayMatch from "@/lib/finance/accounts-payable/workflows/runThreeWayMatch";
import createAccountsPayableEntry from "@/lib/finance/accounts-payable/capabilities/createAccountsPayableEntry";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const access =
      await requireOrganizationAccess({

        organizationId:
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
      await createVendorInvoice({

        organizationId:
          access.organizationId,

        entityId:
          body.entityId,

        invoiceNumber:
          body.invoice_number,

        vendorId:
          body.vendor_id,

        invoiceDate:
          body.invoice_date,

        dueDate:
          body.due_date,

        subtotal:
          body.subtotal,

        taxAmount:
          body.tax_amount,

        discountAmount:
          body.discount_amount,

        totalAmount:
          body.total_amount,

        currencyCode:
          body.currency_code,

        exchangeRate:
          body.exchange_rate,

        createdBy:
          body.created_by,

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

export async function PUT(req) {

  try {

    const body =
      await req.json();

    const access =
      await requireOrganizationAccess({

        organizationId:
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
      await runThreeWayMatch({

        vendor_invoice_id:
          body.vendor_invoice_id,

      });

    if (
      result.success &&
      result.matched
    ) {

      const apResult =
        await createAccountsPayableEntry({

          organization_id:
            access.organizationId,

          entity_id:
            body.entityId,

          vendor_invoice_id:
            body.vendor_invoice_id,

        });

      return NextResponse.json({

        success: true,

        match:
          result,

        accounts_payable:
          apResult,

      });

    }

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

    const access =
      await requireOrganizationAccess({

        organizationId:
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
      await createAccountsPayableEntry({

        organization_id:
          access.organizationId,

        entity_id:
          body.entityId,

        vendor_invoice_id:
          body.vendor_invoice_id,

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

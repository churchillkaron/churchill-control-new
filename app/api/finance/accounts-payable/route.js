import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import createVendorInvoice from "@/lib/finance/vendor-invoices/createVendorInvoice";
import runThreeWayMatch from "@/lib/finance/invoice-matching/runThreeWayMatch";
import createAccountsPayableEntry from "@/lib/finance/accounts-payable/createAccountsPayableEntry";

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

        organization_id:
          body.organizationId,

        tenant_id:
          access.tenantId,

        vendor_id:
          body.vendor_id,

        invoice_number:
          body.invoice_number,

        invoice_date:
          body.invoice_date,

        total_amount:
          body.total_amount,

        purchase_order_id:
          body.purchase_order_id || null,

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

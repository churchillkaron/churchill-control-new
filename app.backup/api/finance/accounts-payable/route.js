import { NextResponse } from "next/server";

import createVendorInvoice from "@/lib/finance/vendor-invoices/createVendorInvoice";

import runThreeWayMatch from "@/lib/finance/invoice-matching/runThreeWayMatch";

import createAccountsPayableEntry from "@/lib/finance/accounts-payable/createAccountsPayableEntry";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await createVendorInvoice(
        body
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

    const result =
      await runThreeWayMatch({

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

export async function PATCH(req) {

  try {

    const body =
      await req.json();

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

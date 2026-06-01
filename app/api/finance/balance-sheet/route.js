import { NextResponse }
from "next/server";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function GET(request) {

  const {
    searchParams,
  } = new URL(
    request.url
  );

  const access =
    await requireOrganizationAccess({

      organizationId:
        searchParams.get(
          "organizationId"
        ),

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

  const tenantId =
    access.tenantId;

  const {
    data: ledger,
    error,
  } = await supabaseAdmin

    .from("general_ledger")

    .select(`
      *,
      chart_of_accounts!fk_general_ledger_account (
        id,
        code,
        name,
        category
      )
    `)

    .eq(
      "tenant_id",
      tenantId
    )

    .order(
      "created_at",
      { ascending: false }
    )

    .limit(5000);

  if (error) {

    return NextResponse.json({

      success: false,

      error:
        error.message,

    }, {

      status: 500,

    });

  }

  const summary = {

    assets: 0,

    liabilities: 0,

    equity: 0,

  };

  for (const line of ledger || []) {

    const account =
      Array.isArray(
        line.chart_of_accounts
      )
        ? line.chart_of_accounts[0]
        : line.chart_of_accounts;
    const category =
      String(
        account?.category || ""
      ).toLowerCase();

    const debit =
      Number(line.debit || 0);

    const credit =
      Number(line.credit || 0);

    
    // -------------------
    // ASSETS
    // -------------------

    if (
      category.includes(
        "asset"
      )
    ) {

      summary.assets +=
        debit - credit;

    }

    // -------------------
    // LIABILITIES
    // -------------------

    else if (
      category.includes(
        "liabil"
      )
    ) {

      summary.liabilities +=
        credit - debit;

    }

    // -------------------
    // EQUITY
    // -------------------

    else if (
      category.includes(
        "equity"
      )
    ) {

      summary.equity +=
        credit - debit;

    }

  }



  const balanced =

    Math.abs(

      summary.assets -

      (

        summary.liabilities +

        summary.equity

      )

    ) < 0.01;

  return NextResponse.json({

    success: true,

    tenantId,

    summary,

    balanced,

  });

}

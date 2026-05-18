import { NextResponse } from "next/server";

import importBankStatement from "@/lib/finance/statement-import/importBankStatement";

import runBankReconciliation from "@/lib/finance/reconciliation/runBankReconciliation";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await importBankStatement({

        tenant_id:
          body.tenant_id,

        transactions:
          body.transactions || [],
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

    const result =
      await runBankReconciliation({

        tenant_id:
          body.tenant_id,
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

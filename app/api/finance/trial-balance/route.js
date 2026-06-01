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
      { ascending: true }
    )

    .limit(10000);

  if (error) {

    return NextResponse.json({

      success: false,

      error:
        error.message,

    }, {

      status: 500,

    });

  }

  const accounts = {};

  for (const line of ledger || []) {

    const account =
      Array.isArray(
        line.chart_of_accounts
      )
        ? line.chart_of_accounts[0]
        : line.chart_of_accounts;

    const accountId =
      account?.id;

    if (!accountId) {
      continue;
    }

    if (!accounts[accountId]) {

      accounts[accountId] = {

        account_id:
          account.id,

        code:
          account.code,

        name:
          account.name,

        category:
          account.category,

        total_debits: 0,

        total_credits: 0,

        balance: 0,

      };

    }

    const debit =
      Number(line.debit || 0);

    const credit =
      Number(line.credit || 0);

    accounts[accountId]
      .total_debits += debit;

    accounts[accountId]
      .total_credits += credit;

    accounts[accountId]
      .balance += (
        debit - credit
      );

  }

  const rows =
    Object.values(accounts)

      .sort((a, b) =>
        String(a.code)
          .localeCompare(
            String(b.code)
          )
      );

  const totalDebits =

    rows.reduce(

      (sum, row) =>

        sum +
        row.total_debits,

      0

    );

  const totalCredits =

    rows.reduce(

      (sum, row) =>

        sum +
        row.total_credits,

      0

    );

  const balanced =

    Math.abs(
      totalDebits -
      totalCredits
    ) < 0.01;

  return NextResponse.json({

    success: true,

    tenantId,

    rows,

    totalDebits,

    totalCredits,

    balanced,

  });

}

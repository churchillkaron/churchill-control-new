import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import createBudget from "@/lib/finance/budgeting/documents/createBudget";

import generateFinancialForecast from "@/lib/finance/budgeting/workflows/generateFinancialForecast";

import runVarianceAnalysis from "@/lib/finance/reporting/capabilities/runVarianceAnalysis";

async function resolveTenant(body) {
  const access =
    await requireOrganizationAccess({
      organizationId:
        body.organizationId,
    });

  return access;
}

export async function POST(req) {
  try {
    const body =
      await req.json();

    const access =
      await resolveTenant(body);

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
      await createBudget({
        ...body,
        organization_id:
          access.organizationId,
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
      await resolveTenant(body);

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
      await generateFinancialForecast({
        organization_id:
          access.organizationId,
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

    const access =
      await resolveTenant(body);

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
      await runVarianceAnalysis({
        organization_id:
          access.organizationId,

        fiscal_year:
          body.fiscal_year,
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

import { NextResponse } from "next/server";

import createLegalEntity from "@/lib/finance/legal-entities/createLegalEntity";
import createIntercompanyTransaction from "@/lib/finance/intercompany/createIntercompanyTransaction";
import generateConsolidatedFinancials from "@/lib/finance/consolidation/generateConsolidatedFinancials";

export async function POST(req) {
  try {
    const body = await req.json();

    const result = await createLegalEntity({
      organization_id: body.organization_id,
      code: body.code,
      legal_name: body.legal_name,
      display_name: body.display_name,
      tax_id: body.tax_id,
      registration_number: body.registration_number,
      country: body.country,
      currency: body.currency,
      address: body.address,
      phone: body.phone,
      email: body.email,
      is_holding_company: body.is_holding_company,
    });

    return NextResponse.json(result);

  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}

export async function PUT(req) {
  try {
    const body = await req.json();

    const result =
      await createIntercompanyTransaction(body);

    return NextResponse.json(result);

  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}

export async function PATCH() {
  try {

    const result =
      await generateConsolidatedFinancials();

    return NextResponse.json(result);

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}

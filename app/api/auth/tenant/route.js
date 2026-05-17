import { NextResponse } from "next/server";

import requireTenantAccess from "@/lib/auth/requireTenantAccess";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await requireTenantAccess(
        body.tenant_id
      );

    return NextResponse.json(
      result
    );

  } catch (error) {

    return NextResponse.json(
      {
        allowed: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    );
  }
}

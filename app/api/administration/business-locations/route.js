import { NextResponse } from "next/server";

import {
  getBusinessLocations,
  createBusinessLocation,
  updateBusinessLocation,
  archiveBusinessLocation,
} from "@/lib/platform/administration/business-locations/runtime/BusinessLocationRuntime";

export async function GET(request) {

  try {

    const organization_id =
      request.nextUrl.searchParams.get("organization_id");

    if (!organization_id) {
      return NextResponse.json(
        { error: "organization_id required" },
        { status: 400 }
      );
    }

    const rows =
      await getBusinessLocations(organization_id);

    return NextResponse.json({ rows });

  } catch (error) {

    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );

  }

}

export async function POST(request) {

  try {

    const body = await request.json();

    const row =
      await createBusinessLocation(body);

    return NextResponse.json(row);

  } catch (error) {

    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );

  }

}

export async function PATCH(request) {

  try {

    const body = await request.json();

    const row =
      await updateBusinessLocation(
        body.id,
        body
      );

    return NextResponse.json(row);

  } catch (error) {

    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );

  }

}

export async function DELETE(request) {

  try {

    const { id } =
      await request.json();

    await archiveBusinessLocation(id);

    return NextResponse.json({
      success: true,
    });

  } catch (error) {

    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );

  }

}

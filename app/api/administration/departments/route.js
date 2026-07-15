import { NextResponse } from "next/server";

import {
  getDepartments,
  createDepartment,
  updateDepartment,
  archiveDepartment,
} from "@/lib/platform/administration/departments/runtime/DepartmentRuntime";

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

    return NextResponse.json({
      rows: await getDepartments(organization_id),
    });

  } catch (error) {

    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );

  }

}

export async function POST(request) {

  try {

    return NextResponse.json(
      await createDepartment(
        await request.json()
      )
    );

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

    return NextResponse.json(
      await updateDepartment(
        body.id,
        body
      )
    );

  } catch (error) {

    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );

  }

}

export async function DELETE(request) {

  try {

    const { id } = await request.json();

    await archiveDepartment(id);

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

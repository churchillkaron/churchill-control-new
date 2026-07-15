import { NextResponse } from "next/server";

import {
  getTeams,
  createTeam,
  updateTeam,
  archiveTeam,
} from "@/lib/platform/administration/teams/runtime/TeamRuntime";

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
      rows: await getTeams(organization_id),
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
      await createTeam(
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
      await updateTeam(
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

    await archiveTeam(id);

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

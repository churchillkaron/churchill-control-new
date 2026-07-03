import { NextResponse } from "next/server";
import { getObjectConfigurationGroups } from "@/lib/configuration/getObjectConfigurationGroups";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const objectType =
      searchParams.get("object_type") ||
      searchParams.get("objectType");

    const objectId =
      searchParams.get("object_id") ||
      searchParams.get("objectId");

    if (!objectType || !objectId) {
      return NextResponse.json(
        {
          success: false,
          error: "object_type and object_id required",
        },
        { status: 400 }
      );
    }

    const groups =
      await getObjectConfigurationGroups({
        objectType,
        objectId,
      });

    return NextResponse.json({
      success: true,
      groups,
    });

  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

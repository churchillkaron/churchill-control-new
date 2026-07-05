import { NextResponse } from "next/server";
import { CreativeMissionRuntime } from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const organization_id = searchParams.get("organization_id");
    const workspace_id = searchParams.get("workspace_id");

    if (!organization_id) {
      return NextResponse.json(
        { error: "organization_id required" },
        { status: 400 }
      );
    }

    await requireOrganizationAccess({ organization_id });

    const missions = await CreativeMissionRuntime.list({
      organization_id,
      workspace_id,
    });

    return NextResponse.json({ missions });
  } catch (error) {
    console.error("creative missions GET", error);

    return NextResponse.json(
      { error: error.message || "Failed to load creative missions" },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const body = await req.json();

    if (!body.organization_id) {
      return NextResponse.json(
        { error: "organization_id required" },
        { status: 400 }
      );
    }

    await requireOrganizationAccess({
      organization_id: body.organization_id,
    });

    let mission;

    if (body.id && body.action) {
      if (body.action === "start") {
        mission = await CreativeMissionRuntime.start(body.id);
      } else if (body.action === "pause") {
        mission = await CreativeMissionRuntime.pause(body.id);
      } else if (body.action === "complete") {
        mission = await CreativeMissionRuntime.complete(
          body.id,
          body.learning_summary || null
        );
      } else if (body.action === "archive") {
        mission = await CreativeMissionRuntime.archive(body.id);
      } else {
        mission = await CreativeMissionRuntime.update(body.id, body.patch || {});
      }
    } else if (body.id) {
      mission = await CreativeMissionRuntime.update(body.id, body.patch || body);
    } else {
      mission = await CreativeMissionRuntime.create(body);
    }

    return NextResponse.json({ mission });
  } catch (error) {
    console.error("creative missions POST", error);

    return NextResponse.json(
      { error: error.message || "Failed to save creative mission" },
      { status: 500 }
    );
  }
}

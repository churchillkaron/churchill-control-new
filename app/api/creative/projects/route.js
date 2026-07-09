export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

function resolveOrganizationId(input = {}) {
  return (
    input.organizationId ||
    input.organization_id ||
    null
  );
}

export async function GET(req) {
  try {
    const { searchParams } =
      new URL(req.url);

    const organizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");

    const access =
      await requireOrganizationAccess({
        organizationId,
      });

    if (!access.success) {
      return NextResponse.json(
        access,
        { status: access.status || 401 }
      );
    }

    const projects =
      await CreativeProjectRuntime.list({
        organizationId,
      });

    return NextResponse.json({
      success: true,
      projects,
      data: projects,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body =
      await req.json();

    const organizationId =
      resolveOrganizationId(body);

    const access =
      await requireOrganizationAccess({
        organizationId,
      });

    if (!access.success) {
      return NextResponse.json(
        access,
        { status: access.status || 401 }
      );
    }

    let project;

    if (body.id && body.action === "archive") {
      project =
        await CreativeProjectRuntime.archive(
          body.id
        );
    } else if (body.id && body.action === "duplicate") {
      project =
        await CreativeProjectRuntime.duplicate(
          body.id
        );
    } else if (body.id && body.action === "transition") {
      project =
        await CreativeProjectRuntime.transition(
          body.id,
          body.status
        );
    } else if (body.id) {
      project =
        await CreativeProjectRuntime.update(
          body.id,
          {
            ...body,
            organization_id:
              organizationId,
          }
        );
    } else {
      project =
        await CreativeProjectRuntime.create({
          ...body,
          organization_id:
            organizationId,
        });
    }

    return NextResponse.json({
      success: true,
      project,
      data: project,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}

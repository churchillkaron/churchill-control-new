import { NextResponse } from "next/server";

import {
  applyWorkspaceTemplate,
} from "@/lib/platform/templates/applyWorkspaceTemplate";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

const TEMPLATE_ADMIN_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);

function cleanValue(value) {
  const normalized = String(value ?? "").trim();

  if (
    !normalized ||
    normalized === "undefined" ||
    normalized === "null"
  ) {
    return null;
  }

  return normalized;
}

function errorResponse(error, status) {
  return NextResponse.json(
    {
      success: false,
      error,
    },
    {
      status,
    }
  );
}

export async function POST(request) {
  try {
    const body = await request.json();

    const organizationId = cleanValue(
      body.organizationId ||
      body.organization_id
    );

    const templateId = cleanValue(
      body.templateId ||
      body.template_id
    );

    if (!organizationId || !templateId) {
      return errorResponse(
        "organizationId and templateId are required",
        400
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return errorResponse(
        access.error,
        access.status
      );
    }

    const role = String(
      access.role ||
      access.staff?.role ||
      ""
    )
      .trim()
      .toUpperCase();

    if (!TEMPLATE_ADMIN_ROLES.has(role)) {
      return errorResponse(
        "Organization owner access required",
        403
      );
    }

    const result = await applyWorkspaceTemplate({
      organizationId: access.organizationId,
      templateId,
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      installed: result.length,
      modules: result,
    });
  } catch (error) {
    console.error("WORKSPACE_TEMPLATE_APPLY_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to apply workspace template",
      },
      {
        status: 500,
      }
    );
  }
}

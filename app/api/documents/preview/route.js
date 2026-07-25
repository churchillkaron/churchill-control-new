import {
  renderDocument,
} from "@/lib/platform/documents";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(request) {
  try {
    const body = await request.json();

    const access = await requireOrganizationAccess({
      organizationId:
        body.organizationId ||
        body.organization_id,
    });

    if (!access.success) {
      return Response.json(
        {
          success: false,
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    const documentType = String(
      body.documentType || ""
    ).trim();

    if (!documentType) {
      return Response.json(
        {
          success: false,
          error: "documentType required",
        },
        {
          status: 400,
        }
      );
    }

    const rendered = await renderDocument({
      documentType,
      data: body.data || {},
      organizationId: access.organizationId,
      entityId:
        body.entityId ||
        body.entity_id ||
        null,
    });

    return Response.json({
      success: true,
      rendered,
    });
  } catch (error) {
    console.error(
      "DOCUMENT PREVIEW ERROR",
      error
    );

    return Response.json(
      {
        success: false,
        error:
          error.message ||
          "Document preview failed",
      },
      {
        status: 500,
      }
    );
  }
}

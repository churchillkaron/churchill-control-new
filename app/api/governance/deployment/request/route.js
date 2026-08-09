import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  createApprovalRequest,
} from "@/lib/shared/approvals/createApprovalRequest";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(req) {
  try {
    const body =
      await req.json();

    const access =
      await requireOrganizationAccess({
        organizationId:
          body.organizationId ||
          body.organization_id,
        request: req,
      });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    const entityId =
      body.entity_id ||
      body.entityId ||
      null;

    if (entityId) {
      const {
        data: entity,
        error: entityError,
      } = await supabaseAdmin
        .from("legal_entities")
        .select("id")
        .eq("organization_id", access.organizationId)
        .eq("id", entityId)
        .maybeSingle();

      if (entityError) {
        throw entityError;
      }

      if (!entity) {
        return NextResponse.json(
          {
            success: false,
            error: "entity_id does not belong to organization",
          },
          {
            status: 400,
          }
        );
      }
    }

    const approvalRequest =
      await createApprovalRequest({
        organizationId:
          access.organizationId,
        workflowType:
          "deployment",
        referenceTable:
          entityId
            ? "legal_entities"
            : "organizations",
        referenceId:
          entityId || access.organizationId,
        requestedBy:
          access.userId,
      });

    return NextResponse.json({
      success: true,
      organizationId:
        access.organizationId,
      entityId,
      approvalRequest,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status:
          error.status || 500,
      }
    );
  }
}

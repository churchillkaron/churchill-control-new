import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  runComplianceValidation,
} from "@/lib/governance/finance/runComplianceValidation";

import {
  createApprovalRequest,
} from "@/lib/shared/approvals/createApprovalRequest";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import logAuditEvent from "@/lib/audit/logAuditEvent";

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
      body.payload?.entity_id ||
      body.payload?.entityId ||
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

    const policy =
      await runComplianceValidation({
        organizationId:
          access.organizationId,
        entityId,
      });

    const actionType =
      body.action_type ||
      body.actionType ||
      "governance_automation";

    let execution = {
      success: true,
      auto_approved: true,
    };

    if (body.requiresApproval) {
      const approvalRequest =
        await createApprovalRequest({
          organizationId:
            access.organizationId,
          workflowType:
            actionType,
          referenceTable:
            entityId
              ? "legal_entities"
              : "organizations",
          referenceId:
            entityId || access.organizationId,
          requestedBy:
            access.userId,
        });

      execution = {
        success: true,
        auto_approved: false,
        approvalRequest,
      };
    }

    const audit =
      await logAuditEvent({
        organization_id:
          access.organizationId,
        entity_type:
          "governance",
        entity_id:
          entityId,
        action_type:
          actionType,
        performed_by:
          access.userId,
        performed_by_name:
          access.userEmail ||
          access.staff?.name ||
          "SYSTEM",
        metadata: {
          policy,
          execution,
          payload:
            body.payload || {},
        },
      });

    return NextResponse.json({
      success: true,
      governance: {
        organizationId:
          access.organizationId,
        entityId,
        policy,
        execution,
        audit,
      },
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

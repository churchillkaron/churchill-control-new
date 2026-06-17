import { NextResponse } from "next/server";

import {
  requireAuth,
} from "@/lib/shared/auth";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  runComplianceValidation,
} from "@/lib/governance/finance/runComplianceValidation";

import { createApprovalRequest } from "@/lib/finance/createApprovalRequest";

import logAuditEvent from "@/lib/audit/logAuditEvent";

export async function POST(req) {

  try {

    const body =
      await req.json();

    await requireAuth();

    const access =
      await requireOrganizationAccess({

        organizationId:
          body.organizationId,

      });

    if (!access.success) {

      return NextResponse.json(
        {
          success: false,
          error:
            access.error,
        },
        {
          status:
            access.status,
        }
      );

    }

    const tenant_id =
      access.tenantId;

    if (!tenant_id) {

      return NextResponse.json(
        {
          success: false,
          error: "Missing tenant context",
        },
        {
          status: 400,
        }
      );

    }

    const policy =
      await runComplianceValidation({
        tenantId:
          tenant_id,
      });

    let execution = {
      success: true,
      auto_approved: true,
    };

    if (
      body.requiresApproval
    ) {

      const approvalRequest =
        await createApprovalRequest({

          tenant_id:
            tenant_id,

          type:
            body.action_type || "governance_automation",

          entity_id:
            body.payload?.entity_id || null,

          requested_by:
            body.requested_by || "SYSTEM",

          metadata:
            body.payload || {},

        });

      execution = {

        success: true,

        auto_approved: false,

        approvalRequest,

      };

    }

    const audit =
      await logAuditEvent({

        tenant_id:
          tenant_id,

        action_type:
          body.action_type ||

          "governance_automation",

        entity_type:
          "governance",

        metadata: {

          policy,

          execution,

        },

      });

    return NextResponse.json({

      success: true,

      governance: {

        policy,

        execution,

        audit,

      },

    });

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    );

  }

}

import { NextResponse } from "next/server";

import {
  runComplianceValidation,
} from "@/lib/governance/finance/runComplianceValidation";

import {
  createApprovalWorkflow,
} from "@/lib/governance/finance/createApprovalWorkflow";

import logAuditEvent
from "@/lib/audit/logAuditEvent";

export async function POST(req) {

  try {

    const body =
      await req.json();

    if (!body.tenant_id) {

      return NextResponse.json(
        {
          success: false,
          error: "Missing tenant_id",
        },
        {
          status: 400,
        }
      );

    }

    const policy =
      await runComplianceValidation({
        tenantId:
          body.tenant_id,
      });

    let execution = {
      success: true,
      auto_approved: true,
    };

    if (
      body.requiresApproval
    ) {

      const workflow =
        await createApprovalWorkflow({

          tenant_id:
            body.tenant_id,

          action_type:
            body.action_type,

          payload:
            body.payload || {},

        });

      execution = {

        success: true,

        auto_approved: false,

        workflow,

      };

    }

    const audit =
      await logAuditEvent({

        tenant_id:
          body.tenant_id,

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

import { NextResponse } from "next/server";

import evaluatePolicy from "@/lib/governance/policies/evaluatePolicy";

import requestApproval from "@/lib/governance/approvals/requestApproval";

import createAuditRecord from "@/lib/governance/audit/createAuditRecord";

export async function POST(req) {

  try {

    const body =
      await req.json();

    // ===== POLICY =====
    const policy =
      await evaluatePolicy({

        action_type:
          body.action_type,

        priority:
          body.priority,

        amount:
          body.amount || 0,
      });

    let execution = null;

    // ===== APPROVAL =====
    if (
      policy.policy
        ?.approval_required
    ) {

      execution =
        await requestApproval({

          tenant_id:
            body.tenant_id || "demo",

          action_type:
            body.action_type,

          payload:
            body.payload || {},

          risk_level:
            policy.policy
              ?.risk_level,
        });

    } else {

      execution = {

        success: true,

        auto_approved:
          true,
      };
    }

    // ===== AUDIT =====
    const audit =
      await createAuditRecord({

        tenant_id:
          body.tenant_id || "demo",

        action_type:
          body.action_type,

        execution_result:
          execution.success
            ? "SUCCESS"
            : "FAILED",

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

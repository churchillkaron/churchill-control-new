import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function buildAIComplianceGovernance({
  tenant_id,
}) {

  try {

    const [
      auditResponse,
      payrollResponse,
      accountingResponse,
    ] = await Promise.all([

      supabaseAdmin
        .from("audit_logs")
        .select(`
          id,
          action,
          created_at
        `)
        .eq(
          "tenant_id",
          tenant_id
        )
        .limit(5000),

      supabaseAdmin
        .from("staff_attendance")
        .select(`
          id,
          late_minutes,
          status,
          created_at
        `)
        .eq(
          "tenant_id",
          tenant_id
        )
        .limit(5000),

      supabaseAdmin
        .from("journal_entries")
        .select(`
          id,
          debit,
          credit,
          created_at
        `)
        .eq(
          "tenant_id",
          tenant_id
        )
        .limit(5000),
    ]);

    if (
      auditResponse.error
    ) {
      throw auditResponse.error;
    }

    if (
      payrollResponse.error
    ) {
      throw payrollResponse.error;
    }

    if (
      accountingResponse.error
    ) {
      throw accountingResponse.error;
    }

    const auditLogs =
      auditResponse.data || [];

    const attendance =
      payrollResponse.data || [];

    const accounting =
      accountingResponse.data || [];

    const violations = [];

    const suspiciousAccounting =
      accounting.filter(
        (entry) => {

          const debit =
            Number(
              entry.debit || 0
            );

          const credit =
            Number(
              entry.credit || 0
            );

          return (
            debit <= 0 &&
            credit <= 0
          );
        }
      );

    if (
      suspiciousAccounting.length > 0
    ) {

      violations.push({

        type:
          "ACCOUNTING_COMPLIANCE",

        severity:
          "HIGH",

        count:
          suspiciousAccounting.length,

        recommendation:
          "Invalid accounting entries detected requiring immediate review.",
      });
    }

    const excessiveLate =
      attendance.filter(
        (item) =>
          Number(
            item.late_minutes || 0
          ) > 30
      );

    if (
      excessiveLate.length > 0
    ) {

      violations.push({

        type:
          "WORKFORCE_COMPLIANCE",

        severity:
          "MEDIUM",

        count:
          excessiveLate.length,

        recommendation:
          "Excessive employee lateness detected.",
      });
    }

    const destructiveActions =
      auditLogs.filter(
        (log) =>
          String(
            log.action || ""
          )
            .toLowerCase()
            .includes(
              "delete"
            )
      );

    if (
      destructiveActions.length > 50
    ) {

      violations.push({

        type:
          "AUDIT_ACTIVITY",

        severity:
          "HIGH",

        count:
          destructiveActions.length,

        recommendation:
          "Elevated destructive activity detected in audit logs.",
      });
    }

    const complianceScore =
      Math.max(
        0,
        100 -
          violations.length * 15
      );

    return {

      success: true,

      compliance_summary: {

        score:
          complianceScore,

        violations:
          violations.length,

        audit_logs:
          auditLogs.length,

        attendance_records:
          attendance.length,

        accounting_records:
          accounting.length,
      },

      violations,

      generated_at:
        new Date().toISOString(),
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}

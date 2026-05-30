import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export default async function buildPayrollIntelligence({

  tenant_id,

}) {

  try {

    // =====================================
    // LOAD PAYROLL RECORDS
    // =====================================

    const {
      data: payroll,
      error,
    } = await supabaseAdmin

      .from(
        "payroll_records"
      )

      .select("*")

      .eq(
        "tenant_id",
        tenant_id
      )

      .limit(1000);

    if (error) {

      throw error;

    }

    // =====================================
    // CORE METRICS
    // =====================================

    let totalPayroll = 0;

    let totalDeductions = 0;

    let totalOvertime = 0;

    let disputedPayroll = 0;

    let archivedPayroll = 0;

    let lockedPayroll = 0;

    let finalizedPayroll = 0;

    const departments = {};

    const risks = [];

    // =====================================
    // ANALYSIS
    // =====================================

    for (const row of payroll || []) {

      const finalSalary =

        Number(
          row.final_salary || 0
        );

      const deductions =

        Number(
          row.deductions || 0
        );

      const overtime =

        Number(
          row.overtime_pay || 0
        );

      totalPayroll +=
        finalSalary;

      totalDeductions +=
        deductions;

      totalOvertime +=
        overtime;

      // =====================================
      // STATUS ANALYSIS
      // =====================================

      if (
        row.status ===
        "DISPUTED"
      ) {

        disputedPayroll += 1;

        risks.push({

          type:
            "PAYROLL_DISPUTE",

          severity:
            "HIGH",

          staff:
            row.staff_name,

          message:
            "Payroll dispute requires review",

        });

      }

      if (
        row.status ===
        "ARCHIVED"
      ) {

        archivedPayroll += 1;

      }

      if (
        row.status ===
        "LOCKED"
      ) {

        lockedPayroll += 1;

      }

      if (
        row.status ===
        "FINALIZED"
      ) {

        finalizedPayroll += 1;

      }

      // =====================================
      // DEPARTMENT ANALYSIS
      // =====================================

      const department =

        row.department_cost_center ||

        "GENERAL";

      if (
        !departments[
          department
        ]
      ) {

        departments[
          department
        ] = {

          department,

          payroll: 0,

          deductions: 0,

          overtime: 0,

          staff_count: 0,

        };

      }

      departments[
        department
      ].payroll +=
        finalSalary;

      departments[
        department
      ].deductions +=
        deductions;

      departments[
        department
      ].overtime +=
        overtime;

      departments[
        department
      ].staff_count += 1;

      // =====================================
      // ATTENDANCE RISK
      // =====================================

      if (
        Number(
          row.attendance_score || 100
        ) < 70
      ) {

        risks.push({

          type:
            "ATTENDANCE_RISK",

          severity:
            "MEDIUM",

          staff:
            row.staff_name,

          message:
            "Low attendance score detected",

        });

      }

      // =====================================
      // HIGH OVERTIME RISK
      // =====================================

      if (
        overtime > (
          finalSalary * 0.3
        )
      ) {

        risks.push({

          type:
            "OVERTIME_RISK",

          severity:
            "MEDIUM",

          staff:
            row.staff_name,

          message:
            "Overtime exceeds 30% of salary",

        });

      }

    }

    // =====================================
    // RANK DEPARTMENTS
    // =====================================

    const rankedDepartments =

      Object.values(
        departments
      )

      .sort(
        (a, b) =>
          b.payroll -
          a.payroll
      );

    // =====================================
    // PAYROLL HEALTH SCORE
    // =====================================

    let payrollHealth = 100;

    payrollHealth -=
      disputedPayroll * 10;

    payrollHealth -=
      risks.length * 2;

    if (
      payrollHealth < 0
    ) {

      payrollHealth = 0;

    }

    // =====================================
    // RETURN
    // =====================================

    return {

      success: true,

      payroll_health:
        payrollHealth,

      payroll_summary: {

        total_payroll:
          Number(
            totalPayroll.toFixed(2)
          ),

        total_deductions:
          Number(
            totalDeductions.toFixed(2)
          ),

        total_overtime:
          Number(
            totalOvertime.toFixed(2)
          ),

        total_staff:
          payroll?.length || 0,

        disputed_payroll:
          disputedPayroll,

        archived_payroll:
          archivedPayroll,

        locked_payroll:
          lockedPayroll,

        finalized_payroll:
          finalizedPayroll,

      },

      departments:
        rankedDepartments,

      risks,

      payroll:
        payroll || [],

      generated_at:
        new Date()
          .toISOString(),

    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,

    };

  }

}

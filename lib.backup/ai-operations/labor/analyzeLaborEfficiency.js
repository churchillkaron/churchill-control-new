import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function analyzeLaborEfficiency({
  tenant_id,
}) {

  try {

    const {
      data: staff,
      error,
    } = await supabaseAdmin
      .from("staff_accounts")
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      );

    if (error) {
      throw error;
    }

    const totalSalary =
      (staff || []).reduce(
        (
          sum,
          member
        ) =>
          sum +
          Number(
            member.salary || 0
          ),
        0
      );

    const employeeCount =
      staff?.length || 0;

    const avgLaborCost =
      employeeCount > 0
        ? totalSalary /
          employeeCount
        : 0;

    return {

      success: true,

      employees:
        employeeCount,

      total_salary:
        totalSalary,

      average_labor_cost:
        Number(
          avgLaborCost.toFixed(2)
        ),
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}

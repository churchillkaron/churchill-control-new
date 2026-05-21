import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function calculatePayroll({
  tenant_id,
}) {
  try {
    const { data: staff } = await supabaseAdmin
      .from("staff_accounts")
      .select("*")
      .eq("tenant_id", tenant_id);

    const payroll = (staff || []).map((member) => ({
      user_id: member.id,
      role: member.role,
      salary: Number(member.salary || 0),
    }));

    const totalPayroll = payroll.reduce(
      (sum, item) => sum + item.salary,
      0
    );

    return {
      success: true,
      total_payroll: totalPayroll,
      payroll,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

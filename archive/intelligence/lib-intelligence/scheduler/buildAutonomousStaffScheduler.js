import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import buildDemandPredictionAI from "@/lib/intelligence/demand/buildDemandPredictionAI";

export default async function buildAutonomousStaffScheduler({
  tenant_id,
}) {

  try {

    const demand =
      await buildDemandPredictionAI({
        tenant_id,
      });

    const {
      data: staff,
      error,
    } = await supabaseAdmin
      .from("staff_accounts")
      .select(`
        id,
        name,
        role
      `)
      .eq(
        "tenant_id",
        tenant_id
      )
      .limit(1000);

    if (error) {
      throw error;
    }

    const peakDay =
      demand?.peak_day?.day ||
      "Friday";

    const lowDay =
      demand?.lowest_day?.day ||
      "Monday";

    const schedules = [];

    for (const employee of staff || []) {

      let shift =
        "NORMAL_SHIFT";

      let hours = 8;

      if (
        employee.role ===
        "manager"
      ) {

        shift =
          "EXECUTIVE_SHIFT";

        hours = 10;
      }

      schedules.push({

        employee:
          employee.name,

        role:
          employee.role,

        assigned_peak_day:
          peakDay,

        assigned_low_day:
          lowDay,

        shift,

        hours,
      });
    }

    return {

      success: true,

      peak_day:
        peakDay,

      low_day:
        lowDay,

      schedules,

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

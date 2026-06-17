import { accountingRuntime } from "@/lib/platform/industries/runtime/accounting";
import { entertainmentRuntime } from "@/lib/platform/industries/runtime/entertainment";
import { constructionRuntime } from "@/lib/platform/industries/runtime/construction";
import { pestControlRuntime } from "@/lib/platform/industries/runtime/pestControl";
import { healthcareRuntime } from "@/lib/platform/industries/runtime/healthcare";
import { hotelRuntime } from "@/lib/platform/industries/runtime/hotel";
import { restaurantRuntime } from "@/lib/platform/industries/runtime/restaurant";
import { retailRuntime } from "@/lib/platform/industries/runtime/retail";

const runtimes = {
  accounting: accountingRuntime,
  entertainment: entertainmentRuntime,
  construction: constructionRuntime,
  pest_control: pestControlRuntime,
  healthcare: healthcareRuntime,
  hotel: hotelRuntime,
  restaurant: restaurantRuntime,
  retail: retailRuntime,
};

export function getIndustryRuntime(
  industryId,
  organization
) {
  if (
    organization &&
    organization.role === "PLATFORM_OWNER"
  ) {
    const allDashboards = [];

    Object.values(runtimes).forEach(r => {
      if (r.dashboards) {
        allDashboards.push(
          ...r.dashboards
        );
      }
    });

    return {
      dashboards: allDashboards,
    };
  }

  return (
    runtimes[industryId] || null
  );
}

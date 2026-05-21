import {
  getPlatformAreas,
} from "@/lib/platform/core/platformEngine";

export async function getTenantPlatform(
  tenant
) {

  const platformAreas =
    getPlatformAreas();

  return {

    tenant,

    platform: {

      areas:
        platformAreas,

      operations:
        platformAreas.find(
          area =>

            area.id ===
            "operations"
        ),

      business:
        platformAreas.find(
          area =>

            area.id ===
            "business"
        ),

      staff:
        platformAreas.find(
          area =>

            area.id ===
            "staff"
        ),

      creative:
        platformAreas.find(
          area =>

            area.id ===
            "creative"
        ),

      insights:
        platformAreas.find(
          area =>

            area.id ===
            "insights"
        ),

      intelligence:
        platformAreas.find(
          area =>

            area.id ===
            "intelligence"
        ),

    },

  };

}

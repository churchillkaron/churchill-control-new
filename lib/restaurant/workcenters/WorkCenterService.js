import {
  loadWorkCenters,
} from "@/lib/restaurant/settings/WorkCenterRepository";

export async function resolveWorkCenter({
  organizationId,
  workCenterId,
}) {

  if (!workCenterId) {
    throw new Error(
      "workCenterId is required."
    );
  }

  const centers =
    await loadWorkCenters(
      organizationId
    );

  const center =
    centers.find(
      c => c.id === workCenterId
    );

  if (!center) {
    throw new Error(
      `Unknown work center: ${workCenterId}`
    );
  }

  return center;

}

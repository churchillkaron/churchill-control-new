import {
  KitchenSettings,
} from "../documents/KitchenSettings";

export function mapKitchenSettings(
  row
){

  return new KitchenSettings({

    refreshIntervalMs:
      row.refresh_interval_ms,

    priorityLevels:
      row.priority_levels,

    defaultWorkCenterId:
      row.default_work_center_id,

  });

}

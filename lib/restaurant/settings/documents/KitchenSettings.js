export class KitchenSettings {

  constructor(data = {}) {

    this.refreshIntervalMs =
      data.refresh_interval_ms;

    this.priorityLevels =
      data.priority_levels;

    this.defaultWorkCenterId =
      data.default_work_center_id;

  }

}

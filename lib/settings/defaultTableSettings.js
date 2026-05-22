const defaultTableSettings = {

  // =========================
  // TABLE FLOW
  // =========================

  enable_table_locking: true,

  auto_release_paid_tables: true,

  allow_manual_table_release: true,

  allow_table_transfer: true,

  allow_table_merge: true,

  require_manager_transfer: false,

  require_manager_merge: false,

  // =========================
  // RESERVATIONS
  // =========================

  enable_reservations: true,

  reservation_hold_minutes: 15,

  auto_release_no_show: true,

  // =========================
  // CAPACITY
  // =========================

  enable_capacity_limits: false,

  enforce_max_covers: false,

  // =========================
  // RUNTIME
  // =========================

  realtime_table_sync: true,

  auto_refresh_floorplan: true,

  show_table_timers: true,

  show_server_assignment: true,

};

export default defaultTableSettings;

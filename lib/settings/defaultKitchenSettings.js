const defaultKitchenSettings = {

  // =========================
  // KITCHEN FLOW
  // =========================

  auto_fire_orders: true,

  auto_bump_completed: false,

  require_expo_confirmation: false,

  enable_course_firing: false,

  enable_priority_orders: true,

  // =========================
  // SLA / TIMERS
  // =========================

  enable_sla_monitoring: true,

  warning_time_minutes: 15,

  critical_time_minutes: 30,

  auto_alert_delays: true,

  // =========================
  // STATIONS
  // =========================

  enable_station_routing: true,

  enable_bar_station: true,

  enable_grill_station: true,

  enable_fryer_station: true,

  enable_dessert_station: true,

  // =========================
  // DISPLAY
  // =========================

  realtime_updates: true,

  enable_sound_alerts: true,

  show_completed_orders: true,

  completed_order_timeout_seconds: 30,

  // =========================
  // PRINTING
  // =========================

  enable_kitchen_printing: false,

  enable_duplicate_printing: false,

  auto_print_on_fire: false,

};

export default defaultKitchenSettings;

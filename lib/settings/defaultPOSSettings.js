const defaultPOSSettings = {

  // =========================
  // ORDER FLOW
  // =========================

  auto_fire_kitchen: true,

  require_table_assignment: true,

  allow_split_payment: true,

  auto_complete_paid_orders: false,

  allow_order_edit_after_send: false,

  require_manager_void: true,

  allow_reopen_orders: true,

  allow_merge_tables: true,

  allow_transfer_tables: true,

  require_customer_count: false,

  auto_send_bar_tickets: true,

  auto_send_kitchen_tickets: true,

  // =========================
  // PAYMENT
  // =========================

  allow_cash_payment: true,

  allow_card_payment: true,

  allow_multi_payment: true,

  auto_print_receipt: false,

  allow_refunds: true,

  allow_partial_payment: true,

  // =========================
  // SERVICE CHARGE
  // =========================

  enable_service_charge: true,

  service_charge_percent: 5,

  // =========================
  // RUNTIME
  // =========================

  realtime_sync: true,

  kitchen_realtime_updates: true,

  offline_mode_enabled: false,

  // =========================
  // TABLES
  // =========================

  enable_table_locking: true,

  auto_release_paid_tables: true,

  // =========================
  // PRINTERS
  // =========================

  enable_receipt_printing: false,

  enable_kitchen_printing: false,

  enable_bar_printing: false,

  // =========================
  // SECURITY
  // =========================

  require_manager_discount_approval: true,

  require_manager_refund_approval: true,

};

export default defaultPOSSettings;

export const POS_MODULE = {
  module_name: "Avantiqo POS",
  module_version: "1.0.0",

  table_statuses: [
    "AVAILABLE",
    "OCCUPIED",
    "BILLING",
    "DIRTY",
    "CLOSED",
  ],

  order_statuses: {
    OPEN: "OPEN",
    BILLING: "BILLING",
    COMPLETED: "COMPLETED",
    VOID: "VOID",
  },

  item_statuses: [
    "PENDING",
    "PREPARING",
    "READY",
    "SERVED",
    "VOID",
  ],

  payment_methods: [
    "CASH",
    "CARD",
    "QR",
    "TRANSFER",
    "ROOM_CHARGE",
  ],

  service_charge_rate: 0.05,
  vat_rate: 0.07,

  features: {
    tables: true,
    kitchen: true,
    payments: true,
    split_bill: true,
    modifiers: true,
    discounts: true,
    voids: true,
    manager_approval: true,
    receipt_preview: true,
    multi_business: true,
  },
};


export function calculatePOSTotals(
  subtotal,
  settings = POS_MODULE
) {

  const serviceCharge =
    subtotal *
    (settings.service_charge_rate || 0);

  const vat =
    subtotal *
    (settings.vat_rate || 0);

  const grandTotal =
    subtotal +
    serviceCharge +
    vat;

  return {
    subtotal,
    serviceCharge,
    vat,
    grandTotal,
  };
}

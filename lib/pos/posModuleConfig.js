export const POS_MODULE = {
  module_name: "Avantiqo POS",
  module_version: "1.0.0",

  table_statuses: {
    AVAILABLE: "AVAILABLE",
    OCCUPIED: "OCCUPIED",
    BILLING: "BILLING",
    DIRTY: "DIRTY",
    CLOSED: "CLOSED",
  },

  order_statuses: {
    OPEN: "OPEN",
    BILLING: "BILLING",
    COMPLETED: "COMPLETED",
    VOID: "VOID",
  },

  item_statuses: {
    PENDING: "PENDING",
    PREPARING: "PREPARING",
    READY: "READY",
    SERVED: "SERVED",
    VOID: "VOID",
  },

  stations: [
    {
      key: "HOT",
      label: "Hot Kitchen",
    },
    {
      key: "COLD",
      label: "Cold Kitchen",
    },
    {
      key: "BAR",
      label: "Bar",
    },
    {
      key: "DESSERT",
      label: "Dessert",
    },
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

export function getStationLabel(key) {
  return (
    POS_MODULE.stations.find((station) => station.key === key)?.label || key
  );
}

export function calculatePOSTotals(subtotal) {
  const serviceCharge = subtotal * POS_MODULE.service_charge_rate;
  const vat = subtotal * POS_MODULE.vat_rate;
  const grandTotal = subtotal + serviceCharge + vat;

  return {
    subtotal,
    serviceCharge,
    vat,
    grandTotal,
  };
}

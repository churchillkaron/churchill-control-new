import { RestaurantOrderDocument } from "./manifest";

export function createRestaurantOrderDocument({
  organizationId,
  sessionId = null,
  tableId = null,
  tableNumber = null,
  customerId = null,
  customerName = null,
  staffId = null,
  staffName = null,
  items = [],
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const now = new Date().toISOString();

  return {
    documentType: RestaurantOrderDocument.documentType,
    organizationId,

    sessionId,
    tableId,
    tableNumber,

    customerId,
    customerName,

    status: RestaurantOrderDocument.defaultStatus,

    staffId,
    staffName,

    items,

    subtotal: 0,
    serviceCharge: 0,
    vat: 0,
    discount: 0,
    total: 0,

    paymentStatus: "UNPAID",
    productionStatus: "PENDING",

    createdAt: now,
    updatedAt: now,
  };
}

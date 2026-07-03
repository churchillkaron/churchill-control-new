export class RestaurantOrderAggregate {
  constructor(document = {}) {
    this.document = {
      items: [],
      subtotal: 0,
      serviceCharge: 0,
      vat: 0,
      discount: 0,
      total: 0,
      paymentStatus: "UNPAID",
      productionStatus: "PENDING",
      status: "OPEN",
      ...document,
    };
  }

  get state() {
    return this.document;
  }

  touch() {
    const now = new Date().toISOString();
    this.document.updatedAt = now;
    this.document.updated_at = now;
    return now;
  }

  addItem(item) {
    if (!Array.isArray(this.document.items)) {
      this.document.items = [];
    }

    this.document.items.push({
      id: item.id || crypto.randomUUID(),
      quantity: 1,
      price: 0,
      status: "PENDING",
      ...item,
    });

    this.recalculate();
    return this;
  }

  removeItem(itemId) {
    this.document.items =
      (this.document.items || []).filter(
        (item) =>
          item.id !== itemId &&
          item.id_from_db !== itemId
      );

    this.recalculate();
    return this;
  }

  updateQuantity(itemId, quantity) {
    const item =
      (this.document.items || []).find(
        (candidate) =>
          candidate.id === itemId ||
          candidate.id_from_db === itemId
      );

    if (!item) {
      throw new Error("Order item not found");
    }

    if (Number(quantity) <= 0) {
      throw new Error("quantity must be greater than zero");
    }

    item.quantity = Number(quantity);

    this.recalculate();
    return this;
  }

  applyDiscount(amount, reason = null) {
    const discount = Number(amount || 0);

    if (discount < 0) {
      throw new Error("discount cannot be negative");
    }

    this.document.discount = discount;
    this.document.discount_amount = discount;
    this.document.discountReason = reason;
    this.document.discount_reason = reason;

    this.recalculate();
    return this;
  }

  markPaid({
    paymentMethod = "CASH",
    paidAmount = null,
    changeAmount = 0,
    paidAt = null,
    partial = false,
  } = {}) {
    const now = paidAt || new Date().toISOString();

    const total =
      Number(
        this.document.total ||
        this.document.total_amount ||
        0
      );

    const previousPaid =
      Number(
        this.document.paidAmount ||
        this.document.amount_paid ||
        0
      );

    const incomingPaid =
      paidAmount === null || paidAmount === undefined
        ? total
        : Number(paidAmount || 0);

    const nextPaid =
      Number((previousPaid + incomingPaid).toFixed(2));

    const remaining =
      Math.max(
        0,
        Number((total - nextPaid).toFixed(2))
      );

    const isPaid =
      !partial && remaining <= 0;

    this.document.paymentStatus =
      isPaid ? "PAID" : "PARTIAL";

    this.document.payment_status =
      this.document.paymentStatus;

    this.document.paymentMethod =
      paymentMethod;

    this.document.payment_method =
      paymentMethod;

    this.document.paidAmount =
      nextPaid;

    this.document.amount_paid =
      nextPaid;

    this.document.changeAmount =
      Number(changeAmount || 0);

    this.document.change_amount =
      Number(changeAmount || 0);

    this.document.remainingBalance =
      remaining;

    this.document.remaining_balance =
      remaining;

    this.document.paidAt =
      now;

    this.document.paid_at =
      now;

    if (isPaid) {
      this.document.status = "COMPLETED";
      this.document.completedAt = now;
      this.document.completed_at = now;
    }

    this.touch();
    return this;
  }

  recalculate() {
    const subtotal =
      (this.document.items || []).reduce(
        (sum, item) =>
          sum +
          Number(item.quantity || 0) *
          Number(item.price || 0),
        0
      );

    const discount =
      Number(
        this.document.discount ||
        this.document.discount_amount ||
        0
      );

    const serviceChargeRate =
      Number(
        this.document.serviceChargeRate ||
        this.document.service_charge_rate ||
        5
      );

    const taxRate =
      Number(
        this.document.taxRate ||
        this.document.tax_rate ||
        7
      );

    const serviceCharge =
      subtotal * (serviceChargeRate / 100);

    const vat =
      (subtotal + serviceCharge - discount) *
      (taxRate / 100);

    const total =
      subtotal + serviceCharge + vat - discount;

    this.document.subtotal =
      Number(subtotal.toFixed(2));

    this.document.serviceCharge =
      Number(serviceCharge.toFixed(2));

    this.document.service_charge_amount =
      this.document.serviceCharge;

    this.document.vat =
      Number(vat.toFixed(2));

    this.document.vat_amount =
      this.document.vat;

    this.document.discount =
      Number(discount.toFixed(2));

    this.document.discount_amount =
      this.document.discount;

    this.document.total =
      Number(total.toFixed(2));

    this.document.total_amount =
      this.document.total;

    this.touch();
    return this;
  }
}

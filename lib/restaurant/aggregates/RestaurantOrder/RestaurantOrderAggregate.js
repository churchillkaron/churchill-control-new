import {
  loadRestaurantSettings,
} from "@/lib/restaurant/settings/RestaurantSettingsRepository";

export class RestaurantOrderAggregate {
  constructor(document) {
    this.document = document;
  }

  get state() {
    return this.document;
  }

  addItem(item) {
    if (!Array.isArray(this.document.items)) {
      this.document.items = [];
    }

    this.document.items.push({
      id: crypto.randomUUID(),
      ...item,
    });

    this.recalculate();

    return this;
  }



  applyDiscount(amount, reason = null) {
    const discount =
      Number(amount || 0);

    if (discount < 0) {
      throw new Error("discount cannot be negative");
    }

    this.document.discount = discount;
    this.document.discountReason = reason;
    this.document.discount_reason = reason;

    this.recalculate();

    return this;
  }

  updateQuantity(itemId, quantity) {
    const item =
      (this.document.items || []).find(
        (candidate) => candidate.id === itemId
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

  removeItem(itemId) {
    this.document.items =
      (this.document.items || []).filter(
        i => i.id !== itemId
      );

    this.recalculate();

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

    const serviceCharge =
      subtotal *
      (serviceChargeRate / 100);

    const vat =
      (subtotal + serviceCharge) *
      (taxRate / 100);

    this.document.serviceCharge =
      Number(serviceCharge.toFixed(2));

    this.document.vat =
      Number(vat.toFixed(2));

    this.document.total =
      Number(
        (
          subtotal +
          serviceCharge +
          vat -
          discount
        ).toFixed(2)
      );

    return this;
  }
}

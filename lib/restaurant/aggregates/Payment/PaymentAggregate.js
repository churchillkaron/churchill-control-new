export class PaymentAggregate {
  constructor(document) {
    if (!document?.id) {
      throw new Error("Payment document required");
    }

    this.document = document;
  }

  get state() {
    return this.document;
  }

  complete(reference = null) {
    if (this.document.status === "PAID") {
      const existingReference =
        this.document.reference || this.document.payment_reference || null;

      if (reference && existingReference && reference !== existingReference) {
        throw new Error("Payment already completed with another reference");
      }

      return this;
    }

    if (this.document.status === "CANCELLED") {
      throw new Error("Cannot complete cancelled payment");
    }

    this.document.status = "PAID";
    this.document.reference =
      reference || this.document.reference || this.document.payment_reference || null;
    this.document.paidAt =
      this.document.paidAt || this.document.paid_at || new Date().toISOString();
    this.document.updatedAt = new Date().toISOString();

    return this;
  }

  cancel(reason = null) {
    if (this.document.status === "PAID") {
      throw new Error("Cannot cancel completed payment");
    }

    this.document.status = "CANCELLED";
    this.document.cancelReason = reason;
    this.document.updatedAt = new Date().toISOString();

    return this;
  }
}

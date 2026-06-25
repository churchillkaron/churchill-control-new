export class PaymentAggregate {

  constructor(document) {
    this.document = document;
  }

  get state() {
    return this.document;
  }

  complete(reference = null) {

    if (this.document.status === "PAID") {
      throw new Error("Payment already completed");
    }

    this.document.status = "PAID";
    this.document.reference = reference;
    this.document.paidAt = new Date().toISOString();
    this.document.updatedAt = this.document.paidAt;

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

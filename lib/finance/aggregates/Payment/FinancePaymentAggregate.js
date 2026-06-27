export class FinancePaymentAggregate {

  constructor(document) {
    this.document = document;
  }

  get state() {
    return this.document;
  }

  post({

    ledgerReference = null,

    postedAt = new Date().toISOString(),

  } = {}) {

    if (this.document.status === "POSTED") {
      throw new Error(
        "Payment already posted"
      );
    }

    this.document.status =
      "POSTED";

    this.document.ledgerReference =
      ledgerReference;

    this.document.postedAt =
      postedAt;

    this.document.updatedAt =
      postedAt;

    return this;

  }

  reverse({

    reason = null,

    reversedAt = new Date().toISOString(),

  } = {}) {

    if (this.document.status === "REVERSED") {
      throw new Error(
        "Payment already reversed"
      );
    }

    this.document.status =
      "REVERSED";

    this.document.reversalReason =
      reason;

    this.document.reversedAt =
      reversedAt;

    this.document.updatedAt =
      reversedAt;

    return this;

  }

}

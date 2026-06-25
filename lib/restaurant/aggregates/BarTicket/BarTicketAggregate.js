export class BarTicketAggregate {

  constructor(document) {
    this.document = document;
  }

  get state() {
    return this.document;
  }

  start() {

    if (this.document.status !== "NEW") {
      throw new Error(
        "Bar ticket already started"
      );
    }

    this.document.status =
      "IN_PROGRESS";

    this.document.startedAt =
      new Date().toISOString();

    return this;

  }

  markReady() {

    if (
      this.document.status !==
      "IN_PROGRESS"
    ) {
      throw new Error(
        "Bar ticket not started"
      );
    }

    this.document.status =
      "READY";

    this.document.readyAt =
      new Date().toISOString();

    return this;

  }

  complete() {

    if (
      this.document.status !==
      "READY"
    ) {
      throw new Error(
        "Bar ticket not ready"
      );
    }

    this.document.status =
      "COMPLETED";

    this.document.completedAt =
      new Date().toISOString();

    return this;

  }

}

import { transitionDocument } from "@/lib/ubte/documents/DocumentLifecycle";
import { QuotationDocument } from "./manifest.js";

const allowedTransitions = {
  DRAFT: ["SENT", "CANCELLED"],
  SENT: ["ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"],
  ACCEPTED: ["CONVERTED", "CLOSED"],
  REJECTED: ["CLOSED"],
  EXPIRED: ["CLOSED"],
  CONVERTED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: ["CLOSED"],
};

export function canTransitionQuotation({
  from,
  to,
}) {
  return Boolean(
    allowedTransitions[from]?.includes(to)
  );
}

export function transitionQuotation({
  document,
  nextStatus,
}) {
  if (!document?.status) {
    throw new Error("document status required");
  }

  if (
    !canTransitionQuotation({
      from: document.status,
      to: nextStatus,
    })
  ) {
    throw new Error(
      `Invalid Quotation transition: ${document.status} -> ${nextStatus}`
    );
  }

  return transitionDocument({
    document,
    definition: QuotationDocument,
    nextStatus,
  });
}

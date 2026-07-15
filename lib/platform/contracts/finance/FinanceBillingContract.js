let handler = null;

export function registerFinanceBillingHandler(
  fn
) {
  handler = fn;
}

export async function emitFinanceBillingEvent(
  event
) {

  if (!handler) {
    throw new Error(
      "Finance billing handler not registered"
    );
  }

  return handler(event);

}

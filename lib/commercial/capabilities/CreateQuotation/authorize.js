export function authorizeCreateQuotation({ access }) {
  if (!access?.success) {
    throw new Error("Organization access required");
  }
  return true;
}

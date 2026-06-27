export async function salesRuntime(event) {
  const { type, payload } = event || {};

  if (!type) {
    throw new Error("sales event type required");
  }

  switch (type) {
    case "CREATE_QUOTATION":
      throw new Error("CREATE_QUOTATION not implemented");

    case "APPROVE_QUOTATION":
      throw new Error("APPROVE_QUOTATION not implemented");

    case "CONVERT_QUOTATION_TO_ORDER":
      throw new Error("CONVERT_QUOTATION_TO_ORDER not implemented");

    case "CREATE_SALES_ORDER":
      throw new Error("CREATE_SALES_ORDER not implemented");

    case "APPROVE_SALES_ORDER":
      throw new Error("APPROVE_SALES_ORDER not implemented");

    case "CREATE_DELIVERY":
      throw new Error("CREATE_DELIVERY not implemented");

    case "CONFIRM_DELIVERY":
      throw new Error("CONFIRM_DELIVERY not implemented");

    case "GENERATE_CUSTOMER_INVOICE":
      throw new Error("GENERATE_CUSTOMER_INVOICE not implemented");

    default:
      throw new Error(`Unknown sales event type: ${type}`);
  }
}

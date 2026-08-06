import {
  createSalesOrderDraft,
  listSalesOrders,
} from "@/lib/commercial/sales/SalesOrderService";

export async function salesRuntime(event) {
  const { type, payload = {}, context = {} } = event || {};

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
      return createSalesOrderDraft({
        access: context.access || payload.access || {},
        body: payload,
        organizationId:
          context.organizationId ||
          context.organization_id ||
          payload.organizationId ||
          payload.organization_id,
        request: context.request || payload.request || null,
      });

    case "LIST_SALES_ORDERS":
      return listSalesOrders({
        organizationId:
          context.organizationId ||
          context.organization_id ||
          payload.organizationId ||
          payload.organization_id,
        entityId:
          context.entityId ||
          context.entity_id ||
          payload.entityId ||
          payload.entity_id,
        limit: payload.limit,
      });

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

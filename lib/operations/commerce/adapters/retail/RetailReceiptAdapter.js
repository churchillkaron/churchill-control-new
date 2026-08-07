import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  listSalesOrders,
} from "@/lib/commercial/sales/SalesOrderService";

function numeric(value) {
  const parsed =
    Number(value || 0);

  return Number.isFinite(
    parsed
  )
    ? parsed
    : 0;
}

function round(value) {
  return Number(
    numeric(value).toFixed(2)
  );
}

function readEntityId(
  source = {}
) {
  return (
    source.entityId ||
    source.entity_id ||
    source.legalEntityId ||
    source.legal_entity_id ||
    null
  );
}

function entityIdFromRequest(
  request
) {
  try {
    const searchParams =
      new URL(
        request?.url ||
        "http://localhost"
      ).searchParams;

    return (
      searchParams.get(
        "entityId"
      ) ||
      searchParams.get(
        "entity_id"
      ) ||
      searchParams.get(
        "legalEntityId"
      ) ||
      searchParams.get(
        "legal_entity_id"
      ) ||
      null
    );
  } catch {
    return null;
  }
}

function saleReference(
  order
) {
  return (
    order?.order_number ||
    order?.id ||
    null
  );
}

function saleContext(
  order
) {
  const reference =
    saleReference(
      order
    );

  return {
    type:
      "sale",

    id:
      order?.id ||
      null,

    reference,

    label:
      order?.order_number ||
      (
        order?.id
          ? `Sale ${String(
              order.id
            ).slice(
              0,
              8
            )}`
          : "Retail sale"
      ),
  };
}

export async function listRetailReceipts({
  access,
  organizationId,
  orderId,
  request,
}) {
  const entityId =
    entityIdFromRequest(
      request
    ) ||
    readEntityId(
      access
    ) ||
    readEntityId(
      access?.access ||
      {}
    );

  if (!entityId) {
    const error =
      new Error(
        "Select an active legal entity before loading retail receipts"
      );

    error.status =
      400;

    throw error;
  }

  const orders =
    await listSalesOrders({
      organizationId,
      entityId,
    });

  const paidOrders =
    orders.filter(
      order => {
        if (
          String(
            order.application_id ||
            ""
          )
            .trim()
            .toLowerCase() !==
          "retail"
        ) {
          return false;
        }

        if (
          String(
            order.payment_status ||
            ""
          )
            .trim()
            .toUpperCase() !==
          "PAID"
        ) {
          return false;
        }

        if (
          orderId &&
          order.id !==
            orderId
        ) {
          return false;
        }

        return true;
      }
    );

  if (
    paidOrders.length ===
    0
  ) {
    return [];
  }

  const orderIds =
    paidOrders
      .map(
        order =>
          order.id
      )
      .filter(Boolean);

  const paymentResult =
    await supabaseAdmin
      .from(
        "payments"
      )
      .select("*")
      .eq(
        "organization_id",
        organizationId
      )
      .eq(
        "entity_id",
        entityId
      )
      .eq(
        "application_id",
        "retail"
      )
      .eq(
        "source_document",
        "sales_order"
      )
      .in(
        "source_document_id",
        orderIds
      )
      .eq(
        "status",
        "PAID"
      )
      .order(
        "paid_at",
        {
          ascending:
            true,
        }
      );

  if (
    paymentResult.error
  ) {
    throw paymentResult.error;
  }

  const paymentsByOrder =
    new Map();

  for (
    const payment of
      paymentResult.data ||
      []
  ) {
    const salesOrderId =
      payment
        .source_document_id;

    if (!salesOrderId) {
      continue;
    }

    const rows =
      paymentsByOrder.get(
        salesOrderId
      ) ||
      [];

    rows.push(
      payment
    );

    paymentsByOrder.set(
      salesOrderId,
      rows
    );
  }

  return paidOrders
    .map(
      order => {
        const payments =
          paymentsByOrder.get(
            order.id
          ) ||
          [];

        if (
          payments.length ===
          0
        ) {
          return null;
        }

        const primaryPayment =
          payments[
            payments.length -
            1
          ];

        const paid =
          round(
            payments.reduce(
              (
                total,
                payment
              ) =>
                total +
                numeric(
                  payment.amount
                ),
              0
            )
          );

        const total =
          round(
            order.total_amount
          );

        return {
          application_id:
            "retail",

          entity_id:
            entityId,

          order_id:
            order.id,

          receipt_number:
            primaryPayment
              ?.document_number ||
            order.order_number ||
            `R-${String(
              order.id
            )
              .slice(
                0,
                8
              )
              .toUpperCase()}`,

          context:
            saleContext(
              order
            ),

          created_at:
            primaryPayment
              ?.paid_at ||
            primaryPayment
              ?.created_at ||
            order.updated_at ||
            order.created_at,

          status:
            "PAID",

          currency_code:
            order.currency_code ||
            primaryPayment
              ?.currency ||
            null,

          items:
            (
              order.items ||
              order.order_items ||
              []
            ).map(
              item => ({
                ...item,

                price:
                  numeric(
                    item.unit_price ??
                    item.price
                  ),

                total:
                  round(
                    item.line_total ??
                    (
                      numeric(
                        item.unit_price ??
                        item.price
                      ) *
                      numeric(
                        item.quantity ||
                        1
                      )
                    )
                  ),
              })
            ),

          subtotal:
            round(
              order.subtotal
            ),

          discount:
            round(
              order.discount_amount
            ),

          tax:
            round(
              order.tax_amount
            ),

          service_charge:
            0,

          total,

          paid,

          remaining:
            Math.max(
              0,
              round(
                order.remaining_balance
              )
            ),

          payment_breakdown:
            payments.map(
              payment => ({
                ...payment,

                currency_code:
                  payment.currency ||
                  order.currency_code ||
                  null,
              })
            ),

          customer: {
            id:
              order.customer_id ||
              null,

            name:
              order.customer_name ||
              null,

            email:
              order.customer_email ||
              null,

            phone:
              order.customer_phone ||
              null,
          },
        };
      }
    )
    .filter(Boolean);
}

const RetailReceiptAdapter =
  Object.freeze({
    listReceipts:
      listRetailReceipts,
  });

export default RetailReceiptAdapter;

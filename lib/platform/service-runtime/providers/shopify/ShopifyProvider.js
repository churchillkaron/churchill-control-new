import "./ShopifyCredentialRegistration.js";

const API_VERSION = "2026-07";
const ORDER_LIFECYCLE_CAPABILITY = "commerce.shopify.order.lifecycle.read";

function text(value) {
  return String(value ?? "").trim();
}

function boundedFirst(value, fallback = 50) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(100, Math.max(1, Math.trunc(number)));
}

function shopifyOrderGid(value) {
  const normalized = text(value);
  if (!normalized) return null;
  return normalized.startsWith("gid://shopify/Order/")
    ? normalized
    : `gid://shopify/Order/${normalized}`;
}

async function graph({ shop, accessToken, query, variables = {} }) {
  const response = await fetch(
    `https://${shop}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    },
  );
  const payload = await response.json().catch(() => ({}));
  const firstError = payload?.errors?.[0];
  if (!response.ok || firstError) {
    throw new Error(
      firstError?.message ||
        payload?.error ||
        `SHOPIFY_GRAPHQL_FAILED:${response.status}`,
    );
  }
  return payload?.data || {};
}

const TRANSACTION_FIELDS = `
  id
  legacyResourceId
  kind
  status
  test
  gateway
  formattedGateway
  createdAt
  processedAt
  amountSet { shopMoney { amount currencyCode } }
  parentTransaction { id legacyResourceId }
`;

const QUERIES = {
  "commerce.shopify.products.read": `
    query AvantiqoShopifyProducts($first: Int!, $after: String) {
      products(first: $first, after: $after, sortKey: UPDATED_AT) {
        nodes {
          id
          legacyResourceId
          title
          handle
          status
          vendor
          productType
          createdAt
          updatedAt
          totalInventory
          featuredMedia { preview { image { url altText } } }
          variants(first: 100) {
            nodes {
              id
              legacyResourceId
              title
              sku
              barcode
              price
              inventoryQuantity
              inventoryItem { id legacyResourceId tracked }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `,
  "commerce.shopify.orders.read": `
    query AvantiqoShopifyOrders($first: Int!, $after: String) {
      orders(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {
        nodes {
          id
          legacyResourceId
          name
          createdAt
          updatedAt
          cancelledAt
          closedAt
          email
          phone
          displayFinancialStatus
          displayFulfillmentStatus
          currencyCode
          currentSubtotalPriceSet { shopMoney { amount currencyCode } }
          currentTotalDiscountsSet { shopMoney { amount currencyCode } }
          currentTotalTaxSet { shopMoney { amount currencyCode } }
          currentTotalPriceSet { shopMoney { amount currencyCode } }
          totalOutstandingSet { shopMoney { amount currencyCode } }
          customer {
            id
            legacyResourceId
            displayName
            firstName
            lastName
            email
            phone
          }
          lineItems(first: 100) {
            nodes {
              id
              name
              title
              quantity
              currentQuantity
              sku
              vendor
              originalUnitPriceSet { shopMoney { amount currencyCode } }
              totalDiscountSet { shopMoney { amount currencyCode } }
              taxLines { priceSet { shopMoney { amount currencyCode } } }
              product { id legacyResourceId }
              variant { id legacyResourceId barcode }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `,
  [ORDER_LIFECYCLE_CAPABILITY]: `
    query AvantiqoShopifyOrderLifecycle($id: ID!) {
      order(id: $id) {
        id
        legacyResourceId
        name
        createdAt
        updatedAt
        cancelledAt
        closedAt
        displayFinancialStatus
        displayFulfillmentStatus
        currencyCode
        currentSubtotalPriceSet { shopMoney { amount currencyCode } }
        currentTotalDiscountsSet { shopMoney { amount currencyCode } }
        currentTotalTaxSet { shopMoney { amount currencyCode } }
        currentTotalPriceSet { shopMoney { amount currencyCode } }
        totalOutstandingSet { shopMoney { amount currencyCode } }
        transactions(first: 100) {
          ${TRANSACTION_FIELDS}
        }
        refunds {
          id
          legacyResourceId
          createdAt
          updatedAt
          processedAt
          note
          totalRefundedSet { shopMoney { amount currencyCode } }
          transactions(first: 100) {
            nodes {
              ${TRANSACTION_FIELDS}
            }
          }
          refundLineItems(first: 100) {
            nodes {
              id
              quantity
              restocked
              restockType
              subtotalSet { shopMoney { amount currencyCode } }
              totalTaxSet { shopMoney { amount currencyCode } }
              lineItem {
                id
                variant { id legacyResourceId }
              }
              location { id legacyResourceId name }
            }
          }
        }
        fulfillments(first: 100) {
          id
          legacyResourceId
          name
          status
          displayStatus
          createdAt
          updatedAt
          deliveredAt
          totalQuantity
          location { id legacyResourceId name }
          trackingInfo(first: 100) { company number url }
          fulfillmentLineItems(first: 100) {
            nodes {
              id
              quantity
              lineItem {
                id
                variant { id legacyResourceId }
              }
            }
          }
        }
      }
    }
  `,
  "commerce.shopify.inventory.read": `
    query AvantiqoShopifyInventory($first: Int!, $after: String) {
      inventoryItems(first: $first, after: $after) {
        nodes {
          id
          legacyResourceId
          sku
          tracked
          updatedAt
          variant {
            id
            legacyResourceId
            title
            barcode
            product { id legacyResourceId title }
          }
          inventoryLevels(first: 50) {
            nodes {
              id
              quantities(names: ["available", "on_hand", "committed"]) { name quantity }
              location { id legacyResourceId name }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `,
  "commerce.shopify.locations.read": `
    query AvantiqoShopifyLocations($first: Int!, $after: String) {
      locations(first: $first, after: $after, includeLegacy: false) {
        nodes {
          id
          legacyResourceId
          name
          isActive
          fulfillsOnlineOrders
          address { address1 address2 city province provinceCode country countryCode zip phone }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `,
};

export const ShopifyProvider = {
  id: "shopify",

  async execute(input = {}) {
    const capability = text(input.capability);
    const query = QUERIES[capability];
    if (!query) {
      throw new Error(`Shopify capability not supported: ${capability}`);
    }

    const shop = text(input.shop).toLowerCase();
    const accessToken = text(input.access_token);
    if (!shop || !accessToken) {
      throw new Error("SHOPIFY_ORGANIZATION_CREDENTIAL_REQUIRED");
    }

    const variables =
      capability === ORDER_LIFECYCLE_CAPABILITY
        ? {
            id: shopifyOrderGid(
              input.order_id ||
                input.shopify_order_id ||
                input.external_id ||
                input.id,
            ),
          }
        : {
            first: boundedFirst(input.first || input.limit),
            after: text(input.after || input.cursor) || null,
          };

    if (capability === ORDER_LIFECYCLE_CAPABILITY && !variables.id) {
      throw new Error("SHOPIFY_ORDER_ID_REQUIRED");
    }

    const data = await graph({
      shop,
      accessToken,
      query,
      variables,
    });

    return {
      success: true,
      provider: "shopify",
      output: {
        ...data,
        shop,
        api_version: API_VERSION,
      },
    };
  },
};

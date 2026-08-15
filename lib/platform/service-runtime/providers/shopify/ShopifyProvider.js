import "./ShopifyCredentialRegistration.js";

const API_VERSION = "2026-07";

function text(value) {
  return String(value ?? "").trim();
}

function boundedFirst(value, fallback = 50) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(100, Math.max(1, Math.trunc(number)));
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

const QUERIES = {
  "commerce.shopify.products.read": `
    query AvantiqoShopifyProducts($first: Int!, $after: String) {
      products(first: $first, after: $after, sortKey: UPDATED_AT) {
        nodes {
          id
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
            nodes { id title sku barcode price inventoryQuantity }
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
          name
          createdAt
          updatedAt
          displayFinancialStatus
          displayFulfillmentStatus
          currencyCode
          currentTotalPriceSet { shopMoney { amount currencyCode } }
          customer { id displayName email phone }
          lineItems(first: 100) {
            nodes { id name quantity sku originalUnitPriceSet { shopMoney { amount currencyCode } } }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `,
  "commerce.shopify.inventory.read": `
    query AvantiqoShopifyInventory($first: Int!, $after: String) {
      inventoryItems(first: $first, after: $after) {
        nodes {
          id
          sku
          tracked
          updatedAt
          variant { id title product { id title } }
          inventoryLevels(first: 50) {
            nodes {
              id
              quantities(names: ["available", "on_hand", "committed"]) { name quantity }
              location { id name }
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

    const data = await graph({
      shop,
      accessToken,
      query,
      variables: {
        first: boundedFirst(input.first || input.limit),
        after: text(input.after || input.cursor) || null,
      },
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

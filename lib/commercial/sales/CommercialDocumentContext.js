import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { resolvePOSFinancialPolicy } from "@/lib/pos/runtime/resolvePOSFinancialPolicy";

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function uuidOrNull(value) {
  const normalized = String(value ?? "").trim();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

export function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizedRate(value, fallback = 0) {
  const parsed = numeric(value, fallback);
  if (parsed < 0) return 0;
  return parsed > 1 ? parsed / 100 : parsed;
}

export function requestedEntityId(body = {}, request = null) {
  let queryEntityId = null;

  try {
    const searchParams = new URL(request?.url || "http://localhost").searchParams;
    queryEntityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id") ||
      searchParams.get("legalEntityId") ||
      searchParams.get("legal_entity_id");
  } catch {}

  return uuidOrNull(
    body.entityId ||
      body.entity_id ||
      body.legalEntityId ||
      body.legal_entity_id ||
      queryEntityId
  );
}

export function actorFrom(access = {}) {
  return {
    staffId: uuidOrNull(
      access.access?.staffAccountId ||
        access.staff?.id ||
        access.user?.id
    ),
    name:
      access.staff?.display_name ||
      access.staff?.name ||
      access.user?.email ||
      access.userEmail ||
      null,
  };
}

async function resolveCurrencyCode({ organizationId, entity }) {
  const result = await supabaseAdmin
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .maybeSingle();

  if (result.error) throw result.error;

  const organization = result.data || {};
  const currencyCode = text(
    entity?.currency ||
      entity?.currency_code ||
      organization.currency_code ||
      organization.base_currency_code ||
      organization.reporting_currency_code ||
      organization.default_currency
  );

  if (!currencyCode) {
    const error = new Error(
      "Configure a currency for the selected legal entity or organization"
    );
    error.status = 409;
    throw error;
  }

  return currencyCode.toUpperCase();
}

async function validateCustomerParty({ organizationId, partyId }) {
  if (!partyId) return null;

  const result = await supabaseAdmin
    .from("party_relationships")
    .select("party_id, status")
    .eq("organization_id", organizationId)
    .eq("party_id", partyId)
    .eq("relationship_type", "customer")
    .maybeSingle();

  if (result.error || !result.data) {
    const error = new Error("Customer Party not found in organization scope");
    error.status = 409;
    throw error;
  }

  if (String(result.data.status || "active").toLowerCase() === "archived") {
    const error = new Error("Customer Party is archived");
    error.status = 409;
    throw error;
  }

  return partyId;
}

async function loadCatalogItems({ organizationId, itemIds }) {
  if (!itemIds.length) return new Map();

  const result = await supabaseAdmin
    .from("inventory_items")
    .select("id, organization_id, entity_id, name, code, type, cost, sale_price, is_active")
    .eq("organization_id", organizationId)
    .in("id", itemIds);

  if (result.error) throw result.error;

  return new Map((result.data || []).map((item) => [item.id, item]));
}

function requestedLineType(line = {}) {
  const value = String(line.item_type || line.itemType || "")
    .trim()
    .toLowerCase();

  if (["service", "non_stock", "non-stock", "manual"].includes(value)) {
    return "service";
  }

  return uuidOrNull(line.item_id || line.itemId || line.id)
    ? "inventory_item"
    : "service";
}

function normalizeLines(sourceItems, catalogItems, financialPolicy) {
  if (!Array.isArray(sourceItems) || !sourceItems.length) {
    const error = new Error("Commercial document lines required");
    error.status = 400;
    throw error;
  }

  return sourceItems.map((line, index) => {
    const itemType = requestedLineType(line);
    const requestedItemId = uuidOrNull(
      line.item_id || line.itemId || line.id
    );
    const item = requestedItemId ? catalogItems.get(requestedItemId) : null;

    if (itemType === "inventory_item" && !item) {
      const error = new Error(
        `Line ${index + 1} references an unavailable catalog item`
      );
      error.status = 409;
      throw error;
    }

    if (item && item.is_active === false) {
      const error = new Error(`Line ${index + 1} catalog item is inactive`);
      error.status = 409;
      throw error;
    }

    const quantity = numeric(line.quantity, 0);
    if (quantity <= 0) {
      const error = new Error(`Line ${index + 1} quantity must be positive`);
      error.status = 400;
      throw error;
    }

    const requestedPrice =
      line.unit_price ?? line.unitPrice ?? line.price;
    const unitPrice =
      requestedPrice === "" || requestedPrice === null || requestedPrice === undefined
        ? numeric(item?.sale_price, -1)
        : numeric(requestedPrice, -1);

    if (unitPrice < 0) {
      const error = new Error(
        `Line ${index + 1} requires a valid non-negative selling price`
      );
      error.status = 400;
      throw error;
    }

    const itemName = text(
      item?.name || line.item_name || line.itemName || line.name
    );
    if (!itemName) {
      const error = new Error(`Line ${index + 1} name required`);
      error.status = 400;
      throw error;
    }

    const discountAmount = numeric(
      line.discount_amount ?? line.discountAmount,
      0
    );
    if (discountAmount < 0 || discountAmount > quantity * unitPrice) {
      const error = new Error(`Line ${index + 1} discount is invalid`);
      error.status = 400;
      throw error;
    }

    return {
      item_id: itemType === "inventory_item" ? item.id : null,
      item_type: itemType,
      sku: item?.code || text(line.sku),
      barcode: text(line.barcode),
      item_name: itemName,
      description: text(line.description),
      unit: text(line.unit || line.unit_of_measure),
      quantity,
      unit_price: unitPrice,
      discount_amount: discountAmount,
      tax_code_id:
        uuidOrNull(line.tax_code_id || line.taxCodeId) ||
        uuidOrNull(financialPolicy.taxCodeId),
      tax_code:
        text(line.tax_code || line.taxCode) || financialPolicy.taxCode || null,
      tax_rate: normalizedRate(
        line.tax_rate ?? line.taxRate,
        numeric(financialPolicy.taxRate, 0)
      ),
      source_payload: {
        source: itemType === "inventory_item" ? "inventory_items" : "manual_service",
        requested_quantity: quantity,
      },
    };
  });
}

export async function resolveCommercialDocumentContext({
  organizationId,
  entityId,
  partyId = null,
  sourceItems = [],
}) {
  if (!uuidOrNull(organizationId)) {
    const error = new Error("organization_id required");
    error.status = 400;
    throw error;
  }

  if (!uuidOrNull(entityId)) {
    const error = new Error("Select an active legal entity");
    error.status = 400;
    throw error;
  }

  const entity = await resolveEntity({ organizationId, entityId });
  if (!entity) {
    const error = new Error(
      "Selected legal entity is outside the organization or inactive"
    );
    error.status = 403;
    throw error;
  }

  const resolvedPartyId = uuidOrNull(partyId);
  const itemIds = [
    ...new Set(
      sourceItems
        .filter((line) => requestedLineType(line) === "inventory_item")
        .map((line) => uuidOrNull(line.item_id || line.itemId || line.id))
        .filter(Boolean)
    ),
  ];

  const transactionDate = new Date().toISOString();
  const [catalogItems, financialPolicy, currencyCode] = await Promise.all([
    loadCatalogItems({ organizationId, itemIds }),
    resolvePOSFinancialPolicy({ organizationId, transactionDate }),
    resolveCurrencyCode({ organizationId, entity }),
    validateCustomerParty({ organizationId, partyId: resolvedPartyId }),
  ]);

  return {
    entity,
    entityId,
    partyId: resolvedPartyId,
    currencyCode,
    financialPolicy,
    lines: normalizeLines(sourceItems, catalogItems, financialPolicy),
  };
}

export async function listCommercialCatalog({ organizationId, query = "", limit = 300 }) {
  if (!uuidOrNull(organizationId)) {
    const error = new Error("organization_id required");
    error.status = 400;
    throw error;
  }

  const result = await supabaseAdmin
    .from("inventory_items")
    .select("id, organization_id, entity_id, name, code, type, cost, sale_price, is_active")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(Math.max(1, Math.min(Number(limit) || 300, 500)));

  if (result.error) throw result.error;

  const normalizedQuery = String(query || "").trim().toLowerCase();
  const items = (result.data || []).map((item) => ({
    ...item,
    item_id: item.id,
    item_name: item.name,
    sku: item.code || null,
    unit_price: numeric(item.sale_price),
    item_type: "inventory_item",
  }));

  return normalizedQuery
    ? items.filter((item) =>
        [item.name, item.code, item.type]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      )
    : items;
}

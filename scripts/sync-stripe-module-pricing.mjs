import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const PROVIDER = "stripe";
const requestedEnvironment = String(
  process.env.STRIPE_CATALOG_ENVIRONMENT || "sandbox",
).trim().toLowerCase();
if (!["sandbox", "live"].includes(requestedEnvironment)) {
  throw new Error("STRIPE_CATALOG_ENVIRONMENT_INVALID");
}
const ENVIRONMENT = requestedEnvironment;

function clean(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function zeroDecimal(currency) {
  return new Set([
    "BIF","CLP","DJF","GNF","JPY","KMF","KRW","MGA",
    "PYG","RWF","UGX","VND","VUV","XAF","XOF","XPF",
  ]).has(upper(currency));
}

function toMinorUnits(currency, amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("INVALID_CANONICAL_PRICE");
  }
  return Math.round(value * (zeroDecimal(currency) ? 1 : 100));
}

function label(moduleId) {
  return clean(moduleId)
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const stripeKey = clean(process.env.STRIPE_SECRET_KEY);
const validStripeKey = ENVIRONMENT === "live"
  ? stripeKey.startsWith("sk_live_") || stripeKey.startsWith("rk_live_")
  : stripeKey.startsWith("sk_test_") || stripeKey.startsWith("rk_test_");
if (!validStripeKey) {
  throw new Error(
    ENVIRONMENT === "live"
      ? "STRIPE_LIVE_KEY_REQUIRED"
      : "STRIPE_SANDBOX_KEY_REQUIRED",
  );
}

const supabaseUrl = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const serviceRoleKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_CONFIGURATION_REQUIRED");
}

const stripe = new Stripe(stripeKey);
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: pricing, error: pricingError } = await supabase
  .from("platform_module_pricing")
  .select("module_id,monthly_price,yearly_price,currency,active")
  .eq("active", true)
  .order("module_id");

if (pricingError) throw pricingError;

const { data: mappings, error: mappingsError } = await supabase
  .from("billing_provider_price_mappings")
  .select("*")
  .eq("provider", PROVIDER)
  .eq("environment", ENVIRONMENT);

if (mappingsError) throw mappingsError;

const products = await stripe.products.list({ active: true, limit: 100 });
const existingProducts = new Map(
  products.data
    .filter((product) => product.metadata?.domain === "avantiqo_module")
    .map((product) => [clean(product.metadata?.module_id), product]),
);

const mappingByKey = new Map(
  (mappings || []).map((row) => [
    [row.module_id, row.billing_cycle, row.currency].join(":"),
    row,
  ]),
);

const synced = [];
const seenKeys = new Set();

for (const row of pricing || []) {
  const moduleId = clean(row.module_id);
  const currency = upper(row.currency);
  if (!moduleId || !currency) continue;

  let product = existingProducts.get(moduleId);
  if (!product) {
    product = await stripe.products.create({
      name: `Avantiqo ${label(moduleId)}`,
      description: `Avantiqo module subscription: ${label(moduleId)}`,
      metadata: {
        domain: "avantiqo_module",
        module_id: moduleId,
      },
    }, {
      idempotencyKey: `avantiqo:catalog:product:${moduleId}`,
    });
    existingProducts.set(moduleId, product);
  }

  for (const [billingCycle, canonicalAmount, interval] of [
    ["monthly", row.monthly_price, "month"],
    ["yearly", row.yearly_price, "year"],
  ]) {
    const amount = Number(canonicalAmount);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const key = [moduleId, billingCycle, currency].join(":");
    seenKeys.add(key);
    const unitAmount = toMinorUnits(currency, amount);
    const mapped = mappingByKey.get(key);

    let price = null;
    if (mapped?.provider_price_id) {
      try {
        const existing = await stripe.prices.retrieve(mapped.provider_price_id);
        if (
          existing.active &&
          existing.currency === currency.toLowerCase() &&
          Number(existing.unit_amount) === unitAmount &&
          existing.recurring?.interval === interval &&
          clean(existing.product) === product.id
        ) {
          price = existing;
        } else if (existing.active) {
          await stripe.prices.update(existing.id, { active: false });
        }
      } catch {
        price = null;
      }
    }

    if (!price) {
      price = await stripe.prices.create({
        product: product.id,
        currency: currency.toLowerCase(),
        unit_amount: unitAmount,
        recurring: { interval },
        nickname: `${label(moduleId)} · ${billingCycle}`,
        metadata: {
          domain: "avantiqo_module",
          module_id: moduleId,
          billing_cycle: billingCycle,
          canonical_currency: currency,
          canonical_amount: String(amount),
        },
      }, {
        idempotencyKey: `avantiqo:catalog:price:${moduleId}:${billingCycle}:${currency}:${unitAmount}`,
      });
    }

    const payload = {
      provider: PROVIDER,
      environment: ENVIRONMENT,
      module_id: moduleId,
      billing_cycle: billingCycle,
      currency,
      unit_amount: amount,
      provider_product_id: product.id,
      provider_price_id: price.id,
      active: true,
      metadata: {
        canonical_source: "platform_module_pricing",
        recurring_interval: interval,
      },
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from("billing_provider_price_mappings")
      .upsert(payload, {
        onConflict: "provider,environment,module_id,billing_cycle,currency",
      });
    if (upsertError) throw upsertError;

    synced.push({
      module_id: moduleId,
      billing_cycle: billingCycle,
      currency,
      amount,
      product_id: product.id,
      price_id: price.id,
    });
  }
}

for (const mapping of mappings || []) {
  const key = [mapping.module_id, mapping.billing_cycle, mapping.currency].join(":");
  if (mapping.active && !seenKeys.has(key)) {
    await supabase
      .from("billing_provider_price_mappings")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", mapping.id);
  }
}

console.log(JSON.stringify({
  provider: PROVIDER,
  environment: ENVIRONMENT,
  canonical_modules: (pricing || []).length,
  synced_prices: synced.length,
  synced,
}, null, 2));

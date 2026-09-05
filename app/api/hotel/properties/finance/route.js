import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

const clean = (value) => String(value ?? "").trim();
const fail = (error, status = 400) => NextResponse.json({ success: false, error }, { status });

async function authorize(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) return { error: fail(access.error, access.status) };
  return { organizationId: access.organizationId };
}

export async function GET(request) {
  try {
    const organizationId = clean(
      request.nextUrl.searchParams.get("organizationId") ||
      request.nextUrl.searchParams.get("organization_id"),
    );
    const auth = await authorize(request, organizationId);
    if (auth.error) return auth.error;

    const [propertiesResult, entitiesResult, accountsResult] = await Promise.all([
      supabaseAdmin
        .from("hotel_properties")
        .select("id,name,finance_entity_id,settlement_bank_account_id")
        .eq("organization_id", auth.organizationId)
        .order("name"),
      supabaseAdmin
        .from("legal_entities")
        .select("id,code,legal_name,display_name,currency,is_default_accounting_entity")
        .eq("organization_id", auth.organizationId)
        .eq("is_active", true)
        .order("display_name"),
      supabaseAdmin
        .from("bank_accounts")
        .select("id,entity_id,bank_name,account_name,account_number,currency_code,currency,is_default,finance_account_id")
        .eq("organization_id", auth.organizationId)
        .eq("active", true)
        .not("finance_account_id", "is", null)
        .order("account_name"),
    ]);

    if (propertiesResult.error) throw propertiesResult.error;
    if (entitiesResult.error) throw entitiesResult.error;
    if (accountsResult.error) throw accountsResult.error;

    const properties = (propertiesResult.data || []).map((property) => ({
      ...property,
      finance_ready: Boolean(property.finance_entity_id && property.settlement_bank_account_id),
    }));

    return NextResponse.json({
      success: true,
      properties,
      entities: entitiesResult.data || [],
      bankAccounts: accountsResult.data || [],
    });
  } catch (error) {
    console.error("HOTEL_PROPERTY_FINANCE_LIST_ERROR", error);
    return fail(error?.message || "Unable to load Hotel Finance setup", 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId || body.organization_id);
    const propertyId = clean(body.propertyId || body.property_id);
    const entityId = clean(body.entityId || body.entity_id || body.financeEntityId || body.finance_entity_id);
    const bankAccountId = clean(body.bankAccountId || body.bank_account_id || body.settlementBankAccountId || body.settlement_bank_account_id);
    const auth = await authorize(request, organizationId);
    if (auth.error) return auth.error;
    if (!propertyId || !entityId || !bankAccountId) return fail("Property, legal entity and settlement bank account are required");

    const [propertyResult, entityResult, bankResult] = await Promise.all([
      supabaseAdmin.from("hotel_properties").select("id,name").eq("organization_id", auth.organizationId).eq("id", propertyId).maybeSingle(),
      supabaseAdmin.from("legal_entities").select("id,is_active").eq("organization_id", auth.organizationId).eq("id", entityId).maybeSingle(),
      supabaseAdmin.from("bank_accounts").select("id,entity_id,active,finance_account_id").eq("organization_id", auth.organizationId).eq("id", bankAccountId).maybeSingle(),
    ]);
    if (propertyResult.error) throw propertyResult.error;
    if (entityResult.error) throw entityResult.error;
    if (bankResult.error) throw bankResult.error;
    if (!propertyResult.data) return fail("Property not found", 404);
    if (!entityResult.data || !entityResult.data.is_active) return fail("Legal entity is not active for this organization", 409);
    if (!bankResult.data || !bankResult.data.active) return fail("Settlement bank account is not active for this organization", 409);
    if (bankResult.data.entity_id !== entityId) return fail("Settlement bank account belongs to another legal entity", 409);
    if (!bankResult.data.finance_account_id) return fail("Settlement bank account is not linked to a Finance ledger account", 409);

    const { data, error } = await supabaseAdmin
      .from("hotel_properties")
      .update({
        finance_entity_id: entityId,
        settlement_bank_account_id: bankAccountId,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", auth.organizationId)
      .eq("id", propertyId)
      .select("id,name,finance_entity_id,settlement_bank_account_id")
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, property: { ...data, finance_ready: true } });
  } catch (error) {
    console.error("HOTEL_PROPERTY_FINANCE_SAVE_ERROR", error);
    return fail(error?.message || "Unable to save Hotel Finance setup", 500);
  }
}

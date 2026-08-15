import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  normalizePayrollCountry,
  supportsPayrollCountry,
} from "./loadPayrollCountryPack";

export default async function resolvePayrollJurisdiction({
  organizationId,
  entityId,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!entityId) throw new Error("entityId required");

  const { data: entity, error } = await supabaseAdmin
    .from("legal_entities")
    .select("id,organization_id,country,currency,timezone,is_active")
    .eq("id", entityId)
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  if (!entity) {
    throw new Error("Active payroll legal entity not found for organization");
  }

  const country = normalizePayrollCountry(entity.country);
  const currency = String(entity.currency || "").trim().toUpperCase();

  if (!country || !supportsPayrollCountry(country)) {
    throw new Error(
      `Payroll country ${entity.country || "not configured"} is not supported`
    );
  }

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Payroll legal entity currency is not configured correctly");
  }

  return {
    organizationId,
    entityId,
    country,
    currency,
    timezone: entity.timezone || null,
  };
}

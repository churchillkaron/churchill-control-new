import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  createBudget,
  listBudgets,
} from "../repositories/BudgetRepository";
import { calculateBudgetVariance } from "../capabilities/calculateBudgetVariance";

async function resolveBudgetEntity({ organization_id, entity_id }) {
  if (!organization_id) throw new Error("organization_id required");
  if (!entity_id) throw new Error("entity_id required");

  const { data, error } = await supabaseAdmin
    .from("legal_entities")
    .select("id, currency")
    .eq("organization_id", organization_id)
    .eq("id", entity_id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Invalid entity for organization");

  return data;
}

async function resolveBudgetPeriod({ organization_id, entity_id, period_id }) {
  if (!period_id) throw new Error("period_id required");

  const { data, error } = await supabaseAdmin
    .from("accounting_periods")
    .select("id, fiscal_year, fiscal_month, start_date, end_date")
    .eq("id", period_id)
    .eq("organization_id", organization_id)
    .eq("entity_id", entity_id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Invalid accounting period for entity");

  return data;
}

export async function createBudgetDocument(input = {}) {
  const category = String(input.category || "").trim();
  const amount = Number(input.amount);

  if (!category) throw new Error("category required");
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Invalid budget amount");
  }

  const entity = await resolveBudgetEntity(input);
  const period = await resolveBudgetPeriod(input);
  const currencyCode = String(
    input.currency_code || entity.currency || ""
  )
    .trim()
    .toUpperCase();

  if (!currencyCode) throw new Error("currency_code required");

  return await createBudget({
    organization_id: input.organization_id,
    entity_id: input.entity_id,
    period_id: input.period_id,
    currency_code: currencyCode,
    category,
    amount,
    month: period.fiscal_month,
    year: period.fiscal_year,
  });
}

export async function listBudgetsCommand(input = {}) {
  await resolveBudgetEntity(input);

  if (input.period_id) {
    await resolveBudgetPeriod(input);
  }

  return await listBudgets(input);
}

export async function calculateBudgetVarianceCommand(input = {}) {
  return await calculateBudgetVariance({
    organizationId: input.organizationId || input.organization_id,
    entityId: input.entityId || input.entity_id,
    periodId: input.periodId || input.period_id,
  });
}

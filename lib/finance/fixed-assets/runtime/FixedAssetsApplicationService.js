import createFixedAsset from "../documents/createFixedAsset";
import { calculateDepreciation } from "../capabilities/calculateDepreciation";
import { postDepreciationToLedgerCommand } from "@/lib/finance/general-ledger/runtime/GeneralLedgerApplicationService";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function normalizeDate(value, field) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    throw new Error(`${field} required`);
  }
  return date.toISOString().slice(0, 10);
}

export async function createFixedAssetCommand(input) {
  return await createFixedAsset(input);
}

export async function listFixedAssetsCommand(input) {
  const { organization_id, entity_id = null } = input || {};

  if (!organization_id) {
    throw new Error("organization_id required");
  }

  let query = supabaseAdmin
    .from("fixed_assets")
    .select("*")
    .eq("organization_id", organization_id);

  if (entity_id) {
    query = query.eq("entity_id", entity_id);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) throw error;

  return {
    success: true,
    assets: data || [],
  };
}

export async function calculateDepreciationCommand(input = {}) {
  const {
    organization_id,
    entity_id = null,
  } = input;

  if (!organization_id) {
    throw new Error("organization_id required");
  }

  let query = supabaseAdmin
    .from("fixed_assets")
    .select(
      "id, organization_id, entity_id, asset_name, purchase_cost, salvage_value, useful_life_years, depreciation_method, accumulated_depreciation, current_book_value, status"
    )
    .eq("organization_id", organization_id)
    .eq("status", "active");

  if (entity_id) {
    query = query.eq("entity_id", entity_id);
  }

  const { data, error } = await query.order("asset_name", { ascending: true });

  if (error) throw error;

  const assets = data || [];

  return {
    success: true,
    assets: calculateDepreciation({ assets }),
    count: assets.length,
  };
}

export async function runDepreciationCommand(input = {}) {
  const organizationId = input.organization_id || input.organizationId;
  const entityId = input.entity_id || input.entityId;
  const periodId = input.period_id || input.periodId || null;
  const bookReference = String(input.book_reference || input.bookReference || "PRIMARY").trim();
  const periodStart = normalizeDate(input.period_start || input.periodStart, "period_start");
  const periodEnd = normalizeDate(input.period_end || input.periodEnd, "period_end");
  const postingDate = normalizeDate(input.posting_date || input.postingDate, "posting_date");

  if (!organizationId) throw new Error("organization_id required");
  if (!entityId) throw new Error("entity_id required");
  if (!bookReference) throw new Error("book_reference required");
  if (periodStart > periodEnd) throw new Error("period_start must not be after period_end");

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("finance_organization_profiles")
    .select("functional_currency, base_currency")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (profileError) throw profileError;

  const currencyCode = String(
    input.currency_code ||
    input.currencyCode ||
    profile?.functional_currency ||
    profile?.base_currency ||
    ""
  ).trim().toUpperCase();

  if (!currencyCode) {
    throw new Error("Functional currency must be configured before depreciation can run");
  }

  const { data: existingRun, error: existingRunError } = await supabaseAdmin
    .from("finance_depreciation_runs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("book_reference", bookReference)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .maybeSingle();

  if (existingRunError) throw existingRunError;
  if (existingRun?.status === "COMPLETED") {
    return { success: true, run: existingRun, idempotent: true };
  }

  const calculation = await calculateDepreciationCommand({
    organization_id: organizationId,
    entity_id: entityId,
  });
  const assets = (calculation.assets || []).filter(
    asset => Number(asset.monthly_depreciation || 0) > 0
  );
  const totalAmount = Number(
    assets.reduce((sum, asset) => sum + Number(asset.monthly_depreciation || 0), 0).toFixed(2)
  );

  const runPayload = {
    organization_id: organizationId,
    entity_id: entityId,
    period_id: periodId,
    book_reference: bookReference,
    period_start: periodStart,
    period_end: periodEnd,
    posting_date: postingDate,
    notes: input.notes || null,
    status: totalAmount > 0 ? "DRAFT" : "COMPLETED",
    created_by: input.created_by || input.createdBy || null,
    updated_at: new Date().toISOString(),
  };

  const { data: run, error: runError } = await supabaseAdmin
    .from("finance_depreciation_runs")
    .upsert(runPayload, {
      onConflict: "organization_id,entity_id,book_reference,period_start,period_end",
    })
    .select("*")
    .single();

  if (runError) throw runError;

  if (totalAmount <= 0) {
    return {
      success: true,
      run,
      amount: 0,
      asset_count: 0,
      message: "No remaining depreciation for this scope",
    };
  }

  const journal = await postDepreciationToLedgerCommand({
    organization_id: organizationId,
    organizationId,
    entity_id: entityId,
    entityId,
    period_id: periodId,
    periodId,
    source_module: "FIXED_ASSETS",
    source_id: run.id,
    posting_date: postingDate,
    document_date: postingDate,
    amount: totalAmount,
    tax_amount: 0,
    currency_code: currencyCode,
    exchange_rate: 1,
    description: `Depreciation ${bookReference} ${periodStart} to ${periodEnd}`,
  });

  const entryIds = [];
  for (const asset of assets) {
    const idempotencyKey = `depreciation:${run.id}:${asset.asset_id}`;
    const { data: entryId, error: applyError } = await supabaseAdmin.rpc(
      "apply_finance_depreciation_asset",
      {
        p_organization_id: organizationId,
        p_entity_id: entityId,
        p_period_id: periodId,
        p_run_id: run.id,
        p_fixed_asset_id: asset.asset_id,
        p_depreciation_date: postingDate,
        p_amount: Number(asset.monthly_depreciation),
        p_idempotency_key: idempotencyKey,
      }
    );

    if (applyError) throw applyError;
    entryIds.push(entryId);
  }

  const { data: completedRun, error: completeError } = await supabaseAdmin
    .from("finance_depreciation_runs")
    .update({
      status: "COMPLETED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", run.id)
    .eq("organization_id", organizationId)
    .select("*")
    .single();

  if (completeError) throw completeError;

  return {
    success: true,
    run: completedRun,
    journal,
    amount: totalAmount,
    currency_code: currencyCode,
    asset_count: assets.length,
    depreciation_entry_ids: entryIds,
  };
}

export async function updateFixedAssetCommand(input) {
  const {
    updateFixedAsset,
  } = await import(
    "../repositories/fixedAssetRepository"
  );

  return await updateFixedAsset(input);
}

export async function archiveFixedAssetCommand(input) {
  const {
    archiveFixedAsset,
  } = await import(
    "../repositories/fixedAssetRepository"
  );

  return await archiveFixedAsset(input);
}

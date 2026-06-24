import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import { createJournalEntry }
from "./createJournalEntry";

// =====================================
// POST DEPRECIATION TO LEDGER
// =====================================

export async function postDepreciationToLedger({

  tenantId,

  assetId,

  createdBy,

}) {

  const {
    data: asset,
    error: assetError,
  } = await supabaseAdmin
    .from("fixed_assets")
    .select("*")
    .eq("id", assetId)
    .eq("tenant_id", tenantId)
    .single();

  if (assetError) {
    throw assetError;
  }

  const depreciableAmount =
    Number(asset.purchase_cost || 0) -
    Number(asset.salvage_value || 0);

  const usefulLifeMonths =
    Number(asset.useful_life_years || 5) * 12;

  const monthlyDepreciation =
    usefulLifeMonths > 0
      ? depreciableAmount / usefulLifeMonths
      : 0;

  if (monthlyDepreciation <= 0) {
    throw new Error("Invalid depreciation amount");
  }

  const {
    data: depreciationExpense,
  } = await supabaseAdmin
    .from("chart_of_accounts")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("code", "6030")
    .single();

  const {
    data: accumulatedDepreciation,
  } = await supabaseAdmin
    .from("chart_of_accounts")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("code", "1500")
    .single();

  if (
    !depreciationExpense ||
    !accumulatedDepreciation
  ) {
    throw new Error("Required depreciation accounts missing");
  }

  const journal =
    await createJournalEntry({

      tenantId,

      organizationId:
        asset.organization_id,

      legalEntityId:
        asset.legal_entity_id || null,

      entryDate:
        new Date().toISOString().slice(0, 10),

      description:
        `Monthly depreciation for ${asset.asset_name}`,

      sourceType:
        "depreciation",

      sourceId:
        asset.id,

      createdBy:
        createdBy || "system",

      lines: [
        {
          account_id:
            depreciationExpense.id,

          debit:
            monthlyDepreciation,

          credit:
            0,

          description:
            "Depreciation expense",
        },
        {
          account_id:
            accumulatedDepreciation.id,

          debit:
            0,

          credit:
            monthlyDepreciation,

          description:
            "Accumulated depreciation",
        },
      ],

    });

  const newAccumulated =
    Number(asset.accumulated_depreciation || 0) +
    monthlyDepreciation;

  const newBookValue =
    Math.max(
      Number(asset.purchase_cost || 0) -
        newAccumulated,
      Number(asset.salvage_value || 0)
    );

  await supabaseAdmin
    .from("fixed_assets")
    .update({
      accumulated_depreciation:
        newAccumulated,

      current_book_value:
        newBookValue,

      updated_at:
        new Date().toISOString(),
    })
    .eq("id", asset.id)
    .eq("tenant_id", tenantId);

  await supabaseAdmin
    .from("depreciation_entries")
    .insert([{
      fixed_asset_id:
        asset.id,

      depreciation_date:
        new Date().toISOString().slice(0, 10),

      depreciation_amount:
        monthlyDepreciation,

      accumulated_depreciation:
        newAccumulated,

      remaining_book_value:
        newBookValue,

      journal_entry_id:
        journal.journal_entry_id,
    }]);

  return {
    success: true,
    asset_id: asset.id,
    depreciation_amount: monthlyDepreciation,
    journal_entry_id: journal.journal_entry_id,
  };

}
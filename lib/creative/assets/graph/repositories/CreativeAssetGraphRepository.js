import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_asset_nodes";

function reuseContract(value = {}) {
  return {
    reusable: value?.reusable ?? true,
    reuse_count: Number(value?.reuse_count || 0),
    approved_for_reuse: value?.approved_for_reuse === true,
  };
}

function normalizeRow(row = null) {
  if (!row) return row;

  return {
    ...row,
    reuse: reuseContract(
      row.reuse ||
      row.metadata?.reuse ||
      {},
    ),
  };
}

function sanitizePayload(values = {}, { update = false } = {}) {
  const payload = {
    ...values,
  };

  const reuse
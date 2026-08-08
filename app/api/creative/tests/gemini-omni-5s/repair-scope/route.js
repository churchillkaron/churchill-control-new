export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeProductionTaskAssetScopeBindingRuntime,
} from "@/lib/creative/assets/isolation/runtime/CreativeProductionTaskAssetScopeBindingRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "0230a08a-6b47-46e1-9f51-7956d70d304b";
const VIDEO_TASK_ID = "85241ba5-675f-4c25-86d2-3b28114fc74e";
const TEST_CONTRACT = "GEMINI_OMNI_FULL_STUDIO_5S_SMOKE_V1";

function text(value) {
  return String(value ?? "").trim();
}

function json(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}

async function usageCount() {
  const { count, error } = await supabaseAdmin
    .from("platform_service_usage")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ORGANIZATION_ID)
    .eq("metadata->>task_id", VIDEO_TASK_ID);
  if (error) throw error;
  return Number(count || 0);
}

async function repair(request) {
  const access = await requireOrganizationAccess({
    organizationId: ORGANIZATION_ID,
    request,
    requiredAnyPermission: [
      "creative.execute",
      "creative.production.run",
      "creative.*",
    ],
  });
  if (!access.success) return json(access, access.status);

  const before = await ProductionTaskRuntime.get(VIDEO_TASK_ID);
  if (!before) throw new Error("GEMINI_SMOKE_VIDEO_TASK_NOT_FOUND");
  if (String(before.organization_id) !== ORGANIZATION_ID) {
    throw new Error("GEMINI_SMOKE_TASK_ORGANIZATION_INVALID");
  }
  if (String(before.creative_project_id) !== PROJECT_ID) {
    throw new Error("GEMINI_SMOKE_TASK_PROJECT_INVALID");
  }
  if (text(before.status).toUpperCase() !== "WAITING") {
    throw new Error(`GEMINI_SMOKE_SCOPE_REPAIR_REQUIRES_WAITING:${before.status}`);
  }
  if (await usageCount() !== 0) {
    throw new Error("GEMINI_SMOKE_SCOPE_REPAIR_REQUIRES_ZERO_USAGE");
  }

  const bound = await CreativeProductionTaskAssetScopeBindingRuntime.bind(before);
  const scopeHash = text(bound.input?.requirements?.asset_scope?.scope_hash);
  const metadataHash = text(bound.metadata?.asset_scope_hash);
  if (!scopeHash || metadataHash !== scopeHash) {
    throw new Error("GEMINI_SMOKE_SCOPE_REPAIR_VERIFICATION_FAILED");
  }
  if (await usageCount() !== 0) {
    throw new Error("GEMINI_SMOKE_SCOPE_REPAIR_CREATED_UNEXPECTED_USAGE");
  }

  return json({
    success: true,
    status: "GEMINI_SMOKE_CANONICAL_SCOPE_REPAIRED",
    contract: TEST_CONTRACT,
    task_id: VIDEO_TASK_ID,
    task_status: bound.status,
    scope_contract: bound.metadata?.asset_scope_contract || null,
    scope_hash: scopeHash,
    canonical_binding_contract:
      bound.metadata?.canonical_asset_scope_binding_contract || null,
    provider_usage_count: 0,
    provider_call_executed: false,
    customer_price_charged_thb: 0,
    publication_authorized: false,
  });
}

export async function GET(request) {
  try {
    return await repair(request);
  } catch (error) {
    return json({
      success: false,
      contract: TEST_CONTRACT,
      provider_call_executed: false,
      publication_authorized: false,
      error: error?.message || String(error),
    }, 409);
  }
}

export async function POST(request) {
  return GET(request);
}

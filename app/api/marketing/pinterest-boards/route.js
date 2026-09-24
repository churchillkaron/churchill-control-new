export const dynamic = "force-dynamic";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveProviderCredential } from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";
import { PinterestProvider } from "@/lib/platform/service-runtime/providers/pinterest/PinterestProvider";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) { return String(value ?? "").trim(); }

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId: url.searchParams.get("organizationId") || url.searchParams.get("organization_id"),
      request,
    });
    if (!access.success) return Response.json({ success: false, error: access.error }, { status: access.status || 403 });
    const assetId = text(url.searchParams.get("accountAssetId"));
    if (!assetId) return Response.json({ success: false, error: "Select a Pinterest account first" }, { status: 400 });
    const { data: asset, error } = await supabaseAdmin.from("organization_channel_assets")
      .select("id,organization_id,channel_provider,asset_type")
      .eq("organization_id", access.organizationId).eq("id", assetId)
      .eq("channel_provider", "pinterest").eq("asset_type", "pinterest_account").maybeSingle();
    if (error) throw error;
    if (!asset) return Response.json({ success: false, error: "Pinterest account is not available for this organization" }, { status: 400 });
    const credential = await resolveProviderCredential({ organization_id: access.organizationId, provider: "pinterest" });
    if (!credential?.credential_id) return Response.json({ success: false, error: "Pinterest credential is not ready" }, { status: 400 });
    const result = await PinterestProvider.execute({ capability: "marketing.pinterest.boards.read", ...credential, context: { organization_id: access.organizationId } });
    const boards = (result?.output?.boards || []).map((row) => ({
      id: text(row.id),
      name: text(row.name) || text(row.id),
      privacy: text(row.privacy) || null,
      description: text(row.description) || null,
    })).filter((row) => row.id);
    return Response.json({ success: true, data: { boards } });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || "Unable to load Pinterest boards" }, { status: error?.status || 500 });
  }
}

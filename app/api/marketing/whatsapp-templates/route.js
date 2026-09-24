export const dynamic = "force-dynamic";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveProviderCredential } from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";
import "@/lib/platform/service-runtime/providers/whatsapp/WhatsAppCredentialRegistration";

function text(value) { return String(value ?? "").trim(); }

function placeholderCount(components = []) {
  let count = 0;
  let unsupported = false;
  for (const component of Array.isArray(components) ? components : []) {
    const type = text(component?.type).toUpperCase();
    const body = text(component?.text);
    const matches = [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)];
    if (type === "BODY") count += matches.length;
    else if (matches.length) unsupported = true;
    if (type === "HEADER" && text(component?.format).toUpperCase() && text(component?.format).toUpperCase() !== "TEXT") unsupported = true;
  }
  return { body_parameter_count: count, unsupported_variable_structure: unsupported };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId: url.searchParams.get("organizationId") || url.searchParams.get("organization_id"),
      request,
    });
    if (!access.success) {
      return Response.json({ success: false, error: access.error || "Organization access denied" }, { status: access.status || 403 });
    }

    const credential = await resolveProviderCredential({ organization_id: access.organizationId, provider: "whatsapp" });
    if (!credential?.access_token || !credential?.waba_id) {
      return Response.json({ success: false, error: "WhatsApp Business Account is not connected for this organization" }, { status: 400 });
    }

    const q = text(url.searchParams.get("q")).toLowerCase();
    const graphUrl = new URL(`https://graph.facebook.com/v23.0/${encodeURIComponent(credential.waba_id)}/message_templates`);
    graphUrl.searchParams.set("fields", "id,name,status,category,language,components,quality_score");
    graphUrl.searchParams.set("limit", "100");
    const response = await fetch(graphUrl, {
      headers: { Authorization: `Bearer ${credential.access_token}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.error) {
      return Response.json({ success: false, error: payload?.error?.message || `WhatsApp template lookup failed (${response.status})` }, { status: 502 });
    }

    const results = (payload.data || [])
      .filter((row) => text(row.status).toUpperCase() === "APPROVED")
      .filter((row) => !q || text(row.name).toLowerCase().includes(q) || text(row.language).toLowerCase().includes(q))
      .map((row) => ({
        id: text(row.id),
        name: text(row.name),
        language: text(row.language),
        status: "APPROVED",
        category: text(row.category) || null,
        quality_score: row.quality_score || null,
        components: Array.isArray(row.components) ? row.components : [],
        ...placeholderCount(row.components),
      }));

    return Response.json({ success: true, data: { results } });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || "Unable to load WhatsApp templates" }, { status: error?.status || 500 });
  }
}

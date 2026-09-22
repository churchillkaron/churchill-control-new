import crypto from "node:crypto";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const runtime = "nodejs";
const REQUIRED_PERMISSION = "platform.code.ai.execute";

function text(value, maximum = 2000) { return String(value ?? "").trim().slice(0, maximum); }
function allowedRoots(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item, 1200)).filter((item) => item.startsWith("/") || /^[A-Za-z]:[\\/]/.test(item)))].slice(0, 12);
}
async function accessFor(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request, requiredPermission: REQUIRED_PERMISSION });
  if (!access.success) return { error: Response.json({ success: false, error: access.error }, { status: access.status || 403 }) };
  return { access };
}

export async function GET(request) {
  const organizationId = text(new URL(request.url).searchParams.get("organizationId"), 200);
  if (!organizationId) return Response.json({ success: false, error: "organizationId required" }, { status: 400 });
  const auth = await accessFor(request, organizationId);
  if (auth.error) return auth.error;
  const result = await supabaseAdmin.from("avantiqo_code_devices")
    .select("id,display_name,platform,enabled,capabilities,allowed_roots,last_seen_at,metadata,paired_at")
    .eq("organization_id", organizationId).order("last_seen_at", { ascending: false, nullsFirst: false });
  if (result.error) return Response.json({ success: false, error: result.error.message }, { status: 500 });
  const now = Date.now();
  const devices = (result.data || []).map((row) => ({
    ...row,
    online: row.enabled === true && Number.isFinite(new Date(row.last_seen_at || 0).getTime()) && now - new Date(row.last_seen_at).getTime() <= 90_000,
  }));
  return Response.json({ success: true, organization_id: organizationId, devices });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const organizationId = text(body.organizationId || body.organization_id, 200);
  if (!organizationId) return Response.json({ success: false, error: "organizationId required" }, { status: 400 });
  const auth = await accessFor(request, organizationId);
  if (auth.error) return auth.error;
  const roots = allowedRoots(body.allowed_roots || body.allowedRoots);
  if (!roots.length) return Response.json({ success: false, error: "At least one absolute allowed root is required" }, { status: 400 });
  const code = crypto.randomBytes(24).toString("base64url");
  const hash = crypto.createHash("sha256").update(code).digest("hex");
  const userId = text(auth.access.user?.id || auth.access.userId, 200);
  const requestedCapabilities = ["code.workspace", "code.terminal", "code.browser.verify"];
  const inserted = await supabaseAdmin.from("avantiqo_code_device_pairings").insert({
    organization_id: organizationId,
    pairing_hash: hash,
    created_by: userId,
    requested_capabilities: requestedCapabilities,
    allowed_roots: roots,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  }).select("id,expires_at").single();
  if (inserted.error) return Response.json({ success: false, error: inserted.error.message }, { status: 500 });
  return Response.json({
    success: true,
    pairing_id: inserted.data.id,
    pairing_code: code,
    expires_at: inserted.data.expires_at,
    allowed_roots: roots,
    requested_capabilities: requestedCapabilities,
    one_time_secret: true,
  });
}

export async function DELETE(request) {
  const body = await request.json().catch(() => ({}));
  const organizationId = text(body.organizationId || body.organization_id, 200);
  const deviceId = text(body.deviceId || body.device_id, 200);
  if (!organizationId || !deviceId) return Response.json({ success: false, error: "organizationId and deviceId required" }, { status: 400 });
  const auth = await accessFor(request, organizationId);
  if (auth.error) return auth.error;
  const result = await supabaseAdmin.from("avantiqo_code_devices").update({ enabled: false, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId).eq("id", deviceId).select("id,enabled").maybeSingle();
  if (result.error) return Response.json({ success: false, error: result.error.message }, { status: 500 });
  if (!result.data) return Response.json({ success: false, error: "Device not found" }, { status: 404 });
  return Response.json({ success: true, device: result.data });
}

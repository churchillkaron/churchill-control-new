export const dynamic = "force-dynamic";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const STATES = new Set(["IN_PROGRESS", "SKIPPED", "COMPLETE"]);
const SECTIONS = new Set([
  "brand", "modules", "team", "roles_permissions", "finance", "documents", "people", "staff_portal", "payroll", "commercial", "supply_chain",
  "operations", "pos", "customer_portal", "supplier_portal", "projects", "hotel_channels", "communications", "payments", "locations",
  "integrations", "domains", "compliance", "passkeys", "developer_api", "security",
]);

function text(value) { return String(value ?? "").trim(); }
function missingTable(error) { return ["42P01", "PGRST205"].includes(error?.code); }

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return Response.json(access, { status: access.status || 403 });

    const result = await supabaseAdmin
      .from("organization_onboarding_progress")
      .select("section_key,workflow_state,metadata,updated_at")
      .eq("organization_id", access.organizationId);

    if (result.error) {
      if (missingTable(result.error)) return Response.json({ success:true, available:false, sections:{} });
      throw result.error;
    }

    return Response.json({
      success:true,
      available:true,
      sections:Object.fromEntries((result.data || []).map((row) => [row.section_key, row])),
    });
  } catch (error) {
    return Response.json({ success:false, error:error?.message || "Unable to load onboarding progress" }, { status:500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = text(body.organizationId || body.organization_id);
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return Response.json(access, { status: access.status || 403 });

    const sectionKey = text(body.sectionKey || body.section_key).toLowerCase();
    const workflowState = text(body.workflowState || body.workflow_state).toUpperCase();
    if (!sectionKey) return Response.json({ success:false, error:"SECTION_KEY_REQUIRED" }, { status:400 });
    if (!SECTIONS.has(sectionKey)) return Response.json({ success:false, error:"ONBOARDING_SECTION_INVALID" }, { status:400 });
    if (!STATES.has(workflowState)) return Response.json({ success:false, error:"ONBOARDING_WORKFLOW_STATE_INVALID" }, { status:400 });

    const result = await supabaseAdmin
      .from("organization_onboarding_progress")
      .upsert({
        organization_id: access.organizationId,
        section_key: sectionKey,
        workflow_state: workflowState,
        metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {},
        updated_by: access.userId || access.user?.id || null,
        updated_at: new Date().toISOString(),
      }, { onConflict:"organization_id,section_key" })
      .select("section_key,workflow_state,metadata,updated_at")
      .single();

    if (result.error) {
      if (missingTable(result.error)) {
        return Response.json({ success:false, error:"ONBOARDING_PROGRESS_MIGRATION_REQUIRED" }, { status:503 });
      }
      throw result.error;
    }

    return Response.json({ success:true, section:result.data });
  } catch (error) {
    return Response.json({ success:false, error:error?.message || "Unable to update onboarding progress" }, { status:500 });
  }
}

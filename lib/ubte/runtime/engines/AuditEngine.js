import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function writeAuditLog({
  context,
  domain,
  capability,
  action,
  result,
}) {
  await supabaseAdmin
    .from("audit_logs")
    .insert({
      organization_id:
        context.organizationId,
      module:
        domain,
      action:
        `${capability}.${action}`,
      reference_id:
        result?.id || null,
      metadata: {
        actor:
          context.actor || null,
        requestId:
          context.requestId,
        correlationId:
          context.correlationId,
        capability,
        action,
      },
      created_at:
        new Date().toISOString(),
    });

  return true;
}

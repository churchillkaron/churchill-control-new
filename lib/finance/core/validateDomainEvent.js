import { supabase } from "@/lib/supabase";

export async function validateDomainEvent({
  tenantId,
  domainName,
  eventType,
  sourceReference,
}) {
  const { data: domain, error } =
    await supabase
      .from(
        "accounting_domain_registry"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("domain_name", domainName)
      .single();

  if (error || !domain) {
    throw new Error(
      "Domain rules not found"
    );
  }

  const allowed =
    domain.allowed_event_types || [];

  if (!allowed.includes(eventType)) {
    const { data: violation } =
      await supabase
        .from(
          "accounting_domain_violations"
        )
        .insert({
          tenant_id: tenantId,
          domain_name:
            domainName,
          violation_type:
            "INVALID_EVENT",
          source_reference:
            sourceReference,
          violation_details: {
            eventType,
            allowed,
          },
        })
        .select()
        .single();

    throw new Error(
      `Domain violation detected: ${violation.id}`
    );
  }

  return {
    valid: true,
  };
}

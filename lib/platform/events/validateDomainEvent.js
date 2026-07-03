import { supabase } from "@/lib/supabase";

export async function validateDomainEvent({
  organizationId,
  organization_id,
  domainName,
  eventType,
  sourceReference,
}) {
  const resolvedOrganizationId =
    organizationId || organization_id;

  if (!resolvedOrganizationId) {
    throw new Error("organizationId required");
  }

  const { data: domain, error } =
    await supabase
      .from("accounting_domain_registry")
      .select("*")
      .eq("organization_id", resolvedOrganizationId)
      .eq("domain_name", domainName)
      .single();

  if (error || !domain) {
    throw new Error("Domain rules not found");
  }

  const allowed =
    domain.allowed_event_types || [];

  if (!allowed.includes(eventType)) {
    const { data: violation } =
      await supabase
        .from("accounting_domain_violations")
        .insert({
          organization_id: resolvedOrganizationId,
          domain_name: domainName,
          violation_type: "INVALID_EVENT",
          source_reference: sourceReference,
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

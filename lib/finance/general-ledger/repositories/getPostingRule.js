import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getAccountingMode } from "../rules/getAccountingMode.js";

export async function getPostingRule({
  organizationId,
  entityId,
  eventType,
}) {

  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!eventType) {
    throw new Error("eventType required");
  }

  const mode =
    getAccountingMode(
      organizationId
    );

  const resolvedEntityId =
    mode === "MULTI_ENTITY"
      ? entityId
      : null;

  let query =
    supabaseAdmin
      .from("finance_posting_mappings")
      .select("*")
      .eq(
        "organization_id",
        organizationId
      )
      .eq(
        "event_type",
        eventType
      )
      .eq(
        "status",
        "ACTIVE"
      );

  if (resolvedEntityId) {

    query =
      query.eq(
        "entity_id",
        resolvedEntityId
      );

  } else {

    query =
      query.is(
        "entity_id",
        null
      );

  }

  const {
    data,
    error,
  } =
    await query
      .limit(1)
      .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {

    throw new Error(

      `No posting rule configured for ${eventType}`

    );

  }

  return data;

}

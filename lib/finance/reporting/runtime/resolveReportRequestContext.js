import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  resolveEntity,
} from "@/lib/platform/entities/resolveEntity";
import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

function readValue(source, camelKey, snakeKey) {
  if (!source) {
    return null;
  }

  if (typeof source.get === "function") {
    return (
      source.get(camelKey) ||
      source.get(snakeKey) ||
      null
    );
  }

  return (
    source[camelKey] ||
    source[snakeKey] ||
    null
  );
}

function invalidDateRange(startDate, endDate) {
  return Boolean(
    startDate &&
    endDate &&
    String(startDate) > String(endDate)
  );
}

export async function resolveReportRequestContext(source) {
  const requestedOrganizationId = readValue(
    source,
    "organizationId",
    "organization_id"
  );
  const requestedEntityId = readValue(
    source,
    "entityId",
    "entity_id"
  );
  const requestedPeriodId = readValue(
    source,
    "periodId",
    "period_id"
  );
  const requestedStartDate = readValue(
    source,
    "startDate",
    "date_from"
  );
  const requestedEndDate = readValue(
    source,
    "endDate",
    "date_to"
  );

  if (!requestedOrganizationId) {
    return {
      success: false,
      status: 400,
      error: "organizationId required",
    };
  }

  if (!requestedEntityId) {
    return {
      success: false,
      status: 400,
      error: "entityId required",
    };
  }

  if (
    !requestedPeriodId &&
    (!requestedStartDate || !requestedEndDate)
  ) {
    return {
      success: false,
      status: 400,
      error: "periodId or a complete date range is required",
    };
  }

  if (invalidDateRange(requestedStartDate, requestedEndDate)) {
    return {
      success: false,
      status: 400,
      error: "Report startDate must not exceed endDate",
    };
  }

  const access = await requireOrganizationAccess({
    organizationId: requestedOrganizationId,
  });

  if (!access.success) {
    return access;
  }

  const entity = await resolveEntity({
    organizationId: access.organizationId,
    entityId: requestedEntityId,
  });

  if (!entity) {
    return {
      success: false,
      status: 404,
      error: "Legal entity not found in organisation",
    };
  }

  let period = null;

  if (requestedPeriodId) {
    const periodQuery = supabaseAdmin
      .from("accounting_periods")
      .select(`
        id,
        organization_id,
        entity_id,
        name,
        start_date,
        end_date,
        status
      `)
      .eq("organization_id", access.organizationId)
      .eq("id", requestedPeriodId)
      .or(`entity_id.eq.${requestedEntityId},entity_id.is.null`)
      .maybeSingle();

    const {
      data: resolvedPeriod,
      error: periodError,
    } = await periodQuery;

    if (periodError) {
      throw periodError;
    }

    if (!resolvedPeriod) {
      return {
        success: false,
        status: 404,
        error: "Accounting period not found in organisation/entity scope",
      };
    }

    period = resolvedPeriod;

    if (
      requestedStartDate &&
      String(requestedStartDate) < String(period.start_date)
    ) {
      return {
        success: false,
        status: 400,
        error: "Report startDate is outside the selected accounting period",
      };
    }

    if (
      requestedEndDate &&
      String(requestedEndDate) > String(period.end_date)
    ) {
      return {
        success: false,
        status: 400,
        error: "Report endDate is outside the selected accounting period",
      };
    }
  }

  return {
    success: true,
    organizationId: access.organizationId,
    organization: access.organization || null,
    entityId: entity.id,
    entity,
    periodId: period?.id || null,
    period,
    startDate:
      requestedStartDate ||
      period?.start_date ||
      null,
    endDate:
      requestedEndDate ||
      period?.end_date ||
      null,
  };
}

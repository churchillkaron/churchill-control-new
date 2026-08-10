import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  resolveEntity,
} from "@/lib/platform/entities/resolveEntity";

function normalizeId(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "undefined" || normalized === "null") {
    return null;
  }
  return normalized;
}

function activeMembership(record = {}) {
  const status = String(record.status || "").trim().toUpperCase();
  return ![
    "INACTIVE",
    "DISABLED",
    "SUSPENDED",
    "TERMINATED",
    "ARCHIVED",
    "REVOKED",
  ].includes(status);
}

function formatDate(value, timeZone = "UTC") {
  if (!value) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat(
      "en-GB",
      {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone,
      }
    ).format(new Date(value));
  } catch {
    return value;
  }
}

export async function resolveDetailReadModel({
  row,
  organizationId,
}) {
  if (!row) {
    return null;
  }

  const resolvedOrganizationId = normalizeId(organizationId);
  if (!resolvedOrganizationId) {
    throw new Error("organizationId required");
  }

  const rowOrganizationId = normalizeId(row.organization_id);
  if (
    rowOrganizationId &&
    rowOrganizationId !== resolvedOrganizationId
  ) {
    throw new Error("READ_MODEL_ORGANIZATION_MISMATCH");
  }

  const enriched = {
    ...row,
  };

  if (
    row.journal_number &&
    Array.isArray(row.lines)
  ) {
    enriched["Journal Lines"] = row.lines.map(
      line => ({
        account:
          line.account?.code +
          " " +
          line.account?.name,
        debit: line.debit || 0,
        credit: line.credit || 0,
      })
    );

    delete enriched.lines;
  }

  const staffIds = [
    row.assigned_to,
    row.created_by,
    row.started_by,
    row.completed_by,
  ]
    .map(normalizeId)
    .filter(Boolean);

  if (staffIds.length) {
    const {
      data: memberships,
      error: membershipError,
    } = await supabaseAdmin
      .from("organization_users")
      .select("staff_account_id,status")
      .eq("organization_id", resolvedOrganizationId)
      .in("staff_account_id", staffIds);

    if (membershipError) {
      throw membershipError;
    }

    const membershipStaffIds = new Set(
      (memberships || [])
        .filter(activeMembership)
        .map(item => normalizeId(item.staff_account_id))
        .filter(Boolean)
    );

    const {
      data: staff,
      error: staffError,
    } = await supabaseAdmin
      .from("staff_accounts")
      .select("id,party_id,active_organization_id")
      .in("id", staffIds);

    if (staffError) {
      throw staffError;
    }

    const authorizedStaff = (staff || []).filter(item => {
      const staffId = normalizeId(item.id);
      return (
        membershipStaffIds.has(staffId) ||
        normalizeId(item.active_organization_id) === resolvedOrganizationId
      );
    });

    const partyIds = authorizedStaff
      .map(item => normalizeId(item.party_id))
      .filter(Boolean);

    const {
      data: parties,
      error: partyError,
    } = partyIds.length
      ? await supabaseAdmin
          .from("parties")
          .select("id,display_name")
          .eq("organization_id", resolvedOrganizationId)
          .in("id", partyIds)
      : {
          data: [],
          error: null,
        };

    if (partyError) {
      throw partyError;
    }

    const partyMap = Object.fromEntries(
      (parties || []).map(party => [
        party.id,
        party.display_name,
      ])
    );

    const staffMap = Object.fromEntries(
      authorizedStaff.map(item => [
        item.id,
        partyMap[item.party_id] || item.id,
      ])
    );

    if (row.assigned_to && staffMap[row.assigned_to]) {
      enriched["Assigned To"] = staffMap[row.assigned_to];
    }

    if (row.created_by && staffMap[row.created_by]) {
      enriched["Created By"] = staffMap[row.created_by];
    }

    if (row.started_by && staffMap[row.started_by]) {
      enriched["Started By"] = staffMap[row.started_by];
    }

    if (row.completed_by && staffMap[row.completed_by]) {
      enriched["Completed By"] = staffMap[row.completed_by];
    }
  }

  delete enriched.assigned_to;
  delete enriched.created_by;
  delete enriched.started_by;
  delete enriched.completed_by;

  enriched["Created At"] = formatDate(row.created_at);
  enriched["Updated At"] = formatDate(row.updated_at);
  enriched["Started At"] = formatDate(row.started_at);
  enriched["Completed At"] = formatDate(row.completed_at);

  const {
    data: organization,
    error: organizationError,
  } = await supabaseAdmin
    .from("organizations")
    .select("id,name")
    .eq("id", resolvedOrganizationId)
    .maybeSingle();

  if (organizationError) {
    throw organizationError;
  }

  if (organization) {
    enriched["Organization"] = organization.name;
  }

  if (row.entity_id) {
    const entity = await resolveEntity({
      organizationId: resolvedOrganizationId,
      entityId: row.entity_id,
    });

    if (entity) {
      enriched["Entity"] =
        entity.display_name ||
        entity.legal_name;
    }
  }

  delete enriched.organization_id;
  delete enriched.entity_id;
  delete enriched.created_at;
  delete enriched.updated_at;
  delete enriched.started_at;
  delete enriched.completed_at;

  const display = {
    ...(enriched["Organization"]
      ? {
          Organization: enriched["Organization"],
        }
      : {}),
    ...(enriched["Entity"]
      ? {
          Entity: enriched["Entity"],
        }
      : {}),
    ...(enriched["Assigned To"]
      ? {
          "Assigned To": enriched["Assigned To"],
        }
      : {}),
    ...enriched,
  };

  return Object.fromEntries(
    Object.entries(display).filter(([, value]) =>
      value !== null &&
      value !== undefined &&
      value !== ""
    )
  );
}

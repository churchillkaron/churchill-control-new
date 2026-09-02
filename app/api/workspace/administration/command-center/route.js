export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PRIVILEGED_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "ADMIN",
  "SUPER_ADMIN",
  "PLATFORM_OWNER",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function adminHref(path) {
  return `/administration/${clean(path).replace(/^\/+/, "")}`;
}

async function safeSource(name, task, fallback = []) {
  try {
    return { name, status: "connected", data: await task(), error: null };
  } catch (error) {
    console.error("ADMINISTRATION_COMMAND_CENTER_SOURCE_FAILED", { source: name, error });
    return {
      name,
      status: "error",
      data: fallback,
      error: error?.message || "Source unavailable",
    };
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(
      url.searchParams.get("organizationId") ||
        url.searchParams.get("organization_id"),
    );
    const entityId = clean(
      url.searchParams.get("entityId") || url.searchParams.get("entity_id"),
    );
    const periodId = clean(
      url.searchParams.get("periodId") || url.searchParams.get("period_id"),
    );

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }

    const context = await resolveBusinessContext({
      organizationId: access.organizationId,
      entityId: entityId || null,
      periodId: periodId || null,
      request,
      access,
    });
    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error },
        { status: context.status || 400 },
      );
    }

    const [
      organizationSource,
      entitiesSource,
      membershipsSource,
      permissionsSource,
      modulesSource,
      unitsSource,
      departmentsSource,
      teamsSource,
      locationsSource,
      policiesSource,
      featureFlagsSource,
      subscriptionsSource,
      auditSource,
    ] = await Promise.all([
      safeSource("organizations", async () => {
        const { data, error } = await supabaseAdmin
          .from("organizations")
          .select("id,name,legal_name,organization_type,status,organization_status,industry,country,address,created_at")
          .eq("id", context.organizationId)
          .maybeSingle();
        if (error) throw error;
        return data || null;
      }, null),
      safeSource("legal_entities", async () => {
        const { data, error } = await supabaseAdmin
          .from("legal_entities")
          .select("id,code,legal_name,display_name,country,currency,timezone,locale,is_active,is_default_accounting_entity,governance_review_required,governance_review_reasons,parent_entity_id,created_at,updated_at")
          .eq("organization_id", context.organizationId)
          .order("is_default_accounting_entity", { ascending: false })
          .limit(500);
        if (error) throw error;
        return data || [];
      }),
      safeSource("organization_users", async () => {
        const { data, error } = await supabaseAdmin
          .from("organization_users")
          .select("id,organization_id,role,status,staff_account_id,created_at")
          .eq("organization_id", context.organizationId)
          .order("created_at", { ascending: true })
          .limit(5000);
        if (error) throw error;
        return data || [];
      }),
      safeSource("role_permissions", async () => {
        const { data, error } = await supabaseAdmin
          .from("role_permissions")
          .select("id,role,module,can_view,can_create,can_update,can_delete,created_at")
          .eq("organization_id", context.organizationId)
          .limit(10000);
        if (error) throw error;
        return data || [];
      }),
      safeSource("organization_modules", async () => {
        const { data, error } = await supabaseAdmin
          .from("organization_modules")
          .select("id,module_id,status,created_at")
          .eq("organization_id", context.organizationId)
          .order("module_id", { ascending: true })
          .limit(500);
        if (error) throw error;
        return data || [];
      }),
      safeSource("business_units", async () => {
        const { data, error } = await supabaseAdmin
          .from("business_units")
          .select("id,code,name,status,description,created_at,updated_at")
          .eq("organization_id", context.organizationId)
          .order("name", { ascending: true })
          .limit(1000);
        if (error) throw error;
        return data || [];
      }),
      safeSource("departments", async () => {
        const { data, error } = await supabaseAdmin
          .from("departments")
          .select("id,entity_id,code,name,status,is_active,description,created_at,updated_at")
          .eq("organization_id", context.organizationId)
          .order("name", { ascending: true })
          .limit(2000);
        if (error) throw error;
        return data || [];
      }),
      safeSource("teams", async () => {
        const { data, error } = await supabaseAdmin
          .from("teams")
          .select("id,code,name,status,description,created_at,updated_at")
          .eq("organization_id", context.organizationId)
          .order("name", { ascending: true })
          .limit(2000);
        if (error) throw error;
        return data || [];
      }),
      safeSource("business_locations", async () => {
        const { data, error } = await supabaseAdmin
          .from("business_locations")
          .select("id,code,name,location_type,business_unit_id,department_id,status,city,province,country,timezone,currency_code,is_default,created_at,updated_at")
          .eq("organization_id", context.organizationId)
          .order("is_default", { ascending: false })
          .limit(2000);
        if (error) throw error;
        return data || [];
      }),
      safeSource("organization_policies", async () => {
        const { data, error } = await supabaseAdmin
          .from("organization_policies")
          .select("id,category,policy_key,policy_type,description,created_at,updated_at")
          .eq("organization_id", context.organizationId)
          .order("category", { ascending: true })
          .limit(2000);
        if (error) throw error;
        return data || [];
      }),
      safeSource("enterprise_feature_flags", async () => {
        const { data, error } = await supabaseAdmin
          .from("enterprise_feature_flags")
          .select("id,feature_key,feature_name,enabled,rollout_percentage,environment,updated_at,created_at")
          .eq("organization_id", context.organizationId)
          .order("feature_key", { ascending: true })
          .limit(2000);
        if (error) throw error;
        return data || [];
      }),
      safeSource("subscriptions", async () => {
        const { data, error } = await supabaseAdmin
          .from("subscriptions")
          .select("id,status,billing_cycle,currency,selected_modules,created_at,updated_at")
          .eq("organization_id", context.organizationId)
          .order("updated_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        return data || [];
      }),
      safeSource("organization_audit_logs", async () => {
        const { data, error } = await supabaseAdmin
          .from("organization_audit_logs")
          .select("id,entity_type,entity_id,action,actor_email,created_at")
          .eq("organization_id", context.organizationId)
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        return data || [];
      }),
    ]);

    const memberships = membershipsSource.data || [];
    const staffIds = [...new Set(memberships.map((row) => row.staff_account_id).filter(Boolean))];
    const staffSource = await safeSource("staff_accounts", async () => {
      if (!staffIds.length) return [];
      const { data, error } = await supabaseAdmin
        .from("staff_accounts")
        .select("id,email,name,role,position,active,department,auth_user_id,user_id,active_organization_id,party_id")
        .in("id", staffIds)
        .limit(5000);
      if (error) throw error;
      return data || [];
    });

    const entities = entitiesSource.data || [];
    const permissions = permissionsSource.data || [];
    const modules = modulesSource.data || [];
    const units = unitsSource.data || [];
    const departments = departmentsSource.data || [];
    const teams = teamsSource.data || [];
    const locations = locationsSource.data || [];
    const policies = policiesSource.data || [];
    const flags = featureFlagsSource.data || [];
    const subscriptions = subscriptionsSource.data || [];
    const staff = staffSource.data || [];
    const staffById = new Map(staff.map((row) => [row.id, row]));

    const activeMemberships = memberships.filter((row) => !["INACTIVE", "DISABLED", "SUSPENDED", "REVOKED", "ARCHIVED"].includes(normalized(row.status)));
    const inactiveMemberships = memberships.filter((row) => !activeMemberships.includes(row));
    const missingStaff = memberships.filter((row) => row.staff_account_id && !staffById.has(row.staff_account_id));
    const unlinkedAuth = activeMemberships
      .map((row) => ({ membership: row, staff: staffById.get(row.staff_account_id) }))
      .filter(({ staff: member }) => member && !member.auth_user_id && !member.user_id);
    const inactiveStaff = activeMemberships
      .map((row) => staffById.get(row.staff_account_id))
      .filter((row) => row && row.active === false);
    const privilegedMemberships = activeMemberships.filter((row) => PRIVILEGED_ROLES.has(normalized(row.role || staffById.get(row.staff_account_id)?.role)));

    const activeEntities = entities.filter((row) => row.is_active !== false);
    const entityReview = activeEntities.filter((row) => row.governance_review_required === true);
    const entityConfigGaps = activeEntities.filter((row) => !row.currency || !row.country || !row.timezone || !row.locale);
    const defaultEntities = activeEntities.filter((row) => row.is_default_accounting_entity === true);

    const enabledModules = modules.filter((row) => ["ACTIVE", "ENABLED"].includes(normalized(row.status)));
    const disabledModules = modules.filter((row) => !enabledModules.includes(row));
    const disabledFlags = flags.filter((row) => row.enabled === false || Number(row.rollout_percentage ?? 100) <= 0);
    const broadPermissionRows = permissions.filter((row) => row.can_view && row.can_create && row.can_update && row.can_delete);
    const roles = [...new Set([
      ...activeMemberships.map((row) => clean(row.role)).filter(Boolean),
      ...permissions.map((row) => clean(row.role)).filter(Boolean),
    ])];

    const activeUnits = units.filter((row) => !["INACTIVE", "DISABLED", "ARCHIVED"].includes(normalized(row.status)));
    const activeDepartments = departments.filter((row) => row.is_active !== false && !["INACTIVE", "DISABLED", "ARCHIVED"].includes(normalized(row.status)));
    const activeTeams = teams.filter((row) => !["INACTIVE", "DISABLED", "ARCHIVED"].includes(normalized(row.status)));
    const activeLocations = locations.filter((row) => !["INACTIVE", "DISABLED", "ARCHIVED"].includes(normalized(row.status)));
    const activeSubscription = subscriptions.find((row) => ["ACTIVE", "TRIAL", "ENABLED"].includes(normalized(row.status))) || null;

    const queue = [];

    unlinkedAuth.slice(0, 8).forEach(({ membership, staff: member }) => queue.push({
      id: `auth:${membership.id}`,
      kind: "identity",
      priority: "attention",
      title: member?.name || member?.email || "Organization member",
      detail: "Active member has no linked authentication identity",
      status: "Auth linkage",
      href: adminHref("users"),
    }));

    inactiveStaff.slice(0, 6).forEach((member) => queue.push({
      id: `inactive-staff:${member.id}`,
      kind: "identity",
      priority: "attention",
      title: member.name || member.email || "Inactive staff account",
      detail: "Membership remains active while the staff account is inactive",
      status: "Review access",
      href: adminHref("users"),
    }));

    missingStaff.slice(0, 6).forEach((membership) => queue.push({
      id: `orphan:${membership.id}`,
      kind: "identity",
      priority: "critical",
      title: "Membership has no staff record",
      detail: `Role ${membership.role || "Unspecified"}`,
      status: "Orphaned membership",
      href: adminHref("users"),
    }));

    entityReview.slice(0, 6).forEach((entity) => queue.push({
      id: `entity-review:${entity.id}`,
      kind: "structure",
      priority: "attention",
      title: entity.display_name || entity.legal_name || entity.code || "Legal entity",
      detail: Array.isArray(entity.governance_review_reasons) ? entity.governance_review_reasons.join(" · ") : "Governance review required",
      status: "Review configuration",
      href: adminHref("legal-entities"),
    }));

    entityConfigGaps.slice(0, 6).forEach((entity) => queue.push({
      id: `entity-config:${entity.id}`,
      kind: "structure",
      priority: "review",
      title: entity.display_name || entity.legal_name || entity.code || "Legal entity",
      detail: `Missing ${[
        !entity.country ? "country" : null,
        !entity.currency ? "currency" : null,
        !entity.timezone ? "timezone" : null,
        !entity.locale ? "locale" : null,
      ].filter(Boolean).join(", ")}`,
      status: "Configuration gap",
      href: adminHref("legal-entities"),
    }));

    if (activeEntities.length && defaultEntities.length !== 1) {
      queue.push({
        id: "default-entity",
        kind: "structure",
        priority: "attention",
        title: "Default accounting entity needs review",
        detail: `${defaultEntities.length} active entities are marked as default`,
        status: "Entity governance",
        href: adminHref("legal-entities"),
      });
    }

    if (!activeLocations.length) queue.push({ id: "locations", kind: "structure", priority: "review", title: "No business locations configured", detail: "Add locations when operations need location-specific timezone, currency or contact context", status: "Optional setup", href: adminHref("business-locations") });
    if (!policies.length) queue.push({ id: "policies", kind: "policy", priority: "review", title: "No organization policies configured", detail: "Access and workforce policy defaults should be reviewed before stricter enforcement", status: "Policy review", href: adminHref("access-policy") });

    const sources = [
      organizationSource,
      entitiesSource,
      membershipsSource,
      staffSource,
      permissionsSource,
      modulesSource,
      unitsSource,
      departmentsSource,
      teamsSource,
      locationsSource,
      policiesSource,
      featureFlagsSource,
      subscriptionsSource,
      auditSource,
    ].map(({ data, ...entry }) => ({
      ...entry,
      rowCount: Array.isArray(data) ? data.length : data ? 1 : 0,
    }));

    return NextResponse.json({
      success: true,
      ready: true,
      generatedAt: new Date().toISOString(),
      context: {
        organization_id: context.organizationId,
        entity_id: context.entityId || null,
        organization_name: organizationSource.data?.name || organizationSource.data?.legal_name || context.organization?.name || null,
      },
      metrics: {
        identity: {
          members: memberships.length,
          active: activeMemberships.length,
          inactive_memberships: inactiveMemberships.length,
          auth_unlinked: unlinkedAuth.length,
          orphan_memberships: missingStaff.length,
          inactive_staff_with_access: inactiveStaff.length,
          privileged_members: privilegedMemberships.length,
        },
        structure: {
          legal_entities: activeEntities.length,
          entity_reviews: entityReview.length,
          entity_config_gaps: entityConfigGaps.length,
          business_units: activeUnits.length,
          departments: activeDepartments.length,
          teams: activeTeams.length,
          locations: activeLocations.length,
        },
        access: {
          roles: roles.length,
          permission_rows: permissions.length,
          broad_permission_rows: broadPermissionRows.length,
          policies: policies.length,
        },
        product: {
          modules: modules.length,
          enabled_modules: enabledModules.length,
          disabled_modules: disabledModules.length,
          feature_flags: flags.length,
          disabled_feature_flags: disabledFlags.length,
          subscription_status: activeSubscription?.status || subscriptions[0]?.status || null,
        },
        audit: {
          recent_events: (auditSource.data || []).length,
        },
      },
      queue: queue.slice(0, 24),
      structure: {
        entities: activeEntities.slice(0, 20),
        locations: activeLocations.slice(0, 20),
        departments: activeDepartments.slice(0, 20),
        teams: activeTeams.slice(0, 20),
        business_units: activeUnits.slice(0, 20),
      },
      access: {
        roles,
        privileged_members: privilegedMemberships.slice(0, 20),
        permission_rows: permissions.slice(0, 100),
      },
      modules: modules.slice(0, 100),
      featureFlags: flags.slice(0, 100),
      recentAudit: auditSource.data || [],
      sources,
    });
  } catch (error) {
    console.error("ADMINISTRATION_COMMAND_CENTER_FAILED", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Administration workspace failed" },
      { status: 500 },
    );
  }
}

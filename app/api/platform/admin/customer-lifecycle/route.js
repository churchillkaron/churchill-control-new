import { NextResponse } from "next/server";

import { requirePlatformOperatorWorkspaceAccess } from "@/lib/platform/security/requirePlatformOperatorWorkspaceAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PLATFORM_ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const PAGE_SIZE = 1000;
const MAX_RECENT_USAGE_PAGES = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function addDays(timestamp, days) {
  return new Date(timestamp.getTime() + days * DAY_MS);
}

function daysBetween(start, end) {
  const startTime = start ? new Date(start).getTime() : Number.NaN;
  const endTime = end ? new Date(end).getTime() : Number.NaN;
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;
  return Math.max(0, Math.floor((endTime - startTime) / DAY_MS));
}

function inWindow(value, start, end) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp)
    && timestamp >= start.getTime()
    && timestamp < end.getTime();
}

function activeStatus(value) {
  return text(value).toLowerCase() === "active";
}

function executionStateFilter(state) {
  return `execution_status.eq.${state},and(execution_status.is.null,status.eq.${state})`;
}

async function readPaged(makeQuery, { maxPages = MAX_RECENT_USAGE_PAGES } = {}) {
  const rows = [];

  for (let page = 0; page < maxPages; page += 1) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await makeQuery().range(from, to);
    if (error) throw error;

    const pageRows = Array.isArray(data) ? data : [];
    rows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) return { rows, complete: true };
  }

  return { rows, complete: false };
}

async function readSuccessEdge(organizationId, ascending) {
  const { data, error } = await supabaseAdmin
    .from("platform_service_usage")
    .select("created_at")
    .eq("organization_id", organizationId)
    .or(executionStateFilter("success"))
    .order("created_at", { ascending })
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) && data[0]?.created_at ? data[0].created_at : null;
}

function aggregateRecentUsage({ successRows, failureRows, organizations, windows }) {
  const result = new Map(
    organizations.map((organization) => [organization.id, {
      success7d: 0,
      successPrevious7d: 0,
      success30d: 0,
      successPrevious30d: 0,
      failed7d: 0,
      modules30d: new Set(),
      capabilities30d: new Set(),
    }]),
  );

  for (const row of successRows) {
    const current = result.get(row.organization_id);
    if (!current) continue;

    if (inWindow(row.created_at, windows.current7Start, windows.observedAt)) current.success7d += 1;
    if (inWindow(row.created_at, windows.previous7Start, windows.current7Start)) current.successPrevious7d += 1;
    if (inWindow(row.created_at, windows.current30Start, windows.observedAt)) {
      current.success30d += 1;
      const moduleName = text(row.module);
      const capability = text(row.capability);
      if (moduleName) current.modules30d.add(moduleName);
      if (capability) current.capabilities30d.add(capability);
    }
    if (inWindow(row.created_at, windows.previous30Start, windows.current30Start)) {
      current.successPrevious30d += 1;
    }
  }

  for (const row of failureRows) {
    const current = result.get(row.organization_id);
    if (!current) continue;
    if (inWindow(row.created_at, windows.current7Start, windows.observedAt)) current.failed7d += 1;
  }

  return result;
}

function priorityRank(priority) {
  if (priority === "critical") return 0;
  if (priority === "high") return 1;
  if (priority === "watch") return 2;
  return 3;
}

function classifyLifecycle(account, { recentEvidenceComplete }) {
  if (!recentEvidenceComplete) {
    return {
      stage: "evidence_incomplete",
      label: "Evidence incomplete",
      priority: "watch",
      reason: "Recent execution evidence exceeded the bounded owner read. No retention conclusion is made.",
      action: "Repair evidence completeness before acting on lifecycle status.",
    };
  }

  if (!account.humanLinked) {
    if (account.lastSuccessAt) {
      return {
        stage: "service_context",
        label: "Service-only context",
        priority: "observe",
        reason: "Successful service execution exists, but no active human user is linked.",
        action: "Keep outside customer-retention rollups until human account evidence exists.",
      };
    }

    return {
      stage: "unverified_context",
      label: "Account unverified",
      priority: "observe",
      reason: "No active human-user evidence exists, so this organization is not classified as a customer account.",
      action: "Verify whether this is a real customer, internal context, or unfinished onboarding record.",
    };
  }

  if (!account.activeServices) {
    return {
      stage: "setup_incomplete",
      label: "Setup incomplete",
      priority: "high",
      reason: "Active human users exist but no active Avantiqo service configuration is recorded.",
      action: "Complete service setup before measuring adoption.",
    };
  }

  if (!account.lastSuccessAt) {
    if (account.accountAgeDays <= 14) {
      return {
        stage: "onboarding",
        label: "Onboarding",
        priority: "watch",
        reason: "Human access and services exist, but the first successful metered service use has not happened yet.",
        action: "Guide the account to one real successful workflow and measure time to first success.",
      };
    }

    return {
      stage: "value_unproven",
      label: "First success missing",
      priority: "high",
      reason: `${account.accountAgeDays} days since account creation with human access but no recorded successful metered service use.`,
      action: "Establish the first successful customer workflow instead of counting configuration as adoption.",
    };
  }

  if (account.failed7d > account.success7d && account.failed7d > 0) {
    return {
      stage: "platform_blocked",
      label: "Platform blocking adoption",
      priority: "critical",
      reason: `${account.failed7d} failed versus ${account.success7d} successful service executions in the last 7 days.`,
      action: "Restore execution reliability before interpreting usage decline as customer disengagement.",
    };
  }

  if (account.daysSinceLastSuccess !== null && account.daysSinceLastSuccess <= 7) {
    return {
      stage: "active_use",
      label: "Recent successful use",
      priority: "observe",
      reason: `A successful metered service use was recorded ${account.daysSinceLastSuccess} day${account.daysSinceLastSuccess === 1 ? "" : "s"} ago.`,
      action: "Protect the successful workflow and expand adoption only when the customer outcome is understood.",
    };
  }

  if (
    account.firstSuccessAt
    && daysBetween(account.firstSuccessAt, account.observedAt) <= 30
    && account.success7d === 0
  ) {
    return {
      stage: "early_adoption_stalled",
      label: "Early adoption stalled",
      priority: "high",
      reason: `The account reached first success recently, but has no successful service use in the last 7 days.`,
      action: "Re-enter the first-use workflow and identify why repeat use did not form.",
    };
  }

  if (account.daysSinceLastSuccess !== null && account.daysSinceLastSuccess <= 30) {
    const decline = account.successPrevious30d > account.success30d;
    return {
      stage: "fading",
      label: decline ? "Adoption fading" : "Recent use now quiet",
      priority: "high",
      reason: decline
        ? `Successful usage fell from ${account.successPrevious30d} to ${account.success30d} events across the two 30-day windows, with no success in the last 7 days.`
        : `The last successful metered service use was ${account.daysSinceLastSuccess} days ago, with no success in the last 7 days.`,
      action: "Review the last successful workflow and re-engage before inactivity becomes durable.",
    };
  }

  return {
    stage: "dormant",
    label: "Dormant",
    priority: "high",
    reason: `No successful metered service use has been recorded for ${account.daysSinceLastSuccess ?? "an unknown number of"} days.`,
    action: "Confirm whether the account is intentionally inactive, blocked, or at real retention risk.",
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(
      url.searchParams.get("organization_id") || url.searchParams.get("organizationId"),
    );

    const access = await requirePlatformOperatorWorkspaceAccess({ organizationId });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status },
      );
    }

    if (access.organizationId !== PLATFORM_ORGANIZATION_ID) {
      return NextResponse.json(
        { success: false, error: "Avantiqo Platform owner workspace required" },
        { status: 404 },
      );
    }

    const observedAt = new Date();
    const current7Start = addDays(observedAt, -7);
    const previous7Start = addDays(observedAt, -14);
    const current30Start = addDays(observedAt, -30);
    const previous30Start = addDays(observedAt, -60);

    const [organizationResult, userResult, serviceResult, successUsageResult, failureUsageResult] = await Promise.all([
      supabaseAdmin
        .from("organizations")
        .select("id,name,organization_type,status,organization_status,parent_organization_id,created_at")
        .neq("id", PLATFORM_ORGANIZATION_ID)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("organization_users")
        .select("id,organization_id,status,created_at")
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("organization_services")
        .select("id,organization_id,status,activated_at,created_at")
        .neq("organization_id", PLATFORM_ORGANIZATION_ID)
        .order("created_at", { ascending: true }),
      readPaged(() => supabaseAdmin
        .from("platform_service_usage")
        .select("id,organization_id,module,capability,created_at")
        .neq("organization_id", PLATFORM_ORGANIZATION_ID)
        .gte("created_at", previous30Start.toISOString())
        .lt("created_at", observedAt.toISOString())
        .or(executionStateFilter("success"))
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })),
      readPaged(() => supabaseAdmin
        .from("platform_service_usage")
        .select("id,organization_id,created_at")
        .neq("organization_id", PLATFORM_ORGANIZATION_ID)
        .gte("created_at", current7Start.toISOString())
        .lt("created_at", observedAt.toISOString())
        .or(executionStateFilter("failed"))
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })),
    ]);

    if (organizationResult.error) throw organizationResult.error;
    if (userResult.error) throw userResult.error;
    if (serviceResult.error) throw serviceResult.error;

    const organizations = Array.isArray(organizationResult.data) ? organizationResult.data : [];
    const users = Array.isArray(userResult.data) ? userResult.data : [];
    const services = Array.isArray(serviceResult.data) ? serviceResult.data : [];

    const usersByOrganization = new Map();
    for (const user of users) {
      const current = usersByOrganization.get(user.organization_id) || { total: 0, active: 0 };
      current.total += 1;
      if (activeStatus(user.status)) current.active += 1;
      usersByOrganization.set(user.organization_id, current);
    }

    const servicesByOrganization = new Map();
    for (const service of services) {
      const current = servicesByOrganization.get(service.organization_id) || { total: 0, active: 0 };
      current.total += 1;
      if (activeStatus(service.status)) current.active += 1;
      servicesByOrganization.set(service.organization_id, current);
    }

    const windows = {
      observedAt,
      current7Start,
      previous7Start,
      current30Start,
      previous30Start,
    };

    const recent = aggregateRecentUsage({
      successRows: successUsageResult.rows,
      failureRows: failureUsageResult.rows,
      organizations,
      windows,
    });

    const successEdges = new Map(
      await Promise.all(organizations.map(async (organization) => {
        const [firstSuccessAt, lastSuccessAt] = await Promise.all([
          readSuccessEdge(organization.id, true),
          readSuccessEdge(organization.id, false),
        ]);
        return [organization.id, { firstSuccessAt, lastSuccessAt }];
      })),
    );

    const recentEvidenceComplete = successUsageResult.complete && failureUsageResult.complete;

    const accounts = organizations.map((organization) => {
      const userEvidence = usersByOrganization.get(organization.id) || { total: 0, active: 0 };
      const serviceEvidence = servicesByOrganization.get(organization.id) || { total: 0, active: 0 };
      const usage = recent.get(organization.id) || {
        success7d: 0,
        successPrevious7d: 0,
        success30d: 0,
        successPrevious30d: 0,
        failed7d: 0,
        modules30d: new Set(),
        capabilities30d: new Set(),
      };
      const edges = successEdges.get(organization.id) || {};
      const humanLinked = userEvidence.active > 0;
      const accountAgeDays = daysBetween(organization.created_at, observedAt.toISOString()) ?? 0;
      const daysSinceLastSuccess = edges.lastSuccessAt
        ? daysBetween(edges.lastSuccessAt, observedAt.toISOString())
        : null;
      const daysToFirstSuccess = edges.firstSuccessAt
        ? daysBetween(organization.created_at, edges.firstSuccessAt)
        : null;

      const evidence = {
        organizationId: organization.id,
        organizationName: organization.name || "Organization",
        organizationType: organization.organization_type || null,
        parentOrganizationId: organization.parent_organization_id || null,
        organizationStatus: organization.organization_status || organization.status || null,
        createdAt: organization.created_at,
        observedAt: observedAt.toISOString(),
        accountAgeDays,
        humanLinked,
        humanUsers: userEvidence.total,
        activeHumanUsers: userEvidence.active,
        configuredServices: serviceEvidence.total,
        activeServices: serviceEvidence.active,
        firstSuccessAt: edges.firstSuccessAt || null,
        lastSuccessAt: edges.lastSuccessAt || null,
        daysToFirstSuccess,
        daysSinceLastSuccess,
        success7d: usage.success7d,
        successPrevious7d: usage.successPrevious7d,
        success30d: usage.success30d,
        successPrevious30d: usage.successPrevious30d,
        failed7d: usage.failed7d,
        successfulModules30d: usage.modules30d.size,
        successfulCapabilities30d: usage.capabilities30d.size,
      };

      return {
        ...evidence,
        lifecycle: classifyLifecycle(evidence, { recentEvidenceComplete }),
      };
    });

    const humanAccounts = accounts.filter((account) => account.humanLinked);
    const serviceOnlyContexts = accounts.filter((account) => !account.humanLinked && account.lastSuccessAt);
    const unverifiedContexts = accounts.filter((account) => !account.humanLinked && !account.lastSuccessAt);
    const provenHumanAccounts = humanAccounts.filter((account) => account.lastSuccessAt);
    const recentHumanAccounts = humanAccounts.filter((account) => account.success7d > 0);
    const ownerActionAccounts = humanAccounts.filter((account) => ["critical", "high"].includes(account.lifecycle.priority));

    const firstSuccessDays = provenHumanAccounts
      .map((account) => account.daysToFirstSuccess)
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => left - right);
    const medianFirstSuccessDays = firstSuccessDays.length
      ? firstSuccessDays[Math.floor((firstSuccessDays.length - 1) / 2)]
      : null;

    const attention = [...accounts]
      .filter((account) => account.humanLinked)
      .sort((left, right) => {
        const priorityDifference = priorityRank(left.lifecycle.priority) - priorityRank(right.lifecycle.priority);
        if (priorityDifference) return priorityDifference;
        if (right.failed7d !== left.failed7d) return right.failed7d - left.failed7d;
        return number(right.daysSinceLastSuccess) - number(left.daysSinceLastSuccess);
      });

    return NextResponse.json({
      success: true,
      operatorOrganizationId: access.organizationId,
      observedAt: observedAt.toISOString(),
      source: "AVANTIQO_PLATFORM_CUSTOMER_LIFECYCLE_EVIDENCE",
      evidence: {
        recentUsageComplete: recentEvidenceComplete,
        successRowsComplete: successUsageResult.complete,
        failureRowsComplete: failureUsageResult.complete,
        humanLinkRequiredForCustomerRetentionRollup: true,
        churnProbabilityClaimed: false,
        compositeHealthScoreClaimed: false,
        renewalPredictionClaimed: false,
      },
      summary: {
        registeredNonPlatformOrganizations: accounts.length,
        humanLinkedAccounts: humanAccounts.length,
        serviceOnlyContexts: serviceOnlyContexts.length,
        unverifiedContexts: unverifiedContexts.length,
        humanAccountsWithAnySuccessfulUse: provenHumanAccounts.length,
        humanAccountsWithSuccessfulUse7d: recentHumanAccounts.length,
        humanAccountsNeedingOwnerAction: ownerActionAccounts.length,
        medianDaysToFirstSuccessfulUse: medianFirstSuccessDays,
      },
      lifecycleCounts: humanAccounts.reduce((counts, account) => {
        counts[account.lifecycle.stage] = number(counts[account.lifecycle.stage]) + 1;
        return counts;
      }, {}),
      attention,
      serviceOnlyContexts: serviceOnlyContexts.map((account) => ({
        organizationId: account.organizationId,
        organizationName: account.organizationName,
        organizationType: account.organizationType,
        successfulUse30d: account.success30d,
        lastSuccessAt: account.lastSuccessAt,
        lifecycle: account.lifecycle,
      })),
      accounts,
    });
  } catch (error) {
    console.error("PLATFORM_CUSTOMER_LIFECYCLE_GET_ERROR", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to read customer lifecycle evidence",
      },
      { status: 500 },
    );
  }
}
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const DEFAULT_HORIZON_DAYS = 90;
const MAX_HORIZON_DAYS = 366;

function clean(value) {
  return String(value ?? "").trim();
}

function jsonError(message, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function clampDays(value) {
  const number = Number(value || DEFAULT_HORIZON_DAYS);
  if (!Number.isFinite(number)) return DEFAULT_HORIZON_DAYS;
  return Math.max(1, Math.min(MAX_HORIZON_DAYS, Math.floor(number)));
}

function toDate(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDate(value) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function monthStart(value) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function monthEnd(value) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));
}

function addMonths(value, months) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1));
}

function addDays(value, days) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + Number(days || 0));
  return next;
}

function runKey(templateKey, periodEnd) {
  return `${templateKey}:${isoDate(periodEnd)}`;
}

async function requireFinanceView(access) {
  await checkFinancePermission({
    organizationId: access.organizationId,
    userId: access.user?.id,
    permissionKey: "finance.view",
    fullAccess: access.permissions?.includes("*") === true,
  });
}

function monthlyServiceEnabled(engagement) {
  return Boolean(
    engagement.bookkeeping_enabled ||
    engagement.reporting_enabled ||
    (engagement.vat_enabled && String(engagement.vat_frequency || "").toUpperCase() === "MONTHLY") ||
    (engagement.payroll_enabled && String(engagement.payroll_frequency || "").toUpperCase() === "MONTHLY")
  );
}

function annualServiceEnabled(engagement) {
  return Boolean(engagement.audit_enabled || engagement.tax_enabled || engagement.year_end_date);
}

function candidateBase({ engagement, template, period, startAt, dueAt }) {
  const key = runKey(template.template_key, dueAt);
  return {
    idempotency_key: `${engagement.id}:${template.id}:${key}`,
    engagement_id: engagement.id,
    organization_id: engagement.organization_id,
    entity_id: engagement.entity_id || null,
    template_id: template.id,
    template_key: template.template_key,
    template_name: template.name,
    template_version: template.version,
    service_key: template.service_key,
    cadence: template.cadence,
    period_id: period?.id || null,
    period_name: period?.period_name || null,
    run_key: key,
    start_at: startAt.toISOString(),
    due_at: dueAt.toISOString(),
    status: "READY_TO_CREATE",
    blockers: [],
  };
}

function resolvePeriod(periods, entityId, startAt, dueAt) {
  const start = isoDate(startAt);
  const end = isoDate(dueAt);
  return (periods || []).find((period) =>
    period.entity_id === entityId &&
    period.start_date <= end &&
    period.end_date >= start
  ) || null;
}

function parseYearEnd(engagement, referenceYear) {
  const raw = clean(engagement.year_end_date);
  if (!raw) return null;
  const match = raw.match(/^(?:\d{4}-)?(\d{2})-(\d{2})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(referenceYear, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function applyExisting(candidate, existingKeys) {
  if (existingKeys.has(candidate.idempotency_key)) {
    return { ...candidate, status: "ALREADY_EXISTS" };
  }
  return candidate;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = clean(searchParams.get("organizationId") || searchParams.get("organization_id"));
    const horizonDays = clampDays(searchParams.get("days"));

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireFinanceView(access);

    const now = new Date();
    const horizonEnd = addDays(now, horizonDays);

    const [engagementsResult, templatesResult, periodsResult, runsResult, organizationsResult] = await Promise.all([
      supabaseAdmin
        .from("accounting_engagements")
        .select("id,accounting_firm_id,organization_id,entity_id,service_package,bookkeeping_enabled,vat_enabled,payroll_enabled,tax_enabled,reporting_enabled,audit_enabled,vat_frequency,payroll_frequency,year_end_date,start_date,end_date,status")
        .eq("accounting_firm_id", access.organizationId)
        .eq("status", "ACTIVE")
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("accounting_work_program_templates")
        .select("id,organization_id,template_key,name,service_key,cadence,version,is_system,status")
        .eq("status", "ACTIVE")
        .or(`organization_id.is.null,organization_id.eq.${access.organizationId}`),
      supabaseAdmin
        .from("financial_periods")
        .select("id,organization_id,entity_id,period_name,start_date,end_date,status")
        .gte("end_date", isoDate(monthStart(now)))
        .lte("start_date", isoDate(horizonEnd))
        .order("start_date", { ascending: true }),
      supabaseAdmin
        .from("accounting_engagement_runs")
        .select("id,engagement_id,template_id,run_key,due_at,status")
        .eq("accounting_firm_id", access.organizationId)
        .gte("due_at", monthStart(now).toISOString())
        .lte("due_at", addDays(horizonEnd, 62).toISOString()),
      supabaseAdmin
        .from("organizations")
        .select("id,name")
        .in("id", []),
    ]);

    for (const result of [engagementsResult, templatesResult, periodsResult, runsResult]) {
      if (result.error) throw result.error;
    }

    const engagements = engagementsResult.data || [];
    const templates = templatesResult.data || [];
    const periods = periodsResult.data || [];
    const existingRuns = runsResult.data || [];

    const organizationIds = [...new Set(engagements.map((row) => row.organization_id).filter(Boolean))];
    const { data: organizations, error: organizationsError } = organizationIds.length
      ? await supabaseAdmin.from("organizations").select("id,name").in("id", organizationIds)
      : { data: [], error: null };
    if (organizationsError) throw organizationsError;
    const names = new Map((organizations || []).map((row) => [row.id, row.name]));

    const preferredTemplate = (serviceKey) => {
      const firmTemplate = templates.find((row) => row.service_key === serviceKey && row.organization_id === access.organizationId);
      return firmTemplate || templates.find((row) => row.service_key === serviceKey && !row.organization_id) || null;
    };

    const existingKeys = new Set(existingRuns.map((run) => `${run.engagement_id}:${run.template_id}:${run.run_key}`));
    const candidates = [];

    for (const engagement of engagements) {
      const clientName = names.get(engagement.organization_id) || "Client organization";
      const activeStart = toDate(engagement.start_date) || now;
      const activeEnd = toDate(engagement.end_date);

      if (!engagement.entity_id) {
        candidates.push({
          idempotency_key: `${engagement.id}:entity-configuration`,
          engagement_id: engagement.id,
          organization_id: engagement.organization_id,
          entity_id: null,
          client_name: clientName,
          service_package: engagement.service_package,
          status: "BLOCKED_ENTITY_CONFIGURATION",
          blockers: ["A legal entity must be bound before recurring accounting cycles can be planned or created"],
          due_at: null,
          cadence: null,
        });
        continue;
      }

      if (monthlyServiceEnabled(engagement)) {
        const template = preferredTemplate("monthly_accounting");
        if (!template) {
          candidates.push({
            idempotency_key: `${engagement.id}:monthly_accounting:template`,
            engagement_id: engagement.id,
            organization_id: engagement.organization_id,
            entity_id: engagement.entity_id,
            client_name: clientName,
            service_package: engagement.service_package,
            service_key: "monthly_accounting",
            cadence: "MONTHLY",
            status: "TEMPLATE_MISSING",
            blockers: ["No active monthly accounting work-program template is available to this firm"],
            due_at: null,
          });
        } else {
          let cursor = monthStart(now);
          while (cursor <= horizonEnd) {
            const periodStart = monthStart(cursor);
            const periodEnd = monthEnd(cursor);
            if (periodEnd >= activeStart && (!activeEnd || periodStart <= activeEnd)) {
              const period = resolvePeriod(periods, engagement.entity_id, periodStart, periodEnd);
              let candidate = candidateBase({ engagement, template, period, startAt: periodStart, dueAt: periodEnd });
              candidate.client_name = clientName;
              candidate.service_package = engagement.service_package;
              if (!period) {
                candidate.status = "BLOCKED_PERIOD_CONFIGURATION";
                candidate.blockers = ["No financial period covers this accounting cycle for the bound legal entity"];
              }
              candidate = applyExisting(candidate, existingKeys);
              candidates.push(candidate);
            }
            cursor = addMonths(cursor, 1);
          }
        }
      }

      if (annualServiceEnabled(engagement)) {
        const template = preferredTemplate("year_end_close");
        if (!template) {
          candidates.push({
            idempotency_key: `${engagement.id}:year_end_close:template`,
            engagement_id: engagement.id,
            organization_id: engagement.organization_id,
            entity_id: engagement.entity_id,
            client_name: clientName,
            service_package: engagement.service_package,
            service_key: "year_end_close",
            cadence: "ANNUAL",
            status: "TEMPLATE_MISSING",
            blockers: ["No active year-end close work-program template is available to this firm"],
            due_at: null,
          });
        } else if (!engagement.year_end_date) {
          candidates.push({
            idempotency_key: `${engagement.id}:year_end_close:configuration`,
            engagement_id: engagement.id,
            organization_id: engagement.organization_id,
            entity_id: engagement.entity_id,
            client_name: clientName,
            service_package: engagement.service_package,
            service_key: "year_end_close",
            cadence: "ANNUAL",
            status: "BLOCKED_YEAR_END_CONFIGURATION",
            blockers: ["Year-end date is required before an annual close cycle can be planned"],
            due_at: null,
          });
        } else {
          for (const year of [now.getUTCFullYear(), now.getUTCFullYear() + 1]) {
            const yearEnd = parseYearEnd(engagement, year);
            if (!yearEnd || yearEnd < now || yearEnd > horizonEnd) continue;
            const periodStart = new Date(Date.UTC(yearEnd.getUTCFullYear() - 1, yearEnd.getUTCMonth(), yearEnd.getUTCDate() + 1));
            const period = resolvePeriod(periods, engagement.entity_id, periodStart, yearEnd);
            let candidate = candidateBase({ engagement, template, period, startAt: periodStart, dueAt: yearEnd });
            candidate.client_name = clientName;
            candidate.service_package = engagement.service_package;
            if (!period) {
              candidate.status = "BLOCKED_PERIOD_CONFIGURATION";
              candidate.blockers = ["No financial period covers the configured year end for the bound legal entity"];
            }
            candidate = applyExisting(candidate, existingKeys);
            candidates.push(candidate);
          }
        }
      }
    }

    const sortRank = {
      READY_TO_CREATE: 0,
      BLOCKED_ENTITY_CONFIGURATION: 1,
      BLOCKED_PERIOD_CONFIGURATION: 2,
      BLOCKED_YEAR_END_CONFIGURATION: 3,
      TEMPLATE_MISSING: 4,
      ALREADY_EXISTS: 5,
    };
    candidates.sort((a, b) => {
      const rank = (sortRank[a.status] ?? 99) - (sortRank[b.status] ?? 99);
      if (rank) return rank;
      return String(a.due_at || "9999").localeCompare(String(b.due_at || "9999"));
    });

    const summary = candidates.reduce((accumulator, candidate) => {
      const key = candidate.status.toLowerCase();
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, { total: candidates.length });

    return NextResponse.json({
      success: true,
      mode: "DRY_RUN",
      materialized: false,
      horizon: { days: horizonDays, start: isoDate(now), end: isoDate(horizonEnd) },
      summary,
      candidates,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error?.message || "Unable to plan recurring accounting cycles";
    console.error("FINANCE_RECURRING_PLAN_FAILED", error);
    return jsonError(message, /permission denied/i.test(message) ? 403 : 500);
  }
}

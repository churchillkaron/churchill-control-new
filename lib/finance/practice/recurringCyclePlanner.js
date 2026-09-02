import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const DEFAULT_HORIZON_DAYS = 90;
export const MAX_HORIZON_DAYS = 366;

const STAFF_CAPACITY_ROLES = new Set(["PREPARER", "REVIEWER", "PARTNER", "MANAGER", "ADMIN"]);

function clean(value) {
  return String(value ?? "").trim();
}

export function clampRecurringHorizonDays(value) {
  const number = Number(value || DEFAULT_HORIZON_DAYS);
  if (!Number.isFinite(number)) return DEFAULT_HORIZON_DAYS;
  return Math.max(1, Math.min(MAX_HORIZON_DAYS, Math.floor(number)));
}

function toDate(value) {
  const date = new Date(value);
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

function buildForecastDemand({ templateSteps, startAt, dueAt }) {
  const roleMinutes = {};
  let totalBudgetMinutes = 0;
  let staffBudgetMinutes = 0;
  let nonStaffBudgetMinutes = 0;

  const workItems = (templateSteps || []).map((step) => {
    const role = clean(step.required_role || "UNSPECIFIED").toUpperCase();
    const minutes = Math.max(0, Number(step.budget_minutes || 0));
    const anchor = step.due_anchor === "RUN_START" ? startAt : dueAt;
    const projectedDueAt = addDays(anchor, Number(step.relative_due_days || 0));
    roleMinutes[role] = (roleMinutes[role] || 0) + minutes;
    totalBudgetMinutes += minutes;
    if (STAFF_CAPACITY_ROLES.has(role)) staffBudgetMinutes += minutes;
    else nonStaffBudgetMinutes += minutes;
    return {
      step_key: step.step_key,
      sequence_no: step.sequence_no,
      required_role: role,
      budget_minutes: minutes,
      due_anchor: step.due_anchor,
      relative_due_days: Number(step.relative_due_days || 0),
      due_at: projectedDueAt.toISOString(),
      staff_capacity: STAFF_CAPACITY_ROLES.has(role),
    };
  });

  return {
    total_budget_minutes: totalBudgetMinutes,
    staff_budget_minutes: staffBudgetMinutes,
    non_staff_budget_minutes: nonStaffBudgetMinutes,
    role_minutes: roleMinutes,
    work_items: workItems,
  };
}

function candidateBase({ engagement, template, templateSteps, period, startAt, dueAt }) {
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
    period_start: period?.start_date || null,
    period_end: period?.end_date || null,
    run_key: key,
    start_at: startAt.toISOString(),
    due_at: dueAt.toISOString(),
    status: "READY_TO_CREATE",
    blockers: [],
    forecast: buildForecastDemand({ templateSteps, startAt, dueAt }),
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
  return existingKeys.has(candidate.idempotency_key)
    ? { ...candidate, status: "ALREADY_EXISTS" }
    : candidate;
}

export async function planRecurringAccountingCycles({ accountingFirmId, horizonDays = DEFAULT_HORIZON_DAYS, now = new Date() }) {
  const firmId = clean(accountingFirmId);
  if (!firmId) throw new Error("accountingFirmId is required for recurring accounting planning");

  const days = clampRecurringHorizonDays(horizonDays);
  const planningNow = toDate(now) || new Date();
  const horizonEnd = addDays(planningNow, days);

  const [engagementsResult, templatesResult, stepsResult, periodsResult, runsResult] = await Promise.all([
    supabaseAdmin
      .from("accounting_engagements")
      .select("id,accounting_firm_id,organization_id,entity_id,service_package,bookkeeping_enabled,vat_enabled,payroll_enabled,tax_enabled,reporting_enabled,audit_enabled,vat_frequency,payroll_frequency,year_end_date,start_date,end_date,status")
      .eq("accounting_firm_id", firmId)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("accounting_work_program_templates")
      .select("id,organization_id,template_key,name,service_key,cadence,version,is_system,status")
      .eq("status", "ACTIVE")
      .or(`organization_id.is.null,organization_id.eq.${firmId}`),
    supabaseAdmin
      .from("accounting_work_program_template_steps")
      .select("template_id,step_key,sequence_no,required_role,budget_minutes,due_anchor,relative_due_days,active")
      .eq("active", true)
      .order("sequence_no", { ascending: true }),
    supabaseAdmin
      .from("financial_periods")
      .select("id,organization_id,entity_id,period_name,start_date,end_date,status")
      .gte("end_date", isoDate(monthStart(planningNow)))
      .lte("start_date", isoDate(horizonEnd))
      .order("start_date", { ascending: true }),
    supabaseAdmin
      .from("accounting_engagement_runs")
      .select("id,engagement_id,template_id,run_key,due_at,status")
      .eq("accounting_firm_id", firmId)
      .gte("due_at", monthStart(planningNow).toISOString())
      .lte("due_at", addDays(horizonEnd, 62).toISOString()),
  ]);

  for (const result of [engagementsResult, templatesResult, stepsResult, periodsResult, runsResult]) {
    if (result.error) throw result.error;
  }

  const engagements = engagementsResult.data || [];
  const templates = templatesResult.data || [];
  const templateSteps = stepsResult.data || [];
  const periods = periodsResult.data || [];
  const existingRuns = runsResult.data || [];
  const organizationIds = [...new Set(engagements.map((row) => row.organization_id).filter(Boolean))];
  const { data: organizations, error: organizationsError } = organizationIds.length
    ? await supabaseAdmin.from("organizations").select("id,name").in("id", organizationIds)
    : { data: [], error: null };
  if (organizationsError) throw organizationsError;
  const names = new Map((organizations || []).map((row) => [row.id, row.name]));
  const stepsByTemplate = new Map();
  for (const step of templateSteps) {
    if (!stepsByTemplate.has(step.template_id)) stepsByTemplate.set(step.template_id, []);
    stepsByTemplate.get(step.template_id).push(step);
  }

  const preferredTemplate = (serviceKey) => {
    const firmTemplate = templates.find((row) => row.service_key === serviceKey && row.organization_id === firmId);
    return firmTemplate || templates.find((row) => row.service_key === serviceKey && !row.organization_id) || null;
  };

  const existingKeys = new Set(existingRuns.map((run) => `${run.engagement_id}:${run.template_id}:${run.run_key}`));
  const candidates = [];

  for (const engagement of engagements) {
    const clientName = names.get(engagement.organization_id) || "Client organization";
    const activeStart = toDate(engagement.start_date) || planningNow;
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
        const steps = stepsByTemplate.get(template.id) || [];
        let cursor = monthStart(planningNow);
        while (cursor <= horizonEnd) {
          const periodStart = monthStart(cursor);
          const periodEnd = monthEnd(cursor);
          if (periodEnd >= activeStart && (!activeEnd || periodStart <= activeEnd)) {
            const period = resolvePeriod(periods, engagement.entity_id, periodStart, periodEnd);
            let candidate = candidateBase({ engagement, template, templateSteps: steps, period, startAt: periodStart, dueAt: periodEnd });
            candidate.client_name = clientName;
            candidate.service_package = engagement.service_package;
            if (!period) {
              candidate.status = "BLOCKED_PERIOD_CONFIGURATION";
              candidate.blockers = ["No financial period covers this accounting cycle for the bound legal entity"];
            }
            candidates.push(applyExisting(candidate, existingKeys));
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
        const steps = stepsByTemplate.get(template.id) || [];
        for (const year of [planningNow.getUTCFullYear(), planningNow.getUTCFullYear() + 1]) {
          const yearEnd = parseYearEnd(engagement, year);
          if (!yearEnd || yearEnd < planningNow || yearEnd > horizonEnd) continue;
          const period = resolvePeriod(periods, engagement.entity_id, yearEnd, yearEnd);
          const periodStart = period ? toDate(period.start_date) : monthStart(yearEnd);
          let candidate = candidateBase({ engagement, template, templateSteps: steps, period, startAt: periodStart, dueAt: yearEnd });
          candidate.client_name = clientName;
          candidate.service_package = engagement.service_package;
          if (!period) {
            candidate.status = "BLOCKED_PERIOD_CONFIGURATION";
            candidate.blockers = ["No financial period contains the configured year end for the bound legal entity"];
          }
          candidates.push(applyExisting(candidate, existingKeys));
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

  return {
    horizon: { days, start: isoDate(planningNow), end: isoDate(horizonEnd) },
    summary,
    candidates,
  };
}

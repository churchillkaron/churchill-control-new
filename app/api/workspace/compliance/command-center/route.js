export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return clean(value).toUpperCase().replace(/[\s-]+/g, "_");
}

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : null;
}

function isPast(value, today) {
  const date = dateOnly(value);
  return Boolean(date && date < today);
}

function daysUntil(value, today) {
  const date = dateOnly(value);
  if (!date) return null;
  const start = Date.parse(`${today}T00:00:00.000Z`);
  const target = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(target)) return null;
  return Math.round((target - start) / 86400000);
}

function scoped(query, entityId) {
  if (!entityId) return query;
  return query.or(`entity_id.eq.${entityId},entity_id.is.null`);
}

async function source(name, task, fallback = []) {
  try {
    return { name, status: "connected", data: await task(), error: null };
  } catch (error) {
    console.error("COMPLIANCE_COMMAND_CENTER_SOURCE_FAILED", { source: name, error });
    return {
      name,
      status: "error",
      data: fallback,
      error: error?.message || "Source unavailable",
    };
  }
}

function complianceHref(path) {
  return `/compliance/${clean(path).replace(/^\/+/, "")}`;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const entityId = clean(url.searchParams.get("entityId") || url.searchParams.get("entity_id"));
    const periodId = clean(url.searchParams.get("periodId") || url.searchParams.get("period_id"));

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 });
    }

    const context = await resolveBusinessContext({
      organizationId: access.organizationId,
      entityId: entityId || null,
      periodId: periodId || null,
      request,
      access,
    });
    if (!context.success) {
      return NextResponse.json({ success: false, error: context.error }, { status: context.status || 400 });
    }

    const resolvedEntityId = context.entityId || null;
    const today = new Date().toISOString().slice(0, 10);

    const [
      frameworksSource,
      requirementsSource,
      controlsSource,
      evidenceSource,
      testsSource,
      obligationsSource,
      risksSource,
      issuesSource,
      remediationSource,
      auditSource,
    ] = await Promise.all([
      source("compliance_frameworks", async () => {
        let query = supabaseAdmin.from("compliance_frameworks").select("id,entity_id,framework_code,framework_name,framework_type,issuing_authority,jurisdiction_code,version,effective_from,effective_to,status,updated_at").eq("organization_id", context.organizationId);
        query = scoped(query, resolvedEntityId);
        const { data, error } = await query.order("updated_at", { ascending: false }).limit(1000);
        if (error) throw error;
        return data || [];
      }),
      source("compliance_requirements", async () => {
        let query = supabaseAdmin.from("compliance_requirements").select("id,entity_id,framework_id,requirement_code,title,mandatory,effective_from,effective_to,status,updated_at").eq("organization_id", context.organizationId);
        query = scoped(query, resolvedEntityId);
        const { data, error } = await query.limit(5000);
        if (error) throw error;
        return data || [];
      }),
      source("compliance_controls", async () => {
        let query = supabaseAdmin.from("compliance_controls").select("id,entity_id,control_code,control_name,control_type,frequency,owner_staff_id,status,automation_level,source_domain,source_type,source_id,updated_at").eq("organization_id", context.organizationId);
        query = scoped(query, resolvedEntityId);
        const { data, error } = await query.order("updated_at", { ascending: false }).limit(5000);
        if (error) throw error;
        return data || [];
      }),
      source("compliance_evidence", async () => {
        let query = supabaseAdmin.from("compliance_evidence").select("id,entity_id,control_id,requirement_id,enterprise_document_id,evidence_type,title,evidence_date,valid_from,valid_until,verification_status,verified_at,created_at,updated_at").eq("organization_id", context.organizationId);
        query = scoped(query, resolvedEntityId);
        const { data, error } = await query.order("evidence_date", { ascending: false }).limit(5000);
        if (error) throw error;
        return data || [];
      }),
      source("compliance_control_tests", async () => {
        let query = supabaseAdmin.from("compliance_control_tests").select("id,entity_id,control_id,test_type,period_start,period_end,due_date,performed_at,result,sample_size,exceptions_found,updated_at").eq("organization_id", context.organizationId);
        query = scoped(query, resolvedEntityId);
        const { data, error } = await query.order("due_date", { ascending: true }).limit(5000);
        if (error) throw error;
        return data || [];
      }),
      source("compliance_obligations", async () => {
        let query = supabaseAdmin.from("compliance_obligations").select("id,entity_id,obligation_type,obligation_code,title,authority_name,jurisdiction_code,reference_number,owner_staff_id,effective_from,due_date,expiry_date,renewal_lead_days,status,criticality,enterprise_document_id,updated_at").eq("organization_id", context.organizationId);
        query = scoped(query, resolvedEntityId);
        const { data, error } = await query.order("due_date", { ascending: true, nullsFirst: false }).limit(5000);
        if (error) throw error;
        return data || [];
      }),
      source("compliance_risks", async () => {
        let query = supabaseAdmin.from("compliance_risks").select("id,entity_id,risk_code,title,category,owner_staff_id,inherent_likelihood,inherent_impact,residual_likelihood,residual_impact,appetite_level,treatment_strategy,status,next_review_date,updated_at").eq("organization_id", context.organizationId);
        query = scoped(query, resolvedEntityId);
        const { data, error } = await query.order("updated_at", { ascending: false }).limit(5000);
        if (error) throw error;
        return data || [];
      }),
      source("compliance_issues", async () => {
        let query = supabaseAdmin.from("compliance_issues").select("id,entity_id,issue_code,title,issue_type,severity,status,owner_staff_id,control_id,requirement_id,risk_id,obligation_id,identified_at,due_date,resolved_at,updated_at").eq("organization_id", context.organizationId);
        query = scoped(query, resolvedEntityId);
        const { data, error } = await query.order("identified_at", { ascending: false }).limit(5000);
        if (error) throw error;
        return data || [];
      }),
      source("compliance_remediation_actions", async () => {
        let query = supabaseAdmin.from("compliance_remediation_actions").select("id,entity_id,issue_id,action_number,title,owner_staff_id,due_date,status,completed_at,verified_at,updated_at").eq("organization_id", context.organizationId);
        query = scoped(query, resolvedEntityId);
        const { data, error } = await query.order("due_date", { ascending: true, nullsFirst: false }).limit(5000);
        if (error) throw error;
        return data || [];
      }),
      source("organization_audit_logs", async () => {
        const { data, error } = await supabaseAdmin.from("organization_audit_logs").select("id,entity_type,entity_id,action,actor_email,created_at").eq("organization_id", context.organizationId).order("created_at", { ascending: false }).limit(100);
        if (error) throw error;
        return data || [];
      }),
    ]);

    const frameworks = frameworksSource.data || [];
    const requirements = requirementsSource.data || [];
    const controls = controlsSource.data || [];
    const evidence = evidenceSource.data || [];
    const tests = testsSource.data || [];
    const obligations = obligationsSource.data || [];
    const risks = risksSource.data || [];
    const issues = issuesSource.data || [];
    const remediation = remediationSource.data || [];

    const activeFrameworks = frameworks.filter((row) => normalized(row.status) === "ACTIVE");
    const activeRequirements = requirements.filter((row) => normalized(row.status) === "ACTIVE");
    const activeControls = controls.filter((row) => normalized(row.status) === "ACTIVE");
    const ineffectiveControls = controls.filter((row) => normalized(row.status) === "INEFFECTIVE");
    const unownedControls = activeControls.filter((row) => !row.owner_staff_id);

    const unverifiedEvidence = evidence.filter((row) => normalized(row.verification_status) === "UNVERIFIED");
    const expiredEvidence = evidence.filter((row) => normalized(row.verification_status) === "EXPIRED" || isPast(row.valid_until, today));

    const openTests = tests.filter((row) => normalized(row.result) === "NOT_TESTED");
    const failedTests = tests.filter((row) => ["FAIL", "PASS_WITH_EXCEPTIONS"].includes(normalized(row.result)));
    const overdueTests = openTests.filter((row) => isPast(row.due_date, today));

    const openObligations = obligations.filter((row) => !["COMPLETED", "CANCELLED", "NOT_APPLICABLE"].includes(normalized(row.status)));
    const overdueObligations = openObligations.filter((row) => isPast(row.due_date, today));
    const expiredObligations = openObligations.filter((row) => normalized(row.status) === "EXPIRED" || isPast(row.expiry_date, today));
    const renewalDue = openObligations.filter((row) => {
      const days = daysUntil(row.expiry_date, today);
      return days !== null && days >= 0 && days <= numeric(row.renewal_lead_days || 30);
    });
    const unownedObligations = openObligations.filter((row) => !row.owner_staff_id);

    const openRisks = risks.filter((row) => !["MITIGATED", "ACCEPTED", "CLOSED"].includes(normalized(row.status)));
    const highRisks = openRisks.filter((row) => {
      const likelihood = numeric(row.residual_likelihood || row.inherent_likelihood);
      const impact = numeric(row.residual_impact || row.inherent_impact);
      return likelihood * impact >= 12;
    });
    const riskReviewsDue = openRisks.filter((row) => row.next_review_date && (isPast(row.next_review_date, today) || daysUntil(row.next_review_date, today) <= 14));

    const openIssues = issues.filter((row) => !["RESOLVED", "ACCEPTED", "CLOSED"].includes(normalized(row.status)));
    const criticalIssues = openIssues.filter((row) => ["HIGH", "CRITICAL"].includes(normalized(row.severity)));
    const overdueIssues = openIssues.filter((row) => isPast(row.due_date, today));

    const openRemediation = remediation.filter((row) => !["COMPLETED", "VERIFIED", "CANCELLED"].includes(normalized(row.status)));
    const overdueRemediation = openRemediation.filter((row) => isPast(row.due_date, today));

    const queue = [];

    [...overdueObligations, ...expiredObligations].slice(0, 8).forEach((row) => queue.push({
      id: `obligation:${row.id}`,
      kind: "obligation",
      priority: "critical",
      title: row.title,
      detail: [row.obligation_type, row.authority_name, row.due_date ? `Due ${row.due_date}` : null, row.expiry_date ? `Expires ${row.expiry_date}` : null].filter(Boolean).join(" · "),
      status: normalized(row.status) === "EXPIRED" ? "Expired" : "Overdue",
      href: complianceHref("obligations"),
    }));

    renewalDue.slice(0, 6).forEach((row) => queue.push({
      id: `renewal:${row.id}`,
      kind: "renewal",
      priority: normalized(row.criticality) === "CRITICAL" ? "critical" : "review",
      title: row.title,
      detail: `Renewal window · expires ${row.expiry_date}`,
      status: "Renewal due",
      href: complianceHref("obligations"),
    }));

    criticalIssues.slice(0, 8).forEach((row) => queue.push({
      id: `issue:${row.id}`,
      kind: "issue",
      priority: normalized(row.severity) === "CRITICAL" ? "critical" : "attention",
      title: row.title,
      detail: `${row.issue_type} · ${row.severity}${row.due_date ? ` · Due ${row.due_date}` : ""}`,
      status: row.status,
      href: complianceHref("issues"),
    }));

    overdueRemediation.slice(0, 6).forEach((row) => queue.push({
      id: `remediation:${row.id}`,
      kind: "remediation",
      priority: "attention",
      title: row.title,
      detail: `Remediation overdue${row.due_date ? ` · ${row.due_date}` : ""}`,
      status: row.status,
      href: complianceHref("remediation"),
    }));

    failedTests.slice(0, 6).forEach((row) => queue.push({
      id: `test:${row.id}`,
      kind: "control_test",
      priority: normalized(row.result) === "FAIL" ? "critical" : "attention",
      title: `Control test ${row.result}`,
      detail: `${row.test_type} · ${numeric(row.exceptions_found)} exception${numeric(row.exceptions_found) === 1 ? "" : "s"}`,
      status: row.result,
      href: complianceHref("controls"),
    }));

    overdueTests.slice(0, 5).forEach((row) => queue.push({
      id: `test-overdue:${row.id}`,
      kind: "control_test",
      priority: "attention",
      title: "Control test overdue",
      detail: row.due_date ? `Due ${row.due_date}` : "Testing required",
      status: "Not tested",
      href: complianceHref("controls"),
    }));

    highRisks.slice(0, 6).forEach((row) => queue.push({
      id: `risk:${row.id}`,
      kind: "risk",
      priority: "attention",
      title: row.title,
      detail: `Residual score ${numeric(row.residual_likelihood || row.inherent_likelihood) * numeric(row.residual_impact || row.inherent_impact)} · ${row.treatment_strategy}`,
      status: row.status,
      href: complianceHref("risks"),
    }));

    unverifiedEvidence.slice(0, 5).forEach((row) => queue.push({
      id: `evidence:${row.id}`,
      kind: "evidence",
      priority: "review",
      title: row.title,
      detail: `${row.evidence_type} · Evidence needs verification`,
      status: row.verification_status,
      href: complianceHref("evidence"),
    }));

    const sources = [
      frameworksSource, requirementsSource, controlsSource, evidenceSource, testsSource,
      obligationsSource, risksSource, issuesSource, remediationSource, auditSource,
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
        entity_id: resolvedEntityId,
        period_id: context.periodId || null,
        business_date: today,
        timezone: context.timezone || null,
      },
      metrics: {
        frameworks: { active: activeFrameworks.length, requirements: activeRequirements.length },
        controls: {
          active: activeControls.length,
          ineffective: ineffectiveControls.length,
          unowned: unownedControls.length,
          tests_open: openTests.length,
          tests_failed: failedTests.length,
          tests_overdue: overdueTests.length,
        },
        evidence: {
          total: evidence.length,
          unverified: unverifiedEvidence.length,
          expired: expiredEvidence.length,
        },
        obligations: {
          open: openObligations.length,
          overdue: overdueObligations.length,
          expired: expiredObligations.length,
          renewal_due: renewalDue.length,
          unowned: unownedObligations.length,
        },
        risks: {
          open: openRisks.length,
          high: highRisks.length,
          reviews_due: riskReviewsDue.length,
        },
        issues: {
          open: openIssues.length,
          critical: criticalIssues.length,
          overdue: overdueIssues.length,
          remediation_open: openRemediation.length,
          remediation_overdue: overdueRemediation.length,
        },
      },
      flow: [
        { id: "requirements", label: "Know obligations", count: activeRequirements.length + openObligations.length, detail: `${activeFrameworks.length} frameworks · ${openObligations.length} active obligations`, href: complianceHref("obligations") },
        { id: "controls", label: "Operate controls", count: activeControls.length, detail: `${ineffectiveControls.length} ineffective · ${unownedControls.length} unowned`, href: complianceHref("controls") },
        { id: "evidence", label: "Collect evidence", count: unverifiedEvidence.length + expiredEvidence.length, detail: `${unverifiedEvidence.length} unverified · ${expiredEvidence.length} expired`, href: complianceHref("evidence") },
        { id: "test", label: "Test effectiveness", count: openTests.length + failedTests.length, detail: `${failedTests.length} exception/fail · ${overdueTests.length} overdue`, href: complianceHref("controls") },
        { id: "risk", label: "Manage risk", count: highRisks.length + riskReviewsDue.length, detail: `${highRisks.length} high risk · ${riskReviewsDue.length} reviews due`, href: complianceHref("risks") },
        { id: "remediate", label: "Resolve issues", count: openIssues.length + openRemediation.length, detail: `${criticalIssues.length} high/critical issues · ${overdueRemediation.length} overdue actions`, href: complianceHref("issues") },
      ],
      queue: queue.slice(0, 24),
      recentAudit: auditSource.data || [],
      sources,
    });
  } catch (error) {
    console.error("COMPLIANCE_COMMAND_CENTER_FAILED", error);
    return NextResponse.json({ success: false, error: error?.message || "Compliance workspace failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import { ERP_REGISTRY } from "@/lib/platform/registry/erpRegistry.base";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function enabledStatus(value) {
  return ["active", "enabled", "installed", "ready"].includes(normalized(value));
}

function parseModuleEntitlements(value) {
  if (!value) return [];
  const rows = Array.isArray(value) ? value : Array.isArray(value?.modules) ? value.modules : [];
  return rows
    .map((item) => {
      if (typeof item === "string") return clean(item);
      return clean(item?.module_id || item?.id || item?.key || item?.module);
    })
    .filter(Boolean);
}

function solutionRoute(industry, configuredRoute) {
  if (configuredRoute) return configuredRoute;
  const candidate = (ERP_REGISTRY.solutions || []).find(
    (solution) => normalized(solution.id) === normalized(industry),
  );
  return candidate?.route || null;
}

async function loadState({ organizationId, entityId = null }) {
  const [templatesResult, modulesResult, orgModulesResult, installationsResult, subscriptionResult] = await Promise.all([
    supabaseAdmin
      .from("workspace_templates")
      .select("id,name,industry,description,solution_version,status,route,metadata,workspace_template_modules(module_id,required,sort_order)")
      .in("status", ["ACTIVE", "DRAFT"])
      .order("name", { ascending: true }),
    supabaseAdmin
      .from("platform_modules")
      .select("id,name,description,status,is_core,route,capability")
      .order("name", { ascending: true }),
    supabaseAdmin
      .from("organization_modules")
      .select("id,module_id,status,created_at")
      .eq("organization_id", organizationId),
    supabaseAdmin
      .from("organization_solutions")
      .select("*")
      .eq("organization_id", organizationId)
      .neq("status", "REMOVED")
      .order("updated_at", { ascending: false }),
    supabaseAdmin
      .from("subscriptions")
      .select("id,status,selected_modules,currency,billing_cycle,created_at,updated_at")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  for (const result of [templatesResult, modulesResult, orgModulesResult, installationsResult, subscriptionResult]) {
    if (result.error) throw result.error;
  }

  const templates = templatesResult.data || [];
  const platformModules = modulesResult.data || [];
  const organizationModules = orgModulesResult.data || [];
  const installations = installationsResult.data || [];
  const subscription = subscriptionResult.data || null;
  const entitlementModules = new Set(parseModuleEntitlements(subscription?.selected_modules));
  const entitlementKnown = Boolean(subscription);
  const platformById = new Map(platformModules.map((row) => [row.id, row]));
  const enabledModules = new Set(
    organizationModules.filter((row) => enabledStatus(row.status)).map((row) => row.module_id),
  );

  const installationsByTemplate = new Map();
  for (const row of installations) {
    if (entityId && row.entity_id === entityId) {
      installationsByTemplate.set(row.template_id, row);
      continue;
    }
    if (!installationsByTemplate.has(row.template_id) && !row.entity_id) {
      installationsByTemplate.set(row.template_id, row);
    }
  }

  const solutions = templates.map((template) => {
    const declared = Array.isArray(template.workspace_template_modules)
      ? template.workspace_template_modules.slice().sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
      : [];
    const required = declared.filter((row) => row.required).map((row) => row.module_id);
    const optional = declared.filter((row) => !row.required).map((row) => row.module_id);
    const unknownModules = declared.map((row) => row.module_id).filter((moduleId) => !platformById.has(moduleId));
    const missingEnabled = required.filter((moduleId) => !enabledModules.has(moduleId));
    const missingEntitlement = entitlementKnown
      ? required.filter((moduleId) => !entitlementModules.has(moduleId))
      : [];
    const installation = installationsByTemplate.get(template.id) || null;
    const readinessStatus = unknownModules.length
      ? "BLOCKED"
      : missingEnabled.length
        ? "NEEDS_ATTENTION"
        : "READY";

    return {
      id: template.id,
      name: template.name,
      industry: template.industry,
      description: template.description,
      version: template.solution_version || "1.0",
      catalog_status: template.status,
      route: solutionRoute(template.industry, template.route),
      required_modules: required,
      optional_modules: optional,
      module_details: declared.map((row) => ({
        ...row,
        ...(platformById.get(row.module_id) || {}),
        enabled: enabledModules.has(row.module_id),
        entitled: entitlementKnown ? entitlementModules.has(row.module_id) : null,
      })),
      missing_enabled: missingEnabled,
      missing_entitlement: missingEntitlement,
      unknown_modules: unknownModules,
      readiness_status: readinessStatus,
      installation,
      installed: Boolean(installation),
    };
  });

  return {
    solutions,
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          currency: subscription.currency,
          billing_cycle: subscription.billing_cycle,
          entitled_modules: [...entitlementModules],
        }
      : null,
    entitlementKnown,
    enabledModules: [...enabledModules],
    organizationModules,
  };
}

async function writeAudit({ organizationId, actorEmail, action, entityId, beforeData = null, afterData = null }) {
  await supabaseAdmin.from("organization_audit_logs").insert({
    organization_id: organizationId,
    entity_type: "organization_solution",
    entity_id: entityId || null,
    action,
    before_data: beforeData,
    after_data: afterData,
    actor_email: actorEmail || null,
    metadata: { source: "solutions-command-center" },
  }).then(({ error }) => {
    if (error) console.error("SOLUTION_AUDIT_WRITE_FAILED", error);
  });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const entityId = clean(url.searchParams.get("entityId") || url.searchParams.get("entity_id"));

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 });
    }

    const context = await resolveBusinessContext({
      organizationId: access.organizationId,
      entityId: entityId || null,
      request,
      access,
    });
    if (!context.success) {
      return NextResponse.json({ success: false, error: context.error }, { status: context.status || 400 });
    }

    const state = await loadState({
      organizationId: context.organizationId,
      entityId: context.entityId || null,
    });

    const installed = state.solutions.filter((row) => row.installed);
    return NextResponse.json({
      success: true,
      context: {
        organization_id: context.organizationId,
        entity_id: context.entityId || null,
      },
      metrics: {
        catalog: state.solutions.length,
        installed: installed.length,
        ready: installed.filter((row) => row.readiness_status === "READY").length,
        needs_attention: installed.filter((row) => row.readiness_status !== "READY").length,
      },
      entitlement: {
        known: state.entitlementKnown,
        subscription: state.subscription,
      },
      solutions: state.solutions,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("SOLUTIONS_COMMAND_CENTER_GET_FAILED", error);
    return NextResponse.json({ success: false, error: error?.message || "Unable to load Solutions" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = clean(body?.organizationId || body?.organization_id);
    const entityId = clean(body?.entityId || body?.entity_id) || null;
    const templateId = clean(body?.templateId || body?.template_id);
    const action = clean(body?.action || "INSTALL").toUpperCase();

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 });
    }
    if (!templateId) {
      return NextResponse.json({ success: false, error: "templateId is required" }, { status: 400 });
    }

    const context = await resolveBusinessContext({
      organizationId: access.organizationId,
      entityId,
      request,
      access,
    });
    if (!context.success) {
      return NextResponse.json({ success: false, error: context.error }, { status: context.status || 400 });
    }

    const state = await loadState({ organizationId: context.organizationId, entityId: context.entityId || null });
    const solution = state.solutions.find((row) => row.id === templateId);
    if (!solution) {
      return NextResponse.json({ success: false, error: "Solution template not found" }, { status: 404 });
    }

    let existing = solution.installation || null;
    if (action === "INSTALL" || action === "ACTIVATE") {
      if (state.entitlementKnown) {
        for (const moduleId of solution.required_modules) {
          const entitled = !solution.missing_entitlement.includes(moduleId);
          if (!entitled) continue;
          const current = state.organizationModules.find((row) => row.module_id === moduleId);
          if (current) {
            if (!enabledStatus(current.status)) {
              const { error } = await supabaseAdmin
                .from("organization_modules")
                .update({ status: "ACTIVE" })
                .eq("id", current.id)
                .eq("organization_id", context.organizationId);
              if (error) throw error;
            }
          } else {
            const { error } = await supabaseAdmin.from("organization_modules").insert({
              organization_id: context.organizationId,
              module_id: moduleId,
              status: "ACTIVE",
            });
            if (error) throw error;
          }
        }
      }

      const refreshed = await loadState({ organizationId: context.organizationId, entityId: context.entityId || null });
      const refreshedSolution = refreshed.solutions.find((row) => row.id === templateId);
      const readiness = refreshedSolution?.readiness_status || "UNKNOWN";
      const desiredStatus = action === "ACTIVATE" && readiness === "READY" ? "ACTIVE" : "INSTALLED";
      const payload = {
        organization_id: context.organizationId,
        entity_id: context.entityId || null,
        template_id: templateId,
        status: desiredStatus,
        installed_version: solution.version,
        readiness_status: readiness,
        readiness_evidence: {
          required_modules: refreshedSolution?.required_modules || [],
          missing_enabled: refreshedSolution?.missing_enabled || [],
          missing_entitlement: refreshedSolution?.missing_entitlement || [],
          entitlement_known: refreshed.entitlementKnown,
        },
        last_readiness_check_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(desiredStatus === "ACTIVE" ? { activated_at: new Date().toISOString(), disabled_at: null } : {}),
        ...(!existing ? { installed_by: access.access?.staffAccountId || null, installed_at: new Date().toISOString() } : {}),
      };

      if (existing) {
        const { data, error } = await supabaseAdmin
          .from("organization_solutions")
          .update(payload)
          .eq("id", existing.id)
          .eq("organization_id", context.organizationId)
          .select("*")
          .single();
        if (error) throw error;
        await writeAudit({ organizationId: context.organizationId, actorEmail: access.userEmail, action, entityId: data.id, beforeData: existing, afterData: data });
      } else {
        const { data, error } = await supabaseAdmin
          .from("organization_solutions")
          .insert({ ...payload, created_at: new Date().toISOString() })
          .select("*")
          .single();
        if (error) throw error;
        await writeAudit({ organizationId: context.organizationId, actorEmail: access.userEmail, action, entityId: data.id, afterData: data });
      }
    } else if (action === "DISABLE") {
      if (!existing) return NextResponse.json({ success: false, error: "Solution is not installed" }, { status: 400 });
      const { data, error } = await supabaseAdmin
        .from("organization_solutions")
        .update({ status: "DISABLED", disabled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .eq("organization_id", context.organizationId)
        .select("*")
        .single();
      if (error) throw error;
      await writeAudit({ organizationId: context.organizationId, actorEmail: access.userEmail, action, entityId: data.id, beforeData: existing, afterData: data });
    } else if (action === "RECHECK") {
      if (!existing) return NextResponse.json({ success: false, error: "Solution is not installed" }, { status: 400 });
      const refreshed = await loadState({ organizationId: context.organizationId, entityId: context.entityId || null });
      const refreshedSolution = refreshed.solutions.find((row) => row.id === templateId);
      const { data, error } = await supabaseAdmin
        .from("organization_solutions")
        .update({
          readiness_status: refreshedSolution?.readiness_status || "UNKNOWN",
          readiness_evidence: {
            required_modules: refreshedSolution?.required_modules || [],
            missing_enabled: refreshedSolution?.missing_enabled || [],
            missing_entitlement: refreshedSolution?.missing_entitlement || [],
            entitlement_known: refreshed.entitlementKnown,
          },
          last_readiness_check_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .eq("organization_id", context.organizationId)
        .select("*")
        .single();
      if (error) throw error;
      await writeAudit({ organizationId: context.organizationId, actorEmail: access.userEmail, action, entityId: data.id, beforeData: existing, afterData: data });
    } else {
      return NextResponse.json({ success: false, error: "Unsupported solution action" }, { status: 400 });
    }

    const finalState = await loadState({ organizationId: context.organizationId, entityId: context.entityId || null });
    return NextResponse.json({
      success: true,
      solution: finalState.solutions.find((row) => row.id === templateId) || null,
      entitlement: { known: finalState.entitlementKnown, subscription: finalState.subscription },
    });
  } catch (error) {
    console.error("SOLUTIONS_COMMAND_CENTER_POST_FAILED", error);
    return NextResponse.json({ success: false, error: error?.message || "Unable to update solution" }, { status: 500 });
  }
}

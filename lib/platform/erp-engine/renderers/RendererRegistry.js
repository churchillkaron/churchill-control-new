"use client";

import { createElement } from "react";
import CreativeWorkspaceRenderer from "@/components/creative/runtime/CreativeWorkspaceRenderer";
import MasterDataRuntimeWorkCenter from "@/components/workspace/master-data/MasterDataRuntimeWorkCenter";
import OrganizationFallbackMasterDataRuntimeWorkCenter from "@/components/workspace/master-data/OrganizationFallbackMasterDataRuntimeWorkCenter";
import ServiceRuntimeWorkCenter from "@/components/workspace/services/ServiceRuntimeWorkCenter";
import ReportWorkCenter from "@/components/workspace/reports/ReportWorkCenter";
import ChannelConnectionWorkCenter from "@/components/workspace/channels/ChannelConnectionWorkCenter";
import FinanceUnavailableWorkCenter from "@/components/workspace/finance/FinanceUnavailableWorkCenter";
import FinanceAccountantReportWorkCenter from "@/components/workspace/finance/FinanceAccountantReportWorkCenter";
import FinanceAccountantProcessWorkCenter from "@/components/workspace/finance/FinanceAccountantProcessWorkCenter";
import FinanceAccountantRecordsWorkCenter from "@/components/workspace/finance/FinanceAccountantRecordsWorkCenter";
import FinanceBankReconciliationWorkCenter from "@/components/workspace/finance/FinanceBankReconciliationWorkCenter";
import FinanceBankStatementsWorkCenter from "@/components/workspace/finance/FinanceBankStatementsWorkCenter";
import FinancePaymentsWorkCenter from "@/components/workspace/finance/FinancePaymentsWorkCenter";
import CommercialSalesRuntimeWorkCenter from "@/components/workspace/commercial/CommercialSalesRuntimeWorkCenter";
import CustomerRuntimeWorkCenter from "@/components/workspace/commercial/CustomerRuntimeWorkCenter";

import { getWorkspaceItemByRoute } from "@/lib/platform/registry/erpRegistry";
import { hasUsableCreateAction, sanitizeActionList } from "@/lib/platform/actions/ActionContract";

const RENDERERS = new Map();
const UNAVAILABLE_STATUSES = new Set([
  "planned", "blocked", "partial", "unproven", "disabled", "unavailable", "coming-soon", "coming_soon",
]);

function actionList(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    return Object.entries(value).map(([id, action]) => ({ id, ...(action || {}) }));
  }
  return [];
}

function sanitizeCapability(capability) {
  if (!capability || typeof capability !== "object") return capability;
  const createAction = capability?.create || null;
  const canCreate = hasUsableCreateAction(createAction);
  const rowMenu = sanitizeActionList(capability?.rowMenu || capability?.ui?.rowMenu, {
    capability, createAction, allowCreate: canCreate, allowSelect: true,
  });
  const topMenu = sanitizeActionList(capability?.topMenu || capability?.ui?.topMenu, {
    capability, createAction, allowCreate: canCreate,
  });
  const actions = sanitizeActionList(capability?.actions, {
    capability, createAction, allowCreate: canCreate, allowSelect: true,
  });
  return {
    ...capability,
    actions,
    rowMenu,
    topMenu,
    ui: { ...(capability.ui || {}), actions, rowMenu, topMenu },
  };
}

function isFinanceCapability(capability) {
  return String(capability?.route || "").startsWith("/finance/");
}

function isUnavailableFinanceCapability(capability, workspaceId) {
  const workspace = String(workspaceId || "").trim().toLowerCase();
  const status = String(capability?.status || "").trim().toLowerCase();
  return (workspace === "finance" || isFinanceCapability(capability)) && UNAVAILABLE_STATUSES.has(status);
}

export function registerRenderer(id, component) {
  if (!id || !component) return;
  RENDERERS.set(id, component);
}

export function resolveRenderer(id) {
  return RENDERERS.get(id) || null;
}

export function getRegisteredRenderers() {
  return [...RENDERERS.keys()];
}

function RegisteredCreativeWorkspaceRenderer(props) {
  return createElement(CreativeWorkspaceRenderer, {
    runtime: props.runtime || props.workspace?.runtime || props.context?.runtime || {},
  });
}

function topMenuOrFallback(capability, explicitActions, workspaceActions) {
  const capabilityActions = actionList(capability?.topMenu || capability?.ui?.topMenu);
  if (capabilityActions.length) return capabilityActions;
  return sanitizeActionList(explicitActions || workspaceActions, {
    capability,
    createAction: capability?.create,
    allowCreate: hasUsableCreateAction(capability?.create),
  });
}

function baseFinanceProps(props, capability) {
  const route = props.context?.route || {};
  return {
    capability,
    organizationId: props.organizationId || props.context?.organization_id || null,
    entityId: props.entityId || props.context?.entity_id || null,
    periodId: props.periodId || props.context?.period_id || null,
    workspaceId: props.workspaceId || props.workspace?.id || route.workspaceId || "finance",
  };
}

function RegisteredMasterDataRuntimeWorkCenter(props) {
  const route = props.context?.route || {};
  const capability = sanitizeCapability(props.capability);
  const base = baseFinanceProps(props, capability);
  const workspaceId = base.workspaceId;

  if (isUnavailableFinanceCapability(capability, workspaceId)) {
    return createElement(FinanceUnavailableWorkCenter, { capability });
  }

  if (String(capability?.id || "").toLowerCase() === "trial_balance") {
    return createElement(FinanceAccountantReportWorkCenter, {
      ...base,
      capability: {
        ...capability,
        create: { enabled: false },
        actions: [],
        rowMenu: [],
        topMenu: [],
        ui: {
          ...(capability?.ui || {}),
          actions: [],
          rowMenu: [],
          topMenu: [],
        },
      },
    });
  }

  if (isFinanceCapability(capability)) {
    return createElement(FinanceAccountantRecordsWorkCenter, {
      ...base,
      capability,
    });
  }

  const Renderer = base.entityId || capability?.contextScope === "entity"
    ? MasterDataRuntimeWorkCenter
    : OrganizationFallbackMasterDataRuntimeWorkCenter;

  return createElement(Renderer, {
    ...base,
    workspaceId,
    moduleKey: props.moduleKey || capability?.id || route.itemId || route.capabilityId,
    eyebrow: props.eyebrow,
    workspaceActions: capability?.actions || [],
    topMenuActions: topMenuOrFallback(capability, props.topMenuActions, props.workspace?.topMenu),
    workspaceUi: capability?.ui || props.workspaceUi || props.workspace?.ui || null,
  });
}

function RegisteredFinanceReportRuntimeWorkCenter(props) {
  const capability = sanitizeCapability(props.capability);
  if (isUnavailableFinanceCapability(capability, "finance")) {
    return createElement(FinanceUnavailableWorkCenter, { capability });
  }
  return createElement(FinanceAccountantReportWorkCenter, baseFinanceProps(props, capability));
}

function RegisteredFinanceOperationalWorkCenter(props) {
  const capability = sanitizeCapability(props.capability);
  if (isUnavailableFinanceCapability(capability, "finance")) {
    return createElement(FinanceUnavailableWorkCenter, { capability });
  }
  return createElement(FinanceAccountantProcessWorkCenter, baseFinanceProps(props, capability));
}

function RegisteredFinanceBankReconciliationWorkCenter(props) {
  const capability = sanitizeCapability(props.capability);
  if (isUnavailableFinanceCapability(capability, "finance")) {
    return createElement(FinanceUnavailableWorkCenter, { capability });
  }
  return createElement(FinanceBankReconciliationWorkCenter, baseFinanceProps(props, capability));
}

function RegisteredFinanceBankStatementsWorkCenter(props) {
  const capability = sanitizeCapability(props.capability);
  if (isUnavailableFinanceCapability(capability, "finance")) {
    return createElement(FinanceUnavailableWorkCenter, { capability });
  }
  return createElement(FinanceBankStatementsWorkCenter, baseFinanceProps(props, capability));
}

function RegisteredFinancePaymentsWorkCenter(props) {
  const capability = sanitizeCapability(props.capability);
  if (isUnavailableFinanceCapability(capability, "finance")) {
    return createElement(FinanceUnavailableWorkCenter, { capability });
  }
  return createElement(FinancePaymentsWorkCenter, baseFinanceProps(props, capability));
}

function RegisteredServiceRuntimeWorkCenter(props) {
  const route = props.context?.route || {};
  const resolvedCapability = props.capability || getWorkspaceItemByRoute(route.pathname || route.route || "");
  return createElement(ServiceRuntimeWorkCenter, {
    capability: resolvedCapability,
    organizationId: props.context?.organization_id,
    entityId: props.context?.entity_id,
    periodId: props.context?.period_id,
    workspaceId: "services",
    moduleKey: resolvedCapability?.id,
    eyebrow: props.eyebrow,
  });
}

function RegisteredChannelConnectionWorkCenter(props) {
  return createElement(ChannelConnectionWorkCenter, {
    capability: props.capability,
    organizationId: props.context?.organization_id,
  });
}

function RegisteredReportWorkCenter(props) {
  const route = props.context?.route || {};
  const resolvedCapability = props.capability || getWorkspaceItemByRoute(route.pathname || route.route || "");
  return createElement(ReportWorkCenter, {
    capability: resolvedCapability,
    organizationId: props.context?.organization_id,
    entityId: props.context?.entity_id,
    periodId: props.context?.period_id,
    workspaceId: props.workspaceId || route.workspaceId,
    topMenuActions: props.topMenuActions || props.workspace?.topMenu || [],
    workspaceActions: props.workspaceActions || props.workspace?.actions || [],
  });
}

registerRenderer("CreativeWorkspaceRenderer", RegisteredCreativeWorkspaceRenderer);
registerRenderer("MasterDataRuntimeWorkCenter", RegisteredMasterDataRuntimeWorkCenter);
registerRenderer("FinanceReportRuntimeWorkCenter", RegisteredFinanceReportRuntimeWorkCenter);
registerRenderer("FinanceOperationalWorkCenter", RegisteredFinanceOperationalWorkCenter);
registerRenderer("FinanceBankReconciliationWorkCenter", RegisteredFinanceBankReconciliationWorkCenter);
registerRenderer("FinanceBankStatementsWorkCenter", RegisteredFinanceBankStatementsWorkCenter);
registerRenderer("FinancePaymentsWorkCenter", RegisteredFinancePaymentsWorkCenter);
registerRenderer("ServiceRuntimeWorkCenter", RegisteredServiceRuntimeWorkCenter);
registerRenderer("ReportWorkCenter", RegisteredReportWorkCenter);
registerRenderer("ChannelConnectionWorkCenter", RegisteredChannelConnectionWorkCenter);
registerRenderer("CommercialSalesRuntimeWorkCenter", CommercialSalesRuntimeWorkCenter);
registerRenderer("CustomerRuntimeWorkCenter", CustomerRuntimeWorkCenter);

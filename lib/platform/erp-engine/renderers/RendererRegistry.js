"use client";

import { createElement } from "react";
import CreativeWorkspaceRenderer from "@/components/creative/runtime/CreativeWorkspaceRenderer";
import MasterDataRuntimeWorkCenter from "@/components/workspace/master-data/MasterDataRuntimeWorkCenter";
import OrganizationFallbackMasterDataRuntimeWorkCenter from "@/components/workspace/master-data/OrganizationFallbackMasterDataRuntimeWorkCenter";
import ServiceRuntimeWorkCenter from "@/components/workspace/services/ServiceRuntimeWorkCenter";
import ReportWorkCenter from "@/components/workspace/reports/ReportWorkCenter";
import ChannelConnectionWorkCenter from "@/components/workspace/channels/ChannelConnectionWorkCenter";
import FinanceUnavailableWorkCenter from "@/components/workspace/finance/FinanceUnavailableWorkCenter";

import {
  getWorkspaceItemByRoute,
} from "@/lib/platform/registry/erpRegistry";
import {
  hasUsableCreateAction,
  sanitizeActionList,
} from "@/lib/platform/actions/ActionContract";

const RENDERERS = new Map();
const UNAVAILABLE_STATUSES = new Set([
  "planned",
  "blocked",
  "partial",
  "unproven",
  "disabled",
  "unavailable",
  "coming-soon",
  "coming_soon",
]);

function actionList(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === "object") {
    return Object.entries(value).map(
      ([id, action]) => ({
        id,
        ...(action || {}),
      })
    );
  }

  return [];
}

function sanitizeCapability(capability) {
  if (!capability || typeof capability !== "object") {
    return capability;
  }

  const createAction = capability?.create || null;
  const canCreate = hasUsableCreateAction(createAction);

  const rowMenu = sanitizeActionList(
    capability?.rowMenu || capability?.ui?.rowMenu,
    {
      capability,
      createAction,
      allowCreate: canCreate,
      allowSelect: true,
    }
  );

  const topMenu = sanitizeActionList(
    capability?.topMenu || capability?.ui?.topMenu,
    {
      capability,
      createAction,
      allowCreate: canCreate,
    }
  );

  const actions = sanitizeActionList(
    capability?.actions,
    {
      capability,
      createAction,
      allowCreate: canCreate,
      allowSelect: true,
    }
  );

  return {
    ...capability,
    actions,
    rowMenu,
    topMenu,
    ui: {
      ...(capability.ui || {}),
      actions,
      rowMenu,
      topMenu,
    },
  };
}

function isUnavailableFinanceCapability(capability, workspaceId) {
  const workspace = String(workspaceId || "").trim().toLowerCase();
  const status = String(capability?.status || "").trim().toLowerCase();
  return workspace === "finance" && UNAVAILABLE_STATUSES.has(status);
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
  return createElement(
    CreativeWorkspaceRenderer,
    {
      runtime:
        props.runtime ||
        props.workspace?.runtime ||
        props.context?.runtime ||
        {},
    }
  );
}

function RegisteredMasterDataRuntimeWorkCenter(props) {
  const route = props.context?.route || {};
  const capability = sanitizeCapability(props.capability);
  const organizationId =
    props.organizationId ||
    props.context?.organization_id ||
    null;
  const entityId =
    props.entityId ||
    props.context?.entity_id ||
    null;
  const periodId =
    props.periodId ||
    props.context?.period_id ||
    null;
  const workspaceId =
    props.workspaceId ||
    props.workspace?.id ||
    props.workspace?.meta?.id ||
    route.moduleId ||
    route.workspaceId;

  if (isUnavailableFinanceCapability(capability, workspaceId)) {
    return createElement(FinanceUnavailableWorkCenter, { capability });
  }

  const Renderer = entityId
    ? MasterDataRuntimeWorkCenter
    : OrganizationFallbackMasterDataRuntimeWorkCenter;

  return createElement(
    Renderer,
    {
      workspaceId,
      moduleKey:
        props.moduleKey ||
        capability?.id ||
        route.itemId ||
        route.capabilityId,
      capability,
      eyebrow: props.eyebrow,
      organizationId,
      entityId,
      periodId,
      workspaceActions: capability?.actions || [],
      topMenuActions: topMenuOrFallback(
        capability,
        props.topMenuActions,
        props.workspace?.topMenu
      ),
      workspaceUi:
        capability?.ui ||
        props.workspaceUi ||
        props.workspace?.ui ||
        null,
    }
  );
}

function topMenuOrFallback(
  capability,
  explicitActions,
  workspaceActions
) {
  const capabilityActions = actionList(
    capability?.topMenu || capability?.ui?.topMenu
  );

  if (capabilityActions.length) {
    return capabilityActions;
  }

  return sanitizeActionList(
    explicitActions || workspaceActions,
    {
      capability,
      createAction: capability?.create,
      allowCreate: hasUsableCreateAction(capability?.create),
    }
  );
}

function RegisteredServiceRuntimeWorkCenter(props) {
  const route = props.context?.route || {};

  const resolvedCapability =
    props.capability ||
    getWorkspaceItemByRoute(
      route.pathname ||
      route.route ||
      ""
    );

  return createElement(
    ServiceRuntimeWorkCenter,
    {
      capability: resolvedCapability,
      organizationId: props.context?.organization_id,
      entityId: props.context?.entity_id,
      periodId: props.context?.period_id,
      workspaceId: "services",
      moduleKey: resolvedCapability?.id,
      eyebrow: props.eyebrow,
    }
  );
}

function RegisteredChannelConnectionWorkCenter(props) {
  return createElement(
    ChannelConnectionWorkCenter,
    {
      capability: props.capability,
      organizationId: props.context?.organization_id,
    }
  );
}

function RegisteredReportWorkCenter(props) {
  const route = props.context?.route || {};

  const resolvedCapability =
    props.capability ||
    getWorkspaceItemByRoute(
      route.pathname ||
      route.route ||
      ""
    );

  return createElement(
    ReportWorkCenter,
    {
      capability: resolvedCapability,
      organizationId: props.context?.organization_id,
      entityId: props.context?.entity_id,
      periodId: props.context?.period_id,
      workspaceId:
        props.workspaceId ||
        route.workspaceId,
      topMenuActions:
        props.topMenuActions ||
        props.workspace?.topMenu ||
        [],
      workspaceActions:
        props.workspaceActions ||
        props.workspace?.actions ||
        [],
    }
  );
}

registerRenderer(
  "CreativeWorkspaceRenderer",
  RegisteredCreativeWorkspaceRenderer
);

registerRenderer(
  "MasterDataRuntimeWorkCenter",
  RegisteredMasterDataRuntimeWorkCenter
);

registerRenderer(
  "ServiceRuntimeWorkCenter",
  RegisteredServiceRuntimeWorkCenter
);

registerRenderer(
  "ReportWorkCenter",
  RegisteredReportWorkCenter
);

registerRenderer(
  "ChannelConnectionWorkCenter",
  RegisteredChannelConnectionWorkCenter
);

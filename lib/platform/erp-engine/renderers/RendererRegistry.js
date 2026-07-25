"use client";

import { createElement } from "react";
import CreativeWorkspaceRenderer from "@/components/creative/runtime/CreativeWorkspaceRenderer";
import MasterDataRuntimeWorkCenter from "@/components/workspace/master-data/MasterDataRuntimeWorkCenter";
import OrganizationFallbackMasterDataRuntimeWorkCenter from "@/components/workspace/master-data/OrganizationFallbackMasterDataRuntimeWorkCenter";
import ServiceRuntimeWorkCenter from "@/components/workspace/services/ServiceRuntimeWorkCenter";
import ReportWorkCenter from "@/components/workspace/reports/ReportWorkCenter";
import ChannelConnectionWorkCenter from "@/components/workspace/channels/ChannelConnectionWorkCenter";

import {
  getWorkspaceItemByRoute,
} from "@/lib/platform/registry/erpRegistry";

const RENDERERS = new Map();

const MUTATING_ACTION_TYPES = new Set([
  "edit",
  "duplicate",
  "delete",
  "archive",
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

function hasExplicitExecutionTarget(action = {}) {
  return Boolean(
    action.endpoint ||
    action.api ||
    action.href ||
    action.capability ||
    action.engine
  );
}

function sanitizeReadOnlyRowMenu(capability = {}) {
  const readOnly = capability?.create?.enabled !== true;
  const detailRenderer = capability?.detail?.renderer || null;

  return actionList(
    capability?.rowMenu ||
    capability?.ui?.rowMenu
  ).filter(action => {
    const type = String(action?.type || "")
      .trim()
      .toLowerCase();

    if (
      readOnly &&
      MUTATING_ACTION_TYPES.has(type) &&
      !hasExplicitExecutionTarget(action)
    ) {
      return false;
    }

    if (type === "open") {
      return Boolean(
        action.document ||
        action.renderer ||
        detailRenderer ||
        action.href ||
        action.endpoint ||
        action.api
      );
    }

    return true;
  });
}

function sanitizeTopMenu(capability = {}) {
  const canCreate = capability?.create?.enabled === true;

  return actionList(
    capability?.topMenu ||
    capability?.ui?.topMenu
  ).filter(action => {
    const type = String(action?.type || "")
      .trim()
      .toLowerCase();

    if (type === "create" && !canCreate) {
      return false;
    }

    return true;
  });
}

function sanitizeCapability(capability) {
  if (!capability || typeof capability !== "object") {
    return capability;
  }

  const rowMenu = sanitizeReadOnlyRowMenu(capability);
  const topMenu = sanitizeTopMenu(capability);

  return {
    ...capability,
    rowMenu,
    topMenu,
    ui: {
      ...(capability.ui || {}),
      rowMenu,
      topMenu,
    },
  };
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
  const Renderer = entityId
    ? MasterDataRuntimeWorkCenter
    : OrganizationFallbackMasterDataRuntimeWorkCenter;

  return createElement(
    Renderer,
    {
      workspaceId:
        props.workspaceId ||
        props.workspace?.id ||
        props.workspace?.meta?.id ||
        route.moduleId ||
        route.workspaceId,
      moduleKey:
        props.moduleKey ||
        capability?.id ||
        route.itemId ||
        route.capabilityId,
      capability,
      eyebrow:
        props.eyebrow,
      organizationId,
      entityId,
      periodId,
      workspaceActions:
        props.workspaceActions ||
        props.workspace?.actions ||
        [],
      topMenuActions:
        topMenuOrFallback(
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
    capability?.topMenu ||
    capability?.ui?.topMenu
  );

  if (capabilityActions.length) {
    return capabilityActions;
  }

  return actionList(
    explicitActions ||
    workspaceActions
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

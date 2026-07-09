"use client";

import { createElement } from "react";
import CreativeWorkspaceRenderer from "@/components/creative/runtime/CreativeWorkspaceRenderer";
import MasterDataRuntimeWorkCenter from "@/components/workspace/master-data/MasterDataRuntimeWorkCenter";
import ServiceRuntimeWorkCenter from "@/components/workspace/services/ServiceRuntimeWorkCenter";

import {
  getWorkspaceItemByRoute,
} from "@/lib/platform/registry/erpRegistry";

const RENDERERS = new Map();

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
  const route =
    props.context?.route || {};

  return createElement(
    MasterDataRuntimeWorkCenter,
    {
      workspaceId:
        props.workspaceId ||
        props.workspace?.meta?.id ||
        route.moduleId ||
        route.workspaceId,
      moduleKey:
        props.moduleKey ||
        route.itemId ||
        route.capabilityId,
      capability:
        props.capability,
      eyebrow:
        props.eyebrow,
    }
  );
}


function RegisteredServiceRuntimeWorkCenter(props) {

  const route =
    props.context?.route || {};

  const serviceRoute =
    Array.isArray(route.serviceRoute)
      ? `/services/${route.serviceRoute.join("/")}`
      : route.pathname || "";

  const capability =
    getWorkspaceItemByRoute(
      serviceRoute
    );

  return createElement(
    ServiceRuntimeWorkCenter,
    {
      capability,

      organizationId:
        props.context?.organization_id,

      workspaceId:
        "services",

      moduleKey:
        capability?.id,

      eyebrow:
        props.eyebrow,

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

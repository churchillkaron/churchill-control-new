"use client";

import { createElement } from "react";
import CreativeWorkspaceRenderer from "@/components/creative/runtime/CreativeWorkspaceRenderer";
import MasterDataRuntimeWorkCenter from "@/components/workspace/master-data/MasterDataRuntimeWorkCenter";
import ServiceRuntimeWorkCenter from "@/components/workspace/services/ServiceRuntimeWorkCenter";
import ReportWorkCenter from "@/components/workspace/reports/ReportWorkCenter";
import ChannelConnectionWorkCenter from "@/components/workspace/channels/ChannelConnectionWorkCenter";

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

      capability:
        resolvedCapability,

      organizationId:
        props.context?.organization_id,

      entityId:
        props.context?.entity_id,

      periodId:
        props.context?.period_id,

      workspaceId:
        "services",

      moduleKey:
        resolvedCapability?.id,

      eyebrow:
        props.eyebrow,

    }
  );

}



function RegisteredChannelConnectionWorkCenter(props) {

  return createElement(
    ChannelConnectionWorkCenter,
    {

      capability:
        props.capability,

      organizationId:
        props.context?.organization_id,

    }
  );

}




function RegisteredReportWorkCenter(props) {

  const route =
    props.context?.route || {};


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
      capability:
        resolvedCapability,

      organizationId:
        props.context?.organization_id,

      entityId:
        props.context?.entity_id,

      periodId:
        props.context?.period_id,

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

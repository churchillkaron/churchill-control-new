"use client";

export const dynamic = "force-dynamic";

import { notFound, useParams } from "next/navigation";

import { default as ERPEngine } from "@/lib/platform/erp-engine/ERPEngine.jsx";

import {
  getWorkspaceItemByRoute,
} from "@/lib/platform/registry/erpRegistry";

import {
  serializeCapability,
} from "@/lib/platform/registry/serializeCapability";


export default function ServicesDynamicCapabilityPage() {

  const params =
    useParams();


  const routeParts =
    params.serviceRoute || [];


  const route =
    `/services/${routeParts.join("/")}`;


  const capability =
    serializeCapability(
      getWorkspaceItemByRoute(
        route
      )
    );


  if (!capability) {
    notFound();
  }


  if (!capability.renderer) {
    return null;
  }


  return (

    <ERPEngine

      renderer={
        capability.renderer
      }

      capability={
        capability
      }

    />

  );

}

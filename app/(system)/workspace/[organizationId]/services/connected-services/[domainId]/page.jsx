"use client";

export const dynamic = "force-dynamic";

import { useParams } from "next/navigation";
import ERPEngine from "@/lib/platform/erp-engine/ERPRuntime";

import {
  getWorkspaceItemByRoute,
} from "@/lib/platform/registry/erpRegistry";

import {
  serializeCapability,
} from "@/lib/platform/registry/serializeCapability";


export default function ServiceDomainDetailPage() {

  const params =
    useParams();


  const domainId =
    params.domainId;


  const baseCapability =
    serializeCapability(
      getWorkspaceItemByRoute(
        "/services/connected-services"
      )
    );


  const capability = {

    ...baseCapability,

    id:
      `${baseCapability.id}_${domainId}`,

    name:
      domainId
        .replace(/-/g," ")
        .replace(/\b\w/g,c =>
          c.toUpperCase()
        ),

    description:
      "Service providers and capabilities.",


    ui:{

      ...(baseCapability.ui || {}),

      runtime:
        "service_domain_detail",

      api:
        `/api/platform/services/domains/${domainId}`,

      rowsKey:
        "rows",

      domainId,

    },

  };


  return (

    <ERPEngine

      renderer={
        baseCapability.renderer
      }

      capability={
        capability
      }

    />

  );

}

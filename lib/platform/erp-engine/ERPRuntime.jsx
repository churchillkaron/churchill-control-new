"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";

import {
  createERPContext,
} from "./runtime/ERPContext";

import {
  resolveWorkspace,
} from "./workspaces/WorkspaceResolver";

import {
  resolveRenderer,
} from "./renderers/RendererRegistry";

export default function ERPEngine({

  renderer,

  capability,

  organizationId,

  entityId,

  periodId,

  children,

}) {

  const params =
    useParams();

  const context =
    useMemo(

      ()=>

        createERPContext({

          organization_id:
            params.organizationId,

          route:
            params,

        }),

      [params]

    );

  const workspace =
    useMemo(

      ()=>resolveWorkspace(

        context.workspace ||

        params.moduleId ||

        params.domain

      ),

      [context,params]

    );

  const workspaceRuntime =
    typeof workspace?.runtime === "function"
      ? workspace.runtime(context)
      : workspace?.runtime || null;

  const Renderer =
    resolveRenderer(renderer);

  if(Renderer){

    return (

      <Renderer

        context={context}

        workspace={{
          ...workspace,
          runtime: workspaceRuntime,
        }}

        capability={capability}

        workspaceId={
          workspace?.id ||
          workspace?.meta?.id ||
          context.workspace ||
          params.moduleId ||
          params.domain ||
          "finance"
        }

        workspaceActions={
          workspace?.actions || []
        }

        topMenuActions={
          workspace?.topMenu || []
        }

        workspaceUi={
          workspace?.ui || null
        }

        organizationId={organizationId}

        entityId={entityId}

        periodId={periodId}

      />

    );

  }

  return children || null;

}

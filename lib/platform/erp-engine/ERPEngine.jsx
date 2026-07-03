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

  const Renderer =
    resolveRenderer(renderer);

  if(Renderer){

    return (

      <Renderer

        context={context}

        workspace={workspace}

      />

    );

  }

  return children || null;

}

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
  workspaceId,
  children,
}) {
  const params = useParams();

  const context = useMemo(
    () =>
      createERPContext({
        organization_id:
          organizationId ||
          params.organizationId ||
          null,
        entity_id:
          entityId ||
          params.entityId ||
          null,
        period_id:
          periodId ||
          params.periodId ||
          null,
        workspace:
          workspaceId ||
          params.moduleId ||
          params.domain ||
          null,
        route: params,
      }),
    [
      organizationId,
      entityId,
      periodId,
      workspaceId,
      params,
    ]
  );

  const registeredWorkspace = useMemo(
    () =>
      resolveWorkspace(
        context.workspace ||
        params.moduleId ||
        params.domain
      ),
    [context, params]
  );

  const effectiveWorkspace = useMemo(
    () => ({
      ...registeredWorkspace,
      ...(capability || {}),
      meta: {
        ...(registeredWorkspace?.meta || {}),
        ...(capability || {}),
      },
      actions:
        capability?.actions ||
        registeredWorkspace?.actions ||
        [],
      topMenu:
        capability?.topMenu ||
        registeredWorkspace?.topMenu ||
        [],
      ui:
        capability?.ui ||
        registeredWorkspace?.ui ||
        null,
      create:
        capability?.create ||
        registeredWorkspace?.create ||
        null,
      runtime:
        capability?.runtime ||
        registeredWorkspace?.runtime ||
        null,
    }),
    [registeredWorkspace, capability]
  );

  const workspaceRuntime =
    typeof effectiveWorkspace?.runtime === "function"
      ? effectiveWorkspace.runtime(context)
      : effectiveWorkspace?.runtime || null;

  const Renderer = resolveRenderer(
    renderer ||
    capability?.runtime?.renderer ||
    capability?.renderer
  );

  if (Renderer) {
    return (
      <Renderer
        context={context}
        workspace={{
          ...effectiveWorkspace,
          runtime: workspaceRuntime,
        }}
        capability={capability}
        workspaceId={
          capability?.id ||
          effectiveWorkspace?.id ||
          effectiveWorkspace?.meta?.id ||
          context.workspace ||
          params.moduleId ||
          params.domain ||
          "finance"
        }
        workspaceActions={effectiveWorkspace?.actions || []}
        topMenuActions={effectiveWorkspace?.topMenu || []}
        workspaceUi={effectiveWorkspace?.ui || null}
        organizationId={context.organization_id}
        entityId={context.entity_id}
        periodId={context.period_id}
      />
    );
  }

  return children || null;
}

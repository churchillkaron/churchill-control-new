"use client";

import { useParams } from "next/navigation";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import WorkspaceModuleGrid from "@/components/workspace/WorkspaceModuleGrid";
import {
  getWorkspaceMeta,
  getWorkspaceGroups,
} from "@/lib/platform/registry/erpRegistry";

function titleFromId(value) {
  return String(value || "Workspace")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function OrganizationModulePage() {
  const params = useParams();

  const organizationId =
    params?.organizationId;

  const moduleId =
    String(params?.moduleId || "").toLowerCase();

  const workspace =
    getWorkspaceMeta(moduleId);

  const groups =
    getWorkspaceGroups(moduleId);

  const title =
    workspace?.title || titleFromId(moduleId);

  const description =
    workspace?.description ||
    "This workspace is ready for registry-driven capabilities.";

  return (
    <>
      <WorkspaceHeader
        workspace={title}
        title={title}
        description={description}
      />

      {groups.length > 0 ? (
        <WorkspaceModuleGrid
          workspace={moduleId}
          organizationId={organizationId}
        />
      ) : (
        <section className="rounded-[32px] border border-white/10 bg-white/[0.035] p-8">
          <div className="text-xs uppercase tracking-[0.32em] text-[#D6A66A]/70">
            Workspace
          </div>

          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-white">
            {title}
          </h2>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">
            No capabilities are configured for this workspace yet.
            Add them to ERP_REGISTRY and they will appear here automatically.
          </p>
        </section>
      )}
    </>
  );
}

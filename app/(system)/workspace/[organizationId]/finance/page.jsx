"use client";

import { useParams } from "next/navigation";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import WorkspaceModuleGrid from "@/components/workspace/WorkspaceModuleGrid";
import {
  getWorkspaceMeta,
  getWorkspaceGroups,
} from "@/lib/platform/registry/erpRegistry";

export const dynamic = "force-dynamic";

export default function FinanceWorkspacePage() {
  const { organizationId } = useParams();

  const workspace =
    getWorkspaceMeta("finance");

  const groups =
    getWorkspaceGroups("finance");

  const title =
    workspace?.title || "Finance";

  const description =
    workspace?.description ||
    "Accounting, treasury, tax, close, controls and reporting.";

  return (
    <>
      <WorkspaceHeader
        workspace="Finance"
        title={title}
        description={description}
      />

      {groups.length > 0 ? (
        <WorkspaceModuleGrid
          workspace="finance"
          organizationId={organizationId}
        />
      ) : (
        <section className="rounded-[32px] border border-white/10 bg-white/[0.035] p-8">
          <div className="text-xs uppercase tracking-[0.32em] text-[#D6A66A]/70">
            Finance
          </div>

          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-white">
            Finance Workspace
          </h2>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">
            No Finance work centers are configured in ERP_REGISTRY.
          </p>
        </section>
      )}
    </>
  );
}

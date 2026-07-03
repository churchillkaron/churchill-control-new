"use client";

export const dynamic = "force-dynamic";

import { useParams } from "next/navigation";

import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import WorkspaceModuleGrid from "@/components/workspace/WorkspaceModuleGrid";

import {
  getWorkspaceMeta,
  getWorkspaceGroups,
} from "@/lib/platform/registry/erpRegistry";

export default function CommercialWorkspacePage() {

  const { organizationId } =
    useParams();

  const workspace =
    getWorkspaceMeta("commercial");

  const groups =
    getWorkspaceGroups("commercial");

  const title =
    workspace?.title ||
    "Commercial";

  const description =
    workspace?.description ||
    "Customers, sales, marketing, revenue, pricing and commercial operations.";

  return (
    <>
      <WorkspaceHeader
        workspace="Commercial"
        title={title}
        description={description}
      />

      {groups.length > 0 ? (

        <WorkspaceModuleGrid
          workspace="commercial"
          organizationId={organizationId}
        />

      ) : (

        <section className="rounded-[32px] border border-white/10 bg-white/[0.035] p-8">

          <div className="text-xs uppercase tracking-[0.32em] text-[#D6A66A]/70">
            Commercial
          </div>

          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-white">
            Commercial Workspace
          </h2>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">
            No Commercial work centers are configured in ERP_REGISTRY.
          </p>

        </section>

      )}

    </>
  );

}

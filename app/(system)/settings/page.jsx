"use client";

export const dynamic = "force-dynamic";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import WorkspaceModuleGrid from "@/components/workspace/WorkspaceModuleGrid";
import { getWorkspaceMeta } from "@/lib/platform/registry/erpRegistry";

const WORKSPACE_ID = "administration";

// Legacy /settings remains a compatibility entry; canonical navigation resolves to the organization ERP workspace.
export default function SettingsPage() {
  const business = useBusinessContext();
  const workspace = getWorkspaceMeta(WORKSPACE_ID);

  const organizationId =
    business?.organization_id ||
    business?.organization?.id ||
    null;

  if (!business?.ready) {
    return (
      <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-7 text-sm text-white/45">
        Loading Administration…
      </section>
    );
  }

  return (
    <>
      <WorkspaceHeader
        workspace={workspace?.title || "Administration"}
        title={workspace?.title || "Administration"}
        description={
          workspace?.description ||
          "Manage organizations, security, permissions, integrations and packages."
        }
      />

      <WorkspaceModuleGrid
        workspace={WORKSPACE_ID}
        organizationId={organizationId}
      />
    </>
  );
}

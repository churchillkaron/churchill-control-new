"use client";

export const dynamic = "force-dynamic";

import { useParams } from "next/navigation";
import CommunicationsWorkspace from "@/components/workspace/commercial/CommunicationsWorkspace";

export default function CommunicationsPage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "").trim();

  if (!organizationId) {
    return (
      <div className="min-h-[calc(100vh-80px)] p-6 text-white">
        <div className="mx-auto max-w-[1700px] rounded-[28px] border border-red-400/15 bg-red-400/[0.05] p-6 text-sm text-red-100/80">
          Communications could not resolve the active organization. Reload the workspace or select the organization again.
        </div>
      </div>
    );
  }

  return <CommunicationsWorkspace organizationId={organizationId} />;
}

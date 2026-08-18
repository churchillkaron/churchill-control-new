"use client";

export const dynamic = "force-dynamic";

import { useParams, useSearchParams } from "next/navigation";
import CommunicationsWorkspace from "@/components/workspace/commercial/CommunicationsWorkspace";
import CommunicationDraftReviewBanner from "@/components/workspace/commercial/CommunicationDraftReviewBanner";
import InstagramMessagingStatusBanner from "@/components/workspace/commercial/InstagramMessagingStatusBanner";

export default function CommunicationsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const organizationId = String(params?.organizationId || "").trim();
  const conversationId = String(searchParams?.get("conversationId") || "").trim();
  const messageId = String(searchParams?.get("messageId") || "").trim();

  if (!organizationId) {
    return (
      <div className="min-h-[calc(100vh-80px)] p-6 text-white">
        <div className="mx-auto max-w-[1700px] rounded-[28px] border border-red-400/15 bg-red-400/[0.05] p-6 text-sm text-red-100/80">
          Communications could not resolve the active organization. Reload the workspace or select the organization again.
        </div>
      </div>
    );
  }

  return (
    <>
      <InstagramMessagingStatusBanner organizationId={organizationId} />
      <CommunicationDraftReviewBanner
        organizationId={organizationId}
        conversationId={conversationId}
        messageId={messageId}
      />
      <CommunicationsWorkspace organizationId={organizationId} />
    </>
  );
}

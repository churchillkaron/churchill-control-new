"use client";

export const dynamic = "force-dynamic";

import { useParams } from "next/navigation";

import HotelShiftHandoverBoard from "@/components/workspace/hotel/HotelShiftHandoverBoard";
import { HotelWorkspaceShell } from "@/components/workspace/hotel/HotelWorkspaceUI";

export default function HotelShiftHandoverPage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "");

  return (
    <HotelWorkspaceShell
      organizationId={organizationId}
      active="shift-handover"
      eyebrow="Hotel continuity"
      title="Shift Handover"
      subtitle="The next shift inherits live source truth, not a copied notebook. Avantiqo keeps unresolved guest, payment, room, housekeeping, channel and property-day work visible until the underlying condition is actually fixed."
    >
      <HotelShiftHandoverBoard organizationId={organizationId} />
    </HotelWorkspaceShell>
  );
}

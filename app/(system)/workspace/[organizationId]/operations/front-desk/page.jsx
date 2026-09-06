"use client";

export const dynamic = "force-dynamic";

import { useParams } from "next/navigation";

import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import HotelCheckoutRecovery from "@/components/workspace/hotel/HotelCheckoutRecovery";
import HotelFrontDeskWorkBoard from "@/components/workspace/hotel/HotelFrontDeskWorkBoard";
import {
  HotelPrimaryAction,
  HotelWorkspaceShell,
  hotelWorkspaceHref,
} from "@/components/workspace/hotel/HotelWorkspaceUI";

export default function OperationsFrontDeskPage() {
  const params = useParams();
  const businessContext = useBusinessContext() || {};
  const organization = businessContext.organization || null;
  const organizationId = params?.organizationId || businessContext.organization_id || organization?.id || null;

  return (
    <HotelWorkspaceShell
      organizationId={organizationId}
      active="front-desk"
      title="Front Desk"
      subtitle="Work the guest, not the PMS. Avantiqo uses each property's real operating day, explains the exact blocker and exposes the safest next move for arrivals, in-house stays, departures and recoverable staff mistakes."
      context={organization?.name || "Property operations"}
      actions={<HotelPrimaryAction href={hotelWorkspaceHref(organizationId, "reservations")}>New / manage reservation</HotelPrimaryAction>}
    >
      <HotelFrontDeskWorkBoard organizationId={organizationId} />
      <HotelCheckoutRecovery organizationId={organizationId} />
    </HotelWorkspaceShell>
  );
}

import { redirect } from "next/navigation";

export default function LegacyHotelReservationsPage({ params }) {
  redirect(
    `/workspace/${encodeURIComponent(params.organizationId)}/operations/reservations`
  );
}

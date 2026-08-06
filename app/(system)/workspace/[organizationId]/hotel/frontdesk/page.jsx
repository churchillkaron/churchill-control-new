import { redirect } from "next/navigation";

export default function LegacyHotelFrontDeskPage({ params }) {
  redirect(
    `/workspace/${encodeURIComponent(params.organizationId)}/operations/front-desk`
  );
}

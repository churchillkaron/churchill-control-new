import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Page({ params }) {
  redirect(`/workspace/${params.organizationId}/finance/cash-flow`);
}

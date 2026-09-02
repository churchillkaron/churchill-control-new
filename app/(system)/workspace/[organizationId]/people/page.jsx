"use client";

export const dynamic = "force-dynamic";

import { useParams } from "next/navigation";

import PeopleCommandCenter from "@/components/workspace/people/PeopleCommandCenter";

export default function PeopleWorkspacePage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "").trim();

  return <PeopleCommandCenter organizationId={organizationId} />;
}

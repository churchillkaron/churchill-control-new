"use client";

import { useParams } from "next/navigation";

import SolutionsCommandCenter from "@/components/workspace/solutions/SolutionsCommandCenter";

export default function SolutionsPage() {
  const params = useParams();
  return <SolutionsCommandCenter organizationId={params?.organizationId} />;
}

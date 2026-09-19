"use client";

import { useParams } from "next/navigation";
import MarketsCommandCenter from "@/components/workspace/solutions/markets/MarketsCommandCenter";

export default function MarketsPage() {
  const params = useParams();
  return <MarketsCommandCenter organizationId={params?.organizationId} />;
}

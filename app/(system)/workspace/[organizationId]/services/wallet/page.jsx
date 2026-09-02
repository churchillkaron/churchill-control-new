"use client";

import { useParams } from "next/navigation";

import ServicesWorkspace from "@/components/workspace/services/ServicesWorkspace";

export default function ServicesWalletPage() {
  const params = useParams();
  return <ServicesWorkspace organizationId={params?.organizationId} mode="wallet" />;
}

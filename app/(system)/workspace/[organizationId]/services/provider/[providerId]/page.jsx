"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import MetricCard from "@/components/workspace/MetricCard";

import {
  getProvider,
} from "@/lib/platform/service-runtime/integrations/registry/IntegrationRegistry";

export default function ProviderPage() {

  const {
    organizationId,
    providerId,
  } = useParams();

  const [provider,setProvider] = useState(null);

  useEffect(()=>{

    setProvider(
      getProvider(providerId)
    );

  },[providerId]);

  if(!provider){

    return (
      <WorkspaceHeader
        workspace="Services"
        title="Provider"
        description="Provider not found."
      />
    );

  }

  return (
    <>
      <WorkspaceHeader
        workspace="Services"
        title={provider.name}
        description="Managed by Avantiqo"
      />

      <div className="mt-6 grid gap-4 md:grid-cols-4">

        <MetricCard
          title="Status"
          value="Connected"
        />

        <MetricCard
          title="Usage"
          value="0"
        />

        <MetricCard
          title="Cost"
          value="$0.00"
        />

        <MetricCard
          title="Health"
          value="Healthy"
        />

      </div>

      <div className="mt-8 rounded-[32px] border border-white/10 bg-white/[0.04] p-8">

        <div className="grid gap-8 md:grid-cols-2">

          <div>

            <h3 className="text-lg font-semibold text-white">
              Connection
            </h3>

            <dl className="mt-6 space-y-4">

              <div className="flex justify-between">

                <dt className="text-white/50">
                  Managed By
                </dt>

                <dd className="text-white">
                  Avantiqo
                </dd>

              </div>

              <div className="flex justify-between">

                <dt className="text-white/50">
                  Authorization
                </dt>

                <dd className="text-green-400">
                  Connected
                </dd>

              </div>

              <div className="flex justify-between">

                <dt className="text-white/50">
                  Organization
                </dt>

                <dd className="text-white">
                  {organizationId}
                </dd>

              </div>

            </dl>

          </div>

          <div>

            <h3 className="text-lg font-semibold text-white">
              Usage
            </h3>

            <dl className="mt-6 space-y-4">

              <div className="flex justify-between">

                <dt className="text-white/50">
                  This Month
                </dt>

                <dd className="text-white">
                  —
                </dd>

              </div>

              <div className="flex justify-between">

                <dt className="text-white/50">
                  Billing
                </dt>

                <dd className="text-white">
                  Included
                </dd>

              </div>

              <div className="flex justify-between">

                <dt className="text-white/50">
                  Last Sync
                </dt>

                <dd className="text-white">
                  —
                </dd>

              </div>

            </dl>

          </div>

        </div>

      </div>

    </>
  );

}

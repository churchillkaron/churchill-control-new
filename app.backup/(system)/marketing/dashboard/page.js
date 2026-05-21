"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";
import { getCurrentTenant } from "@/lib/tenant";

export default function Dashboard() {
  const [campaigns, setCampaigns] = useState([]);

  useEffect(() => {
    async function load() {
      const tenant = await getCurrentTenant();

      if (!tenant) return;

      const { client } = tenant;

      const { data } = await supabase
        .from("campaigns")
        .select("*")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false });

      setCampaigns(data || []);
    }

    load();
  }, []);

  return (
    <div>

      <h1 className="text-4xl mb-6">Dashboard</h1>

      <div className="space-y-4">
        {campaigns.map((c, i) => (
          <div key={i} className="bg-white/5 p-4 rounded">

            <div className="text-xs text-white/50">
              {new Date(c.created_at).toLocaleString()}
            </div>

            <div className="flex gap-2 mt-2">
              {c.images?.map((img, idx) => (
                <img
                  key={idx}
                  src={img}
                  className="w-16 h-16 object-cover rounded"
                />
              ))}
            </div>

          </div>
        ))}
      </div>

    </div>
  );
}
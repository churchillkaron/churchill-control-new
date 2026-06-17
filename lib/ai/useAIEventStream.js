"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/**
 * REAL-TIME AI EVENT STREAM
 * Streams system_events live into UI
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export function useAIEventStream(organizationId) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!organizationId) return;

    // initial load
    const load = async () => {
      const { data } = await supabase
        .from("system_events")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(20);

      setEvents(data || []);
    };

    load();

    // realtime subscription
    const channel = supabase
      .channel("ai-events")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "system_events",
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          setEvents(prev => [payload.new, ...prev].slice(0, 20));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId]);

  return events;
}

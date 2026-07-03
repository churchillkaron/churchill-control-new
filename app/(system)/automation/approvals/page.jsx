"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

export default function ApprovalsPage() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("automation_approvals")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error) setItems(data || []);
    };

    load();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>Approvals</h1>
      <pre>{JSON.stringify(items, null, 2)}</pre>
    </div>
  );
}

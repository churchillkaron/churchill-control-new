"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/shared/supabase/client";

export default function ControlRoomPage() {
  const [data, setData] = useState([]);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("control_room")
        .select("*");

      if (!error) setData(data || []);
    };

    load();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>Control Room</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}

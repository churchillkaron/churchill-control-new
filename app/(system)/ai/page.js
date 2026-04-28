"use client";

import { useEffect, useState } from "react";

export default function AIPage() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const load = () => {
      const data = JSON.parse(localStorage.getItem("ai_logs") || "[]");
      setLogs(data.reverse());
    };

    load();
    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    
      <div className="text-white space-y-6">

        <h1 className="text-2xl">AI Owner</h1>

        {logs.length === 0 && (
          <div className="text-white/50">No AI activity yet</div>
        )}

        {logs.map((log) => (
          <div
            key={log.id}
            className="bg-white/5 p-4 rounded border border-white/10"
          >
            <div className="text-sm text-white/40 mb-2">
              {new Date(log.created_at).toLocaleTimeString()}
            </div>

            <div className="whitespace-pre-line">
              {log.result}
            </div>
          </div>
        ))}

      </div>
  
  );
}
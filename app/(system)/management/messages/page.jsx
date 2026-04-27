"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import AppShell from '@/app/AppShell'

export default function MessagesPage() {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const data = JSON.parse(localStorage.getItem("staff_messages") || "[]");
    setMessages(data);
  }, []);

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Messages</h1>

        <div className="space-y-3">

          {messages.map((m) => (
            <MessageRow key={m.id} m={m} />
          ))}

          {messages.length === 0 && (
            <div className="text-white/40">No messages</div>
          )}

        </div>

      </div>
    </AppShell>
  );
}

function MessageRow({ m }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">

      <div className="flex justify-between text-sm">
        <span className="text-white/60">[{m.target}]</span>
        <span className="text-white/40">{m.date}</span>
      </div>

      <div className="mt-2">{m.text}</div>

    </div>
  );
}
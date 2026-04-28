"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ControlPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setUser(user);
    };

    loadUser();
  }, []);

  return (
    <div className="min-h-screen bg-black text-white flex">

      {/* 🔥 SIDEBAR */}
      <aside className="w-64 border-r border-white/10 bg-black/60 backdrop-blur-xl p-6 flex flex-col justify-between">
        
        <div>
          <h1 className="text-2xl font-bold mb-10">CONTROL</h1>

          <nav className="space-y-3">

            <NavItem label="Dashboard" onClick={() => router.push("/control")} />
            <NavItem label="POS" onClick={() => router.push("/pos")} />
            <NavItem label="Production" onClick={() => router.push("/production")} />
            <NavItem label="Staff" onClick={() => router.push("/staff")} />
            <NavItem label="Accounting" onClick={() => router.push("/accounting")} />
            <NavItem label="Management" onClick={() => router.push("/management")} />
            <NavItem label="History" onClick={() => router.push("/history")} />
            <NavItem label="Payout" onClick={() => router.push("/payout")} />
            <NavItem label="Settings" onClick={() => router.push("/system-setup/step-1")} />

          </nav>
        </div>

        <div className="space-y-3">
          <div className="text-sm text-white/50">{user?.email}</div>

          <button
            className="w-full px-4 py-2 bg-red-500/80 rounded-xl text-white text-sm"
            onClick={async () => {
              await supabase.auth.signOut();
              router.push("/login");
            }}
          >
            Logout
          </button>
        </div>
      </aside>

      {/* 🔥 MAIN */}
      <main className="flex-1 p-8 space-y-8">

        {/* HEADER */}
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-semibold">Control Center</h2>
        </div>

        {/* 🔥 METRICS */}
        <div className="grid grid-cols-4 gap-6">

          <Card title="Revenue Today" value="0 THB" />
          <Card title="Orders" value="0" />
          <Card title="Avg Order" value="0 THB" />
          <Card title="Service Charge" value="5%" />

        </div>

        {/* 🔥 PERFORMANCE */}
        <div className="grid grid-cols-3 gap-6">

          <Card title="FOH Performance" value="0%" />
          <Card title="Bar Performance" value="0%" />
          <Card title="Kitchen Performance" value="0%" />

        </div>

        {/* 🔥 QUICK ACTIONS */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <h3 className="text-xl font-semibold mb-4">Quick Actions</h3>

          <div className="grid grid-cols-4 gap-4">

            <ActionButton label="Open POS" onClick={() => router.push("/pos")} />
            <ActionButton label="View Staff" onClick={() => router.push("/staff")} />
            <ActionButton label="Production" onClick={() => router.push("/production")} />
            <ActionButton label="Payout" onClick={() => router.push("/payout")} />

          </div>
        </div>

        {/* 🔥 SYSTEM STATUS */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <h3 className="text-xl font-semibold mb-4">System Status</h3>

          <div className="space-y-2 text-sm text-white/70">
            <p>POS: Connected</p>
            <p>Production Engine: Pending</p>
            <p>Accounting: Pending</p>
            <p>AI Layer: Inactive</p>
          </div>
        </div>

      </main>
    </div>
  );
}

/* 🔥 COMPONENTS */

function NavItem({ label, onClick }) {
  return (
    <div
      onClick={onClick}
      className="px-4 py-2 rounded-xl hover:bg-white/10 cursor-pointer transition"
    >
      {label}
    </div>
  );
}

function Card({ title, value }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <p className="text-sm text-white/50 mb-2">{title}</p>
      <h3 className="text-2xl font-semibold">{value}</h3>
    </div>
  );
}

function ActionButton({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="p-4 rounded-xl bg-white/10 hover:bg-orange-500/80 transition"
    >
      {label}
    </button>
  );
}
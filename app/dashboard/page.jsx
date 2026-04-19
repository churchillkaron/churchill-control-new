"use client";

import Link from "next/link";
import AppShell from "../AppShell";
import { useEffect, useState } from "react";

export default function Dashboard() {
  const [role, setRole] = useState("");

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("current_user"));
    if (user) setRole(user.role);
  }, []);

  const Card = ({ href, title, desc }) => (
    <Link
      href={href}
      className="bg-white/5 border border-white/10 rounded-2xl p-6 block hover:bg-white/10 transition"
    >
      <div className="text-xl text-white">{title}</div>
      <div className="text-white/50 text-sm mt-2">{desc}</div>
    </Link>
  );

  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Dashboard</h1>

        <div className="grid md:grid-cols-2 gap-6">

          {/* OWNER */}
          {role === "owner" && (
            <>
              <Card href="/pos" title="POS" desc="Orders and live sales" />
              <Card href="/orders" title="Orders" desc="Live order management" />
              <Card href="/kitchen" title="Kitchen" desc="Kitchen workflow" />
              <Card href="/accounting" title="Accounting" desc="Finance system" />
              <Card href="/payout" title="Payout" desc="Service distribution" />
              <Card href="/history" title="History" desc="Financial records" />
              <Card href="/staff" title="Staff Portal" desc="Staff tools" />
              <Card href="/staff-control" title="Staff Control" desc="Performance & penalties" />
              <Card href="/control-final" title="Control Final" desc="Close day" />
            </>
          )}

          {/* MANAGER */}
          {role === "gm" || role === "manager" ? (
            <>
              <Card href="/pos" title="POS" desc="Orders and live sales" />
              <Card href="/orders" title="Orders" desc="Live order management" />
              <Card href="/kitchen" title="Kitchen" desc="Kitchen workflow" />
              <Card href="/staff" title="Staff Portal" desc="Staff tools" />
              <Card href="/staff-control" title="Staff Control" desc="Performance & penalties" />
              <Card href="/history" title="History" desc="Operational history" />
            </>
          ) : null}

          {/* ACCOUNTING */}
          {role === "accounting" && (
            <>
              <Card href="/accounting" title="Accounting" desc="Finance system" />
              <Card href="/history" title="History" desc="Financial records" />
              <Card href="/payout" title="Payout" desc="Service distribution" />
            </>
          )}

          {/* STAFF */}
          {(role === "kitchen" || role === "staff") && (
            <>
              <Card href="/pos" title="POS" desc="Orders and live sales" />
              <Card href="/orders" title="Orders" desc="Live orders" />
              <Card href="/kitchen" title="Kitchen" desc="Kitchen workflow" />
            </>
          )}

        </div>

      </div>
    </AppShell>
  );
}
"use client";

import AppShell from "../AppShell";
import Link from "next/link";

export default function StaffPage() {
  const cards = [
    {
      title: "Performance",
      desc: "Personal performance and score",
      href: "/staff/performance",
      icon: "⭐",
    },
    {
      title: "Earnings",
      desc: "Your earnings and service charge",
      href: "/staff/earnings",
      icon: "💰",
    },
    {
      title: "Attendance",
      desc: "Clock in and track attendance",
      href: "/attendance",
      icon: "⏱️",
    },
    {
      title: "AI Invoice",
      desc: "Upload invoice to send to accounting",
      href: "/accounting/ai-invoices",
      icon: "🤖",
    },
    {
      title: "Google Reviews",
      desc: "View customer reviews",
      href: "/reviews",
      icon: "⭐",
    },
    {
      title: "Messages",
      desc: "Team communication",
      href: "/messages",
      icon: "💬",
    },
  ];

  return (
    <AppShell>
      <div className="min-h-screen text-white p-6 max-w-6xl mx-auto space-y-10">

        {/* HEADER */}
        <div>
          <Link href="/dashboard" className="text-white/50 text-sm">
            ← Dashboard
          </Link>

          <h1 className="text-3xl mt-2 font-semibold">
            Staff Portal
          </h1>
        </div>

        {/* GRID */}
        <div className="grid
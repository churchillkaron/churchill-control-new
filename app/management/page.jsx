"use client";

import AppShell from "../AppShell"; // ✅ FIXED PATH

export default function ManagementPage() {
  return (
    <AppShell>
      <div className="space-y-10 text-white">

        <h1 className="text-3xl">Management</h1>

        <div className="space-y-4">

          <NavItem title="Staff Control" href="/management/staff-control" />
          <NavItem title="Attendance" href="/management/attendance" />
          <NavItem title="Approvals" href="/management/approval" />

        </div>

      </div>
    </AppShell>
  );
}

function NavItem({ title, href }) {
  return (
    <a
      href={href}
      className="block bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/10"
    >
      {title}
    </a>
  );
}
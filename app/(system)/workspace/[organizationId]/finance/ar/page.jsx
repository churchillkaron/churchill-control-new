"use client";

export const dynamic = "force-dynamic";

import WorkspaceHub from "@/components/workspace/WorkspaceHub";

export default function AccountsReceivablePage() {
  return (
    <WorkspaceHub
      workspaceId="finance"
      groupId="order_to_cash"
      eyebrow="Finance"
      title="Accounts Receivable"
      description="Manage customers, invoices, collections and incoming payments."
      runtimeEndpoint="/api/finance/ar/runtime"
      metrics={[
        {
          label: "Invoices",
          key: "invoices",
        },
        {
          label: "Receivables",
          key: "receivables",
        },
        {
          label: "Payments",
          key: "payments",
        },
        {
          label: "Overdue",
          key: "overdue",
        },
      ]}
      attention={[
        {
          label: "Overdue Accounts",
          key: "overdue",
        },
        {
          label: "Open Receivables",
          key: "receivables",
        },
        {
          label: "Payments Received",
          key: "payments",
        },
      ]}
    />
  );
}

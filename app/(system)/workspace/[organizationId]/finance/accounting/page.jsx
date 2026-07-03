"use client";

export const dynamic = "force-dynamic";

import WorkspaceHub from "@/components/workspace/WorkspaceHub";

export default function AccountingPage() {
  return (
    <WorkspaceHub
      workspaceId="finance"
      groupId="accounting"
      eyebrow="Finance"
      title="Accounting"
      description="Core accounting, posting and ledger control."
      runtimeEndpoint="/api/finance/accounting/runtime"
      metrics={[
        { label: "Journals", key: "journals" },
        { label: "Journal Lines", key: "journalLines" },
        { label: "Accounts", key: "accounts" },
        { label: "Review Queue", key: "reviewQueue" },
      ]}
      attention={[
        { label: "Journal Entries Awaiting Review", key: "reviewQueue" },
        { label: "Trial Balance Validation", key: "trialBalanceIssues" },
        { label: "Reconciliation Exceptions", key: "reconciliationExceptions" },
      ]}
    />
  );
}

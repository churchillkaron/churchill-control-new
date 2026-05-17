"use client";

import AuthGuard from "@/components/AuthGuard";

import FinanceContent from "./FinanceContent";

export default function FinancePage() {

  return (

    <AuthGuard
      module="finance"
      action="can_view"
    >

      <FinanceContent />

    </AuthGuard>
  );
}

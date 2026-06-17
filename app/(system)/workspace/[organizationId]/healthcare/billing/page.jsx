"use client";
import { useBilling } from "../hooks/useBilling";
import { useOrganization } from "@/app/providers/OrganizationProvider";

export default function BillingPage() {
  const { organization } = useOrganization();
  const { billing, loading, refresh } = useBilling(organization?.id);

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-6">Billing</h1>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <ul className="space-y-2">
          {billing.map(b => (
            <li key={b.id} className="border p-4 rounded">
              {b.invoice_number} - {b.patient_id} - {b.total_amount} - {b.billing_status}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

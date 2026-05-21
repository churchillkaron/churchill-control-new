"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function AIInvoicesPage() {
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    loadInvoices();
  }, []);

  async function loadInvoices() {
    try {
      const response = await fetch(
        "/api/accounting/ai-invoices"
      );

      const data = await response.json();

      setInvoices(
        data.invoices || []
      );

    } catch (error) {

      console.error(error);

    }
  }

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-bold mb-4">
        AI Invoices
      </h1>

      <div className="space-y-3">
        {invoices.map((invoice) => (
          <div
            key={invoice.id}
            className="border border-white/10 rounded-xl p-4"
          >
            <div>
              {invoice.invoice_number}
            </div>

            <div>
              {invoice.total_amount}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

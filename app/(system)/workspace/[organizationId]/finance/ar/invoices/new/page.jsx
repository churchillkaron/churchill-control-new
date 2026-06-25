"use client";

import { useState } from "react";
import { useOrganization } from "@/app/providers/OrganizationProvider";

export default function Page() {

  const { organization } =
    useOrganization();

  const organizationId =
    organization?.id;

  const [customerSearch, setCustomerSearch] =
    useState("");

  const [customers, setCustomers] =
    useState([]);

  const [selectedCustomer, setSelectedCustomer] =
    useState(null);

  const [invoiceNumber, setInvoiceNumber] =
    useState("");

  const [invoiceDate, setInvoiceDate] =
    useState("");

  const [dueDate, setDueDate] =
    useState("");

  const [subtotal, setSubtotal] =
    useState("");

  const [taxAmount, setTaxAmount] =
    useState("");

  const [notes, setNotes] =
    useState("");


  async function createInvoice() {

    if (!selectedCustomer?.id) {
      alert("Select customer");
      return;
    }

    const res =
      await fetch(
        "/api/finance/customer-invoices/create",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            organizationId,

            customer_id:
              selectedCustomer.id,

            invoice_number:
              invoiceNumber,

            invoice_date:
              invoiceDate,

            due_date:
              dueDate,

            subtotal:
              Number(subtotal || 0),

            tax_amount:
              Number(taxAmount || 0),

            notes,
          }),
        }
      );

    const result =
      await res.json();

    if (!result.success) {
      alert(
        result.error ||
        "Unable to create invoice"
      );
      return;
    }

    alert("Invoice created");
  }

  async function searchCustomers() {

    const res =
      await fetch(
        "/api/customers/search",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            organizationId,
            query:
              customerSearch,
          }),
        }
      );

    const data =
      await res.json();

    setCustomers(
      data.customers || []
    );

  }

  return (
    <div className="min-h-screen bg-[#030712] text-white p-8"><div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">

        <h1 className="text-3xl font-light">
          Create Customer Invoice
        </h1>

        <div className="mt-8 space-y-6">

          <div>
            <div className="mb-2 text-sm text-white/60">
              Customer Search
            </div>

            <div className="flex gap-2">
              <input
                value={customerSearch}
                onChange={(e) =>
                  setCustomerSearch(
                    e.target.value
                  )
                }
                className="flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3"
                placeholder="Name, phone or email"
              />

              <button
                onClick={searchCustomers}
                className="rounded-xl border border-[#D6A66A]/30 px-4"
              >
                Search
              </button>
            </div>
          </div>

          {customers.length > 0 && (
            <div className="rounded-xl border border-white/10 overflow-hidden">
              {customers.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() =>
                    setSelectedCustomer(
                      customer
                    )
                  }
                  className="w-full border-b border-white/5 p-3 text-left hover:bg-white/5"
                >
                  <div>
                    {customer.customer_name}
                  </div>

                  <div className="text-xs text-white/50">
                    {customer.customer_phone}
                  </div>
                </button>
              ))}
            </div>
          )}

          {selectedCustomer && (
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
              Selected Customer: {selectedCustomer.customer_name}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">

            <input
              value={invoiceNumber}
              onChange={(e) =>
                setInvoiceNumber(
                  e.target.value
                )
              }
              placeholder="Invoice Number"
              className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"
            />

            <input
              type="date"
              value={invoiceDate}
              onChange={(e) =>
                setInvoiceDate(
                  e.target.value
                )
              }
              className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"
            />

            <input
              type="date"
              value={dueDate}
              onChange={(e) =>
                setDueDate(
                  e.target.value
                )
              }
              className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"
            />

            <input
              value={subtotal}
              onChange={(e) =>
                setSubtotal(
                  e.target.value
                )
              }
              placeholder="Subtotal"
              className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"
            />

            <input
              value={taxAmount}
              onChange={(e) =>
                setTaxAmount(
                  e.target.value
                )
              }
              placeholder="Tax Amount"
              className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"
            />

          </div>

          <textarea
            value={notes}
            onChange={(e) =>
              setNotes(
                e.target.value
              )
            }
            placeholder="Notes"
            className="min-h-[120px] w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3"
          />

          <button
            onClick={createInvoice}
            className="rounded-xl bg-[#D6A66A] px-6 py-3 text-black font-semibold"
          >
            Create Invoice
          </button>

        </div>

      </div>

    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function customerLabel(customer = {}) {
  return (
    customer.customer_name ||
    customer.display_name ||
    customer.company_name ||
    "Unnamed customer"
  );
}

export default function DynamicCustomerField({
  field,
  value = {},
  onChange,
  organizationId,
}) {
  const [results, setResults] = useState([]);
  const [search, setSearch] = useState(value.customer_name || "");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingDetails, setEditingDetails] = useState(false);
  const requestId = useRef(0);

  function update(name, val) {
    onChange(field.name, {
      ...value,
      [name]: val,
    });
  }

  const loadCustomers = useCallback(
    async (query = "") => {
      if (!organizationId) {
        setResults([]);
        return;
      }

      const currentRequest = ++requestId.current;

      try {
        setLoading(true);
        setError("");

        const res = await fetch("/api/commercial/customers/search", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organizationId,
            query,
          }),
        });

        const json = await res.json().catch(() => ({}));
        if (currentRequest !== requestId.current) return;

        if (!res.ok || !json.success) {
          throw new Error(json.error || "Unable to load customers");
        }

        setResults(Array.isArray(json.customers) ? json.customers : []);
      } catch (loadError) {
        if (currentRequest !== requestId.current) return;
        setResults([]);
        setError(loadError?.message || "Unable to load customers");
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
      }
    },
    [organizationId]
  );

  useEffect(() => {
    loadCustomers("");
  }, [loadCustomers]);

  useEffect(() => {
    if (value.customer_name && value.customer_name !== search) {
      setSearch(value.customer_name);
    }
  }, [search, value.customer_name]);

  async function searchCustomers(text) {
    setSearch(text);
    setOpen(true);
    setEditingDetails(false);

    onChange(field.name, {
      ...value,
      existing_customer: false,
      new_customer_confirmed: false,
      party_id: null,
      customer_name: text,
    });

    await loadCustomers(text);
  }

  function selectCustomer(customer) {
    setOpen(false);
    setEditingDetails(false);
    setSearch(customerLabel(customer));

    onChange(field.name, {
      ...value,
      existing_customer: true,
      new_customer_confirmed: false,
      party_id: customer.party_id || customer.id || null,
      customer_name: customer.customer_name || customer.display_name || "",
      customer_email: customer.customer_email || customer.email || "",
      customer_phone: customer.customer_phone || customer.phone || "",
      customer_type: customer.customer_type || "PERSON",
      company_name: customer.company_name || "",
      tax_number: customer.tax_number || "",
      billing_address: customer.billing_address || "",
      shipping_address: customer.shipping_address || "",
      city: customer.city || "",
      state: customer.state || "",
      postal_code: customer.postal_code || "",
      country: customer.country || "",
      preferred_language: customer.preferred_language || "",
      preferred_currency: customer.preferred_currency || "",
      credit_limit: customer.credit_limit || 0,
      payment_terms: customer.payment_terms || "",
      birthday: customer.birthday || "",
      notes: customer.notes || "",
    });
  }

  function confirmNewCustomer() {
    const name = search.trim();
    if (!name) return;
    setOpen(false);
    setEditingDetails(true);
    onChange(field.name, {
      ...value,
      existing_customer: false,
      new_customer_confirmed: true,
      party_id: null,
      customer_name: name,
      customer_type: value.customer_type || "COMPANY",
    });
  }

  return (
    <div className="col-span-full min-w-0 rounded-xl border border-white/10 bg-black/20 p-3 sm:p-5">
      <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.18em] text-white/45 sm:mb-4 sm:text-xs sm:tracking-[0.25em]">
        {field.label}
        {field.required ? <span className="ml-1 text-orange-400">*</span> : null}
      </div>

      <div className="relative">
        <input
          value={search}
          required={field.required}
          autoComplete="off"
          onFocus={() => {
            setOpen(true);
            if (!results.length && !loading) loadCustomers(search);
          }}
          onChange={(event) => searchCustomers(event.target.value)}
          placeholder="Search customers by name, email or phone..."
          className="h-11 w-full min-w-0 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#D6A66A]/50 sm:rounded-xl sm:px-4"
        />

        {open ? (
          <div className="absolute inset-x-0 z-50 mt-2 max-h-[min(320px,45vh)] overflow-y-auto rounded-xl border border-white/10 bg-[#111] p-1.5 shadow-2xl sm:p-2">
            {loading ? (
              <div className="px-3 py-3 text-xs text-white/45">Loading customers…</div>
            ) : error ? (
              <div className="px-3 py-3 text-xs text-red-300">{error}</div>
            ) : results.length ? (
              results.map((customer) => (
                <button
                  key={customer.party_id || customer.id}
                  type="button"
                  onClick={() => selectCustomer(customer)}
                  className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-white/10"
                >
                  <span className="block truncate text-sm text-white">
                    {customerLabel(customer)}
                  </span>
                  {[customer.customer_email || customer.email, customer.customer_phone || customer.phone]
                    .filter(Boolean)
                    .length ? (
                    <span className="mt-0.5 block truncate text-[11px] text-white/40">
                      {[customer.customer_email || customer.email, customer.customer_phone || customer.phone]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  ) : null}
                </button>
              ))
            ) : search.trim() ? (
              <button
                type="button"
                onClick={confirmNewCustomer}
                className="block w-full rounded-lg border border-[#D6A66A]/20 bg-[#D6A66A]/[0.06] px-3 py-3 text-left hover:bg-[#D6A66A]/[0.1]"
              >
                <span className="block text-xs font-semibold text-[#E8BE88]">+ Create “{search.trim()}” as a new customer</span>
                <span className="mt-1 block text-[11px] leading-4 text-white/40">You can add contact and billing details before creating the invoice.</span>
              </button>
            ) : (
              <div className="px-3 py-3 text-xs text-white/45">Start typing to find a customer.</div>
            )}
          </div>
        ) : null}
      </div>

      {value.existing_customer && value.party_id && !editingDetails ? (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[#D6A66A]/20 bg-[#D6A66A]/[0.05] p-3 sm:mt-5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#D6A66A]">Customer selected</div>
            <div className="mt-1 truncate text-sm font-medium text-white">{value.customer_name || search}</div>
            {[value.customer_email, value.customer_phone, value.billing_address].filter(Boolean).length ? (
              <div className="mt-1 truncate text-[11px] text-white/45">
                {[value.customer_email, value.customer_phone, value.billing_address].filter(Boolean).join(" · ")}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => setEditingDetails(true)} className="rounded-lg border border-white/10 px-3 py-2 text-[11px] text-white/65 hover:bg-white/5">Edit details</button>
            <button type="button" onClick={() => { setSearch(""); setOpen(true); setEditingDetails(false); onChange(field.name, {}); loadCustomers(""); }} className="rounded-lg border border-white/10 px-3 py-2 text-[11px] text-white/65 hover:bg-white/5">Change</button>
          </div>
        </div>
      ) : value.new_customer_confirmed || editingDetails ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:mt-5 sm:grid-cols-2 sm:gap-4">
          <div className="sm:col-span-2 text-[11px] leading-4 text-white/45">{value.existing_customer ? "Update invoice contact details if needed." : "New customer — add only the details you know. The customer will be saved with this invoice."}</div>
          <select value={value.customer_type || "PERSON"} onChange={(event) => update("customer_type", event.target.value)} className="h-11 min-w-0 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white sm:rounded-xl sm:px-4">
            <option value="PERSON">Person</option>
            <option value="COMPANY">Company</option>
          </select>
          {value.customer_type === "COMPANY" ? <input placeholder="Company Name" value={value.company_name || ""} onChange={(event) => update("company_name", event.target.value)} className="h-11 min-w-0 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white sm:rounded-xl sm:px-4" /> : null}
          <input type="email" inputMode="email" placeholder="Email" value={value.customer_email || ""} onChange={(event) => update("customer_email", event.target.value)} className="h-11 min-w-0 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white sm:rounded-xl sm:px-4" />
          <input type="tel" inputMode="tel" placeholder="Phone" value={value.customer_phone || ""} onChange={(event) => update("customer_phone", event.target.value)} className="h-11 min-w-0 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white sm:rounded-xl sm:px-4" />
          <input placeholder="Tax Number" value={value.tax_number || ""} onChange={(event) => update("tax_number", event.target.value)} className="h-11 min-w-0 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white sm:rounded-xl sm:px-4" />
          <input placeholder="Billing Address" value={value.billing_address || ""} onChange={(event) => update("billing_address", event.target.value)} className="h-11 min-w-0 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white sm:rounded-xl sm:px-4" />
          <input placeholder="City" value={value.city || ""} onChange={(event) => update("city", event.target.value)} className="h-11 min-w-0 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white sm:rounded-xl sm:px-4" />
          <input placeholder="Country" value={value.country || ""} onChange={(event) => update("country", event.target.value)} className="h-11 min-w-0 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white sm:rounded-xl sm:px-4" />
        </div>
      ) : null}
    </div>
  );
}

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useOrganization } from "@/app/providers/OrganizationProvider";
import {
  Users,
  CircleDollarSign,
  Star,
} from "lucide-react";

export default function CustomersPage() {
  const { organization } =
    useOrganization();

  const organizationId =
    organization?.id;

  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [saving, setSaving] = useState(false);
  const [orderHistory, setOrderHistory] = useState([]);
  const [activeTab, setActiveTab] = useState("profile");

  // fetch customer order history
  async function loadCustomerHistory(customer) {
    const response = await fetch("/api/customers/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, customerPhone: customer.customer_phone })
    });
    const result = await response.json();
    setOrderHistory(result.history || []);
  }

  // search by name, phone, or email
  async function searchCustomers(search = "") {
    if (!organizationId) return;
    setLoading(true);
    try {
      const response = await fetch("/api/customers/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, query: search })
      });
      const result = await response.json();
      setCustomers(result.customers || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  useEffect(() => { searchCustomers(""); }, [organizationId]);

  const handleUpdateProfile = async () => {
    if (!selectedCustomer) return;
    setSaving(true);
    await fetch("/api/customers/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        customer_name: selectedCustomer.customer_name,
        customer_phone: selectedCustomer.customer_phone,
        customer_email: selectedCustomer.customer_email,
        birthday: selectedCustomer.birthday,
        notes: selectedCustomer.notes
      })
    });
    setSaving(false);
    searchCustomers(query);
  };

  return (
    <div className="p-8 text-white">

      <h1 className="mb-6 text-4xl font-bold">Customer Portal</h1>

      {/* Search */}
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); searchCustomers(e.target.value); }}
        placeholder="Search name, phone or email"
        className="mb-6 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3"
      />

      {/* Customer List */}
      <div className="space-y-3 mb-8 max-h-[350px] overflow-y-auto">
        {loading ? "Loading..." :
          customers.map(customer => (
            <div
              key={customer.id}
              onClick={async () => { setSelectedCustomer(customer); await loadCustomerHistory(customer); }}
              className={`cursor-pointer rounded-xl border border-white/10 p-4 transition hover:border-violet-500 ${selectedCustomer?.id === customer.id ? "border-violet-500 bg-violet-500/5" : ""}`}
            >
              <div className="text-lg font-semibold">{customer.customer_name}</div>
              <div className="text-white/60">{customer.customer_phone}</div>
              <div className="mt-2 text-sm">Tier: {customer.tier} • Visits: {customer.visit_count} • Spend: ฿{Number(customer.total_spent || 0).toLocaleString()}</div>
            </div>
          ))
        }
      </div>

      {selectedCustomer && (
        <>
          {/* Dashboard Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 rounded-xl border flex flex-col items-start gap-2">
              <CircleDollarSign size={28} /> Total Spend
              <div className="text-2xl font-bold">฿{Number(selectedCustomer.total_spent || 0).toLocaleString()}</div>
            </div>
            <div className="p-4 rounded-xl border flex flex-col items-start gap-2">
              <Users size={28} /> Visits
              <div className="text-2xl font-bold">{selectedCustomer.visit_count || 0}</div>
            </div>
            <div className="p-4 rounded-xl border flex flex-col items-start gap-2">
              <Star size={28} /> Tier
              <div className="text-2xl font-bold">{selectedCustomer.tier}</div>
            </div>
            <div className="p-4 rounded-xl border flex flex-col items-start gap-2">
              <Star size={28} /> Loyalty Points
              <div className="text-2xl font-bold">{selectedCustomer.loyalty_points || 0}</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-4 flex gap-4">
            {["profile","orders","reviews","support"].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-xl ${activeTab===tab ? "bg-violet-600" : "bg-black/20"}`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div>
            {activeTab==="profile" && (
              <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6 space-y-3">
                <input
                  value={selectedCustomer.customer_name || ""}
                  onChange={e => setSelectedCustomer({...selectedCustomer, customer_name: e.target.value})}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                />
                <input
                  value={selectedCustomer.customer_phone || ""}
                  onChange={e => setSelectedCustomer({...selectedCustomer, customer_phone: e.target.value})}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                />
                <input
                  value={selectedCustomer.customer_email || ""}
                  onChange={e => setSelectedCustomer({...selectedCustomer, customer_email: e.target.value})}
                  placeholder="Email"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                />
                <input
                  value={selectedCustomer.birthday || ""}
                  onChange={e => setSelectedCustomer({...selectedCustomer, birthday: e.target.value})}
                  placeholder="Birthday"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                />
                <textarea
                  value={selectedCustomer.notes || ""}
                  onChange={e => setSelectedCustomer({...selectedCustomer, notes: e.target.value})}
                  placeholder="Notes"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                />
                <button
                  onClick={handleUpdateProfile}
                  className="px-4 py-2 rounded-xl bg-violet-600"
                >
                  {saving ? "Saving..." : "Save Customer"}
                </button>
              </div>
            )}

            {activeTab==="orders" && (
              <div className="rounded-xl border border-white/10 p-4 text-white/60 max-h-[500px] overflow-y-auto">
                {orderHistory.map(order => (
                  <div key={order.id} className="mb-4 rounded-xl border border-white/10 p-4">
                    <div className="font-semibold">{new Date(order.created_at).toLocaleString()}</div>
                    <div>Table: {order.table_number}</div>
                    <div>Total: ฿{Number(order.total || order.revenue || 0).toLocaleString()}</div>
                    <div>Status: {order.payment_status || order.status}</div>
                    <div className="mt-2">
                      {(order.items || []).map(item => (
                        <div key={item.id}>• {item.item_name} x{item.quantity}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab==="reviews" && (
              <div className="rounded-xl border border-white/10 p-4 text-white/60">
                <p>Customer reviews and ratings will appear here.</p>
              </div>
            )}

            {activeTab==="support" && (
              <div className="rounded-xl border border-white/10 p-4 text-white/60">
                <p>Support tickets / complaints submission will appear here.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

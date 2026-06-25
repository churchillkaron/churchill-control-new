"use client";

import { useEffect, useState } from "react";

export default function VendorsPage({ params }) {
  const { organizationId } = params;

  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadVendors();
  }, []);

  async function loadVendors() {
    try {
      const res = await fetch(
        "/api/procurement/vendors/list",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organizationId,
          }),
        }
      );

      const data = await res.json();

      setVendors(data.vendors || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#030712] text-white p-8"><div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8">
        <h1 className="text-3xl font-light">
          Vendors
        </h1>

        <div className="mt-6 overflow-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="p-3 text-left">
                  Vendor
                </th>
                <th className="p-3 text-left">
                  Email
                </th>
                <th className="p-3 text-left">
                  Phone
                </th>
                <th className="p-3 text-left">
                  Terms
                </th>
              </tr>
            </thead>

            <tbody>
              {!loading &&
                vendors.map((vendor) => (
                  <tr
                    key={vendor.id}
                    className="border-b border-white/5"
                  >
                    <td className="p-3">
                      {vendor.display_name}
                    </td>

                    <td className="p-3">
                      {vendor.email}
                    </td>

                    <td className="p-3">
                      {vendor.phone}
                    </td>

                    <td className="p-3">
                      {vendor.payment_terms}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>

          {!loading &&
            vendors.length === 0 && (
              <div className="py-10 text-white/40">
                No vendors found
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

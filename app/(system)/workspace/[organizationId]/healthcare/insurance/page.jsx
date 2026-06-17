"use client";

import { useOrganization } from "@/app/providers/OrganizationProvider";
import { useInsurance } from "../hooks/useInsurance";

export default function InsurancePage() {
  const { organization } = useOrganization();

  const {
    claims,
    loading,
  } = useInsurance(
    organization?.id
  );

  return (
    <main className="p-6">
      <h1 className="mb-6 text-3xl font-bold">
        Insurance Claims
      </h1>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="p-4 text-left">
                Provider
              </th>

              <th className="p-4 text-left">
                Policy
              </th>

              <th className="p-4 text-left">
                Amount
              </th>

              <th className="p-4 text-left">
                Status
              </th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan="4" className="p-6">
                  Loading...
                </td>
              </tr>
            )}

            {!loading &&
              claims.map(
                (claim) => (
                  <tr
                    key={claim.id}
                    className="border-b border-white/5"
                  >
                    <td className="p-4">
                      {claim.insurance_provider}
                    </td>

                    <td className="p-4">
                      {claim.policy_number}
                    </td>

                    <td className="p-4">
                      {claim.claim_amount}
                    </td>

                    <td className="p-4">
                      {claim.claim_status}
                    </td>
                  </tr>
                )
              )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

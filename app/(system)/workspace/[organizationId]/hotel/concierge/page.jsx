"use client";

import { useEffect, useState } from "react";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

export default function ConciergePage() {
  const { organization, loading: organizationLoading } = useOrganizationRuntime();
  const organizationId = organization?.id || "";

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchRequests() {
    if (!organizationId) return;

    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `/api/hotel/concierge/list?organizationId=${encodeURIComponent(organizationId)}`,
      );
      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(data.error || "Unable to load concierge requests");
      }

      setRequests(data.requests || []);
    } catch (fetchError) {
      console.error(fetchError);
      setError(fetchError.message || "Unable to load concierge requests");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (organizationId) fetchRequests();
  }, [organizationId]);

  if (organizationLoading || loading) {
    return <div className="p-8">Loading concierge requests...</div>;
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Concierge Requests</h1>

      {error ? <div className="mb-4">{error}</div> : null}

      {requests.length === 0 ? (
        <div>No requests yet</div>
      ) : (
        <ul className="space-y-4">
          {requests.map((request) => (
            <li key={request.id} className="border rounded-xl p-4">
              <div>Guest: {request.hotel_guests?.full_name || "-"}</div>
              <div>Property: {request.hotel_properties?.name || "-"}</div>
              <div>Type: {request.request_type || "-"}</div>
              <div>Status: {request.status || "-"}</div>
              {request.details ? <div>Details: {request.details}</div> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

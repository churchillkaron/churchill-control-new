"use client";

import { useState, useEffect } from "react";

export default function ConciergePage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  async function fetchRequests() {
    try {
      const res = await fetch("/api/hotel/concierge/list");
      const data = await res.json();
      setRequests(data.requests || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRequests();
  }, []);

  if (loading) return <div>Loading concierge requests...</div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Concierge Requests</h1>

      {requests.length === 0 ? (
        <div>No requests yet</div>
      ) : (
        <ul className="space-y-4">
          {requests.map((r) => (
            <li key={r.id} className="border rounded-xl p-4">
              <div>Guest: {r.hotel_guests?.first_name} {r.hotel_guests?.last_name}</div>
              <div>Property: {r.hotel_properties?.name}</div>
              <div>Type: {r.request_type}</div>
              <div>Status: {r.status}</div>
              <div>Details: {r.details}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";
import { useState, useEffect } from "react";

export function useStaff(organizationId) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStaff() {
      try {
        const res = await fetch(`/api/healthcare/staff?organizationId=${organizationId}`);
        const data = await res.json();
        setStaff(data.staff || []);
      } catch {
        setStaff([]);
      } finally {
        setLoading(false);
      }
    }
    fetchStaff();
  }, [organizationId]);

  return { staff, loading };
}

"use client";
import { useState, useEffect } from "react";

export function usePatients(organizationId) {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPatients() {
      try {
        const res = await fetch(`/api/healthcare/patients?organizationId=${organizationId}`);
        const data = await res.json();
        setPatients(data.patients || []);
      } catch {
        setPatients([]);
      } finally {
        setLoading(false);
      }
    }
    fetchPatients();
  }, [organizationId]);

  return { patients, loading };
}

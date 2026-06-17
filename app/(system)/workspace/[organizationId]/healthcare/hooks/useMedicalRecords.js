"use client";
import useSWR from "swr";

const fetcher = (url) => fetch(url).then((res) => res.json());

export function useMedicalRecords(organizationId) {
  const { data, error, mutate } = useSWR(
    organizationId ? `/api/healthcare/medical-records?organization_id=${organizationId}` : null,
    fetcher
  );

  return {
    medicalRecords: data?.data || [],
    loading: !data && !error,
    error,
    refresh: mutate,
    mutate,
  };
}

"use client";
import useSWR from "swr";

const fetcher = (url) => fetch(url).then((res) => res.json());

export function useAdmissions(organizationId) {
  const { data, error, mutate } = useSWR(
    organizationId ? `/api/healthcare/admissions?organization_id=${organizationId}` : null,
    fetcher
  );

  return {
    admissions: data?.data || [],
    loading: !data && !error,
    error,
    refresh: mutate,
    mutate,
  };
}

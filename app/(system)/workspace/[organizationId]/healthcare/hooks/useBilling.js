"use client";
import useSWR from "swr";

const fetcher = (url) => fetch(url).then((res) => res.json());

export function useBilling(organizationId) {
  const { data, error, mutate } = useSWR(
    organizationId ? `/api/healthcare/billing?organization_id=${organizationId}` : null,
    fetcher
  );

  return {
    billing: data?.data || [],
    loading: !data && !error,
    error,
    refresh: mutate,
    mutate,
  };
}

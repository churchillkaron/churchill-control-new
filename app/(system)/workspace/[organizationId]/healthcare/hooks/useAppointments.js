"use client";
import useSWR from "swr";

const fetcher = (url) => fetch(url).then((res) => res.json());

export function useAppointments(organizationId) {
  const { data, error, mutate } = useSWR(
    organizationId ? `/api/healthcare/appointments?organization_id=${organizationId}` : null,
    fetcher
  );

  return {
    appointments: data?.data || [],
    loading: !data && !error,
    error,
    refresh: mutate,
    mutate,
  };
}

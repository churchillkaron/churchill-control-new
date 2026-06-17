"use client";

import useSWR from "swr";

const fetcher = (url) =>
  fetch(url).then((res) => res.json());

export function usePatients(
  organizationId
) {
  const {
    data,
    error,
    mutate,
  } = useSWR(
    organizationId
      ? `/api/healthcare/patients?organization_id=${organizationId}`
      : null,
    fetcher
  );

  return {
    patients:
      data?.data || [],
    loading:
      !data && !error,
    error,
    refresh:
      mutate,
    mutate,
  };
}

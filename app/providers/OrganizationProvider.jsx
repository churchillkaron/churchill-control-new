"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const OrganizationContext =
  createContext(null);

export function OrganizationProvider({
  children,
}) {

  const [
    organization,
    setOrganizationState,
  ] = useState(null);

  // =====================================
  // INITIAL LOAD
  // =====================================

  useEffect(() => {

    try {

      const stored =
        localStorage.getItem(
          "activeOrganization"
        );

      if (stored) {

        setOrganizationState(
          JSON.parse(stored)
        );

      }

    } catch (error) {

      console.error(
        "organization restore error",
        error
      );

    }

  }, []);

  // =====================================
  // STABLE UPDATE
  // =====================================

  function setOrganization(
    organizationData
  ) {

    if (!organizationData) {
      return;
    }

    // PREVENT LOOPS

    if (
      organization?.activeOrganization?.id ===
      organizationData?.activeOrganization?.id
    ) {

      return;

    }

    try {

      localStorage.setItem(
        "activeOrganization",
        JSON.stringify(
          organizationData
        )
      );

    } catch (error) {

      console.error(
        "organization storage error",
        error
      );

    }

    setOrganizationState(
      organizationData
    );

  }

  const value =
    useMemo(
      () => ({

        organization,

        setOrganization,

      }),
      [organization]
    );

  return (

    <OrganizationContext.Provider
      value={value}
    >

      {children}

    </OrganizationContext.Provider>

  );

}

export function useOrganization() {

  return useContext(
    OrganizationContext
  );

}

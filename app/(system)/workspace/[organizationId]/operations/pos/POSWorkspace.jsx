"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams } from "next/navigation";

import {
  useBusinessContext,
} from "@/app/providers/BusinessContextProvider";
import {
  buildPOSWorkspaceConfiguration,
} from "@/lib/operations/commerce/POSWorkspaceConfiguration";

import StationaryPOSUI from "./StationaryPOS_UI";

function normalizeId(value) {
  return String(value || "").trim();
}

async function readResponse(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      success: false,
      error: text,
    };
  }
}

function RuntimeLoading() {
  return (
    <main className="min-h-screen bg-black px-6 py-20 text-white">
      <div className="mx-auto max-w-[900px] rounded-[32px] border border-white/10 bg-white/[0.03] p-8">
        <p className="text-xs uppercase tracking-[0.28em] text-[#D6A66A]">
          Avantiqo POS
        </p>

        <h1 className="mt-4 text-3xl font-semibold">
          Loading Stationary POS
        </h1>

        <p className="mt-3 text-sm text-white/50">
          Resolving the installed POS application and organization runtime.
        </p>

        <div className="mt-7 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-[#D6A66A]" />
        </div>
      </div>
    </main>
  );
}

function RuntimeError({
  error,
  status,
  retry,
}) {
  return (
    <main className="min-h-screen bg-black px-6 py-20 text-white">
      <div className="mx-auto max-w-[900px] rounded-[32px] border border-amber-300/20 bg-white/[0.03] p-8">
        <p className="text-xs uppercase tracking-[0.28em] text-[#D6A66A]">
          Stationary POS
        </p>

        <h1 className="mt-4 text-3xl font-semibold">
          POS runtime unavailable
        </h1>

        <p className="mt-3 text-sm leading-7 text-white/55">
          {error || "The POS runtime could not be loaded."}
        </p>

        <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4 text-xs text-white/40">
          Server status: {status || "Unavailable"}
        </div>

        <button
          type="button"
          onClick={retry}
          className="mt-6 rounded-xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black"
        >
          Retry
        </button>
      </div>
    </main>
  );
}

export default function POSWorkspace() {
  const params = useParams();

  const businessContext =
    useBusinessContext() || {};

  const organizationId =
    normalizeId(
      params?.organizationId ||
        businessContext.organization_id ||
        businessContext.organization?.id
    );

  const entityId =
    normalizeId(
      businessContext.entity_id ||
        businessContext.entity?.id
    );

  const [version, setVersion] =
    useState(0);

  const [state, setState] =
    useState({
      data: null,
      error: null,
      loading: true,
      status: null,
    });

  useEffect(() => {
    if (!organizationId) {
      setState({
        data: null,
        error:
          businessContext.loading
            ? null
            : "Organization context is unavailable.",
        loading:
          Boolean(
            businessContext.loading
          ),
        status: null,
      });

      return undefined;
    }

    const controller =
      new AbortController();

    async function loadRuntime() {
      setState({
        data: null,
        error: null,
        loading: true,
        status: null,
      });

      try {
        const query =
          new URLSearchParams({
            organizationId,
          });

        if (entityId) {
          query.set(
            "entityId",
            entityId
          );
        }

        const response =
          await fetch(
            `/api/pos/runtime?${query.toString()}`,
            {
              credentials: "include",
              cache: "no-store",
              headers: {
                Accept:
                  "application/json",
              },
              signal:
                controller.signal,
            }
          );

        const result =
          await readResponse(
            response
          );

        if (
          !response.ok ||
          result?.success !== true
        ) {
          setState({
            data: null,
            error:
              result?.error ||
              "Unable to load the POS runtime.",
            loading: false,
            status:
              response.status,
          });

          return;
        }

        setState({
          data: result,
          error: null,
          loading: false,
          status:
            response.status,
        });
      } catch (error) {
        if (
          error?.name ===
          "AbortError"
        ) {
          return;
        }

        setState({
          data: null,
          error:
            error?.message ||
            "Unable to load the POS runtime.",
          loading: false,
          status: null,
        });
      }
    }

    loadRuntime();

    return () => {
      controller.abort();
    };
  }, [
    businessContext.loading,
    entityId,
    organizationId,
    version,
  ]);

  const runtime = state.data;

  const configuration =
    useMemo(
      () =>
        buildPOSWorkspaceConfiguration({
          application:
            runtime?.application ||
            null,
        }),
      [
        runtime?.application,
      ]
    );

  if (state.loading) {
    return <RuntimeLoading />;
  }

  if (
    state.error ||
    !runtime
  ) {
    return (
      <RuntimeError
        error={state.error}
        status={state.status}
        retry={() =>
          setVersion(
            current =>
              current + 1
          )
        }
      />
    );
  }

  return (
    <StationaryPOSUI
      posConfiguration={
        configuration
      }
      posRuntime={runtime}
    />
  );
}

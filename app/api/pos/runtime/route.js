export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import defaultPOSSettings from "@/lib/settings/defaultPOSSettings";
import { resolvePOSFinancialPolicy } from "@/lib/pos/runtime/resolvePOSFinancialPolicy";
import resolvePOSRequestApplication from "@/lib/operations/commerce/server/resolvePOSRequestApplication";

function errorResponse(error, status = 500) {
  return NextResponse.json(
    {
      success: false,
      error,
    },
    { status }
  );
}

function publicPOSInstallation(module) {
  if (!module) {
    return null;
  }

  return {
    id: module.id || null,
    key:
      module.key ||
      module.module_key ||
      module.slug ||
      null,
    name:
      module.name ||
      module.title ||
      null,
    status:
      module.status ||
      null,
  };
}

export async function GET(request) {
  try {
    const { searchParams } =
      new URL(request.url);

    const requestedOrganizationId =
      searchParams.get(
        "organizationId"
      ) ||
      searchParams.get(
        "organization_id"
      );

    const requestedEntityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id") ||
      searchParams.get(
        "legalEntityId"
      ) ||
      searchParams.get(
        "legal_entity_id"
      );

    const requestedApplicationId =
      searchParams.get(
        "applicationId"
      ) ||
      searchParams.get(
        "application_id"
      ) ||
      request.headers.get(
        "x-pos-application"
      );

    const resolved =
      await resolvePOSRequestApplication(
        {
          request,
          organizationId:
            requestedOrganizationId,
          requestedApplicationId,
        }
      );

    if (!resolved.success) {
      return errorResponse(
        resolved.error,
        resolved.status || 403
      );
    }

    const runtimeAdapter =
      resolved.application
        .adapter?.runtime;

    if (
      typeof runtimeAdapter
        ?.loadRuntime !==
      "function"
    ) {
      return errorResponse(
        `POS runtime is not available for application ${resolved.application.id}`,
        501
      );
    }

    const [
      applicationRuntime,
      financialPolicy,
    ] = await Promise.all([
      runtimeAdapter.loadRuntime({
        access:
          resolved.access,
        application:
          resolved.application,
        entityId:
          requestedEntityId,
        organization:
          resolved.organization,
        organizationId:
          resolved.organizationId,
        request,
        settings:
          resolved.settings,
      }),

      resolvePOSFinancialPolicy({
        organizationId:
          resolved.organizationId,
      }),
    ]);

    const storedSettings =
      resolved.settings || {};

    const organization =
      resolved.organization || {
        id:
          resolved.organizationId,
      };

    const currencyCode =
      organization.currency_code ||
      organization
        .base_currency_code ||
      organization
        .reporting_currency_code ||
      storedSettings
        .currency_code ||
      storedSettings.currency ||
      null;

    const applicationBinding =
      resolved.applicationBinding ||
      null;

    const posInstallation =
      publicPOSInstallation(
        resolved.posInstallation
      );

    const templateBinding =
      resolved.templateBinding ||
      null;

    return NextResponse.json({
      success: true,

      application: {
        id:
          resolved.application.id,
        name:
          resolved.application.name,
        status:
          resolved.application.status ||
          null,
        context:
          resolved.application.context ||
          null,
        presentation:
          resolved.application.presentation ||
          null,
      },

      applicationBinding,
      posInstallation,
      templateBinding,

      organization: {
        ...organization,
        currency_code:
          currencyCode,
      },

      terminal: {
        type:
          "point_of_sale",
        application_id:
          resolved.application.id,
        entity_id:
          applicationRuntime
            ?.entity_id ||
          requestedEntityId ||
          null,
        currency_code:
          currencyCode,
      },

      settings: {
        ...defaultPOSSettings,
        ...storedSettings,
      },

      financial_policy:
        financialPolicy,

      access:
        resolved.access.access,

      ...applicationRuntime,

      // Compatibility fields for existing POS clients.
      posSettings: {
        ...defaultPOSSettings,
        ...storedSettings,
      },

      financialPolicy,
    });
  } catch (error) {
    console.error(
      "POS RUNTIME ERROR",
      error
    );

    return errorResponse(
      error?.message ||
        "Unable to load POS runtime",
      error?.status || 500
    );
  }
}

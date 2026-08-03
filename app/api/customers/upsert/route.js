export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  createCustomer,
} from "@/lib/finance/createCustomer";

import {
  CustomerIdentityRuntime,
} from "@/lib/platform/service-runtime/identity/runtime/CustomerIdentityRuntime";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(req) {
  try {
    const body = await req.json();

    const access = await requireOrganizationAccess({
      organizationId:
        body.organization_id ||
        body.organizationId,
    });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    const customer = await createCustomer({
      organization_id: access.organizationId,
      entity_id:
        body.entity_id ||
        body.entityId ||
        null,
      customer_name: body.customer_name,
      customer_phone: body.customer_phone || null,
      customer_email: body.customer_email || null,
      customer_type: body.customer_type || "PERSON",
      company_name: body.company_name || null,
      tax_number: body.tax_number || null,
      billing_address: body.billing_address || null,
      shipping_address: body.shipping_address || null,
      city: body.city || null,
      state: body.state || null,
      postal_code: body.postal_code || null,
      country: body.country || null,
      preferred_language:
        body.preferred_language || null,
      preferred_currency:
        body.preferred_currency || null,
      credit_limit:
        body.credit_limit === "" ||
        body.credit_limit === undefined
          ? null
          : body.credit_limit,
      payment_terms: body.payment_terms || null,
      birthday: body.birthday || null,
      notes: body.notes || null,
    });

    if (
      body.provider_id &&
      body.external_id &&
      customer?.customer?.id
    ) {
      await CustomerIdentityRuntime.link({
        organization_id: access.organizationId,
        customer_id: customer.customer.id,
        provider_id: body.provider_id,
        external_id: body.external_id,
        identity_type:
          body.identity_type || "CUSTOMER",
      });
    }

    return NextResponse.json({
      success: true,
      customer: customer?.customer || null,
      party: customer?.party || null,
      identity: customer || null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error.message ||
          "Customer upsert failed",
      },
      {
        status: 500,
      }
    );
  }
}

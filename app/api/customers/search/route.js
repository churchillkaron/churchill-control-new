export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

function normalizeParty(value) {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value || null;
}

function searchableCustomer(customer) {
  return [
    customer.display_name,
    customer.email,
    customer.phone,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export async function POST(request) {
  try {
    const body = await request.json();
    const requestedOrganizationId =
      body.organizationId ||
      body.organization_id ||
      null;

    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        {
          status: access.status || 403,
        }
      );
    }

    const query = String(body.query || "")
      .trim()
      .toLowerCase();

    const relationshipResult = await supabaseAdmin
      .from("party_relationships")
      .select(`
        party_id,
        parties(
          id,
          display_name,
          party_type,
          email,
          phone
        )
      `)
      .eq("organization_id", access.organizationId)
      .eq("relationship_type", "customer")
      .limit(query ? 250 : 20);

    if (relationshipResult.error) {
      throw relationshipResult.error;
    }

    const parties = (relationshipResult.data || [])
      .map((row) => {
        const party = normalizeParty(row.parties);

        return party
          ? {
              ...party,
              party_id: row.party_id || party.id,
            }
          : null;
      })
      .filter(Boolean)
      .filter((customer) =>
        query
          ? searchableCustomer(customer).includes(query)
          : true
      )
      .slice(0, 20);

    const partyIds = parties
      .map((customer) => customer.party_id)
      .filter(Boolean);

    let loyaltyAccounts = [];

    if (partyIds.length) {
      const accountResult = await supabaseAdmin
        .from("customer_loyalty_accounts")
        .select(`
          id,
          party_id,
          customer_number,
          customer_name,
          customer_phone,
          customer_email,
          customer_type,
          company_name,
          tax_number,
          billing_address,
          shipping_address,
          city,
          state,
          postal_code,
          country,
          preferred_language,
          preferred_currency,
          credit_limit,
          payment_terms,
          birthday,
          notes
        `)
        .eq("organization_id", access.organizationId)
        .in("party_id", partyIds);

      if (accountResult.error) {
        throw accountResult.error;
      }

      loyaltyAccounts = accountResult.data || [];
    }

    const accountByParty = new Map(
      loyaltyAccounts.map((account) => [
        account.party_id,
        account,
      ])
    );

    const customers = parties.map((party) => {
      const account =
        accountByParty.get(party.party_id) ||
        null;

      return {
        ...party,
        customer_id: account?.id || null,
        customer_number:
          account?.customer_number || null,
        customer_name:
          account?.customer_name ||
          party.display_name ||
          "",
        customer_phone:
          account?.customer_phone ||
          party.phone ||
          "",
        customer_email:
          account?.customer_email ||
          party.email ||
          "",
        customer_type:
          account?.customer_type ||
          (party.party_type === "organization"
            ? "COMPANY"
            : "PERSON"),
        company_name:
          account?.company_name || "",
        tax_number:
          account?.tax_number || "",
        billing_address:
          account?.billing_address || "",
        shipping_address:
          account?.shipping_address || "",
        city:
          account?.city || "",
        state:
          account?.state || "",
        postal_code:
          account?.postal_code || "",
        country:
          account?.country || "",
        preferred_language:
          account?.preferred_language || "",
        preferred_currency:
          account?.preferred_currency || "",
        credit_limit:
          account?.credit_limit || 0,
        payment_terms:
          account?.payment_terms || "",
        birthday:
          account?.birthday || "",
        notes:
          account?.notes || "",
      };
    });

    return NextResponse.json({
      success: true,
      customers,
    });
  } catch (error) {
    console.error("CUSTOMER SEARCH ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Customer search failed",
      },
      {
        status: 500,
      }
    );
  }
}

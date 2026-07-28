export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const CONNECTION_TYPES = Object.freeze({
  TRANSACTION_FEED: "Transaction Feed",
  STATEMENT_IMPORT: "Statement Import",
  BALANCE_SYNC: "Balance Sync",
});

function normalizeConnectionType(value) {
  return String(value || "").trim().toUpperCase();
}

function decorateIntegration(row, bankAccount = null) {
  const connectionLabel =
    CONNECTION_TYPES[row.connection_type] ||
    String(row.connection_type || "Bank Connection")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());
  const accountName =
    bankAccount?.account_name ||
    bankAccount?.name ||
    "Bank Account";

  return {
    id: row.id,
    organization_id: row.organization_id,
    bank_account_id: row.bank_account_id,
    bank_account_name: accountName,
    bank_name: bankAccount?.bank_name || null,
    currency_code: bankAccount?.currency_code || bankAccount?.currency || null,
    connection_type: row.connection_type,
    connection_label: connectionLabel,
    provider_name: "AVANTIQO_MANAGED",
    provider_display_name: "Avantiqo Managed",
    status: row.status || "PENDING_SETUP",
    last_sync_at: row.last_sync_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    name: accountName,
    title: accountName,
    code: connectionLabel,
  };
}

async function loadBankAccounts(organizationId, ids) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))];
  if (!uniqueIds.length) return new Map();

  const { data, error } = await supabaseAdmin
    .from("bank_accounts")
    .select("*")
    .eq("organization_id", organizationId)
    .in("id", uniqueIds);

  if (error) throw error;

  return new Map((data || []).map((row) => [String(row.id), row]));
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
      request,
      requiredPermission: "finance.banking.view",
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error, rows: [] },
        { status: access.status }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("finance_banking_integrations")
      .select(
        "id, organization_id, bank_account_id, provider_name, connection_type, status, last_sync_at, created_at, updated_at"
      )
      .eq("organization_id", access.organizationId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const accounts = await loadBankAccounts(
      access.organizationId,
      (data || []).map((row) => row.bank_account_id)
    );

    const rows = (data || []).map((row) =>
      decorateIntegration(row, accounts.get(String(row.bank_account_id)))
    );

    return NextResponse.json({
      success: true,
      organization_id: access.organizationId,
      rows,
      connections: rows,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load bank connections",
        rows: [],
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
      requiredPermission: "finance.banking.manage",
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const bankAccountId = String(
      body.bank_account_id || body.bankAccountId || ""
    ).trim();
    const connectionType = normalizeConnectionType(
      body.connection_type || body.connectionType
    );

    if (!bankAccountId) {
      return NextResponse.json(
        { success: false, error: "Bank Account required" },
        { status: 400 }
      );
    }

    if (!CONNECTION_TYPES[connectionType]) {
      return NextResponse.json(
        { success: false, error: "Connection Type is not supported" },
        { status: 400 }
      );
    }

    const { data: bankAccount, error: bankAccountError } = await supabaseAdmin
      .from("bank_accounts")
      .select("*")
      .eq("organization_id", access.organizationId)
      .eq("id", bankAccountId)
      .maybeSingle();

    if (bankAccountError) throw bankAccountError;
    if (!bankAccount) {
      return NextResponse.json(
        { success: false, error: "Bank Account not found in this organisation" },
        { status: 400 }
      );
    }

    if (
      bankAccount.active === false ||
      ["ARCHIVED", "INACTIVE"].includes(
        String(bankAccount.status || "").toUpperCase()
      )
    ) {
      return NextResponse.json(
        { success: false, error: "Bank Account is not active" },
        { status: 400 }
      );
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("finance_banking_integrations")
      .select("id, status")
      .eq("organization_id", access.organizationId)
      .eq("bank_account_id", bankAccountId)
      .eq("connection_type", connectionType);

    if (existingError) throw existingError;

    const activeExisting = (existing || []).find(
      (row) => String(row.status || "").toUpperCase() !== "ARCHIVED"
    );

    if (activeExisting) {
      return NextResponse.json(
        {
          success: false,
          error: "This bank connection request already exists",
        },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const { data: created, error: createError } = await supabaseAdmin
      .from("finance_banking_integrations")
      .insert({
        organization_id: access.organizationId,
        bank_account_id: bankAccountId,
        connection_type: connectionType,
        provider_name: "AVANTIQO_MANAGED",
        credential_reference: null,
        status: "PENDING_SETUP",
        created_by: access.user?.id || null,
        updated_at: now,
      })
      .select(
        "id, organization_id, bank_account_id, provider_name, connection_type, status, last_sync_at, created_at, updated_at"
      )
      .single();

    if (createError) throw createError;

    return NextResponse.json({
      success: true,
      message:
        "Bank connection requested. Avantiqo will configure the compatible managed provider.",
      record: decorateIntegration(created, bankAccount),
    });
  } catch (error) {
    const message = error?.message || "Unable to request bank connection";
    return NextResponse.json(
      { success: false, error: message },
      {
        status: /required|not found|not active|not supported|already exists/i.test(
          message
        )
          ? 400
          : 500,
      }
    );
  }
}

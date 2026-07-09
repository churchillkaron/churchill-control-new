export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  importBankAccountsCommand,
} from "@/lib/finance/bank-accounts/runtime/BankAccountsApplicationService";

function parseCsv(text) {

  const lines = String(text || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers =
    lines[0]
      .split(",")
      .map(h => h.trim());

  return lines
    .slice(1)
    .map(line => {

      const values =
        line
          .split(",")
          .map(v => v.trim());

      return Object.fromEntries(
        headers.map((h, i) => [
          h,
          values[i] || "",
        ])
      );

    });

}

export async function POST(request) {

  try {

    const form =
      await request.formData();

    const organization_id =
      form.get("organization_id") ||
      form.get("organizationId");

    const file =
      form.get("file");

    const pasted =
      form.get("text");

    let rows = [];

    if (file && file.text) {

      const text =
        await file.text();

      try {

        const parsed =
          JSON.parse(text);

        rows =
          Array.isArray(parsed)
            ? parsed
            : parsed.rows || [];

      } catch {

        rows =
          parseCsv(text);

      }

    } else if (pasted) {

      try {

        const parsed =
          JSON.parse(
            String(pasted)
          );

        rows =
          Array.isArray(parsed)
            ? parsed
            : parsed.rows || [];

      } catch {

        rows =
          parseCsv(
            String(pasted)
          );

      }

    }

    const result =
      await importBankAccountsCommand({
        organization_id,
        rows,
      });

    return NextResponse.json(result);

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );

  }

}

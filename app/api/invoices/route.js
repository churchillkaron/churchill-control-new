import { NextResponse } from "next/server";
import { supabase } from "@/lib/shared/supabase/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// =========================
// GET INVOICES
// =========================

export async function GET() {

  try {

    const { data, error } =
      await supabase

        .from("invoices")

        .select("*")

        .order(
          "created_at",
          {
            ascending: false,
          }
        );

    if (error) {

      console.error(
        "INVOICES ERROR:",
        error
      );

      return NextResponse.json(

        [],

        {
          status: 200,

          headers: {
            "Cache-Control":
              "no-store, no-cache, must-revalidate, proxy-revalidate",

            Pragma:
              "no-cache",

            Expires:
              "0",
          },
        }

      );

    }

    return NextResponse.json(

      data || [],

      {
        status: 200,

        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",

          Pragma:
            "no-cache",

          Expires:
            "0",
        },
      }

    );

  } catch (err) {

    console.error(
      "INVOICES SERVER ERROR:",
      err
    );

    return NextResponse.json(

      [],

      {
        status: 200,

        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",

          Pragma:
            "no-cache",

          Expires:
            "0",
        },
      }

    );

  }

}
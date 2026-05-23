import { NextResponse } from "next/server";

import { createServerSupabase }
from "@/lib/shared/supabase/server";

import { getStaffIdentity }
from "@/lib/messages/getStaffIdentity";

const bannedWords = [
  "idiot",
  "stupid",
  "racist",
  "hate",
  "fuck",
];

export async function POST(req) {

  try {

    const identity =
      await getStaffIdentity();

    if (!identity) {

      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );

    }

    const body =
      await req.json();

    const {
      content,
    } = body;

    if (!content) {

      return NextResponse.json(
        {
          success: false,
          flagged: false,
        }
      );

    }

    const lower =
      content.toLowerCase();

    const matches =
      bannedWords.filter(
        (word) =>
          lower.includes(word)
      );

    const flagged =
      matches.length > 0;

    return NextResponse.json({

      success: true,

      flagged,

      matches,

    });

  } catch (err) {

    return NextResponse.json(
      {
        success: false,
        error:
          err.message,
      },
      {
        status: 500,
      }
    );

  }

}
